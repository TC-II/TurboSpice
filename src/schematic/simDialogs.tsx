// Diálogos de simulación: comando de análisis (estilo "Edit Simulation Command" de LTspice)
// y editor del bloque .control de ngspice.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { parseSpiceNumber } from '../netlist/spicenum.ts';
import {
  ANALYSES,
  defaultAnalysis,
  formatAnalysis,
  parseAnalysis,
  validateAnalysis,
  type Analysis,
  type AnalysisKind,
  type Sweep,
} from '../sim/analyses.ts';
import { CONTROL_SNIPPETS } from '../sim/controlSnippets.ts';
import { Modal } from './dialogs.tsx';
import { StbModelsInfo } from './StbModelsInfo.tsx';
import { t } from '../i18n/i18n.ts';

/** Valor numérico SPICE (1k, 10meg…) o expresión entre llaves */
const validNumber = (s: string) => /^\{.+\}$/.test(s.trim()) || Number.isFinite(parseSpiceNumber(s));

/** Qué se elige en el esquemático: una red, una fuente V/I o cualquier componente */
export type PickWhat = 'net' | 'source' | 'component' | 'probe';

/** Elegir una red, fuente o componente haciendo click en el esquemático (null si se cancela) */
/** `ground`: la tierra (0) también vale (un nodo de referencia); si no, se ignora */
export type Picker = (what: PickWhat, opts?: { ground?: boolean }) => Promise<string | null>;

const AUTO_NET = /^(N\d{3,}|NC_\d+)$/;

/** Campo con lista de valores y botón ⌖ para elegirlo en el esquemático (también en el visor, #236) */
export function Field({ label, value, onChange, placeholder, hint, required, number, list, pick }: {
  label: string;
  value: string;
  onChange(v: string): void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  number?: boolean;
  list?: string;
  /** botón para elegir el valor en el esquemático */
  pick?: { what: PickWhat; picker: Picker; ground?: boolean };
}) {
  const bad = (required && !value.trim()) || (number && value.trim() !== '' && !validNumber(value));
  const input = <input value={value} placeholder={placeholder} spellCheck={false} list={list} onChange={(e) => onChange(e.target.value.trim())} />;
  const auto = pick?.what === 'net' && AUTO_NET.test(value);
  return (
    <label className={`field${bad ? ' bad' : ''}`}>
      <span>{label}</span>
      {pick ? (
        <span className="with-pick">
          {input}
          <button
            type="button"
            className="pick-btn"
            title={pick.what === 'net' ? t('Pick the net on the schematic') : t('Pick the source on the schematic')}
            aria-label={t('Pick {label} on the schematic', { label })}
            onClick={(e) => {
              e.preventDefault();
              pick.picker(pick.what, { ground: pick.ground }).then((v) => v && onChange(v));
            }}
          >
            ⌖
          </button>
        </span>
      ) : (
        input
      )}
      {auto ? (
        <small>{t('Automatic name: it may change when you edit the circuit. Better give the net a label (N).')}</small>
      ) : (
        hint && <small>{hint}</small>
      )}
    </label>
  );
}

function Select<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: [T, string][];
  onChange(v: T): void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

function SweepFields({ sweep, onChange, unit = 'Hz' }: { sweep: Sweep; onChange(s: Sweep): void; unit?: string }) {
  return (
    <>
      <Select
        label={t('Sweep type')}
        value={sweep.type}
        options={[
          ['dec', t('Per decade')],
          ['oct', t('Per octave')],
          ['lin', t('Linear')],
        ]}
        onChange={(type) => onChange({ ...sweep, type })}
      />
      <Field
        label={sweep.type === 'lin' ? t('Number of points') : t('Points per {p0}', { p0: sweep.type === 'dec' ? t('decade') : t('octave') })}
        value={sweep.points}
        number
        required
        onChange={(points) => onChange({ ...sweep, points })}
      />
      <Field label={t('Start frequency [{unit}]', { unit })} value={sweep.start} number required onChange={(start) => onChange({ ...sweep, start })} />
      <Field label={t('Stop frequency [{unit}]', { unit })} value={sweep.stop} number required onChange={(stop) => onChange({ ...sweep, stop })} />
    </>
  );
}

export interface CircuitInfo {
  /** nombres de red (para elegir salidas/entradas) */
  nets: string[];
  /** fuentes independientes V/I (InstName) */
  sources: string[];
  /** sondas de lazo del .stb (diff: la diferencial, con modo DM/CM) */
  probes?: { name: string; diff: boolean }[];
}

