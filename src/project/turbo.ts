// Formato .turbo (#149, docs/turbo-formato.md): un JSON con el proyecto entero. Proyecto →
// variantes → simulaciones (cada una con su .asc completo) → corridas (historial). En el archivo
// cada .asc está una sola vez, en `blobs`, con su sha256 como clave; el resto lo nombra por el
// hash. En memoria no hay hashes: cada simulación y corrida tiene su texto.
import { parseAsc } from '../asc/parse.ts';
import { serializeAsc } from '../asc/serialize.ts';
import { emptyDoc, type AscDoc } from '../asc/model.ts';
import { findAnalysis, setAnalysisLine } from '../schematic/directivesEdit.ts';
import { takeSims, type SimView } from '../sim/simList.ts';

export const FORMAT = 'turbospice';
export const VERSION = 1;
export const EXT = '.turbo';

/** Símbolo o archivo de modelos del proyecto (común a todas las variantes) */
export interface ProjectFile {
  name: string;
  kind: 'symbol' | 'model';
  text: string;
}

/** Una vez que se simuló: el circuito exacto (inmutable) */
export interface Run {
  id: string;
  /** ms desde 1970 */
  time: number;
  asc: string;
  /** cambios contra la corrida anterior: "+C3, −R2, R1 1k→2k2" */
  summary?: string;
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
}

let seq = 0;
/** Id corto y único en el proyecto (prefijo: v variante, s simulación, r corrida) */
export const newId = (prefix: 'v' | 's' | 'r') => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const EMPTY_ASC = serializeAsc(emptyDoc());

export const activeVariant = (p: Project): Variant => p.variants.find((v) => v.id === p.activeVariant) ?? p.variants[0];

