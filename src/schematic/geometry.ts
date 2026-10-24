// Geometría del esquemático: cajas de símbolos, detección bajo el cursor, grilla.
import { GRID, WINDOW_ATTR, type AscDoc, type FlagDir, type Orient, type Point, type SchText, type SymbolDef, type SymbolInst, type TextWindow, type Wire } from '../asc/model.ts';
import { effectiveAttrs, effectiveWindows } from '../asc/resolve.ts';
import { toWorld, transformAlign, transformOffset } from '../asc/transform.ts';
import type { Library } from '../library/library.ts';
import { isDataText } from '../asc/dataText.ts';
import { EXTRA_ANALYSES, isControlBlock, isNgspiceComment } from '../netlist/directives.ts';
import { ANALYSIS_LINE } from '../sim/analyses.ts';
import { shapeDist } from './shapes.ts';
import { fromRkm, parseSpiceNumber } from '../netlist/spicenum.ts';
import { si } from '../waveform/series.ts';

/**
 * Lo que se dibuja de un texto, o null si no se dibuja nada. Los comentarios con datos nunca se
 * ven. Las directivas que se editan desde la interfaz (#48, #180) sólo se ven con `showSim`
 * (Ver › Mostrar las directivas): el comando de simulación (.tran, .ac… y los de ngspice
 * guardados como comentario, en la barra de Simular), .param y .step (en el panel del proyecto),
 * .meas, el .func del Estudio y los bloques .control (en el Estudio y Alt+C). Si comparten el texto
 * con otras directivas, se ocultan sólo sus líneas (y sus continuaciones «+»).
 */
