// Panel "Estudio": barridos, tolerancias, mediciones y pasos personalizados como tarjetas,
// sin escribir SPICE. Genera directivas que LTspice también entiende (ver src/sim/study.ts).
import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { parseStep } from '../netlist/step.ts';
import type { MeasAnalysis } from '../sim/meas.ts';
import { CONTROL_SNIPPETS } from '../sim/controlSnippets.ts';
import {
  customBody,
  MEASURE_KINDS,
  measureLines,
  stepLine,
  studyLines,
  type MeasureKind,
  type Study,
  type StudyMeasure,
  type StudySweep,
  type SweepTarget,
  type ToleranceItem,
} from '../sim/study.ts';
import { Modal } from './dialogs.tsx';
import type { Picker } from './simDialogs.tsx';

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

export function StudyPanel({ initial, info, picker, hidden, onApply, onApplyCode, onClose }: {
  initial: Study;
  info: StudyInfo;
  picker?: Picker;
  hidden?: boolean;
  onApply(st: Study): void;
  onApplyCode(code: string): void;
  onClose(): void;
}) {
  const [st, set] = useState<Study>(initial);
  const [tab, setTab] = useState<'cards' | 'blocks' | 'code'>('cards');
  const [code, setCode] = useState<string | null>(null);
  const runs = totalRuns(st);
  const shownCode = useMemo(() => code ?? studyCode(st), [code, st]);
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
  };
  const problems = [
    ...st.sweeps.filter((s) => s.enabled && sweepRuns(s) === null).map(() => 'Hay un barrido con valores inválidos'),
    ...st.sweeps.filter((s) => s.target.kind === 'component' && (!s.target.name || s.original === undefined)).map(() => 'Elegí el componente a barrer'),
    ...st.measures.filter((m) => m.kind !== 'raw' && !m.signal).map((m) => `Falta la señal de ${m.name}`),
  ];
  return (
    <Modal title="Estudio" onClose={onClose} wide hidden={hidden}>
      <datalist id="study-components">{info.components.map((c) => <option key={c.name} value={c.name}>{c.value}</option>)}</datalist>
      <datalist id="study-sources">{info.sources.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="study-params">{info.params.map((n) => <option key={n} value={n} />)}</datalist>
      <nav className="tabs study-tabs">
        <button className={tab === 'cards' ? 'active' : ''} onClick={() => setTab('cards')}>Tarjetas</button>
        <button className={tab === 'blocks' ? 'active' : ''} onClick={() => setTab('blocks')}>Bloques</button>
        <button
          className={tab === 'code' ? 'active' : ''}
          onClick={() => {
            setCode(null);
            setTab('code');
          }}
        >
          Ver código
        </button>
        <span className="hint study-runs">{runs} corrida{runs === 1 ? '' : 's'} en total</span>
      </nav>
      {tab === 'cards' && (
        <div className="study-cards">
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
          <div className="study-add">
            <button onClick={add.sweep}>+ Barrido</button>
            <button onClick={add.tolerance} disabled={!!st.tolerance}>+ Tolerancias</button>
            <button onClick={add.measure}>+ Medición</button>
            <button onClick={add.custom} disabled={!!st.custom}>+ Paso personalizado</button>
          </div>
          {!st.sweeps.length && !st.tolerance && !st.measures.length && !st.custom && (
            <p className="empty pad">
              Agregá un barrido (variar un componente, una fuente, la temperatura…), tolerancias (Monte Carlo o caso peor) o mediciones
              (tiempo de subida, f a −3 dB…). Se guardan como .step y .meas, así que el .asc sigue simulando igual en LTspice.
            </p>
          )}
        </div>
      )}
      {tab === 'blocks' && (
        <Suspense fallback={<p className="empty pad">Cargando el editor de bloques…</p>}>
          <StudyBlocks study={st} info={info} onChange={set} />
        </Suspense>
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
      {problems.length > 0 && <p className="hint warn">{[...new Set(problems)].join(' · ')}</p>}
      <div className="buttons">
        <button onClick={onClose}>Cancelar</button>
        {tab === 'code' && code !== null ? (
          <button className="primary" onClick={() => onApplyCode(code)}>Aplicar código</button>
        ) : (
          <button className="primary" disabled={problems.length > 0} onClick={() => onApply(st)}>Aplicar</button>
        )}
      </div>
    </Modal>
  );
}
