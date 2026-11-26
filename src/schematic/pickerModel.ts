// Lo que muestra el buscador de componentes (P), sin React: la búsqueda en toda la biblioteca, el
// recorrido por carpetas de «Todos» y el orden de los resultados.
import { HIDDEN_SYMBOLS, PDK, type Classification } from '../library/categories.ts';

/** Carpetas que no aparecen en la búsqueda ni en las categorías (sólo entrando a mano); van al fondo */
const HIDDEN_DIRS = ['TCLib/Special/Characters', 'OpAmps'];
/** OpAmps de SPICE sin modelo (#309): están por compatibilidad; para diseños nuevos, los de la TCLib */
export const LEGACY_OPAMPS = 'OpAmps';
export const LEGACY_ALT = 'TCLib/OA_Ideal';
export const isLegacyOpAmp = (path: string) => path.startsWith(`${LEGACY_OPAMPS}/`);
/** `path` está en una carpeta oculta y no se está mirando esa carpeta (`dir`) */
const hiddenIn = (path: string, dir: string) => HIDDEN_DIRS.some((h) => (path === h || path.startsWith(`${h}/`)) && !(dir === h || dir.startsWith(`${h}/`)));

export const baseOf = (path: string) => path.split('/').pop() ?? path;
export const dirOf = (path: string) => path.split('/').slice(0, -1).join('/');

/** Las palabras de la búsqueda (en minúsculas, sin vacías) */
export const searchWords = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Qué tan bien coincide un componente con la búsqueda (menor = mejor; Infinity = no coincide).
 * Manda el nombre: igual, empieza con, contiene; después la carpeta, el nombre de sus categorías
 * (en el idioma de la interfaz: «regulador», «diodo») y por último la descripción. Con varias
 * palabras, todas tienen que aparecer y se suman.
 */
export function searchRank(path: string, desc: string, words: string[], categories = ''): number {
  const name = baseOf(path).toLowerCase();
  const dir = path.toLowerCase().slice(0, -name.length);
  const c = categories.toLowerCase();
  const d = desc.toLowerCase();
  let rank = 0;
  for (const w of words) {
    if (name === w) rank += 0;
    else if (name.startsWith(w)) rank += 1;
    else if (name.includes(w)) rank += 2;
    else if (dir.includes(w)) rank += 3;
    else if (c.includes(w)) rank += 4;
    else if (d.includes(w)) rank += 5;
    else return Infinity;
  }
  return rank;
}

/** Lo que se suma al puesto de un componente del PDK: van después de todos los demás */
const PDK_PENALTY = 1000;

export interface SearchResult {
  /** las rutas que coinciden, de la mejor a la peor */
  paths: string[];
  /** cuántos coinciden en cada categoría (sin acotar) */
  counts: Map<string, number>;
}

/**
 * Busca en toda la biblioteca (salvo HIDDEN_SYMBOLS y las carpetas ocultas, a menos que se esté mirando una en
 * «Todos», `dir`). Con `narrow`, sólo los de esa categoría; los del PDK van al final salvo que se
 * haya acotado al PDK. Los empates, en el orden curado de las categorías (Básicos primero).
 */
export function searchLibrary(paths: string[], query: string, descOf: (path: string) => string, cls: Classification, narrow: string | null = null, dir = ''): SearchResult {
  const words = searchWords(query);
  const counts = new Map<string, number>();
  if (!words.length) return { paths: [], counts };
  const found: { p: string; i: number; rank: number; order: number }[] = [];
  paths.forEach((p, i) => {
    if (hiddenIn(p, dir) || HIDDEN_SYMBOLS.includes(p)) return;
    const where = cls.placements(p);
    const rank = searchRank(p, descOf(p), words, where.map((w) => `${w.cat.label} ${w.sub.label}`).join(' '));
    if (!Number.isFinite(rank)) return;
    for (const id of new Set(where.map((w) => w.cat.id))) counts.set(id, (counts.get(id) ?? 0) + 1);
    if (narrow && !where.some((w) => w.cat.id === narrow)) return;
    const onlyPdk = where.length > 0 && where.every((w) => w.cat.id === PDK);
    found.push({ p, i, rank: rank + (onlyPdk && narrow !== PDK ? PDK_PENALTY : 0), order: cls.order(p) });
  });
  found.sort((a, b) => a.rank - b.rank || a.order - b.order || a.i - b.i);
  return { paths: found.map((x) => x.p), counts };
}

export type FolderItem = { kind: 'up' } | { kind: 'dir'; path: string } | { kind: 'sym'; path: string };

/**
 * «Todos»: lo que hay en la carpeta `dir` ('' = la raíz). Las subcarpetas primero (se abren),
 * después los componentes sueltos de la carpeta y, más abajo, todo el contenido de sus
 * subcarpetas. Las carpetas ocultas sólo se ven entrando a ellas y van al fondo.
 */
export function folderItems(paths: string[], dir: string): FolderItem[] {
  const prefix = dir ? `${dir}/` : '';
  const visible = paths.filter((p) => !hiddenIn(p, dir));
  const sym = (p: string): FolderItem => ({ kind: 'sym', path: p });
  const inside = paths.filter((p) => p.startsWith(prefix));
  const dirs = [
    ...new Set(
      inside
        .map((p) => p.slice(prefix.length))
        .filter((r) => r.includes('/'))
        .map((r) => prefix + r.split('/')[0]),
    ),
  ];
  const loose = inside.filter((p) => !p.slice(prefix.length).includes('/'));
  const nested = visible.filter((p) => p.startsWith(prefix) && p.slice(prefix.length).includes('/'));
  const folder = (d: string): FolderItem => ({ kind: 'dir', path: d });
  const hid = (d: string) => HIDDEN_DIRS.includes(d);
  return [...(dir ? [{ kind: 'up' } as const] : []), ...dirs.filter((d) => !hid(d)).map(folder), ...loose.map(sym), ...nested.map(sym), ...dirs.filter(hid).map(folder)];
}

/** Las partes del nombre que coinciden con alguna palabra de la búsqueda, para resaltarlas */
export function matchSpans(name: string, words: string[]): { text: string; hit: boolean }[] {
  const lower = name.toLowerCase();
  const hit = new Array<boolean>(name.length).fill(false);
  for (const w of words) {
    let i = lower.indexOf(w);
    while (w && i >= 0) {
      hit.fill(true, i, i + w.length);
      i = lower.indexOf(w, i + w.length);
    }
  }
  const out: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < name.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === hit[i]) last.text += name[i];
    else out.push({ text: name[i], hit: hit[i] });
  }
  return out;
}