const MANAGED_LINE = /^\s*;?\s*\.(param|step|meas|measure)\b/i;
const STUDY_FUNC = /^\s*;?\s*\.func\s+binary\s*\(/i;
export function visibleText<T extends SchText>(t: T, showSim: boolean): T | null {
  if (isDataText(t)) return null;
  if (showSim || !(t.kind === 'directive' || isNgspiceComment(t.text))) return t;
  if (isControlBlock(t.text)) return null;
  const lines = t.text.split('\\n');
  const shown: string[] = [];
  let hiding = false;
  for (const l of lines) {
    if (/^\s*\+/.test(l)) {
      if (!hiding) shown.push(l);
      continue;
    }
    hiding = ANALYSIS_LINE.test(l) || l === EXTRA_ANALYSES || MANAGED_LINE.test(l) || STUDY_FUNC.test(l);
    if (!hiding) shown.push(l);
  }
  if (shown.length === lines.length) return t;
  return shown.some((l) => l.trim()) ? { ...t, text: shown.join('\\n') } : null;
}

export const snap = (v: number) => Math.round(v / GRID) * GRID;
export const snapPoint = (p: Point): Point => ({ x: snap(p.x), y: snap(p.y) });
/** Grilla de los rótulos de texto (media grilla de LTspice) */
export const LABEL_GRID = 8;
export const snapLabel = (v: number) => Math.round(v / LABEL_GRID) * LABEL_GRID;

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

// Cachés de geometría por objeto (#188): los AscDoc, sus elementos y los SymbolDef de la librería
// no se modifican (cada edición arma objetos nuevos), y hitTest/labelAt corren en cada
// movimiento del mouse sobre todo el esquemático
const localBoxes = new WeakMap<SymbolDef, { vb?: string; box: Box }>();
const symbolBoxes = new WeakMap<SymbolInst, { def: SymbolDef; vb?: string; box: Box }>();

/** Caja local (sin orientar) del cuerpo de un símbolo: gráficos del .asy, pines y skin */
export function localBox(def: SymbolDef, skinViewBox?: string): Box {
  const c = localBoxes.get(def);
  if (c && c.vb === skinViewBox) return c.box;
  const box = computeLocalBox(def, skinViewBox);
  localBoxes.set(def, { vb: skinViewBox, box });
  return box;
}

function computeLocalBox(def: SymbolDef, skinViewBox?: string): Box {
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
  const vb = lib.skin(inst.type)?.viewBox;
  const c = symbolBoxes.get(inst);
  if (c && c.def === def && c.vb === vb) return c.box;
  const b = localBox(def, vb);
  const box = boxOf([
    toWorld(inst, b.x1, b.y1),
    toWorld(inst, b.x2, b.y1),
    toWorld(inst, b.x1, b.y2),
    toWorld(inst, b.x2, b.y2),
  ]);
  symbolBoxes.set(inst, { def, vb, box });
  return box;
}

/**
 * Origen de inserción para que el cursor `at` quede en el centro de la geometría
 * (líneas/formas/pines, sin textos ni skin) del símbolo orientado. Se corrige para
 * que los pines sigan cayendo sobre la grilla.
 */
export function placementOrigin(def: SymbolDef | undefined, orient: Orient, at: Point): Point {
  if (!def || (!def.shapes.length && !def.pins.length)) return at;
  const b = localBox(def);
  const c = transformOffset((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, orient);
  const o = { x: at.x - c.x, y: at.y - c.y };
  // referencia de grilla: el primer pin (o el origen si no tiene pines)
  const ref = def.pins.length ? toWorld({ ...o, orient }, def.pins[0].x, def.pins[0].y) : o;
  return { x: o.x + snap(ref.x) - ref.x + 0, y: o.y + snap(ref.y) - ref.y + 0 };
}

/**
 * Punto fijo para rotar/espejar más cercano a `c`: sólo sirven los puntos de la grilla de `ref`
 * y los centros de sus celdas (girar 90° alrededor de ellos deja la grilla sobre sí misma).
 * Los empates se resuelven siempre igual: grilla antes que centro de celda, después menor y,
 * después menor x.
 */
export function pivotNear(c: Point, ref: Point): Point {
  const cands: { p: Point; d: number; k: number }[] = [];
  for (const k of [0, GRID / 2]) {
    const bx = ref.x + k;
    const by = ref.y + k;
    for (const x of [Math.floor((c.x - bx) / GRID), Math.ceil((c.x - bx) / GRID)].map((i) => bx + i * GRID))
      for (const y of [Math.floor((c.y - by) / GRID), Math.ceil((c.y - by) / GRID)].map((i) => by + i * GRID))
        cands.push({ p: { x: x + 0, y: y + 0 }, d: (x - c.x) ** 2 + (y - c.y) ** 2, k });
  }
  cands.sort((a, b) => a.d - b.d || a.k - b.k || a.p.y - b.p.y || a.p.x - b.p.x);
  return cands[0].p;
}

/**
 * Punto fijo de un símbolo para rotar/espejar, en coordenadas locales (no depende de la
 * orientación, así que 4 rotaciones o 2 espejados lo devuelven exactamente al mismo lugar):
 * el centro de la geometría (sin textos ni skin) llevado al punto más cercano que deja los
 * pines sobre la grilla. Con una cantidad impar de tramos de grilla queda en uno de los puntos
 * vecinos, elegido de forma determinista.
 */
export function symbolPivot(def: SymbolDef): Point {
  const b = localBox(def);
  return pivotNear({ x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 }, def.pins[0] ?? { x: 0, y: 0 });
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

/**
 * Puntos de unión que dibuja LTspice: donde se juntan tres o más conexiones contando cada
 * extremo de cable y cada pin como una, y un cable que pasa por el medio como dos (una T
 * sobre el medio de un cable sí se marca; un pin contra el extremo de un cable, no).
 */
export function junctionPoints(doc: AscDoc, lib: Library): Point[] {
  const count = new Map<string, number>();
  const pts = new Map<string, Point>();
  const add = (p: Point) => {
    const k = `${p.x},${p.y}`;
    pts.set(k, p);
    count.set(k, (count.get(k) ?? 0) + 1);
  };
  const wires = doc.wires.filter((w) => w.x1 !== w.x2 || w.y1 !== w.y2);
  for (const w of wires) {
    add({ x: w.x1, y: w.y1 });
    add({ x: w.x2, y: w.y2 });
  }
  const wireEnds = new Set(count.keys());
  for (const s of doc.symbols) for (const p of pinPoints(s, lib.symbol(s.type))) add(p);
  // cables horizontales y verticales indexados por coordenada (los diagonales, aparte)
  const horiz = new Map<number, Wire[]>();
  const vert = new Map<number, Wire[]>();
  const diag: Wire[] = [];
  const push = (m: Map<number, Wire[]>, k: number, w: Wire) => (m.get(k) ?? m.set(k, []).get(k)!).push(w);
  for (const w of wires) {
    if (w.y1 === w.y2) push(horiz, w.y1, w);
    else if (w.x1 === w.x2) push(vert, w.x1, w);
    else diag.push(w);
  }
  const out: Point[] = [];
  for (const [k, p] of pts) {
    let n = count.get(k)!;
    let passes = false;
    for (const w of [...(horiz.get(p.y) ?? []), ...(vert.get(p.x) ?? []), ...diag]) {
      const cross = (w.x2 - w.x1) * (p.y - w.y1) - (w.y2 - w.y1) * (p.x - w.x1);
      const inside =
        cross === 0 &&
        p.x >= Math.min(w.x1, w.x2) && p.x <= Math.max(w.x1, w.x2) && p.y >= Math.min(w.y1, w.y2) && p.y <= Math.max(w.y1, w.y2) &&
        !(p.x === w.x1 && p.y === w.y1) && !(p.x === w.x2 && p.y === w.y2);
      if (inside) {
        n += 2;
        passes = true;
      }
    }
    if (n >= 3 && (passes || wireEnds.has(k))) out.push(p);
  }
  return out;
}

const fixedCache = new WeakMap<AscDoc, { lib: Library; rev: number; set: Set<string> }>();

/**
 * Pines y etiquetas ("x,y"): los extremos de cable ahí no son codos. Una vez por documento (los
 * AscDoc no se modifican): con todo seleccionado se consulta por cada extremo de cable (#183).
 */
export function fixedPoints(doc: AscDoc, lib: Library): Set<string> {
  const c = fixedCache.get(doc);
  if (c && c.lib === lib && c.rev === lib.rev) return c.set;
  const set = new Set(doc.flags.map((f) => `${f.x},${f.y}`));
  for (const s of doc.symbols) for (const q of pinPoints(s, lib.symbol(s.type))) set.add(`${q.x},${q.y}`);
  fixedCache.set(doc, { lib, rev: lib.rev, set });
  return set;
}

/**
 * Codo de cable bajo el cursor: extremo de cable a menos de `tol` que no está sobre un pin
 * ni una etiqueta (esos se mueven arrastrando el tramo).
 */
export function wireVertexAt(doc: AscDoc, p: Point, lib: Library, tol: number): Point | null {
  const fixed = fixedPoints(doc, lib);
  let best: Point | null = null;
  let bd = tol;
  for (const w of doc.wires) {
    for (const e of [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d <= bd && !fixed.has(`${e.x},${e.y}`)) [best, bd] = [e, d];
    }
  }
  return best;
}

export const inBox = (p: Point, b: Box, pad = 0) =>
  p.x >= b.x1 - pad && p.x <= b.x2 + pad && p.y >= b.y1 - pad && p.y <= b.y2 + pad;

export const boxesIntersect = (a: Box, b: Box) => a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1;

export type ItemRef =
  | { kind: 'symbol'; index: number }
  | { kind: 'wire'; index: number }
  | { kind: 'flag'; index: number }
  | { kind: 'text'; index: number }
  /** LINE, RECTANGLE, CIRCLE o ARC decorativo del esquemático */
  | { kind: 'shape'; index: number };

export const sameRef = (a: ItemRef, b: ItemRef) => a.kind === b.kind && a.index === b.index;

/** Tamaño de letra (unidades del esquemático) para el índice de tamaño de LTspice */
export const FONT_SIZE = [8, 13, 20, 26, 32, 46, 65, 92];
export const fontIndex = (i: number) => Math.max(0, Math.min(7, Math.round(i)));
export const fontSize = (i: number) => FONT_SIZE[fontIndex(i)] * 0.8;
/** Textos de menos de esto (px en pantalla) no se dibujan al alejar (#195) */
export const MIN_TEXT_PX = 3;
/** Cuántos tamaños de letra (desde el más chico) quedan ilegibles a esta escala: la clase lod-N del editor */
/** Tamaños de letra de los TEXT de LTspice (índice 0-7 del .asc) y su factor */
export const TEXT_SIZES = [0.625, 1, 1.5, 2, 2.5, 3.5, 5, 7];
/** Justificaciones de un TEXT del .asc (spec §7) */
export const TEXT_ALIGNS = ['Left', 'Center', 'Right', 'Top', 'Bottom', 'VLeft', 'VCenter', 'VRight', 'VTop', 'VBottom'];
/** Comentario común: se escribe y edita en el lugar (no los bloques .control, los de datos ni los de ngspice) */
export const inlineEditable = (t: SchText | undefined) => !!t && t.kind === 'comment' && !isControlBlock(t.text) && !isDataText(t) && !isNgspiceComment(t.text);
/** Índice de tamaño cuya letra mide lo más parecido a `fs` (unidades del esquemático) */
export const nearestFontIndex = (fs: number) => FONT_SIZE.reduce((best, _, i) => (Math.abs(fontSize(i) - fs) < Math.abs(fontSize(best) - fs) ? i : best), 0);
export const illegibleSizes = (scale: number) => FONT_SIZE.filter((_, i) => fontSize(i) * scale < MIN_TEXT_PX).length;

/** Caja aproximada de un texto libre (TEXT) */
export function textBox(t: { x: number; y: number; size: number; text: string; align: string }): Box {
  const fs = fontSize(t.size);
  const lines = t.text.split('\\n');
  const w = Math.max(...lines.map((l) => l.length)) * fs * 0.6;
  const h = lines.length * fs * 1.2;
  const x1 = t.align === 'Right' ? t.x - w : t.align === 'Center' ? t.x - w / 2 : t.x;
  return { x1, y1: t.y - fs / 2, x2: x1 + w, y2: t.y - fs / 2 + h };
}

/** Distancia (unidades) hasta la que un cable le gana a un símbolo bajo el cursor (#196) */
const WIRE_NEAR = 4;

/**
 * Elemento bajo el cursor, en orden de prioridad: textos, etiquetas, cables, símbolos, figuras.
 * `tol` es la tolerancia en unidades del esquemático (depende del zoom).
 */
export function hitTest(doc: AscDoc, p: Point, lib: Library, tol: number, showSim = true): ItemRef | null {
  return hitTestAll(doc, p, lib, tol, showSim)[0] ?? null;
}

/**
 * Todos los elementos bajo el cursor, en el mismo orden de prioridad que hitTest (para
 * alternar entre elementos superpuestos con clicks repetidos). Los cables, del más cercano.
 */
export function hitTestAll(doc: AscDoc, p: Point, lib: Library, tol: number, showSim = true): ItemRef[] {
  const out: ItemRef[] = [];
  for (let i = doc.texts.length - 1; i >= 0; i--) {
    // lo que no se dibuja (comentarios con datos, comando de simulación oculto) no se selecciona
    const t = visibleText(doc.texts[i], showSim);
    if (t && inBox(p, textBox(t), tol / 2)) out.push({ kind: 'text', index: i });
  }
  for (let i = doc.flags.length - 1; i >= 0; i--) if (inBox(p, flagBox(doc, doc.flags[i]), tol)) out.push({ kind: 'flag', index: i });
  const wires = doc.wires
    .map((w, i) => ({ i, d: distToSegment(p, w) }))
    .filter((x) => x.d <= tol)
    .sort((a, b) => a.d - b.d);
  // Alejado, la tolerancia (6 px en unidades del esquemático) abarca decenas de unidades: un cable
  // a esa distancia no le gana a un componente que está justo debajo del cursor (#196). Los
  // cables realmente cerca (hasta WIRE_NEAR) siguen primero, para poder agarrarlos sobre el símbolo.
  const wireOf = (x: { i: number }): ItemRef => ({ kind: 'wire', index: x.i });
  for (const x of wires) if (x.d <= WIRE_NEAR) out.push(wireOf(x));
  const under: ItemRef[] = [];
  for (let i = doc.symbols.length - 1; i >= 0; i--) {
    const s = doc.symbols[i];
    const box = symbolBox(s, lib.symbol(s.type), lib);
    if (inBox(p, box, 0)) under.push({ kind: 'symbol', index: i });
    else if (inBox(p, box, tol / 2)) out.push({ kind: 'symbol', index: i });
  }
  out.push(...under);
  for (const x of wires) if (x.d > WIRE_NEAR) out.push(wireOf(x));
  // las figuras, al final: sólo por su trazo, la última dibujada primero
  for (let i = doc.shapes.length - 1; i >= 0; i--) if (shapeDist(doc.shapes[i], p) <= tol) out.push({ kind: 'shape', index: i });
  // una imagen de fondo se elige también por adentro, después de todo lo demás
  for (let i = doc.shapes.length - 1; i >= 0; i--) {
    const [x1, y1, x2, y2] = doc.shapes[i].coords;
    if (doc.shapes[i].kind === 'IMAGE' && !out.some((r) => r.kind === 'shape' && r.index === i) && inBox(p, { x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) }, 0))
      out.push({ kind: 'shape', index: i });
  }
  return out;
}

const wireEndIndex = new WeakMap<Wire[], Map<string, Set<string>>>();

/** Extremo de cable ("x,y") → hacia dónde sale cada cable desde ahí (una vez por lista de cables) */
function wireEnds(wires: Wire[]): Map<string, Set<string>> {
  let m = wireEndIndex.get(wires);
  if (m) return m;
  m = new Map();
  for (const w of wires) {
    for (const [a, b] of [
      [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }],
      [{ x: w.x2, y: w.y2 }, { x: w.x1, y: w.y1 }],
    ]) {
      const dir = b.y < a.y ? 'top' : b.y > a.y ? 'bottom' : b.x < a.x ? 'left' : b.x > a.x ? 'right' : '';
      if (!dir) continue;
      const k = `${a.x},${a.y}`;
      let set = m.get(k);
      if (!set) m.set(k, (set = new Set()));
      set.add(dir);
    }
  }
  wireEndIndex.set(wires, m);
  return m;
}

/** Dirección desde la que llega el cable a un FLAG (para orientar tierra y rótulo, spec §8.7) */
export function flagDirection(doc: AscDoc, f: Point): FlagDir {
  const dirs = wireEnds(doc.wires).get(`${f.x},${f.y}`) ?? new Set<string>();
  if (dirs.size <= 1) return (dirs.values().next().value as FlagDir) ?? 'top';
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

const VALUE_UNIT: Record<string, string> = { R: 'Ω', C: 'F', L: 'H', V: 'V', I: 'A' };

/**
 * Cómo se ve el valor de un R, C o L en el esquemático: con prefijo SI y unidad (10Meg → 10MΩ,
 * 4k7 → 4.7kΩ, 1u → 1µF). Sólo si es un número solo; expresiones y demás, tal cual (#73).
 */
export function displayValue(prefix: string, value: string): string {
  const unit = VALUE_UNIT[prefix.toUpperCase()];
  const v = value.trim();
  if (!unit || !v || /\s/.test(v)) return value;
  const x = parseSpiceNumber(fromRkm(v) ?? v);
  return Number.isFinite(x) ? `${si(x, 6)}${unit}` : value;
}

/** Rótulo visible (InstName, Value…) de un símbolo bajo el cursor: índice de WINDOW y su ventana local */
export function labelAt(doc: AscDoc, p: Point, lib: Library, tol: number, hidden = 0): { sym: number; win: number; w: TextWindow } | null {
  for (let i = doc.symbols.length - 1; i >= 0; i--) {
    const inst = doc.symbols[i];
    const def = lib.symbol(inst.type);
    if (!def) continue;
    // (`hidden`: los rótulos de los primeros tamaños no se dibujan por ilegibles, no se agarran: #196)
    for (const l of labelBoxes(inst, def, lib)) if (fontIndex(l.w.size) >= hidden && inBox(p, l.box, tol / 2)) return { sym: i, win: l.win, w: l.w };
  }
  return null;
}

const labelCache = new WeakMap<SymbolInst, { def: SymbolDef; wd: Library['windowDefaults']; labels: { win: number; w: TextWindow; box: Box }[] }>();

/** Cajas de los rótulos visibles de un símbolo (una vez por instancia, #188) */
function labelBoxes(inst: SymbolInst, def: SymbolDef, lib: Library) {
  const c = labelCache.get(inst);
  if (c && c.def === def && c.wd === lib.windowDefaults) return c.labels;
  const labels: { win: number; w: TextWindow; box: Box }[] = [];
  const attrs = effectiveAttrs(inst, def);
  for (const [idx, w] of effectiveWindows(inst, def, lib.windowDefaults)) {
    const key = WINDOW_ATTR[idx];
    const raw = key && attrs.get(key);
    if (!raw || w.align === 'Invisible') continue;
    const text = idx === 3 ? displayValue(attrs.get('Prefix') ?? '', raw) : raw;
    if (idx === 3 && !inst.attrs.has('Value') && HIDE_DEFAULT_VALUE.test(attrs.get('Prefix') ?? '')) continue;
    const at = toWorld(inst, w.x, w.y);
    labels.push({ win: idx, w, box: alignedBox(at.x, at.y, transformAlign(w.align, inst.orient), w.size, text.length) });
  }
  labelCache.set(inst, { def, wd: lib.windowDefaults, labels });
  return labels;
}
