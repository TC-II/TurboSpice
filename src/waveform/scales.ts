// Escalas del visor: rangos de los ejes para el zoom (recuadro, rueda) sin tocar uPlot.

export type Range = [number, number];

/** Mínimo y máximo de los valores finitos de las curvas, con x dentro de [lo, hi]; null si no hay */
export function extent(x: ArrayLike<number>, ys: ArrayLike<number | null>[], lo = -Infinity, hi = Infinity): Range | null {
  let min = Infinity;
  let max = -Infinity;
  for (const y of ys)
    for (let k = 0; k < x.length; k++) {
      const v = y[k];
      if (v == null || !Number.isFinite(v) || x[k] < lo || x[k] > hi) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  return min <= max ? [min, max] : null;
}

/** Rango [min, max] escalado por `k` (<1 acerca) alrededor de `at`; en escala log, en décadas */
export function zoomAbout(min: number, max: number, at: number, k: number, log = false): Range {
  const [a, b, c] = log ? [Math.log10(min), Math.log10(max), Math.log10(at)] : [min, max, at];
  const lo = c - (c - a) * k;
  const hi = c + (b - c) * k;
  return log ? [10 ** lo, 10 ** hi] : [lo, hi];
}

/**
 * Rango [min, max] desplazado una fracción `f` de su ancho (paneo; en escala log, en décadas).
 * Con `bounds` no sale de esos límites: se frena en el borde manteniendo el ancho.
 */
export function panBy(min: number, max: number, f: number, log = false, bounds?: Range): Range {
  const t = (v: number) => (log ? Math.log10(v) : v);
  let [a, b] = [t(min), t(max)];
  const d = (b - a) * f;
  [a, b] = [a + d, b + d];
  if (bounds) {
    const [lo, hi] = [t(bounds[0]), t(bounds[1])];
    if (b - a >= hi - lo) [a, b] = [lo, hi];
    else if (a < lo) [a, b] = [lo, lo + (b - a)];
    else if (b > hi) [a, b] = [hi - (b - a), hi];
  }
  return log ? [10 ** a, 10 ** b] : [a, b];
}

/** Lo que pide un recuadro arrastrado sobre un gráfico de `w`×`h` px (cualquier unidad común) */
export interface BoxAxes {
  x: boolean;
  y: boolean;
}

/**
 * Ejes que acerca un recuadro. Un arrastre casi horizontal (o vertical) hace que uPlot
 * extienda el recuadro a todo el alto (o ancho): ese eje queda como está y se acerca sólo el
 * otro. Menos de `min` px en un eje = no se acerca ese eje (un click no hace nada).
 */
export function boxAxes(sel: { width: number; height: number }, w: number, h: number, min = 4): BoxAxes {
  const fullW = sel.width >= w - 1;
  const fullH = sel.height >= h - 1;
  return { x: sel.width >= min && !(fullW && !fullH), y: sel.height >= min && !(fullH && !fullW) };
}
