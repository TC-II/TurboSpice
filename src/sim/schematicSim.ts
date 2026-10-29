// Esquemático → simulación: netlist LTspice → ngspice, archivos de modelos de la librería
// y nombres de vectores para las puntas de prueba.
import { linkDigitalNets } from '../hdl/digitalLinks.ts';
import { decode } from '../asc/encoding.ts';
import type { AscDoc } from '../asc/model.ts';
import type { Library } from '../library/library.ts';
import { ltNetlist, type LtNetlist, missingSymbolIn } from '../netlist/ltnetlist.ts';
import { ngNodeName, prepareSimulation, toNgspice, type NgspiceNetlist } from '../netlist/tongspice.ts';
import { isControlBlock, isNgspiceComment } from '../netlist/directives.ts';
import { controlPlots, type Pane } from '../waveform/view.ts';
import { ANALYSIS_LINE } from './analyses.ts';
import { checkSimSize, type SizeProblem } from './estimate.ts';
import { t } from '../i18n/i18n.ts';
import { hierDevice } from './context.ts';
import { deviceParams, deviceRefs } from './deviceParams.ts';
import { digitalNodes, refVectors, saveSelection, textRefs } from './saves.ts';

// (import.meta.env no existe fuera de Vite: tests en Node)
const LIB_URL = `${import.meta.env?.BASE_URL ?? '/'}library/sub/`;
const fileCache = new Map<string, string>();

async function fetchModelFile(rel: string): Promise<string> {
  let tt = fileCache.get(rel);
  if (tt === undefined) {
    const res = await fetch(LIB_URL + rel.split('/').map(encodeURIComponent).join('/'));
    if (!res.ok) throw new Error(t('Could not download {rel}', { rel }));
    tt = decode(new Uint8Array(await res.arrayBuffer())).text;
    fileCache.set(rel, tt);
  }
  return tt;
}

export interface BuiltSimulation {
  netlist: string;
  files: Record<string, string>;
  warnings: string[];
  lt: LtNetlist;
  ng: NgspiceNetlist;
  /** paneles pedidos con "plot" en el bloque .control */
  controlPanes: Pane[];
  /** análisis que no entran en memoria: no se simula (#58) */
  tooBig: SizeProblem[];
  /** símbolos que no están en la librería: sus elementos se omiten y el circuito simulado es otro (#108) */
  missingSymbols: string[];
  /** redes entre bloques Verilog que se simulan digitales, sin puentes (nombres de ngspice; ver digitalLinks.ts) */
  digitalNets?: Set<string>;
  /** sus nodos de adentro de antes ("x1.q_0_d") → la red, para las trazas Dig() guardadas */
  digitalAliases?: Map<string, string>;
  /** con sólo las señales elegidas (#314): los nodos digitales que lee el motor (si no, todos) */
  digitalSaves?: string[];
}

/**
 * `traces`: expresiones de las trazas que se van a mirar; los parámetros de dispositivo que usen
 * (@Q1[gm], #202) se piden con ".save" porque ngspice no los guarda solo.
 */
export async function buildSimulation(doc: AscDoc, lib: Library, title: string, traces: string[] = []): Promise<BuiltSimulation> {
  const lt = ltNetlist(doc, lib);
  const ng = toNgspice(lt, title, {
    resolve: (p) => lib.resolveModelFile(p),
    defines: (m) => lib.definesModel(m),
    cmpFile: (m) => lib.cmpFileDefining(m),
    // sólo si no lo define la librería propia ni un archivo del usuario
    ltspiceFile: (m) => (lib.definesModel(m, false) ? undefined : lib.ltspiceFileDefining(m)),
  });
  const texts = Object.fromEntries(
    await Promise.all(ng.includes.map(async (rel) => [rel, lib.userFile(rel) ?? (await fetchModelFile(rel))] as const)),
  );
  const prepared = prepareSimulation(ng, (rel) => texts[rel]);
  // las redes que unen sólo bloques Verilog, digitales (#209)
  const links = linkDigitalNets(prepared.netlist, prepared.files);
  const prep = { ...prepared, netlist: links.netlist, files: links.files };
  const analyses = lt.texts
    .filter((tt) => (tt.kind === 'directive' || isNgspiceComment(tt.text)) && !isControlBlock(tt.text))
    .flatMap((tt) => tt.text.split('\\n'))
    .map((l) => l.trim())
    .filter((l) => ANALYSIS_LINE.test(l));
  // Corrientes de todos los dispositivos para poder medirlas con la punta de prueba (y, con .op,
  // los parámetros de pequeña señal de transistores y diodos para la tabla)
  const op = analyses.some((l) => /^\.op\b/i.test(l)) ? opDeviceSaves(lt, ng) : [];
  const control = lt.texts.find((tt) => isControlBlock(tt.text));
  // sólo las señales elegidas (#314): lo que usan las trazas, los .meas, el .control y los
  // parámetros de dispositivo se guarda igual
  const selection = saveSelection(lt.texts);
  let netlist: string;
  let vectorCount: number | undefined;
  let digitalSaves: string[] | undefined;
  if (selection) {
    const used = [...traces, ...ng.measures, control?.text.split('\\n').join('\n') ?? '', ...lt.texts.filter((tt) => /^\s*;?\s*\.four\b/im.test(tt.text)).map((tt) => tt.text)].flatMap(textRefs);
    const vectors = [...new Set([...[...selection, ...used].flatMap((r) => refVectors(r, lt, ng)), ...deviceSaves(traces, lt, ng), ...op])];
    digitalSaves = [...new Set([...selection, ...used].flatMap((r) => digitalNodes(r, links.aliases)))];
    // (los nodos digitales que no existen no suman: se cuentan los que pueden ser, de más)
    vectorCount = vectors.length + 1 + digitalSaves.length;
    // el .save del usuario (con nombres de LTspice) se reemplaza por el traducido
    const body = prep.netlist.replace(/^\s*\.save\b.*\n/gim, '');
    // ngspice no corre sin nada analógico que guardar: con sólo nodos digitales, una red cualquiera
    if (!vectors.length) {
      const n = lt.elements.flatMap((e) => e.nodes).find((x) => x && x !== '0');
      if (n) vectors.push(netVector(n));
    }
    netlist = vectors.length ? body.replace(/\n\.end\s*$/i, `\n.save ${vectors.join(' ')}\n.end`) : body;
  } else {
    const saves = saveLine(prep.netlist, [...deviceSaves(traces, lt, ng), ...op]);
    netlist = prep.netlist.replace(/\n\.end\s*$/i, `\n${saves}.options savecurrents\n.end`);
  }
  const controlPanes = control ? controlPlots(control.text.split('\\n').join('\n')) : [];
  // ¿Entra en memoria? (los análisis tal como están en el esquemático, para poder corregirlos)
  const size = checkSimSize(analyses, netlist, prep.files, ng.steps?.runs.length ?? 1, vectorCount);
  const warnings = [...prep.warnings, ...size.warnings.map((w) => w.text)];
  const missingSymbols = [...new Set(lt.warnings.flatMap((w) => missingSymbolIn(w) ?? []))];
  return { netlist, files: prep.files, warnings, lt, ng, controlPanes, tooBig: size.errors, missingSymbols, digitalNets: new Set(links.nets), digitalAliases: links.aliases, digitalSaves };
}

