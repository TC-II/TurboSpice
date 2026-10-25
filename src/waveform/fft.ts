// FFT de una señal del transitorio (paso de tiempo no uniforme → se remuestrea), con ventana,
// espectro de amplitud de un solo lado y THD.

import type { PaneFft } from './view.ts';

export type FftWindow = PaneFft['window'];

/** Ventanas con su nombre (en inglés: se traduce con t()) y el corto de la leyenda */
export const WINDOWS: [FftWindow, string, string][] = [
  ['hann', 'Hann Window', 'Hann'],
  ['hamming', 'Hamming Window', 'Hamming'],
  ['blackman', 'Blackman Window', 'Blackman'],
  ['blackmanharris', 'Blackman-Harris Window', 'Blackman-Harris'],
  ['nuttall', 'Nuttall Window', 'Nuttall'],
  ['blackmannuttall', 'Blackman-Nuttall Window', 'Blackman-Nuttall'],
  ['flattop', 'Flat Top Window', 'Flat top'],
  ['bartlett', 'Bartlett (triangular) Window', 'Bartlett'],
  ['welch', 'Welch Window', 'Welch'],
  ['cosine', 'Cosine Window', 'Cosine'],
  ['gauss', 'Gaussian Window (σ = 0.4)', 'Gauss'],
  ['kaiser', 'Kaiser Window (β = 9)', 'Kaiser'],
  ['tukey', 'Tukey Window (α = 0.5)', 'Tukey'],
  ['rect', 'Rectangular Window', 'Rectangular'],
];

/** Bessel modificada de primera especie, orden 0 (para la ventana de Kaiser) */
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  for (let k = 1; k < 50; k++) {
    term *= (x / (2 * k)) ** 2;
    sum += term;
    if (term < sum * 1e-16) break;
  }
  return sum;
}
const KAISER_BETA = 9;
const KAISER_NORM = besselI0(KAISER_BETA);
const GAUSS_SIGMA = 0.4;
const TUKEY_ALPHA = 0.5;

/** Suma de cosenos a0 − a1·cos(a) + a2·cos(2a) − a3·cos(3a) + … (familia Blackman) */
const cosines = (a: number, c: number[]) => c.reduce((s, ck, k) => s + (k % 2 ? -1 : 1) * ck * Math.cos(k * a), 0);

function windowFn(w: FftWindow, n: number, N: number): number {
  const a = (2 * Math.PI * n) / (N - 1);
  // posición en la ventana, de −1 a 1
  const u = (2 * n) / (N - 1) - 1;
  switch (w) {
    case 'rect':
      return 1;
    case 'hann':
      return 0.5 - 0.5 * Math.cos(a);
    case 'hamming':
      return 0.54 - 0.46 * Math.cos(a);
    case 'blackman':
      return 0.42 - 0.5 * Math.cos(a) + 0.08 * Math.cos(2 * a);
    case 'blackmanharris':
      return cosines(a, [0.35875, 0.48829, 0.14128, 0.01168]);
    case 'nuttall':
      return cosines(a, [0.355768, 0.487396, 0.144232, 0.012604]);
    case 'blackmannuttall':
      return cosines(a, [0.3635819, 0.4891775, 0.1365995, 0.0106411]);
    case 'flattop':
      return 0.21557895 - 0.41663158 * Math.cos(a) + 0.277263158 * Math.cos(2 * a) - 0.083578947 * Math.cos(3 * a) + 0.006947368 * Math.cos(4 * a);
    case 'bartlett':
      return 1 - Math.abs(u);
    case 'welch':
      return 1 - u * u;
    case 'cosine':
      return Math.sin((Math.PI * n) / (N - 1));
    case 'gauss':
      return Math.exp(-0.5 * (u / GAUSS_SIGMA) ** 2);
    case 'kaiser':
      return besselI0(KAISER_BETA * Math.sqrt(Math.max(0, 1 - u * u))) / KAISER_NORM;
    case 'tukey': {
      const x = n / (N - 1);
      if (x < TUKEY_ALPHA / 2) return 0.5 * (1 - Math.cos((2 * Math.PI * x) / TUKEY_ALPHA));
      if (x > 1 - TUKEY_ALPHA / 2) return 0.5 * (1 - Math.cos((2 * Math.PI * (1 - x)) / TUKEY_ALPHA));
      return 1;
    }
  }
}

