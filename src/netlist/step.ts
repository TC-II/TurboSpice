// .step de LTspice → bucle en un bloque .control de ngspice.
//   .step param R 1k 10k 1k        (lineal: inicio fin incremento)
//   .step dec|oct param R 1 1meg 5 (puntos por década / octava)
//   .step param R list 1k 2k 5k
//   .step V1 0 5 1                 (valor DC de una fuente V o I)
//   .step temp -40 85 25
//   .step NPN 2N2222(VAF) 50 100 25 (parámetro de un modelo)
// Varios .step se anidan; el primero es el que varía más rápido (bucle interno).
import { formatSpiceNumber, parseSpiceNumber } from './spicenum.ts';

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
  const t = line.trim().split(/\s+/).slice(1);
  let mode = 'lin';
  if (/^(lin|dec|oct)$/i.test(t[0] ?? '')) mode = t.shift()!.toLowerCase();
  let target: StepTarget;
  const first = t.shift() ?? '';
  if (/^param$/i.test(first)) {
    const name = t.shift();
    if (!name) return 'falta el nombre del parámetro';
    target = { kind: 'param', name };
  } else if (/^temp$/i.test(first)) target = { kind: 'temp' };
  else {
    // ".step NPN 2N2222(VAF) …" (el tipo es opcional)
    const tok = MODEL_TYPES.test(first) && /\(/.test(t[0] ?? '') ? t.shift()! : first;
    const m = /^([^()]+)\((\w+)\)$/.exec(tok);
    target = m ? { kind: 'model', model: m[1], param: m[2] } : { kind: 'source', name: tok };
  }
  if (/^(lin|dec|oct)$/i.test(t[0] ?? '')) mode = t.shift()!.toLowerCase();

  let values: number[];
  if (/^list$/i.test(t[0] ?? '')) {
    values = t.slice(1).map(parseSpiceNumber);
  } else {
    if (t.length < 3) return 'faltan inicio, fin e incremento';
    const [a, b, c] = t.slice(0, 3).map(parseSpiceNumber);
    if (![a, b, c].every(Number.isFinite) || c === 0) return 'valores inválidos';
    values = [];
    if (mode === 'lin') {
      const inc = Math.sign(b - a) * Math.abs(c) || Math.abs(c);
      const n = Math.floor((b - a) / inc + 1e-9);
      for (let i = 0; i <= Math.min(n, MAX_RUNS); i++) values.push(a + i * inc);
    } else {
      if (a <= 0 || b <= 0) return 'un barrido logarítmico necesita valores positivos';
      const base = mode === 'dec' ? 10 : 2;
      const n = Math.log(b / a) / Math.log(base);
      const total = Math.floor(Math.abs(n) * c + 1e-9);
      for (let i = 0; i <= Math.min(total, MAX_RUNS); i++) values.push(a * base ** ((Math.sign(n) * i) / c));
    }
  }
  if (!values.length || values.some((v) => !Number.isFinite(v))) return 'valores inválidos';
  return { target, values, line };
}

export function stepLabel(t: StepTarget): string {
  switch (t.kind) {
    case 'param':
      return t.name;
    case 'source':
      return t.name;
    case 'temp':
      return 'temp';
    case 'model':
      return `${t.model}(${t.param})`;
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
export function stepPlan(steps: Step[], ngName: (lt: string) => string | undefined): StepPlan | string {
  const total = steps.reduce((n, s) => n * s.values.length, 1);
  if (total > MAX_RUNS) return `el barrido tiene ${total} corridas (máximo ${MAX_RUNS})`;
  const body: string[] = [];
  const params = steps.filter((s) => s.target.kind === 'param');
  const vars = steps.map((_, i) => `ts_step${i}`);
  for (const [i, s] of steps.entries()) if (s.target.kind === 'param') body.push(`alterparam ${s.target.name} = $${vars[i]}`);
  if (params.length) body.push('reset');
  for (const [i, s] of steps.entries()) {
    const v = `$${vars[i]}`;
    const t = s.target;
    if (t.kind === 'temp') body.push(`option temp = ${v}`);
    else if (t.kind === 'model') body.push(`altermod ${t.model.toLowerCase()} ${t.param.toLowerCase()} = ${v}`);
    else if (t.kind === 'source') {
      const n = ngName(t.name);
      if (!n) return `no existe la fuente ${t.name}`;
      body.push(`alter ${n.toLowerCase()} dc = ${v}`);
    }
  }
  body.push('run');
  // El primer .step es el bucle interno: se abren de afuera (último) hacia adentro
  const control = ['.control'];
  for (let i = steps.length - 1; i >= 0; i--) {
    const depth = '  '.repeat(steps.length - 1 - i);
    control.push(`${depth}foreach ${vars[i]} ${steps[i].values.map(formatSpiceNumber).join(' ')}`);
  }
  control.push(...body.map((l) => `${'  '.repeat(steps.length)}${l}`));
  for (let i = 0; i < steps.length; i++) control.push(`${'  '.repeat(steps.length - 1 - i)}end`);
  control.push('.endc');

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
