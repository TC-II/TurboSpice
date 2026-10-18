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
  const t = st.tolerance;
  if (t?.enabled && t.items.length) n *= t.mode === 'worst' ? 2 ** t.items.length : Number(t.runs) || 1;
  return n;
}

/** Código que genera el estudio (las líneas desactivadas, comentadas con ";") */
export function studyCode(st: Study): string {
  const { on, off } = studyLines(st);
  const control = st.custom ? ['.control', ...customBody(st.custom), '.endc'] : [];
  return [...on, ...off.map((l) => `;${l}`), ...control].join('\n');
}

const SWEEP_KINDS: [SweepTarget['kind'], string][] = [
  ['component', 'Valor de un componente'],
  ['param', 'Un parámetro (.param)'],
  ['source', 'Una fuente (valor DC)'],
  ['temp', 'La temperatura'],
  ['model', 'Un parámetro de un modelo'],
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
        <button className="x" onClick={onRemove} aria-label={`Quitar ${title}`} title="Quitar">✕</button>
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
          aria-label={`Elegir ${label} en el esquemático`}
          title="Elegir en el esquemático"
          onClick={() => picker(what).then((v) => v && onChange(what === 'net' ? `V(${v})` : v))}
        >
          ⌖
        </button>
      )}
    </span>
  );
}

function SweepCard({ s, set, remove, info, picker }: { s: StudySweep; set(s: StudySweep): void; remove(): void; info: StudyInfo; picker?: Picker }) {
  const t = s.target;
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
      title={`Barrido${'name' in t && t.name ? ` de ${t.name}` : t.kind === 'temp' ? ' de temperatura' : ''}`}
      enabled={s.enabled}
      onToggle={(enabled) => set({ ...s, enabled })}
      onRemove={remove}
      extra={<span className="hint">{runs === null ? 'valores inválidos' : `${runs} corrida${runs === 1 ? '' : 's'}`}</span>}
    >
      <Row label="Qué variar">
        <select value={t.kind} onChange={(e) => setTarget(e.target.value as SweepTarget['kind'])} aria-label="Qué variar">
          {SWEEP_KINDS.map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
      </Row>
      {t.kind === 'component' && (
        <Row label="Componente" hint={s.original ? `Valor original: ${s.original} (pasa a {${t.name}})` : undefined}>
          <PickInput value={t.name} onChange={setComponent} picker={picker} what="component" list="study-components" label="Componente" />
        </Row>
      )}
      {t.kind === 'param' && (
        <Row label="Parámetro" hint="Usalo en un valor como {nombre}">
          <input value={t.name} list="study-params" spellCheck={false} aria-label="Parámetro" onChange={(e) => set({ ...s, target: { kind: 'param', name: e.target.value.trim() } })} />
        </Row>
      )}
      {t.kind === 'source' && (
        <Row label="Fuente">
          <PickInput value={t.name} onChange={(name) => set({ ...s, target: { kind: 'source', name } })} picker={picker} what="source" list="study-sources" label="Fuente" />
        </Row>
      )}
      {t.kind === 'model' && (
        <>
          <Row label="Modelo">
            <input value={t.model} spellCheck={false} aria-label="Modelo" placeholder="2N2222" onChange={(e) => set({ ...s, target: { ...t, model: e.target.value.trim() } })} />
          </Row>
          <Row label="Parámetro del modelo">
            <input value={t.param} spellCheck={false} aria-label="Parámetro del modelo" placeholder="BF" onChange={(e) => set({ ...s, target: { ...t, param: e.target.value.trim() } })} />
          </Row>
        </>
      )}
      <Row label="Cómo">
        <select value={s.mode} onChange={(e) => set({ ...s, mode: e.target.value as StudySweep['mode'] })} aria-label="Cómo">
          <option value="list">Lista de valores</option>
          <option value="lin">Lineal (inicio, fin, paso)</option>
          <option value="dec">Por década</option>
          <option value="oct">Por octava</option>
        </select>
      </Row>
      {s.mode === 'list' ? (
        <Row label="Valores" hint="Separados por espacios: 1k 2k 5k">
          <input value={s.list} spellCheck={false} aria-label="Valores" onChange={(e) => set({ ...s, list: e.target.value })} />
        </Row>
      ) : (
        <div className="study-triple">
          <Row label="Inicio">
            <input value={s.start} aria-label="Inicio" onChange={(e) => set({ ...s, start: e.target.value.trim() })} />
          </Row>
          <Row label="Fin">
            <input value={s.stop} aria-label="Fin" onChange={(e) => set({ ...s, stop: e.target.value.trim() })} />
          </Row>
          <Row label={s.mode === 'lin' ? 'Paso' : `Puntos por ${s.mode === 'dec' ? 'década' : 'octava'}`}>
            <input value={s.step} aria-label="Paso" onChange={(e) => set({ ...s, step: e.target.value.trim() })} />
          </Row>
        </div>
      )}
    </Card>
  );
}

