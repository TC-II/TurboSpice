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


/**
 * Factor de zoom de un evento de la rueda (<1 acerca): proporcional a cuánto giró, así una rueda
 * fina (muchos eventos chicos) y una con muescas (pocos grandes) acercan lo mismo por vuelta.
 * Las líneas (Firefox) y las páginas se pasan a píxeles. `delta` reemplaza a deltaY.
 */
export function wheelZoom(e: { deltaY: number; deltaMode: number }, delta = e.deltaY): number {
  const px = delta * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1);
  return Math.exp(px * 0.0015);
}
