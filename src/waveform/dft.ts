// DFT de una señal del transitorio: se muestrea a fs entre t₀ y t₁ (el paso de ngspice no es
// uniforme: se interpola linealmente), con ventana, espectro de amplitud de un solo lado y THD.
//
// La DFT es exacta para cualquier cantidad de muestras N (no hace falta una potencia de 2 ni se
// rellena con ceros): con N potencia de 2 se calcula con la FFT radix-2; si no, con el algoritmo
// de Bluestein (chirp-z), que lleva la DFT a una convolución hecha con FFT. Las dos son O(N log N).

import type { TraceDft } from './view.ts';

export type DftWindow = TraceDft['window'];

/** Ventanas con su nombre (en inglés: se traduce con t()) y el corto de la leyenda */
export const WINDOWS: [DftWindow, string, string][] = [
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

/**
 * Medio ancho del lóbulo principal de cada ventana, en bins: lo que se suma como potencia de un
 * tono (la fundamental, cada armónica)
 */
const LOBE: Record<DftWindow, number> = {
  rect: 1,
  bartlett: 2,
  hann: 2,
  hamming: 2,
  welch: 2,
  cosine: 2,
  tukey: 2,
  blackman: 3,
  gauss: 3,
  blackmanharris: 4,
  nuttall: 4,
  blackmannuttall: 4,
  kaiser: 4,
  flattop: 5,
};

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

function windowFn(w: DftWindow, n: number, N: number): number {
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

const isPow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;

/** FFT radix-2 en el lugar (re, im de largo potencia de 2); `inverse`: sin el 1/N */
function fftPow2(re: Float64Array, im: Float64Array, inverse = false): void {
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
  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * 2 * Math.PI) / len;
    const half = len >> 1;
    for (let k = 0; k < half; k++) {
      // (el giro de cada k, calculado directo: acumularlo pierde precisión en transformadas largas)
      const cr = Math.cos(ang * k);
      const ci = Math.sin(ang * k);
      for (let i = k; i < n; i += len) {
        const b = i + half;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[i] - tr;
        im[b] = im[i] - ti;
        re[i] += tr;
        im[i] += ti;
      }
    }
  }
}

/**
 * DFT en el lugar de cualquier largo: X[k] = Σ x[n]·e^(−2πi·kn/N). Radix-2 si N es potencia de 2;
 * si no, Bluestein: kn = (k² + n² − (k−n)²)/2 convierte la suma en una convolución con el chirp
 * e^(iπn²/N), que se hace con FFT de largo potencia de 2 ≥ 2N − 1.
 */
export function dft(re: Float64Array, im: Float64Array): void {
  const N = re.length;
  if (N <= 1) return;
  if (isPow2(N)) return fftPow2(re, im);
  let M = 1;
  while (M < 2 * N - 1) M <<= 1;
  // chirp w[n] = e^(−iπn²/N); n² módulo 2N para no perder precisión con N grande
  const wr = new Float64Array(N);
  const wi = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    const a = (Math.PI * ((n * n) % (2 * N))) / N;
    wr[n] = Math.cos(a);
    wi[n] = -Math.sin(a);
  }
  // a = x·w (con ceros hasta M); b = conj(w), simétrico (b[M−n] = b[n])
  const ar = new Float64Array(M);
  const ai = new Float64Array(M);
  const br = new Float64Array(M);
  const bi = new Float64Array(M);
  for (let n = 0; n < N; n++) {
    ar[n] = re[n] * wr[n] - im[n] * wi[n];
    ai[n] = re[n] * wi[n] + im[n] * wr[n];
    br[n] = wr[n];
    bi[n] = -wi[n];
    if (n) {
      br[M - n] = wr[n];
      bi[M - n] = -wi[n];
    }
  }
  fftPow2(ar, ai);
  fftPow2(br, bi);
  for (let k = 0; k < M; k++) {
    const r = ar[k] * br[k] - ai[k] * bi[k];
    ai[k] = ar[k] * bi[k] + ai[k] * br[k];
    ar[k] = r;
  }
  fftPow2(ar, ai, true);
  // X[k] = w[k]·c[k] / M (el 1/M de la inversa)
  for (let k = 0; k < N; k++) {
    const cr = ar[k] / M;
    const ci = ai[k] / M;
    re[k] = cr * wr[k] - ci * wi[k];
    im[k] = cr * wi[k] + ci * wr[k];
  }
}

