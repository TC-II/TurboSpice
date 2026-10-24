import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../i18n/i18n.ts';
import { ELECTRICAL, ELECTRICAL_NAMES, FAMILIES } from './electrical.ts';
import type { SynthResult } from './yosys.ts';

/**
 * Vista de un módulo Verilog del proyecto (#209), en lugar del esquemático de un subcircuito:
 * el código, «Sintetizar» (Yosys) con sus errores y avisos, y la interfaz eléctrica y los
 * parameter por omisión de las instancias (los del símbolo; cada instancia los puede cambiar).
 */
export function VerilogModule({ name, text, stale, pins, params, onText, onSynthesize, onParams }: {
  name: string;
  text: string;
  /** el código cambió desde la última síntesis (o nunca se sintetizó) */
  stale: boolean;
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

  const status = busy
    ? { cls: 'busy', text: t('Synthesizing…') }
    : result?.error
      ? { cls: 'err', text: t('Synthesis failed') }
      : stale
        ? { cls: 'stale', text: t('Changes not synthesized yet (it is synthesized before simulating)') }
        : { cls: 'ok', text: t('Synthesized') };

  return (
    <div className="verilog-module">
      <div className="vm-bar">
        <strong>{name}.v</strong>
        <span className={`vm-status ${status.cls}`}>{status.text}</span>
        <button type="button" className="primary" onClick={synthesize} disabled={busy} title={t('Synthesize with Yosys and update the symbol (Ctrl+Enter)')}>
          {t('Synthesize')}
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
          {failure && <p className="err">{t('Yosys could not run: {msg}', { msg: failure })}</p>}
          {result?.error && <p className="err">{result.error}</p>}
          {result?.block?.warnings.map((w) => <p key={w} className="hint">{w}</p>)}
          <section>
            <h4>{t('Pins')}</h4>
            {pins.length ? (
              <p className="vm-pins">
                {pins.map((p) => (
                  <span key={p.name} className={`vm-pin ${p.dir}`} title={p.dir === 'in' ? t('input') : p.dir === 'out' ? t('output') : t('bidirectional (inout)')}>
                    {p.dir === 'in' ? '→' : p.dir === 'out' ? '←' : '↔'} {p.name}
                  </span>
                ))}
              </p>
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
              <summary>{t('Yosys output')}</summary>
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
