// Estudio: barridos, tolerancias, mediciones y pasos personalizados como tarjetas, y su ida y
// vuelta con directivas que LTspice también entiende (.step, .meas, .param, .func).
//
// En el .asc un estudio es:
//  - un texto "!" con las directivas de las tarjetas activas, y otro ";" con las desactivadas
//    (comentar una directiva es la forma habitual de apagarla en LTspice);
//  - los valores de los componentes barridos ({R1}) o con tolerancia ({mc(1k,0.05)});
//  - el bloque .control (comentario) si hay un paso personalizado;
//  - los análisis: el primero activo como directiva (el que corre LTspice) y los demás en un
//    comentario que sólo ejecuta TurboSpice (ver EXTRA_ANALYSES);
//  - la vista de ploteo (";.plot …", la misma que "Recordar vista" del visor).
// Al abrir un archivo se reconstruyen las tarjetas a partir de eso, aunque venga de LTspice.
import { belowTexts, dataText, DATA_TAGS, isDataText, isDataTextOf, placeDataTexts, readData } from '../asc/dataText.ts';
import type { AscDoc, SchText } from '../asc/model.ts';
import { effectiveAttrs, type SymbolSource } from '../asc/resolve.ts';
import { controlHooks, EXTRA_ANALYSES, HOOK_MARKS, isControlBlock, isNgspiceComment, NGSPICE_ONLY } from '../netlist/directives.ts';
import { parseStep } from '../netlist/step.ts';
import { viewFromDoc, withView, type PlotView } from '../waveform/view.ts';
import { ANALYSIS_LINE } from './analyses.ts';
import { parseMeas, type MeasAnalysis, type MeasDef } from './meas.ts';
import { t } from '../i18n/i18n.ts';

export type SweepTarget =
  | { kind: 'component'; name: string }
  | { kind: 'param'; name: string }
  | { kind: 'source'; name: string }
  | { kind: 'temp' }
  | { kind: 'model'; model: string; param: string };

export type SweepMode = 'list' | 'lin' | 'dec' | 'oct';

export interface StudySweep {
  target: SweepTarget;
  mode: SweepMode;
  /** valores separados por espacios (mode list) */
  list: string;
  start: string;
  stop: string;
  /** incremento (lin) o puntos por década/octava */
  step: string;
  enabled: boolean;
  /** valor original del componente barrido (para la .param y para restaurarlo) */
  original?: string;
}

export interface ToleranceItem {
  component: string;
  /** tolerancia en % */
  tol: string;
  dist: 'uniform' | 'gauss';
  original: string;
}

export interface StudyTolerance {
  enabled: boolean;
  /** Monte Carlo (corridas aleatorias) o caso peor (todas las combinaciones ±tol) */
  mode: 'montecarlo' | 'worst';
  runs: string;
  items: ToleranceItem[];
}

export type MeasureKind =
  | 'max'
  | 'min'
  | 'pp'
  | 'avg'
  | 'rms'
  | 'at'
  | 'rise'
  | 'fall'
  | 'delay'
  | 'period'
  | 'freq'
  | 'gainAt'
  | 'f3db'
  | 'f0db'
  | 'phaseMargin'
  | 'noise'
  | 'raw';

export interface StudyMeasure {
  enabled: boolean;
  name: string;
  analysis: MeasAnalysis;
  kind: MeasureKind;
  signal: string;
  /** segunda señal (retardo) */
  signal2?: string;
  /** instante/frecuencia (at), nivel de disparo (rise/fall/delay/period) */
  at?: string;
  level?: string;
  level2?: string;
  from?: string;
  to?: string;
  /** texto .meas tal cual (kind raw) */
  line?: string;
}

export interface StudyCustom {
  /**
   * full: el .control decide todo lo que se simula (los barridos se ignoran);
   * hooks: comandos antes/después de cada corrida y al final, combinados con los barridos
   */
  mode: 'full' | 'hooks';
  /** cuerpo del .control (modo full) */
  body: string;
  before: string;
  after: string;
  final: string;
}

