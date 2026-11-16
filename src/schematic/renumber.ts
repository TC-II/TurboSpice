// Reenumerar componentes: R1, R2… en orden de lectura (izquierda a derecha, de arriba hacia
// abajo) o en el orden en que se hace click. Sólo se tocan los nombres con el formato por omisión
// (letra del símbolo + número: R7, C12, Q3); un nombre propio (RL, R_2, Rload) queda como está.
import type { AscDoc } from '../asc/model.ts';
import type { Library } from '../library/library.ts';
import { nameLetter } from './edit.ts';
import { symbolBox } from './geometry.ts';

/** Diferencia de altura (en unidades del .asc) hasta la que dos componentes van en la misma fila */
const ROW = 48;

/** InstName efectivo del componente (el suyo o el que trae el símbolo) */
function instName(doc: AscDoc, i: number, lib: Library): string {
  const s = doc.symbols[i];
  return s.attrs.get('InstName') ?? lib.symbol(s.type)?.attrs.get('InstName') ?? '';
}

/** Letra con la que se numera el componente `i` si su nombre tiene el formato por omisión; si no, null */
export function renumberLetter(doc: AscDoc, i: number, lib: Library): string | null {
  const def = lib.symbol(doc.symbols[i].type);
  const letter = nameLetter(def);
  const m = /^([A-Za-z_]+)(\d+)$/.exec(instName(doc, i, lib));
  return m && m[1].toUpperCase() === letter.toUpperCase() ? letter : null;
}

/** Los componentes que se pueden reenumerar, en orden de lectura */
export function renumberable(doc: AscDoc, lib: Library): number[] {
  const items = doc.symbols.flatMap((s, i) => {
    if (renumberLetter(doc, i, lib) === null) return [];
    const b = symbolBox(s, lib.symbol(s.type), lib);
    return [{ i, x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 }];
  });
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  // filas: se agrupan los que están a casi la misma altura y cada fila va de izquierda a derecha
  const rows: (typeof items)[] = [];
  for (const it of items) {
    const row = rows[rows.length - 1];
    if (row && it.y - row[0].y <= ROW) row.push(it);
    else rows.push([it]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.x - b.x || a.y - b.y).map((it) => it.i));
}

/**
 * Numera de nuevo los componentes de `order` (índices de símbolos) en ese orden, 1, 2, 3… por
 * letra, sin repetir un nombre que ya use otro componente. Con `pending`, los reenumerables que no
 * están en `order` quedan como `R?` (el modo interactivo, mientras falta hacerles click).
 */
export function applyRenumber(doc: AscDoc, order: number[], lib: Library, pending = false): AscDoc {
  const touched = new Set(pending ? renumberable(doc, lib) : order);
  const taken = new Set(doc.symbols.flatMap((_, i) => (touched.has(i) ? [] : [instName(doc, i, lib).toUpperCase()])));
  const next = new Map<string, number>();
  const names = new Map<number, string>();
  for (const i of order) {
    const letter = renumberLetter(doc, i, lib);
    if (letter === null || names.has(i)) continue;
    let n = next.get(letter.toUpperCase()) ?? 1;
    while (taken.has(`${letter}${n}`.toUpperCase())) n++;
    names.set(i, `${letter}${n}`);
    next.set(letter.toUpperCase(), n + 1);
  }
  if (pending) for (const i of touched) if (!names.has(i)) names.set(i, `${renumberLetter(doc, i, lib)}?`);
  let changed = false;
  const symbols = doc.symbols.map((s, i) => {
    const name = names.get(i);
    if (name === undefined || name === instName(doc, i, lib)) return s;
    changed = true;
    const attrs = new Map(s.attrs);
    attrs.set('InstName', name);
    return { ...s, attrs };
  });
  return changed ? { ...doc, symbols } : doc;
}

/** Reenumera todo en orden de lectura */
export function renumberAll(doc: AscDoc, lib: Library): AscDoc {
  return applyRenumber(doc, renumberable(doc, lib), lib);
}

/**
 * Termina el modo interactivo: los que se clickearon, en ese orden; los que faltaron, después,
 * en orden de lectura.
 */
export function finishRenumber(doc: AscDoc, clicked: number[], lib: Library): AscDoc {
  const rest = renumberable(doc, lib).filter((i) => !clicked.includes(i));
  return applyRenumber(doc, [...clicked, ...rest], lib);
}
