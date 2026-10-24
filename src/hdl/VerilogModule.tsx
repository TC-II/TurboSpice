import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../i18n/i18n.ts';
import { ELECTRICAL, ELECTRICAL_NAMES, FAMILIES } from './electrical.ts';
import type { SynthResult } from './yosys.ts';

/**
 * Vista de un módulo Verilog del proyecto (#209), en lugar del esquemático de un subcircuito:
 * el código, «Sintetizar» (Yosys) con sus errores y avisos, y la interfaz eléctrica y los
 * parameter por omisión de las instancias (los del símbolo; cada instancia los puede cambiar).
 */
export function VerilogModule({ name, text, stale, mode, suggestBehavioral, onMode, pins, params, onText, onSynthesize, onParams }: {
  name: string;
  text: string;
  /** el código cambió desde la última síntesis (o nunca se sintetizó) */
  stale: boolean;
  /** cómo se simula: síntesis (Yosys, compuertas de XSPICE) o comportamiento (Icarus, d_cosim) */
  mode: 'synth' | 'behavioral';
  /** el código usa retardos #, $display…: conviene el modo comportamiento */
  suggestBehavioral: boolean;
  onMode(mode: 'synth' | 'behavioral'): void;
  /** pines de la última síntesis */
  pins: { name: string; dir: 'in' | 'out' | 'inout' }[];
  /** parámetros del símbolo (SpiceLine): los eléctricos y los parameter de Verilog */
  params: [string, string][];
  onText(text: string): void;
  onSynthesize(text: string): Promise<SynthResult>;
  onParams(ps: [string, string][]): void;
}) {
  const [code, setCode] = useState(text);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SynthResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  // otro módulo, o el código cambió desde afuera (deshacer, renombrar): se toma el del proyecto
  const lastSent = useRef(text);
  useEffect(() => {
    if (text !== lastSent.current) setCode(text), (lastSent.current = text);
  }, [text]);
  useEffect(() => {
    setResult(null);
    setFailure(null);
  }, [name]);
  // el código va al proyecto un momento después de dejar de escribir (y al sintetizar)
  useEffect(() => {
    if (code === lastSent.current) return;
    const id = setTimeout(() => ((lastSent.current = code), onText(code)), 400);
    return () => clearTimeout(id);
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const synthesize = async () => {
    if (busy) return;
    if (code !== lastSent.current) (lastSent.current = code), onText(code);
    setBusy(true);
    setFailure(null);
    try {
      setResult(await onSynthesize(code));
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // línea del error ("cnt.v:7: ERROR: …") para marcarla
  const errLine = useMemo(() => {
    const m = result?.error && /:(\d+)(?:\.\d+(?:-\d+\.\d+)?)?:?\s/.exec(result.error);
    return m ? Number(m[1]) : undefined;
  }, [result]);
  const lines = code.split('\n').length;

  const values = new Map(params.map(([k, v]) => [k.toLowerCase(), v]));
  const vparams = params.filter(([k]) => !ELECTRICAL_NAMES.has(k.toLowerCase()));
  const setParam = (k: string, v: string) => onParams(params.map(([pk, pv]) => [pk, pk.toLowerCase() === k.toLowerCase() ? v : pv]));
  const family = FAMILIES.find((f) => ELECTRICAL.every((p) => (values.get(p.name) ?? p.value) === (f.values[p.name] ?? p.value)));

  const beh = mode === 'behavioral';
  const status = busy
    ? { cls: 'busy', text: beh ? t('Compiling…') : t('Synthesizing…') }
    : result?.error
      ? { cls: 'err', text: beh ? t('Compilation failed') : t('Synthesis failed') }
      : stale
        ? { cls: 'stale', text: t('Changes not synthesized yet (it is synthesized before simulating)') }
        : { cls: 'ok', text: beh ? t('Compiled (Icarus)') : t('Synthesized') };

  return (
    <div className="verilog-module">
      <div className="vm-bar">
        <strong>{name}.v</strong>
        <span className={`vm-status ${status.cls}`}>{status.text}</span>
        <select
          className="vm-mode"
          value={mode}
          aria-label={t('How it is simulated')}
          title={t('Synthesis: gates and flip-flops (synthesizable Verilog). Behavioral: Icarus Verilog runs the code as is (# delays, initial, $display…); one behavioral block per simulation.')}
          onChange={(e) => {
            onMode(e.target.value as 'synth' | 'behavioral');
            setResult(null);
          }}
        >
          <option value="synth">{t('Synthesis (Yosys)')}</option>
          <option value="behavioral">{t('Behavioral (Icarus)')}</option>
        </select>
        <button type="button" className="primary" onClick={synthesize} disabled={busy} title={t('Compile and update the symbol (Ctrl+Enter)')}>
          {mode === 'behavioral' ? t('Compile') : t('Synthesize')}
        </button>
      </div>
      <div className="vm-body">
        <div className="vm-code">
          <div className="vm-gutter" ref={gutter} aria-hidden>
            {Array.from({ length: lines }, (_, i) => (
              <div key={i} className={i + 1 === errLine ? 'err' : undefined}>
                {i + 1}
              </div>
            ))}
          </div>
          <textarea
            ref={ta}
            spellCheck={false}
            value={code}
            aria-label={t('Verilog code')}
            onChange={(e) => setCode(e.target.value)}
            onScroll={(e) => gutter.current && (gutter.current.scrollTop = e.currentTarget.scrollTop)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                synthesize();
              } else if (e.key === 'Tab' && !e.shiftKey) {
                // tabulador: dos espacios
                e.preventDefault();
                const el = e.currentTarget;
                const { selectionStart: s, selectionEnd: f } = el;
                setCode(code.slice(0, s) + '  ' + code.slice(f));
                requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
              }
            }}
          />
        </div>
        <aside className="vm-side">
          {suggestBehavioral && (
            <p className="vm-suggest">
              {t('This code uses # delays or system tasks ($display…), which synthesis ignores.')}{' '}
              <button type="button" className="link" onClick={() => onMode('behavioral')}>
                {t('Simulate it as behavioral (Icarus)')}
              </button>
            </p>
          )}
          {failure && <p className="err">{t('Yosys could not run: {msg}', { msg: failure })}</p>}
          {result?.error && <p className="err">{result.error}</p>}
          {result?.block?.warnings.map((w) => <p key={w} className="hint">{w}</p>)}
          <section>
            <h4>{t('Pins')}</h4>
            {pins.length ? (
              <dl className="vm-pins">
                {(['in', 'out', 'inout'] as const).map((dir) => {
                  const ps = portsOf(pins).filter((p) => p.dir === dir);
                  return (
                    ps.length > 0 && (
                      <div key={dir}>
                        <dt>{dir === 'in' ? t('Inputs') : dir === 'out' ? t('Outputs') : t('Bidirectional (inout)')}</dt>
                        <dd>
                          {ps.map((p) => (
                            <code key={p.name} title={p.bits > 1 ? t('{n}-bit bus', { n: p.bits }) : undefined}>
                              {p.name}
                            </code>
                          ))}
                        </dd>
                      </div>
                    )
                  );
                })}
              </dl>
            ) : (
              <p className="hint">{t('Synthesize to create the symbol with its pins.')}</p>
            )}
          </section>
          <section>
            <h4>{t('Electrical interface')}</h4>
            <p className="hint">{t('Defaults of the instances (each one can change them, like any parameter).')}</p>
            <label className="vm-field">
              {t('Logic family')}
              <select
                value={family?.name ?? ''}
                aria-label={t('Logic family')}
                onChange={(e) => {
                  const f = FAMILIES.find((x) => x.name === e.target.value);
                  if (f) onParams(params.map(([k, v]) => [k, ELECTRICAL_NAMES.has(k.toLowerCase()) ? (f.values[k.toLowerCase()] ?? v) : v]));
                }}
              >
                {!family && <option value="">{t('Custom')}</option>}
                {FAMILIES.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            {ELECTRICAL.map((p) => (
              <ParamField key={p.name} label={p.label} unit={p.unit} name={p.name} value={values.get(p.name) ?? p.value} onChange={(v) => setParam(p.name, v)} />
            ))}
            <p className="hint">{t('VIL above VIH gives hysteresis (Schmitt trigger). Values may depend on vcc: {vcc/2}.')}</p>
          </section>
          {vparams.length > 0 && (
            <section>
              <h4>{t('Verilog parameters')}</h4>
              <p className="hint">{t('An instance with another value uses its own synthesis (integers only).')}</p>
              {vparams.map(([k, v]) => (
                <ParamField key={k} label={k} unit="" name={k} value={v} onChange={(x) => setParam(k, x)} />
              ))}
            </section>
          )}
          {result?.log.trim() && (
            <details>
              <summary>{mode === 'behavioral' ? t('Icarus output') : t('Yosys output')}</summary>
              <pre className="log">{result.log}</pre>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}

function ParamField({ label, unit, name, value, onChange }: { label: string; unit: string; name: string; value: string; onChange(v: string): void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => v.trim() && v.trim() !== value && onChange(v.trim());
  return (
    <label className="vm-field" title={name}>
      <span>
        {label} <code>{name}</code>
      </span>
      <span className="vm-input">
        <input value={v} aria-label={label} spellCheck={false} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
        {unit && <span className="hint">{unit}</span>}
      </span>
    </label>
  );
}

/**
 * Puertos del módulo para mostrarlos: los bits de un bus (q_3 … q_0, como los deja la síntesis)
 * (del más alto al más bajo) vuelven a juntarse en q[3:0].
 */
export function portsOf(pins: { name: string; dir: 'in' | 'out' | 'inout' }[]): { name: string; dir: 'in' | 'out' | 'inout'; bits: number }[] {
  const out: { name: string; dir: 'in' | 'out' | 'inout'; bits: number; base?: string; hi?: number; lo?: number }[] = [];
  for (const p of pins) {
    const m = /^(.+)_(\d+)$/.exec(p.name);
    const last = out.at(-1);
    if (m && last?.base === m[1] && last.dir === p.dir && last.lo !== undefined && +m[2] === last.lo - 1) {
      last.lo = +m[2];
      last.bits++;
    } else out.push(m ? { name: p.name, dir: p.dir, bits: 1, base: m[1], hi: +m[2], lo: +m[2] } : { name: p.name, dir: p.dir, bits: 1 });
  }
  return out.map(({ base, hi, lo, ...p }) => (base !== undefined && p.bits > 1 ? { ...p, name: `${base}[${hi}:${lo}]` } : p));
}
