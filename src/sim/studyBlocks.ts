// Estudio con bloques (Blockly): definiciones, caja de herramientas y compilación del JSON
// serializado a tarjetas (si el programa es "barrer → simular → medir", así el .asc sigue
// simulando igual en LTspice) o a un bloque .control (si usa lógica que LTspice no tiene).
// Trabaja sobre el JSON de Blockly, sin depender de Blockly (se puede testear en Node).
import { formatSpiceNumber, parseSpiceNumber } from '../netlist/spicenum.ts';
import { parseStep } from '../netlist/step.ts';
import { PALETTE, type PlotView } from '../waveform/view.ts';
import type { MeasAnalysis } from './meas.ts';
import { measureLines, MEASURE_KINDS, stepLine, type MeasureKind, type Study, type StudyMeasure, type StudySweep, type SweepTarget } from './study.ts';
import { t } from '../i18n/i18n.ts';

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

export const COLORS = { sim: 210, circuit: 20, loop: 120, measure: 290, show: 160, list: 260, escape: 0 };

/** Análisis de los bloques "Correr análisis" y de los que eligen sobre qué resultados trabajar */
export const RESULT_ANALYSES: [string, string][] = [
  [t('operating point'), 'op'],
  [t('transient'), 'tran'],
  ['AC', 'ac'],
  [t('dc sweep'), 'dc'],
  [t('noise'), 'noise'],
  [t('transfer function'), 'tf'],
];

/** Medidas de "Medir más" (block-only: se calculan en el .control, no tienen tarjeta) */
export const EXTRA_MEASURES: [string, string][] = [
  [t('the overshoot (%)'), 'overshoot'],
  [t('the settling time (band A %)'), 'settle'],
  [t('the slew rate (max |dV/dt|)'), 'slew'],
  [t('the gain margin (dB)'), 'gainMargin'],
];

/** Funciones sobre un vector de resultados */
export const VECTOR_FUNCTIONS: [string, string][] = [
  [t('the value (operating point / first point)'), 'first'],
  [t('the final value'), 'last'],
  [t('the maximum'), 'max'],
  [t('the minimum'), 'min'],
  [t('the mean'), 'mean'],
];

/** Estadísticas de una lista */
export const LIST_STATS: [string, string][] = [
  [t('the mean'), 'mean'],
  [t('the standard deviation'), 'stddev'],
  [t('the minimum'), 'min'],
  [t('the maximum'), 'max'],
  [t('the % between A and B'), 'yield'],
];

/** Opciones del simulador del bloque "Opción" */
export const SIM_OPTIONS = ['reltol', 'abstol', 'vntol', 'chgtol', 'gmin', 'method', 'maxord', 'itl1', 'itl4', 'temp', 'tnom'];

/** Objetivos de un barrido o de "poner": "component:R1", "param:k", "source:V1", "temp" */
export function targetOf(v: string): SweepTarget | null {
  const [kind, name] = v.split(':');
  if (kind === 'temp') return { kind: 'temp' };
  if (!name) return null;
  if (kind === 'component' || kind === 'param' || kind === 'source') return { kind, name };
  return null;
}

export const targetKey = (tt: SweepTarget) => (tt.kind === 'temp' ? 'temp' : tt.kind === 'model' ? '' : `${tt.kind}:${tt.name}`);

/** Mediciones que se pueden usar desde bloques (con su análisis) */
export const BLOCK_MEASURES: [MeasureKind, string, MeasAnalysis | null][] = [
  ['max', t('the maximum'), null],
  ['min', t('the minimum'), null],
  ['pp', t('the peak-to-peak'), null],
  ['avg', t('the average'), null],
  ['rms', t('the RMS value'), 'tran'],
  ['at', t('the value at (A)'), null],
  ['rise', t('the rise time (from A to B)'), 'tran'],
  ['fall', t('the fall time (from A to B)'), 'tran'],
  ['period', t('the period (crossing A)'), 'tran'],
  ['freq', t('the frequency (crossing A)'), 'tran'],
  ['gainAt', t('the gain in dB at frequency A'), 'ac'],
  ['f3db', t('the cutoff frequency (−3 dB)'), 'ac'],
  ['f0db', t('the 0 dB crossover frequency'), 'ac'],
  ['phaseMargin', t('the phase margin'), 'ac'],
];

/** Colores del bloque "Graficar señal" (la paleta del visor) */
export const PLOT_COLORS: [string, string][] = [
  [t('automatic'), 'auto'],
  ...(['green', 'blue', 'red', 'turquoise', 'violet', 'gray', 'orange', 'olive', 'fuchsia', 'dark blue'] as const).map((n, i): [string, string] => [t(n), PALETTE[i]]),
];

