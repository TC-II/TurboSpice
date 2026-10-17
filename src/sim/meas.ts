// .meas con la sintaxis de LTspice, evaluado en JS sobre los resultados de cada corrida.
// Así el .asc sigue midiendo igual en LTspice y en TurboSpice no dependemos de las
// diferencias del .meas de ngspice (expresiones, PARAM, complejos en AC).
//
//   .meas [TRAN|AC|DC|NOISE|OP|TF] nombre FIND|DERIV expr [AT=x | WHEN lhs=rhs [TD=t] [RISE|FALL|CROSS=n|LAST]]
//   .meas … nombre WHEN lhs=rhs [TD=t] [RISE|FALL|CROSS=n|LAST]
//   .meas … nombre MAX|MIN|PP|AVG|RMS|INTEG expr [FROM=a] [TO=b] [TRIG … TARG …]
//   .meas … nombre TRIG lhs=rhs [TD=t] [RISE|FALL|CROSS=n] TARG lhs=rhs [TD=t] [RISE|FALL|CROSS=n]
//   .meas … nombre PARAM expr
import type { SimPlot } from '../engine/ngspice.ts';
import { evalTrace, ExprError, type Resolver, type Wave } from '../waveform/expr.ts';
import { scaleOf } from '../waveform/series.ts';

export type MeasAnalysis = 'tran' | 'ac' | 'dc' | 'noise' | 'op' | 'tf';
export type Aggregate = 'max' | 'min' | 'pp' | 'avg' | 'rms' | 'integ';

export interface Crossing {
  lhs: string;
  rhs: string;
  td?: string;
  /** qué cruce: el n-ésimo de subida, bajada o cualquiera; por defecto el primero */
  edge: 'rise' | 'fall' | 'cross';
  n: number | 'last';
}

export interface MeasDef {
  name: string;
  /** análisis al que se aplica (si falta, a todos) */
  analysis?: MeasAnalysis;
  kind: 'find' | 'deriv' | 'when' | 'param' | 'trigtarg' | Aggregate;
  expr?: string;
  at?: string;
  when?: Crossing;
  trig?: Crossing;
  targ?: Crossing;
  from?: string;
  to?: string;
  line: string;
}

export interface MeasValue {
  value: number;
  /** parte imaginaria (FIND de una señal compleja en AC) */
  im?: number;
  /** eje X donde ocurrió (FIND … WHEN, MAX, MIN) */
  at?: number;
}

export type MeasResult = MeasValue | { error: string };

const AGG = new Set(['max', 'min', 'pp', 'avg', 'rms', 'integ']);

