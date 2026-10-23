// Ida y vuelta con LTspice (#157). Exportar una variante: un .zip con un .asc por simulación (el
// circuito actual, sin historial) y los archivos del proyecto que usan. Exportar todo: un .zip con
// una carpeta por variante. Importar: un .zip (cada carpeta, y la raíz, es una variante con una
// simulación por .asc) o varios archivos sueltos (cada .asc, una variante); los .asy/.lib/.sub
// van a los archivos del proyecto.
import { decode, decodeText } from '../asc/encoding.ts';
import { baseName, emptyDoc, type AscDoc } from '../asc/model.ts';
import { ltNetlist, ltNetlistText } from '../netlist/ltnetlist.ts';
import { parseAsc } from '../asc/parse.ts';
import { serializeAsc } from '../asc/serialize.ts';
import type { SymbolSource } from '../asc/resolve.ts';
import { findAnalysis, setAnalysisLine } from '../schematic/directivesEdit.ts';
import { ascBytes } from '../schematic/fileio.ts';
import { analysisLabel, takeSims } from '../sim/simList.ts';
import { projectFileKind, simLabel, uniqueFileName, uniqueLabel, variantOf } from './project.ts';
import { newId, variantFromAsc, type Project, type ProjectFile, type Sim, type Variant } from './turbo.ts';
import { makeZip, type ZipEntry } from './zip.ts';
import { t } from '../i18n/i18n.ts';

/** Nombre de archivo válido en Windows */
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').replace(/[. ]+$/, '').trim() || t('unnamed');

/** Archivos del proyecto que usan estos circuitos: símbolos por nombre, modelos nombrados en el texto */
export function usedFiles(files: ProjectFile[], ascTexts: string[]): ProjectFile[] {
  const types = new Set(ascTexts.flatMap((tt) => parseAsc(tt).symbols.map((s) => baseName(s.type).toLowerCase())));
  // subcircuitos (#180): los que se usan y, adentro, los suyos
  const schs: ProjectFile[] = [];
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of files) {
      if (f.kind !== 'schematic' || schs.includes(f) || !types.has(f.name.replace(/\.asc$/i, '').toLowerCase())) continue;
      schs.push(f);
      for (const s of parseAsc(f.text).symbols) types.add(baseName(s.type).toLowerCase());
      grew = true;
    }
  }
  ascTexts = [...ascTexts, ...schs.map((f) => f.text)];
  const syms = files.filter((f) => f.kind === 'symbol' && types.has(f.name.replace(/\.asy$/i, '').toLowerCase()));
  const hay = [...ascTexts, ...syms.map((s) => s.text)].join('\n').toLowerCase();
  return [...schs, ...syms, ...files.filter((f) => f.kind === 'model' && hay.includes(f.name.toLowerCase()))];
}

/** Archivos del proyecto que usa un circuito, con su texto (para guardarlos en la corrida, #199) */
export function runFilesOf(p: Project, asc: string): Record<string, string> | undefined {
  const used = usedFiles(p.files, [asc]);
  return used.length ? Object.fromEntries(used.map((f) => [f.name, f.text])) : undefined;
}

/**
 * Qué archivos del proyecto cambiaron entre dos corridas («cambió OPAMP_TC2», #199): subcircuitos
 * por su nombre (su .asc o su .asy) y modelos por el archivo. Los que se dejaron de usar o se
 * empezaron a usar ya se ven en el resumen del circuito (la instancia), no se repiten.
 */