/** Definiciones JSON de los bloques propios; los desplegables de componentes los completa la UI */
export function blockDefinitions(): object[] {
  const stmt = { previousStatement: null, nextStatement: null };
  return [
    { type: 'ts_simulate', message0: t('Simulate the schematic\'s analysis'), colour: COLORS.sim, tooltip: t('Runs the schematic\'s analyses (.tran, .ac…)'), ...stmt },
    {
      type: 'ts_for_list',
      message0: t('For each value %1 of %2 in %3 %4 %5'),
      args0: [
        { type: 'field_variable', name: 'VAR', variable: t('value') },
        { type: 'field_dropdown', name: 'TARGET', options: [[t('(choose)'), '']] },
        { type: 'field_input', name: 'VALUES', text: '1k 2k 5k' },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: COLORS.loop,
      tooltip: t('Repeats the inner blocks with each value (separated by spaces)'),
      ...stmt,
    },
    {
      type: 'ts_for_range',
      message0: t('For each value %1 of %2 %3 from %4 to %5 step %6 %7 %8'),
      args0: [
        { type: 'field_variable', name: 'VAR', variable: t('value') },
        { type: 'field_dropdown', name: 'TARGET', options: [[t('(choose)'), '']] },
        { type: 'field_dropdown', name: 'MODE', options: [[t('linear'), 'lin'], [t('per decade'), 'dec'], [t('per octave'), 'oct']] },
        { type: 'field_input', name: 'START', text: '1k' },
        { type: 'field_input', name: 'STOP', text: '10k' },
        { type: 'field_input', name: 'STEP', text: '1k' },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: COLORS.loop,
      tooltip: t('Linear sweep (step) or logarithmic (points per decade/octave)'),
      ...stmt,
    },
    {
      type: 'ts_repeat',
      message0: t('Repeat %1 times %2 %3'),
      args0: [{ type: 'field_number', name: 'TIMES', value: 3, min: 1, precision: 1 }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
      colour: COLORS.loop,
      ...stmt,
    },
    {
      type: 'ts_set',
      message0: t('Set %1 to %2'),
      args0: [{ type: 'field_dropdown', name: 'TARGET', options: [[t('(choose)'), '']] }, { type: 'input_value', name: 'VALUE' }],
      colour: COLORS.circuit,
      tooltip: t('Changes the value of a component, a parameter, a source or the temperature'),
      ...stmt,
    },
    {
      type: 'ts_measure',
      message0: t('Measure %1 of %2 A %3 B %4 → %5'),
      args0: [
        { type: 'field_dropdown', name: 'KIND', options: BLOCK_MEASURES.map(([k, l]) => [l, k]) },
        { type: 'field_input', name: 'SIGNAL', text: 'V(out)' },
        { type: 'field_input', name: 'A', text: '' },
        { type: 'field_input', name: 'B', text: '' },
        { type: 'field_variable', name: 'VAR', variable: 'medida' },
      ],
      colour: COLORS.measure,
      tooltip: t('Measures the signal in the last simulation and stores the result in the variable'),
      ...stmt,
    },
    {
      type: 'ts_print',
      message0: t('Print to the Log %1'),
      args0: [{ type: 'input_value', name: 'VALUE' }],
      colour: COLORS.show,
      ...stmt,
    },
    {
      type: 'ts_message',
      message0: 'Mensaje %1',
      args0: [{ type: 'field_input', name: 'TEXT', text: t('done') }],
      colour: COLORS.show,
      ...stmt,
    },
    {
      type: 'ts_plot_xy',
      message0: t('Plot %1 against %2'),
      args0: [
        { type: 'field_variable', name: 'Y', variable: 'medida' },
        { type: 'field_variable', name: 'X', variable: t('value') },
      ],
      colour: COLORS.show,
      tooltip: t('Adds an (x, y) point every time it runs; when done the plot shows up'),
      ...stmt,
    },
    {
      type: 'ts_plot_signal',
      message0: t('Plot signal %1 in pane %2 with color %3 in %4'),
      args0: [
        { type: 'field_input', name: 'SIGNAL', text: 'V(out)' },
        { type: 'field_number', name: 'PANE', value: 1, min: 1, precision: 1 },
        { type: 'field_dropdown', name: 'COLOR', options: PLOT_COLORS },
        {
          type: 'field_dropdown',
          name: 'ANALYSIS',
          options: [
            [t('transient'), 'tran'],
            ['AC (Bode)', 'ac'],
            [t('dc sweep'), 'dc'],
            [t('noise'), 'noise'],
          ],
        },
      ],
      colour: COLORS.show,
      tooltip: t('What to show in that analysis\' results (same as "Remember view"); it doesn\'t run on every run'),
      ...stmt,
    },
    ...moreBlockDefinitions(),
  ];
}

/** Bloques de #179: análisis, circuito, medidas, listas, tabla, control y escape */
function moreBlockDefinitions(): object[] {
  const stmt = { previousStatement: null, nextStatement: null };
  const value = { output: null };
  const inp = (name: string, text = '') => ({ type: 'field_input', name, text });
  const v = (name: string, variable: string) => ({ type: 'field_variable', name, variable });
  const dd = (name: string, options: [string, string][]) => ({ type: 'field_dropdown', name, options });
  const sweepModes: [string, string][] = [[t('per decade'), 'dec'], [t('per octave'), 'oct'], [t('linear'), 'lin']];
  return [
    // --- simular
    { type: 'ts_op', message0: t('Run operating point (.op)'), colour: COLORS.sim, tooltip: t('Runs a DC operating point analysis'), ...stmt },
    {
      type: 'ts_tran',
      message0: t('Run transient until %1 step %2 from %3 uic %4'),
      args0: [inp('TSTOP', '10m'), inp('TSTEP', ''), inp('TSTART', ''), { type: 'field_checkbox', name: 'UIC', checked: false }],
      colour: COLORS.sim,
      tooltip: t('Runs a transient analysis (empty step: automatic)'),
      ...stmt,
    },
    {
      type: 'ts_ac',
      message0: t('Run AC %1 %2 points from %3 to %4'),
      args0: [dd('MODE', sweepModes), inp('POINTS', '20'), inp('FSTART', '1'), inp('FSTOP', '1meg')],
      colour: COLORS.sim,
      tooltip: t('Runs a small-signal frequency response (the input source needs "AC 1")'),
      ...stmt,
    },
    {
      type: 'ts_dc',
      message0: t('Run DC sweep of %1 from %2 to %3 step %4'),
      args0: [dd('SOURCE', [[t('(choose)'), '']]), inp('START', '0'), inp('STOP', '5'), inp('STEP', '0.1')],
      colour: COLORS.sim,
      tooltip: t('Sweeps the DC value of a source'),
      ...stmt,
    },
    {
      type: 'ts_noise',
      message0: t('Run noise at %1 with input %2 %3 %4 points from %5 to %6'),
      args0: [inp('OUT', 'V(out)'), dd('SOURCE', [[t('(choose)'), '']]), dd('MODE', sweepModes), inp('POINTS', '10'), inp('FSTART', '1'), inp('FSTOP', '1meg')],
      colour: COLORS.sim,
      tooltip: t('Runs a noise analysis (output voltage and input source)'),
      ...stmt,
    },
    {
      type: 'ts_tf',
      message0: t('Run transfer function of %1 from %2'),
      args0: [inp('OUT', 'V(out)'), dd('SOURCE', [[t('(choose)'), '']])],
      colour: COLORS.sim,
      tooltip: t('Small-signal gain, input and output resistance (.tf)'),
      ...stmt,
    },
    { type: 'ts_reset', message0: t('Restore the circuit'), colour: COLORS.sim, tooltip: t('Goes back to the original values of the circuit (reset)'), ...stmt },
    {
      type: 'ts_option',
      message0: t('Simulator option %1 = %2'),
      args0: [dd('NAME', SIM_OPTIONS.map((o): [string, string] => [o, o])), inp('VALUE', '1e-4')],
      colour: COLORS.sim,
      tooltip: t('Changes a simulator option (reltol, abstol, method…) for the next analyses'),
      ...stmt,
    },
    {
      type: 'ts_setplot',
      message0: t('Use the results of %1'),
      args0: [dd('ANALYSIS', RESULT_ANALYSES)],
      colour: COLORS.sim,
      tooltip: t('Chooses the last run of that analysis for the following blocks (setplot)'),
      ...stmt,
    },
    // --- circuito
    {
      type: 'ts_temp',
      message0: t('Set the temperature to %1 °C'),
      args0: [{ type: 'input_value', name: 'VALUE' }],
      colour: COLORS.circuit,
      ...stmt,
    },
    {
      type: 'ts_altermod',
      message0: t('Set parameter %1 of model %2 to %3'),
      args0: [inp('PARAM', 'is'), inp('MODEL', ''), { type: 'input_value', name: 'VALUE' }],
      colour: COLORS.circuit,
      tooltip: t('Changes a parameter of a .model (altermod)'),
      ...stmt,
    },
    {
      type: 'ts_alter_inst',
      message0: t('Set parameter %1 of %2 to %3'),
      args0: [inp('PARAM', 'area'), inp('INST', ''), { type: 'input_value', name: 'VALUE' }],
      colour: COLORS.circuit,
      tooltip: t('Changes a parameter of a component, e.g. the area of Q1 (alter @Q1[area])'),
      ...stmt,
    },
    {
      type: 'ts_source',
      message0: t('Set %1 of source %2 to %3'),
      args0: [dd('WHAT', [[t('the DC value'), 'dc'], [t('the AC amplitude'), 'acmag'], [t('the AC phase'), 'acphase']]), dd('SOURCE', [[t('(choose)'), '']]), { type: 'input_value', name: 'VALUE' }],
      colour: COLORS.circuit,
      ...stmt,
    },
    {
      type: 'ts_seed',
      message0: t('Random seed %1'),
      args0: [{ type: 'field_number', name: 'SEED', value: 1, min: 1, precision: 1 }],
      colour: COLORS.circuit,
      tooltip: t('Fixes the random numbers: the same seed repeats the same runs'),
      ...stmt,
    },
    {
      type: 'ts_random',
      message0: t('random %1 around %2 ± %3 %%'),
      args0: [dd('DIST', [[t('uniform'), 'uniform'], [t('gaussian'), 'gauss']]), { type: 'input_value', name: 'NOM' }, { type: 'field_number', name: 'TOL', value: 5, min: 0 }],
      inputsInline: true,
      colour: COLORS.circuit,
      tooltip: t('A different random value every time: uniform within the tolerance, or gaussian with 3σ = the tolerance'),
      ...value,
    },
    // --- medir
    {
      type: 'ts_measure_more',
      message0: t('Measure %1 of %2 A %3 → %4'),
      args0: [dd('KIND', EXTRA_MEASURES), inp('SIGNAL', 'V(out)'), inp('A', ''), v('VAR', 'medida')],
      colour: COLORS.measure,
      tooltip: t('Measures on the last transient (overshoot, settling, slew rate) or AC (gain margin) run'),
      ...stmt,
    },
    {
      type: 'ts_vector',
      message0: t('Compute %1 of %2 in %3 → %4'),
      args0: [dd('FN', VECTOR_FUNCTIONS), inp('SIGNAL', 'V(out)'), dd('ANALYSIS', RESULT_ANALYSES), v('VAR', 'medida')],
      colour: COLORS.measure,
      tooltip: t('A value of a result vector, e.g. V(out) or I(V1) after the operating point'),
      ...stmt,
    },
    // --- listas y estadística
    {
      type: 'ts_list_new',
      message0: t('Empty the list %1'),
      args0: [v('LIST', t('list'))],
      colour: COLORS.list,
      ...stmt,
    },
    {
      type: 'ts_list_add',
      message0: t('Add %1 to the list %2'),
      args0: [{ type: 'input_value', name: 'VALUE' }, v('LIST', t('list'))],
      colour: COLORS.list,
      tooltip: t('Accumulates a value (e.g. one measurement per run)'),
      ...stmt,
    },
    {
      type: 'ts_list_length',
      message0: t('length of %1'),
      args0: [v('LIST', t('list'))],
      colour: COLORS.list,
      ...value,
    },
    {
      type: 'ts_list_item',
      message0: t('item %1 of %2'),
      args0: [{ type: 'field_number', name: 'INDEX', value: 1, min: 1, precision: 1 }, v('LIST', t('list'))],
      colour: COLORS.list,
      ...value,
    },
    {
      type: 'ts_list_stat',
      message0: t('Compute %1 of the list %2 A %3 B %4 → %5'),
      args0: [dd('STAT', LIST_STATS), v('LIST', t('list')), inp('A', ''), inp('B', ''), v('VAR', t('result'))],
      colour: COLORS.list,
      tooltip: t('Statistics of a list; "%" is the yield: the percentage of values between A and B (either can be empty)'),
      ...stmt,
    },
    // --- mostrar
    {
      type: 'ts_table_row',
      message0: t('Add a row to the table with %1'),
      args0: [inp('COLS', 'medida')],
      colour: COLORS.show,
      tooltip: t('Variable names separated by spaces: one column each. The table, its statistics and histograms are in Measurements'),
      ...stmt,
    },
    {
      type: 'ts_histogram',
      message0: t('Histogram of the list %1'),
      args0: [v('LIST', t('list'))],
      colour: COLORS.show,
      tooltip: t('Shows the list in Measurements, with its statistics and histogram'),
      ...stmt,
    },
    {
      type: 'ts_plot_lists',
      message0: t('Plot the list %1 against the list %2'),
      args0: [v('Y', t('list')), v('X', t('list'))],
      colour: COLORS.show,
      ...stmt,
    },
    // --- escape
    {
      type: 'ts_command',
      message0: t('ngspice command %1'),
      args0: [inp('TEXT', 'echo hola')],
      colour: COLORS.escape,
      tooltip: t('A .control line as is, for what has no block'),
      ...stmt,
    },
    {
      type: 'ts_expr',
      message0: t('expression %1'),
      args0: [inp('TEXT', '2*pi*1k')],
      colour: COLORS.escape,
      tooltip: t('An ngspice expression (variables: $v_name)'),
      ...value,
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
      cat(t('Simulate'), COLORS.sim, [b('ts_simulate'), b('ts_op'), b('ts_tran'), b('ts_ac'), b('ts_dc'), b('ts_noise'), b('ts_tf'), b('ts_setplot'), b('ts_reset'), b('ts_option')]),
      cat(t('Circuit'), COLORS.circuit, [
        b('ts_set', { inputs: { VALUE: num(1000) } }),
        b('ts_source', { inputs: { VALUE: num(1) } }),
        b('ts_temp', { inputs: { VALUE: num(27) } }),
        b('ts_altermod', { inputs: { VALUE: num(1e-14) } }),
        b('ts_alter_inst', { inputs: { VALUE: num(1) } }),
        b('ts_seed'),
        b('ts_random', { inputs: { NOM: num(1000) } }),
      ]),
      cat(t('Repeat'), COLORS.loop, [b('ts_for_list'), b('ts_for_range'), b('ts_repeat'), b('controls_whileUntil'), b('controls_flow_statements')]),
      cat(t('Measure'), COLORS.measure, [b('ts_measure'), b('ts_measure_more'), b('ts_vector')]),
      cat(t('Lists'), COLORS.list, [b('ts_list_new'), b('ts_list_add'), b('ts_list_length'), b('ts_list_item'), b('ts_list_stat')]),
      cat(t('Compute'), '%{BKY_MATH_HUE}', [b('math_number'), b('math_arithmetic', { inputs: { A: num(1), B: num(1) } }), b('math_single', { inputs: { NUM: num(9) } })]),
      cat(t('Logic'), '%{BKY_LOGIC_HUE}', [b('controls_if'), b('logic_compare'), b('logic_operation'), b('logic_negate'), b('logic_boolean')]),
      cat('Variables', '%{BKY_VARIABLES_HUE}', [], { custom: 'VARIABLE' }),
      cat(t('Functions'), '%{BKY_PROCEDURES_HUE}', [], { custom: 'PROCEDURE' }),
      cat(t('Show'), COLORS.show, [b('ts_plot_signal'), b('ts_plot_xy'), b('ts_plot_lists'), b('ts_table_row'), b('ts_histogram'), b('ts_print'), b('ts_message'), b('text'), b('text_join')]),
      cat(t('ngspice'), COLORS.escape, [b('ts_command'), b('ts_expr')]),
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
/** Línea del log con una fila de la tabla ("TS-ROW a= 1 b= 2") */
export const ROW_PREFIX = 'TS-ROW';
/** Línea del log con los valores de una lista para su histograma ("TS-HIST nombre v1 v2…") */
export const HIST_PREFIX = 'TS-HIST';
/** Línea del log con dos listas a graficar ("TS-XYL y x @ x1 x2… @ y1 y2…") */
export const XYL_PREFIX = 'TS-XYL';

/** Señal escrita como en el visor (V(out), I(V1)) → vector de ngspice (v(out), i(v1)) */
const ngSignal = (s: string) => s.trim().replace(/\bV\(/g, 'v(').replace(/\bI\(([^()]+)\)/g, (_, n: string) => `i(${n.toLowerCase()})`);

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
  /** listas usadas: se inicializan vacías al principio del programa */
  lists = new Set<string>();
  /** funciones propias (procedures_defnoreturn) por nombre */
  procs = new Map<string, BlockJson>();
  private calling: string[] = [];
  private vars: Map<string, string>;
  private analysis: MeasAnalysis;

  constructor(ws: WorkspaceJson, analysis: MeasAnalysis) {
    this.vars = new Map((ws.variables ?? []).map((v) => [v.id, v.name]));
    this.analysis = analysis;
  }

  /** Campo obligatorio (número o texto de ngspice); avisa si está vacío o no es un número */
  required(b: BlockJson, f: string, what: string, numeric = true): string {
    const v = field(b, f).trim();
    if (!v) this.errors.push(t('Fill in {what}', { what }));
    else if (numeric && !Number.isFinite(parseSpiceNumber(v))) this.errors.push(t('Invalid number in {what}: {v}', { what, v }));
    return v;
  }

  /** Fuente elegida en un bloque (dc, noise, tf, cambiar fuente) */
  source(b: BlockJson): string {
    const v = field(b, 'SOURCE').trim();
    if (!v) this.errors.push(t('Choose the source in a "{block}" block', { block: b.type.replace(/^ts_/, '') }));
    return v.toLowerCase();
  }

  /** Lista de la variable del campo (recuerda que hay que inicializarla) */
  list(b: BlockJson, f: string): string {
    const n = this.shell(this.varName(b, f));
    this.lists.add(n);
    return n;
  }

  /** Un análisis corrido desde un bloque: queda recordado su plot para medir sobre él */
  analysisLines(line: string, kind: string): string[] {
    return [line.replace(/\s+/g, ' ').trim(), `set ts_plot_${kind} = $curplot`];
  }

  /** "let ts_tmp = <expr>" y su valor como variable de shell ($ts_val) */
  value(b: BlockJson | undefined): string[] {
    return [`let ts_tmp = ${this.expr(b)}`, 'set ts_val = "$&ts_tmp"'];
  }

  /** Guarda el vector ts_tmp en la variable de shell del bloque */
  store = (name: string) => `set ${this.shell(name)} = "$&ts_tmp"`;

  varName(b: BlockJson, f: string): string {
    const v = b.fields?.[f] as { id?: string; name?: string } | string | undefined;
    const name = typeof v === 'string' ? v : (v?.name ?? (v?.id ? this.vars.get(v.id) : undefined));
    return (name ?? 'x').replace(/[^\w]/g, '_');
  }

  /** Variable de shell de ngspice que guarda la variable del bloque */
  shell = (name: string) => `v_${name}`;

  expr(b: BlockJson | undefined): string {
    if (!b) {
      this.errors.push(t('A block is missing a value'));
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
        this.errors.push(t('Operation not available: {p0}', { p0: field(b, 'OP') }));
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
      case 'ts_random': {
        const tol = Number(b.fields?.TOL ?? 0) / 100;
        const nom = this.expr(input(b, 'NOM'));
        // gaussiana: la tolerancia es 3σ
        return field(b, 'DIST') === 'gauss' ? `(${nom} * (1 + ${tol / 3} * sgauss(0)))` : `(${nom} * (1 + ${tol} * sunif(0)))`;
      }
      case 'ts_list_length':
        return `$#${this.list(b, 'LIST')}`;
      case 'ts_list_item':
        return `$${this.list(b, 'LIST')}[${Math.max(1, Math.round(Number(b.fields?.INDEX ?? 1)))}]`;
      case 'ts_expr': {
        const e = field(b, 'TEXT').trim();
        if (!e) this.errors.push(t('An "expression" block is empty'));
        return `(${e || 0})`;
      }
      default:
        this.errors.push(t('Unsupported value block: {type}', { type: b.type }));
        return '0';
    }
  }

  /** Asigna un objetivo (componente, parámetro, fuente, temperatura) desde una variable de shell */
  assign(tt: SweepTarget, value: string): string[] {
    switch (tt.kind) {
      case 'component':
        return [`alter ${tt.name.toLowerCase()} = ${value}`];
      case 'source':
        return [`alter ${tt.name.toLowerCase()} dc = ${value}`];
      case 'param':
        return [`alterparam ${tt.name} = ${value}`, 'reset'];
      case 'temp':
        return [`option temp = ${value}`];
      default:
        return [];
    }
  }

  values(b: BlockJson): string[] | null {
    const tt = targetOf(field(b, 'TARGET'));
    if (!tt) {
      this.errors.push(t('Choose what to vary in a "For each value" block'));
      return null;
    }
    const s = loopSweep(b, tt);
    const r = parseStep(stepLine(s));
    if (typeof r === 'string') {
      this.errors.push(t('Invalid values in "For each value of {p0}": {r}', { p0: 'name' in tt ? tt.name : t('temperature'), r }));
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

  /** Sobrepico, establecimiento, slew rate y margen de ganancia (sólo bloques) */
  measureMore(b: BlockJson): string[] {
    const name = this.varName(b, 'VAR');
    const sig = ngSignal(this.required(b, 'SIGNAL', t('the signal of "Measure"'), false) || 'v(out)');
    const out = (lines: string[]) => [...lines, this.store(name)];
    switch (field(b, 'KIND')) {
      case 'overshoot':
        return out(['setplot $ts_plot_tran', `let ts_y = ${sig}`, 'let ts_final = ts_y[length(ts_y)-1]', 'let ts_tmp = 100*(vecmax(ts_y)-ts_final)/ts_final']);
      case 'settle': {
        const band = parseSpiceNumber(field(b, 'A').trim() || '2');
        if (!Number.isFinite(band)) this.errors.push(t('Invalid number in {what}: {v}', { what: t('the settling band'), v: field(b, 'A') }));
        // la última vez que el error sale de la banda alrededor del valor final
        return out([
          'setplot $ts_plot_tran',
          `let ts_y = ${sig}`,
          'let ts_final = ts_y[length(ts_y)-1]',
          'let ts_err = abs(ts_y-ts_final)',
          `let ts_lim = ${(Number.isFinite(band) ? band : 2) / 100}*abs(ts_final)`,
          'meas tran ts_settle when ts_err=$&ts_lim cross=last',
          'let ts_tmp = ts_settle',
        ]);
      }
      case 'slew':
        return out(['setplot $ts_plot_tran', `let ts_tmp = vecmax(abs(deriv(${sig})))`]);
      case 'gainMargin':
        // donde la fase (continua) cruza −180°, cuánto le falta a la ganancia para 0 dB
        return out(['setplot $ts_plot_ac', `let ts_ph = cph(${sig})`, 'meas ac ts_f180 when ts_ph=-3.14159265 cross=1', `let ts_gdb = db(${sig})`, 'meas ac ts_g180 find ts_gdb at=$&ts_f180', 'let ts_tmp = -ts_g180']);
      default:
        this.errors.push(t('Unsupported block: {type}', { type: field(b, 'KIND') }));
        return [];
    }
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
        const tt = targetOf(field(b, 'TARGET'));
        if (!vals || !tt) return [];
        const v = this.shell(this.varName(b, 'VAR'));
        const sc = [...scope, { t: tt, v }];
        // con un parámetro (reset) hay que volver a aplicar los valores de los bucles de afuera
        const params = sc.filter((x) => x.t.kind === 'param');
        const setup = params.length
          ? [...params.map((x) => `alterparam ${(x.t as { name: string }).name} = $${x.v}`), 'reset', ...sc.filter((x) => x.t.kind !== 'param').flatMap((x) => this.assign(x.t, `$${x.v}`))]
          : this.assign(tt, `$${v}`);
        return [`foreach ${v} ${vals.join(' ')}`, ...setup.map((l) => `  ${l}`), ...body('DO', sc), 'end'];
      }
      case 'ts_repeat':
        return [`repeat ${Math.max(1, Math.round(Number(b.fields?.TIMES ?? 1)))}`, ...body('DO'), 'end'];
      case 'ts_set': {
        const tt = targetOf(field(b, 'TARGET'));
        if (!tt) {
          this.errors.push(t('Choose what to change in a "Set" block'));
          return [];
        }
        return ['let ts_tmp = ' + this.expr(input(b, 'VALUE')), 'set ts_val = "$&ts_tmp"', ...this.assign(tt, '$ts_val')];
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
        if (v?.type === 'text_join') {
          const n = Number(v.extraState?.itemCount ?? 2);
          const parts = Array.from({ length: n }, (_, i) => input(v, `ADD${i}`)).filter((x): x is BlockJson => !!x);
          const pre: string[] = [];
          const words = parts.map((x, i) => {
            if (x.type === 'text') return field(x, 'TEXT').replace(/"/g, "'");
            if (x.type === 'variables_get') return `$${this.shell(this.varName(x, 'VAR'))}`;
            pre.push(`let ts_j${i} = ${this.expr(x)}`);
            return `$&ts_j${i}`;
          });
          return [...pre, `echo "${words.join(' ')}"`];
        }
        return [`let ts_tmp = ${this.expr(v)}`, 'echo $&ts_tmp'];
      }
      case 'ts_message':
        return [`echo "${field(b, 'TEXT').replace(/"/g, "'")}"`];
      // --- simular (#179)
      case 'ts_op':
        return this.analysisLines('op', 'op');
      case 'ts_tran': {
        const stop = this.required(b, 'TSTOP', t('the stop time of "Run transient"'));
        const step = field(b, 'TSTEP').trim();
        const start = field(b, 'TSTART').trim();
        // sin paso: el que usa LTspice por defecto (tstop/1000 ya lo ajusta ngspice a su máximo)
        const st = step || (Number.isFinite(parseSpiceNumber(stop)) ? formatSpiceNumber(parseSpiceNumber(stop) / 1000) : '');
        const uic = b.fields?.UIC === true || b.fields?.UIC === 'TRUE';
        return this.analysisLines(`tran ${st} ${stop} ${start || (uic ? '0' : '')} ${uic ? 'uic' : ''}`, 'tran');
      }
      case 'ts_ac': {
        const n = this.required(b, 'POINTS', t('the points of "Run AC"'));
        const f1 = this.required(b, 'FSTART', t('the start frequency of "Run AC"'));
        const f2 = this.required(b, 'FSTOP', t('the stop frequency of "Run AC"'));
        return this.analysisLines(`ac ${field(b, 'MODE') || 'dec'} ${n} ${f1} ${f2}`, 'ac');
      }
      case 'ts_dc': {
        const src = this.source(b);
        const vals = ['START', 'STOP', 'STEP'].map((f) => this.required(b, f, t('the values of "Run DC sweep"')));
        return this.analysisLines(`dc ${src} ${vals.join(' ')}`, 'dc');
      }
      case 'ts_noise': {
        const out = this.required(b, 'OUT', t('the output of "Run noise"'), false);
        const src = this.source(b);
        const n = this.required(b, 'POINTS', t('the points of "Run noise"'));
        const f1 = this.required(b, 'FSTART', t('the start frequency of "Run noise"'));
        const f2 = this.required(b, 'FSTOP', t('the stop frequency of "Run noise"'));
        return this.analysisLines(`noise ${ngSignal(out)} ${src} ${field(b, 'MODE') || 'dec'} ${n} ${f1} ${f2}`, 'noise');
      }
      case 'ts_tf': {
        const out = this.required(b, 'OUT', t('the output of "Run transfer function"'), false);
        return this.analysisLines(`tf ${ngSignal(out)} ${this.source(b)}`, 'tf');
      }
      case 'ts_reset':
        return ['reset'];
      case 'ts_option': {
        const name = field(b, 'NAME');
        const v = this.required(b, 'VALUE', t('the value of option {name}', { name }), name !== 'method');
        if (!SIM_OPTIONS.includes(name)) this.errors.push(t('Unknown simulator option: {name}', { name }));
        return [`option ${name} = ${v}`];
      }
      case 'ts_setplot':
        return [`setplot $ts_plot_${field(b, 'ANALYSIS') || 'tran'}`];
      // --- circuito
      case 'ts_temp':
        return [...this.value(input(b, 'VALUE')), 'option temp = $ts_val'];
      case 'ts_altermod': {
        const model = this.required(b, 'MODEL', t('the model of "Set parameter of model"'), false);
        const param = this.required(b, 'PARAM', t('the parameter of "Set parameter of model"'), false);
        return [...this.value(input(b, 'VALUE')), `altermod ${model.toLowerCase()} ${param.toLowerCase()} = $ts_val`];
      }
      case 'ts_alter_inst': {
        const inst = this.required(b, 'INST', t('the component of "Set parameter of"'), false);
        const param = this.required(b, 'PARAM', t('the parameter of "Set parameter of"'), false);
        return [...this.value(input(b, 'VALUE')), `alter @${inst.toLowerCase()}[${param.toLowerCase()}] = $ts_val`];
      }
      case 'ts_source': {
        const src = this.source(b);
        return [...this.value(input(b, 'VALUE')), `alter ${src} ${field(b, 'WHAT') || 'dc'} = $ts_val`];
      }
      case 'ts_seed':
        return [`setseed ${Math.max(1, Math.round(Number(b.fields?.SEED ?? 1)))}`];
      // --- medir
      case 'ts_measure_more':
        return this.measureMore(b);
      case 'ts_vector': {
        const sig = this.required(b, 'SIGNAL', t('the signal of "Compute"'), false);
        const an = field(b, 'ANALYSIS') || 'op';
        // AC: el módulo (los vectores son complejos)
        const v = an === 'ac' || an === 'noise' ? `mag(${ngSignal(sig)})` : ngSignal(sig);
        const f = { first: `${v}[0]`, last: `${v}[length(${v})-1]`, max: `vecmax(${v})`, min: `vecmin(${v})`, mean: `mean(${v})` }[field(b, 'FN')] ?? `${v}[0]`;
        return [`setplot $ts_plot_${an}`, `let ts_tmp = ${f}`, this.store(this.varName(b, 'VAR'))];
      }
      // --- listas
      case 'ts_list_new':
        return [`set ${this.list(b, 'LIST')} = ( )`];
      case 'ts_list_add': {
        const l = this.list(b, 'LIST');
        return [...this.value(input(b, 'VALUE')), `set ${l} = ( $${l} $ts_val )`];
      }
      case 'ts_list_stat': {
        const l = this.list(b, 'LIST');
        const out = this.varName(b, 'VAR');
        const stat = field(b, 'STAT');
        const lim = (f: string) => {
          const v = field(b, f).trim();
          if (v && !Number.isFinite(parseSpiceNumber(v))) this.errors.push(t('Invalid number in {what}: {v}', { what: t('the limits of the list statistics'), v }));
          return v ? String(parseSpiceNumber(v)) : '';
        };
        let e: string;
        if (stat === 'yield') {
          const [lo, hi] = [lim('A'), lim('B')];
          const cond = [lo && `(ts_vec ge ${lo})`, hi && `(ts_vec le ${hi})`].filter(Boolean).join(' and ') || '(ts_vec eq ts_vec)';
          e = `100*mean(${cond})`;
        } else e = { mean: 'mean(ts_vec)', stddev: 'stddev(ts_vec)', min: 'vecmin(ts_vec)', max: 'vecmax(ts_vec)' }[stat] ?? 'mean(ts_vec)';
        // compose no acepta una lista vacía
        return [`if $#${l} gt 0`, `  compose ts_vec values $${l}`, `  let ts_tmp = ${e}`, 'else', '  let ts_tmp = 0', 'end', this.store(out)];
      }
      // --- mostrar
      case 'ts_table_row': {
        const cols = field(b, 'COLS').split(/[\s,;]+/).filter(Boolean).map((c) => c.replace(/[^\w]/g, '_'));
        if (!cols.length) {
          this.errors.push(t('Write the variables of "Add a row to the table"'));
          return [];
        }
        return [`echo ${ROW_PREFIX} ${cols.map((c) => `${c}= $${this.shell(c)}`).join(' ')}`];
      }
      case 'ts_histogram': {
        const n = this.varName(b, 'LIST');
        return [`echo ${HIST_PREFIX} ${n} $${this.list(b, 'LIST')}`];
      }
      case 'ts_plot_lists': {
        const y = this.varName(b, 'Y');
        const x = this.varName(b, 'X');
        return [`echo ${XYL_PREFIX} ${y} ${x} @ $${this.list(b, 'X')} @ $${this.list(b, 'Y')}`];
      }
      // --- control
      case 'controls_whileUntil': {
        const cond = this.expr(input(b, 'BOOL'));
        return [`while ${field(b, 'MODE') === 'UNTIL' ? `(not ${cond})` : cond}`, ...body('DO'), 'end'];
      }
      case 'controls_flow_statements':
        return [field(b, 'FLOW') === 'CONTINUE' ? 'continue' : 'break'];
      case 'procedures_callnoreturn': {
        const name = String(b.extraState?.name ?? '');
        const def = this.procs.get(name);
        if (!def) {
          this.errors.push(t('Function not found: {name}', { name }));
          return [];
        }
        if (this.calling.includes(name)) {
          this.errors.push(t('A function can\'t call itself: {name}', { name }));
          return [];
        }
        // ngspice no tiene funciones: se copia el cuerpo; los argumentos son variables
        const params = (def.extraState?.params as { name: string }[] | undefined) ?? [];
        const args = params.flatMap((p, i) => [`let ts_tmp = ${this.expr(input(b, `ARG${i}`))}`, this.store(p.name.replace(/[^\w]/g, '_'))]);
        this.calling.push(name);
        const inner = this.stmts(chain(input(def, 'STACK')), scope);
        this.calling.pop();
        return [...args, ...inner];
      }
      case 'ts_command': {
        const l = field(b, 'TEXT').trim();
        if (!l) this.errors.push(t('An "ngspice command" block is empty'));
        return l ? [l] : [];
      }
      case 'ts_plot_xy': {
        const x = this.varName(b, 'X');
        const y = this.varName(b, 'Y');
        let p = this.plots.find((q) => q.x === x && q.y === y);
        if (!p) this.plots.push((p = { id: this.plots.length + 1, x, y }));
        return [`echo "${XY_PREFIX} ${p.id}" $${this.shell(x)} $${this.shell(y)}`];
      }
      default:
        this.errors.push(t('Unsupported block: {type}', { type: b.type }));
        return [];
    }
  }
}

function loopSweep(b: BlockJson, tt: SweepTarget): StudySweep {
  return b.type === 'ts_for_list'
    ? { target: tt, mode: 'list', list: field(b, 'VALUES'), start: '', stop: '', step: '', enabled: true }
    : { target: tt, mode: field(b, 'MODE') as StudySweep['mode'], list: '', start: field(b, 'START'), stop: field(b, 'STOP'), step: field(b, 'STEP'), enabled: true };
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
    const tt = targetOf(field(core[0], 'TARGET'));
    if (!tt) return null;
    sweeps.unshift(loopSweep(core[0], tt));
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
  // las funciones propias no son pasos: se copian donde se llaman
  for (const b of tops) if (b.type === 'procedures_defnoreturn') c.procs.set(field(b, 'NAME'), b);
  const top = tops
    .filter((b) => !b.type.startsWith('procedures_def'))
    .flatMap((b) => chain(b))
    .filter((b) => b.type !== 'ts_plot_signal');
  if (tops.some((b) => b.type === 'procedures_defreturn')) c.errors.push(t('Functions that return a value are not supported: use one without a result and a variable'));
  const cards = asCards(top, analysis, (b, f) => c.varName(b, f));
  const plot = plotFromBlocks(allBlocks(tops));
  const empty = { sweeps: [], measures: [], tolerance: null, custom: null, blocks: ws, ...(plot ? { plot } : {}) } as Study;
  if (cards) return { study: { ...empty, ...cards }, ltspice: true, errors: [] };
  const body = c.stmts(top, []);
  // las listas empiezan vacías
  const lines = [...[...c.lists].map((l) => `set ${l} = ( )`), ...body];
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
      p.traces.forEach((tt) =>
        core.push({ type: 'ts_plot_signal', fields: { SIGNAL: tt.expr, PANE: pi + 1, COLOR: tt.color && PLOT_COLORS.some(([, c]) => c === tt.color) ? tt.color : 'auto', ANALYSIS: kind } }),
      ),
    );
  }
  const top = link(core)!;
  top.x = 20;
  top.y = 20;
  return { blocks: { languageVersion: 0, blocks: [top] }, variables };
}
