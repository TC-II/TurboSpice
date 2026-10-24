// Curvas de un panel: evalúa cada traza en cada corrida, la proyecta (Bode, dB, fase…) y la
// lleva al eje X del plot mostrado. Separado del componente para poder testearlo.
import type { SimPlot } from '../engine/ngspice.ts';
import { deviceExprUnit } from '../sim/deviceParams.ts';
import { spectrum, thd } from './fft.ts';
import { evalTrace, unwrapDeg, type Resolver } from './expr.ts';
import { isLogScale, resample, scaleOf, si } from './series.ts';
import { PALETTE, traceColor, type Pane } from './view.ts';
import { t } from '../i18n/i18n.ts';

/** Cómo se muestran las trazas complejas (AC): Bode = magnitud en dB y fase a la vez */
export type ComplexMode = 'bode' | 'db' | 'phase' | 'mag' | 'reim' | 'smith';

export interface Curve {
  label: string;
  /** índice de la traza en el panel y de la corrida */
  trace: number;
  run: number;
  color: string;
  dash: boolean;
  /** eje: y (izquierdo), i (corrientes, derecho), ph (fase, derecho) */
  axis: 'y' | 'i' | 'ph';
  y: Float64Array;
  hidden: boolean;
  /** nodo digital (#209): se dibuja en escalones */
  digital?: boolean;
  /** corrida a la que pertenece ("R=2k", "#2") si hay varias */
  runLabel?: string;
}

export interface PaneData {
  x: Float64Array;
  xName: string;
  log: boolean;
  curves: Curve[];
  /** errores por traza (expresión inválida o vector inexistente) */
  errors: Map<number, string>;
  /** unidades de los ejes izquierdo y derecho */
  yUnit: string;
  iUnit: string;
  /** panel de FFT: fundamental y THD de cada traza */
  info?: string[];
}

export interface CurveContext {
  plot: SimPlot;
  /** corridas a superponer (incluye a plot) */
  runs: SimPlot[];
  labels: Map<string, string>;
  resolver(p: SimPlot): Resolver;
  mode: ComplexMode;
}

