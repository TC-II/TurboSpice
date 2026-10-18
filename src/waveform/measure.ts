// Medidas rápidas sobre una traza (en el rango visible) y lectura en los cursores.

/** y(x) por interpolación lineal (x creciente); NaN fuera de rango */
export function valueAt(xs: ArrayLike<number>, ys: ArrayLike<number | null>, x: number): number {
  const n = xs.length;
  if (!n || x < xs[0] || x > xs[n - 1]) return NaN;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const y0 = ys[lo] ?? NaN;
  const y1 = ys[hi] ?? NaN;
  return xs[hi] === xs[lo] ? y0 : y0 + ((y1 - y0) * (x - xs[lo])) / (xs[hi] - xs[lo]);
}

/** Índice del punto de xs (creciente) más cercano a x */
export function nearestIndex(xs: ArrayLike<number>, x: number): number {
  const n = xs.length;
  if (n < 2 || x <= xs[0]) return 0;
  if (x >= xs[n - 1]) return n - 1;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  return x - xs[lo] <= xs[hi] - x ? lo : hi;
}

/** x del punto simulado que está n puntos a la derecha (n > 0) o a la izquierda (n < 0) de x */
export function stepPoint(xs: ArrayLike<number>, x: number, n: number): number {
  const len = xs.length;
  if (!len || !n) return x;
  let k = nearestIndex(xs, x);
  // si x cae entre dos puntos, el primer paso lleva al vecino en esa dirección
  if (n > 0 && xs[k] > x) n--;
  if (n < 0 && xs[k] < x) n++;
  k = Math.min(len - 1, Math.max(0, k + n));
  return xs[k];
}

export interface Stats {
  min: number;
  max: number;
  /** x donde está el máximo / mínimo */
  xMax: number;
  xMin: number;
  pp: number;
  /** promedio y valor eficaz ponderados por el paso (integral / intervalo) */
  avg: number;
  rms: number;
  /** frecuencia por cruces del valor medio (NaN si no es periódica en el rango) */
  freq: number;
}

export function stats(xs: ArrayLike<number>, ys: ArrayLike<number | null>, from = -Infinity, to = Infinity): Stats | null {
  let min = Infinity;
  let max = -Infinity;
  let xMin = NaN;
  let xMax = NaN;
  let area = 0;
  let area2 = 0;
  let span = 0;
  const idx: number[] = [];
  for (let k = 0; k < xs.length; k++) {
    const x = xs[k];
    const y = ys[k];
    if (x < from || x > to || y == null || !Number.isFinite(y)) continue;
    idx.push(k);
    if (y < min) [min, xMin] = [y, x];
    if (y > max) [max, xMax] = [y, x];
  }
  if (!idx.length) return null;
  for (let j = 1; j < idx.length; j++) {
    const [a, b] = [idx[j - 1], idx[j]];
    if (b !== a + 1) continue;
    const dx = xs[b] - xs[a];
    const ya = ys[a] as number;
    const yb = ys[b] as number;
    area += ((ya + yb) / 2) * dx;
    area2 += ((ya * ya + ya * yb + yb * yb) / 3) * dx;
    span += dx;
  }
  const avg = span ? area / span : (min + max) / 2;
  const rms = span ? Math.sqrt(area2 / span) : Math.abs(avg);
  // cruces ascendentes del valor medio
  const ups: number[] = [];
  for (let j = 1; j < idx.length; j++) {
    const ya = (ys[idx[j - 1]] as number) - avg;
    const yb = (ys[idx[j]] as number) - avg;
    if (ya < 0 && yb >= 0) ups.push(xs[idx[j - 1]] + ((xs[idx[j]] - xs[idx[j - 1]]) * -ya) / (yb - ya));
  }
  const freq = ups.length >= 3 ? (ups.length - 1) / (ups[ups.length - 1] - ups[0]) : NaN;
  return { min, max, xMin, xMax, pp: max - min, avg, rms, freq };
}

/** Frecuencia de corte a −3 dB respecto del máximo (traza en dB), buscando desde el pico */
export function bandwidth3dB(xs: ArrayLike<number>, db: ArrayLike<number | null>): { low: number; high: number } {
  let kMax = 0;
  for (let k = 1; k < xs.length; k++) if ((db[k] ?? -Infinity) > (db[kMax] ?? -Infinity)) kMax = k;
  const target = (db[kMax] as number) - 3;
  const cross = (k0: number, k1: number) => {
    const y0 = db[k0] as number;
    const y1 = db[k1] as number;
    // interpolación en escala logarítmica de frecuencia si se puede
    const t = (target - y0) / (y1 - y0);
    return xs[k0] > 0 && xs[k1] > 0 ? xs[k0] * (xs[k1] / xs[k0]) ** t : xs[k0] + t * (xs[k1] - xs[k0]);
  };
  let high = NaN;
  for (let k = kMax + 1; k < xs.length; k++) {
    if ((db[k] as number) <= target) {
      high = cross(k - 1, k);
      break;
    }
  }
  let low = NaN;
  for (let k = kMax - 1; k >= 0; k--) {
    if ((db[k] as number) <= target) {
      low = cross(k + 1, k);
      break;
    }
  }
  return { low, high };
}

/** CSV con el eje X y una columna por curva (separador coma, punto decimal) */
export function toCsv(xName: string, xs: ArrayLike<number>, cols: { name: string; ys: ArrayLike<number | null> }[]): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [[xName, ...cols.map((c) => c.name)].map(q).join(',')];
  for (let k = 0; k < xs.length; k++) {
    lines.push([xs[k], ...cols.map((c) => c.ys[k] ?? '')].map((v) => (typeof v === 'number' && !Number.isFinite(v) ? '' : String(v))).join(','));
  }
  return lines.join('\n') + '\n';
}