const SI_PREFIX: Record<string, number> = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3, '': 1, k: 1e3, K: 1e3, M: 1e6, meg: 1e6, MEG: 1e6, Meg: 1e6, G: 1e9, T: 1e12 };

/**
 * Valor escrito en un campo con prefijo SI, como los muestra el visor: "1m" = 1e-3, "10M" = 10e6,
 * "2.5µs", "100kHz", "1e-3". La unidad (s, Hz) es opcional. null si no se entiende.
 */
export function parseSi(text: string): number | null {
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(meg|MEG|Meg|[fpnuµμmkKMGT]?)\s*(s|Hz|hz|S|V|A|dB|°)?\s*$/.exec(text);
  if (!m) return null;
  const v = parseFloat(m[1]) * SI_PREFIX[m[2]];
  return Number.isFinite(v) ? v : null;
}

/** Valor "lindo" (1, 2 o 5 × 10ⁿ) mayor o igual que x */
export function niceAbove(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return x;
  const p = 10 ** Math.floor(Math.log10(x));
  return ([1, 2, 5, 10].map((m) => m * p).find((v) => v >= x * (1 - 1e-12)) ?? 10 * p);
}

/**
 * Frecuencia de muestreo por omisión: la densidad de puntos que simuló ngspice en [from, to]
 * (puntos / duración), redondeada hacia arriba a 1, 2 o 5 × 10ⁿ: no se pierde lo simulado
 */
export function defaultFs(x: ArrayLike<number>, from: number, to: number): number {
  let n = 0;
  for (let k = 0; k < x.length; k++) if (x[k] >= from && x[k] <= to) n++;
  return niceAbove(Math.max(2, n) / (to - from));
}

/** Máximo de muestras de una DFT (memoria y tiempo razonables en el navegador) */
export const MAX_SAMPLES = 1 << 22;

/** Cantidad de muestras a fs en [from, to): de from en adelante cada 1/fs, mientras no pase de to */
export const sampleCount = (from: number, to: number, fs: number) => Math.floor((to - from) * fs * (1 + 1e-12)) || 0;

export interface Spectrum {
  freq: Float64Array;
  /** amplitud (pico) de cada componente */
  amp: Float64Array;
  /** cantidad de muestras, frecuencia de muestreo y tiempo de la primera */
  n: number;
  fs: number;
  from: number;
  window: DftWindow;
  /** ancho de banda equivalente de ruido de la ventana, en bins */
  enbw: number;
}

/** Muestras de y(x) cada 1/fs desde `from` (interpolación lineal; x creciente) */
export function sample(x: ArrayLike<number>, y: ArrayLike<number>, from: number, fs: number, n: number): Float64Array {
  const out = new Float64Array(n);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const t = from + k / fs;
    while (j < x.length - 2 && x[j + 1] < t) j++;
    const x0 = x[j];
    const x1 = x[j + 1] ?? x0;
    out[k] = x1 === x0 ? y[j] : y[j] + ((y[j + 1] - y[j]) * (t - x0)) / (x1 - x0);
  }
  return out;
}

/**
 * Espectro de amplitud de y(x): N = (to − from)·fs muestras cada 1/fs desde `from` (sin fs: la
 * densidad de la simulación), ventana y corrección por su ganancia coherente. Las frecuencias van
 * de 0 a fs/2 cada fs/N.
 */
