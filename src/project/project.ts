// Operaciones sobre el proyecto (#150, #151, #152): variantes, simulaciones con su propio
// circuito y corridas. Todas devuelven un proyecto nuevo (no modifican el que reciben).
import type { AscDoc } from '../asc/model.ts';
import { parseAsc } from '../asc/parse.ts';
import { serializeAsc } from '../asc/serialize.ts';
import { removeAnalysis } from '../schematic/directivesEdit.ts';
import { simLine } from '../sim/complexSim.ts';
import { analysisLabel, MAX_SIMS, type SimView } from '../sim/simList.ts';
import { EMPTY_ASC, newId, type Project, type ProjectFile, type Run, type Sim, type Variant } from './turbo.ts';
import { t } from '../i18n/i18n.ts';

// --- lectura ----------------------------------------------------------------------------------

const lineCache = new Map<string, string>();
/** Comando de análisis de un .asc guardado ('' si no tiene; COMPLEX_LINE si es Complex, #241) */
export function lineOf(asc: string): string {
  let l = lineCache.get(asc);
  if (l === undefined) {
    l = simLine(parseAsc(asc));
    if (lineCache.size > 500) lineCache.clear();
    lineCache.set(asc, l);
  }
  return l;
}

/** Nombre que se muestra: el propio, o el automático del comando de análisis */
export const simLabel = (s: Sim, line = lineOf(s.asc)) => s.name || (line ? analysisLabel(line) : t('No analysis'));

export const variantOf = (p: Project, id = p.activeVariant): Variant => p.variants.find((v) => v.id === id) ?? p.variants[0];
export const simOf = (v: Variant, id = v.activeSim): Sim | undefined => v.sims.find((s) => s.id === id);

/** Texto del circuito que se ve en la variante (el de su simulación activa, o la base) */
export const activeAsc = (v: Variant) => simOf(v)?.asc ?? v.base;

/** «x», «x (2)», «x (3)»… que no esté entre `taken` (sin distinguir mayúsculas) */
export function uniqueLabel(name: string, taken: string[]): string {
  const used = new Set(taken.map((tt) => tt.trim().toLowerCase()));
  if (!used.has(name.trim().toLowerCase())) return name;
  const base = name.replace(/\s*\(\d+\)$/, '');
  for (let i = 2; ; i++) if (!used.has(`${base} (${i})`.toLowerCase())) return `${base} (${i})`;
}

/** ¿El nombre ya lo usa otra variante del proyecto (o otra simulación de la variante)? */
export const nameTaken = (names: string[], name: string) => names.some((n) => n.trim().toLowerCase() === name.trim().toLowerCase());

// --- edición -----------------------------------------------------------------------------------

const touch = (p: Project): Project => ({ ...p, modified: Date.now() });

export const mapVariant = (p: Project, id: string, f: (v: Variant) => Variant): Project =>
  touch({ ...p, variants: p.variants.map((v) => (v.id === id ? f(v) : v)) });

const mapSim = (v: Variant, id: string, f: (s: Sim) => Sim): Variant => ({ ...v, sims: v.sims.map((s) => (s.id === id ? f(s) : s)) });

/**
 * Guarda el circuito (y la vista) que se está editando en la variante activa: en su simulación
 * activa o en la base. Si no cambió nada devuelve el mismo proyecto.
 */
export function storeActive(p: Project, asc: string, view?: SimView): Project {
  const v = variantOf(p);
  const s = simOf(v);
  if (!s) return v.base === asc ? p : mapVariant(p, v.id, (x) => ({ ...x, base: asc }));
  if (s.asc === asc && (view === undefined || s.view === view)) return p;
  return mapVariant(p, v.id, (x) => mapSim(x, s.id, (y) => ({ ...y, asc, ...(view ? { view } : {}) })));
}

/** Cambia el circuito de una simulación (de la variante activa) que no es la que se ve */
export const setSimAsc = (p: Project, simId: string, asc: string): Project => mapVariant(p, variantOf(p).id, (v) => mapSim(v, simId, (s) => ({ ...s, asc })));

