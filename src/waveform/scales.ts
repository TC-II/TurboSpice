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
 * Zoom de la rueda: rango [min, max] escalado por `k` alrededor del punto a la fracción `f` del
 * área (0 = izquierda o abajo). En escala log todo va en décadas: el valor bajo el mouse queda
 * en el mismo lugar y el factor es el mismo en cualquier parte del eje (#299).
 */
export function zoomAt([min, max]: Range, f: number, k: number, log = false): Range {
  const t = (v: number) => (log ? Math.log10(v) : v);
  const at = t(min) + (t(max) - t(min)) * f;
  return zoomAbout(min, max, log ? 10 ** at : at, k, log);
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

/**
 * Rango del eje X tal cual (uPlot, en escala log, lo redondea hacia afuera a la década o a la
 * cifra entera: simulado hasta 3,7 MHz terminaba en 4 o 10 MHz, y cada zoom con la rueda saltaba).
 * Si min y max coinciden, media década a cada lado (log) o ±1 (lineal).
 */
export function exactRange(min: number | null, max: number | null, log = false): [number | null, number | null] {
  if (min == null || max == null) return [null, null];
  if (min !== max) return [min, max];
  return log ? [min / Math.sqrt(10), max * Math.sqrt(10)] : [min - 1, max + 1];
}

/**
 * Qué marcas de un eje log llevan número: las décadas; si en lo visible hay menos de dos,
 * también las de 2 y 5 (y si aun así hay menos de dos, todas), para que un zoom dentro de una
 * década no quede sin números.
 */
export function logLabeled(ticks: (number | null)[]): boolean[] {
  const mant = (t: number) => Math.round(t / 10 ** Math.floor(Math.log10(t) + 1e-9));
  const valid = (t: number | null): t is number => t != null && t > 0 && Number.isFinite(t);
  const isDec = (t: number) => Math.abs(Math.log10(t) - Math.round(Math.log10(t))) < 1e-9;
  const pick = (f: (t: number) => boolean) => ticks.map((t) => valid(t) && f(t));
  const count = (b: boolean[]) => b.filter(Boolean).length;
  const dec = pick(isDec);
  if (count(dec) >= 2) return dec;
  const d125 = pick((t) => isDec(t) || [2, 5].includes(mant(t)));
  return count(d125) >= 2 ? d125 : pick(() => true);
}

/** Paso «lindo» (1, 2, 2,5 o 5 por una potencia de 10) mayor o igual que `raw` */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw * (1 - 1e-12)) return m * p;
  return 10 * p;
}

/** sin el ruido de la coma flotante (0.30000000000000004 → 0.3) */
const clean = (v: number) => parseFloat(v.toPrecision(12));

/** Marcas cada `step` desde `from`: n divisiones, n + 1 marcas */
const steps = (from: number, step: number, n: number) => Array.from({ length: n + 1 }, (_, i) => clean(from + i * step));

export interface Aligned {
  /** divisiones de la grilla (iguales en las dos escalas) */
  n: number;
  left: Range;
  right: Range;
  leftTicks: number[];
  rightTicks: number[];
}

/**
 * Dos escalas Y (izquierda y derecha) con una sola grilla (#300): elige un número de divisiones
 * común y, para cada escala, un paso lindo y un rango (que contiene al pedido) de exactamente esas
 * divisiones, así las marcas de las dos caen en las mismas líneas. Entre las opciones, la que menos
 * agranda los rangos.
 */
export function alignScales(left: Range, right: Range, divs = [4, 5, 6, 7, 8]): Aligned {
  const fit = ([a, b]: Range, n: number) => {
    let s = niceStep((b - a) / n);
    for (let guard = 0; guard < 20; guard++) {
      const lo = Math.floor(clean(a / s)) * s;
      if (lo + n * s >= b - Math.abs(s) * 1e-9) {
        // lo que sobra, repartido (en pasos enteros) a los dos lados, sin cruzar el 0 si los
        // datos no lo cruzan
        const extra = Math.max(0, Math.floor((lo + n * s - b) / s / 2 + 1e-9));
        let from = lo - extra * s;
        if (a >= 0) from = Math.max(from, 0);
        if (b <= 0) from = Math.min(from, -n * s);
        return { from, s, waste: (n * s - (b - a)) / (n * s) };
      }
      s = niceStep(s * 1.000001);
    }
    return { from: a, s: (b - a) / n, waste: 0 };
  };
  let best: (Aligned & { score: number }) | null = null;
  for (const n of divs) {
    const l = fit(left, n);
    const r = fit(right, n);
    const score = l.waste + r.waste + 0.01 * Math.abs(n - 5);
    if (!best || score < best.score - 1e-12)
      best = {
        n,
        score,
        left: [clean(l.from), clean(l.from + n * l.s)],
        right: [clean(r.from), clean(r.from + n * r.s)],
        leftTicks: steps(l.from, l.s, n),
        rightTicks: steps(r.from, r.s, n),
      };
  }
  const { score: _s, ...out } = best!;
  return out;
}

/** Marcas lindas dentro de [min, max], unas `n` divisiones */
export function niceTicks(min: number, max: number, n: number): number[] {
  if (!(max > min)) return [min];
  const s = niceStep((max - min) / Math.max(1, n));
  const from = Math.ceil(clean(min / s)) * s;
  return steps(from, s, Math.floor(clean((max - from) / s)));
}

/** Las marcas `ticks` de la escala `from`, en las mismas posiciones de la escala `to` */
export function mapTicks(ticks: number[], from: Range, to: Range): number[] {
  const k = (to[1] - to[0]) / (from[1] - from[0]);
  return ticks.map((t) => clean(to[0] + (t - from[0]) * k));
}
