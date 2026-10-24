// Formato .turbo (#149, docs/turbo-formato.md): un JSON con el proyecto entero. Proyecto →
// testbenches (cada uno con su esquemático y su configuración de simulación: un .asc completo)
// → corridas (historial), y los archivos comunes (subcircuitos, símbolos, modelos). La versión 1
// tenía variantes con varias simulaciones: al leerla, cada simulación pasa a ser un testbench.
// En memoria el proyecto tiene una sola variante (la de los testbenches) y sus simulaciones son
// los testbenches (asBenches). En el archivo
// cada .asc está una sola vez, en `blobs`, con su sha256 como clave; el resto lo nombra por el
// hash. En memoria no hay hashes: cada simulación y corrida tiene su texto.
import { parseAsc } from '../asc/parse.ts';
import { serializeAsc } from '../asc/serialize.ts';
import { emptyDoc, type AscDoc } from '../asc/model.ts';
import { findAnalysis, setAnalysisLine } from '../schematic/directivesEdit.ts';
import { analysisLabel, takeSims, type SimView } from '../sim/simList.ts';
import { t } from '../i18n/i18n.ts';

export const FORMAT = 'turbospice';
export const VERSION = 2;
export const EXT = '.turbo';

/**
 * Símbolo, archivo de modelos, subcircuito (esquemático .asc) o fuente Verilog (#209: se sintetiza a
 * un .sub y su .asy, que también son archivos del proyecto) del proyecto (común a todas las variantes)
 */
export interface ProjectFile {
  name: string;
  kind: 'symbol' | 'model' | 'schematic' | 'verilog';
  text: string;
  /** Verilog (#209): el último resultado de sintetizarlo (se simula con esto) */
  synth?: VerilogSynth;
  /** Verilog: cómo se simula. Por omisión se sintetiza (Yosys); "behavioral": Icarus Verilog
   *  (retardos #, initial, $display…) co-simulado con d_cosim */
  hdl?: 'behavioral';
}

/** Resultado de sintetizar un módulo Verilog del proyecto */
export interface VerilogSynth {
  /** el texto del .v con el que se sintetizó (si cambió, hay que volver a sintetizar) */
  source: string;
  /** nombre del módulo de más arriba (= el del .subckt y el del símbolo) */
  module: string;
  /** .subckt con las primitivas de XSPICE */
  subckt: string;
  /** pines en orden de SpiceOrder y su dirección */
  pins: { name: string; dir: 'in' | 'out' | 'inout' }[];
  /** parameter de Verilog del módulo de más arriba, con su valor por omisión */
  params: Record<string, string>;
  /** comportamiento (Icarus, d_cosim): el código compilado (.vvp), listo para el motor */
  vvp?: string;
}

/** Una vez que se simuló: el circuito exacto (inmutable) */
export interface Run {
  id: string;
  /** ms desde 1970 */
  time: number;
  asc: string;
  /** cambios contra la corrida anterior: "+C3, −R2, R1 1k→2k2" */
  summary?: string;
  /**
   * archivos del proyecto que usó (subcircuitos .asc/.asy y modelos, #199): nombre → texto, para
   * saber qué cambió entre corridas («cambió OPAMP_TC2»)
   */
  files?: Record<string, string>;
  /** su blob no pasó la verificación al abrir: no se puede ver ni restaurar */
  damaged?: boolean;
}

export interface Sim {
  id: string;
  /** nombre propio; sin él se usa el automático (analysisLabel) */
  name?: string;
  /** el circuito actual, con su comando de análisis, estudio y vista (.asc completo) */
  asc: string;
  /** lo último que se vio en el visor (paneles, zoom, cursores) */
  view?: SimView;
  /** la más vieja primero */
  runs: Run[];
  /** grupo de testbenches al que pertenece (#180; sin grupo: en la raíz del proyecto) */
  group?: string;
}

/** Grupo de testbenches (#180) */
export interface BenchGroup {
  id: string;
  name: string;
}

export interface Variant {
  id: string;
  name: string;
  /** circuito base: el que se edita fuera de toda simulación */
  base: string;
  /** simulación que se está viendo ('' = la base) */
  activeSim: string;
  sims: Sim[];
}

