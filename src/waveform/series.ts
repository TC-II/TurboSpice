import type { SimPlot, SimVector } from '../engine/ngspice.ts';
import type { StepRuns } from '../netlist/step.ts';

/** Tipo de vector propio (no de ngspice) para el eje X de los barridos de .step */
export const STEP_SCALE = 1000;

export type ComplexView = 'db' | 'phase' | 'mag' | 're' | 'im';

const SCALE_NAME = /^(time|frequency|[a-z]+-sweep)$/i;

/** Vector de escala (eje X) de un plot, o null si el plot es escalar (op, tf, sens, pz). */
export function scaleOf(plot: SimPlot): SimVector | null {
  return plot.vectors.find((v) => v.type === STEP_SCALE || SCALE_NAME.test(v.name)) ?? null;
}

export function isLogScale(plot: SimPlot): boolean {
  const s = scaleOf(plot);
  if (!s || (s.name.toLowerCase() !== 'frequency' && s.type !== STEP_SCALE)) return false;
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
  if (br) return `I(${br[1].toUpperCase()}${br[2]})`;
  // corrientes de dispositivos (.options savecurrents): @r1[i], @q1[ic], @d1[id]
  const dev = /^@([^[]+)\[(\w+)\]$/.exec(n);
  if (dev) {
    const name = dev[1].toUpperCase();
    return ['i', 'id', 'current'].includes(dev[2]) ? `I(${name})` : `I${dev[2].slice(1)}(${name})`;
  }
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

/** Interpola linealmente (xs, ys) en los puntos xd (xs creciente). Fuera de rango: NaN */
export function resample(xs: Float64Array, ys: Float64Array, xd: Float64Array): Float64Array {
  const out = new Float64Array(xd.length);
  let j = 0;
  for (let i = 0; i < xd.length; i++) {
    const x = xd[i];
    if (x < xs[0] || x > xs[xs.length - 1]) {
      out[i] = NaN;
      continue;
    }
    while (j < xs.length - 2 && xs[j + 1] < x) j++;
    const x0 = xs[j];
    const x1 = xs[j + 1] ?? x0;
    out[i] = x1 === x0 ? ys[j] : ys[j] + ((ys[j + 1] - ys[j]) * (x - x0)) / (x1 - x0);
  }
  return out;
}

/**
 * Corridas del mismo análisis que conviene superponer (tran1, tran2… generadas por un
 * barrido en .control). Devuelve [plot] si no hay otras o si el eje no es monótono.
 */
export function sameRuns(plots: SimPlot[], plot: SimPlot): SimPlot[] {
  const m = /^([a-z]+)\d+$/i.exec(plot.name);
  const sc = scaleOf(plot);
  if (!m || !sc || sc.name.endsWith('-sweep')) return [plot];
  const runs = plots.filter((p) => new RegExp(`^${m[1]}\\d+$`, 'i').test(p.name) && scaleOf(p)?.name === sc.name);
  return runs.length > 1 ? runs : [plot];
}

/** Etiqueta de cada plot generado por .step ("tran3" → "R=3k"), por tipo de análisis */
export function stepLabels(plots: SimPlot[], steps?: StepRuns): Map<string, string> {
  const out = new Map<string, string>();
  if (!steps) return out;
  const byKind = new Map<string, SimPlot[]>();
  for (const p of plots) {
    const k = /^([a-z]+)\d+$/i.exec(p.name)?.[1];
    if (k) (byKind.get(k) ?? byKind.set(k, []).get(k)!).push(p);
  }
  for (const ps of byKind.values()) if (ps.length === steps.runs.length) ps.forEach((p, i) => out.set(p.name, steps.runs[i].label));
  return out;
}

/**
 * Análisis sin eje X (.op, .tf) repetidos por un único .step: un plot nuevo con cada
 * resultado en función del valor barrido (como grafica LTspice un .op con .step).
 */
export function stepSweepPlots(plots: SimPlot[], steps?: StepRuns): SimPlot[] {
  if (!steps || steps.names.length !== 1) return [];
  const byKind = new Map<string, SimPlot[]>();
  for (const p of plots) {
    const k = /^([a-z]+)\d+$/i.exec(p.name)?.[1];
    // los .pz (polos complejos, cantidad variable) se superponen en el plano s, no acá
    if (k && !scaleOf(p) && !p.vectors.some((v) => /^(pole|zero)\(\d+\)$/i.test(v.name))) (byKind.get(k) ?? byKind.set(k, []).get(k)!).push(p);
  }
  const out: SimPlot[] = [];
  for (const [kind, ps] of byKind) {
    if (ps.length !== steps.runs.length) continue;
    const scale: SimVector = { name: steps.names[0], type: STEP_SCALE, real: Float64Array.from(steps.runs, (r) => r.values[0]) };
    // ordenar por el valor barrido (una lista puede venir desordenada)
    const order = [...scale.real.keys()].sort((a, b) => scale.real[a] - scale.real[b]);
    const sorted = (a: Float64Array) => Float64Array.from(order, (i) => a[i]);
    const vectors: SimVector[] = [{ ...scale, real: sorted(scale.real) }];
    for (const v of ps[0].vectors) {
      const vals = ps.map((p) => p.vectors.find((x) => x.name === v.name)?.real[0]);
      if (vals.every((x) => x !== undefined)) vectors.push({ name: v.name, type: v.type, real: sorted(Float64Array.from(vals as number[])) });
    }
    out.push({ name: `${kind} vs ${steps.names[0]}`, vectors });
  }
  return out;
}
