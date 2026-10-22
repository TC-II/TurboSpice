// Panel "Estudio": barridos, tolerancias, mediciones y pasos personalizados como tarjetas,
// sin escribir SPICE. Genera directivas que LTspice también entiende (ver src/sim/study.ts).
import { lazy, Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
import { compileBlocks, studyToBlocks, type WorkspaceJson } from '../sim/studyBlocks.ts';
import { parseStep } from '../netlist/step.ts';
import type { MeasAnalysis } from '../sim/meas.ts';
import { CONTROL_SNIPPETS } from '../sim/controlSnippets.ts';
import { ANALYSES, defaultAnalysis, formatAnalysis, parseAnalysis, validateAnalysis, type AnalysisKind } from '../sim/analyses.ts';
import { traceColor, type Pane, type PlotView, type Trace } from '../waveform/view.ts';
import {
  activeAnalyses,
  customBody,
  MEASURE_KINDS,
  measureLines,
  stepLine,
  studyLines,
  type MeasureKind,
  type Study,
  type StudyAnalysis,
  type StudyMeasure,
  type StudySweep,
  type SweepTarget,
  type ToleranceItem,
} from '../sim/study.ts';
import { Modal } from './dialogs.tsx';
import { AnalysisForm, type Picker } from './simDialogs.tsx';
import { t } from '../i18n/i18n.ts';

const StudyBlocks = lazy(() => import('./StudyBlocks.tsx'));

export interface StudyInfo {
  /** componentes con nombre, prefijo y valor actual */
  components: { name: string; prefix: string; value: string }[];
  sources: string[];
  nets: string[];
  params: string[];
  /** análisis del esquemático (para las mediciones nuevas) */
  analysis: MeasAnalysis;
}

/** Corridas de un barrido (o null si está mal escrito) */
export function sweepRuns(s: StudySweep): number | null {
  const r = parseStep(stepLine(s));
  return typeof r === 'string' ? null : r.values.length;
}

export function totalRuns(st: Study): number {
  let n = 1;
  for (const s of st.sweeps) if (s.enabled) n *= sweepRuns(s) ?? 1;
  const tt = st.tolerance;
  if (tt?.enabled && tt.items.length) n *= tt.mode === 'worst' ? 2 ** tt.items.length : Number(tt.runs) || 1;
  return n;
}

/** Código que genera el estudio (las líneas desactivadas, comentadas con ";") */
export function studyCode(st: Study): string {
  const { on, off } = studyLines(st);
  const control = st.custom ? ['.control', ...customBody(st.custom), '.endc'] : [];
  return [...on, ...off.map((l) => `;${l}`), ...control].join('\n');
}

const SWEEP_KINDS: [SweepTarget['kind'], string][] = [
  ['component', t('A component\'s value')],
  ['param', t('A parameter (.param)')],
  ['source', t('A source (DC value)')],
  ['temp', t('The temperature')],
  ['model', t('A model parameter')],
];

/** Valor original para usar dentro de una expresión: µ → u */
const plain = (v: string) => v.trim().replace(/[µμ]/g, 'u');

const isNumeric = (v: string) => /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?(meg|[tgkmunpfµ])?[a-zΩ]*$/i.test(v.trim());

function Card({ title, enabled, onToggle, onRemove, children, extra }: {
  title: string;
  enabled: boolean;
  onToggle(v: boolean): void;
  onRemove(): void;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <section className={`study-card${enabled ? '' : ' off'}`}>
      <header>
        <label className="check inline">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} aria-label={`Activar ${title}`} />
          <strong>{title}</strong>
        </label>
        {extra}
        <button className="x" onClick={onRemove} aria-label={t('Remove {title}', { title })} title={t('Remove')}>✕</button>
      </header>
      <div className="study-body">{children}</div>
    </section>
  );
}

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function PickInput({ value, onChange, picker, what, list, placeholder, label }: {
  value: string;
  onChange(v: string): void;
  picker?: Picker;
  what: 'net' | 'source' | 'component';
  list?: string;
  placeholder?: string;
  label: string;
}) {
  return (
    <span className="with-pick">
      <input value={value} list={list} placeholder={placeholder} spellCheck={false} aria-label={label} onChange={(e) => onChange(e.target.value.trim())} />
      {picker && (
        <button
          type="button"
          className="pick-btn"
          aria-label={t('Pick {label} on the schematic', { label })}
          title={t('Pick on the schematic')}
          onClick={() => picker(what).then((v) => v && onChange(what === 'net' ? `V(${v})` : v))}
        >
          ⌖
        </button>
      )}
    </span>
  );
}