export function AnalysisForm({ a, set, picker, info }: { a: Analysis; set(a: Analysis): void; picker?: Picker; info?: CircuitInfo }): ReactNode {
  // ground: un nodo de referencia, donde se puede elegir la tierra
  const node = (label: string, value: string, onChange: (v: string) => void, hint?: string, required = true, ground = false) => (
    <Field label={label} value={value} onChange={onChange} list="sim-nets" required={required} hint={hint} pick={picker && { what: 'net', picker, ground }} />
  );
  const source = (label: string, value: string, onChange: (v: string) => void) => (
    <Field label={label} value={value} onChange={onChange} list="sim-sources" required pick={picker && { what: 'source', picker }} />
  );
  switch (a.kind) {
    case 'tran':
      return (
        <>
          <Field label={t('Stop time')} value={a.tstop} number required placeholder="10m" onChange={(tstop) => set({ ...a, tstop })} />
          <Field label={t('Save from')} value={a.tstart} number placeholder="0" hint={t('Discards what comes before (e.g. the initial transient)')} onChange={(tstart) => set({ ...a, tstart })} />
          <Field label={t('Maximum step')} value={a.tmax} number placeholder={t('automatic')} hint={t('Limiting it improves the resolution of fast signals')} onChange={(tmax) => set({ ...a, tmax })} />
          <Field label={t('Output step')} value={a.tstep} number placeholder={t('automatic')} onChange={(tstep) => set({ ...a, tstep })} />
          <label className="check">
            <input type="checkbox" checked={a.uic} onChange={(e) => set({ ...a, uic: e.target.checked })} /> {t('Use initial conditions (UIC: doesn\'t compute the operating point; starts from the IC=)')}
          </label>
          <label className="check">
            <input type="checkbox" checked={a.startup} onChange={(e) => set({ ...a, startup: e.target.checked })} /> {t('Start the sources from 0 (startup: DC sources rise in a 20 µs ramp)')}
          </label>
        </>
      );
    case 'ac':
      return <SweepFields sweep={a.sweep} onChange={(sweep) => set({ ...a, sweep })} />;
    case 'dc':
      return (
        <>
          {[0, 1].map((i) => {
            const s = a.sweeps[i] ?? { src: '', start: '', stop: '', step: '' };
            const upd = (patch: Partial<typeof s>) => {
              const sweeps = [...a.sweeps];
              sweeps[i] = { ...s, ...patch };
              set({ ...a, sweeps });
            };
            return (
              <fieldset key={i}>
                <legend>{i === 0 ? t('Source to sweep') : t('Second source (optional, makes a family of curves)')}</legend>
                <Field label={t('Source')} value={s.src} list="sim-sources" required={i === 0} onChange={(src) => upd({ src })} pick={picker && { what: 'source', picker }} />
                <Field label={t('Start')} value={s.start} number required={!!s.src} onChange={(start) => upd({ start })} />
                <Field label={t('Stop')} value={s.stop} number required={!!s.src} onChange={(stop) => upd({ stop })} />
                <Field label={t('Increment')} value={s.step} number required={!!s.src} onChange={(step) => upd({ step })} />
              </fieldset>
            );
          })}
        </>
      );
    case 'noise':
      return (
        <>
          {node(t('Output node'), a.out, (out) => set({ ...a, out }))}
          {node(t('Reference'), a.ref, (ref) => set({ ...a, ref }), t('Empty = ground'), false, true)}
          {source(t('Input source'), a.src, (src) => set({ ...a, src }))}
          <SweepFields sweep={a.sweep} onChange={(sweep) => set({ ...a, sweep })} />
        </>
      );
    case 'op':
      return <p className="hint">{t('It has no parameters.')}</p>;
    case 'tf':
      return (
        <>
          {node(t('Output'), a.out, (out) => set({ ...a, out }), t('Node, or I(Vx) for a current'))}
          {source(t('Input source'), a.src, (src) => set({ ...a, src }))}
        </>
      );
    case 'sens':
      return (
        <>
          {node(t('Output'), a.out, (out) => set({ ...a, out }))}
          <label className="check">
            <input type="checkbox" checked={a.ac} onChange={(e) => set({ ...a, ac: e.target.checked })} /> {t('AC sensitivity (vs frequency)')}
          </label>
          {a.ac && <SweepFields sweep={a.sweep} onChange={(sweep) => set({ ...a, sweep })} />}
        </>
      );
    case 'pz':
      return (
        <>
          {node(t('Input +'), a.inP, (inP) => set({ ...a, inP }))}
          {node(t('Input −'), a.inN, (inN) => set({ ...a, inN }), undefined, true, true)}
          {node(t('Output +'), a.outP, (outP) => set({ ...a, outP }))}
          {node(t('Output −'), a.outN, (outN) => set({ ...a, outN }), undefined, true, true)}
          <Select
            label={t('Transfer')}
            value={a.type}
            options={[
              ['vol', t('Output voltage / input voltage')],
              ['cur', t('Output voltage / input current')],
            ]}
            onChange={(type) => set({ ...a, type })}
          />
          <Select
            label={t('Compute')}
            value={a.which}
            options={[
              ['pz', t('Poles and zeros')],
              ['pol', t('Poles only')],
              ['zer', t('Zeros only')],
            ]}
            onChange={(which) => set({ ...a, which })}
          />
        </>
      );
    case 'disto':
      return (
        <>
          <SweepFields sweep={a.sweep} onChange={(sweep) => set({ ...a, sweep })} />
          <Field label={t('f2/f1 (intermodulation)')} value={a.f2overf1} number placeholder={t('harmonics only')} hint={t('Between 0 and 1; empty = harmonic distortion')} onChange={(f2overf1) => set({ ...a, f2overf1 })} />
        </>
      );
    case 'sp':
      return (
        <>
          <SweepFields sweep={a.sweep} onChange={(sweep) => set({ ...a, sweep })} />
          <label className="check">
            <input type="checkbox" checked={a.noise} onChange={(e) => set({ ...a, noise: e.target.checked })} /> {t('Also compute noise parameters')}
          </label>
        </>
      );
    case 'stb': {
      const probes = info?.probes ?? [];
      const diff = probes.find((p) => p.name.toLowerCase() === a.probe.toLowerCase())?.diff ?? !!a.mode;
      return (
        <>
          <Field
            label={t('Loop probe')}
            value={a.probe}
            list="sim-probes"
            required
            pick={picker && { what: 'probe', picker }}
            hint={probes.length ? undefined : t('Place a LoopProbe or DiffLoopProbe (Stability library) in series in the loop')}
            onChange={(probe) => {
              const d = probes.find((p) => p.name.toLowerCase() === probe.toLowerCase())?.diff;
              set({ ...a, probe, mode: d === undefined ? a.mode : d ? a.mode || 'dm' : '' });
            }}
          />
          {diff && (
            <Select
              label={t('Mode')}
              value={a.mode || 'dm'}
              options={[
                ['dm', t('Differential (DM)')],
                ['cm', t('Common mode (CM)')],
              ]}
              onChange={(mode) => set({ ...a, mode })}
            />
          )}
          <div className="stbm-row">
            <Select
              label={t('Method')}
              value={a.method}
              options={[
                ['tian', t('Tian, A-β model: T = −Aβ (as Spectre stb; probe orientation does not matter)')],
                ['gft', t('Middlebrook\'s GFT, asymptotic model: R, G∞, G0 (signal must enter the probe by its arrow)')],
              ]}
              onChange={(method) => set({ ...a, method })}
            />
            <StbModelsInfo />
          </div>
          {(
            <fieldset>
              <legend>{a.method === 'gft' ? t('Closed-loop transfer (optional): G, G∞, G0 and R, and the equivalent A and β') : t('Closed-loop transfer (optional): G, A and β')}</legend>
              <Field label={t('Input source')} value={a.input} onChange={(input) => set({ ...a, input })} list="sim-sources" pick={picker && { what: 'source', picker }} />
              {node(t('Output'), a.output, (output) => set({ ...a, output }), undefined, false)}
            </fieldset>
          )}
          <SweepFields sweep={a.sweep} onChange={(sweep) => set({ ...a, sweep })} />
        </>
      );
    }
  }
}

