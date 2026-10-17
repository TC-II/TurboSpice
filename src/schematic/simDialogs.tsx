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

/** Valor numérico SPICE (1k, 10meg…) o expresión entre llaves */
const validNumber = (s: string) => /^\{.+\}$/.test(s.trim()) || Number.isFinite(parseSpiceNumber(s));

function Field({ label, value, onChange, placeholder, hint, required, number, list }: {
  label: string;
  value: string;
  onChange(v: string): void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  number?: boolean;
  list?: string;
}) {
  const bad = (required && !value.trim()) || (number && value.trim() !== '' && !validNumber(value));
  return (
    <label className={`field${bad ? ' bad' : ''}`}>
      <span>{label}</span>
      <input value={value} placeholder={placeholder} spellCheck={false} list={list} onChange={(e) => onChange(e.target.value.trim())} />
      {hint && <small>{hint}</small>}
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
        label="Tipo de barrido"
        value={sweep.type}
        options={[
          ['dec', 'Por década'],
          ['oct', 'Por octava'],
          ['lin', 'Lineal'],
        ]}
        onChange={(type) => onChange({ ...sweep, type })}
      />
      <Field
        label={sweep.type === 'lin' ? 'Cantidad de puntos' : `Puntos por ${sweep.type === 'dec' ? 'década' : 'octava'}`}
        value={sweep.points}
        number
        required
        onChange={(points) => onChange({ ...sweep, points })}
      />
      <Field label={`Frecuencia inicial [${unit}]`} value={sweep.start} number required onChange={(start) => onChange({ ...sweep, start })} />
      <Field label={`Frecuencia final [${unit}]`} value={sweep.stop} number required onChange={(stop) => onChange({ ...sweep, stop })} />
    </>
  );
}

export interface CircuitInfo {
  /** nombres de red (para elegir salidas/entradas) */
  nets: string[];
  /** fuentes independientes V/I (InstName) */
  sources: string[];
}

function AnalysisForm({ a, set }: { a: Analysis; set(a: Analysis): void }): ReactNode {
  const node = (label: string, value: string, onChange: (v: string) => void, hint?: string, required = true) => (
    <Field label={label} value={value} onChange={onChange} list="sim-nets" required={required} hint={hint} />
  );
  const source = (label: string, value: string, onChange: (v: string) => void) => (
    <Field label={label} value={value} onChange={onChange} list="sim-sources" required />
  );
  switch (a.kind) {
    case 'tran':
      return (
        <>
          <Field label="Tiempo final" value={a.tstop} number required placeholder="10m" onChange={(tstop) => set({ ...a, tstop })} />
          <Field label="Guardar desde" value={a.tstart} number placeholder="0" hint="Descarta lo anterior (p.ej. el transitorio inicial)" onChange={(tstart) => set({ ...a, tstart })} />
          <Field label="Paso máximo" value={a.tmax} number placeholder="automático" hint="Limitarlo mejora la resolución de señales rápidas" onChange={(tmax) => set({ ...a, tmax })} />
          <Field label="Paso de salida" value={a.tstep} number placeholder="automático" onChange={(tstep) => set({ ...a, tstep })} />
          <label className="check">
            <input type="checkbox" checked={a.uic} onChange={(e) => set({ ...a, uic: e.target.checked })} /> Usar condiciones iniciales
            (UIC: no calcula el punto de operación; arranca de las IC=)
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
                <legend>{i === 0 ? 'Fuente a barrer' : 'Segunda fuente (opcional, genera una familia de curvas)'}</legend>
                <Field label="Fuente" value={s.src} list="sim-sources" required={i === 0} onChange={(src) => upd({ src })} />
                <Field label="Inicio" value={s.start} number required={!!s.src} onChange={(start) => upd({ start })} />
                <Field label="Fin" value={s.stop} number required={!!s.src} onChange={(stop) => upd({ stop })} />
                <Field label="Incremento" value={s.step} number required={!!s.src} onChange={(step) => upd({ step })} />
              </fieldset>
            );
          })}
        </>
      );
    case 'noise':
      return (
        <>
          {node('Nodo de salida', a.out, (out) => set({ ...a, out }))}
          {node('Referencia', a.ref, (ref) => set({ ...a, ref }), 'Vacío = tierra', false)}
          {source('Fuente de entrada', a.src, (src) => set({ ...a, src }))}
          <SweepFields sweep={a.sweep} onChange={(sweep) => set({ ...a, sweep })} />
        </>
      );
    case 'op':
      return <p className="hint">No tiene parámetros.</p>;
    case 'tf':
      return (
        <>
          {node('Salida', a.out, (out) => set({ ...a, out }), 'Nodo, o I(Vx) para una corriente')}
          {source('Fuente de entrada', a.src, (src) => set({ ...a, src }))}
        </>
      );
    case 'sens':
      return (
        <>
          {node('Salida', a.out, (out) => set({ ...a, out }))}
          <label className="check">
            <input type="checkbox" checked={a.ac} onChange={(e) => set({ ...a, ac: e.target.checked })} /> Sensibilidad en AC (en frecuencia)
          </label>
          {a.ac && <SweepFields sweep={a.sweep} onChange={(sweep) => set({ ...a, sweep })} />}
        </>
      );
    case 'pz':
      return (
        <>
          {node('Entrada +', a.inP, (inP) => set({ ...a, inP }))}
          {node('Entrada −', a.inN, (inN) => set({ ...a, inN }))}
          {node('Salida +', a.outP, (outP) => set({ ...a, outP }))}
          {node('Salida −', a.outN, (outN) => set({ ...a, outN }))}
          <Select
            label="Transferencia"
            value={a.type}
            options={[
              ['vol', 'Tensión de salida / tensión de entrada'],
              ['cur', 'Tensión de salida / corriente de entrada'],
            ]}
            onChange={(type) => set({ ...a, type })}
          />
          <Select
            label="Calcular"
            value={a.which}
            options={[
              ['pz', 'Polos y ceros'],
              ['pol', 'Sólo polos'],
              ['zer', 'Sólo ceros'],
            ]}
            onChange={(which) => set({ ...a, which })}
          />
        </>
      );
    case 'disto':
      return (
        <>
          <SweepFields sweep={a.sweep} onChange={(sweep) => set({ ...a, sweep })} />
          <Field label="f2/f1 (intermodulación)" value={a.f2overf1} number placeholder="sólo armónicos" hint="Entre 0 y 1; vacío = distorsión armónica" onChange={(f2overf1) => set({ ...a, f2overf1 })} />
        </>
      );
    case 'sp':
      return (
        <>
          <SweepFields sweep={a.sweep} onChange={(sweep) => set({ ...a, sweep })} />
          <label className="check">
            <input type="checkbox" checked={a.noise} onChange={(e) => set({ ...a, noise: e.target.checked })} /> Calcular también parámetros de ruido
          </label>
        </>
      );
  }
}

