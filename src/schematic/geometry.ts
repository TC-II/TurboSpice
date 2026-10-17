// Geometría del esquemático: cajas de símbolos, detección bajo el cursor, grilla.
import { GRID, type AscDoc, type Point, type SymbolDef, type SymbolInst, type Wire } from '../asc/model.ts';
import { toWorld } from '../asc/transform.ts';
import type { Library } from '../library/library.ts';

export const snap = (v: number) => Math.round(v / GRID) * GRID;
export const snapPoint = (p: Point): Point => ({ x: snap(p.x), y: snap(p.y) });

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const boxOf = (pts: Point[]): Box => ({
  x1: Math.min(...pts.map((p) => p.x)),
  y1: Math.min(...pts.map((p) => p.y)),
  x2: Math.max(...pts.map((p) => p.x)),
  y2: Math.max(...pts.map((p) => p.y)),
});

/** Caja local (sin orientar) del cuerpo de un símbolo: gráficos del .asy, pines y skin */
export function localBox(def: SymbolDef, skinViewBox?: string): Box {
  const pts: Point[] = [];
  for (const s of def.shapes) {
    const c = s.coords;
    pts.push({ x: c[0], y: c[1] }, { x: c[2], y: c[3] });
  }
  for (const p of def.pins) pts.push(p);
  if (skinViewBox) {
    const [x, y, w, h] = skinViewBox.split(/[\s,]+/).map(Number);
    pts.push({ x, y }, { x: x + w, y: y + h });
  }
  return pts.length ? boxOf(pts) : { x1: -16, y1: -16, x2: 16, y2: 16 };
}

/** Caja del símbolo ubicado en el esquemático */
export function symbolBox(inst: SymbolInst, def: SymbolDef | undefined, lib: Library): Box {
  if (!def) return { x1: inst.x - 16, y1: inst.y - 16, x2: inst.x + 16, y2: inst.y + 16 };
  const b = localBox(def, lib.skin(inst.type)?.viewBox);
  return boxOf([
    toWorld(inst, b.x1, b.y1),
    toWorld(inst, b.x2, b.y1),
    toWorld(inst, b.x1, b.y2),
    toWorld(inst, b.x2, b.y2),
  ]);
}

export function pinPoints(inst: SymbolInst, def: SymbolDef | undefined): Point[] {
  return def ? def.pins.map((p) => toWorld(inst, p.x, p.y)) : [];
}

export function distToSegment(p: Point, w: Wire): number {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - w.x1) * dx + (p.y - w.y1) * dy) / len2)) : 0;
  return Math.hypot(p.x - (w.x1 + t * dx), p.y - (w.y1 + t * dy));
}

export const inBox = (p: Point, b: Box, pad = 0) =>
  p.x >= b.x1 - pad && p.x <= b.x2 + pad && p.y >= b.y1 - pad && p.y <= b.y2 + pad;

export const boxesIntersect = (a: Box, b: Box) => a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1;

export type ItemRef =
  | { kind: 'symbol'; index: number }
  | { kind: 'wire'; index: number }
  | { kind: 'flag'; index: number }
  | { kind: 'text'; index: number };

export const sameRef = (a: ItemRef, b: ItemRef) => a.kind === b.kind && a.index === b.index;

/** Tamaño de letra (unidades del esquemático) para el índice de tamaño de LTspice */
export const FONT_SIZE = [8, 13, 20, 26, 32, 46, 65, 92];
export const fontSize = (i: number) => FONT_SIZE[Math.max(0, Math.min(7, Math.round(i)))] * 0.8;

/** Caja aproximada de un texto libre (TEXT) */
export function textBox(t: { x: number; y: number; size: number; text: string; align: string }): Box {
  const fs = fontSize(t.size);
  const lines = t.text.split('\\n');
  const w = Math.max(...lines.map((l) => l.length)) * fs * 0.6;
  const h = lines.length * fs * 1.2;
  const x1 = t.align === 'Right' ? t.x - w : t.align === 'Center' ? t.x - w / 2 : t.x;
  return { x1, y1: t.y - fs / 2, x2: x1 + w, y2: t.y - fs / 2 + h };
}

/**
 * Elemento bajo el cursor, en orden de prioridad: textos, etiquetas, cables, símbolos.
 * `tol` es la tolerancia en unidades del esquemático (depende del zoom).
 */
export function hitTest(doc: AscDoc, p: Point, lib: Library, tol: number): ItemRef | null {
  for (let i = doc.texts.length - 1; i >= 0; i--) if (inBox(p, textBox(doc.texts[i]), tol / 2)) return { kind: 'text', index: i };
  for (let i = doc.flags.length - 1; i >= 0; i--) {
    const f = doc.flags[i];
    if (Math.hypot(p.x - f.x, p.y - f.y) <= tol * 1.5) return { kind: 'flag', index: i };
  }
  let best: { i: number; d: number } | null = null;
  doc.wires.forEach((w, i) => {
    const d = distToSegment(p, w);
    if (d <= tol && (!best || d < best.d)) best = { i, d };
  });
  if (best) return { kind: 'wire', index: (best as { i: number }).i };
  for (let i = doc.symbols.length - 1; i >= 0; i--) {
    const s = doc.symbols[i];
    if (inBox(p, symbolBox(s, lib.symbol(s.type), lib), tol / 2)) return { kind: 'symbol', index: i };
  }
  return null;
}

/** Dirección desde la que llega el cable a un FLAG (para orientar tierra y rótulo, spec §8.7) */
export function flagDirection(doc: AscDoc, f: Point): 'top' | 'bottom' | 'left' | 'right' {
  const dirs = new Set<string>();
  for (const w of doc.wires) {
    for (const [a, b] of [
      [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }],
      [{ x: w.x2, y: w.y2 }, { x: w.x1, y: w.y1 }],
    ]) {
      if (a.x !== f.x || a.y !== f.y) continue;
      if (b.y < a.y) dirs.add('top');
      else if (b.y > a.y) dirs.add('bottom');
      else if (b.x < a.x) dirs.add('left');
      else if (b.x > a.x) dirs.add('right');
    }
  }
  if (dirs.size <= 1) return (dirs.values().next().value as 'top' | 'bottom' | 'left' | 'right') ?? 'top';
  if (!dirs.has('top')) return 'bottom';
  if (!dirs.has('bottom')) return 'top';
  if (!dirs.has('left')) return 'right';
  return 'left';
}