function SweepCard({ s, set, remove, info, picker }: { s: StudySweep; set(s: StudySweep): void; remove(): void; info: StudyInfo; picker?: Picker }) {
  const tt = s.target;
  const runs = sweepRuns(s);
  const setTarget = (kind: SweepTarget['kind']) => {
    const target: SweepTarget = kind === 'temp' ? { kind } : kind === 'model' ? { kind, model: '', param: '' } : { kind, name: '' };
    set({ ...s, target, original: undefined });
  };
  const setComponent = (name: string) => {
    const c = info.components.find((x) => x.name.toLowerCase() === name.toLowerCase());
    // si ya está barrido ({R1}) se conserva el original guardado
    set({ ...s, target: { kind: 'component', name: c?.name ?? name }, original: c && !/^\{/.test(c.value) ? plain(c.value) : s.original });
  };
  return (
    <Card
      title={t('Sweep{p0}', { p0: 'name' in tt && tt.name ? t(' of {name}', { name: tt.name }) : tt.kind === 'temp' ? t(' of temperature') : '' })}
      enabled={s.enabled}
      onToggle={(enabled) => set({ ...s, enabled })}
      onRemove={remove}
      extra={<span className="hint">{runs === null ? t('invalid values') : t('{runs} run{p1}', { runs, p1: runs === 1 ? '' : 's' })}</span>}
    >
      <Row label={t('What to vary')}>
        <select value={tt.kind} onChange={(e) => setTarget(e.target.value as SweepTarget['kind'])} aria-label={t('What to vary')}>
          {SWEEP_KINDS.map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
      </Row>
      {tt.kind === 'component' && (
        <Row label={t('Component')} hint={s.original ? t('Original value: {original} (becomes {{name}})', { original: s.original, name: tt.name }) : undefined}>
          <PickInput value={tt.name} onChange={setComponent} picker={picker} what="component" list="study-components" label={t('Component')} />
        </Row>
      )}
      {tt.kind === 'param' && (
        <Row label={t('Parameter')} hint={t('Use it in a value as {nombre}')}>
          <input value={tt.name} list="study-params" spellCheck={false} aria-label={t('Parameter')} onChange={(e) => set({ ...s, target: { kind: 'param', name: e.target.value.trim() } })} />
        </Row>
      )}
      {tt.kind === 'source' && (
        <Row label={t('Source')}>
          <PickInput value={tt.name} onChange={(name) => set({ ...s, target: { kind: 'source', name } })} picker={picker} what="source" list="study-sources" label={t('Source')} />
        </Row>
      )}
      {tt.kind === 'model' && (
        <>
          <Row label={t('Model')}>
            <input value={tt.model} spellCheck={false} aria-label={t('Model')} placeholder="2N2222" onChange={(e) => set({ ...s, target: { ...tt, model: e.target.value.trim() } })} />
          </Row>
          <Row label={t('Model parameter')}>
            <input value={tt.param} spellCheck={false} aria-label={t('Model parameter')} placeholder="BF" onChange={(e) => set({ ...s, target: { ...tt, param: e.target.value.trim() } })} />
          </Row>
        </>
      )}
      <Row label={t('How')}>
        <select value={s.mode} onChange={(e) => set({ ...s, mode: e.target.value as StudySweep['mode'] })} aria-label={t('How')}>
          <option value="list">{t('List of values')}</option>
          <option value="lin">{t('Linear (start, stop, step)')}</option>
          <option value="dec">{t('Per decade')}</option>
          <option value="oct">{t('Per octave')}</option>
        </select>
      </Row>
      {s.mode === 'list' ? (
        <Row label={t('Values')} hint={t('Separated by spaces: 1k 2k 5k')}>
          <input value={s.list} spellCheck={false} aria-label={t('Values')} onChange={(e) => set({ ...s, list: e.target.value })} />
        </Row>
      ) : (
        <div className="study-triple">
          <Row label={t('Start')}>
            <input value={s.start} aria-label={t('Start')} onChange={(e) => set({ ...s, start: e.target.value.trim() })} />
          </Row>
          <Row label={t('Stop')}>
            <input value={s.stop} aria-label={t('Stop')} onChange={(e) => set({ ...s, stop: e.target.value.trim() })} />
          </Row>
          <Row label={s.mode === 'lin' ? t('Step') : t('Points per {p0}', { p0: s.mode === 'dec' ? t('decade') : t('octave') })}>
            <input value={s.step} aria-label={t('Step')} onChange={(e) => set({ ...s, step: e.target.value.trim() })} />
          </Row>
        </div>
      )}
    </Card>
  );
}

function ToleranceCard({ st, set, info, picker }: { st: Study; set(st: Study): void; info: StudyInfo; picker?: Picker }) {
  const tt = st.tolerance!;
  const upd = (patch: Partial<typeof tt>) => set({ ...st, tolerance: { ...tt, ...patch } });
  const setItem = (i: number, patch: Partial<ToleranceItem>) => upd({ items: tt.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });
  const addComponent = (name: string) => {
    const c = info.components.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!c || tt.items.some((i) => i.component === c.name)) return;
    upd({ items: [...tt.items, { component: c.name, tol: c.prefix.toUpperCase() === 'C' ? '10' : '5', dist: 'uniform', original: plain(c.value) }] });
  };
  const addAll = (prefix: string, tol: string) => {
    const add = info.components
      .filter((c) => c.prefix.toUpperCase() === prefix && isNumeric(c.value) && !tt.items.some((i) => i.component === c.name))
      .map((c) => ({ component: c.name, tol, dist: 'uniform' as const, original: plain(c.value) }));
    upd({ items: [...tt.items, ...add] });
  };
  const candidates = info.components.filter((c) => isNumeric(c.value) && !tt.items.some((i) => i.component === c.name));
  return (
    <Card
      title={t('Tolerances')}
      enabled={tt.enabled}
      onToggle={(enabled) => upd({ enabled })}
      onRemove={() => set({ ...st, tolerance: null })}
      extra={<span className="hint">{tt.mode === 'worst' ? t('{p0} runs', { p0: 2 ** tt.items.length }) : t('{runs} runs', { runs: tt.runs })}</span>}
    >
      <Row label={t('Analysis type')}>
        <select value={tt.mode} onChange={(e) => upd({ mode: e.target.value as typeof tt.mode })} aria-label={t('Tolerance analysis type')}>
          <option value="montecarlo">{t('Monte Carlo (random values)')}</option>
          <option value="worst">{t('Worst case (all ±tol combinations)')}</option>
        </select>
      </Row>
      {tt.mode === 'montecarlo' && (
        <Row label={t('Runs')}>
          <input value={tt.runs} aria-label={t('Runs')} onChange={(e) => upd({ runs: e.target.value.replace(/\D/g, '') })} />
        </Row>
      )}
      <div className="tol-quick">
        <button onClick={() => addAll('R', '5')}>{t('All resistors 5 %')}</button>
        <button onClick={() => addAll('C', '10')}>{t('All capacitors 10 %')}</button>
        <button onClick={() => addAll('L', '10')}>{t('All inductors 10 %')}</button>
      </div>
      <table className="tol-table">
        <thead>
          <tr>
            <th>{t('Component')}</th>
            <th>{t('Value')}</th>
            <th>{t('Tolerance (%)')}</th>
            {tt.mode === 'montecarlo' && <th>{t('Distribution')}</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {tt.items.map((it, i) => (
            <tr key={it.component}>
              <td>{it.component}</td>
              <td>{it.original}</td>
              <td>
                <input value={it.tol} aria-label={t('Tolerance of {component}', { component: it.component })} onChange={(e) => setItem(i, { tol: e.target.value.trim() })} />
              </td>
              {tt.mode === 'montecarlo' && (
                <td>
                  <select value={it.dist} aria-label={t('Distribution of {component}', { component: it.component })} onChange={(e) => setItem(i, { dist: e.target.value as ToleranceItem['dist'] })}>
                    <option value="uniform">{t('Uniform')}</option>
                    <option value="gauss">Normal (tol = 3σ)</option>
                  </select>
                </td>
              )}
              <td>
                <button className="x" aria-label={t('Remove {component}', { component: it.component })} onClick={() => upd({ items: tt.items.filter((_, k) => k !== i) })}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tol-add">
        <select value="" aria-label={t('Add component')} onChange={(e) => e.target.value && addComponent(e.target.value)}>
          <option value="">{t('Add component…')}</option>
          {candidates.map((c) => (
            <option key={c.name} value={c.name}>{c.name} ({c.value})</option>
          ))}
        </select>
        {picker && (
          <button className="pick-btn" aria-label={t('Pick a component with tolerance on the schematic')} onClick={() => picker('component').then((v) => v && addComponent(v))}>
            ⌖
          </button>
        )}
      </div>
    </Card>
  );
}

function MeasureCard({ m, set, remove, picker }: { m: StudyMeasure; set(m: StudyMeasure): void; remove(): void; picker?: Picker }) {
  const kinds = MEASURE_KINDS.filter((k) => k.analysis.includes(m.analysis));
  const meta = MEASURE_KINDS.find((k) => k.kind === m.kind);
  const unit = m.analysis === 'tran' ? 's' : m.analysis === 'ac' || m.analysis === 'noise' ? 'Hz' : '';
  const signal = (label: string, key: 'signal' | 'signal2', placeholder = m.analysis === 'noise' ? 'V(onoise)' : 'V(out)') => (
    <Row label={label}>
      <PickInput value={m[key] ?? ''} onChange={(v) => set({ ...m, [key]: v })} picker={picker} what="net" placeholder={placeholder} label={label} />
    </Row>
  );
  const field = (label: string, key: 'at' | 'level' | 'level2' | 'from' | 'to', hint?: string) => (
    <Row label={label} hint={hint}>
      <input value={m[key] ?? ''} aria-label={label} onChange={(e) => set({ ...m, [key]: e.target.value.trim() })} />
    </Row>
  );
  let lines: string[] = [];
  try {
    lines = measureLines(m);
  } catch {
    lines = [];
  }
  return (
    <Card title={t('Measurement {name}', { name: m.name })} enabled={m.enabled} onToggle={(enabled) => set({ ...m, enabled })} onRemove={remove}>
      <div className="study-triple">
        <Row label={t('Name')}>
          <input value={m.name} aria-label={t('Measurement name')} onChange={(e) => set({ ...m, name: e.target.value.replace(/[^\w]/g, '') })} />
        </Row>
        <Row label={t('Analysis')}>
          <select
            value={m.analysis}
            aria-label={t('Measurement analysis')}
            onChange={(e) => {
              const analysis = e.target.value as MeasAnalysis;
              const ok = MEASURE_KINDS.find((k) => k.kind === m.kind)?.analysis.includes(analysis);
              set({ ...m, analysis, kind: ok ? m.kind : (MEASURE_KINDS.find((k) => k.analysis.includes(analysis))!.kind as MeasureKind) });
            }}
          >
            <option value="tran">{t('Transient')}</option>
            <option value="ac">AC</option>
            <option value="dc">{t('DC sweep')}</option>
            <option value="noise">{t('Noise')}</option>
          </select>
        </Row>
        <Row label={t('What to measure')}>
          <select value={m.kind} aria-label={t('What to measure')} onChange={(e) => set({ ...m, kind: e.target.value as MeasureKind, line: m.line ?? lines[0] })}>
            {kinds.map((k) => (
              <option key={k.kind} value={k.kind}>{k.label}</option>
            ))}
          </select>
        </Row>
      </div>
      {m.kind === 'raw' ? (
        <Row label=".meas" hint={t('LTspice syntax')}>
          <input value={m.line ?? ''} spellCheck={false} aria-label={t('.meas line')} onChange={(e) => set({ ...m, line: e.target.value })} />
        </Row>
      ) : (
        <>
          {signal(m.kind === 'delay' ? t('Reference signal') : t('Signal'), 'signal')}
          {m.kind === 'delay' && signal(t('Delayed signal'), 'signal2')}
          {(m.kind === 'at' || m.kind === 'gainAt') && field(m.analysis === 'tran' ? 'Instante' : m.analysis === 'dc' ? t('Sweep value') : t('Frequency'), 'at', unit && t('in {unit}', { unit }))}
          {(m.kind === 'rise' || m.kind === 'fall') && (
            <div className="study-triple">
              {field(m.kind === 'rise' ? t('From level') : t('From level (high)'), 'level', t('e.g. 10 % of the final value'))}
              {field(m.kind === 'rise' ? t('To level') : t('To level (low)'), 'level2', 'p.ej. 90 %')}
            </div>
          )}
          {m.kind === 'delay' && (
            <div className="study-triple">
              {field(t('Level on the reference'), 'level')}
              {field(t('Level on the delayed one'), 'level2', t('empty = the same'))}
            </div>
          )}
          {(m.kind === 'period' || m.kind === 'freq') && field(t('Crossing level'), 'level', t('e.g. the signal\'s mean value'))}
          {['max', 'min', 'pp', 'avg', 'rms', 'noise'].includes(m.kind) && (
            <div className="study-triple">
              {field(t('From'), 'from', t('empty = all'))}
              {field(t('To'), 'to')}
            </div>
          )}
        </>
      )}
      <code className="study-line">{lines.join('\n')}</code>
      {meta && <span className="hint">{meta.label}</span>}
    </Card>
  );
}

function AnalysisCard({ a, index, primary, set, remove, picker }: {
  a: StudyAnalysis;
  index: number;
  /** es el análisis principal (el que corre LTspice) */
  primary: boolean;
  set(a: StudyAnalysis): void;
  remove(): void;
  picker?: Picker;
}) {
  const parsed = parseAnalysis(a.line);
  const kind = parsed?.kind ?? (/^\s*\.(\w+)/.exec(a.line)?.[1].toLowerCase() as AnalysisKind | undefined);
  const meta = ANALYSES.find((x) => x.kind === kind);
  const errors = parsed ? validateAnalysis(parsed) : [];
  return (
    <Card
      title={t('Simulation {p0}{p1}', { p0: index + 1, p1: meta ? `: ${meta.label}` : '' })}
      enabled={a.enabled}
      onToggle={(enabled) => set({ ...a, enabled })}
      onRemove={remove}
      extra={
        a.enabled && (
          <span className="hint">{primary && !meta?.ngspiceOnly ? t('main (the one LTspice runs)') : t('TurboSpice only')}</span>
        )
      }
    >
      <Row label={t('Analysis')}>
        <select
          value={kind ?? ''}
          aria-label={t('Analysis type')}
          onChange={(e) => set({ ...a, line: formatAnalysis(defaultAnalysis(e.target.value as AnalysisKind)) })}
        >
          {!meta && <option value="">{t('(other)')}</option>}
          {ANALYSES.map((x) => (
            <option key={x.kind} value={x.kind}>
              {x.label}
              {x.ngspiceOnly ? ' (ngspice)' : ''}
            </option>
          ))}
        </select>
      </Row>
      {parsed ? (
        <div className="study-analysis">
          <AnalysisForm a={parsed} set={(x) => set({ ...a, line: formatAnalysis(x) })} picker={picker} />
        </div>
      ) : (
        <Row label={t('Directive')} hint={t('Options the form doesn\'t handle: it\'s edited as text')}>
          <input value={a.line} spellCheck={false} aria-label={t('Analysis directive')} onChange={(e) => set({ ...a, line: e.target.value })} />
        </Row>
      )}
      <code className="study-line">{a.line}</code>
      {errors.length > 0 && <span className="hint warn">{errors.join(' · ')}</span>}
    </Card>
  );
}

const kindOf = (line: string) => /^\s*\.(\w+)/.exec(line)?.[1].toLowerCase() ?? '';

/** Vista sin señales vacías ni paneles vacíos */
function cleanPlot(v: PlotView | undefined): PlotView | undefined {
  if (!v) return v;
  const out: PlotView = {};
  for (const [k, panes] of Object.entries(v)) {
    const ps = panes.map((p) => ({ traces: p.traces.filter((tt) => tt.expr.trim()) })).filter((p) => p.traces.length);
    if (ps.length) out[k] = ps;
  }
  return out;
}

const PLOT_KINDS: [string, string][] = [
  ['tran', t('Transient')],
  ['ac', 'AC (Bode)'],
  ['dc', t('DC sweep')],
  ['noise', t('Noise')],
];

function PlotCard({ view, set, remove, picker, preferred }: {
  view: PlotView;
  set(v: PlotView): void;
  remove(): void;
  picker?: Picker;
  /** análisis a mostrar primero (los del estudio) */
  preferred: string[];
}) {
  const kinds = [...new Set([...preferred, ...Object.keys(view)])].filter(Boolean);
  const [kind, setKind] = useState(kinds[0] ?? 'tran');
  const panes = view[kind] ?? [];
  const setPanes = (p: Pane[]) => {
    const { [kind]: _, ...rest } = view;
    set(p.length ? { ...rest, [kind]: p } : rest);
  };
  const setTrace = (pi: number, ti: number, tt: Trace | null) =>
    setPanes(panes.map((p, k) => (k === pi ? { traces: tt ? p.traces.map((x, j) => (j === ti ? tt : x)) : p.traces.filter((_, j) => j !== ti) } : p)));
  const addTrace = (pi: number, expr: string) => setPanes(panes.map((p, k) => (k === pi ? { traces: [...p.traces, { expr }] } : p)));
  const label = (k: string) => PLOT_KINDS.find(([x]) => x === k)?.[1] ?? `.${k}`;
  return (
    <Card title={t('Plot')} enabled onToggle={(v) => !v && remove()} onRemove={remove}>
      <Row label={t('Analysis')}>
        <select value={kind} aria-label={t('Plot analysis')} onChange={(e) => setKind(e.target.value)}>
          {[...new Set([...kinds, ...PLOT_KINDS.map(([k]) => k)])].map((k) => (
            <option key={k} value={k}>
              {label(k)}
              {view[k]?.length ? ` (${view[k].length} panel${view[k].length === 1 ? '' : 'es'})` : ''}
            </option>
          ))}
        </select>
      </Row>
      {panes.map((p, pi) => (
        <fieldset key={pi} className="study-pane">
          <legend>
            {t('Pane')}{' '}{pi + 1}
            <button className="x" aria-label={t('Remove pane {p0}', { p0: pi + 1 })} title={t('Remove the pane')} onClick={() => setPanes(panes.filter((_, k) => k !== pi))}>
              ✕
            </button>
          </legend>
          {p.traces.map((tt, ti) => (
            <div key={ti} className="study-trace">
              <input
                type="color"
                className="color"
                aria-label={t('Color of {p0}', { p0: tt.expr || t('the signal') })}
                value={traceColor(tt, ti)}
                onChange={(e) => setTrace(pi, ti, { ...tt, color: e.target.value })}
              />
              <PickInput value={tt.expr} onChange={(expr) => setTrace(pi, ti, { ...tt, expr })} picker={picker} what="net" list="sim-nets-v" label={t('Signal {p0} of pane {p1}', { p0: ti + 1, p1: pi + 1 })} placeholder="V(out) o V(out)/V(in)" />
              <button className="x" aria-label={t('Remove {p0}', { p0: tt.expr || t('the signal') })} title={t('Remove')} onClick={() => setTrace(pi, ti, null)}>
                ✕
              </button>
            </div>
          ))}
          <div className="tol-quick">
            <button onClick={() => addTrace(pi, '')}>{t('+ Signal')}</button>
            {picker && (
              <button onClick={() => picker('net').then((v) => v && addTrace(pi, `V(${v})`))} title={t('Choose a net on the schematic')}>
                {t('+ Signal from the schematic ⌖')}
              </button>
            )}
          </div>
        </fieldset>
      ))}
      <div className="tol-quick">
        <button onClick={() => setPanes([...panes, { traces: [] }])}>{t('+ Pane for')}{' '}{label(kind)}</button>
      </div>
      <p className="hint">
        {t('It\'s the same view as "Remember view" in the results: it\'s applied on every simulation and saved inside the .asc.')}
        {kind === 'ac' ? t(' In AC each signal is shown as a Bode plot (magnitude and phase).') : ''}
      </p>
    </Card>
  );
}

export function StudyPanel({ initial, info, picker, hidden, onApply, onApplyCode, onClose }: {
  initial: Study;
  info: StudyInfo;
  picker?: Picker;
  hidden?: boolean;
  onApply(st: Study): void;
  onApplyCode(code: string): void;
  onClose(): void;
}) {
  const [st, setStudy] = useState<Study>(initial);
  // si el estudio se armó con bloques, se abre en esa pestaña
  const [tab, setTab] = useState<'cards' | 'blocks' | 'code'>(initial.blocks ? 'blocks' : 'cards');
  const [blocks, setBlocks] = useState<WorkspaceJson | null>((initial.blocks as WorkspaceJson | undefined) ?? null);
  const blocksTouched = useRef(false);
  const cardsTouched = useRef(false);
  const set = (x: Study) => {
    cardsTouched.current = true;
    setStudy(x);
  };
  const compiled = useMemo(() => (blocks ? compileBlocks(blocks, info.analysis) : null), [blocks, info.analysis]);
  /** Valor original de los componentes barridos desde bloques (para la .param) */
  const withOriginals = (x: Study): Study => ({
    ...x,
    sweeps: x.sweeps.map((sw) => {
      if (sw.target.kind !== 'component' || sw.original !== undefined) return sw;
      const name = sw.target.name;
      const c = info.components.find((k) => k.name.toLowerCase() === name.toLowerCase());
      const prev = initial.sweeps.find((p) => p.target.kind === 'component' && p.target.name === name)?.original;
      return { ...sw, original: c && !/^\{/.test(c.value) ? plain(c.value) : prev };
    }),
  });
  const [code, setCode] = useState<string | null>(null);
  const runs = totalRuns(st);
  const analyses = st.analyses ?? [];
  const active = activeAnalyses(analyses);
  const setAnalyses = (list: StudyAnalysis[]) => set({ ...st, analyses: list });
  // tarjeta "Gráfico": la vista guardada en el .asc (la misma que "Recordar vista")
  const [plotOpen, setPlotOpen] = useState(!!initial.plot);
  const shownCode = code ?? studyCode(blocksTouched.current && compiled && !cardsTouched.current ? compiled.study : st);
  const nextName = (base: string) => {
    for (let i = 1; ; i++) if (!st.measures.some((m) => m.name === `${base}${i}`)) return `${base}${i}`;
  };
  const add = {
    sweep: () =>
      set({
        ...st,
        sweeps: [...st.sweeps, { target: { kind: 'component', name: '' }, mode: 'list', list: '', start: '', stop: '', step: '', enabled: true }],
      }),
    tolerance: () => set({ ...st, tolerance: { enabled: true, mode: 'montecarlo', runs: '100', items: [] } }),
    measure: () =>
      set({
        ...st,
        measures: [
          ...st.measures,
          { enabled: true, name: nextName('m'), analysis: info.analysis, kind: info.analysis === 'ac' ? 'f3db' : info.analysis === 'noise' ? 'noise' : 'max', signal: '' },
        ],
      }),
    custom: () => set({ ...st, custom: { mode: 'hooks', body: 'run\n', before: '', after: '', final: '' } }),
    analysis: () => {
      const used = new Set(analyses.map((a) => kindOf(a.line)));
      const kind = (['tran', 'ac', 'dc', 'noise', 'op'] as AnalysisKind[]).find((k) => !used.has(k)) ?? 'tran';
      setAnalyses([...analyses, { enabled: true, line: formatAnalysis(defaultAnalysis(kind)) }]);
    },
    plot: () => {
      setPlotOpen(true);
      set({ ...st, plot: st.plot ?? {} });
    },
  };
  const problems = [
    ...analyses.flatMap((a, i) => {
      const p = parseAnalysis(a.line);
      return a.enabled && p && validateAnalysis(p).length ? [t('Check the data of simulation {p0}', { p0: i + 1 })] : [];
    }),
    ...st.sweeps.filter((s) => s.enabled && sweepRuns(s) === null).map(() => t('There\'s a sweep with invalid values')),
    ...st.sweeps.filter((s) => s.target.kind === 'component' && (!s.target.name || s.original === undefined)).map(() => t('Pick the component to sweep')),
    ...st.measures.filter((m) => m.kind !== 'raw' && !m.signal).map((m) => t('The signal of {name} is missing', { name: m.name })),
  ];
  return (
    <Modal title={t('Study')} onClose={onClose} wide hidden={hidden}>
      <datalist id="study-components">{info.components.map((c) => <option key={c.name} value={c.name}>{c.value}</option>)}</datalist>
      <datalist id="study-sources">{info.sources.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="study-params">{info.params.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="sim-nets">{info.nets.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="sim-sources">{info.sources.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="sim-nets-v">{info.nets.map((n) => <option key={n} value={`V(${n})`} />)}</datalist>
      <nav className="tabs study-tabs">
        <button className={tab === 'cards' ? 'active' : ''} onClick={() => setTab('cards')}>{t('Cards')}</button>
        <button
          className={tab === 'blocks' ? 'active' : ''}
          onClick={() => {
            // "abrir en bloques": las tarjetas se convierten en el programa equivalente
            if (!blocks || cardsTouched.current) setBlocks(studyToBlocks(st));
            cardsTouched.current = false;
            setTab('blocks');
          }}
        >
          {t('Blocks')}
        </button>
        <button
          className={tab === 'code' ? 'active' : ''}
          onClick={() => {
            setCode(null);
            setTab('code');
          }}
        >
          {t('View code')}
        </button>
        {tab !== 'blocks' && (
          <span className="hint study-runs">
            {runs} {t('run')}{runs === 1 ? '' : 's'} {t('in total')}
            {active.length > 0 && t(' · each one runs {p0}', { p0: active.map((a) => `.${kindOf(a.line)}`).join(', ') })}
          </span>
        )}
      </nav>
      {tab === 'cards' && (
        <div className="study-cards">
          {analyses.map((a, i) => (
            <AnalysisCard
              key={`a${i}`}
              a={a}
              index={i}
              primary={active[0] === a}
              picker={picker}
              set={(n) => setAnalyses(analyses.map((x, k) => (k === i ? n : x)))}
              remove={() => setAnalyses(analyses.filter((_, k) => k !== i))}
            />
          ))}
          {active.length > 1 && (
            <p className="hint warn">
              {t('LTspice runs a single analysis per simulation: in the .asc the first active simulation stays as a directive and the others as a comment that LTspice ignores and only TurboSpice runs.')}
            </p>
          )}
          {st.sweeps.map((s, i) => (
            <SweepCard
              key={i}
              s={s}
              info={info}
              picker={picker}
              set={(n) => set({ ...st, sweeps: st.sweeps.map((x, k) => (k === i ? n : x)) })}
              remove={() => set({ ...st, sweeps: st.sweeps.filter((_, k) => k !== i) })}
            />
          ))}
          {st.tolerance && <ToleranceCard st={st} set={set} info={info} picker={picker} />}
          {st.measures.map((m, i) => (
            <MeasureCard
              key={i}
              m={m}
              picker={picker}
              set={(n) => set({ ...st, measures: st.measures.map((x, k) => (k === i ? n : x)) })}
              remove={() => set({ ...st, measures: st.measures.filter((_, k) => k !== i) })}
            />
          ))}
          {st.custom && (
            <Card title={t('Custom step (.control)')} enabled onToggle={(v) => !v && set({ ...st, custom: null })} onRemove={() => set({ ...st, custom: null })}>
              <Row label={t('How it\'s combined')}>
                <select
                  value={st.custom.mode}
                  aria-label={t('Custom step mode')}
                  onChange={(e) => set({ ...st, custom: { ...st.custom!, mode: e.target.value as 'full' | 'hooks' } })}
                >
                  <option value="hooks">{t('With the sweeps: before / after each run and at the end')}</option>
                  <option value="full">{t('Full block: the .control decides what to simulate')}</option>
                </select>
              </Row>
              {st.custom.mode === 'full' ? (
                <textarea
                  className="study-control"
                  rows={8}
                  spellCheck={false}
                  aria-label={t('.control block')}
                  value={st.custom.body}
                  onChange={(e) => set({ ...st, custom: { ...st.custom!, body: e.target.value } })}
                />
              ) : (
                (['before', 'after', 'final'] as const).map((k) => (
                  <Row key={k} label={{ before: t('Before each run'), after: t('After each run'), final: t('At the end') }[k]}>
                    <textarea
                      rows={3}
                      spellCheck={false}
                      aria-label={{ before: t('Before each run'), after: t('After each run'), final: t('At the end') }[k]}
                      value={st.custom![k]}
                      placeholder={k === 'after' ? 'print v(out)' : k === 'final' ? t('echo done') : 'set ...'}
                      onChange={(e) => set({ ...st, custom: { ...st.custom!, [k]: e.target.value } })}
                    />
                  </Row>
                ))
              )}
              {st.custom.mode === 'full' && (
                <div className="tol-quick">
                  {CONTROL_SNIPPETS.slice(0, 6).map((s) => (
                    <button key={s.label} title={s.help} onClick={() => set({ ...st, custom: { ...st.custom!, body: `${st.custom!.body.replace(/\n?$/, '\n')}${s.code}\n` } })}>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
              <p className="hint warn">
                {t('LTspice has no .control: it\'s saved as a comment that LTspice ignores, so this step only runs in TurboSpice.')}
                {st.custom.mode === 'full' && (st.sweeps.length || st.tolerance) ? t(' In "full block" mode sweeps and tolerances are ignored.') : ''}
              </p>
            </Card>
          )}
          {plotOpen && st.plot && (
            <PlotCard
              view={st.plot}
              picker={picker}
              preferred={active.map((a) => kindOf(a.line)).filter((k) => PLOT_KINDS.some(([x]) => x === k))}
              set={(plot) => set({ ...st, plot })}
              remove={() => {
                setPlotOpen(false);
                set({ ...st, plot: initial.plot ? {} : undefined });
              }}
            />
          )}
          <div className="study-add">
            <button onClick={add.analysis}>{t('+ Simulation')}</button>
            <button onClick={add.sweep}>{t('+ Sweep')}</button>
            <button onClick={add.tolerance} disabled={!!st.tolerance}>{t('+ Tolerances')}</button>
            <button onClick={add.measure}>{t('+ Measurement')}</button>
            <button onClick={add.custom} disabled={!!st.custom}>{t('+ Custom step')}</button>
            <button onClick={add.plot} disabled={plotOpen}>{t('+ Plot')}</button>
          </div>
          {!analyses.length && !st.sweeps.length && !st.tolerance && !st.measures.length && !st.custom && !plotOpen && (
            <p className="empty pad">
              {t('Add simulations (.tran, .ac…), what to plot, a sweep (vary a component, a source, the temperature…), tolerances (Monte Carlo or worst case) or measurements (rise time, f at −3 dB…). They\'re saved as .step and .meas, so the .asc still simulates the same in LTspice.')}
            </p>
          )}
        </div>
      )}
      {tab === 'blocks' && blocks && (
        <>
          <Suspense fallback={<p className="empty pad">{t('Loading the block editor…')}</p>}>
            <StudyBlocks
              initial={blocks}
              info={info}
              onChange={(ws) => {
                blocksTouched.current = true;
                setBlocks(ws);
              }}
            />
          </Suspense>
          {compiled && (
            <p className={`hint${compiled.errors.length ? ' warn' : ''}`}>
              {compiled.errors.length
                ? compiled.errors.join(' · ')
                : compiled.ltspice
                  ? t('Saved as .step and .meas: the .asc still simulates the same in LTspice.')
                  : t('It uses logic LTspice doesn\'t have: it\'s saved as a .control block (TurboSpice only). The blocks are saved in the .asc.')}
            </p>
          )}
        </>
      )}
      {tab === 'code' && (
        <div className="study-code">
          <textarea spellCheck={false} rows={14} aria-label={t('Study code')} value={shownCode} onChange={(e) => setCode(e.target.value)} />
          <p className="hint">
            {t('Lines starting with ";" are disabled. You can edit by hand: when applying, what\'s recognized becomes cards again and the rest stays as a directive.')}
          </p>
        </div>
      )}
      {tab === 'cards' && problems.length > 0 && <p className="hint warn">{[...new Set(problems)].join(' · ')}</p>}
      <div className="buttons">
        <button onClick={onClose}>{t('Cancel')}</button>
        {tab === 'code' && code !== null ? (
          <button className="primary" onClick={() => onApplyCode(code)}>{t('Apply code')}</button>
        ) : tab === 'blocks' ? (
          <button
            className="primary"
            disabled={!compiled || compiled.errors.length > 0}
            onClick={() =>
              compiled && onApply(withOriginals({ ...compiled.study, analyses: st.analyses, plot: cleanPlot(compiled.study.plot ?? st.plot), blocks: blocks ?? undefined }))
            }
          >
            {t('Apply')}
          </button>
        ) : (
          <button
            className="primary"
            disabled={problems.length > 0}
            // editar las tarjetas descarta el programa de bloques (ya no coincidiría)
            onClick={() => onApply({ ...st, plot: cleanPlot(st.plot), blocks: cardsTouched.current ? undefined : st.blocks })}
          >
            {t('Apply')}
          </button>
        )}
      </div>
    </Modal>
  );
}