export const selectSim = (p: Project, simId: string): Project => {
  const v = variantOf(p);
  if (v.activeSim === simId || (simId && !simOf(v, simId))) return p;
  return { ...p, variants: p.variants.map((x) => (x.id === v.id ? { ...x, activeSim: simId } : x)) };
};

/** Simulación nueva con ese circuito, a continuación de la activa, y activa (null si la lista está llena) */
export function addSim(p: Project, asc: string, name?: string): { project: Project; id: string } | null {
  const v = variantOf(p);
  if (v.sims.length >= MAX_SIMS) return null;
  const i = v.sims.findIndex((x) => x.id === v.activeSim);
  // cae en el grupo del testbench activo
  const group = v.sims[i]?.group ?? p.groups[0]?.id;
  const s: Sim = { id: newId('s'), ...(name ? { name } : {}), asc, ...(group ? { group } : {}), runs: [] };
  const sims = i < 0 ? [...v.sims, s] : [...v.sims.slice(0, i + 1), s, ...v.sims.slice(i + 1)];
  return { project: mapVariant(p, v.id, (x) => ({ ...x, sims, activeSim: s.id })), id: s.id };
}

/** Copia de una simulación con su circuito y su vista, sin el historial */
export function duplicateSim(p: Project, simId: string): { project: Project; id: string } | null {
  const v = variantOf(p);
  const src = simOf(v, simId);
  if (!src || v.sims.length >= MAX_SIMS) return null;
  // con nombre propio, la copia lo lleva con «(copia)»; con el automático, sigue siendo automático
  const name = src.name ? t('{name} (copy)', { name: src.name }) : undefined;
  const s: Sim = { id: newId('s'), ...(name ? { name } : {}), asc: src.asc, ...(src.view ? { view: structuredClone(src.view) } : {}), ...(src.group ? { group: src.group } : {}), runs: [] };
  const i = v.sims.indexOf(src);
  return { project: mapVariant(p, v.id, (x) => ({ ...x, sims: [...v.sims.slice(0, i + 1), s, ...v.sims.slice(i + 1)], activeSim: s.id })), id: s.id };
}

/** Saca una simulación; si era la activa pasa a la siguiente (o a la anterior, o a la base) */
export function removeSim(p: Project, simId: string): Project {
  const v = variantOf(p);
  const i = v.sims.findIndex((s) => s.id === simId);
  // un proyecto tiene siempre al menos un testbench
  if (i < 0 || v.sims.length === 1) return p;
  const sims = v.sims.filter((s) => s.id !== simId);
  // la base se queda con el circuito de la última simulación borrada (sin su comando), para no perderlo
  const base = sims.length ? v.base : serializeAsc(removeAnalysis(parseAsc(v.sims[i].asc)));
  const activeSim = v.activeSim !== simId ? v.activeSim : ((sims[i] ?? sims[i - 1])?.id ?? '');
  return mapVariant(p, v.id, (x) => ({ ...x, sims, activeSim, base }));
}

/** Nombre propio (vacío: vuelve al automático) */
export const renameSim = (p: Project, simId: string, name: string): Project =>
  name.trim() ? mapVariant(p, variantOf(p).id, (v) => mapSim(v, simId, (s) => ({ ...s, name: name.trim() }))) : p;

// --- grupos de testbenches (#180) ----------------------------------------------------------------

export function addGroup(p: Project, name: string): { project: Project; id: string } {
  const id = newId('g');
  return { project: touch({ ...p, groups: [...p.groups, { id, name: uniqueLabel(name, p.groups.map((g) => g.name)) }] }), id };
}

export const renameGroup = (p: Project, id: string, name: string): Project =>
  name.trim() ? touch({ ...p, groups: p.groups.map((g) => (g.id === id ? { ...g, name: name.trim() } : g)) }) : p;

/** Saca el grupo: sus testbenches pasan al primero de los que quedan (el último no se saca) */
export function removeGroup(p: Project, id: string): Project {
  const rest = p.groups.filter((g) => g.id !== id);
  if (!rest.length || rest.length === p.groups.length) return p;
  return touch({
    ...p,
    groups: rest,
    variants: p.variants.map((v) => ({ ...v, sims: v.sims.map((s) => (s.group === id ? { ...s, group: rest[0].id } : s)) })),
  });
}

