// .step de LTspice → bucle en un bloque .control de ngspice.
//   .step param R 1k 10k 1k        (lineal: inicio fin incremento)
//   .step dec|oct param R 1 1meg 5 (puntos por década / octava)
//   .step param R list 1k 2k 5k
//   .step V1 0 5 1                 (valor DC de una fuente V o I)
//   .step temp -40 85 25
//   .step NPN 2N2222(VAF) 50 100 25 (parámetro de un modelo)
// Varios .step se anidan; el primero es el que varía más rápido (bucle interno).
import { formatSpiceNumber, parseSpiceNumber } from './spicenum.ts';
import { t } from '../i18n/i18n.ts';

export type StepTarget =
  | { kind: 'param'; name: string }
  | { kind: 'source'; name: string }
  | { kind: 'temp' }
  | { kind: 'model'; model: string; param: string };

export interface Step {
  target: StepTarget;
  values: number[];
  line: string;
}

/** Máximo de corridas: más que esto suele ser un error de tipeo (dec con fin enorme…) */
export const MAX_RUNS = 1000;

const MODEL_TYPES = /^(npn|pnp|nmos|pmos|d|njf|pjf|lpnp|vdmos|sw|csw|ako)$/i;

export function parseStep(line: string): Step | string {
  const tt = line.trim().split(/\s+/).slice(1);
  let mode = 'lin';
  if (/^(lin|dec|oct)$/i.test(tt[0] ?? '')) mode = tt.shift()!.toLowerCase();
  let target: StepTarget;
  const first = tt.shift() ?? '';
  if (/^param$/i.test(first)) {
    const name = tt.shift();
    if (!name) return t('missing parameter name');
    target = { kind: 'param', name };
  } else if (/^temp$/i.test(first)) target = { kind: 'temp' };
  else {
    // ".step NPN 2N2222(VAF) …" (el tipo es opcional)
    const tok = MODEL_TYPES.test(first) && /\(/.test(tt[0] ?? '') ? tt.shift()! : first;
    const m = /^([^()]+)\((\w+)\)$/.exec(tok);
    target = m ? { kind: 'model', model: m[1], param: m[2] } : { kind: 'source', name: tok };
  }
  if (/^(lin|dec|oct)$/i.test(tt[0] ?? '')) mode = tt.shift()!.toLowerCase();

  let values: number[];
  if (/^list$/i.test(tt[0] ?? '')) {
    values = tt.slice(1).map(parseSpiceNumber);
  } else {
    if (tt.length < 3) return t('missing start, stop and increment');
    const [a, b, c] = tt.slice(0, 3).map(parseSpiceNumber);
    if (![a, b, c].every(Number.isFinite) || c === 0) return t('invalid values');
    values = [];
    if (mode === 'lin') {
      const inc = Math.sign(b - a) * Math.abs(c) || Math.abs(c);
      const n = Math.floor((b - a) / inc + 1e-9);
      for (let i = 0; i <= Math.min(n, MAX_RUNS); i++) values.push(a + i * inc);
    } else {
      if (a <= 0 || b <= 0) return t('a logarithmic sweep needs positive values');
      const base = mode === 'dec' ? 10 : 2;
      const n = Math.log(b / a) / Math.log(base);
      const total = Math.floor(Math.abs(n) * c + 1e-9);
      for (let i = 0; i <= Math.min(total, MAX_RUNS); i++) values.push(a * base ** ((Math.sign(n) * i) / c));
    }
  }
  if (!values.length || values.some((v) => !Number.isFinite(v))) return t('invalid values');
  return { target, values, line };
}

export function stepLabel(tt: StepTarget): string {
  switch (tt.kind) {
    case 'param':
      return tt.name;
    case 'source':
      return tt.name;
    case 'temp':
      return 'temp';
    case 'model':
      return `${tt.model}(${tt.param})`;
  }
}

const SI = ['f', 'p', 'n', 'µ', 'm', '', 'k', 'Meg', 'G', 'T'];
/** 2200 → "2.2k" (como muestra LTspice los pasos) */
export function siValue(x: number): string {
  if (x === 0 || !Number.isFinite(x)) return String(x);
  const e = Math.min(4, Math.max(-5, Math.floor(Math.log10(Math.abs(x)) / 3)));
  return `${parseFloat((x / 10 ** (3 * e)).toPrecision(6))}${SI[e + 5]}`;
}

export interface StepRuns {
  /** qué se barre en cada .step ("R", "V1", "temp", "2N2222(VAF)") */
  names: string[];
  /** cada corrida en orden de ejecución: etiqueta ("R=2k C=1n") y valor de cada .step */
  runs: { label: string; values: number[] }[];
}

export interface StepPlan extends StepRuns {
  /** bloque .control con los bucles */
  control: string[];
}

/**
 * Bloque .control que corre todas las combinaciones. `ngName` traduce un nombre de
 * elemento de LTspice al de la netlist de ngspice. Cada corrida: alterparam → reset (re-lee
 * la netlist con los parámetros nuevos) → alter de fuentes, modelos y temperatura → run.
 */
/** Comandos del usuario alrededor de cada corrida y al final (paso personalizado del Estudio) */
export interface StepHooks {
  before: string[];
  after: string[];
  final: string[];
}

export function stepPlan(steps: Step[], ngName: (lt: string) => string | undefined, hooks?: StepHooks): StepPlan | string {
  const total = steps.reduce((n, s) => n * s.values.length, 1);
  if (total > MAX_RUNS) return t('the sweep has {total} runs (maximum {MAX_RUNS})', { total, MAX_RUNS });
  const body: string[] = [];
  const params = steps.filter((s) => s.target.kind === 'param');
  const vars = steps.map((_, i) => `ts_step${i}`);
  for (const [i, s] of steps.entries()) if (s.target.kind === 'param') body.push(`alterparam ${s.target.name} = $${vars[i]}`);
  if (params.length) body.push('reset');
  for (const [i, s] of steps.entries()) {
    const v = `$${vars[i]}`;
    const tt = s.target;
    if (tt.kind === 'temp') body.push(`option temp = ${v}`);
    else if (tt.kind === 'model') body.push(`altermod ${tt.model.toLowerCase()} ${tt.param.toLowerCase()} = ${v}`);
    else if (tt.kind === 'source') {
      const n = ngName(tt.name);
      if (!n) return t('source {name} doesn\'t exist', { name: tt.name });
      body.push(`alter ${n.toLowerCase()} dc = ${v}`);
    }
  }
  body.push(...(hooks?.before ?? []), 'run', ...(hooks?.after ?? []));
  // El primer .step es el bucle interno: se abren de afuera (último) hacia adentro
  const control = ['.control'];
  for (let i = steps.length - 1; i >= 0; i--) {
    const depth = '  '.repeat(steps.length - 1 - i);
    control.push(`${depth}foreach ${vars[i]} ${steps[i].values.map(formatSpiceNumber).join(' ')}`);
  }
  control.push(...body.map((l) => `${'  '.repeat(steps.length)}${l}`));
  for (let i = 0; i < steps.length; i++) control.push(`${'  '.repeat(steps.length - 1 - i)}end`);
  control.push(...(hooks?.final ?? []), '.endc');

  // Etiquetas en el mismo orden: índice mixto con el primer .step más rápido
  const runs: StepRuns['runs'] = [];
  for (let k = 0; k < total; k++) {
    let r = k;
    const values = steps.map((s) => {
      const v = s.values[r % s.values.length];
      r = Math.floor(r / s.values.length);
      return v;
    });
    runs.push({ label: steps.map((s, i) => `${stepLabel(s.target)}=${siValue(values[i])}`).join(' '), values });
  }
  return { control, runs, names: steps.map((s) => stepLabel(s.target)) };
}
