import type { SimPlot, SimVector } from '../engine/ngspice.ts';

export type ComplexView = 'db' | 'phase' | 'mag' | 're' | 'im';

const SCALE_NAME = /^(time|frequency|[a-z]+-sweep)$/i;

/** Vector de escala (eje X) de un plot, o null si el plot es escalar (op, tf, sens, pz). */
export function scaleOf(plot: SimPlot): SimVector | null {
  return plot.vectors.find((v) => SCALE_NAME.test(v.name)) ?? null;
}

export function isLogScale(plot: SimPlot): boolean {
  const s = scaleOf(plot);
  if (!s || s.name.toLowerCase() !== 'frequency') return false;
  const f = s.real;
  // dec/oct → log; lin → lineal
  if (f.length < 3 || f[0] <= 0) return false;
  return Math.abs(f[2] / f[1] - f[1] / f[0]) < 1e-6 * (f[1] / f[0]);
}

export function project(v: SimVector, view: ComplexView): Float64Array {
  if (!v.imag) return v.real;
  const out = new Float64Array(v.real.length);
  for (let i = 0; i < out.length; i++) {
    const re = v.real[i];
    const im = v.imag[i];
    switch (view) {
      case 'db':
        out[i] = 20 * Math.log10(Math.hypot(re, im));
        break;
      case 'phase':
        out[i] = (Math.atan2(im, re) * 180) / Math.PI;
        break;
      case 'mag':
        out[i] = Math.hypot(re, im);
        break;
      case 're':
        out[i] = re;
        break;
      case 'im':
        out[i] = im;
        break;
    }
  }
  return out;
}

/** Nombre al estilo LTspice: "out" → "V(out)", "v1#branch" → "I(v1)" */
export function displayName(v: SimVector): string {
  const n = v.name;
  const br = /^(.*)#branch(.*)$/i.exec(n);
  if (br) return `I(${br[1]}${br[2]})`;
  if (v.type === 3 && !/[(@]/.test(n)) return `V(${n})`;
  return n;
}

const SI = ['f', 'p', 'n', 'µ', 'm', '', 'k', 'M', 'G', 'T'];

/** Formato con prefijo SI: 0.0047 → "4.7m" */
export function si(x: number, digits = 4): string {
  if (x === 0 || !Number.isFinite(x)) return String(x);
  const e = Math.min(4, Math.max(-5, Math.floor(Math.log10(Math.abs(x)) / 3)));
  return `${parseFloat((x / 10 ** (3 * e)).toPrecision(digits))}${SI[e + 5]}`;
}