/**
 * Los testbenches pertenecen siempre a un grupo: si el proyecto no tiene, se crea «Group 1», y
 * los que no tienen grupo (o uno que ya no existe) pasan al primero. Sin cambios devuelve el mismo.
 */
export function withGroups(p: Project): Project {
  const groups = p.groups.length ? p.groups : [{ id: newId('g'), name: t('Workbench {n}', { n: 1 }) }];
  const ids = new Set(groups.map((g) => g.id));
  const loose = (s: Sim) => !s.group || !ids.has(s.group);
  if (groups === p.groups && !p.variants.some((v) => v.sims.some(loose))) return p;
  return { ...p, groups, variants: p.variants.map((v) => ({ ...v, sims: v.sims.map((s) => (loose(s) ? { ...s, group: groups[0].id } : s)) })) };
}

/** Mueve un testbench a un grupo */
export const setBenchGroup = (p: Project, simId: string, group?: string): Project =>
  mapVariant(p, variantOf(p).id, (v) => mapSim(v, simId, ({ group: _, ...s }) => (group ? { ...s, group } : s)));

/**
 * Reordena (#218): pone el testbench en `group`, justo antes de `before` (otro testbench), o al
 * final del grupo si `before` no se da. El orden queda en el arreglo de simulaciones (y en el .turbo).
 */
export function placeBench(p: Project, simId: string, group: string, before?: string): Project {
  const v = variantOf(p);
  const s = simOf(v, simId);
  if (!s || before === simId) return p;
  const rest = v.sims.filter((x) => x !== s);
  const moved: Sim = { ...s, group };
  let i = before ? rest.findIndex((x) => x.id === before) : -1;
  if (i < 0) {
    // después del último del grupo (o al final si el grupo está vacío)
    let last = -1;
    rest.forEach((x, k) => x.group === group && (last = k));
    i = last < 0 ? rest.length : last + 1;
  }
  const sims = [...rest.slice(0, i), moved, ...rest.slice(i)];
  if (s.group === group && sims.every((x, k) => x.id === v.sims[k].id)) return p;
  return mapVariant(p, v.id, (x) => ({ ...x, sims }));
}

/** Nombre libre para un testbench nuevo (también las copias): «Testbench N», el siguiente número libre */
export function freeBenchName(p: Project): string {
  const used = new Set(variantOf(p).sims.map((s) => simLabel(s).trim().toLowerCase()));
  for (let n = variantOf(p).sims.length + 1; ; n++) {
    const name = t('Testbench {n}', { n });
    if (!used.has(name.toLowerCase())) return name;
  }
}

/**
 * Agrega una corrida con el circuito simulado. Si es igual al de la última, sólo se actualiza
 * su fecha (no se llena el historial de entradas iguales).
 */
export function recordRun(p: Project, simId: string, asc: string, time = Date.now(), summary?: string, files?: Record<string, string>): { project: Project; run: Run } {
  const v = variantOf(p);
  const s = simOf(v, simId);
  if (!s) throw new Error(t('Simulation {simId} doesn\'t exist', { simId }));
  const last = s.runs[s.runs.length - 1];
  // misma corrida si no cambió el circuito ni los subcircuitos/modelos que usa (#199)
  // (una corrida de antes de guardar archivos no se repite: se le agregan)
  const same = last && !last.damaged && last.asc === asc && (!last.files || sameFiles(last.files, files));
  const run: Run = same ? { ...last, time, ...(files && !last.files ? { files } : {}) } : { id: newId('r'), time, asc, ...(summary ? { summary } : {}), ...(files ? { files } : {}) };
  const runs = last && run.id === last.id ? [...s.runs.slice(0, -1), run] : [...s.runs, run];
  return { project: mapVariant(p, v.id, (x) => mapSim(x, simId, (y) => ({ ...y, runs }))), run };
}

function sameFiles(a: Record<string, string> | undefined, b: Record<string, string> | undefined): boolean {
  const ka = Object.keys(a ?? {});
  return ka.length === Object.keys(b ?? {}).length && ka.every((k) => a![k] === b?.[k]);
}

// --- variantes ---------------------------------------------------------------------------------

