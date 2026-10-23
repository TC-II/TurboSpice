// Plantillas del Estudio (#178): testbenches comunes (barrido, Monte Carlo, serie de
// simulaciones…) listos para insertar. Cada plantilla arma tarjetas sobre el circuito abierto
// (componentes, parámetros y nodos existentes) y se edita a partir de ahí; las que se pueden
// expresar como "barrer → simular → medir" también existen como bloques (studyToBlocks), y la
// búsqueda / ajuste es sólo de bloques (usa lógica que LTspice no tiene).
import { formatSpiceNumber, parseSpiceNumber } from '../netlist/spicenum.ts';
import { defaultAnalysis, formatAnalysis, parseAnalysis, type AnalysisKind } from './analyses.ts';
import type { MeasAnalysis } from './meas.ts';
import { BLOCK_MEASURES, studyToBlocks, type BlockJson, type WorkspaceJson } from './studyBlocks.ts';
import type { Study, StudyMeasure, StudySweep, SweepTarget, ToleranceItem } from './study.ts';
import { t } from '../i18n/i18n.ts';

/** Lo que la plantilla necesita saber del circuito (un StudyInfo) */
export interface TemplateCircuit {
  components: { name: string; prefix: string; value: string }[];
  sources: string[];
  nets: string[];
  params: string[];
  analysis: MeasAnalysis;
}

export type TemplateField = 'target' | 'target2' | 'signal' | 'analysis' | 'spec' | 'goal' | 'freq' | 'source';

/** Respuestas del asistente corto */
export interface TemplateOptions {
  /** componente, .param o fuente a barrer */
  target: string;
  target2: string;
  /** señal a medir, p. ej. V(out) */
  signal: string;
  analysis: 'tran' | 'ac' | 'dc';
  /** especificación de la medida (rendimiento del Monte Carlo); vacío = sin especificación */
  specMin: string;
  specMax: string;
  /** valor buscado de la medida (búsqueda / ajuste) */
  goal: string;
  /** frecuencia fundamental (distorsión) */
  freq: string;
  /** fuente de excitación (impedancia) */
  source: string;
}

export interface StudyTemplate {
  id: string;
  label: string;
  /** qué hace y cómo modificarla */
  help: string;
  fields: TemplateField[];
  /** sólo existe como bloques */
  blocksOnly?: boolean;
  /** tarjetas que agrega al estudio */
  build?(st: Study, c: TemplateCircuit, o: TemplateOptions): Study;
  /** programa de bloques (plantillas sólo de bloques) */
  blocks?(c: TemplateCircuit, o: TemplateOptions): WorkspaceJson;
}

// --- valores por defecto deducidos del circuito ---------------------------------------------