/** Cuerpo del .control de un paso personalizado (con marcas de sección en modo hooks) */
export function customBody(c: StudyCustom): string[] {
  if (c.mode === 'full') return c.body.split('\n');
  const sec = (mark: string, text: string) => [mark, ...text.split('\n').filter((l) => l.trim())];
  return [...sec(HOOK_MARKS.before, c.before), ...sec(HOOK_MARKS.after, c.after), ...sec(HOOK_MARKS.final, c.final)];
}

/** Un análisis (.tran, .ac…), como línea SPICE (se edita con los formularios de analyses.ts) */
export interface StudyAnalysis {
  enabled: boolean;
  line: string;
}

export interface Study {
  /** análisis a correr; undefined = no tocar los del esquemático */
  analyses?: StudyAnalysis[];
  /** qué graficar, por análisis; undefined = no tocar la vista guardada */
  plot?: PlotView;
  sweeps: StudySweep[];
  tolerance: StudyTolerance | null;
  measures: StudyMeasure[];
  custom: StudyCustom | null;
  /** programa de bloques (JSON de Blockly), si el estudio se armó con bloques */
  blocks?: unknown;
}

/** Comentario del .asc que guarda el programa de bloques (base64 del JSON) */
export const STUDY_BLOCKS = DATA_TAGS.study;
export const isStudyBlocksText = (tt: { kind: string; text: string }) => isDataTextOf(tt, 'study');

export const emptyStudy = (): Study => ({ sweeps: [], tolerance: null, measures: [], custom: null });

/** Descripción de las mediciones disponibles, por análisis (para el formulario) */
export const MEASURE_KINDS: { kind: MeasureKind; label: string; analysis: MeasAnalysis[] }[] = [
  { kind: 'max', label: t('Maximum'), analysis: ['tran', 'ac', 'dc', 'noise'] },
  { kind: 'min', label: t('Minimum'), analysis: ['tran', 'ac', 'dc', 'noise'] },
  { kind: 'pp', label: t('Peak to peak'), analysis: ['tran', 'dc'] },
  { kind: 'avg', label: t('Average'), analysis: ['tran', 'dc'] },
  { kind: 'rms', label: t('RMS value'), analysis: ['tran'] },
  { kind: 'at', label: t('Value at a point'), analysis: ['tran', 'ac', 'dc', 'noise'] },
  { kind: 'rise', label: t('Rise time'), analysis: ['tran'] },
  { kind: 'fall', label: t('Fall time'), analysis: ['tran'] },
  { kind: 'delay', label: t('Delay between two signals'), analysis: ['tran'] },
  { kind: 'period', label: t('Period'), analysis: ['tran'] },
  { kind: 'freq', label: t('Frequency'), analysis: ['tran'] },
  { kind: 'gainAt', label: t('Gain (dB) at a frequency'), analysis: ['ac'] },
  { kind: 'f3db', label: t('Cutoff frequency (−3 dB)'), analysis: ['ac'] },
  { kind: 'f0db', label: t('0 dB crossover frequency'), analysis: ['ac'] },
  { kind: 'phaseMargin', label: t('Phase margin'), analysis: ['ac'] },
  { kind: 'noise', label: t('Integrated noise in a band'), analysis: ['noise'] },
  { kind: 'raw', label: t('hand-written .meas'), analysis: ['tran', 'ac', 'dc', 'noise', 'op', 'tf'] },
];

// --- tarjetas → directivas ----------------------------------------------------------------

export function stepLine(s: StudySweep): string {
  const tt = s.target;
  const what =
    tt.kind === 'component' || tt.kind === 'param' ? `param ${tt.name}` : tt.kind === 'source' ? tt.name : tt.kind === 'temp' ? 'temp' : `${tt.model}(${tt.param})`;
  if (s.mode === 'list') return `.step ${what} list ${s.list.trim()}`;
  const mode = s.mode === 'lin' ? '' : `${s.mode} `;
  return `.step ${mode}${what} ${s.start} ${s.stop} ${s.step}`;
}

const range = (m: StudyMeasure) => `${m.from ? ` FROM=${m.from}` : ''}${m.to ? ` TO=${m.to}` : ''}`;

