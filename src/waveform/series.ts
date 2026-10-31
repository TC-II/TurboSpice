import { DIGITAL_TYPE, type SimPlot, type SimVector } from '../engine/ngspice.ts';
import type { StepRuns } from '../netlist/step.ts';
import { bitNodeName } from '../netlist/bus.ts';
import { deviceTraceName, parseDeviceVector } from '../sim/deviceParams.ts';

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
  if (v.label) return v.label;
  // bits de bus: f__3__ en ngspice, f[3] para el usuario
  const n = bitNodeName(v.name);
  const br = /^(.*)#branch(.*)$/i.exec(n);
  if (br) return `I(${br[1].toUpperCase()}${br[2]})`;
  // corrientes de dispositivos (.options savecurrents): @r1[i], @q1[ic], @d1[id]
  // y los demás parámetros de dispositivo (#202): @q1[gm] → @Q1[gm]
  const dev = parseDeviceVector(n);
  if (dev) return deviceTraceName(dev.device, dev.param, true);
  if (v.type === 3 && !/[(@]/.test(n)) return `V(${n})`;
  if (v.type === DIGITAL_TYPE) return `Dig(${n})`;
  return n;
}

const SI = ['f', 'p', 'n', 'µ', 'm', '', 'k', 'M', 'G', 'T'];

/** Formato con prefijo SI: 0.0047 → "4.7m" */
export function si(x: number, digits = 4): string {
  if (x === 0 || !Number.isFinite(x)) return String(x);
  let e = Math.min(4, Math.max(-5, Math.floor(Math.log10(Math.abs(x)) / 3)));
  let m = parseFloat((x / 10 ** (3 * e)).toPrecision(digits));
  // el redondeo puede llegar a 1000 (0.99997 → "1000m"): pasa al prefijo siguiente
  if (Math.abs(m) >= 1000 && e < 4) m = parseFloat((x / 10 ** (3 * ++e)).toPrecision(digits));
  return `${m}${SI[e + 5]}`;
}

/**
 * Etiquetas de las marcas de un eje: un solo prefijo SI (el de la marca de mayor módulo) y los
 * decimales que pide el paso entre marcas, así nunca se repiten aunque el rango sea mínimo
 * (0.9996, 0.99965… → "999.60m", "999.65m"…). Sin marcas válidas devuelve ''.
 * No usa offset (p. ej. "+999.6m") cuando las etiquetas quedan largas.
 */
export function axisTicks(tt: (number | null)[]): string[] {
  const v = tt.filter((x): x is number => x != null && Number.isFinite(x));
  const max = Math.max(0, ...v.map(Math.abs));
  if (max === 0) return tt.map((x) => (x == null ? '' : '0'));
  let e = Math.min(4, Math.max(-5, Math.floor(Math.log10(max) / 3)));
  let step = Infinity;
  for (let i = 1; i < v.length; i++) {
    const d = Math.abs(v[i] - v[i - 1]);
    if (d > 0) step = Math.min(step, d);
  }
  const decimals = (ee: number) =>
    Number.isFinite(step) ? Math.min(9, Math.max(0, -Math.floor(Math.log10(step / 10 ** (3 * ee)) + 1e-9))) : 0;
  // 999.97m con 2 decimales redondea a 1000.00m: sube de prefijo
  if (e < 4 && Math.round((max / 10 ** (3 * e)) * 10 ** decimals(e)) / 10 ** decimals(e) >= 1000) e++;
  const dec = decimals(e);
  return tt.map((x) => {
    if (x == null || !Number.isFinite(x)) return '';
    const m = parseFloat((x / 10 ** (3 * e)).toFixed(dec));
    return `${m === 0 ? '0' : m.toFixed(dec)}${m === 0 ? '' : SI[e + 5]}`;
  });
}

/**
 * Como si(), pero siempre del mismo largo (para lecturas que cambian con el mouse y no deben
 * cambiar de ancho): signo o espacio, `digits` cifras significativas con ceros a la derecha y
 * el prefijo SI o un espacio. 0.9107 → " 910.7m", -1.554 → "-1.554 ", 1 → " 1.000 ".
 * Sin valor (NaN): una raya centrada del mismo largo.
 */
export function siFixed(x: number, digits = 4): string {
  const width = digits + 3;
  if (!Number.isFinite(x)) return '—'.padStart(Math.ceil(width / 2)).padEnd(width);
  const a = Math.abs(x);
  let e = a === 0 ? 0 : Math.min(4, Math.max(-5, Math.floor(Math.log10(a) / 3)));
  let m = (a / 10 ** (3 * e)).toPrecision(digits);
  // el redondeo puede llegar a 1000 (999.96 → "1000"): pasa al prefijo siguiente
  if (parseFloat(m) >= 1000 && e < 4) m = (a / 10 ** (3 * ++e)).toPrecision(digits);
  if (m.includes('e')) m = parseFloat(m).toString();
  return `${x < 0 ? '-' : ' '}${m.slice(0, digits + 1).padEnd(digits + 1)}${SI[e + 5] || ' '}`;
}

/** Interpola linealmente (xs, ys) en los puntos xd (xs creciente). Fuera de rango: NaN */
/**
 * Valores de un nodo digital (cambios en los instantes `xs`) en los puntos `xd`: el último
 * cambio con instante ≤ x (escalones, sin interpolar)
 */
export function sampleEvents(xs: Float64Array, ys: Float64Array, xd: Float64Array): Float64Array {
  const out = new Float64Array(xd.length);
  for (let i = 0, j = 0; i < xd.length; i++) {
    while (j + 1 < xs.length && xs[j + 1] <= xd[i]) j++;
    out[i] = xs.length ? ys[j] : NaN;
  }
  return out;
}

/** Varios nodos digitales en los mismos instantes (la unión de sus cambios), para armar un bus */
export function mergeEvents(waves: { x: Float64Array; y: Float64Array }[]): { x: Float64Array; ys: Float64Array[] } {
  const x = Float64Array.from(new Set(waves.flatMap((w) => [...w.x]))).sort();
  return { x, ys: waves.map((w) => sampleEvents(w.x, w.y, x)) };
}

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

/**
 * Separación mínima (px) entre marcas de un eje X lineal, estimada por el largo de las etiquetas
 * de axisTicks: con mucho zoom piden más cifras y se espacian más (una de cada dos…) para no pisarse.
 */
export function axisSpace(min: number, max: number): number {
  const span = Math.abs(max - min);
  const mag = Math.max(Math.abs(min), Math.abs(max));
  if (!(span > 0) || !(mag > 0)) return 50;
  // cifras ≈ las que separan marcas a ~1/10 del rango, más signo, punto y prefijo
  const chars = Math.max(4, Math.ceil(Math.log10(mag / span)) + 2) + 3;
  return Math.max(50, chars * 7 + 16);
}