/** Separa la línea en palabras, con "=" como separador y respetando paréntesis y llaves */
function tokenize(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let depth = 0;
  for (const ch of s) {
    if (ch === '(' || ch === '{') depth++;
    if (ch === ')' || ch === '}') depth--;
    if (depth === 0 && (/\s/.test(ch) || ch === '=')) {
      if (cur) out.push(cur);
      cur = '';
      if (ch === '=') out.push('=');
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const unbrace = (s: string) => s.replace(/^\{(.*)\}$/, '$1');

export function parseMeas(line: string): MeasDef | string {
  const t = tokenize(line.trim().replace(/^\.meas(ure)?\s+/i, ''));
  const def: Partial<MeasDef> & { line: string } = { line: line.trim() };
  if (/^(tran|ac|dc|noise|op|tf)$/i.test(t[0] ?? '')) def.analysis = t.shift()!.toLowerCase() as MeasAnalysis;
  def.name = t.shift();
  if (!def.name) return 'falta el nombre';
  let i = 0;
  const peek = () => t[i]?.toLowerCase();
  const next = () => t[i++];
  /** "clave=valor" o "clave valor" */
  const value = () => {
    if (t[i] === '=') i++;
    return unbrace(next() ?? '');
  };
  /** lhs=rhs (o "VAL=rhs" con lhs implícito) seguido de TD=, RISE=… */
  const crossing = (lhsDefault?: string): Crossing => {
    let lhs = next();
    let rhs: string;
    if (lhs.toLowerCase() === 'val') {
      rhs = value();
      lhs = lhsDefault ?? '';
    } else if (t[i] === '=') {
      i++;
      if (peek() === 'val' && t[i + 1] === '=') i += 2;
      rhs = unbrace(next() ?? '');
    } else if (peek() === 'val') {
      i++;
      rhs = value();
    } else rhs = '0';
    const c: Crossing = { lhs, rhs, edge: 'cross', n: 1 };
    for (;;) {
      const k = peek();
      if (k === 'td') {
        i++;
        c.td = value();
      } else if (k === 'rise' || k === 'fall' || k === 'cross') {
        i++;
        c.edge = k;
        const v = value();
        c.n = /^last$/i.test(v) ? 'last' : Number(v);
      } else break;
    }
    return c;
  };

  const head = peek();
  if (head === 'find' || head === 'deriv' || head === 'param' || (head && AGG.has(head))) {
    i++;
    def.kind = head as MeasDef['kind'];
    def.expr = unbrace(next() ?? '');
    if (!def.expr) return `falta la expresión de ${head.toUpperCase()}`;
  }
  while (i < t.length) {
    const k = next().toLowerCase();
    if (k === 'at') def.at = value();
    else if (k === 'from') def.from = value();
    else if (k === 'to') def.to = value();
    else if (k === 'when') def.when = crossing();
    else if (k === 'trig') def.trig = crossing();
    else if (k === 'targ') def.targ = crossing(def.trig?.lhs);
    else if (k === 'td' && def.when) def.when.td = value();
    else return `no se entiende "${t[i - 1]}"`;
  }
  if (!def.kind) {
    if (def.when) def.kind = 'when';
    else if (def.trig && def.targ) def.kind = 'trigtarg';
    else return 'falta FIND, WHEN, MAX, MIN, PP, AVG, RMS, INTEG, TRIG/TARG o PARAM';
  }
  if ((def.kind === 'find' || def.kind === 'deriv') && !def.at && !def.when) return `${def.kind.toUpperCase()} necesita AT= o WHEN`;
  return def as MeasDef;
}

// --- evaluación ------------------------------------------------------------------------

const ANALYSIS_OF: Record<string, MeasAnalysis> = { tran: 'tran', ac: 'ac', dc: 'dc', noise: 'noise', op: 'op', tf: 'tf' };

/** ¿El .meas se aplica a este plot? (por el tipo de análisis del nombre: tran3 → tran) */
export function measAppliesTo(def: MeasDef, plot: SimPlot): boolean {
  const kind = ANALYSIS_OF[/^([a-z]+)/i.exec(plot.name)?.[1].toLowerCase() ?? ''];
  if (!kind) return false;
  return def.analysis ? def.analysis === kind : kind === 'tran' || kind === 'op';
}

interface Ctx {
  plot: SimPlot;
  x: Float64Array;
  xName: string;
  resolve: Resolver;
  vars: Record<string, number>;
}

function wave(src: string, c: Ctx): Wave {
  return evalTrace(src, { resolve: c.resolve, scale: c.x, scaleName: c.xName, vars: c.vars });
}

/** Valor numérico de una expresión constante (AT=1m, VAL=vmax/2, TD=…) */
function num(src: string, c: Ctx): number {
  const w = wave(src, c);
  if (w.re.length && w.re.every((v) => v === w.re[0])) return w.re[0];
  throw new ExprError(`"${src}" no es un valor constante`);
}

/** En AC las comparaciones y agregados usan el módulo (como LTspice) */
const realPart = (w: Wave) => (w.im ? w.re.map((r, k) => Math.hypot(r, w.im![k])) : w.re);

function interp(x: Float64Array, y: Float64Array, at: number): number {
  if (at <= x[0]) return y[0];
  if (at >= x[x.length - 1]) return y[y.length - 1];
  let lo = 0;
  let hi = x.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (x[m] <= at) lo = m;
    else hi = m;
  }
  return x[hi] === x[lo] ? y[lo] : y[lo] + ((y[hi] - y[lo]) * (at - x[lo])) / (x[hi] - x[lo]);
}

/** x del cruce pedido (lhs − rhs pasa por 0), o NaN si no ocurre */
function cross(c: Crossing, ctx: Ctx): number {
  const a = realPart(wave(c.lhs, ctx));
  const b = realPart(wave(c.rhs, ctx));
  const td = c.td ? num(c.td, ctx) : -Infinity;
  const x = ctx.x;
  const found: number[] = [];
  for (let k = 1; k < x.length; k++) {
    if (x[k] < td) continue;
    const d0 = a[k - 1] - b[k - 1];
    const d1 = a[k] - b[k];
    const up = d0 < 0 && d1 >= 0;
    const down = d0 > 0 && d1 <= 0;
    if (!(c.edge === 'rise' ? up : c.edge === 'fall' ? down : up || down)) continue;
    const xc = d1 === d0 ? x[k] : x[k - 1] + ((x[k] - x[k - 1]) * -d0) / (d1 - d0);
    if (xc < td) continue;
    found.push(xc);
    if (c.n !== 'last' && found.length === c.n) return xc;
  }
  return c.n === 'last' && found.length ? found[found.length - 1] : NaN;
}

function aggregate(kind: Aggregate, x: Float64Array, y: Float64Array, from: number, to: number): MeasValue {
  let max = -Infinity;
  let min = Infinity;
  let xMax = NaN;
  let xMin = NaN;
  let area = 0;
  let area2 = 0;
  // puntos dentro del rango, con los extremos interpolados
  const xs: number[] = [from];
  const ys: number[] = [interp(x, y, from)];
  for (let k = 0; k < x.length; k++) {
    if (x[k] > from && x[k] < to) {
      xs.push(x[k]);
      ys.push(y[k]);
    }
  }
  xs.push(to);
  ys.push(interp(x, y, to));
  for (let k = 0; k < xs.length; k++) {
    if (ys[k] > max) [max, xMax] = [ys[k], xs[k]];
    if (ys[k] < min) [min, xMin] = [ys[k], xs[k]];
    if (k) {
      const dx = xs[k] - xs[k - 1];
      area += ((ys[k] + ys[k - 1]) / 2) * dx;
      area2 += ((ys[k - 1] ** 2 + ys[k - 1] * ys[k] + ys[k] ** 2) / 3) * dx;
    }
  }
  const span = to - from;
  switch (kind) {
    case 'max':
      return { value: max, at: xMax };
    case 'min':
      return { value: min, at: xMin };
    case 'pp':
      return { value: max - min };
    case 'avg':
      return { value: span ? area / span : ys[0] };
    case 'rms':
      return { value: span ? Math.sqrt(area2 / span) : Math.abs(ys[0]) };
    case 'integ':
      return { value: area };
  }
}

function evalOne(def: MeasDef, ctx: Ctx): MeasValue {
  const x = ctx.x;
  switch (def.kind) {
    case 'param':
      return { value: num(def.expr!, ctx) };
    case 'when': {
      const at = cross(def.when!, ctx);
      if (!Number.isFinite(at)) throw new ExprError('la condición WHEN no se cumple');
      return { value: at, at };
    }
    case 'find':
    case 'deriv': {
      const at = def.at !== undefined ? num(def.at, ctx) : cross(def.when!, ctx);
      if (!Number.isFinite(at)) throw new ExprError('la condición WHEN no se cumple');
      const w = wave(def.kind === 'deriv' ? `d(${def.expr})` : def.expr!, ctx);
      // en OP (un solo punto) no hay eje que recorrer
      if (x.length <= 1) return { value: w.re[0], ...(w.im ? { im: w.im[0] } : {}) };
      return { value: interp(x, w.re, at), ...(w.im ? { im: interp(x, w.im, at) } : {}), at };
    }
    case 'trigtarg': {
      const a = cross(def.trig!, ctx);
      const b = cross(def.targ!, ctx);
      if (!Number.isFinite(a)) throw new ExprError('TRIG no ocurre');
      if (!Number.isFinite(b)) throw new ExprError('TARG no ocurre');
      return { value: b - a };
    }
    default: {
      let from = def.from !== undefined ? num(def.from, ctx) : x[0];
      let to = def.to !== undefined ? num(def.to, ctx) : x[x.length - 1];
      if (def.trig) from = cross(def.trig, ctx);
      if (def.targ) to = cross(def.targ, ctx);
      if (!Number.isFinite(from) || !Number.isFinite(to)) throw new ExprError('el rango TRIG/TARG no ocurre');
      return aggregate(def.kind, x, realPart(wave(def.expr!, ctx)), Math.min(from, to), Math.max(from, to));
    }
  }
}

/**
 * Evalúa los .meas que corresponden a un plot, en orden (un PARAM puede usar resultados
 * anteriores). `vars`: valores ya conocidos (parámetros del paso de .step).
 */
export function evalMeasures(defs: MeasDef[], plot: SimPlot, resolve: Resolver, vars: Record<string, number> = {}): Map<string, MeasResult> {
  const out = new Map<string, MeasResult>();
  const sc = scaleOf(plot);
  const x = sc ? sc.real : new Float64Array([0]);
  const ctx: Ctx = { plot, x, xName: sc?.name ?? 'x', resolve, vars: { ...vars } };
  for (const def of defs) {
    if (!measAppliesTo(def, plot)) continue;
    try {
      const r = evalOne(def, ctx);
      out.set(def.name, r);
      // los resultados se pueden usar en los .meas siguientes
      ctx.vars[def.name.toLowerCase()] = r.im !== undefined ? Math.hypot(r.value, r.im) : r.value;
    } catch (e) {
      out.set(def.name, { error: (e as Error).message });
    }
  }
  return out;
}