/** Líneas .meas de una medición (algunas usan una medición auxiliar con sufijo) */
export function measureLines(m: StudyMeasure): string[] {
  const a = m.analysis;
  const s = m.signal;
  switch (m.kind) {
    case 'max':
    case 'min':
    case 'pp':
    case 'avg':
    case 'rms':
      return [`.meas ${a} ${m.name} ${m.kind.toUpperCase()} ${a === 'ac' ? `mag(${s})` : s}${range(m)}`];
    case 'at':
      return [`.meas ${a} ${m.name} FIND ${s} AT=${m.at}`];
    case 'rise':
    case 'fall': {
      const e = m.kind === 'rise' ? 'RISE' : 'FALL';
      return [`.meas tran ${m.name} TRIG ${s} VAL=${m.level} ${e}=1 TARG ${s} VAL=${m.level2} ${e}=1`];
    }
    case 'delay':
      return [`.meas tran ${m.name} TRIG ${s} VAL=${m.level} RISE=1 TARG ${m.signal2} VAL=${m.level2 || m.level} RISE=1`];
    case 'period':
      return [`.meas tran ${m.name} TRIG ${s} VAL=${m.level} RISE=2 TARG ${s} VAL=${m.level} RISE=3`];
    case 'freq':
      return [`.meas tran ${m.name}_T TRIG ${s} VAL=${m.level} RISE=2 TARG ${s} VAL=${m.level} RISE=3`, `.meas tran ${m.name} PARAM 1/${m.name}_T`];
    case 'gainAt':
      return [`.meas ac ${m.name} FIND db(${s}) AT=${m.at}`];
    case 'f3db':
      return [`.meas ac ${m.name}_max MAX mag(${s})`, `.meas ac ${m.name} WHEN mag(${s})=${m.name}_max/sqrt(2) FALL=last`];
    case 'f0db':
      return [`.meas ac ${m.name} WHEN mag(${s})=1 FALL=1`];
    case 'phaseMargin':
      return [`.meas ac ${m.name}_ph FIND ph(${s}) WHEN mag(${s})=1 FALL=1`, `.meas ac ${m.name} PARAM 180+${m.name}_ph`];
    case 'noise':
      return [`.meas noise ${m.name} INTEG ${s}${range(m)}`];
    case 'raw':
      return [m.line ?? ''];
  }
}

/** Valor de un componente con tolerancia */
export function toleranceValue(it: ToleranceItem, mode: StudyTolerance['mode'], index: number): string {
  const tol = String(Number(it.tol) / 100);
  if (mode === 'worst') return `{${it.original}*(1+${tol}*(2*binary(run,${index})-1))}`;
  return it.dist === 'uniform' ? `{mc(${it.original},${tol})}` : `{${it.original}*(1+gauss(${tol}/3))}`;
}

export const BINARY_FUNC = '.func binary(run,index) floor(run/(2**index))-2*floor(run/(2**(index+1)))';

function toleranceLines(tt: StudyTolerance): string[] {
  if (tt.mode === 'worst') return [BINARY_FUNC, `.step param run 0 ${2 ** tt.items.length - 1} 1`];
  return [`.step param run 1 ${tt.runs} 1`];
}

/** Directivas activas e inactivas del estudio (sin el .control) */
export function studyLines(st: Study): { on: string[]; off: string[] } {
  const on: string[] = [];
  const off: string[] = [];
  for (const s of st.sweeps) {
    const lines = [...(s.target.kind === 'component' && s.original !== undefined ? [`.param ${s.target.name}=${s.original}`] : []), stepLine(s)];
    // la .param del componente queda activa aunque el barrido esté apagado (el valor es {R1})
    if (s.enabled) on.push(...lines);
    else {
      if (lines.length > 1) on.push(lines[0]);
      off.push(lines[lines.length - 1]);
    }
  }
  if (st.tolerance?.items.length) (st.tolerance.enabled ? on : off).push(...toleranceLines(st.tolerance));
  for (const m of st.measures) (m.enabled ? on : off).push(...measureLines(m));
  return { on, off };
}

// --- análisis ------------------------------------------------------------------------------