/** Variación de un color para distinguir corridas de una misma traza */
export function shade(hex: string, k: number, n: number): string {
  if (n <= 1 || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  // de más oscuro a más claro alrededor del color base
  const tt = (k / (n - 1)) * 1.1 - 0.55;
  const out = c.map((v) => Math.round(tt < 0 ? v * (1 + tt) : v + (255 - v) * tt));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const isCurrentExpr = (e: string) => /^\s*I[bcdegsx]?\([^)]*\)\s*$/i.test(e) || deviceExprUnit(e) === 'A';
/** Unidad de una traza simple: V(…), I(…) o un parámetro de dispositivo (@Q1[gm] → S, #202) */
const exprUnit = (e: string) => (/^\s*V\(/i.test(e) ? 'V' : isCurrentExpr(e) ? 'A' : (deviceExprUnit(e) ?? ''));

/** Traza de un nodo digital de XSPICE (#209): Dig(q) */
const isDigitalExpr = (e: string) => /^\s*Dig\([^)]*\)\s*$/i.test(e);

/** La unidad común de las trazas, o "" si no la hay */
const sameUnit = (units: string[]) => (units.length && units.every((u) => u === units[0]) ? units[0] : '');

/** Tramos de un eje X que retrocede (barrido .dc anidado): [inicio, fin) de cada uno */
export function sweepSegments(x: Float64Array): [number, number][] {
  const segs: [number, number][] = [];
  let s = 0;
  for (let k = 1; k < x.length; k++) {
    if (x[k] < x[k - 1]) {
      segs.push([s, k]);
      s = k;
    }
  }
  segs.push([s, x.length]);
  return segs;
}

export function paneCurves(pane: Pane, ctx: CurveContext): PaneData {
  if (pane.fft) return fftCurves(pane, ctx);
  const scale = scaleOf(ctx.plot)!;
  const all = ctx.runs.length > 1 ? ctx.runs : [ctx.plot];
  const segs = all.length === 1 ? sweepSegments(scale.real) : [[0, scale.real.length] as [number, number]];
  const x = segs.length > 1 ? scale.real.slice(segs[0][0], segs[0][1]) : scale.real;
  const errors = new Map<number, string>();
  const curves: Curve[] = [];
  const visible = pane.traces.filter((tt) => !tt.hidden);
  const hasV = visible.some((tt) => !isCurrentExpr(tt.expr));
  const hasI = visible.some((tt) => isCurrentExpr(tt.expr));
  let complex = false;
  // con una sola traza y varias corridas, cada corrida con un color de la paleta
  const perRunColor = pane.traces.length === 1 && all.length > 1;

  pane.traces.forEach((tt, ti) => {
    const base = traceColor(tt, ti);
    all.forEach((r, ri) => {
      const rs = scaleOf(r);
      if (!rs) return;
      let w;
      try {
        w = evalTrace(tt.expr, { resolve: ctx.resolver(r), scale: rs.real, scaleName: rs.name });
      } catch (e) {
        if (ri === 0) errors.set(ti, (e as Error).message);
        return;
      }
      const toX = (y: Float64Array) => (r === ctx.plot ? y : resample(rs.real, y, scale.real));
      const runLabel = all.length > 1 ? ` · ${ctx.labels.get(r.name) ?? r.name}` : '';
      const color = perRunColor ? PALETTE[ri % PALETTE.length] : shade(base, ri, all.length);
      const parts: { y: Float64Array; axis: Curve['axis']; dash: boolean; suffix: string }[] = [];
      if (w.im) {
        complex = true;
        const mag = new Float64Array(w.re.length);
        for (let k = 0; k < mag.length; k++) mag[k] = Math.hypot(w.re[k], w.im[k]);
        const db = mag.map((m) => 20 * Math.log10(m));
        const ph = unwrapDeg(w.re, w.im);
        if (ctx.mode === 'bode') parts.push({ y: db, axis: 'y', dash: false, suffix: '' }, { y: ph, axis: 'ph', dash: true, suffix: t(' (phase)') });
        else if (ctx.mode === 'db') parts.push({ y: db, axis: 'y', dash: false, suffix: '' });
        else if (ctx.mode === 'phase') parts.push({ y: ph, axis: 'y', dash: false, suffix: '' });
        else if (ctx.mode === 'mag') parts.push({ y: mag, axis: 'y', dash: false, suffix: '' });
        else parts.push({ y: w.re, axis: 'y', dash: false, suffix: ' (re)' }, { y: w.im, axis: 'y', dash: true, suffix: ' (im)' });
      } else {
        parts.push({ y: w.re, axis: isCurrentExpr(tt.expr) && hasV ? 'i' : 'y', dash: false, suffix: '' });
      }
      const digital = isDigitalExpr(tt.expr) ? { digital: true } : {};
      for (const p of parts) {
        const y = toX(p.y);
        if (segs.length > 1) {
          segs.forEach(([a, b], si) => {
            const xs = scale.real.slice(a, b);
            curves.push({ label: `${tt.expr}${p.suffix} #${si + 1}`, trace: ti, run: si, color: shade(base, si, segs.length), dash: p.dash, axis: p.axis, y: resample(xs, y.slice(a, b), x), hidden: !!tt.hidden, runLabel: `#${si + 1}`, ...digital });
          });
        } else {
          curves.push({ label: `${tt.expr}${p.suffix}${runLabel}`, trace: ti, run: ri, color, dash: p.dash, axis: p.axis, y, hidden: !!tt.hidden, ...(runLabel ? { runLabel: runLabel.slice(3) } : {}), ...digital });
        }
      }
    });
  });

  const yUnit = complex ? (ctx.mode === 'bode' || ctx.mode === 'db' ? 'dB' : ctx.mode === 'phase' ? '°' : '') : hasV ? sameUnit(visible.map((tt) => exprUnit(tt.expr))) : hasI ? 'A' : '';
  return { x, xName: scale.name, log: isLogScale(ctx.plot), curves, errors, yUnit, iUnit: complex ? '°' : 'A' };
}

/**
 * Panel de FFT (#236): espectro (en dB) de cada traza del plot mostrado, en el rango de tiempo
 * guardado en el panel; el eje X es la frecuencia.
 */
export function fftCurves(pane: Pane, ctx: CurveContext): PaneData {
  const o = pane.fft!;
  const scale = scaleOf(ctx.plot);
  const errors = new Map<number, string>();
  const curves: Curve[] = [];
  const info: string[] = [];
  let x = new Float64Array(0);
  if (scale?.name !== 'time') {
    pane.traces.forEach((_, ti) => errors.set(ti, t('The FFT needs a transient analysis')));
    return { x, xName: 'frequency', log: false, curves, errors, yUnit: 'dB', iUnit: 'A' };
  }
  // todas las trazas con la misma grilla de frecuencias: mismo rango y cantidad de puntos
  const from = Math.max(o.from ?? scale.real[0], scale.real[0]);
  const to = Math.min(o.to ?? scale.real[scale.real.length - 1], scale.real[scale.real.length - 1]);
  pane.traces.forEach((tt, ti) => {
    let w;
    try {
      w = evalTrace(tt.expr, { resolve: ctx.resolver(ctx.plot), scale: scale.real, scaleName: scale.name });
    } catch (e) {
      errors.set(ti, (e as Error).message);
      return;
    }
    const sp = spectrum(scale.real, w.re, { from, to, window: o.window, ...(x.length ? { points: x.length * 2 } : {}) });
    if (!x.length) x = sp.freq;
    const th = thd(sp);
    info.push(t('{expr}: fundamental {p1}Hz, amplitude {p2} · THD {p3} % (harmonics 2 to {p4}) · {n} points', { expr: tt.expr, p1: si(th.fundamental), p2: si(th.amplitude), p3: th.thd.toFixed(3), p4: th.harmonics.length + 1, n: sp.n }));
    curves.push({ label: `FFT ${tt.expr}`, trace: ti, run: 0, color: traceColor(tt, ti), dash: false, axis: 'y', y: sp.amp.map((a) => 20 * Math.log10(a)), hidden: !!tt.hidden });
  });
  return { x, xName: 'frequency', log: false, curves, errors, yUnit: 'dB', iUnit: 'A', info };
}
