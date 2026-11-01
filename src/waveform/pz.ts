// Polos y ceros (.pz): raíces de cada corrida, f₀, Q, ζ y τ, escalas del plano s.
import type { SimPlot } from '../engine/ngspice.ts';
import { si } from './series.ts';
import { t } from '../i18n/i18n.ts';

export const PZ_VECTOR = /^(pole|zero)\(\d+\)$/i;
export const isPzPlot = (p: SimPlot) => p.vectors.some((v) => PZ_VECTOR.test(v.name));

export interface Root {
  kind: 'pole' | 'zero';
  /** número de polo/cero en la corrida ("pole(2)" → 2) */
  n: number;
  re: number;
  im: number;
  /** índice de la corrida (.step) */
  run: number;
}

/** Corridas de .pz a superponer (pz1…pzN de un .step); [plot] si es una sola */
export function pzRuns(plots: SimPlot[], plot: SimPlot): SimPlot[] {
  const m = /^([a-z]+)\d+$/i.exec(plot.name);
  if (!m) return [plot];
  const runs = plots.filter((p) => new RegExp(`^${m[1]}\\d+$`, 'i').test(p.name) && isPzPlot(p));
  return runs.length > 1 ? runs : [plot];
}

/** Polos primero y luego ceros, cada grupo por corrida y por |s| */
export function pzRoots(runs: SimPlot[]): Root[] {
  return runs
    .flatMap((plot, run) =>
      plot.vectors
        .filter((v) => PZ_VECTOR.test(v.name))
        .flatMap((v) =>
          Array.from(v.real, (re, i) => ({
            kind: (/^pole/i.test(v.name) ? 'pole' : 'zero') as Root['kind'],
            n: Number(v.name.replace(/\D/g, '')),
            re,
            im: v.imag?.[i] ?? 0,
            run,
          })),
        ),
    )
    .sort((a, b) => (a.kind !== b.kind ? (a.kind === 'pole' ? -1 : 1) : a.run - b.run || Math.hypot(a.re, a.im) - Math.hypot(b.re, b.im) || a.n - b.n));
}

export interface RootInfo {
  /** ω₀ = |s| [rad/s] */
  w0: number;
  f0: number;
  /** amortiguamiento ζ = −σ/ω₀ (1 para una raíz real negativa) */
  zeta: number;
  /** Q = 1/(2ζ), sólo para pares complejos */
  q: number;
  /** constante de tiempo 1/|σ| */
  tau: number;
}

export function rootInfo(r: { re: number; im: number }): RootInfo {
  const w0 = Math.hypot(r.re, r.im);
  return {
    w0,
    f0: w0 / (2 * Math.PI),
    zeta: w0 ? -r.re / w0 : NaN,
    q: r.im !== 0 && r.re !== 0 ? w0 / (2 * Math.abs(r.re)) : NaN,
    tau: r.re !== 0 ? 1 / Math.abs(r.re) : Infinity,
  };
}

/** Raíz en el semiplano derecho (con tolerancia numérica) */
export const unstable = (r: Root) => r.kind === 'pole' && r.re > 1e-9 * Math.hypot(r.re, r.im);

/** Frecuencias f₀ distintas de polos y ceros (un par conjugado es una sola), para marcar en el Bode */
export function pzMarks(roots: Root[]): { f: number; kind: Root['kind'] }[] {
  const out: { f: number; kind: Root['kind'] }[] = [];
  for (const r of roots) {
    const f = rootInfo(r).f0;
    if (f > 0 && Number.isFinite(f) && !out.some((m) => m.kind === r.kind && Math.abs(m.f - f) <= 1e-6 * f)) out.push({ f, kind: r.kind });
  }
  return out;
}

/** Paso "redondo" (1, 2 o 5 × 10ⁿ) para unas `n` divisiones de `span` */
export function niceStep(span: number, n = 6): number {
  if (!(span > 0)) return 1;
  const raw = span / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/** Marcas múltiplos de `step` en [lo, hi] */
export function ticks(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let k = Math.ceil(lo / step); k * step <= hi + step * 1e-9 && out.length < 100; k++) out.push(Math.abs(k * step) < step * 1e-9 ? 0 : k * step);
  return out;
}

const CSV_HEAD = [t('run'), t('type'), 'n', 're [rad/s]', 'im [rad/s]', 'f0 [Hz]', 'Q', 'zeta', 'tau [s]'];

/** Tabla de raíces a CSV */
export function pzCsv(roots: Root[], label: (run: number) => string): string {
  const rows = roots.map((r) => {
    const i = rootInfo(r);
    return [label(r.run), r.kind === 'pole' ? t('pole') : t('zero'), r.n, r.re, r.im, i.f0, i.q, i.zeta, i.tau].map((x) =>
      typeof x === 'number' ? (Number.isFinite(x) ? String(x) : '') : `"${x}"`,
    );
  });
  return [CSV_HEAD.join(','), ...rows.map((r) => r.join(','))].join('\n') + '\n';
}