/** Primera línea del comentario con análisis desactivados que, si no, se ejecutarían (;.pz) */
export const OFF_ANALYSES = '* análisis desactivados';
const isAnalysisMark = (l: string) => l.trim() === EXTRA_ANALYSES || l.trim() === OFF_ANALYSES;

/**
 * Análisis del esquemático: los de directivas y comentarios de ngspice (activos) y los
 * comentados con ";" (desactivados, como se apagan en LTspice).
 */
export function analysesFromDoc(doc: AscDoc): StudyAnalysis[] {
  const out: StudyAnalysis[] = [];
  for (const tt of doc.texts) {
    if (isDataText(tt) || isControlBlock(tt.text)) continue;
    const enabled = tt.kind === 'directive' || isNgspiceComment(tt.text);
    for (const l of tt.text.split('\\n')) if (ANALYSIS_LINE.test(l)) out.push({ enabled, line: l.trim() });
  }
  return out;
}

/** Análisis que corren, en orden: el primero es el principal (el que corre LTspice) */
export const activeAnalyses = (list: StudyAnalysis[]) => list.filter((a) => a.enabled && a.line.trim());

/**
 * Reemplaza los análisis del esquemático: el principal donde estaba el anterior (directiva, o
 * comentario si LTspice no lo tiene), los adicionales en un comentario que sólo ejecuta
 * TurboSpice y los desactivados comentados.
 */
export function applyAnalyses(doc: AscDoc, list: StudyAnalysis[]): AscDoc {
  let anchor: { x: number; y: number } | null = null;
  const texts: SchText[] = [];
  for (const tt of doc.texts) {
    const lines = tt.text.split('\\n');
    const keep = isDataText(tt) || isControlBlock(tt.text) ? lines : lines.filter((l) => !ANALYSIS_LINE.test(l) && !isAnalysisMark(l));
    if (keep.length === lines.length) {
      texts.push(tt);
      continue;
    }
    const left = keep.filter((l) => l.trim());
    anchor ??= { x: tt.x, y: tt.y + (left.length ? left.length * 24 + 16 : 0) };
    if (left.length) texts.push({ ...tt, text: keep.join('\\n') });
  }
  const text = (at: { x: number; y: number }, kind: SchText['kind'], lines: string[]): SchText => ({ x: at.x, y: at.y, align: 'Left', size: 2, kind, text: lines.join('\\n') });
  const [main, ...extra] = activeAnalyses(list).map((a) => a.line.trim());
  if (main) texts.push(text(anchor ?? belowTexts(doc), NGSPICE_ONLY.test(main) ? 'comment' : 'directive', [main]));
  if (extra.length) texts.push(text(belowTexts({ ...doc, texts }), 'comment', [EXTRA_ANALYSES, ...extra]));
  const off = list.filter((a) => !a.enabled && a.line.trim()).map((a) => a.line.trim());
  // un ";.pz" solo se ejecutaría: la marca de la primera línea lo apaga
  if (off.length) texts.push(text(belowTexts({ ...doc, texts }), 'comment', NGSPICE_ONLY.test(off[0]) ? [OFF_ANALYSES, ...off] : off));
  return { ...doc, texts };
}

// --- directivas → tarjetas ----------------------------------------------------------------

const STUDY_LINE = /^\s*\.(step|meas(ure)?)\b/i;

interface Line {
  text: number;
  line: number;
  value: string;
  enabled: boolean;
}

function directiveLines(doc: AscDoc): Line[] {
  const out: Line[] = [];
  doc.texts.forEach((tt, ti) => {
    if (tt.kind === 'comment' && isControlBlock(tt.text)) return;
    tt.text.split('\\n').forEach((value, li) => out.push({ text: ti, line: li, value: value.trim(), enabled: tt.kind === 'directive' }));
  });
  return out;
}

const unmag = (e: string) => /^mag\((.*)\)$/i.exec(e)?.[1];
const isPeriod = (d: MeasDef) =>
  d.kind === 'trigtarg' && !!d.trig && !!d.targ && d.trig.lhs === d.targ.lhs && d.trig.rhs === d.targ.rhs && d.trig.edge === 'rise' && d.targ.edge === 'rise' && d.trig.n === 2 && d.targ.n === 3;