export interface Project {
  name: string;
  created: number;
  modified: number;
  files: ProjectFile[];
  activeVariant: string;
  variants: Variant[];
  /** grupos de testbenches, en orden */
  groups: BenchGroup[];
}

let seq = 0;
/** Id corto y único en el proyecto (prefijo: v variante, s simulación, r corrida) */
export const newId = (prefix: 'v' | 's' | 'r' | 'g') => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const EMPTY_ASC = serializeAsc(emptyDoc());

export const activeVariant = (p: Project): Variant => p.variants.find((v) => v.id === p.activeVariant) ?? p.variants[0];

/** Id de la única variante en memoria: la que tiene los testbenches */
export const BENCHES = 'tb';

/** Testbench nuevo (con un circuito, vacío si no se da) */
export const newBench = (name: string, asc = EMPTY_ASC): Sim => ({ id: newId('s'), name, asc, runs: [] });

/** Proyecto nuevo con un testbench vacío */
export function newProject(name: string, benchName = t('Testbench 1')): Project {
  const now = Date.now();
  const b = newBench(benchName);
  return { name, created: now, modified: now, files: [], activeVariant: BENCHES, variants: [{ id: BENCHES, name, base: EMPTY_ASC, activeSim: b.id, sims: [b] }], groups: [] };
}

/**
 * El proyecto en forma de testbenches: una sola variante cuyas simulaciones son los testbenches,
 * todos con nombre y uno activo. Un proyecto con variantes (versión 1, o un .asc importado) se
 * aplana: cada simulación es un testbench («Variante · Simulación» si había varias variantes) y
 * una variante sin simulaciones, uno con su circuito base.
 */
