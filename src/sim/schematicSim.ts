// Esquemático → simulación: netlist LTspice → ngspice, archivos de modelos de la librería
// y nombres de vectores para las puntas de prueba.
import { decode } from '../asc/encoding.ts';
import type { AscDoc } from '../asc/model.ts';
import type { Library } from '../library/library.ts';
import { ltNetlist, type LtNetlist } from '../netlist/ltnetlist.ts';
import { prepareSimulation, toNgspice, type NgspiceNetlist } from '../netlist/tongspice.ts';
import { isControlBlock } from '../netlist/directives.ts';
import { controlPlots, type Pane } from '../waveform/view.ts';

// (import.meta.env no existe fuera de Vite: tests en Node)
const LIB_URL = `${import.meta.env?.BASE_URL ?? '/'}library/sub/`;
const fileCache = new Map<string, string>();

async function fetchModelFile(rel: string): Promise<string> {
  let t = fileCache.get(rel);
  if (t === undefined) {
    const res = await fetch(LIB_URL + rel.split('/').map(encodeURIComponent).join('/'));
    if (!res.ok) throw new Error(`No se pudo descargar ${rel}`);
    t = decode(new Uint8Array(await res.arrayBuffer())).text;
    fileCache.set(rel, t);
  }
  return t;
}

export interface BuiltSimulation {
  netlist: string;
  files: Record<string, string>;
  warnings: string[];
  lt: LtNetlist;
  ng: NgspiceNetlist;
  /** paneles pedidos con "plot" en el bloque .control */
  controlPanes: Pane[];
}

export async function buildSimulation(doc: AscDoc, lib: Library, title: string): Promise<BuiltSimulation> {
  const lt = ltNetlist(doc, lib);
  const ng = toNgspice(lt, title, {
    resolve: (p) => lib.resolveModelFile(p),
    defines: (m) => lib.definesModel(m),
  });
  const texts = Object.fromEntries(await Promise.all(ng.includes.map(async (rel) => [rel, await fetchModelFile(rel)] as const)));
  const prep = prepareSimulation(ng, (rel) => texts[rel]);
  // Corrientes de todos los dispositivos para poder medirlas con la punta de prueba
  const netlist = prep.netlist.replace(/\n\.end\s*$/i, '\n.options savecurrents\n.end');
  const control = lt.texts.find((t) => isControlBlock(t.text));
  const controlPanes = control ? controlPlots(control.text.split('\\n').join('\n')) : [];
  return { netlist, files: prep.files, warnings: prep.warnings, lt, ng, controlPanes };
}

/** Vector de ngspice con la tensión de una red */
export const netVector = (net: string) => net.toLowerCase();

/** Vector de ngspice con la corriente de un elemento (nombre LTspice), o null si no hay */
export function elementVector(sim: BuiltSimulation, ltName: string): string | null {
  const ng = sim.ng.names.get(ltName)?.toLowerCase();
  if (!ng) return null;
  const el = sim.lt.elements.find((e) => e.name === ltName);
  switch (ng[0]) {
    case 'v':
    case 'l':
    case 'e':
    case 'h':
      return `${ng}#branch`;
    case 'b':
      return /^\s*v\s*=/i.test(el?.value ?? '') ? `${ng}#branch` : `@${ng}[i]`;
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
