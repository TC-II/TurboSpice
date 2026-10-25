// Markers del visor, como en Cadence ViVA: puntos sobre una curva (M), líneas vertical (V) y
// horizontal (H) que miden donde cortan las curvas, y el par A/D con sus diferencias.
import { valueAt } from './measure.ts';

export type MarkerKind = 'm' | 'v' | 'h' | 'a' | 'd';
export type MarkerAxis = 'y' | 'i' | 'ph';

export interface Marker {
  kind: MarkerKind;
  /** número del marker dentro de su tipo (M1, M2, V1…; A y D son únicos) */
  id: number;
  /** panel donde está */
  pane: number;
  /** posición en X (M, V, A, D) */
  x?: number;
  /** nivel de la línea horizontal (H), en la escala `axis` */
  y?: number;
  axis?: MarkerAxis;
  /** curva (su etiqueta) sobre la que está el punto (M, A, D) */
  trace?: string;
}

/** Curva mínima que necesitan las cuentas */
export interface MarkCurve {
  label: string;
  y: ArrayLike<number | null>;
  axis: MarkerAxis;
  hidden?: boolean;
}

/** Nombre que se muestra: M1, V2, H1, A, D */
export const markerName = (m: Marker) => (m.kind === 'a' || m.kind === 'd' ? m.kind.toUpperCase() : `${m.kind.toUpperCase()}${m.id}`);

/** El próximo número libre para ese tipo */
export const nextId = (list: Marker[], kind: MarkerKind) => list.reduce((n, m) => (m.kind === kind ? Math.max(n, m.id) : n), 0) + 1;

/** Agrega un marker; A y D son únicos: uno nuevo reemplaza al anterior (como en ViVA) */
export function addMarker(list: Marker[], m: Omit<Marker, 'id'>): { list: Marker[]; added: Marker } {
  const single = m.kind === 'a' || m.kind === 'd';
  const added: Marker = { ...m, id: single ? 1 : nextId(list, m.kind) } as Marker;
  return { list: [...list.filter((o) => !(single && o.kind === m.kind)), added], added };
}

export const sameMarker = (a: Pick<Marker, 'kind' | 'id'>, b: Pick<Marker, 'kind' | 'id'>) => a.kind === b.kind && a.id === b.id;

/**
 * Markers después de sacar el panel `i` (los de ese panel se van, los de más abajo suben) o de
 * intercambiar dos paneles (`swap`).
 */
export function remapPanes(list: Marker[], op: { remove: number } | { swap: [number, number] }): Marker[] {
  if ('remove' in op) return list.filter((m) => m.pane !== op.remove).map((m) => (m.pane > op.remove ? { ...m, pane: m.pane - 1 } : m));
  const [a, b] = op.swap;
  return list.map((m) => (m.pane === a ? { ...m, pane: b } : m.pane === b ? { ...m, pane: a } : m));
}

/**
 * Curva bajo el mouse: la más cercana en vertical a `py` (px) en la columna del mouse, si está a
 * menos de `max` px. `toPy` pasa un valor de su escala a px.
 */
export function pickCurve(xs: ArrayLike<number>, curves: MarkCurve[], x: number, py: number, toPy: (v: number, axis: MarkerAxis) => number, max = 24): number {
  let best = -1;
  let dist = max;
  curves.forEach((c, k) => {
    if (c.hidden) return;
    const v = valueAt(xs, c.y, x);
    if (!Number.isFinite(v)) return;
    const d = Math.abs(toPy(v, c.axis) - py);
    if (d <= dist) [best, dist] = [k, d];
  });
  return best;
}

/** X donde la curva cruza el nivel (interpolación lineal; a lo sumo `limit`) */
export function crossings(xs: ArrayLike<number>, ys: ArrayLike<number | null>, level: number, limit = 64): number[] {
  const out: number[] = [];
  for (let k = 1; k < xs.length && out.length < limit; k++) {
    const y0 = ys[k - 1];
    const y1 = ys[k];
    if (y0 == null || y1 == null || !Number.isFinite(y0) || !Number.isFinite(y1)) continue;
    const a = y0 - level;
    const b = y1 - level;
    // (un punto justo en el nivel cuenta una vez: como final de un tramo, no como comienzo del siguiente)
    if (a === 0 && k > 1) continue;
    if (a === 0) out.push(xs[k - 1]);
    else if (b === 0 || (a < 0) !== (b < 0)) out.push(b === 0 ? xs[k] : xs[k - 1] + ((xs[k] - xs[k - 1]) * a) / (a - b));
  }
  return out;
}

/** Valor de un marker de punto (M, A, D) sobre su curva; NaN si la curva no está */
export function markerValue(m: Marker, xs: ArrayLike<number>, curves: MarkCurve[]): number {
  const c = curves.find((k) => k.label === m.trace);
  return c && m.x !== undefined ? valueAt(xs, c.y, m.x) : NaN;
}

/** Cortes de una línea vertical: el valor de cada curva visible en x */
export const verticalCuts = (x: number, xs: ArrayLike<number>, curves: MarkCurve[]) =>
  curves.filter((c) => !c.hidden).map((c) => ({ label: c.label, axis: c.axis, y: valueAt(xs, c.y, x) }));

/** Cortes de una línea horizontal: dónde la cruza cada curva visible de su misma escala */
export const horizontalCuts = (level: number, axis: MarkerAxis, xs: ArrayLike<number>, curves: MarkCurve[], limit = 64) =>
  curves.filter((c) => !c.hidden && c.axis === axis).flatMap((c) => crossings(xs, c.y, level, limit).map((x) => ({ label: c.label, x })));

/** Diferencias entre A y D: Δx, Δy, pendiente y 1/Δx */
export function delta(a: { x: number; y: number }, d: { x: number; y: number }) {
  const dx = d.x - a.x;
  const dy = d.y - a.y;
  return { dx, dy, slope: dx ? dy / dx : NaN, inv: dx ? 1 / Math.abs(dx) : NaN };
}

/** Markers válidos a partir de un JSON cualquiera (lo guardado en el .turbo) */
export function asMarkers(v: unknown): Marker[] {
  if (!Array.isArray(v)) return [];
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  return v.flatMap((m): Marker[] => {
    if (!m || typeof m !== 'object') return [];
    const o = m as Record<string, unknown>;
    if (!['m', 'v', 'h', 'a', 'd'].includes(o.kind as string) || !num(o.id) || !num(o.pane)) return [];
    const kind = o.kind as MarkerKind;
    if (kind === 'h' ? !num(o.y) : !num(o.x)) return [];
    if ((kind === 'm' || kind === 'a' || kind === 'd') && typeof o.trace !== 'string') return [];
    const axis = o.axis === 'i' || o.axis === 'ph' ? o.axis : 'y';
    return [{ kind, id: o.id, pane: o.pane, ...(num(o.x) ? { x: o.x } : {}), ...(kind === 'h' ? { y: o.y as number, axis } : {}), ...(typeof o.trace === 'string' ? { trace: o.trace } : {}) }];
  });
}