export const selectVariant = (p: Project, id: string): Project => (p.activeVariant === id || !p.variants.some((v) => v.id === id) ? p : { ...p, activeVariant: id });

/** Copia completa de una variante (base, simulaciones e historial), a continuación de ella y activa */
export function cloneVariant(p: Project, id: string, name?: string): { project: Project; id: string } {
  const src = variantOf(p, id);
  const v: Variant = {
    ...structuredClone(src),
    id: newId('v'),
    name: name ?? uniqueLabel(t('{name} (copy)', { name: src.name }), p.variants.map((x) => x.name)),
  };
  // ids nuevos para las simulaciones (los resultados en memoria van por id)
  const ids = new Map(v.sims.map((s) => [s.id, newId('s')]));
  v.sims = v.sims.map((s) => ({ ...s, id: ids.get(s.id)! }));
  v.activeSim = ids.get(src.activeSim) ?? '';
  const i = p.variants.indexOf(src);
  return { project: touch({ ...p, variants: [...p.variants.slice(0, i + 1), v, ...p.variants.slice(i + 1)], activeVariant: v.id }), id: v.id };
}

/** Variante vacía (sin circuito ni simulaciones), al final y activa */
export function blankVariant(p: Project, name?: string): { project: Project; id: string } {
  const v: Variant = { id: newId('v'), name: name ?? uniqueLabel(t('Variant 1'), p.variants.map((x) => x.name)), base: EMPTY_ASC, activeSim: '', sims: [] };
  return { project: touch({ ...p, variants: [...p.variants, v], activeVariant: v.id }), id: v.id };
}

export const renameVariant = (p: Project, id: string, name: string): Project => (name.trim() ? mapVariant(p, id, (v) => ({ ...v, name: name.trim() })) : p);

/** Saca una variante (nunca la última); si era la activa pasa a la siguiente o a la anterior */
export function removeVariant(p: Project, id: string): Project {
  const i = p.variants.findIndex((v) => v.id === id);
  if (i < 0 || p.variants.length === 1) return p;
  const variants = p.variants.filter((v) => v.id !== id);
  const activeVariant = p.activeVariant !== id ? p.activeVariant : (variants[i] ?? variants[i - 1]).id;
  return touch({ ...p, variants, activeVariant });
}

// --- aviso «R1 = 1k también en N simulaciones» (#151) -------------------------------------------

export interface ValueChange {
  inst: string;
  from: string;
  to: string;
}

const valuesOf = (d: AscDoc) => {
  const m = new Map<string, string>();
  for (const s of d.symbols) {
    const inst = s.attrs.get('InstName');
    const value = s.attrs.get('Value');
    if (inst && value !== undefined) m.set(inst.toLowerCase(), value);
  }
  return m;
};

/** Valores (atributo Value) que cambiaron de un documento al otro, en componentes que siguen estando */
export function valueChanges(prev: AscDoc, next: AscDoc): ValueChange[] {
  if (prev.symbols === next.symbols) return [];
  const before = valuesOf(prev);
  const out: ValueChange[] = [];
  for (const s of next.symbols) {
    const inst = s.attrs.get('InstName');
    const to = s.attrs.get('Value');
    const from = inst ? before.get(inst.toLowerCase()) : undefined;
    if (inst && to !== undefined && from !== undefined && from !== to) out.push({ inst, from, to });
  }
  return out;
}

/** Otras simulaciones de la variante con ese componente y el valor de antes */
export function simsWithValue(v: Variant, change: ValueChange): string[] {
  return v.sims.filter((s) => s.id !== v.activeSim && valuesOf(parseAsc(s.asc)).get(change.inst.toLowerCase()) === change.from).map((s) => s.id);
}

/** El circuito con los valores cambiados (sólo donde todavía tienen el valor de antes) */
export function applyValues(d: AscDoc, changes: ValueChange[]): AscDoc {
  let touched = false;
  const symbols = d.symbols.map((s) => {
    const inst = s.attrs.get('InstName')?.toLowerCase();
    const c = changes.find((x) => x.inst.toLowerCase() === inst && s.attrs.get('Value') === x.from);
    if (!c) return s;
    touched = true;
    const attrs = new Map(s.attrs);
    attrs.set('Value', c.to);
    return { ...s, attrs };
  });
  return touched ? { ...d, symbols } : d;
}