/** Una medición sola → tarjeta (o "raw" si no coincide con ninguna plantilla) */
function classify(d: MeasDef, enabled: boolean): StudyMeasure {
  const base = { enabled, name: d.name, analysis: (d.analysis ?? 'tran') as MeasAnalysis, signal: '' };
  const raw: StudyMeasure = { ...base, kind: 'raw', line: d.line };
  if (['max', 'min', 'pp', 'avg', 'rms'].includes(d.kind) && d.expr && !d.trig && !d.targ) {
    const sig = d.analysis === 'ac' ? unmag(d.expr) : d.expr;
    return sig ? { ...base, kind: d.kind as MeasureKind, signal: sig, from: d.from, to: d.to } : raw;
  }
  if (d.kind === 'integ' && d.analysis === 'noise' && d.expr) return { ...base, kind: 'noise', signal: d.expr, from: d.from, to: d.to };
  if (d.kind === 'find' && d.at && d.expr) {
    const db = /^db\((.*)\)$/i.exec(d.expr)?.[1];
    return d.analysis === 'ac' && db ? { ...base, kind: 'gainAt', signal: db, at: d.at } : { ...base, kind: 'at', signal: d.expr, at: d.at };
  }
  if (d.kind === 'trigtarg' && d.trig && d.targ) {
    const { trig: a, targ: b } = d;
    const simple = a.n === 1 && b.n === 1 && !a.td && !b.td;
    if (simple && a.lhs === b.lhs && a.edge === b.edge && (a.edge === 'rise' || a.edge === 'fall')) {
      return { ...base, kind: a.edge, signal: a.lhs, level: a.rhs, level2: b.rhs };
    }
    if (isPeriod(d)) return { ...base, kind: 'period', signal: a.lhs, level: a.rhs };
    if (simple && a.edge === 'rise' && b.edge === 'rise' && a.lhs !== b.lhs) return { ...base, kind: 'delay', signal: a.lhs, signal2: b.lhs, level: a.rhs, level2: b.rhs };
  }
  if (d.kind === 'when' && d.when && d.analysis === 'ac') {
    const sig = unmag(d.when.lhs);
    if (sig && d.when.rhs === '1' && d.when.edge === 'fall' && d.when.n === 1) return { ...base, kind: 'f0db', signal: sig };
  }
  return raw;
}

/** Mediciones → tarjetas; las que usan una medición auxiliar (X_max, X_T, X_ph) son una sola */
function measureFromDefs(defs: { def: MeasDef; enabled: boolean }[]): StudyMeasure[] {
  const idx = (name: string) => defs.findIndex((d) => d.def.name.toLowerCase() === name.toLowerCase());
  const helpers = new Set<number>();
  const special = new Map<number, StudyMeasure>();
  defs.forEach(({ def: d, enabled }, i) => {
    const base = { enabled, name: d.name, analysis: (d.analysis ?? 'tran') as MeasAnalysis, signal: '' };
    const expr = d.expr?.replace(/\s/g, '') ?? '';
    if (d.kind === 'when' && d.analysis === 'ac' && d.when) {
      const sig = unmag(d.when.lhs);
      const mi = idx(/^(.*)\/sqrt\(2\)$/i.exec(d.when.rhs)?.[1] ?? '');
      const m = mi >= 0 ? defs[mi].def : undefined;
      if (sig && m?.kind === 'max' && unmag(m.expr ?? '') === sig && d.when.n === 'last' && d.when.edge === 'fall') {
        helpers.add(mi);
        special.set(i, { ...base, kind: 'f3db', signal: sig });
      }
    }
    if (d.kind === 'param') {
      const ti = idx(/^1\/(.+)$/.exec(expr)?.[1] ?? '');
      if (ti >= 0 && isPeriod(defs[ti].def)) {
        helpers.add(ti);
        special.set(i, { ...base, kind: 'freq', signal: defs[ti].def.trig!.lhs, level: defs[ti].def.trig!.rhs });
      }
      const pi = idx(/^180\+(.+)$/.exec(expr)?.[1] ?? '');
      const p = pi >= 0 ? defs[pi].def : undefined;
      const ph = p?.kind === 'find' && p.when ? /^ph\((.*)\)$/i.exec(p.expr ?? '')?.[1] : undefined;
      if (ph && d.analysis === 'ac') {
        helpers.add(pi);
        special.set(i, { ...base, kind: 'phaseMargin', signal: ph });
      }
    }
  });
  return defs.flatMap(({ def, enabled }, i) => (helpers.has(i) ? [] : [special.get(i) ?? classify(def, enabled)]));
}