/** Comando de análisis: elegir tipo y completar parámetros */
export function SimulationDialog({ initial, info, onApply, onClose }: {
  initial: string | null;
  info: CircuitInfo;
  onApply(line: string, ngspiceOnly: boolean): void;
  onClose(): void;
}) {
  const parsed = initial ? parseAnalysis(initial) : null;
  const [byKind, setByKind] = useState<Partial<Record<AnalysisKind, Analysis>>>(parsed ? { [parsed.kind]: parsed } : {});
  const [kind, setKind] = useState<AnalysisKind>(parsed?.kind ?? 'tran');
  const a = byKind[kind] ?? defaultAnalysis(kind);
  const set = (x: Analysis) => setByKind({ ...byKind, [x.kind]: x });
  const meta = ANALYSES.find((x) => x.kind === kind)!;
  const line = formatAnalysis(a);
  const errors = validateAnalysis(a);

  return (
    <Modal title="Comando de simulación" onClose={onClose} wide>
      <datalist id="sim-nets">{info.nets.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="sim-sources">{info.sources.map((n) => <option key={n} value={n} />)}</datalist>
      {initial && !parsed && (
        <p className="hint warn">
          La directiva actual (<code>{initial}</code>) usa opciones que este formulario no maneja; al aceptar se reemplaza.
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
          <AnalysisForm a={a} set={set} />
        </div>
      </div>
      <div className="sim-preview">
        <code>{line}</code>
        {meta.ngspiceOnly && <span className="hint">LTspice no tiene este análisis: se guarda como comentario que LTspice ignora y TurboSpice ejecuta.</span>}
        {errors.length > 0 && <span className="hint warn">{errors.join(' · ')}</span>}
      </div>
      <div className="buttons">
        <button type="button" onClick={onClose}>Cancelar</button>
        <button type="button" className="primary" disabled={errors.length > 0} onClick={() => onApply(line, meta.ngspiceOnly)}>
          Aceptar
        </button>
      </div>
    </Modal>
  );
}

/** Editor del bloque .control de ngspice */
export function ControlDialog({ initial, onApply, onRemove, onClose }: {
  initial: string;
  onApply(body: string): void;
  onRemove?(): void;
  onClose(): void;
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
  const hasRun = useMemo(() => /^\s*(run|tran|ac|dc|op|noise|tf|pz|sens|disto|sp)\b/im.test(body), [body]);
  return (
    <Modal title="Bloque .control (scripts de ngspice)" onClose={onClose} wide>
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
            <p className="hint warn">El bloque no ejecuta ningún análisis: agregá "run" para correr los del esquemático.</p>
          )}
          <p className="hint">
            Con un bloque .control, los análisis se corren sólo cuando el bloque lo indica. "plot" no abre ventanas: los
            vectores que crees con "let" aparecen en Resultados, y lo que imprimas con "print"/"echo"/"meas" en el Log.
            LTspice no tiene .control: se guarda como comentario que LTspice ignora.
          </p>
        </div>
        <div className="snippets">
          <h3>Insertar</h3>
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
          <button type="button" className="danger" onClick={onRemove}>Quitar bloque</button>
        )}
        <span className="spacer" />
        <button type="button" onClick={onClose}>Cancelar</button>
        <button type="button" className="primary" onClick={() => onApply(body)}>Aceptar</button>
      </div>
    </Modal>
  );
}