export function changedFiles(before: Record<string, string> | undefined, after: Record<string, string> | undefined): string[] {
  const out: string[] = [];
  for (const [k, text] of Object.entries(after ?? {})) {
    const old = before?.[k];
    if (old === undefined || old === text) continue;
    const name = /\.(asc|asy)$/i.test(k) ? k.replace(/\.[^.]*$/, '') : k;
    if (!out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}

/** Resumen de una corrida: cambios del circuito y de los subcircuitos/modelos que usa */
export function runSummary(circuit: string | undefined, before: Record<string, string> | undefined, after: Record<string, string> | undefined): string | undefined {
  const changed = changedFiles(before, after).map((name) => t('{name} changed', { name }));
  if (!changed.length) return circuit;
  return [...(circuit && circuit !== t('no changes') ? [circuit] : []), ...changed].join(', ');
}

/** Los .asc de una variante: uno por simulación (la base, si no tiene ninguna) */
export function variantAscs(v: Variant): { name: string; asc: string }[] {
  const list = v.sims.length ? v.sims.map((s) => ({ label: simLabel(s), asc: s.asc })) : [{ label: v.name, asc: v.base }];
  const taken: string[] = [];
  return list.map((x) => {
    const name = uniqueFileName(`${safeName(x.label)}.asc`, taken);
    taken.push(name);
    return { name, asc: x.asc };
  });
}

/** Entradas del zip de una variante (dentro de `dir`, si se da) */
export function variantEntries(p: Project, v: Variant, lib: SymbolSource, dir = ''): ZipEntry[] {
  const ascs = variantAscs(v);
  const enc = new TextEncoder();
  return [
    // todo explícito, como al guardar un .asc (así LTspice lo abre igual)
    ...ascs.map((a) => ({ path: `${dir}${a.name}`, data: ascBytes(parseAsc(a.asc), lib).bytes })),
    ...usedFiles(p.files, ascs.map((a) => a.asc)).map((f) => ({ path: `${dir}${f.name}`, data: enc.encode(f.text) })),
  ];
}

export function exportVariantZip(p: Project, variantId: string, lib: SymbolSource): { name: string; bytes: Uint8Array } {
  const v = variantOf(p, variantId);
  // con testbenches (una sola variante) el .zip es el del proyecto
  const name = p.variants.length === 1 ? `${safeName(p.name)}.zip` : `${safeName(p.name)} - ${safeName(v.name)}.zip`;
  return { name, bytes: makeZip(variantEntries(p, v, lib)) };
}

export function exportAllZip(p: Project, lib: SymbolSource): { name: string; bytes: Uint8Array } {
  // testbenches: un .asc por testbench, sin carpetas
  if (p.variants.length === 1) return { name: `${safeName(p.name)}.zip`, bytes: makeZip(variantEntries(p, p.variants[0], lib)) };
  const taken: string[] = [];
  const entries = p.variants.flatMap((v) => {
    const dir = uniqueFileName(safeName(v.name), taken);
    taken.push(dir);
    return variantEntries(p, v, lib, `${dir}/`);
  });
  return { name: `${safeName(p.name)}.zip`, bytes: makeZip(entries) };
}

// --- importar ------------------------------------------------------------------------------------

/** Variante con una simulación por .asc (cada uno con su comando, o todos los de su ";.sims") */
export function variantFromAscs(docs: { name: string; doc: AscDoc }[], name: string): Variant {
  if (docs.length === 1) return variantFromAsc(docs[0].doc, name);
  const sims: Sim[] = docs.flatMap(({ name: file, doc }) => {
    const { doc: clean, sims: list } = takeSims(doc, findAnalysis(doc)?.value ?? null);
    const label = file.replace(/\.asc$/i, '');
    if (!list.items.length) return [{ id: newId('s'), name: label, asc: serializeAsc(clean), runs: [] }];
    return list.items.map((s) => ({
      id: newId('s'),
      name: list.items.length > 1 ? `${label} · ${s.name ?? analysisLabel(s.line)}` : label,
      asc: serializeAsc(setAnalysisLine(clean, s.line)),
      ...(s.view ? { view: s.view } : {}),
      runs: [],
    }));
  });
  const base = takeSims(docs[0].doc, null).doc;
  return { id: newId('v'), name, base: serializeAsc(base), activeSim: sims[0]?.id ?? '', sims };
}

export interface Imported {
  project: Project;
  /** variantes agregadas */
  variants: string[];
  /** símbolos y modelos que llegaron (para sumarlos con mergeFiles, que pregunta los repetidos) */
  files: ProjectFile[];
}

/**
 * Agrega al proyecto lo que llegó: `entries` con su ruta (las de un zip, o archivos sueltos sin
 * carpeta). Con `zipName`, los .asc de la raíz forman una sola variante (con ese nombre);
 * sin él, cada .asc suelto es una variante.
 */
export function importEntries(p: Project, entries: ZipEntry[], zipName?: string): Imported {
  const groups = new Map<string, { name: string; doc: AscDoc }[]>();
  const files: ProjectFile[] = [];
  for (const e of entries) {
    const parts = e.path.split('/');
    const file = parts.pop()!;
    if (!file || file.startsWith('.') || parts.includes('__MACOSX')) continue;
    if (/\.asc$/i.test(file)) {
      const key = parts.length ? parts.join('/') : zipName ? `\0${zipName}` : `\0${file}`;
      const list = groups.get(key) ?? [];
      list.push({ name: file, doc: parseAsc(decode(e.data).text) });
      groups.set(key, list);
      continue;
    }
    const kind = projectFileKind(file);
    if (kind) files.push({ name: file, kind, text: decodeText(e.data) });
  }
  const taken = p.variants.map((v) => v.name);
  const added: Variant[] = [];
  for (const [key, docs] of groups) {
    const raw = key.startsWith('\0') ? key.slice(1).replace(/\.(zip|asc)$/i, '') : key.split('/').pop()!;
    const name = uniqueLabel(raw, taken);
    taken.push(name);
    added.push(variantFromAscs(docs, name));
  }
  const project = added.length ? { ...p, variants: [...p.variants, ...added], activeVariant: added[0].id, modified: Date.now() } : p;
  return { project, variants: added.map((v) => v.name), files };
}

// --- subcircuitos (#180) ------------------------------------------------------------------------

/**
 * Un subcircuito como .zip para LTspice u otro proyecto: su .asc y su .asy (un bloque jerárquico
 * de LTspice), los subcircuitos que usa adentro y los modelos que nombra.
 */
export function exportSubcktZip(p: Project, name: string, lib: SymbolSource): { name: string; bytes: Uint8Array } | null {
  const key = name.toLowerCase();
  const sch = p.files.find((f) => f.kind === 'schematic' && f.name.replace(/\.asc$/i, '').toLowerCase() === key);
  if (!sch) return null;
  const sym = p.files.filter((f) => f.kind === 'symbol' && f.name.replace(/\.asy$/i, '').toLowerCase() === key);
  const rest = usedFiles(p.files, [sch.text]).filter((f) => f !== sch && !sym.includes(f));
  const enc = new TextEncoder();
  const entry = (f: ProjectFile): ZipEntry => ({ path: f.name, data: f.kind === 'schematic' ? ascBytes(parseAsc(f.text), lib).bytes : enc.encode(f.text) });
  return { name: `${safeName(name)}.zip`, bytes: makeZip([sch, ...sym, ...rest].map(entry)) };
}

/**
 * Subcircuito suelto como netlist `.sub` para compartirlo (#199): su `.subckt` y los de los
 * subcircuitos que usa, en el dialecto de LTspice (como su netlist), sin los nombres internos
 * con «§». Los modelos de archivos quedan como `.lib archivo` (no se copian). Null si no existe
 * o no se puede netlistar.
 */
export function exportSubcktNetlist(p: Project, name: string, lib: SymbolSource): { name: string; text: string; warnings: string[] } | null {
  const sch = p.files.find((f) => f.kind === 'schematic' && f.name.replace(/\.asc$/i, '').toLowerCase() === name.toLowerCase());
  if (!sch) return null;
  const real = sch.name.replace(/\.asc$/i, '');
  // una instancia suelta: el netlister arma el .subckt con los puertos del símbolo
  const top: AscDoc = { ...emptyDoc(), symbols: [{ type: real, x: 0, y: 0, orient: 'R0', windows: new Map(), attrs: new Map([['InstName', 'X1']]) }] };
  const lt = ltNetlist(top, lib);
  if (!lt.blocks.some((b) => b.name.toLowerCase() === real.toLowerCase())) return null;
  // los anidados primero (como los deja el netlister), el pedido al final
  const text = ltNetlistText({ ...lt, elements: [], texts: [] });
  const body = text.slice(text.indexOf('.subckt')).replace(/\n\.backanno\n\.end$/, '');
  const lines = body
    .split('\n')
    .map((l) => l.replace(/\s*;§pnba .*$/, ''))
    // los comandos de simulación son del testbench, no del subcircuito
    .filter((l) => !/^\s*\.(op|tran|ac|dc|noise|tf|four|pz|sens|disto|step|meas|measure|save|options|option|probe|plot|print|wave|control|endc|net)\b/i.test(l))
    .map((l) => (/^[A-Za-z]\S*§/.test(l) ? l.replace(/^(\S*)/, (m) => m.replace(/§/g, '')) : l));
  return { name: `${safeName(real)}.sub`, text: [`* ${real}: subcircuit exported from TurboSpice`, ...lines].join('\n').replace(/\n+$/, '\n'), warnings: lt.warnings };
}

/**
 * Archivos para importar como subcircuitos: cada .asc es un subcircuito (esquemático), los .asy
 * sus símbolos y los .lib/.sub modelos. Un .asc sin su .asy recibe uno generado con sus puertos.
 */
export function subcktFilesFrom(entries: ZipEntry[], existing: ProjectFile[], makeSym: (name: string, asc: string) => ProjectFile): ProjectFile[] {
  const out: ProjectFile[] = [];
  for (const e of entries) {
    const name = baseName(e.path.replace(/\\/g, '/'));
    if (!name || name.startsWith('.')) continue;
    const text = decode(e.data).text;
    if (/\.asc$/i.test(name)) out.push({ name, kind: 'schematic', text });
    else {
      const kind = projectFileKind(name);
      if (kind) out.push({ name, kind, text });
    }
  }
  const hasSym = (n: string) => [...out, ...existing].some((f) => f.kind === 'symbol' && f.name.replace(/\.asy$/i, '').toLowerCase() === n.toLowerCase());
  for (const f of [...out]) {
    const n = f.name.replace(/\.asc$/i, '');
    if (f.kind === 'schematic' && !hasSym(n)) out.push(makeSym(n, f.text));
  }
  return out;
}
