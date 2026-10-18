// Estudio con bloques (Blockly): definiciones, caja de herramientas y compilación del JSON
// serializado a tarjetas (si el programa es "barrer → simular → medir", así el .asc sigue
// simulando igual en LTspice) o a un bloque .control (si usa lógica que LTspice no tiene).
// Trabaja sobre el JSON de Blockly, sin depender de Blockly (se puede testear en Node).
import { formatSpiceNumber } from '../netlist/spicenum.ts';
import { parseStep } from '../netlist/step.ts';
import { PALETTE, type PlotView } from '../waveform/view.ts';
import type { MeasAnalysis } from './meas.ts';
import { measureLines, MEASURE_KINDS, stepLine, type MeasureKind, type Study, type StudyMeasure, type StudySweep, type SweepTarget } from './study.ts';

// --- JSON de Blockly ----------------------------------------------------------------------

export interface BlockJson {
  type: string;
  id?: string;
  x?: number;
  y?: number;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block?: BlockJson; shadow?: BlockJson }>;
  next?: { block?: BlockJson };
  extraState?: Record<string, unknown>;
}

export interface WorkspaceJson {
  blocks?: { languageVersion?: number; blocks: BlockJson[] };
  variables?: { name: string; id: string }[];
}

// --- definiciones de bloques (formato JSON de Blockly) ---------------------------------------

export const COLORS = { sim: 210, circuit: 20, loop: 120, measure: 290, show: 160 };

/** Objetivos de un barrido o de "poner": "component:R1", "param:k", "source:V1", "temp" */
export function targetOf(v: string): SweepTarget | null {
  const [kind, name] = v.split(':');
  if (kind === 'temp') return { kind: 'temp' };
  if (!name) return null;
  if (kind === 'component' || kind === 'param' || kind === 'source') return { kind, name };
  return null;
}

export const targetKey = (t: SweepTarget) => (t.kind === 'temp' ? 'temp' : t.kind === 'model' ? '' : `${t.kind}:${t.name}`);

/** Mediciones que se pueden usar desde bloques (con su análisis) */
export const BLOCK_MEASURES: [MeasureKind, string, MeasAnalysis | null][] = [
  ['max', 'el máximo', null],
  ['min', 'el mínimo', null],
  ['pp', 'el pico a pico', null],
  ['avg', 'el promedio', null],
  ['rms', 'el valor eficaz', 'tran'],
  ['at', 'el valor en (A)', null],
  ['rise', 'el tiempo de subida (de A a B)', 'tran'],
  ['fall', 'el tiempo de bajada (de A a B)', 'tran'],
  ['period', 'el período (cruce por A)', 'tran'],
  ['freq', 'la frecuencia (cruce por A)', 'tran'],
  ['gainAt', 'la ganancia en dB a la frecuencia A', 'ac'],
  ['f3db', 'la frecuencia de corte (−3 dB)', 'ac'],
  ['f0db', 'la frecuencia de cruce por 0 dB', 'ac'],
  ['phaseMargin', 'el margen de fase', 'ac'],
];

/** Colores del bloque "Graficar señal" (la paleta del visor) */
export const PLOT_COLORS: [string, string][] = [
  ['automático', 'auto'],
  ...(['verde', 'azul', 'rojo', 'turquesa', 'violeta', 'gris', 'naranja', 'oliva', 'fucsia', 'azul oscuro'] as const).map((n, i): [string, string] => [n, PALETTE[i]]),
];