/** Proyecto nuevo con una variante vacía */
export function newProject(name: string, variantName = 'Variante 1'): Project {
  const now = Date.now();
  const v: Variant = { id: newId('v'), name: variantName, base: EMPTY_ASC, activeSim: '', sims: [] };
  return { name, created: now, modified: now, files: [], activeVariant: v.id, variants: [v] };
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

/** Proyecto con una sola variante, «Variante 1»: la del .asc (al abrir un .asc de LTspice) */
export function projectFromAsc(doc: AscDoc, fileName: string): Project {
  const name = projectName(fileName);
  const v = variantFromAsc(doc, 'Variante 1');
  const now = Date.now();
  return { name, created: now, modified: now, files: [], activeVariant: v.id, variants: [v] };
}

// --- archivo -------------------------------------------------------------------------------------

type Hash = string;
interface FileRun {
  id: string;
  time: string;
  asc: Hash;
  summary?: string;
}
interface FileSim {
  id: string;
  name?: string;
  current: Hash;
  view?: SimView;
  runs: FileRun[];
}
interface FileVariant {
  id: string;
  name: string;
  base: Hash;
  activeSim: string;
  sims: FileSim[];
}
interface TurboJson {
  format: typeof FORMAT;
  version: number;
  name: string;
  created: string;
  modified: string;
  files: ProjectFile[];
  activeVariant: string;
  variants: FileVariant[];
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
  const variants: FileVariant[] = [];
  for (const v of p.variants) {
    const sims: FileSim[] = [];
    for (const s of v.sims) {
      const runs: FileRun[] = [];
      // una corrida dañada no tiene texto que guardar: se pierde (ya avisó al abrir)
      for (const r of s.runs) if (!r.damaged) runs.push({ id: r.id, time: new Date(r.time).toISOString(), asc: await blob(r.asc), ...(r.summary ? { summary: r.summary } : {}) });
      sims.push({ id: s.id, ...(s.name ? { name: s.name } : {}), current: await blob(s.asc), ...(s.view ? { view: s.view } : {}), runs });
    }
    variants.push({ id: v.id, name: v.name, base: await blob(v.base), activeSim: v.activeSim, sims });
  }
  const json: TurboJson = {
    format: FORMAT,
    version: VERSION,
    name: p.name,
    created: new Date(p.created).toISOString(),
    modified: new Date(p.modified).toISOString(),
    files: p.files,
    activeVariant: p.activeVariant,
    variants,
    blobs,
  };
  return JSON.stringify(json, null, 1);
}

export interface ParsedTurbo {
  project: Project;
  /** problemas encontrados (blobs que no verifican o faltan); el resto del proyecto se abre igual */
  warnings: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, what: string): string => {
  if (typeof v !== 'string') throw new Error(`.turbo inválido: falta ${what}`);
  return v;
};
const time = (v: unknown) => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : Date.now();
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
    throw new Error('.turbo inválido: no es JSON');
  }
  if (!isObj(raw) || raw.format !== FORMAT) throw new Error('No es un archivo de TurboSpice');
  if (typeof raw.version !== 'number' || raw.version > VERSION) throw new Error(`.turbo de una versión más nueva (${String(raw.version)}): actualizá TurboSpice`);
  if (!Array.isArray(raw.variants) || !raw.variants.length) throw new Error('.turbo inválido: no tiene variantes');
  const blobsIn = isObj(raw.blobs) ? raw.blobs : {};
  const warnings: string[] = [];
  // verificación de cada blob (una sola vez)
  const ok = new Map<string, string | null>();
  for (const [h, t] of Object.entries(blobsIn)) ok.set(h, typeof t === 'string' && (await hashText(t)) === h ? t : null);
  const get = (h: unknown): string | null => (typeof h === 'string' ? (ok.get(h) ?? null) : null);

  const files: ProjectFile[] = Array.isArray(raw.files)
    ? raw.files.filter((f): f is ProjectFile => isObj(f) && typeof f.name === 'string' && typeof f.text === 'string' && (f.kind === 'symbol' || f.kind === 'model'))
    : [];
  const variants: Variant[] = raw.variants.map((vr: unknown, vi: number): Variant => {
    if (!isObj(vr)) throw new Error('.turbo inválido: variante mal formada');
    const vname = str(vr.name, `el nombre de la variante ${vi + 1}`);
    const sims: Sim[] = (Array.isArray(vr.sims) ? vr.sims : []).map((sr: unknown): Sim => {
      if (!isObj(sr)) throw new Error('.turbo inválido: simulación mal formada');
      const id = str(sr.id, 'el id de una simulación');
      const runs: Run[] = (Array.isArray(sr.runs) ? sr.runs : []).filter(isObj).map((rr) => {
        const asc = get(rr.asc);
        return {
          id: typeof rr.id === 'string' ? rr.id : newId('r'),
          time: time(rr.time),
          asc: asc ?? '',
          ...(typeof rr.summary === 'string' && rr.summary ? { summary: rr.summary } : {}),
          ...(asc === null ? { damaged: true } : {}),
        };
      });
      const damagedRuns = runs.filter((r) => r.damaged).length;
      const name = typeof sr.name === 'string' && sr.name ? sr.name : undefined;
      const label = `«${vname}${name ? ` · ${name}` : ''}»`;
      if (damagedRuns) warnings.push(`${label}: ${damagedRuns === 1 ? 'una corrida del historial está dañada' : `${damagedRuns} corridas del historial están dañadas`}`);
      let asc = get(sr.current);
      if (asc === null) {
        asc = [...runs].reverse().find((r) => !r.damaged)?.asc ?? EMPTY_ASC;
        warnings.push(`${label}: el circuito actual está dañado; se recuperó ${asc === EMPTY_ASC ? 'vacío' : 'el de la última corrida'}`);
      }
      return { id, ...(name ? { name } : {}), asc, ...(isObj(sr.view) && Array.isArray(sr.view.panes) ? { view: sr.view as unknown as SimView } : {}), runs };
    });
    let base = get(vr.base);
    if (base === null) {
      base = sims[0]?.asc ?? EMPTY_ASC;
      warnings.push(`«${vname}»: el circuito base está dañado; se recuperó ${sims.length ? 'el de su primera simulación' : 'vacío'}`);
    }
    const activeSim = typeof vr.activeSim === 'string' && sims.some((s) => s.id === vr.activeSim) ? vr.activeSim : '';
    return { id: str(vr.id, 'el id de una variante'), name: vname, base, activeSim, sims };
  });
  const activeVariant = typeof raw.activeVariant === 'string' && variants.some((v) => v.id === raw.activeVariant) ? raw.activeVariant : variants[0].id;
  return {
    project: { name: str(raw.name, 'el nombre del proyecto'), created: time(raw.created), modified: time(raw.modified), files, activeVariant, variants },
    warnings,
  };
}

/** El documento de un .asc guardado en el proyecto */
export const docOf = (asc: string): AscDoc => parseAsc(asc);