/** Reconstruye el estudio de un documento (también uno hecho en LTspice) */
export function studyFromDoc(doc: AscDoc, lib: SymbolSource): Study {
  const st: Study = { ...emptyStudy(), analyses: analysesFromDoc(doc) };
  const plot = viewFromDoc(doc);
  if (plot) st.plot = plot;
  const lines = directiveLines(doc);
  const params = new Map<string, string>();
  for (const l of lines) {
    const m = /^\.param\s+([A-Za-z_]\w*)\s*=?\s*(.+)$/i.exec(l.value);
    if (m && l.enabled) params.set(m[1].toLowerCase(), m[2].trim());
  }
  const values = doc.symbols.map((s) => ({
    name: effectiveAttrs(s, lib.symbol(s.type)).get('InstName') ?? '',
    value: effectiveAttrs(s, lib.symbol(s.type)).get('Value') ?? '',
  }));

  // tolerancias: componentes con mc(), gauss() o binary(run,i)
  const items: ToleranceItem[] = [];
  let worst = false;
  for (const v of values) {
    let m = /^\{mc\((.+),\s*([^,()]+)\)\}$/i.exec(v.value);
    if (m) {
      items.push({ component: v.name, original: m[1].trim(), tol: String(+(Number(m[2]) * 100).toPrecision(6)), dist: 'uniform' });
      continue;
    }
    m = /^\{(.+)\*\(1\+gauss\(([^()]+)\/3\)\)\}$/i.exec(v.value);
    if (m) {
      items.push({ component: v.name, original: m[1].trim(), tol: String(+(Number(m[2]) * 100).toPrecision(6)), dist: 'gauss' });
      continue;
    }
    m = /^\{(.+)\*\(1\+([^*()]+)\*\(2\*binary\(run,(\d+)\)-1\)\)\}$/i.exec(v.value);
    if (m) {
      worst = true;
      items[Number(m[3])] = { component: v.name, original: m[1].trim(), tol: String(+(Number(m[2]) * 100).toPrecision(6)), dist: 'uniform' };
    }
  }
  const measDefs: { def: MeasDef; enabled: boolean }[] = [];
  for (const l of lines) {
    if (!STUDY_LINE.test(l.value)) continue;
    if (/^\.meas/i.test(l.value)) {
      const d = parseMeas(l.value);
      if (typeof d !== 'string') measDefs.push({ def: d, enabled: l.enabled });
      else st.measures.push({ enabled: l.enabled, name: l.value.split(/\s+/)[2] ?? 'm', analysis: 'tran', kind: 'raw', signal: '', line: l.value });
      continue;
    }
    const step = parseStep(l.value);
    if (typeof step === 'string') continue;
    const tk = l.value.trim().split(/\s+/);
    const listMode = /\blist\b/i.test(l.value);
    const mode: SweepMode = listMode ? 'list' : /^(dec|oct)$/i.test(tk[1]) ? (tk[1].toLowerCase() as SweepMode) : 'lin';
    const nums = listMode ? [] : tk.slice(-3);
    const list = listMode ? l.value.replace(/^.*\blist\s+/i, '') : '';
    // ".step param run …" de las tolerancias
    if (step.target.kind === 'param' && step.target.name.toLowerCase() === 'run' && items.length) {
      st.tolerance = { enabled: l.enabled, mode: worst ? 'worst' : 'montecarlo', runs: worst ? String(2 ** items.length) : nums[1] ?? '100', items };
      continue;
    }
    let target: SweepTarget;
    let original: string | undefined;
    if (step.target.kind === 'param') {
      const name = step.target.name;
      const comp = values.find((v) => v.value.replace(/\s/g, '').toLowerCase() === `{${name.toLowerCase()}}`);
      if (comp && comp.name.toLowerCase() === name.toLowerCase()) {
        target = { kind: 'component', name: comp.name };
        original = params.get(name.toLowerCase());
      } else target = { kind: 'param', name };
    } else target = step.target;
    st.sweeps.push({ target, mode, list, start: nums[0] ?? '', stop: nums[1] ?? '', step: nums[2] ?? '', enabled: l.enabled, original });
  }
  st.measures.push(...measureFromDefs(measDefs));
  // bloques ilegibles: quedan las tarjetas reconstruidas desde las directivas
  const blocks = readData(doc, 'study');
  if (blocks !== undefined) st.blocks = blocks;
  const control = doc.texts.find((tt) => isControlBlock(tt.text));
  if (control) {
    const body = control.text.split('\\n').slice(1, -1);
    const h = controlHooks(body);
    st.custom = h
      ? { mode: 'hooks', body: '', before: h.before.join('\n'), after: h.after.join('\n'), final: h.final.join('\n') }
      : { mode: 'full', body: body.join('\n'), before: '', after: '', final: '' };
  }
  return st;
}

