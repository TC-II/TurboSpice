// Cuentas del editor de esquemáticos sobre el documento y la pantalla, sin React.
import { type AscDoc, type Point, type Shape, type DrawnShapeKind, type Wire } from '../asc/model.ts';
import type { Library } from '../library/library.ts';
import { boxesIntersect, distToSegment, pinPoints, snap, symbolBox, textBox, inlineEditable, visibleText, type Box, type ItemRef } from './geometry.ts';
import { shapeBox, shapeInBox } from './shapes.ts';
import { multiPinPrefix } from '../sim/traces.ts';
import { type Tool } from './editorTypes.ts';

/** ¿La corriente se mide por pin? (transistores de 3 o más pines y todos los subcircuitos) */
export const pinCurrents = (pins: number, prefix: string) => multiPinPrefix(prefix) && (pins >= 3 || /^X/i.test(prefix));

/**
 * Nodos del SVG desde los que paneo y zoom mueven el dibujo ya pintado (#186): con la CPU frenada
 * 4×, ~9.000 nodos costaban ~105 ms por cuadro; con menos de esto cabe en un cuadro.
 */
export const HEAVY_NODES = 1500;

/** Fin de un tramo horizontal o vertical desde `a`, según de qué lado de los 45° quede `b` */
export const orthoEnd = (a: Point, b: Point): Point => (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y });

/** Caja de un comentario sin justificación vertical (las verticales no se agrandan con la esquina) */
export const resizableBox = (t: AscDoc['texts'][number] | undefined) => (t && inlineEditable(t) && !t.align.startsWith('V') && t.align !== 'Invisible' ? textBox(t) : null);

export function docBox(doc: AscDoc, lib: Library, showSim: boolean): Box | null {
  const boxes: Box[] = [];
  for (const w of doc.wires) boxes.push({ x1: Math.min(w.x1, w.x2), y1: Math.min(w.y1, w.y2), x2: Math.max(w.x1, w.x2), y2: Math.max(w.y1, w.y2) });
  for (const s of doc.symbols) boxes.push(symbolBox(s, lib.symbol(s.type), lib));
  for (const f of doc.flags) boxes.push({ x1: f.x - 16, y1: f.y - 16, x2: f.x + 16, y2: f.y + 16 });
  for (const t of doc.texts) {
    const v = visibleText(t, showSim);
    if (v) boxes.push(textBox(v));
  }
  for (const s of doc.shapes) boxes.push(shapeBox(s));
  if (!boxes.length) return null;
  return {
    x1: Math.min(...boxes.map((b) => b.x1)),
    y1: Math.min(...boxes.map((b) => b.y1)),
    x2: Math.max(...boxes.map((b) => b.x2)),
    y2: Math.max(...boxes.map((b) => b.y2)),
  };
}

/** Elementos dentro de un recuadro de selección */
export function itemsIn(doc: AscDoc, b: Box, lib: Library, showSim: boolean): ItemRef[] {
  const out: ItemRef[] = [];
  doc.symbols.forEach((s, i) => boxesIntersect(symbolBox(s, lib.symbol(s.type), lib), b) && out.push({ kind: 'symbol', index: i }));
  doc.wires.forEach((w, i) => {
    const wb = { x1: Math.min(w.x1, w.x2), y1: Math.min(w.y1, w.y2), x2: Math.max(w.x1, w.x2), y2: Math.max(w.y1, w.y2) };
    if (boxesIntersect(wb, b)) out.push({ kind: 'wire', index: i });
  });
  doc.flags.forEach((f, i) => f.x >= b.x1 && f.x <= b.x2 && f.y >= b.y1 && f.y <= b.y2 && out.push({ kind: 'flag', index: i }));
  doc.texts.forEach((t, i) => {
    const v = visibleText(t, showSim);
    if (v && boxesIntersect(textBox(v), b)) out.push({ kind: 'text', index: i });
  });
  doc.shapes.forEach((s, i) => shapeInBox(s, b) && out.push({ kind: 'shape', index: i }));
  return out;
}

/** ¿Hay algo conectable en p? (pin, extremo de cable, etiqueta o cable que pasa) */
export function connectsAt(doc: AscDoc, p: Point, lib: Library): boolean {
  if (doc.flags.some((f) => f.x === p.x && f.y === p.y)) return true;
  if (doc.symbols.some((s) => pinPoints(s, lib.symbol(s.type)).some((q) => q.x === p.x && q.y === p.y))) return true;
  return doc.wires.some((w) => {
    const minx = Math.min(w.x1, w.x2);
    const maxx = Math.max(w.x1, w.x2);
    const miny = Math.min(w.y1, w.y2);
    const maxy = Math.max(w.y1, w.y2);
    const cross = (w.x2 - w.x1) * (p.y - w.y1) - (w.y2 - w.y1) * (p.x - w.x1);
    return cross === 0 && p.x >= minx && p.x <= maxx && p.y >= miny && p.y <= maxy;
  });
}