const plain = (v: string) => v.trim().replace(/[µμ]/g, 'u');
const numeric = (v: string) => Number.isFinite(parseSpiceNumber(plain(v))) && !/^\{/.test(v.trim());
const compOf = (c: TemplateCircuit, name: string) => c.components.find((k) => k.name.toLowerCase() === name.toLowerCase());

/** Componentes pasivos con valor numérico, en orden de preferencia (R, C, L) */
function passives(c: TemplateCircuit): TemplateCircuit['components'] {
  return ['R', 'C', 'L'].flatMap((p) => c.components.filter((k) => k.prefix.toUpperCase() === p && numeric(k.value)));
}

/** Señal de salida probable: la red "out" (u "vout", "o"), o la última con nombre */
export function defaultSignal(c: TemplateCircuit): string {
  const nets = c.nets.filter((n) => n !== '0');
  const out = nets.find((n) => /^v?out$/i.test(n)) ?? nets.find((n) => /out/i.test(n)) ?? nets[nets.length - 1];
  return out ? `V(${out})` : 'V(out)';
}

/** Respuestas por defecto del asistente para el circuito abierto */
export function defaultOptions(c: TemplateCircuit): TemplateOptions {
  const ps = passives(c);
  const first = ps[0];
  // segundo: de otro tipo si hay (R y C), si no el siguiente
  const second = ps.find((k) => first && k.prefix !== first.prefix) ?? ps[1];
  return {
    target: first?.name ?? c.params[0] ?? '',
    target2: second?.name ?? '',
    signal: defaultSignal(c),
    analysis: c.analysis === 'ac' || c.analysis === 'dc' ? c.analysis : 'tran',
    specMin: '',
    specMax: '',
    goal: '',
    freq: '1k',
    source: c.sources[0] ?? '',
  };
}

/** Valor con sufijo SPICE (500, 2k, 470n, 1meg): más legible en las tarjetas */
export function engValue(x: number): string {
  if (!Number.isFinite(x) || x === 0) return formatSpiceNumber(x);
  const units: [number, string][] = [[1e12, 't'], [1e9, 'g'], [1e6, 'meg'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'u'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']];
  const [mult, suf] = units.find(([m]) => Math.abs(x) >= m * 0.9999999) ?? units[units.length - 1];
  return `${Number((x / mult).toPrecision(6))}${suf}`;
}

// --- piezas ---------------------------------------------------------------------------------

/** Barrido de un componente, .param o fuente con valores alrededor del actual */
function sweepOf(c: TemplateCircuit, name: string, factors: number[], mode: 'list' | 'dec' = 'list'): StudySweep | null {
  if (!name.trim()) return null;
  const comp = compOf(c, name);
  const base: Omit<StudySweep, 'target'> = { mode: 'list', list: '', start: '', stop: '', step: '', enabled: true };
  if (comp && numeric(comp.value)) {
    const v = parseSpiceNumber(plain(comp.value));
    const target: SweepTarget = { kind: 'component', name: comp.name };
    if (mode === 'dec') return { ...base, target, mode: 'dec', start: engValue(v / 10), stop: engValue(v * 10), step: '5', original: plain(comp.value) };
    return { ...base, target, list: factors.map((f) => engValue(v * f)).join(' '), original: plain(comp.value) };
  }
  const src = c.sources.find((s) => s.toLowerCase() === name.toLowerCase());
  if (src) return { ...base, target: { kind: 'source', name: src }, list: '1 2 5' };
  if (/^temp$/i.test(name)) return { ...base, target: { kind: 'temp' }, list: '-40 27 85' };
  // un parámetro (.param), aunque todavía no exista
  return mode === 'dec' ? { ...base, target: { kind: 'param', name }, mode: 'dec', start: '0.1', stop: '10', step: '5' } : { ...base, target: { kind: 'param', name }, list: '1 2 5' };
}

/** Nombre de medición libre (no repite uno del estudio ni de los ya usados) */
function namer(st: Study) {
  const used = new Set(st.measures.map((m) => m.name.toLowerCase()));
  return (base: string) => {
    // "m" se numera siempre (m1, m2…, como "+ Medición"); los demás sólo si se repiten
    let n = base === 'm' ? 'm1' : base;
    for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base}${i}`;
    used.add(n.toLowerCase());
    return n;
  };
}

/** Medida típica de una señal según el análisis */
function measureFor(name: string, analysis: MeasAnalysis, signal: string): StudyMeasure {
  const kind = analysis === 'ac' ? 'f3db' : analysis === 'noise' ? 'noise' : 'max';
  return { enabled: true, name, analysis, kind, signal };
}

const raw = (name: string, analysis: MeasAnalysis, line: string): StudyMeasure => ({ enabled: true, name, analysis, kind: 'raw', signal: '', line });

/** Agrega los análisis que faltan (por tipo); los que ya están quedan como están */
function withAnalyses(st: Study, kinds: AnalysisKind[]): Study {
  const list = [...(st.analyses ?? [])];
  for (const k of kinds) {
    const has = list.some((a) => a.enabled && new RegExp(`^\\s*\\.${k}\\b`, 'i').test(a.line));
    if (!has) list.push({ enabled: true, line: formatAnalysis(defaultAnalysis(k)) });
  }
  return { ...st, analyses: list };
}

/** Agrega señales a la vista de un análisis (un panel nuevo si no hay ninguno) */
function withPlot(st: Study, kind: string, exprs: string[]): Study {
  const plot = { ...(st.plot ?? {}) };
  const panes = (plot[kind] ?? []).map((p) => ({ ...p, traces: [...p.traces] }));
  if (!panes.length) panes.push({ traces: [] });
  for (const e of exprs) if (e && !panes.some((p) => p.traces.some((tt) => tt.expr === e))) panes[0].traces.push({ expr: e });
  plot[kind] = panes;
  return { ...st, plot };
}

const addSweeps = (st: Study, sweeps: (StudySweep | null)[]): Study => ({ ...st, sweeps: [...st.sweeps, ...sweeps.filter((s): s is StudySweep => !!s)] });
const addMeasures = (st: Study, ms: StudyMeasure[]): Study => ({ ...st, measures: [...st.measures, ...ms] });

/** Barrido + medida + gráfico: la base de varias plantillas */
function sweepAndMeasure(st: Study, o: TemplateOptions, sweeps: (StudySweep | null)[]): Study {
  const name = namer(st);
  let out = withAnalyses(st, [o.analysis]);
  out = addSweeps(out, sweeps);
  out = addMeasures(out, [measureFor(name('m'), o.analysis, o.signal)]);
  return withPlot(out, o.analysis, [o.signal]);
}

/** Tolerancias de todos los R (5 %) y C/L (10 %) con valor numérico */
function toleranceItems(c: TemplateCircuit, max = Infinity): ToleranceItem[] {
  return passives(c)
    .slice(0, max)
    .map((k) => ({ component: k.name, tol: k.prefix.toUpperCase() === 'R' ? '5' : '10', dist: 'uniform' as const, original: plain(k.value) }));
}

/** Fin de la simulación transitoria del estudio (para medir el valor final) */
function tranStop(st: Study): string {
  const a = (st.analyses ?? []).find((x) => x.enabled && /^\s*\.tran\b/i.test(x.line));
  const p = a ? parseAnalysis(a.line) : null;
  return p?.kind === 'tran' ? p.tstop : (defaultAnalysis('tran') as { tstop: string }).tstop;
}

// --- plantillas -----------------------------------------------------------------------------

export const STUDY_TEMPLATES: StudyTemplate[] = [
  {
    id: 'sweep',
    label: t('Parametric sweep'),
    help: t('Steps a component, a .param or a source (.step) and measures the signal in each run: overlaid curves and the measurement vs. the parameter. Change the values in the sweep card.'),
    fields: ['target', 'signal', 'analysis'],
    build: (st, c, o) => sweepAndMeasure(st, o, [sweepOf(c, o.target, [0.5, 1, 2])]),
  },
  {
    id: 'nested',
    label: t('Nested sweep'),
    help: t('Two nested .step (e.g. R and C): a family of curves and the measurement for each combination (Measurements table). Edit each sweep card.'),
    fields: ['target', 'target2', 'signal', 'analysis'],
    build: (st, c, o) => sweepAndMeasure(st, o, [sweepOf(c, o.target, [0.5, 1, 2]), sweepOf(c, o.target2, [0.5, 1, 2])]),
  },
  {
    id: 'temp',
    label: t('Temperature sweep'),
    help: t('.step temp -40 27 85: curves at each temperature and the drift of the measurement. Add temperatures in the sweep card.'),
    fields: ['signal', 'analysis'],
    build: (st, c, o) => sweepAndMeasure(st, o, [sweepOf(c, 'temp', [])]),
  },
  {
    id: 'montecarlo',
    label: 'Monte Carlo',
    help: t('R ±5 % and C/L ±10 % (uniform), 50 runs with a fixed seed: overlaid curves, histogram and statistics of the measurement (mean, σ, min/max). With a specification, the "yield" column is 1 when the run meets it: its mean is the yield.'),
    fields: ['signal', 'analysis', 'spec'],
    build: (st, c, o) => {
      const name = namer(st);
      let out = withAnalyses(st, [o.analysis]);
      const m = measureFor(name('m'), o.analysis, o.signal);
      const ms = [m];
      const lo = o.specMin.trim();
      const hi = o.specMax.trim();
      if (lo || hi) {
        // 1 si cumple, 0 si no: (1+sgn(x))/2 (LTspice y TurboSpice tienen sgn, no comparaciones)
        const cond = [lo && `(1+sgn(${m.name}-${lo}))/2`, hi && `(1+sgn(${hi}-${m.name}))/2`].filter(Boolean).join('*');
        const y = name('yield');
        ms.push(raw(y, o.analysis, `.meas ${o.analysis} ${y} PARAM ${cond}`));
      }
      out = addMeasures(out, ms);
      out = { ...out, tolerance: { enabled: true, mode: 'montecarlo', runs: '50', items: toleranceItems(c) } };
      return withPlot(out, o.analysis, [o.signal]);
    },
  },
  {
    id: 'worst',
    label: t('Worst case / corners'),
    help: t('Every combination of the tolerance extremes (2ⁿ runs, up to 6 components): the best and worst curves and a table per corner (Measurements). Remove components from the tolerance card to reduce the runs.'),
    fields: ['signal', 'analysis'],
    build: (st, c, o) => {
      let out = withAnalyses(st, [o.analysis]);
      out = addMeasures(out, [measureFor(namer(st)('m'), o.analysis, o.signal)]);
      out = { ...out, tolerance: { enabled: true, mode: 'worst', runs: '', items: toleranceItems(c, 6) } };
      return withPlot(out, o.analysis, [o.signal]);
    },
  },
  {
    id: 'series',
    label: t('Series of simulations'),
    help: t('.op + .ac + .tran in a single run: one result per analysis, each with its plot and measurement. Add or remove simulation cards.'),
    fields: ['signal'],
    build: (st, _c, o) => {
      const name = namer(st);
      let out = withAnalyses(st, ['op', 'ac', 'tran']);
      out = addMeasures(out, [measureFor(name('gain'), 'ac', o.signal), { ...measureFor(name('peak'), 'tran', o.signal), kind: 'max' }]);
      out = withPlot(out, 'ac', [o.signal]);
      return withPlot(out, 'tran', [o.signal]);
    },
  },
  {
    id: 'measvsparam',
    label: t('Measurement vs. parameter'),
    help: t('Logarithmic sweep (5 points per decade, from /10 to ×10) and a measurement: the plot "measurement vs. parameter" (e.g. f−3dB vs. C, gain vs. R). Change the measurement in its card.'),
    fields: ['target', 'signal', 'analysis'],
    build: (st, c, o) => sweepAndMeasure(st, o, [sweepOf(c, o.target, [], 'dec')]),
  },
  {
    id: 'search',
    label: t('Search / fit'),
    help: t('Bisection (blocks): changes the component until the measurement reaches the target value (e.g. R for a given gain, C for f−3dB = 1 kHz). It prints the value found and plots the intermediate runs. Works whether the measurement grows or falls with the value.'),
    fields: ['target', 'signal', 'analysis', 'goal'],
    blocksOnly: true,
    blocks: (c, o) => searchBlocks(c, o),
  },
  {
    id: 'step',
    label: t('Step response'),
    help: t('.tran and measurements of the output: final value, overshoot (%), rise time (10–90 %) and settling time (2 %). The input must be a step (PULSE source).'),
    fields: ['signal'],
    build: (st, _c, o) => {
      let out = withAnalyses(st, ['tran']);
      const name = namer(out);
      const s = o.signal;
      const fin = name('vfinal');
      const peak = name('vpeak');
      const ms = [
        raw(fin, 'tran', `.meas tran ${fin} FIND ${s} AT=${tranStop(out)}`),
        raw(peak, 'tran', `.meas tran ${peak} MAX ${s}`),
        raw(name('overshoot'), 'tran', ''),
        raw(name('trise'), 'tran', ''),
        raw(name('tsettle'), 'tran', ''),
      ];
      ms[2].line = `.meas tran ${ms[2].name} PARAM 100*(${peak}-${fin})/${fin}`;
      ms[3].line = `.meas tran ${ms[3].name} TRIG ${s} VAL=0.1*${fin} RISE=1 TARG ${s} VAL=0.9*${fin} RISE=1`;
      ms[4].line = `.meas tran ${ms[4].name} WHEN abs(${s}-${fin})=0.02*abs(${fin}) CROSS=LAST`;
      out = addMeasures(out, ms);
      return withPlot(out, 'tran', [s]);
    },
  },
  {
    id: 'freq',
    label: t('Frequency response'),
    help: t('.ac with the Bode plot of the output, the gain in band (maximum) and the cutoff frequency (−3 dB). The input source needs "AC 1". For a loop gain, add the phase margin in a measurement card.'),
    fields: ['signal'],
    build: (st, _c, o) => {
      const name = namer(st);
      let out = withAnalyses(st, ['ac']);
      out = addMeasures(out, [
        { enabled: true, name: name('gain'), analysis: 'ac', kind: 'max', signal: o.signal },
        { enabled: true, name: name('f3db'), analysis: 'ac', kind: 'f3db', signal: o.signal },
      ]);
      return withPlot(out, 'ac', [o.signal]);
    },
  },
  {
    id: 'distortion',
    label: t('Distortion'),
    help: t('.tran stepping the parameter "amp" (write {amp} as the amplitude of the input source) and, after each run, a Fourier analysis of the output: the THD of each amplitude is in the Log. Set the fundamental frequency of the source.'),
    fields: ['signal', 'freq'],
    build: (st, _c, o) => {
      let out = withAnalyses(st, ['tran']);
      out = addSweeps(out, [{ target: { kind: 'param', name: 'amp' }, mode: 'list', list: '0.1 0.5 1', start: '', stop: '', step: '', enabled: true }]);
      const four = `fourier ${o.freq || '1k'} ${o.signal.replace(/\bV\(/g, 'v(')}`;
      const custom = out.custom
        ? out.custom.mode === 'hooks'
          ? { ...out.custom, after: [out.custom.after.trim(), four].filter(Boolean).join('\n') }
          : out.custom
        : { mode: 'hooks' as const, body: '', before: '', after: four, final: '' };
      out = { ...out, custom };
      return withPlot(out, 'tran', [o.signal]);
    },
  },
  {
    id: 'impedance',
    label: t('Impedance / PSRR / CMRR'),
    help: t('.ac with the impedance seen by the source (|V/I|, the source needs "AC 1"). For PSRR or CMRR put the AC source on the supply or on both inputs and plot V(out)/V(supply) instead.'),
    fields: ['source'],
    build: (st, c, o) => {
      const src = o.source || c.sources[0] || 'V1';
      const out = withAnalyses(st, ['ac']);
      return withPlot(out, 'ac', [`-V(${netOfSource(c, src)})/I(${src})`]);
    },
  },
];

/** Red positiva de una fuente: no se conoce desde acá; se usa "in" si existe, si no la primera */
function netOfSource(c: TemplateCircuit, _src: string): string {
  const nets = c.nets.filter((n) => n !== '0');
  return nets.find((n) => /^v?in$/i.test(n)) ?? nets.find((n) => /in/i.test(n)) ?? nets[0] ?? 'in';
}

export const templateById = (id: string) => STUDY_TEMPLATES.find((x) => x.id === id);

/** ¿Las tarjetas del estudio se pueden expresar como bloques sin perder nada? */
export function blocksCanExpress(st: Study): boolean {
  return !st.tolerance && !st.custom && st.measures.every((m) => !m.enabled || BLOCK_MEASURES.some(([k]) => k === m.kind));
}

/** Aplica una plantilla de tarjetas al estudio */
export function applyTemplate(st: Study, id: string, c: TemplateCircuit, o: TemplateOptions): Study {
  const tpl = templateById(id);
  if (!tpl?.build) return st;
  // insertar una plantilla descarta el programa de bloques (ya no coincidiría con las tarjetas)
  const { blocks: _, ...rest } = st;
  return tpl.build(rest as Study, c, o);
}

/** Programa de bloques de una plantilla (las de tarjetas, convertidas) */
export function templateBlocks(st: Study, id: string, c: TemplateCircuit, o: TemplateOptions): WorkspaceJson | null {
  const tpl = templateById(id);
  if (tpl?.blocks) return tpl.blocks(c, o);
  const next = applyTemplate(st, id, c, o);
  return blocksCanExpress(next) ? studyToBlocks(next) : null;
}

/** Junta dos programas de bloques: el nuevo debajo del existente */
export function appendBlocks(ws: WorkspaceJson | null, add: WorkspaceJson): WorkspaceJson {
  const old = ws?.blocks?.blocks ?? [];
  if (!old.length) return add;
  const bottom = Math.max(...old.map((b) => b.y ?? 0));
  const vars = [...(ws?.variables ?? [])];
  for (const v of add.variables ?? []) if (!vars.some((x) => x.id === v.id)) vars.push(v);
  // la altura de un programa no se conoce sin Blockly: un margen generoso
  const moved = (add.blocks?.blocks ?? []).map((b, i) => ({ ...b, x: b.x ?? 20, y: bottom + 400 + i * 40 }));
  return { blocks: { languageVersion: 0, blocks: [...old, ...moved] }, variables: vars };
}

// --- búsqueda / ajuste (bloques) -------------------------------------------------------------

/**
 * Bisección geométrica sobre un componente: mide en el extremo inferior y, en cada paso, se queda
 * con la mitad donde la medida cruza el valor buscado. Sirve tanto si la medida crece como si
 * decrece con el valor.
 */
export function searchBlocks(c: TemplateCircuit, o: TemplateOptions): WorkspaceJson {
  const comp = compOf(c, o.target);
  const v = comp && numeric(comp.value) ? parseSpiceNumber(plain(comp.value)) : 1000;
  const target = comp ? `component:${comp.name}` : c.params.some((p) => p === o.target) ? `param:${o.target}` : `component:${o.target}`;
  const kind = o.analysis === 'ac' ? 'f3db' : 'max';
  const goal = parseSpiceNumber(plain(o.goal || ''));
  const vars = ['lo', 'hi', 'mid', 'm', 'mlo'].map((n) => ({ name: n, id: `var_${n}` }));
  const id = (n: string) => ({ id: `var_${n}` });
  const num = (n: number): BlockJson => ({ type: 'math_number', fields: { NUM: n } });
  const get = (n: string): BlockJson => ({ type: 'variables_get', fields: { VAR: id(n) } });
  const setv = (n: string, value: BlockJson): BlockJson => ({ type: 'variables_set', fields: { VAR: id(n) }, inputs: { VALUE: { block: value } } });
  const arith = (op: string, a: BlockJson, b: BlockJson): BlockJson => ({ type: 'math_arithmetic', fields: { OP: op }, inputs: { A: { block: a }, B: { block: b } } });
  const set = (value: BlockJson): BlockJson => ({ type: 'ts_set', fields: { TARGET: target }, inputs: { VALUE: { block: value } } });
  const measure = (into: string): BlockJson => ({ type: 'ts_measure', fields: { KIND: kind, SIGNAL: o.signal, A: '', B: '', VAR: id(into) } });
  const link = (list: BlockJson[]): BlockJson => {
    for (let i = list.length - 2; i >= 0; i--) list[i].next = { block: list[i + 1] };
    return list[0];
  };
  // objetivo por defecto: el valor nominal de la medida no se conoce; 1 kHz en AC, 1 V si no
  const g = Number.isFinite(goal) ? goal : kind === 'f3db' ? 1000 : 1;
  const body = link([
    setv('mid', { type: 'math_single', fields: { OP: 'ROOT' }, inputs: { NUM: { block: arith('MULTIPLY', get('lo'), get('hi')) } } }),
    set(get('mid')),
    { type: 'ts_simulate' },
    measure('m'),
    { type: 'ts_plot_xy', fields: { Y: id('m'), X: id('mid') } },
    {
      type: 'controls_if',
      extraState: { hasElse: true },
      inputs: {
        IF0: {
          block: {
            type: 'logic_compare',
            fields: { OP: 'GT' },
            inputs: { A: { block: arith('MULTIPLY', arith('MINUS', get('m'), num(g)), arith('MINUS', get('mlo'), num(g))) }, B: { block: num(0) } },
          },
        },
        DO0: { block: link([setv('lo', get('mid')), setv('mlo', get('m'))]) },
        ELSE: { block: setv('hi', get('mid')) },
      },
    },
  ]);
  const top = link([
    setv('lo', num(v / 10)),
    setv('hi', num(v * 10)),
    set(get('lo')),
    { type: 'ts_simulate' },
    measure('mlo'),
    { type: 'ts_repeat', fields: { TIMES: 12 }, inputs: { DO: { block: body } } },
    { type: 'ts_message', fields: { TEXT: t('value found:') } },
    { type: 'ts_print', inputs: { VALUE: { block: get('mid') } } },
    { type: 'ts_print', inputs: { VALUE: { block: get('m') } } },
  ]);
  top.x = 20;
  top.y = 20;
  return { blocks: { languageVersion: 0, blocks: [top] }, variables: vars };
}