/** FFT radix-2 en el lugar (re, im de largo potencia de 2) */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

export interface Spectrum {
  freq: Float64Array;
  /** amplitud (pico) de cada componente */
  amp: Float64Array;
  /** cantidad de puntos y frecuencia de muestreo usados */
  n: number;
  fs: number;
}

/**
 * Espectro de amplitud de y(x) en [from, to]: remuestreo uniforme a `points` (potencia de 2),
 * ventana y corrección por la ganancia coherente de la ventana.
 */
export function spectrum(x: ArrayLike<number>, y: ArrayLike<number>, o: { from?: number; to?: number; points?: number; window?: FftWindow } = {}): Spectrum {
  const from = o.from ?? x[0];
  const to = o.to ?? x[x.length - 1];
  let inRange = 0;
  for (let k = 0; k < x.length; k++) if (x[k] >= from && x[k] <= to) inRange++;
  const N = o.points ?? Math.min(1 << 16, Math.max(1024, 1 << Math.ceil(Math.log2(Math.max(2, inRange)))));
  const dt = (to - from) / N;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const w = o.window ?? 'hann';
  let j = 0;
  for (let n = 0; n < N; n++) {
    const t = from + n * dt;
    while (j < x.length - 2 && x[j + 1] < t) j++;
    const x0 = x[j];
    const x1 = x[j + 1] ?? x0;
    re[n] = x1 === x0 ? y[j] : y[j] + ((y[j + 1] - y[j]) * (t - x0)) / (x1 - x0);
  }
  // la continua se saca antes de la ventana (si no, se "derrama" sobre las frecuencias bajas)
  const mean = re.reduce((a, b) => a + b, 0) / N;
  let cg = 0;
  for (let n = 0; n < N; n++) {
    const wn = windowFn(w, n, N);
    cg += wn;
    re[n] = (re[n] - mean) * wn;
  }
  cg /= N;
  fftInPlace(re, im);
  const half = N / 2;
  const freq = new Float64Array(half);
  const amp = new Float64Array(half);
  const fs = 1 / dt;
  for (let k = 0; k < half; k++) {
    freq[k] = (k * fs) / N;
    amp[k] = k === 0 ? Math.abs(mean) : (2 * Math.hypot(re[k], im[k])) / (N * cg);
  }
  return { freq, amp, n: N, fs };
}

export interface Thd {
  fundamental: number;
  amplitude: number;
  /** amplitudes de las armónicas 2, 3, … */
  harmonics: number[];
  /** THD en % */
  thd: number;
}

/** THD a partir del espectro: fundamental = mayor componente (sin continua) */
export function thd(s: Spectrum, count = 10): Thd {
  // el pico de una componente se reparte en bins vecinos por la ventana: se toma el máximo cercano
  const peak = (k: number) => {
    let m = 0;
    for (let i = Math.max(1, k - 2); i <= Math.min(s.amp.length - 1, k + 2); i++) m = Math.max(m, s.amp[i]);
    return m;
  };
  let k1 = 1;
  for (let k = 2; k < s.amp.length; k++) if (s.amp[k] > s.amp[k1]) k1 = k;
  const harmonics: number[] = [];
  for (let h = 2; h <= count && h * k1 < s.amp.length - 2; h++) harmonics.push(peak(h * k1));
  const a1 = peak(k1);
  return { fundamental: s.freq[k1], amplitude: a1, harmonics, thd: (100 * Math.sqrt(harmonics.reduce((a, b) => a + b * b, 0))) / a1 };
}