/** Comando de análisis: elegir tipo y completar parámetros */
export function SimulationDialog({ initial, analysis, info, onApply, onClose, picker, hidden }: {
  initial: string | null;
  /** Tipo de análisis con que abre (el elegido en la flecha de Simular); si no, el de `initial` */
  analysis?: AnalysisKind;
  info: CircuitInfo;
  onApply(line: string, ngspiceOnly: boolean): void;
  onClose(): void;
  picker?: Picker;
  hidden?: boolean;
}) {
  const parsed = initial ? parseAnalysis(initial) : null;
  const [byKind, setByKind] = useState<Partial<Record<AnalysisKind, Analysis>>>(parsed ? { [parsed.kind]: parsed } : {});
  const [kind, setKind] = useState<AnalysisKind>(analysis ?? parsed?.kind ?? 'tran');
  const a = byKind[kind] ?? defaultAnalysis(kind);
  const set = (x: Analysis) => setByKind({ ...byKind, [x.kind]: x });
  const meta = ANALYSES.find((x) => x.kind === kind)!;
  const line = formatAnalysis(a);
  const errors = validateAnalysis(a);

  return (
    <Modal title={t('Simulation command')} onClose={onClose} wide hidden={hidden}>
      <datalist id="sim-nets">{info.nets.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="sim-sources">{info.sources.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="sim-probes">{(info.probes ?? []).map((p) => <option key={p.name} value={p.name} />)}</datalist>
      {initial && !parsed && (
        <p className="hint warn">
          {t('The current directive (')}<code>{initial}</code>{t(') uses options this form doesn\'t handle; accepting replaces it.')}
        </p>
      )}
      <div className="simdlg">
        <nav className="analysis-list">
          {ANALYSES.map((x) => (
            <button key={x.kind} className={x.kind === kind ? 'active' : ''} onClick={() => setKind(x.kind)}>
              {x.label}
              {x.ngspiceOnly && <span className="badge">ngspice</span>}
            </button>
          ))}
        </nav>
        <div className="analysis-form">
          <p className="hint">{meta.help}</p>
          <AnalysisForm a={a} set={set} picker={picker} info={info} />
        </div>
      </div>
      <div className="sim-preview">
        <code>{line}</code>
        {meta.ngspiceOnly && <span className="hint">{t('LTspice doesn\'t have this analysis: it\'s saved as a comment that LTspice ignores and TurboSpice runs.')}</span>}
        {errors.length > 0 && <span className="hint warn">{errors.join(' · ')}</span>}
      </div>
      <div className="buttons">
        <button type="button" onClick={onClose}>{t('Cancel')}</button>
        <button type="button" className="primary" disabled={errors.length > 0} onClick={() => onApply(line, meta.ngspiceOnly)}>
          {t('OK')}
        </button>
      </div>
    </Modal>
  );
}

/** Editor del bloque .control de ngspice */
export function ControlDialog({ initial, onApply, onRemove, onClose, picker, hidden }: {
  initial: string;
  onApply(body: string): void;
  onRemove?(): void;
  onClose(): void;
  picker?: Picker;
  hidden?: boolean;
}) {
  const [body, setBody] = useState(initial);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ta.current?.focus(), []);
  const insert = (code: string) => {
    const el = ta.current;
    const at = el ? el.selectionStart : body.length;
    const before = body.slice(0, at);
    const sep = before && !before.endsWith('\n') ? '\n' : '';
    setBody(`${before}${sep}${code}\n${body.slice(at)}`);
  };
  /** inserta en el cursor, sin saltos de línea (p.ej. "v(out)") */
  const insertInline = (code: string) => {
    const el = ta.current;
    const at = el ? el.selectionStart : body.length;
    setBody(`${body.slice(0, at)}${code}${body.slice(el ? el.selectionEnd : at)}`);
    setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(at + code.length, at + code.length);
    });
  };
  const hasRun = useMemo(() => /^\s*(run|tran|ac|dc|op|noise|tf|pz|sens|disto|sp)\b/im.test(body), [body]);
  return (
    <Modal title={t('.control block (ngspice scripts)')} onClose={onClose} wide hidden={hidden}>
      <div className="controldlg">
        <div className="control-editor">
          <div className="control-frame">.control</div>
          <textarea
            ref={ta}
            rows={14}
            spellCheck={false}
            value={body}
            placeholder={'run\nprint mean(v(out))'}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onApply(body);
              if (e.key === 'Tab') {
                e.preventDefault();
                insert('  ');
              }
            }}
          />
          <div className="control-frame">.endc</div>
          {!hasRun && body.trim() && (
            <p className="hint warn">{t('The block doesn\'t run any analysis: add "run" to run the schematic\'s.')}</p>
          )}
          <p className="hint">
            {t('With a .control block, analyses run only when the block says so. "plot" doesn\'t open windows: vectors you create with "let" show up in Results, and what you print with "print"/"echo"/"meas" in the Log. LTspice has no .control: it\'s saved as a comment that LTspice ignores.')}
          </p>
        </div>
        <div className="snippets">
          <h3>{t('Insert')}</h3>
          {picker && (
            <div className="pick-row">
              <button type="button" title={t('Pick a net on the schematic and insert v(net) at the cursor')} onClick={() => picker('net').then((v) => v && insertInline(`v(${v.toLowerCase()})`))}>
                <strong>{t('⌖ v(net)')}</strong>
                <small>{t('Voltage of a net picked on the schematic')}</small>
              </button>
              <button type="button" title={t('Pick a source on the schematic and insert i(source) at the cursor')} onClick={() => picker('source').then((v) => v && insertInline(`i(${v.toLowerCase()})`))}>
                <strong>{t('⌖ i(source)')}</strong>
                <small>{t('Current of a source picked on the schematic')}</small>
              </button>
            </div>
          )}
          {CONTROL_SNIPPETS.map((s) => (
            <button key={s.label} title={`${s.help}\n\n${s.code}`} onClick={() => insert(s.code)}>
              <strong>{s.label}</strong>
              <small>{s.help}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="buttons">
        {onRemove && (
          <button type="button" className="danger" onClick={onRemove}>{t('Remove block')}</button>
        )}
        <span className="spacer" />
        <button type="button" onClick={onClose}>{t('Cancel')}</button>
        <button type="button" className="primary" onClick={() => onApply(body)}>{t('OK')}</button>
      </div>
    </Modal>
  );
}