function ToleranceCard({ st, set, info, picker }: { st: Study; set(st: Study): void; info: StudyInfo; picker?: Picker }) {
  const t = st.tolerance!;
  const upd = (patch: Partial<typeof t>) => set({ ...st, tolerance: { ...t, ...patch } });
  const setItem = (i: number, patch: Partial<ToleranceItem>) => upd({ items: t.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });
  const addComponent = (name: string) => {
    const c = info.components.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!c || t.items.some((i) => i.component === c.name)) return;
    upd({ items: [...t.items, { component: c.name, tol: c.prefix.toUpperCase() === 'C' ? '10' : '5', dist: 'uniform', original: plain(c.value) }] });
  };
  const addAll = (prefix: string, tol: string) => {
    const add = info.components
      .filter((c) => c.prefix.toUpperCase() === prefix && isNumeric(c.value) && !t.items.some((i) => i.component === c.name))
      .map((c) => ({ component: c.name, tol, dist: 'uniform' as const, original: plain(c.value) }));
    upd({ items: [...t.items, ...add] });
  };
  const candidates = info.components.filter((c) => isNumeric(c.value) && !t.items.some((i) => i.component === c.name));
  return (
    <Card
      title="Tolerancias"
      enabled={t.enabled}
      onToggle={(enabled) => upd({ enabled })}
      onRemove={() => set({ ...st, tolerance: null })}
      extra={<span className="hint">{t.mode === 'worst' ? `${2 ** t.items.length} corridas` : `${t.runs} corridas`}</span>}
    >
      <Row label="Tipo de análisis">
        <select value={t.mode} onChange={(e) => upd({ mode: e.target.value as typeof t.mode })} aria-label="Tipo de análisis de tolerancias">
          <option value="montecarlo">Monte Carlo (valores al azar)</option>
          <option value="worst">Caso peor (todas las combinaciones ±tol)</option>
        </select>
      </Row>
      {t.mode === 'montecarlo' && (
        <Row label="Corridas">
          <input value={t.runs} aria-label="Corridas" onChange={(e) => upd({ runs: e.target.value.replace(/\D/g, '') })} />
        </Row>
      )}
      <div className="tol-quick">
        <button onClick={() => addAll('R', '5')}>Todas las resistencias 5 %</button>
        <button onClick={() => addAll('C', '10')}>Todos los capacitores 10 %</button>
        <button onClick={() => addAll('L', '10')}>Todos los inductores 10 %</button>
      </div>
      <table className="tol-table">
        <thead>
          <tr>
            <th>Componente</th>
            <th>Valor</th>
            <th>Tolerancia (%)</th>
            {t.mode === 'montecarlo' && <th>Distribución</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {t.items.map((it, i) => (
            <tr key={it.component}>
              <td>{it.component}</td>
              <td>{it.original}</td>
              <td>
                <input value={it.tol} aria-label={`Tolerancia de ${it.component}`} onChange={(e) => setItem(i, { tol: e.target.value.trim() })} />
              </td>
              {t.mode === 'montecarlo' && (
                <td>
                  <select value={it.dist} aria-label={`Distribución de ${it.component}`} onChange={(e) => setItem(i, { dist: e.target.value as ToleranceItem['dist'] })}>
                    <option value="uniform">Uniforme</option>
                    <option value="gauss">Normal (tol = 3σ)</option>
                  </select>
                </td>
              )}
              <td>
                <button className="x" aria-label={`Quitar ${it.component}`} onClick={() => upd({ items: t.items.filter((_, k) => k !== i) })}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tol-add">
        <select value="" aria-label="Agregar componente" onChange={(e) => e.target.value && addComponent(e.target.value)}>
          <option value="">Agregar componente…</option>
          {candidates.map((c) => (
            <option key={c.name} value={c.name}>{c.name} ({c.value})</option>
          ))}
        </select>
        {picker && (
          <button className="pick-btn" aria-label="Elegir componente con tolerancia en el esquemático" onClick={() => picker('component').then((v) => v && addComponent(v))}>
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
    <Card title={`Medición ${m.name}`} enabled={m.enabled} onToggle={(enabled) => set({ ...m, enabled })} onRemove={remove}>
      <div className="study-triple">
        <Row label="Nombre">
          <input value={m.name} aria-label="Nombre de la medición" onChange={(e) => set({ ...m, name: e.target.value.replace(/[^\w]/g, '') })} />
        </Row>
        <Row label="Análisis">
          <select
            value={m.analysis}
            aria-label="Análisis de la medición"
            onChange={(e) => {
              const analysis = e.target.value as MeasAnalysis;
              const ok = MEASURE_KINDS.find((k) => k.kind === m.kind)?.analysis.includes(analysis);
              set({ ...m, analysis, kind: ok ? m.kind : (MEASURE_KINDS.find((k) => k.analysis.includes(analysis))!.kind as MeasureKind) });
            }}
          >
            <option value="tran">Transitorio</option>
            <option value="ac">AC</option>
            <option value="dc">Barrido DC</option>
            <option value="noise">Ruido</option>
          </select>
        </Row>
        <Row label="Qué medir">
          <select value={m.kind} aria-label="Qué medir" onChange={(e) => set({ ...m, kind: e.target.value as MeasureKind, line: m.line ?? lines[0] })}>
            {kinds.map((k) => (
              <option key={k.kind} value={k.kind}>{k.label}</option>
            ))}
          </select>
        </Row>
      </div>
      {m.kind === 'raw' ? (
        <Row label=".meas" hint="Sintaxis de LTspice">
          <input value={m.line ?? ''} spellCheck={false} aria-label="Línea .meas" onChange={(e) => set({ ...m, line: e.target.value })} />
        </Row>
      ) : (
        <>
          {signal(m.kind === 'delay' ? 'Señal de referencia' : 'Señal', 'signal')}
          {m.kind === 'delay' && signal('Señal retardada', 'signal2')}
          {(m.kind === 'at' || m.kind === 'gainAt') && field(m.analysis === 'tran' ? 'Instante' : m.analysis === 'dc' ? 'Valor del barrido' : 'Frecuencia', 'at', unit && `en ${unit}`)}
          {(m.kind === 'rise' || m.kind === 'fall') && (
            <div className="study-triple">
              {field(m.kind === 'rise' ? 'Desde el nivel' : 'Desde el nivel (alto)', 'level', 'p.ej. 10 % del valor final')}
              {field(m.kind === 'rise' ? 'Hasta el nivel' : 'Hasta el nivel (bajo)', 'level2', 'p.ej. 90 %')}
            </div>
          )}
          {m.kind === 'delay' && (
            <div className="study-triple">
              {field('Nivel en la referencia', 'level')}
              {field('Nivel en la retardada', 'level2', 'vacío = el mismo')}
            </div>
          )}
          {(m.kind === 'period' || m.kind === 'freq') && field('Nivel de cruce', 'level', 'p.ej. el valor medio de la señal')}
          {['max', 'min', 'pp', 'avg', 'rms', 'noise'].includes(m.kind) && (
            <div className="study-triple">
              {field('Desde', 'from', 'vacío = todo')}
              {field('Hasta', 'to')}
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
      title={`Simulación ${index + 1}${meta ? `: ${meta.label}` : ''}`}
      enabled={a.enabled}
      onToggle={(enabled) => set({ ...a, enabled })}
      onRemove={remove}
      extra={
        a.enabled && (
          <span className="hint">{primary && !meta?.ngspiceOnly ? 'principal (la que corre LTspice)' : 'sólo TurboSpice'}</span>
        )
      }
    >
      <Row label="Análisis">
        <select
          value={kind ?? ''}
          aria-label="Tipo de análisis"
          onChange={(e) => set({ ...a, line: formatAnalysis(defaultAnalysis(e.target.value as AnalysisKind)) })}
        >
          {!meta && <option value="">(otro)</option>}
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
        <Row label="Directiva" hint="Opciones que el formulario no maneja: se edita como texto">
          <input value={a.line} spellCheck={false} aria-label="Directiva del análisis" onChange={(e) => set({ ...a, line: e.target.value })} />
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
    const ps = panes.map((p) => ({ traces: p.traces.filter((t) => t.expr.trim()) })).filter((p) => p.traces.length);
    if (ps.length) out[k] = ps;
  }
  return out;
}

const PLOT_KINDS: [string, string][] = [
  ['tran', 'Transitorio'],
  ['ac', 'AC (Bode)'],
  ['dc', 'Barrido DC'],
  ['noise', 'Ruido'],
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
  const setTrace = (pi: number, ti: number, t: Trace | null) =>
    setPanes(panes.map((p, k) => (k === pi ? { traces: t ? p.traces.map((x, j) => (j === ti ? t : x)) : p.traces.filter((_, j) => j !== ti) } : p)));
  const addTrace = (pi: number, expr: string) => setPanes(panes.map((p, k) => (k === pi ? { traces: [...p.traces, { expr }] } : p)));
  const label = (k: string) => PLOT_KINDS.find(([x]) => x === k)?.[1] ?? `.${k}`;
  return (
    <Card title="Gráfico" enabled onToggle={(v) => !v && remove()} onRemove={remove}>
      <Row label="Análisis">
        <select value={kind} aria-label="Análisis del gráfico" onChange={(e) => setKind(e.target.value)}>
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
            Panel {pi + 1}
            <button className="x" aria-label={`Quitar el panel ${pi + 1}`} title="Quitar el panel" onClick={() => setPanes(panes.filter((_, k) => k !== pi))}>
              ✕
            </button>
          </legend>
          {p.traces.map((t, ti) => (
            <div key={ti} className="study-trace">
              <input
                type="color"
                className="color"
                aria-label={`Color de ${t.expr || 'la señal'}`}
                value={traceColor(t, ti)}
                onChange={(e) => setTrace(pi, ti, { ...t, color: e.target.value })}
              />
              <PickInput value={t.expr} onChange={(expr) => setTrace(pi, ti, { ...t, expr })} picker={picker} what="net" list="sim-nets-v" label={`Señal ${ti + 1} del panel ${pi + 1}`} placeholder="V(out) o V(out)/V(in)" />
              <button className="x" aria-label={`Quitar ${t.expr || 'la señal'}`} title="Quitar" onClick={() => setTrace(pi, ti, null)}>
                ✕
              </button>
            </div>
          ))}
          <div className="tol-quick">
            <button onClick={() => addTrace(pi, '')}>+ Señal</button>
            {picker && (
              <button onClick={() => picker('net').then((v) => v && addTrace(pi, `V(${v})`))} title="Elegir una red en el esquemático">
                + Señal del esquemático ⌖
              </button>
            )}
          </div>
        </fieldset>
      ))}
      <div className="tol-quick">
        <button onClick={() => setPanes([...panes, { traces: [] }])}>+ Panel de {label(kind)}</button>
      </div>
      <p className="hint">
        Es la misma vista que "Recordar vista" en los resultados: se aplica en cada simulación y se guarda dentro del .asc.
        {kind === 'ac' ? ' En AC cada señal se muestra como Bode (magnitud y fase).' : ''}
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
      return a.enabled && p && validateAnalysis(p).length ? [`Revisá los datos de la simulación ${i + 1}`] : [];
    }),
    ...st.sweeps.filter((s) => s.enabled && sweepRuns(s) === null).map(() => 'Hay un barrido con valores inválidos'),
    ...st.sweeps.filter((s) => s.target.kind === 'component' && (!s.target.name || s.original === undefined)).map(() => 'Elegí el componente a barrer'),
    ...st.measures.filter((m) => m.kind !== 'raw' && !m.signal).map((m) => `Falta la señal de ${m.name}`),
  ];
  return (
    <Modal title="Estudio" onClose={onClose} wide hidden={hidden}>
      <datalist id="study-components">{info.components.map((c) => <option key={c.name} value={c.name}>{c.value}</option>)}</datalist>
      <datalist id="study-sources">{info.sources.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="study-params">{info.params.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="sim-nets">{info.nets.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="sim-sources">{info.sources.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="sim-nets-v">{info.nets.map((n) => <option key={n} value={`V(${n})`} />)}</datalist>
      <nav className="tabs study-tabs">
        <button className={tab === 'cards' ? 'active' : ''} onClick={() => setTab('cards')}>Tarjetas</button>
        <button
          className={tab === 'blocks' ? 'active' : ''}
          onClick={() => {
            // "abrir en bloques": las tarjetas se convierten en el programa equivalente
            if (!blocks || cardsTouched.current) setBlocks(studyToBlocks(st));
            cardsTouched.current = false;
            setTab('blocks');
          }}
        >
          Bloques
        </button>
        <button
          className={tab === 'code' ? 'active' : ''}
          onClick={() => {
            setCode(null);
            setTab('code');
          }}
        >
          Ver código
        </button>
        {tab !== 'blocks' && (
          <span className="hint study-runs">
            {runs} corrida{runs === 1 ? '' : 's'} en total
            {active.length > 0 && ` · cada una corre ${active.map((a) => `.${kindOf(a.line)}`).join(', ')}`}
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
              LTspice corre un solo análisis por simulación: en el .asc la primera simulación activa queda como directiva y las demás como
              comentario que LTspice ignora y sólo ejecuta TurboSpice.
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
            <Card title="Paso personalizado (.control)" enabled onToggle={(v) => !v && set({ ...st, custom: null })} onRemove={() => set({ ...st, custom: null })}>
              <Row label="Cómo se combina">
                <select
                  value={st.custom.mode}
                  aria-label="Modo del paso personalizado"
                  onChange={(e) => set({ ...st, custom: { ...st.custom!, mode: e.target.value as 'full' | 'hooks' } })}
                >
                  <option value="hooks">Con los barridos: antes / después de cada corrida y al final</option>
                  <option value="full">Bloque completo: el .control decide qué simular</option>
                </select>
              </Row>
              {st.custom.mode === 'full' ? (
                <textarea
                  className="study-control"
                  rows={8}
                  spellCheck={false}
                  aria-label="Bloque .control"
                  value={st.custom.body}
                  onChange={(e) => set({ ...st, custom: { ...st.custom!, body: e.target.value } })}
                />
              ) : (
                (['before', 'after', 'final'] as const).map((k) => (
                  <Row key={k} label={{ before: 'Antes de cada corrida', after: 'Después de cada corrida', final: 'Al final' }[k]}>
                    <textarea
                      rows={3}
                      spellCheck={false}
                      aria-label={{ before: 'Antes de cada corrida', after: 'Después de cada corrida', final: 'Al final' }[k]}
                      value={st.custom![k]}
                      placeholder={k === 'after' ? 'print v(out)' : k === 'final' ? 'echo listo' : 'set ...'}
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
                LTspice no tiene .control: se guarda como comentario que LTspice ignora, así que este paso sólo corre en TurboSpice.
                {st.custom.mode === 'full' && (st.sweeps.length || st.tolerance) ? ' En modo "bloque completo" los barridos y tolerancias se ignoran.' : ''}
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
            <button onClick={add.analysis}>+ Simulación</button>
            <button onClick={add.sweep}>+ Barrido</button>
            <button onClick={add.tolerance} disabled={!!st.tolerance}>+ Tolerancias</button>
            <button onClick={add.measure}>+ Medición</button>
            <button onClick={add.custom} disabled={!!st.custom}>+ Paso personalizado</button>
            <button onClick={add.plot} disabled={plotOpen}>+ Gráfico</button>
          </div>
          {!analyses.length && !st.sweeps.length && !st.tolerance && !st.measures.length && !st.custom && !plotOpen && (
            <p className="empty pad">
              Agregá simulaciones (.tran, .ac…), qué graficar, un barrido (variar un componente, una fuente, la temperatura…), tolerancias (Monte Carlo o caso peor) o mediciones
              (tiempo de subida, f a −3 dB…). Se guardan como .step y .meas, así que el .asc sigue simulando igual en LTspice.
            </p>
          )}
        </div>
      )}
      {tab === 'blocks' && blocks && (
        <>
          <Suspense fallback={<p className="empty pad">Cargando el editor de bloques…</p>}>
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
                  ? 'Se guarda como .step y .meas: el .asc sigue simulando igual en LTspice.'
                  : 'Usa lógica que LTspice no tiene: se guarda como bloque .control (sólo TurboSpice). Los bloques quedan guardados en el .asc.'}
            </p>
          )}
        </>
      )}
      {tab === 'code' && (
        <div className="study-code">
          <textarea spellCheck={false} rows={14} aria-label="Código del estudio" value={shownCode} onChange={(e) => setCode(e.target.value)} />
          <p className="hint">
            Las líneas que empiezan con ";" están desactivadas. Podés editar a mano: al aplicar, lo que se reconoce vuelve a ser tarjetas y el
            resto queda como directiva.
          </p>
        </div>
      )}
      {tab === 'cards' && problems.length > 0 && <p className="hint warn">{[...new Set(problems)].join(' · ')}</p>}
      <div className="buttons">
        <button onClick={onClose}>Cancelar</button>
        {tab === 'code' && code !== null ? (
          <button className="primary" onClick={() => onApplyCode(code)}>Aplicar código</button>
        ) : tab === 'blocks' ? (
          <button
            className="primary"
            disabled={!compiled || compiled.errors.length > 0}
            onClick={() =>
              compiled && onApply(withOriginals({ ...compiled.study, analyses: st.analyses, plot: cleanPlot(compiled.study.plot ?? st.plot), blocks: blocks ?? undefined }))
            }
          >
            Aplicar
          </button>
        ) : (
          <button
            className="primary"
            disabled={problems.length > 0}
            // editar las tarjetas descarta el programa de bloques (ya no coincidiría)
            onClick={() => onApply({ ...st, plot: cleanPlot(st.plot), blocks: cardsTouched.current ? undefined : st.blocks })}
          >
            Aplicar
          </button>
        )}
      </div>
    </Modal>
  );
}