// --- archivos del proyecto (#155) ---------------------------------------------------------------

export type FileConflict = 'replace' | 'keep' | 'rename';

/** Tipo de archivo del proyecto según la extensión (null: no va al proyecto) */
export const projectFileKind = (name: string): ProjectFile['kind'] | null =>
  /\.asy$/i.test(name) ? 'symbol' : /\.(lib|sub|mod|inc|cir|txt|lb|bjt|dio|mos|jft)$/i.test(name) ? 'model' : /\.s?v$/i.test(name) ? 'verilog' : null;

/** «x (2).lib», «x (3).lib»… que no esté entre `taken` */
export function uniqueFileName(name: string, taken: string[]): string {
  const used = new Set(taken.map((tt) => tt.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  const m = /^(.*?)(\.[^.]*)?$/.exec(name)!;
  for (let i = 2; ; i++) {
    const n = `${m[1]} (${i})${m[2] ?? ''}`;
    if (!used.has(n.toLowerCase())) return n;
  }
}

/**
 * Agrega archivos a los del proyecto. Uno con el mismo nombre y el mismo contenido no hace nada;
 * con otro contenido se pregunta (`ask`): reemplazar, mantener el existente o renombrar el nuevo.
 */
export async function mergeFiles(files: ProjectFile[], incoming: ProjectFile[], ask: (name: string) => Promise<FileConflict>): Promise<{ files: ProjectFile[]; added: string[] }> {
  const out = [...files];
  const added: string[] = [];
  for (const f of incoming) {
    const i = out.findIndex((x) => x.name.toLowerCase() === f.name.toLowerCase());
    if (i < 0) {
      out.push(f);
      added.push(f.name);
      continue;
    }
    if (out[i].text === f.text) continue;
    const choice = await ask(f.name);
    if (choice === 'replace') {
      out[i] = f;
      added.push(f.name);
    } else if (choice === 'rename') {
      const name = uniqueFileName(f.name, out.map((x) => x.name));
      out.push({ ...f, name });
      added.push(name);
    }
  }
  return { files: out, added };
}

// --- propagar cambios dentro de un grupo (#180) -----------------------------------------------------

const ATTR_KEYS = ['Value', 'Value2', 'SpiceLine', 'SpiceLine2', 'SpiceModel'];

/** Otros testbenches del mismo grupo que tienen ese componente (por InstName y tipo) */
export function groupPeersWith(p: Project, simId: string, inst: string, type: string): string[] {
  const v = variantOf(p);
  const me = v.sims.find((s) => s.id === simId);
  if (!me?.group) return [];
  const base = (x: string) => x.replace(/^.*[\\/]/, '').toLowerCase();
  return v.sims
    .filter((s) => s.id !== simId && s.group === me.group)
    .filter((s) => parseAsc(s.asc).symbols.some((x) => x.attrs.get('InstName')?.toLowerCase() === inst.toLowerCase() && base(x.type) === base(type)))
    .map((s) => s.id);
}

/** Copia los valores de un componente (Value, SpiceLine…) a los testbenches indicados */
export function propagateAttrs(p: Project, ids: string[], inst: string, type: string, attrs: Map<string, string>): Project {
  const base = (x: string) => x.replace(/^.*[\\/]/, '').toLowerCase();
  let out = p;
  for (const id of ids) {
    const s = simOf(variantOf(out), id);
    if (!s) continue;
    const d = parseAsc(s.asc);
    let changed = false;
    for (const x of d.symbols) {
      if (x.attrs.get('InstName')?.toLowerCase() !== inst.toLowerCase() || base(x.type) !== base(type)) continue;
      for (const k of ATTR_KEYS) {
        const v = attrs.get(k);
        if (v === undefined ? !x.attrs.has(k) : x.attrs.get(k) === v) continue;
        if (v === undefined) x.attrs.delete(k);
        else x.attrs.set(k, v);
        changed = true;
      }
    }
    if (changed) out = setSimAsc(out, id, serializeAsc(d));
  }
  return out;
}