// --- aplicar al documento ------------------------------------------------------------------

function setValue(doc: AscDoc, lib: SymbolSource, inst: string, value: string): AscDoc {
  return {
    ...doc,
    symbols: doc.symbols.map((s) => {
      if ((effectiveAttrs(s, lib.symbol(s.type)).get('InstName') ?? '').toLowerCase() !== inst.toLowerCase()) return s;
      const attrs = new Map(s.attrs);
      attrs.set('Value', value);
      return { ...s, attrs };
    }),
  };
}

/** Saca las líneas del estudio (.step, .meas, las .param de componentes barridos, la .func binary) */
function stripStudy(doc: AscDoc, swept: Set<string>, keepControl: boolean): { texts: SchText[]; anchor: { x: number; y: number } | null } {
  const isStudyLine = (l: string) => {
    const v = l.trim();
    if (STUDY_LINE.test(v)) return true;
    if (v.replace(/\s/g, '') === BINARY_FUNC.replace(/\s/g, '')) return true;
    const p = /^\.param\s+([A-Za-z_]\w*)\s*=/i.exec(v);
    return !!p && swept.has(p[1].toLowerCase());
  };
  let anchor: { x: number; y: number } | null = null;
  const texts: SchText[] = [];
  for (const tt of doc.texts) {
    if (isStudyBlocksText(tt)) continue;
    if (isControlBlock(tt.text)) {
      if (keepControl) texts.push(tt);
      else anchor ??= { x: tt.x, y: tt.y };
      continue;
    }
    const lines = tt.text.split('\\n');
    const keep = lines.filter((l) => !isStudyLine(l));
    if (keep.length === lines.length) texts.push(tt);
    else {
      const left = keep.filter((l) => l.trim());
      // el estudio va donde estaba; si en ese texto quedan otras líneas, debajo de ellas
      anchor ??= { x: tt.x, y: tt.y + (left.length ? left.length * 24 + 16 : 0) };
      if (left.length) texts.push({ ...tt, text: keep.join('\\n') });
    }
  }
  return { texts, anchor };
}

/**
 * Reemplaza el estudio por código escrito a mano ("Ver código"): las líneas con ";" quedan
 * desactivadas (comentario) y un bloque .control es el paso personalizado. No toca los valores
 * de los componentes: el código decide.
 */
