// Ida y vuelta con LTspice (#157). Exportar una variante: un .zip con un .asc por simulación (el
// circuito actual, sin historial) y los archivos del proyecto que usan. Exportar todo: un .zip con
// una carpeta por variante. Importar: un .zip (cada carpeta, y la raíz, es una variante con una
// simulación por .asc) o varios archivos sueltos (cada .asc, una variante); los .asy/.lib/.sub
// van a los archivos del proyecto.
import { decode } from '../asc/encoding.ts';
import { baseName, type AscDoc } from '../asc/model.ts';
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
  const syms = files.filter((f) => f.kind === 'symbol' && types.has(f.name.replace(/\.asy$/i, '').toLowerCase()));
  const hay = [...ascTexts, ...syms.map((s) => s.text)].join('\n').toLowerCase();
  return [...syms, ...files.filter((f) => f.kind === 'model' && hay.includes(f.name.toLowerCase()))];
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
  return { name: `${safeName(p.name)} - ${safeName(v.name)}.zip`, bytes: makeZip(variantEntries(p, v, lib)) };
}

export function exportAllZip(p: Project, lib: SymbolSource): { name: string; bytes: Uint8Array } {
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
    if (kind) files.push({ name: file, kind, text: decode(e.data).text });
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
