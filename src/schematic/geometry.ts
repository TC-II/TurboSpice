// Geometría del esquemático: cajas de símbolos, detección bajo el cursor, grilla.
import { GRID, WINDOW_ATTR, type AscDoc, type Point, type SymbolDef, type SymbolInst, type TextWindow, type Wire } from '../asc/model.ts';
import { effectiveAttrs, effectiveWindows } from '../asc/resolve.ts';
import { toWorld, transformAlign } from '../asc/transform.ts';
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
  return hitTestAll(doc, p, lib, tol)[0] ?? null;
}

/**
 * Todos los elementos bajo el cursor, en el mismo orden de prioridad que hitTest (para
 * alternar entre elementos superpuestos con clicks repetidos). Los cables, del más cercano.
 */
export function hitTestAll(doc: AscDoc, p: Point, lib: Library, tol: number): ItemRef[] {
  const out: ItemRef[] = [];
  for (let i = doc.texts.length - 1; i >= 0; i--) {
    // el programa de bloques del Estudio (";.study …") no se dibuja ni se selecciona
    if (doc.texts[i].kind === 'comment' && doc.texts[i].text.startsWith('.study ')) continue;
    if (inBox(p, textBox(doc.texts[i]), tol / 2)) out.push({ kind: 'text', index: i });
  }
  for (let i = doc.flags.length - 1; i >= 0; i--) if (inBox(p, flagBox(doc, doc.flags[i]), tol)) out.push({ kind: 'flag', index: i });
  doc.wires
    .map((w, i) => ({ i, d: distToSegment(p, w) }))
    .filter((x) => x.d <= tol)
    .sort((a, b) => a.d - b.d)
    .forEach((x) => out.push({ kind: 'wire', index: x.i }));
  for (let i = doc.symbols.length - 1; i >= 0; i--) {
    const s = doc.symbols[i];
    if (inBox(p, symbolBox(s, lib.symbol(s.type), lib), tol / 2)) out.push({ kind: 'symbol', index: i });
  }
  return out;
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

/**
 * Caja de una etiqueta o tierra, según hacia dónde queda el dibujo (opuesto al cable):
 * la tierra ocupa ±18 × 14 unidades; una etiqueta, su punto y el texto.
 */
export function flagBox(doc: AscDoc, f: { x: number; y: number; name: string }): Box {
  const dir = flagDirection(doc, f);
  // Caja local con el dibujo hacia +y (cable desde arriba), luego rotada según la dirección
  let local: Box;
  if (f.name === '0') local = { x1: -18, y1: -4, x2: 18, y2: 16 };
  else {
    const w = Math.max(16, f.name.length * fontSize(2) * 0.6);
    local = { x1: -w / 2, y1: -6, x2: w / 2, y2: 8 + fontSize(2) };
  }
  const rot = (x: number, y: number) =>
    dir === 'top' ? { x, y } : dir === 'bottom' ? { x: -x, y: -y } : dir === 'left' ? { x: y, y: -x } : { x: -y, y: x };
  const a = rot(local.x1, local.y1);
  const b = rot(local.x2, local.y2);
  // Las etiquetas con texto a izquierda/derecha se extienden horizontalmente
  if (f.name !== '0' && (dir === 'left' || dir === 'right')) {
    const w = Math.max(16, f.name.length * fontSize(2) * 0.6) + 10;
    const sx = dir === 'left' ? 1 : -1;
    return {
      x1: f.x + Math.min(0, sx * w) - 6,
      y1: f.y - fontSize(2) / 2 - 2,
      x2: f.x + Math.max(0, sx * w) + 6,
      y2: f.y + fontSize(2) / 2 + 2,
    };
  }
  return {
    x1: f.x + Math.min(a.x, b.x),
    y1: f.y + Math.min(a.y, b.y),
    x2: f.x + Math.max(a.x, b.x),
    y2: f.y + Math.max(a.y, b.y),
  };
}

/** Caja de un texto de una línea con alineación de LTspice (Left…VBottom) anclado en (x, y) */
export function alignedBox(x: number, y: number, align: string, size: number, len: number): Box {
  const fs = fontSize(size);
  const w = len * fs * 0.6;
  const h = fs;
  switch (align) {
    case 'Left':
      return { x1: x, y1: y - h / 2, x2: x + w, y2: y + h / 2 };
    case 'Right':
      return { x1: x - w, y1: y - h / 2, x2: x, y2: y + h / 2 };
    case 'Top':
      return { x1: x - w / 2, y1: y, x2: x + w / 2, y2: y + h };
    case 'Bottom':
      return { x1: x - w / 2, y1: y - h, x2: x + w / 2, y2: y };
    case 'VLeft':
      return { x1: x - h / 2, y1: y - w, x2: x + h / 2, y2: y };
    case 'VRight':
      return { x1: x - h / 2, y1: y, x2: x + h / 2, y2: y + w };
    case 'VCenter':
      return { x1: x - h / 2, y1: y - w / 2, x2: x + h / 2, y2: y + w / 2 };
    case 'VTop':
      return { x1: x, y1: y - w / 2, x2: x + h, y2: y + w / 2 };
    case 'VBottom':
      return { x1: x - h, y1: y - w / 2, x2: x, y2: y + w / 2 };
    default:
      return { x1: x - w / 2, y1: y - h / 2, x2: x + w / 2, y2: y + h / 2 };
  }
}

const HIDE_DEFAULT_VALUE = /^(QN|QP|MN|MP|JN|JP)$/i;

/** Rótulo visible (InstName, Value…) de un símbolo bajo el cursor: índice de WINDOW y su ventana local */
export function labelAt(doc: AscDoc, p: Point, lib: Library, tol: number): { sym: number; win: number; w: TextWindow } | null {
  for (let i = doc.symbols.length - 1; i >= 0; i--) {
    const inst = doc.symbols[i];
    const def = lib.symbol(inst.type);
    if (!def) continue;
    const attrs = effectiveAttrs(inst, def);
    for (const [idx, w] of effectiveWindows(inst, def, lib.windowDefaults)) {
      const key = WINDOW_ATTR[idx];
      const text = key && attrs.get(key);
      if (!text || w.align === 'Invisible') continue;
      if (idx === 3 && !inst.attrs.has('Value') && HIDE_DEFAULT_VALUE.test(attrs.get('Prefix') ?? '')) continue;
      const at = toWorld(inst, w.x, w.y);
      if (inBox(p, alignedBox(at.x, at.y, transformAlign(w.align, inst.orient), w.size, text.length), tol / 2)) return { sym: i, win: idx, w };
    }
  }
  return null;
}