/** Vectores de ngspice "@dev[param]" de los parámetros de dispositivo que usan unas trazas (#202) */
export function deviceSaves(traces: string[], lt: LtNetlist, ng: NgspiceNetlist): string[] {
  const out = new Set<string>();
  for (const r of traces.flatMap(deviceRefs)) {
    const el = lt.elements.find((e) => e.name.toLowerCase() === r.device.toLowerCase() || e.name.replace(/§/g, '').toLowerCase() === r.device.toLowerCase());
    const dev = el ? ng.names.get(el.name)?.toLowerCase() : r.device.includes('.') && !/^[a-z]\./i.test(r.device) ? hierDevice(r.device) : r.device.toLowerCase();
    if (dev) out.add(`@${dev}[${r.param.toLowerCase()}]`);
  }
  return [...out];
}

/**
 * Con .op, los parámetros de salida de los transistores y diodos del circuito (gm, gpi, go,
 * capacidades, vth…) para listarlos en la tabla del punto de operación (#320). Las corrientes
 * ya las guarda savecurrents.
 */
export function opDeviceSaves(lt: LtNetlist, ng: NgspiceNetlist): string[] {
  return lt.elements.flatMap((el) => {
    const dev = ng.names.get(el.name)?.toLowerCase();
    if (!dev || !/^[qmjd]/.test(dev)) return [];
    return deviceParams(dev)
      .filter((p) => !/^i[bcdegs]?$/.test(p.name))
      .map((p) => `@${dev}[${p.name}]`);
  });
}

/**
 * Línea ".save" que se agrega a la netlist: los parámetros pedidos y "all", para que un .save del
 * usuario (o los parámetros) no dejen afuera las tensiones y corrientes de siempre (#202). "" si
 * no hace falta.
 */
export function saveLine(netlist: string, vectors: string[]): string {
  const userSave = /^\s*\.save\b(?!\s+none\b)/im.test(netlist);
  return userSave || vectors.length ? `.save all${vectors.map((v) => ` ${v}`).join('')}\n` : '';
}

/** Vector de ngspice con la tensión de una red */
export const netVector = (net: string) => ngNodeName(net).toLowerCase();

/** Vector de ngspice con la corriente de un elemento (nombre LTspice), o null si no hay */
export function elementVector(sim: BuiltSimulation, ltName: string): string | null {
  const ng = sim.ng.names.get(ltName)?.toLowerCase();
  if (!ng) return null;
  return deviceVector(ng, sim.lt.elements.find((e) => e.name === ltName)?.value);
}

/**
 * Vector con la corriente de un dispositivo por su nombre en ngspice (`r1`, o `r.x_u1.r1` adentro
 * de una instancia); `value`, el de la B (con V= la corriente es la de la rama)
 */
export function deviceVector(ng: string, value = ''): string | null {
  switch (ng[0]) {
    case 'v':
    case 'l':
    case 'e':
    case 'h':
      return `${ng}#branch`;
    case 'b':
      return /^\s*v\s*=/i.test(value) ? `${ng}#branch` : `@${ng}[i]`;
    case 'r':
    case 'c':
      return `@${ng}[i]`;
    case 'i':
      return `@${ng}[current]`;
    case 'd':
    case 'm':
    case 'j':
      return `@${ng}[id]`;
    case 'q':
      return `@${ng}[ic]`;
    default:
      return null;
  }
}