/** Punto de la grilla sobre un cable horizontal o vertical, el más cercano a p */
export function gridPointOnWire(w: Wire, p: Point): Point | null {
  if (w.y1 === w.y2 && w.x1 !== w.x2) return { x: Math.min(Math.max(snap(p.x), Math.min(w.x1, w.x2)), Math.max(w.x1, w.x2)), y: w.y1 };
  if (w.x1 === w.x2 && w.y1 !== w.y2) return { x: w.x1, y: Math.min(Math.max(snap(p.y), Math.min(w.y1, w.y2)), Math.max(w.y1, w.y2)) };
  return null;
}

/** ¿El codo en p es un extremo suelto? (arrastrarlo puede conectarlo a otra cosa) */
export function freeEnd(doc: AscDoc, p: Point): boolean {
  const at = doc.wires.filter((w) => (w.x1 === p.x && w.y1 === p.y) || (w.x2 === p.x && w.y2 === p.y));
  return at.length === 1 && !doc.wires.some((w) => w !== at[0] && distToSegment(p, w) === 0);
}

/** ¿El cable no toca nada en sus puntas (otro cable, un pin, una etiqueta)? */
export function looseWire(doc: AscDoc, index: number, lib: Library): boolean {
  const w = doc.wires[index];
  const pts = [
    { x: w.x1, y: w.y1 },
    { x: w.x2, y: w.y2 },
  ];
  const at = (p: Point, q: Point) => p.x === q.x && p.y === q.y;
  return pts.every((p) => freeEnd(doc, p) && !doc.flags.some((f) => at(f, p)) && !doc.symbols.some((s) => pinPoints(s, lib.symbol(s.type)).some((q) => at(q, p))));
}

/**
 * Figura a partir de los clicks de la herramienta: 'more' si faltan clicks, 'invalid' si el
 * último no sirve (un punto repetido, una caja sin ancho o alto).
 */
export function shapeFromClicks(kind: DrawnShapeKind, pts: Point[], style?: string): Shape | 'more' | 'invalid' {
  const [a, b, start, end] = pts;
  if (!b) return 'more';
  if (b.x === a.x && b.y === a.y) return 'invalid';
  const withStyle = (s: Shape): Shape => (style ? { ...s, style } : s);
  if (kind === 'LINE' || kind === 'RECTANGLE') return withStyle({ kind, coords: [a.x, a.y, b.x, b.y] });
  if (b.x === a.x || b.y === a.y) return 'invalid';
  if (kind === 'CIRCLE') return withStyle({ kind, coords: [a.x, a.y, b.x, b.y] });
  // el arco necesita además inicio y fin, distintos del centro
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const last = pts[pts.length - 1];
  if (pts.length > 2 && last.x === center.x && last.y === center.y) return 'invalid';
  if (!end) return 'more';
  // en el archivo va primero el FINAL y después el INICIO
  return withStyle({ kind, coords: [a.x, a.y, b.x, b.y, end.x, end.y, start.x, start.y] });
}

/**
 * Segundo click con M / S (#222): suelta lo que se está moviendo y termina ahí, sin estado
 * intermedio. Se confirma el fantasma (si lo hay), la herramienta vuelve a esperar qué mover y
 * la selección se vacía (no queda resaltado: sus índices tampoco sirven tras limpiar cables).
 */
export function dropMove<D>(tool: Tool & { kind: 'move' }, preview: D | null): { commit: D | null; tool: Tool; selection: ItemRef[] } {
  return { commit: preview, tool: { ...tool, refs: null, start: null }, selection: [] };
}

/** Posición de la cápsula: 16 px (de pantalla) del cursor, del lado que tenga lugar */
// el ancestro con posición en el que se ubica la cápsula (un <svg> no tiene offsetParent)
export function positionedAncestor(el: Element | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) if (getComputedStyle(p).position !== 'static') return p;
  return null;
}

export function tipStyle(tip: { x: number; y: number; w: number; h: number }): { left?: number; right?: number; top?: number; bottom?: number } {
  const OFF = 16;
  const right = tip.x < tip.w - 220;
  const below = tip.y < tip.h - 200;
  return {
    left: right ? tip.x + OFF : undefined,
    right: right ? undefined : tip.w - tip.x + OFF,
    top: below ? tip.y + OFF : undefined,
    bottom: below ? undefined : tip.h - tip.y + OFF,
  };
}