export function applyStudyCode(doc: AscDoc, lib: SymbolSource, code: string): AscDoc {
  const prev = studyFromDoc(doc, lib);
  const lines = code.split(/\r?\n/);
  const swept = new Set<string>();
  for (const l of lines) {
    const p = /^\s*;?\s*\.param\s+([A-Za-z_]\w*)\s*=/i.exec(l);
    if (p) swept.add(p[1].toLowerCase());
  }
  for (const s of prev.sweeps) if (s.target.kind === 'component') swept.add(s.target.name.toLowerCase());
  const c0 = lines.findIndex((l) => /^\s*\.control\b/i.test(l));
  const c1 = lines.findIndex((l, i) => i > c0 && /^\s*\.endc\b/i.test(l));
  const control = c0 >= 0 ? lines.slice(c0, c1 >= 0 ? c1 + 1 : undefined) : [];
  const rest = c0 >= 0 ? [...lines.slice(0, c0), ...(c1 >= 0 ? lines.slice(c1 + 1) : [])] : lines;
  const on = rest.filter((l) => l.trim() && !/^\s*;/.test(l)).map((l) => l.trim());
  const off = rest.filter((l) => /^\s*;/.test(l)).map((l) => l.replace(/^\s*;\s*/, ''));
  const { texts, anchor } = stripStudy(doc, swept, false);
  const at = anchor ?? belowTexts(doc);
  let y = at.y;
  const add = (kind: SchText['kind'], ls: string[]) => {
    if (!ls.length) return;
    texts.push({ x: at.x, y, align: 'Left', size: 2, kind, text: ls.join('\\n') });
    y += ls.length * 24 + 16;
  };
  add('directive', on);
  add('comment', off);
  add('comment', control);
  return { ...doc, texts };
}

/**
 * Escribe el estudio en el documento: saca las directivas del estudio anterior, restaura los
 * valores de los componentes que ya no se barren, aplica los nuevos y agrega los textos.
 */
export function applyStudy(doc: AscDoc, lib: SymbolSource, st: Study): AscDoc {
  const prev = studyFromDoc(doc, lib);
  let out = doc;
  // análisis: sólo si cambiaron (así no se mueven los textos del esquemático)
  if (st.analyses && JSON.stringify(st.analyses) !== JSON.stringify(prev.analyses)) out = applyAnalyses(out, st.analyses);
  // valores originales de lo que deja de estar barrido o con tolerancia
  for (const s of prev.sweeps) {
    if (s.target.kind === 'component' && s.original !== undefined && !st.sweeps.some((n) => n.target.kind === 'component' && n.target.name === (s.target as { name: string }).name)) {
      out = setValue(out, lib, s.target.name, s.original);
    }
  }
  for (const it of prev.tolerance?.items ?? []) {
    if (it && !st.tolerance?.items.some((n) => n.component === it.component)) out = setValue(out, lib, it.component, it.original);
  }
  for (const s of st.sweeps) if (s.target.kind === 'component') out = setValue(out, lib, s.target.name, `{${s.target.name}}`);
  st.tolerance?.items.forEach((it, i) => (out = setValue(out, lib, it.component, toleranceValue(it, st.tolerance!.mode, i))));

  const swept = new Set([...prev.sweeps, ...st.sweeps].filter((s) => s.target.kind === 'component').map((s) => (s.target as { name: string }).name.toLowerCase()));
  const { texts, anchor } = stripStudy(out, swept, !!st.custom);
  // ubicación: donde estaba el estudio, o debajo de los textos existentes
  const at = anchor ?? belowTexts(out);
  const { on, off } = studyLines(st);
  let y = at.y;
  const add = (kind: SchText['kind'], lines: string[]) => {
    if (!lines.length) return;
    texts.push({ x: at.x, y, align: 'Left', size: 2, kind, text: lines.join('\\n') });
    y += lines.length * 24 + 16;
  };
  add('directive', on);
  add('comment', off);
  // paso personalizado: bloque .control (comentario)
  if (st.custom) {
    const text = ['.control', ...customBody(st.custom), '.endc'].join('\\n');
    const i = texts.findIndex((tt) => isControlBlock(tt.text));
    if (i >= 0) texts[i] = { ...texts[i], kind: 'comment', text };
    else {
      texts.push({ x: at.x, y, align: 'Left', size: 2, kind: 'comment', text });
      y += customBody(st.custom).length * 24 + 40;
    }
  }
  // programa de bloques: texto chico (tamaño 0) debajo de todo; TurboSpice no lo dibuja
  if (st.blocks) texts.push(dataText('study', st.blocks, { x: at.x, y: y + 32 }));
  // qué graficar: la vista guardada (";.plot …")
  return st.plot ? withView({ ...out, texts }, st.plot) : placeDataTexts({ ...out, texts });
}