export function spectrum(x: ArrayLike<number>, y: ArrayLike<number>, o: { from?: number; to?: number; fs?: number; window?: DftWindow } = {}): Spectrum {
  const from = o.from ?? x[0];
  const to = o.to ?? x[x.length - 1];
  const fs = o.fs ?? defaultFs(x, from, to);
  const N = sampleCount(from, to, fs);
  if (N < 2) throw new Error('Too few samples for the DFT: raise the sample rate or widen the range');
  if (N > MAX_SAMPLES) throw new Error('Too many samples for the DFT (more than 4 million): lower the sample rate or narrow the range');
  const re = sample(x, y, from, fs, N);
  const im = new Float64Array(N);
  const w = o.window ?? 'hann';
  // la continua se saca antes de la ventana (si no, se "derrama" sobre las frecuencias bajas)
  let mean = 0;
  for (let n = 0; n < N; n++) mean += re[n];
  mean /= N;
  let sw = 0;
  let sw2 = 0;
  for (let n = 0; n < N; n++) {
    const wn = windowFn(w, n, N);
    sw += wn;
    sw2 += wn * wn;
    re[n] = (re[n] - mean) * wn;
  }
  const cg = sw / N;
  dft(re, im);
  const half = Math.floor(N / 2) + 1;
  const freq = new Float64Array(half);
  const amp = new Float64Array(half);
  for (let k = 0; k < half; k++) {
    freq[k] = (k * fs) / N;
    // (el bin de Nyquist, con N par, no tiene pareja en las frecuencias negativas)
    const single = k === 0 || 2 * k === N ? 1 : 2;
    amp[k] = k === 0 ? Math.abs(mean) : (single * Math.hypot(re[k], im[k])) / (N * cg);
  }
  return { freq, amp, n: N, fs, from, window: w, enbw: (N * sw2) / (sw * sw) };
}

export interface Analysis {
  /** frecuencia (refinada entre bins) y amplitud de la fundamental */
  fundamental: number;
  amplitude: number;
  /** amplitudes de las armónicas 2, 3, … (las que caen arriba de fs/2 se pliegan) */
  harmonics: number[];
  /** THD en % */
  thd: number;
}

/**
 * Fundamental y THD a partir del espectro: la fundamental es la mayor componente fuera de la
 * continua; su potencia y la de cada armónica son las de sus lóbulos (corregidas por el ancho de
 * banda de ruido de la ventana, así el resultado no depende de la ventana).
 */
export function analyze(s: Spectrum, count = 10): Analysis {
  const L = LOBE[s.window];
  const n = s.amp.length;
  const p = (k: number) => (s.amp[k] * s.amp[k]) / 2;
  // bins ya contados: la continua, la fundamental y cada armónica
  const used = new Uint8Array(n);
  // la fundamental: la mayor componente sin la continua (que se sacó antes de la ventana); la
  // banda de la continua llega hasta L bins, pero sin pisar el lóbulo de una fundamental de pocos bins
  let k1 = Math.min(1, n - 1);
  for (let k = 2; k < n; k++) if (s.amp[k] > s.amp[k1]) k1 = k;
  for (let k = 0; k <= Math.max(0, Math.min(L, k1 - L - 1)); k++) used[k] = 1;
  /** potencia del lóbulo centrado en el bin c (sin los bins ya contados) */
  const lobe = (c: number) => {
    let sum = 0;
    for (let k = Math.max(0, c - L); k <= Math.min(n - 1, c + L); k++) {
      if (used[k]) continue;
      used[k] = 1;
      sum += p(k);
    }
    return sum / s.enbw;
  };
  // frecuencia de la fundamental, entre bins: centroide de la potencia del pico y sus dos vecinos
  // (exacto para un tono justo en un bin con cualquier ventana; no lo mueven la continua ni las
  // armónicas, que con un lóbulo ancho caerían dentro de uno más amplio)
  let kf = k1;
  {
    let w = 0;
    let m = 0;
    for (let k = Math.max(1, k1 - 1); k <= Math.min(n - 1, k1 + 1); k++) {
      w += p(k);
      m += p(k) * k;
    }
    if (w > 0) kf = m / w;
  }
  const ps = lobe(k1);
  const N = s.n;
  const harmonics: number[] = [];
  let ph = 0;
  for (let h = 2; h <= count; h++) {
    // plegada en [0, fs/2]
    let kh = (h * kf) % N;
    if (kh > N / 2) kh = N - kh;
    const c = Math.round(kh);
    if (c < 1 || c >= n || Math.abs(c - k1) <= L) {
      harmonics.push(0);
      continue;
    }
    const b = lobe(c);
    harmonics.push(Math.sqrt(2 * b));
    ph += b;
  }
  return { fundamental: (kf * s.fs) / N, amplitude: Math.sqrt(2 * ps), harmonics, thd: 100 * Math.sqrt(ph / ps) };
}