/** "−1.2k + j3.4k" */
export const complexText = (re: number, im: number) => `${si(re)} ${im < 0 ? '−' : '+'} j${si(Math.abs(im))}`;

/** Prefijo de los plots del Bode normalizado de un .pz (#343): pzbode1, pzbode2… (uno por corrida) */
export const PZ_BODE = 'pzbode';
const PZ_BODE_NAME = new RegExp(`^${PZ_BODE}\\d+$`, 'i');
export const isPzBodePlot = (p: SimPlot | undefined) => !!p && PZ_BODE_NAME.test(p.name);

/**
 * Bode normalizado de una corrida de .pz (#343). ngspice da sólo las raíces, no la constante K de
 * H(s) = K·Π(s − zᵢ)/Π(s − pⱼ): se dibuja cada factor normalizado, (1 − s/r) o s para una raíz en el
 * origen, así la ganancia en continua es 1 (0 dB, fase 0°); con raíces en el origen se lleva el
 * máximo del rango a 0 dB. El nivel absoluto y el signo de K (fase ±180°) no se conocen.
 * El rango va de una década debajo de la raíz más chica a una arriba de la más grande.
 */
export function pzBode(roots: Root[], perDecade = 50): { f: Float64Array; re: Float64Array; im: Float64Array; atOrigin: boolean } | null {
  const mags = roots.map((r) => Math.hypot(r.re, r.im)).filter((m) => m > 0);
  if (!roots.length || !mags.length) return null;
  const f0 = Math.min(...mags) / (2 * Math.PI) / 10;
  const f1 = Math.max(...mags) / (2 * Math.PI) * 10;
  const d0 = Math.floor(Math.log10(f0));
  const d1 = Math.ceil(Math.log10(f1));
  const n = (d1 - d0) * perDecade + 1;
  const f = Float64Array.from({ length: n }, (_, i) => 10 ** (d0 + i / perDecade));
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const atOrigin = roots.some((r) => !r.re && !r.im);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const w = 2 * Math.PI * f[i];
    // producto de los factores: (a + jb)
    let a = 1;
    let b = 0;
    for (const r of roots) {
      // factor de la raíz en s = jω: s, o 1 − s/r
      let fr: number;
      let fi: number;
      if (!r.re && !r.im) [fr, fi] = [0, w];
      else {
        const m2 = r.re * r.re + r.im * r.im;
        // s/r = jω·conj(r)/|r|² = (ω·r.im + jω·r.re)/|r|²
        [fr, fi] = [1 - (w * r.im) / m2, -(w * r.re) / m2];
      }
      if (r.kind === 'pole') {
        // dividir por (fr + j fi)
        const m = fr * fr + fi * fi;
        [fr, fi] = [fr / m, -fi / m];
      }
      [a, b] = [a * fr - b * fi, a * fi + b * fr];
    }
    re[i] = a;
    im[i] = b;
    max = Math.max(max, Math.hypot(a, b));
  }
  if (atOrigin && max > 0)
    for (let i = 0; i < n; i++) {
      re[i] /= max;
      im[i] /= max;
    }
  return { f, re, im, atOrigin };
}

/**
 * Plots del Bode normalizado para los .pz de una simulación que no trae otro análisis en
 * frecuencia: uno por corrida (pzbode1… se superponen con .step como cualquier otro), con la
 * traza H y el aviso de que la ganancia es relativa.
 */
export function pzBodePlots(plots: SimPlot[]): SimPlot[] {
  const pzs = plots.filter(isPzPlot);
  if (!pzs.length || plots.some((p) => !isPzPlot(p) && p.vectors.some((v) => v.name.toLowerCase() === 'frequency'))) return [];
  return pzs.flatMap((p, i) => {
    const b = pzBode(pzRoots([p]));
    if (!b) return [];
    return [
      {
        name: `${PZ_BODE}${i + 1}`,
        info: b.atOrigin
          ? t('Bode normalized from the poles and zeros: .pz doesn\'t give the gain, so the level in dB is relative (0 dB at its maximum) and the phase may be off by 180°')
          : t('Bode normalized from the poles and zeros: .pz doesn\'t give the gain, so the level in dB is relative (0 dB at DC) and the phase may be off by 180°'),
        vectors: [
          { name: 'frequency', type: 2, real: b.f },
          { name: 'h', label: 'H', type: 0, real: b.re, imag: b.im },
        ],
      },
    ];
  });
}
