// Polos y ceros (.pz): raíces de cada corrida, f₀, Q, ζ y τ, escalas del plano s.
import type { SimPlot } from '../engine/ngspice.ts';
import { si } from './series.ts';

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

const CSV_HEAD = ['corrida', 'tipo', 'n', 're [rad/s]', 'im [rad/s]', 'f0 [Hz]', 'Q', 'zeta', 'tau [s]'];

/** Tabla de raíces a CSV */
export function pzCsv(roots: Root[], label: (run: number) => string): string {
  const rows = roots.map((r) => {
    const i = rootInfo(r);
    return [label(r.run), r.kind === 'pole' ? 'polo' : 'cero', r.n, r.re, r.im, i.f0, i.q, i.zeta, i.tau].map((x) =>
      typeof x === 'number' ? (Number.isFinite(x) ? String(x) : '') : `"${x}"`,
    );
  });
  return [CSV_HEAD.join(','), ...rows.map((r) => r.join(','))].join('\n') + '\n';
}

/** "−1.2k + j3.4k" */
export const complexText = (re: number, im: number) => `${si(re)} ${im < 0 ? '−' : '+'} j${si(Math.abs(im))}`;