export function asBenches(p: Project): Project {
  const v0 = p.variants[0];
  if (p.variants.length === 1 && v0.id === BENCHES && v0.sims.length && v0.sims.every((s) => s.name) && v0.sims.some((s) => s.id === v0.activeSim) && p.groups) return p;
  const groups = [...(p.groups ?? [])];
  const several = p.variants.length > 1;
  const sims: Sim[] = [];
  const taken = new Set<string>();
  const unique = (n: string) => {
    let name = n;
    for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${n} (${i})`;
    taken.add(name.toLowerCase());
    return name;
  };
  let active = '';
  for (const v of p.variants) {
    const list = v.sims.length ? v.sims : [{ id: newId('s'), asc: v.base, runs: [] } as Sim];
    for (const s of list) {
      const line = findAnalysis(parseAsc(s.asc))?.value;
      const own = s.name || (line ? analysisLabel(line) : t('No analysis'));
      // los testbenches ya existentes conservan su nombre; de una variante (versión 1 o un .asc
      // importado) con una sola simulación, el nombre es el de la variante
      // una variante con varias simulaciones (de la versión 1 o de un .zip importado) pasa a ser
      // un grupo con un testbench por simulación
      let group = s.group;
      if (v.id !== BENCHES && several && v.sims.length > 1) {
        let g = groups.find((x) => x.id === `g_${v.id}`);
        if (!g) groups.push((g = { id: `g_${v.id}`, name: v.name }));
        group = g.id;
      }
      const name = unique(v.id === BENCHES || group ? own : !v.sims.length || several ? v.name : own);
      sims.push({ ...s, name, ...(group ? { group } : {}) });
      if (v.id === p.activeVariant && (s.id === v.activeSim || !active)) active = s.id;
    }
  }
  return { ...p, activeVariant: BENCHES, variants: [{ id: BENCHES, name: p.name, base: EMPTY_ASC, activeSim: active || sims[0].id, sims }], groups };
}

/** Nombre del proyecto a partir del archivo: sin .turbo ni .asc */
export const projectName = (fileName: string) => fileName.replace(/\.(turbo|asc)$/i, '');

/**
 * Variante a partir de un .asc: la base es el circuito sin la lista de simulaciones y cada
 * simulación de su ";.sims" (o la del comando de análisis, si no hay lista) es una simulación
 * con el mismo circuito y su comando.
 */
export function variantFromAsc(doc: AscDoc, name: string): Variant {
  const { doc: clean, sims } = takeSims(doc, findAnalysis(doc)?.value ?? null);
  const list: Sim[] = sims.items.map((s) => ({
    id: newId('s'),
    ...(s.name ? { name: s.name } : {}),
    asc: serializeAsc(setAnalysisLine(clean, s.line)),
    ...(s.view ? { view: s.view } : {}),
    runs: [],
  }));
  const active = sims.items.findIndex((s) => s.id === sims.active);
  return { id: newId('v'), name, base: serializeAsc(clean), activeSim: list[Math.max(0, active)]?.id ?? '', sims: list };
}

/** Proyecto a partir de un .asc de LTspice: un testbench por simulación de su lista (o uno solo) */
export function projectFromAsc(doc: AscDoc, fileName: string): Project {
  const name = projectName(fileName);
  const v = variantFromAsc(doc, name);
  const now = Date.now();
  return asBenches({ name, created: now, modified: now, files: [], activeVariant: v.id, variants: [v], groups: [] });
}

// --- archivo -------------------------------------------------------------------------------------

type Hash = string;
interface FileRun {
  id: string;
  time: string;
  asc: Hash;
  summary?: string;
  /** nombre de archivo del proyecto → hash de su texto en blobs (#199) */
  files?: Record<string, Hash>;
}
interface FileSim {
  id: string;
  name?: string;
  group?: string;
  current: Hash;
  view?: SimView;
  runs: FileRun[];
}
interface TurboJson {
  format: typeof FORMAT;
  version: number;
  name: string;
  created: string;
  modified: string;
  files: ProjectFile[];
  activeTestbench: string;
  groups: BenchGroup[];
  testbenches: FileSim[];
  blobs: Record<Hash, string>;
}

// el autoguardado serializa el proyecto seguido y casi todos los textos se repiten
const hashCache = new Map<string, Hash>();

/** sha256 del texto, como "sha256:<hex>" */
export async function hashText(text: string): Promise<Hash> {
  const hit = hashCache.get(text);
  if (hit) return hit;
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const h = `sha256:${[...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  if (hashCache.size > 2000) hashCache.clear();
  hashCache.set(text, h);
  return h;
}

/** El proyecto como JSON (con `modified` actualizado afuera, si corresponde) */
export async function serializeTurbo(p: Project): Promise<string> {
  const blobs: Record<Hash, string> = {};
  const memo = new Map<string, Hash>();
  const blob = async (text: string) => {
    let h = memo.get(text);
    if (!h) {
      h = await hashText(text);
      memo.set(text, h);
      blobs[h] = text;
    }
    return h;
  };
  const v = asBenches(p).variants[0];
  const testbenches: FileSim[] = [];
  for (const s of v.sims) {
    const runs: FileRun[] = [];
    // una corrida dañada no tiene texto que guardar: se pierde (ya avisó al abrir)
    for (const r of s.runs) {
      if (r.damaged) continue;
      const files: Record<string, Hash> = {};
      for (const [k, text] of Object.entries(r.files ?? {})) files[k] = await blob(text);
      runs.push({ id: r.id, time: new Date(r.time).toISOString(), asc: await blob(r.asc), ...(r.summary ? { summary: r.summary } : {}), ...(r.files ? { files } : {}) });
    }
    testbenches.push({ id: s.id, ...(s.name ? { name: s.name } : {}), ...(s.group ? { group: s.group } : {}), current: await blob(s.asc), ...(s.view ? { view: s.view } : {}), runs });
  }
  const json: TurboJson = {
    format: FORMAT,
    version: VERSION,
    name: p.name,
    created: new Date(p.created).toISOString(),
    modified: new Date(p.modified).toISOString(),
    files: p.files,
    activeTestbench: v.activeSim,
    groups: asBenches(p).groups,
    testbenches,
    blobs,
  };
  return JSON.stringify(json, null, 1);
}

export interface ParsedTurbo {
  project: Project;
  /** problemas encontrados (blobs que no verifican o faltan); el resto del proyecto se abre igual */
  warnings: string[];
}

/** ¿El resultado de síntesis guardado tiene la forma esperada? (si no, se vuelve a sintetizar) */
const validSynth = (s: unknown): s is VerilogSynth =>
  isObj(s) && typeof s.source === 'string' && typeof s.module === 'string' && typeof s.subckt === 'string' && Array.isArray(s.pins) && isObj(s.params);

/**
 * Proyectos de antes de los módulos Verilog: cada .v generaba un <módulo>.sub visible entre los
 * archivos (con «Generated by TurboSpice from x.v» en la primera línea). Ese .sub pasa a ser el
 * resultado de síntesis del .v (hasta que se vuelva a sintetizar) y deja de ser un archivo.
 */
function migrateVerilog(files: ProjectFile[]): ProjectFile[] {
  const generated = (f: ProjectFile) => (f.kind === 'model' ? /^\* Generated by TurboSpice from (.+?) \(Yosys\)/.exec(f.text)?.[1] : undefined);
  if (!files.some(generated)) return files;
  return files.flatMap((f) => {
    if (generated(f)) return [];
    if (f.kind !== 'verilog' || f.synth) return [f];
    const sub = files.find((x) => generated(x)?.toLowerCase() === f.name.toLowerCase());
    const m = sub && /^\s*\.subckt\s+(\S+)\s+(.*)$/im.exec(sub.text);
    if (!sub || !m) return [f];
    const pins = m[2].split(/\s+/).filter((x) => x && !x.includes('='));
    // (la versión anterior no guardaba las direcciones: se marcan al volver a sintetizar)
    return [{ ...f, synth: { source: '', module: m[1], subckt: sub.text, pins: pins.map((name) => ({ name, dir: 'in' as const })), params: {} } }];
  });
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, what: string): string => {
  if (typeof v !== 'string') throw new Error(t('invalid .turbo: missing {what}', { what }));
  return v;
};
const time = (v: unknown) => {
  const tt = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(tt) ? tt : Date.now();
};

/** ¿El texto es un .turbo? (sin validarlo entero) */
export const isTurboText = (text: string) => /^\s*\{/.test(text) && /"format"\s*:\s*"turbospice"/.test(text.slice(0, 200));

/**
 * Lee un .turbo. La estructura inválida es un error; un blob que no verifica (o falta) sólo
 * afecta a lo que lo usa: la corrida queda marcada como dañada, y una simulación o base sin su
 * circuito pasa a la última corrida sana (o queda vacía), con un aviso.
 */
export async function parseTurbo(text: string): Promise<ParsedTurbo> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(t('invalid .turbo: not JSON'));
  }
  if (!isObj(raw) || raw.format !== FORMAT) throw new Error(t('Not a TurboSpice file'));
  if (typeof raw.version !== 'number' || raw.version > VERSION) throw new Error(t('.turbo from a newer version ({p0}): update TurboSpice', { p0: String(raw.version) }));
  // versión 2: testbenches; se leen como una variante cuyas simulaciones son los testbenches
  const v2 = raw.version >= 2;
  if (v2) {
    if (!Array.isArray(raw.testbenches) || !raw.testbenches.length) throw new Error(t('invalid .turbo: it has no testbenches'));
    raw.variants = [{ id: BENCHES, name: raw.name, activeSim: raw.activeTestbench, sims: raw.testbenches }];
  }
  if (!Array.isArray(raw.variants) || !raw.variants.length) throw new Error(t('invalid .turbo: it has no variants'));
  const blobsIn = isObj(raw.blobs) ? raw.blobs : {};
  const warnings: string[] = [];
  // verificación de cada blob (una sola vez)
  const ok = new Map<string, string | null>();
  for (const [h, tt] of Object.entries(blobsIn)) ok.set(h, typeof tt === 'string' && (await hashText(tt)) === h ? tt : null);
  const get = (h: unknown): string | null => (typeof h === 'string' ? (ok.get(h) ?? null) : null);
  // archivos de una corrida (#199): los que no verifican se omiten (sólo se pierde el «cambió X»)
  const runFiles = (o: Record<string, unknown>): Record<string, string> =>
    Object.fromEntries(Object.entries(o).flatMap(([k, h]) => {
      const text = get(h);
      return text === null ? [] : [[k, text]];
    }));

  const files: ProjectFile[] = migrateVerilog(
    Array.isArray(raw.files)
      ? raw.files
          .filter((f): f is ProjectFile => isObj(f) && typeof f.name === 'string' && typeof f.text === 'string' && (f.kind === 'symbol' || f.kind === 'model' || f.kind === 'schematic' || f.kind === 'verilog'))
          .map((f) => (f.kind === 'verilog' && f.synth && !validSynth(f.synth) ? { name: f.name, kind: f.kind, text: f.text } : f))
      : [],
  );
  const variants: Variant[] = raw.variants.map((vr: unknown, vi: number): Variant => {
    if (!isObj(vr)) throw new Error(t('invalid .turbo: malformed variant'));
    const vname = str(vr.name, t('the name of variant {p0}', { p0: vi + 1 }));
    const sims: Sim[] = (Array.isArray(vr.sims) ? vr.sims : []).map((sr: unknown): Sim => {
      if (!isObj(sr)) throw new Error(t('invalid .turbo: malformed simulation'));
      const id = str(sr.id, t('the id of a simulation'));
      const runs: Run[] = (Array.isArray(sr.runs) ? sr.runs : []).filter(isObj).map((rr) => {
        const asc = get(rr.asc);
        return {
          id: typeof rr.id === 'string' ? rr.id : newId('r'),
          time: time(rr.time),
          asc: asc ?? '',
          ...(typeof rr.summary === 'string' && rr.summary ? { summary: rr.summary } : {}),
          ...(isObj(rr.files) ? { files: runFiles(rr.files) } : {}),
          ...(asc === null ? { damaged: true } : {}),
        };
      });
      const damagedRuns = runs.filter((r) => r.damaged).length;
      const name = typeof sr.name === 'string' && sr.name ? sr.name : undefined;
      const label = v2 ? `«${name ?? vname}»` : `«${vname}${name ? ` · ${name}` : ''}»`;
      if (damagedRuns) warnings.push(`${label}: ${damagedRuns === 1 ? t('one run in the history is damaged') : t('{damagedRuns} runs in the history are damaged', { damagedRuns })}`);
      let asc = get(sr.current);
      if (asc === null) {
        asc = [...runs].reverse().find((r) => !r.damaged)?.asc ?? EMPTY_ASC;
        warnings.push(t('{label}: the current circuit is damaged; recovered {p1}', { label, p1: asc === EMPTY_ASC ? t('empty') : t('the one from the last run') }));
      }
      return { id, ...(name ? { name } : {}), ...(typeof sr.group === 'string' && sr.group ? { group: sr.group } : {}), asc, ...(isObj(sr.view) && Array.isArray(sr.view.panes) ? { view: sr.view as unknown as SimView } : {}), runs };
    });
    let base = v2 ? EMPTY_ASC : get(vr.base);
    if (base === null) {
      base = sims[0]?.asc ?? EMPTY_ASC;
      warnings.push(t('«{vname}»: the base circuit is damaged; recovered {p1}', { vname, p1: sims.length ? t('the one from its first simulation') : t('empty') }));
    }
    const activeSim = typeof vr.activeSim === 'string' && sims.some((s) => s.id === vr.activeSim) ? vr.activeSim : '';
    return { id: str(vr.id, t('the id of a variant')), name: vname, base, activeSim, sims };
  });
  const activeVariant = typeof raw.activeVariant === 'string' && variants.some((v) => v.id === raw.activeVariant) ? raw.activeVariant : variants[0].id;
  return {
    project: asBenches({
      name: str(raw.name, t('the project name')),
      created: time(raw.created),
      modified: time(raw.modified),
      files,
      activeVariant,
      variants,
      groups: Array.isArray(raw.groups) ? raw.groups.filter((g): g is BenchGroup => isObj(g) && typeof g.id === 'string' && typeof g.name === 'string').map((g) => ({ id: g.id, name: g.name })) : [],
    }),
    warnings,
  };
}

/** El documento de un .asc guardado en el proyecto */
export const docOf = (asc: string): AscDoc => parseAsc(asc);