/** Definiciones JSON de los bloques propios; los desplegables de componentes los completa la UI */
export function blockDefinitions(): object[] {
  const stmt = { previousStatement: null, nextStatement: null };
  return [
    { type: 'ts_simulate', message0: 'Simular el análisis del esquemático', colour: COLORS.sim, tooltip: 'Corre los análisis del esquemático (.tran, .ac…)', ...stmt },
    {
      type: 'ts_for_list',
      message0: 'Para cada valor %1 de %2 en %3 %4 %5',
      args0: [
        { type: 'field_variable', name: 'VAR', variable: 'valor' },
        { type: 'field_dropdown', name: 'TARGET', options: [['(elegir)', '']] },
        { type: 'field_input', name: 'VALUES', text: '1k 2k 5k' },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: COLORS.loop,
      tooltip: 'Repite los bloques de adentro con cada valor (separados por espacios)',
      ...stmt,
    },
    {
      type: 'ts_for_range',
      message0: 'Para cada valor %1 de %2 %3 desde %4 hasta %5 paso %6 %7 %8',
      args0: [
        { type: 'field_variable', name: 'VAR', variable: 'valor' },
        { type: 'field_dropdown', name: 'TARGET', options: [['(elegir)', '']] },
        { type: 'field_dropdown', name: 'MODE', options: [['lineal', 'lin'], ['por década', 'dec'], ['por octava', 'oct']] },
        { type: 'field_input', name: 'START', text: '1k' },
        { type: 'field_input', name: 'STOP', text: '10k' },
        { type: 'field_input', name: 'STEP', text: '1k' },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: COLORS.loop,
      tooltip: 'Barrido lineal (paso) o logarítmico (puntos por década/octava)',
      ...stmt,
    },
    {
      type: 'ts_repeat',
      message0: 'Repetir %1 veces %2 %3',
      args0: [{ type: 'field_number', name: 'TIMES', value: 3, min: 1, precision: 1 }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
      colour: COLORS.loop,
      ...stmt,
    },
    {
      type: 'ts_set',
      message0: 'Poner %1 en %2',
      args0: [{ type: 'field_dropdown', name: 'TARGET', options: [['(elegir)', '']] }, { type: 'input_value', name: 'VALUE' }],
      colour: COLORS.circuit,
      tooltip: 'Cambia el valor de un componente, un parámetro, una fuente o la temperatura',
      ...stmt,
    },
    {
      type: 'ts_measure',
      message0: 'Medir %1 de %2 A %3 B %4 → %5',
      args0: [
        { type: 'field_dropdown', name: 'KIND', options: BLOCK_MEASURES.map(([k, l]) => [l, k]) },
        { type: 'field_input', name: 'SIGNAL', text: 'V(out)' },
        { type: 'field_input', name: 'A', text: '' },
        { type: 'field_input', name: 'B', text: '' },
        { type: 'field_variable', name: 'VAR', variable: 'medida' },
      ],
      colour: COLORS.measure,
      tooltip: 'Mide la señal en la última simulación y guarda el resultado en la variable',
      ...stmt,
    },
    {
      type: 'ts_print',
      message0: 'Mostrar en el Log %1',
      args0: [{ type: 'input_value', name: 'VALUE' }],
      colour: COLORS.show,
      ...stmt,
    },
    {
      type: 'ts_message',
      message0: 'Mensaje %1',
      args0: [{ type: 'field_input', name: 'TEXT', text: 'listo' }],
      colour: COLORS.show,
      ...stmt,
    },
    {
      type: 'ts_plot_xy',
      message0: 'Graficar %1 en función de %2',
      args0: [
        { type: 'field_variable', name: 'Y', variable: 'medida' },
        { type: 'field_variable', name: 'X', variable: 'valor' },
      ],
      colour: COLORS.show,
      tooltip: 'Agrega un punto (x, y) cada vez que se ejecuta; al terminar aparece el gráfico',
      ...stmt,
    },
    {
      type: 'ts_plot_signal',
      message0: 'Graficar la señal %1 en el panel %2 con color %3 en %4',
      args0: [
        { type: 'field_input', name: 'SIGNAL', text: 'V(out)' },
        { type: 'field_number', name: 'PANE', value: 1, min: 1, precision: 1 },
        { type: 'field_dropdown', name: 'COLOR', options: PLOT_COLORS },
        {
          type: 'field_dropdown',
          name: 'ANALYSIS',
          options: [
            ['transitorio', 'tran'],
            ['AC (Bode)', 'ac'],
            ['barrido DC', 'dc'],
            ['ruido', 'noise'],
          ],
        },
      ],
      colour: COLORS.show,
      tooltip: 'Qué mostrar en los resultados de ese análisis (lo mismo que "Recordar vista"); no se ejecuta en cada corrida',
      ...stmt,
    },
  ];
}

/** Caja de herramientas por categorías (en castellano) */
export function toolbox(): object {
  const cat = (name: string, colour: number | string, contents: object[], extra: object = {}) => ({ kind: 'category', name, colour: String(colour), contents, ...extra });
  const b = (type: string, extra: object = {}) => ({ kind: 'block', type, ...extra });
  const num = (n: number) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });
  return {
    kind: 'categoryToolbox',
    contents: [
      cat('Simular', COLORS.sim, [b('ts_simulate')]),
      cat('Circuito', COLORS.circuit, [b('ts_set', { inputs: { VALUE: num(1000) } })]),
      cat('Repetir', COLORS.loop, [b('ts_for_list'), b('ts_for_range'), b('ts_repeat')]),
      cat('Medir', COLORS.measure, [b('ts_measure')]),
      cat('Calcular', '%{BKY_MATH_HUE}', [b('math_number'), b('math_arithmetic', { inputs: { A: num(1), B: num(1) } }), b('math_single', { inputs: { NUM: num(9) } })]),
      cat('Lógica', '%{BKY_LOGIC_HUE}', [b('controls_if'), b('logic_compare'), b('logic_operation'), b('logic_negate'), b('logic_boolean')]),
      cat('Variables', '%{BKY_VARIABLES_HUE}', [], { custom: 'VARIABLE' }),
      cat('Mostrar', COLORS.show, [b('ts_plot_signal'), b('ts_plot_xy'), b('ts_print'), b('ts_message'), b('text')]),
    ],
  };
}

// --- compilación ----------------------------------------------------------------------------

export interface XyPlot {
  id: number;
  x: string;
  y: string;
}

export interface CompiledBlocks {
  /** estudio resultante: tarjetas, o un paso personalizado con el .control generado */
  study: Study;
  /** el programa se pudo expresar con directivas de LTspice */
  ltspice: boolean;
  errors: string[];
}

/** Marca del .control generado por bloques (tongspice corre cada análisis por separado) */
export const BLOCKS_MARK = '* bloques';
/** Línea del log con un punto de un gráfico x-y */
export const XY_PREFIX = 'TS-XY';

const chain = (b: BlockJson | undefined): BlockJson[] => {
  const out: BlockJson[] = [];
  for (let c = b; c; c = c.next?.block) out.push(c);
  return out;
};
const input = (b: BlockJson, name: string) => b.inputs?.[name]?.block ?? b.inputs?.[name]?.shadow;
const field = (b: BlockJson, name: string) => String(b.fields?.[name] ?? '');

class Compiler {
  errors: string[] = [];
  plots: XyPlot[] = [];
  private vars: Map<string, string>;
  private analysis: MeasAnalysis;

  constructor(ws: WorkspaceJson, analysis: MeasAnalysis) {
    this.vars = new Map((ws.variables ?? []).map((v) => [v.id, v.name]));
    this.analysis = analysis;
  }

  varName(b: BlockJson, f: string): string {
    const v = b.fields?.[f] as { id?: string; name?: string } | string | undefined;
    const name = typeof v === 'string' ? v : (v?.name ?? (v?.id ? this.vars.get(v.id) : undefined));
    return (name ?? 'x').replace(/[^\w]/g, '_');
  }

  /** Variable de shell de ngspice que guarda la variable del bloque */
  shell = (name: string) => `v_${name}`;

  expr(b: BlockJson | undefined): string {
    if (!b) {
      this.errors.push('Falta un valor en un bloque');
      return '0';
    }
    switch (b.type) {
      case 'math_number':
        return String(b.fields?.NUM ?? 0);
      case 'text':
        return `"${field(b, 'TEXT')}"`;
      case 'logic_boolean':
        return field(b, 'BOOL') === 'TRUE' ? '1' : '0';
      case 'variables_get':
        return `$${this.shell(this.varName(b, 'VAR'))}`;
      case 'math_arithmetic': {
        const op = { ADD: '+', MINUS: '-', MULTIPLY: '*', DIVIDE: '/', POWER: '^' }[field(b, 'OP')] ?? '+';
        return `(${this.expr(input(b, 'A'))} ${op} ${this.expr(input(b, 'B'))})`;
      }
      case 'math_single': {
        const a = this.expr(input(b, 'NUM'));
        const f = { ROOT: 'sqrt', ABS: 'abs', LN: 'ln', LOG10: 'log10', EXP: 'exp' }[field(b, 'OP')];
        if (f) return `${f}(${a})`;
        if (field(b, 'OP') === 'NEG') return `(-${a})`;
        if (field(b, 'OP') === 'POW10') return `(10^${a})`;
        this.errors.push(`Operación no disponible: ${field(b, 'OP')}`);
        return a;
      }
      case 'logic_compare': {
        const op = { EQ: 'eq', NEQ: 'ne', LT: 'lt', LTE: 'le', GT: 'gt', GTE: 'ge' }[field(b, 'OP')] ?? 'eq';
        return `(${this.expr(input(b, 'A'))} ${op} ${this.expr(input(b, 'B'))})`;
      }
      case 'logic_operation':
        return `(${this.expr(input(b, 'A'))} ${field(b, 'OP') === 'OR' ? 'or' : 'and'} ${this.expr(input(b, 'B'))})`;
      case 'logic_negate':
        return `(not ${this.expr(input(b, 'BOOL'))})`;
      default:
        this.errors.push(`Bloque de valor no soportado: ${b.type}`);
        return '0';
    }
  }

  /** Asigna un objetivo (componente, parámetro, fuente, temperatura) desde una variable de shell */
  assign(t: SweepTarget, value: string): string[] {
    switch (t.kind) {
      case 'component':
        return [`alter ${t.name.toLowerCase()} = ${value}`];
      case 'source':
        return [`alter ${t.name.toLowerCase()} dc = ${value}`];
      case 'param':
        return [`alterparam ${t.name} = ${value}`, 'reset'];
      case 'temp':
        return [`option temp = ${value}`];
      default:
        return [];
    }
  }

  values(b: BlockJson): string[] | null {
    const t = targetOf(field(b, 'TARGET'));
    if (!t) {
      this.errors.push('Elegí qué variar en un bloque "Para cada valor"');
      return null;
    }
    const s = loopSweep(b, t);
    const r = parseStep(stepLine(s));
    if (typeof r === 'string') {
      this.errors.push(`Valores inválidos en "Para cada valor de ${'name' in t ? t.name : 'temperatura'}": ${r}`);
      return null;
    }
    return r.values.map(formatSpiceNumber);
  }

  measure(b: BlockJson, name: string): string[] {
    const m = blockMeasure(b, name, this.analysis);
    const toNg = (l: string) =>
      l
        .replace(/^\.meas\s+/i, 'meas ')
        .replace(/\bmag\(V\(([^()]+)\)\)/gi, 'vm($1)')
        .replace(/\bdb\(V\(([^()]+)\)\)/gi, 'vdb($1)')
        .replace(/\bph\(V\(([^()]+)\)\)/gi, 'vp($1)')
        .replace(/\bV\(/g, 'v(');
    const lines = measureLines(m).map(toNg);
    // las mediciones que usan otra medición como valor (f3db, frecuencia, margen de fase):
    // ngspice no acepta expresiones ahí, se calculan con let
    let out: string[];
    if (m.kind === 'f3db') out = [lines[0], `let ${name}_lim = ${name}_max/sqrt(2)`, lines[1].replace(`=${name}_max/sqrt(2)`, `=${name}_lim`)];
    else if (m.kind === 'freq') out = [lines[0], `let ${name} = 1/${name}_T`];
    else if (m.kind === 'phaseMargin') out = [lines[0], `let ${name} = 180+${name}_ph*180/pi`];
    else out = lines;
    // el resultado pasa a una variable de shell: así se puede usar desde cualquier plot
    return [...out, `set ${this.shell(name)} = "$&${name}"`];
  }

  stmts(list: BlockJson[], scope: { t: SweepTarget; v: string }[]): string[] {
    return list.flatMap((b) => this.stmt(b, scope));
  }

  stmt(b: BlockJson, scope: { t: SweepTarget; v: string }[]): string[] {
    const body = (name: string, sc = scope) => this.stmts(chain(input(b, name)), sc).map((l) => `  ${l}`);
    switch (b.type) {
      case 'ts_simulate':
        return ['run'];
      case 'ts_plot_signal':
        return []; // es la vista de resultados, no un paso
      case 'ts_for_list':
      case 'ts_for_range': {
        const vals = this.values(b);
        const t = targetOf(field(b, 'TARGET'));
        if (!vals || !t) return [];
        const v = this.shell(this.varName(b, 'VAR'));
        const sc = [...scope, { t, v }];
        // con un parámetro (reset) hay que volver a aplicar los valores de los bucles de afuera
        const params = sc.filter((x) => x.t.kind === 'param');
        const setup = params.length
          ? [...params.map((x) => `alterparam ${(x.t as { name: string }).name} = $${x.v}`), 'reset', ...sc.filter((x) => x.t.kind !== 'param').flatMap((x) => this.assign(x.t, `$${x.v}`))]
          : this.assign(t, `$${v}`);
        return [`foreach ${v} ${vals.join(' ')}`, ...setup.map((l) => `  ${l}`), ...body('DO', sc), 'end'];
      }
      case 'ts_repeat':
        return [`repeat ${Math.max(1, Math.round(Number(b.fields?.TIMES ?? 1)))}`, ...body('DO'), 'end'];
      case 'ts_set': {
        const t = targetOf(field(b, 'TARGET'));
        if (!t) {
          this.errors.push('Elegí qué cambiar en un bloque "Poner"');
          return [];
        }
        return ['let ts_tmp = ' + this.expr(input(b, 'VALUE')), 'set ts_val = "$&ts_tmp"', ...this.assign(t, '$ts_val')];
      }
      case 'ts_measure':
        return this.measure(b, this.varName(b, 'VAR'));
      case 'variables_set': {
        const n = this.varName(b, 'VAR');
        return [`let ts_tmp = ${this.expr(input(b, 'VALUE'))}`, `set ${this.shell(n)} = "$&ts_tmp"`];
      }
      case 'math_change': {
        const n = this.varName(b, 'VAR');
        return [`let ts_tmp = $${this.shell(n)} + ${this.expr(input(b, 'DELTA'))}`, `set ${this.shell(n)} = "$&ts_tmp"`];
      }
      case 'controls_if': {
        const n = Number((b.extraState?.elseIfCount as number | undefined) ?? 0);
        const hasElse = !!b.extraState?.hasElse;
        const out: string[] = [];
        // ngspice no tiene "else if": se anidan
        const build = (i: number): string[] => {
          const cond = this.expr(input(b, `IF${i}`));
          const then = body(`DO${i}`);
          const rest = i < n ? build(i + 1) : hasElse ? body('ELSE').map((l) => l.slice(2)) : [];
          return [`if ${cond}`, ...then, ...(rest.length ? ['else', ...rest.map((l) => `  ${l}`)] : []), 'end'];
        };
        out.push(...build(0));
        return out;
      }
      case 'ts_print': {
        const v = input(b, 'VALUE');
        if (v?.type === 'variables_get') {
          const n = this.varName(v, 'VAR');
          return [`echo "${n} =" $${this.shell(n)}`];
        }
        if (v?.type === 'text') return [`echo ${this.expr(v)}`];
        return [`let ts_tmp = ${this.expr(v)}`, 'echo $&ts_tmp'];
      }
      case 'ts_message':
        return [`echo "${field(b, 'TEXT').replace(/"/g, "'")}"`];
      case 'ts_plot_xy': {
        const x = this.varName(b, 'X');
        const y = this.varName(b, 'Y');
        let p = this.plots.find((q) => q.x === x && q.y === y);
        if (!p) this.plots.push((p = { id: this.plots.length + 1, x, y }));
        return [`echo "${XY_PREFIX} ${p.id}" $${this.shell(x)} $${this.shell(y)}`];
      }
      default:
        this.errors.push(`Bloque no soportado: ${b.type}`);
        return [];
    }
  }
}

function loopSweep(b: BlockJson, t: SweepTarget): StudySweep {
  return b.type === 'ts_for_list'
    ? { target: t, mode: 'list', list: field(b, 'VALUES'), start: '', stop: '', step: '', enabled: true }
    : { target: t, mode: field(b, 'MODE') as StudySweep['mode'], list: '', start: field(b, 'START'), stop: field(b, 'STOP'), step: field(b, 'STEP'), enabled: true };
}

function blockMeasure(b: BlockJson, name: string, analysis: MeasAnalysis): StudyMeasure {
  const kind = field(b, 'KIND') as MeasureKind;
  const fixed = BLOCK_MEASURES.find(([k]) => k === kind)?.[2];
  const a = field(b, 'A');
  const bb = field(b, 'B');
  return {
    enabled: true,
    name,
    analysis: fixed ?? (MEASURE_KINDS.find((k) => k.kind === kind)?.analysis.includes(analysis) ? analysis : 'tran'),
    kind,
    signal: field(b, 'SIGNAL'),
    ...(kind === 'at' || kind === 'gainAt' ? { at: a } : {}),
    ...(kind === 'rise' || kind === 'fall' ? { level: a, level2: bb } : {}),
    ...(kind === 'period' || kind === 'freq' ? { level: a || '0' } : {}),
  };
}

/**
 * ¿Es "barrer → simular → medir (→ graficar)"? Entonces se expresa con .step y .meas (LTspice).
 * Devuelve las tarjetas o null.
 */
function asCards(top: BlockJson[], analysis: MeasAnalysis, varName: (b: BlockJson, f: string) => string): Pick<Study, 'sweeps' | 'measures'> | null {
  if (top.length !== 1 && !(top.length > 1 && top.slice(1).every((b) => b.type === 'ts_plot_xy'))) return null;
  const sweeps: StudySweep[] = [];
  let core = top.slice(0, 1);
  // bucles anidados, cada uno con un solo bloque adentro (o el núcleo)
  while (core.length === 1 && (core[0].type === 'ts_for_list' || core[0].type === 'ts_for_range')) {
    const t = targetOf(field(core[0], 'TARGET'));
    if (!t) return null;
    sweeps.unshift(loopSweep(core[0], t));
    core = chain(input(core[0], 'DO'));
  }
  if (core[0]?.type !== 'ts_simulate') return null;
  const rest = core.slice(1);
  if (!rest.every((b) => b.type === 'ts_measure' || b.type === 'ts_plot_xy' || b.type === 'ts_plot_signal')) return null;
  const measures = rest.filter((b) => b.type === 'ts_measure').map((b) => blockMeasure(b, varName(b, 'VAR'), analysis));
  // componentes barridos: el valor original lo completa quien aplica (applyBlocksStudy)
  return { sweeps, measures };
}

/** Todos los bloques del programa (también los anidados) */
function allBlocks(list: BlockJson[]): BlockJson[] {
  return list.flatMap((b) => chain(b).flatMap((x) => [x, ...allBlocks(Object.values(x.inputs ?? {}).flatMap((i) => (i.block ? [i.block] : [])))]));
}

/** Vista de resultados de los bloques "Graficar señal" (undefined si no hay ninguno) */
function plotFromBlocks(blocks: BlockJson[]): PlotView | undefined {
  const sig = blocks.filter((b) => b.type === 'ts_plot_signal' && field(b, 'SIGNAL').trim());
  if (!sig.length) return undefined;
  const view: PlotView = {};
  for (const b of sig) {
    const kind = field(b, 'ANALYSIS') || 'tran';
    const pane = Math.max(1, Math.round(Number(b.fields?.PANE) || 1)) - 1;
    const panes = (view[kind] ??= []);
    while (panes.length <= pane) panes.push({ traces: [] });
    const color = field(b, 'COLOR');
    panes[pane].traces.push({ expr: field(b, 'SIGNAL').trim(), ...(color && color !== 'auto' ? { color } : {}) });
  }
  for (const k of Object.keys(view)) view[k] = view[k].filter((p) => p.traces.length);
  return view;
}

/** Compila el programa de bloques al estudio (tarjetas o paso personalizado) */
export function compileBlocks(ws: WorkspaceJson, analysis: MeasAnalysis): CompiledBlocks {
  const c = new Compiler(ws, analysis);
  const tops = [...(ws.blocks?.blocks ?? [])].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
  // "Graficar señal" es la vista de resultados: no cuenta para la forma del programa
  const top = tops.flatMap((b) => chain(b)).filter((b) => b.type !== 'ts_plot_signal');
  const cards = asCards(top, analysis, (b, f) => c.varName(b, f));
  const plot = plotFromBlocks(allBlocks(tops));
  const empty = { sweeps: [], measures: [], tolerance: null, custom: null, blocks: ws, ...(plot ? { plot } : {}) } as Study;
  if (cards) return { study: { ...empty, ...cards }, ltspice: true, errors: [] };
  const lines = c.stmts(top, []);
  const plots = c.plots.map((p) => `* grafico ${p.id} ${p.x} ${p.y}`);
  return {
    study: { ...empty, custom: { mode: 'full', body: [BLOCKS_MARK, ...plots, ...lines].join('\n'), before: '', after: '', final: '' } },
    ltspice: false,
    errors: c.errors,
  };
}

// --- tarjetas → bloques ---------------------------------------------------------------------

/** Programa de bloques equivalente a las tarjetas (barridos anidados → simular → medir) */
export function studyToBlocks(st: Study): WorkspaceJson {
  const variables: { name: string; id: string }[] = [];
  const v = (name: string) => {
    let x = variables.find((q) => q.name === name);
    if (!x) variables.push((x = { name, id: `var_${name}` }));
    return { id: x.id };
  };
  const link = (list: BlockJson[]): BlockJson | undefined => {
    for (let i = list.length - 2; i >= 0; i--) list[i].next = { block: list[i + 1] };
    return list[0];
  };
  const measures: BlockJson[] = st.measures
    .filter((m) => m.enabled && BLOCK_MEASURES.some(([k]) => k === m.kind))
    .map((m) => ({
      type: 'ts_measure',
      fields: { KIND: m.kind, SIGNAL: m.signal, A: m.at ?? m.level ?? '', B: m.level2 ?? '', VAR: v(m.name) },
    }));
  let core: BlockJson[] = [{ type: 'ts_simulate' }, ...measures];
  const sweeps = st.sweeps.filter((s) => s.enabled && targetKey(s.target));
  sweeps.forEach((s, i) => {
    const name = 'name' in s.target ? s.target.name : 'temp';
    const varField = v(i === 0 && sweeps.length === 1 ? name : `${name}`);
    const loop: BlockJson =
      s.mode === 'list'
        ? { type: 'ts_for_list', fields: { VAR: varField, TARGET: targetKey(s.target), VALUES: s.list } }
        : { type: 'ts_for_range', fields: { VAR: varField, TARGET: targetKey(s.target), MODE: s.mode, START: s.start, STOP: s.stop, STEP: s.step } };
    loop.inputs = { DO: { block: link(core) } };
    core = [loop];
  });
  // la vista de resultados, como bloques "Graficar señal" al final
  for (const [kind, panes] of Object.entries(st.plot ?? {})) {
    panes.forEach((p, pi) =>
      p.traces.forEach((t) =>
        core.push({ type: 'ts_plot_signal', fields: { SIGNAL: t.expr, PANE: pi + 1, COLOR: t.color && PLOT_COLORS.some(([, c]) => c === t.color) ? t.color : 'auto', ANALYSIS: kind } }),
      ),
    );
  }
  const top = link(core)!;
  top.x = 20;
  top.y = 20;
  return { blocks: { languageVersion: 0, blocks: [top] }, variables };
}
