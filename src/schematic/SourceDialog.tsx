// Ventana de configuración de fuentes independientes V e I (#47): forma de onda en pestañas
// verticales, un dibujo con los parámetros acotados y los campos por orden de importancia.
// Lo avanzado (AC, DC para .op, parásitos, sintaxis) va plegado.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { baseName, type SymbolDef, type SymbolInst } from '../asc/model.ts';
import { effectiveAttrs, type WindowDefaults } from '../asc/resolve.ts';
import type { LabelPatch } from './edit.ts';
import {
  emptySource,
  engNumber,
  looksLikeMegaTypo,
  parseSource,
  pulseDuty,
  solvePulse,
  spiceNumber,
  writeSource,
  pulseFixedAfter,
  type PulseLinked,
  type SourceKind,
  type SourceSpec,
} from '../sim/sources.ts';
import { labelRows, Modal } from './dialogs.tsx';
import { KINDS } from './sourceIcons.tsx';
import { t } from '../i18n/i18n.ts';

/** Valores por defecto de cada forma de onda al elegirla por primera vez */
const DEFAULT_ARGS: Partial<Record<SourceKind, string[]>> = {
  sine: ['0', '1', '1k'],
  pulse: ['0', '1', '', '', '', '5m', '10m'],
  exp: ['0', '1', '', '1m', '5m', '1m'],
  sffm: ['0', '1', '10k', '5', '1k'],
};

/** Símbolos de la fuente de tensión: el V por defecto y Cell para la continua (#120) */
const V_SYMBOL = 'voltage';
const CELL_SYMBOL = 'cell';

/** Un campo del formulario: índice de args (número) o campo propio */
type FieldKey = number | 'dc' | 'acMag' | 'acPhase' | 'per' | 'frq' | 'duty';
interface FieldDef {
  key: FieldKey;
  label: string;
  unit: 'V' | 's' | 'Hz' | '°' | '%' | '1/s' | '';
  optional?: boolean;
  /** para el resaltado en el dibujo */
  id: string;
}

const f = (key: FieldKey, label: string, unit: FieldDef['unit'], id: string, optional = false): FieldDef => ({ key, label, unit, id, optional });

/** Filas de 4 campos de cada pestaña, en orden de importancia (no el de SPICE) */
const LAYOUT: Record<Exclude<SourceKind, 'pwl'>, FieldDef[][]> = {
  sine: [
    [f(1, t('Amplitude'), 'V', 'amp'), f(0, 'Offset', 'V', 'off'), f(2, t('Frequency'), 'Hz', 'per'), f('per', t('Period'), 's', 'per')],
    [f(5, t('Phase'), '°', 'phi', true), f(3, 'Tdelay', 's', 'td', true), f(4, 'Amortiguamiento θ', '1/s', 'theta', true), f(6, 'Ncycles', '', 'n', true)],
  ],
  ac: [[f('acMag', t('Amplitude'), 'V', 'amp'), f('acPhase', t('Phase'), '°', 'phi', true)]],
  pulse: [
    [f(0, t('V1 (initial)'), 'V', 'v1'), f(1, t('V2 (pulse)'), 'V', 'v2')],
    [f(5, 'Ton', 's', 'ton'), f('per', t('Period'), 's', 'per'), f('frq', t('Frequency'), 'Hz', 'per'), f('duty', 'DC', '%', 'duty')],
    [f(3, 'Trise', 's', 'tr', true), f(4, 'Tfall', 's', 'tf', true), f(2, 'Tdelay', 's', 'td', true), f(7, 'Ncycles', '', 'n', true)],
  ],
  dc: [[f('dc', t('DC value'), 'V', 'dc')]],
  exp: [
    [f(0, 'V1', 'V', 'v1'), f(1, 'V2', 'V', 'v2'), f(3, t('rise τ'), 's', 'tau1'), f(5, t('fall τ'), 's', 'tau2')],
    [f(2, t('Rise start'), 's', 'td1', true), f(4, t('Fall start'), 's', 'td2')],
  ],
  sffm: [
    [f(1, t('Amplitude'), 'V', 'amp'), f(0, 'Offset', 'V', 'off'), f(2, t('Carrier'), 'Hz', 'fc'), f(4, t('Modulating'), 'Hz', 'fs')],
    [f(3, t('Modulation index'), '', 'mdi')],
  ],
};

const fullLine = (s: SourceSpec) => {
  const w = writeSource(s);
  return [w.Value, w.Value2, w.SpiceLine].filter(Boolean).join(' ');
};

/** Campo de texto que no pisa lo que se está escribiendo cuando cambia el valor calculado */
function LiveInput({ value, onChange, onFocus, onBlur, className, placeholder, label, autoFocus }: {
  value: string;
  /** al abrir la ventana (o cambiar de pestaña) el foco va acá, con el texto seleccionado */
  autoFocus?: boolean;
  onChange(v: string): void;
  onFocus?(): void;
  onBlur?(): void;
  className?: string;
  placeholder?: string;
  label: string;
}) {
  const [own, setOwn] = useState<string | null>(null);
  return (
    <input
      aria-label={label}
      className={className}
      placeholder={placeholder}
      autoFocus={autoFocus}
      value={own ?? value}
      onFocus={(e) => (setOwn(value), autoFocus && e.target.select(), onFocus?.())}
      onBlur={() => (setOwn(null), onBlur?.())}
      onChange={(e) => (setOwn(e.target.value), onChange(e.target.value))}
    />
  );
}

export function SourceDialog({ inst, def, windowDefaults, onApply, onClose, onAttributes }: {
  inst: SymbolInst;
  def: SymbolDef | undefined;
  windowDefaults: WindowDefaults;
  /** atributos a escribir (null = se borra), rótulos que se muestran u ocultan y símbolo nuevo si cambia */
  onApply(attrs: Record<string, string | null>, labels: Map<number, LabelPatch>, type?: string): void;
  onClose(): void;
  /** abrir el diálogo genérico de atributos (InstName, rótulos…) */
  onAttributes(): void;
}) {
  const eff = effectiveAttrs(inst, def);
  const current = (eff.get('Prefix') ?? '').toUpperCase() === 'I';
  const unitOf = (u: FieldDef['unit']) => (u === 'V' && current ? 'A' : u);
  const original = {
    Value: inst.attrs.get('Value') ?? '',
    Value2: inst.attrs.get('Value2'),
    SpiceLine: inst.attrs.get('SpiceLine'),
  };
  const parsed = useMemo(() => parseSource(original), []);
  // una fuente sin valor (recién colocada) arranca en Seno: abrir y apretar Enter ya deja una fuente válida
  const blankSrc = !parsed || (parsed.kind === 'dc' && !parsed.dc.trim());
  const [spec, setSpec] = useState<SourceSpec>(() => (parsed && !blankSrc ? parsed : { ...(parsed ?? emptySource()), kind: 'sine' }));
  // valores que la ventana completó sola (DC al abrir, AC o Valor DC al entrar a esas pestañas):
  // si no se tocaron, se sacan al ir a otra pestaña (mirar AC no debe dejar un "AC 1" puesto)
  const autoFilled = useRef<{ acMag?: string; dc?: string }>({});
  // los parámetros de cada forma de onda se recuerdan al cambiar de pestaña
  const [argsBy, setArgsBy] = useState<Partial<Record<SourceKind, string[]>>>(() => ({ ...DEFAULT_ARGS, ...(parsed ? { [parsed.kind]: parsed.args } : {}) }));
  const [text, setText] = useState<string | null>(() => (parsed || !original.Value.trim() ? null : [original.Value, original.Value2, original.SpiceLine].filter(Boolean).join(' ')));
  const [focus, setFocus] = useState('');
  // pulso: los dos últimos escritos entre Ton, período (o frecuencia) y DC quedan fijos
  const [fixed, setFixed] = useState<[PulseLinked, PulseLinked]>(['ton', 'per']);
  const [dutyText, setDutyText] = useState('');

  const kind = spec.kind;
  const args = kind === 'pwl' || kind === 'dc' || kind === 'ac' ? [] : (argsBy[kind] ?? []);
  const full: SourceSpec = { ...spec, args };
  const setArgs = (a: string[]) => setArgsBy({ ...argsBy, [kind]: a });
  const n = (s: string | undefined) => spiceNumber(s ?? '');

  // --- pulso: campos vinculados ---
  const pulse = kind === 'pulse';
  const duty = pulse && !fixed.includes('duty') ? pulseDutyText(args) : dutyText;
  // el DC calculado se muestra con 3 cifras
  function pulseDutyText(a: string[], digits = 3) {
    const d = pulseDuty(n(a[5]) || 0, n(a[6]), n(a[3]) || 0, n(a[4]) || 0);
    return isFinite(d) ? String(Number((d * 100).toPrecision(digits))) : '';
  }
  // Ton y período recalculados con todas las cifras: la frecuencia y el DC quedan donde se pidieron
  const relink = (a: string[], fx: [PulseLinked, PulseLinked], dText: string) => {
    const v = { ton: n(a[5]) || 0, per: n(a[6]), duty: n(dText) / 100, tr: n(a[3]) || 0, tf: n(a[4]) || 0 };
    const out = [...a];
    if (fx.includes('duty') && fx.includes('per') && dText.trim() && isFinite(v.per) && isFinite(v.duty)) out[5] = engNumber(solvePulse(fx, v).ton, 12);
    else if (fx.includes('duty') && fx.includes('ton') && isFinite(v.duty) && v.duty > 0) out[6] = engNumber(solvePulse(fx, v).per, 12);
    return out;
  };
  const isDerived = (key: FieldKey) => {
    if (!pulse) return false;
    const which: PulseLinked | null = key === 5 ? 'ton' : key === 'per' || key === 'frq' ? 'per' : key === 'duty' ? 'duty' : null;
    return which !== null && !fixed.includes(which);
  };

  const valueOf = (key: FieldKey): string => {
    if (typeof key === 'number') return args[key] ?? '';
    if (key === 'dc') return spec.dc;
    if (key === 'acMag') return spec.acMag;
    if (key === 'acPhase') return spec.acPhase;
    if (key === 'duty') return duty;
    // período ↔ frecuencia: el seno guarda la frecuencia, el pulso el período
    if (kind === 'sine' && key === 'per') return isFinite(n(args[2])) && n(args[2]) ? engNumber(1 / n(args[2])) : '';
    if (pulse && key === 'per') return args[6] ?? '';
    if (pulse && key === 'frq') return isFinite(n(args[6])) && n(args[6]) ? engNumber(1 / n(args[6])) : '';
    return '';
  };

  const change = (key: FieldKey, v: string) => {
    if (key === 'dc' || key === 'acMag' || key === 'acPhase') return setSpec({ ...spec, [key]: v });
    if (kind === 'sine' && key === 'per') {
      const a = [...args];
      a[2] = isFinite(n(v)) && n(v) ? engNumber(1 / n(v)) : a[2];
      return setArgs(a);
    }
    if (pulse) {
      let a = [...args];
      let fx = fixed;
      // al cambiar la frecuencia, el DC que se conserva es el que se ve (3 cifras), no el exacto
      let d = fixed.includes('duty') ? dutyText : pulseDutyText(args);
      if (key === 5) (a[5] = v), (fx = pulseFixedAfter('ton'));
      else if (key === 'per') (a[6] = v), (fx = pulseFixedAfter('per'));
      else if (key === 'frq') (a[6] = isFinite(n(v)) && n(v) ? engNumber(1 / n(v), 12) : a[6]), (fx = pulseFixedAfter('frq'));
      else if (key === 'duty') (d = v), (fx = pulseFixedAfter('duty'));
      else if (typeof key === 'number') a[key] = v;
      a = relink(a, fx, d);
      setFixed(fx);
      setDutyText(fx.includes('duty') ? d : '');
      return setArgs(a);
    }
    if (typeof key === 'number') {
      const a = [...args];
      a[key] = v;
      setArgs(a);
    }
  };

  const param = (k: string) => spec.params.find(([p]) => p.toLowerCase() === k.toLowerCase())?.[1] ?? '';
  const setParam = (k: string, v: string) => {
    const has = spec.params.some(([p]) => p.toLowerCase() === k.toLowerCase());
    setSpec({ ...spec, params: has ? spec.params.map(([p, x]) => (p.toLowerCase() === k.toLowerCase() ? [p, v] : [p, x])) : [...spec.params, [k, v]] });
  };

  // el valor de la pestaña Valor DC se guarda aparte: al pasar a una forma de onda no se
  // convierte en el "DC para .op" (que es opcional), y vuelve si se regresa a Valor DC
  const dcStash = useRef('');
  const choose = (k: SourceKind) => {
    setFocus('');
    if (k === kind) return;
    const next = { ...spec, kind: k };
    const auto = autoFilled.current;
    if (auto.acMag !== undefined && spec.acMag === auto.acMag) next.acMag = '';
    if (kind === 'dc') (dcStash.current = auto.dc !== undefined && spec.dc === auto.dc ? '' : spec.dc), (next.dc = '');
    autoFilled.current = {};
    if (k === 'ac' && !next.acMag) (next.acMag = '1'), (autoFilled.current.acMag = '1');
    if (k === 'dc') {
      // si la forma de onda tenía un DC para .op, ése es el valor DC
      next.dc = spec.dc || dcStash.current || '1';
      if (!spec.dc && !dcStash.current) autoFilled.current.dc = '1';
    }
    // PWL nuevo: un período de 1 kHz que se repite
    if (k === 'pwl' && !next.points.length) (next.points = [['0', '0'], ['250u', '1'], ['750u', '1'], ['1m', '0']]), (next.repeat = true);
    setSpec(next);
  };

  // avisos
  const fieldsText = [...args, spec.dc, spec.acMag, ...spec.points.flat()];
  const mega = fieldsText.find((s) => looksLikeMegaTypo(s ?? ''));
  const notFit = pulse && (n(args[3]) || 0) + (n(args[5]) || 0) + (n(args[4]) || 0) > n(args[6]) * 1.0001;
  const warn = [notFit ? t('Trise + Ton + Tfall doesn\'t fit in the period.') : '', mega ? t('"{p0}" is {p1} milli, like in LTspice; for mega write {p2}Meg.', { p0: mega.trim(), p1: mega.trim().slice(0, -1), p2: mega.trim().slice(0, -1) }) : '']
    .filter(Boolean)
    .join(' ');

  // rótulos del nombre y del valor: si se ven en el esquemático (#71)
  const shown = useMemo(() => labelRows(inst, def, windowDefaults).filter((r) => r.attr === 'InstName' || r.attr === 'Value'), []);
  // el valor se ve por defecto sólo en DC (en las formas de onda el dibujito del símbolo ya dice
  // qué es) al cambiar el tipo; al abrir se respeta lo que hay, y si el usuario movió el rótulo
  // o tocó la casilla, también
  const valueAuto = (r: (typeof shown)[number]) => r.attr === 'Value' && !r.moved && !current;
  const [visible, setVisible] = useState(() => new Map(shown.map((r) => [r.win, valueAuto(r) ? kind === 'dc' : r.visible])));
  const valueTouched = useRef(false);
  const firstKind = useRef<SourceKind | ''>(kind);
  useEffect(() => {
    if (valueTouched.current || kind === firstKind.current) return;
    firstKind.current = '';
    setVisible((v) => {
      const out = new Map(v);
      for (const r of shown) if (valueAuto(r)) out.set(r.win, kind === 'dc');
      return out;
    });
  }, [kind]);
  const labels = () => new Map(shown.filter((r) => visible.get(r.win) !== r.visible).map((r) => [r.win, { visible: visible.get(r.win) }]));
  const showToggles = shown.length > 0 && (
    <span className="src-show" role="group" aria-label={t('Show on the schematic')}>
      {t('Show:')}
      {shown.map((r) => (
        <label key={r.win} title={t('{p0} is shown on the schematic', { p0: r.attr === 'InstName' ? t('The name') : t('The value') })}>
          <input type="checkbox" checked={!!visible.get(r.win)} onChange={(e) => {
              if (r.attr === 'Value') valueTouched.current = true;
              setVisible(new Map(visible).set(r.win, e.target.checked));
            }} />
          {r.attr === 'InstName' ? t('Name') : t('Value')}
        </label>
      ))}
    </span>
  );

  // la fuente V cambia de símbolo según la forma de onda: DC usa Cell y el resto el V. Un símbolo
  // que el usuario eligió a mano (batería, Pila…) no se toca, ni tampoco una fuente de corriente
  const symbolFor = (k: SourceKind) => {
    if (current || (inst.type !== V_SYMBOL && inst.type !== CELL_SYMBOL)) return undefined;
    return k === 'dc' ? CELL_SYMBOL : V_SYMBOL;
  };

  const submit = () => {
    if (text !== null) {
      const p = parseSource({ Value: text });
      if (p) return onApply(writeSource(p), labels(), symbolFor(p.kind));
      return onApply({ Value: text.trim(), Value2: null, SpiceLine: null }, labels());
    }
    onApply(writeSource(full), labels(), symbolFor(kind));
  };

  const name = eff.get('InstName') ?? baseName(inst.type);
  const title = `${current ? t('Current source') : t('Voltage source')} ${name}`;

  if (text !== null)
    return (
      <Modal title={title} onClose={onClose} wide>
        <form className="srcdlg-text" onSubmit={(e) => (e.preventDefault(), submit())}>
          {!parsed && text === [original.Value, original.Value2, original.SpiceLine].filter(Boolean).join(' ') && (
            <p className="hint">{t('This source has something the form can\'t edit: it\'s edited as text.')}</p>
          )}
          <input aria-label={t('Source value')} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <p className="hint">{t('LTspice syntax, for example: SINE(0 1 1k) AC 1 Rser=1')}</p>
          <div className="buttons">
            {showToggles}
            <button
              type="button"
              disabled={!parseSource({ Value: text })}
              title={parseSource({ Value: text }) ? '' : t('The form can\'t edit this value')}
              onClick={() => {
                const p = parseSource({ Value: text });
                if (!p) return;
                setSpec(p);
                if (p.kind !== 'pwl' && p.kind !== 'dc' && p.kind !== 'ac') setArgsBy({ ...argsBy, [p.kind]: p.args });
                setText(null);
              }}
            >
              {t('Form')}
            </button>
            <button type="button" onClick={onAttributes}>{t('Attributes…')}</button>
            <span className="spacer" />
            <button type="button" onClick={onClose}>{t('Cancel')}</button>
            <button type="submit" className="primary">{t('OK')}</button>
          </div>
        </form>
      </Modal>
    );

  return (
    <Modal title={title} onClose={onClose} wide>
      <form className="srcdlg" onSubmit={(e) => (e.preventDefault(), submit())}>
        <div className="src-tabs" role="tablist" aria-orientation="vertical" aria-label={t('Waveform')}>
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="tab"
              aria-selected={kind === k.kind}
              className={kind === k.kind ? 'on' : ''}
              onClick={() => choose(k.kind)}
              // Enter con el foco en una pestaña acepta, como en los campos
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), submit())}
            >
              <svg viewBox="0 0 46 20" aria-hidden="true">
                <g fill="none" stroke="currentColor" strokeWidth="1.5">{k.icon}</g>
              </svg>
              {k.label}
            </button>
          ))}
        </div>
        <div className="src-panel" role="tabpanel">
          {kind === 'pwl' ? (
            <PwlEditor spec={spec} setSpec={setSpec} current={current} />
          ) : (
            <>
              <WaveDrawing spec={full} focus={focus} />
              {LAYOUT[kind].map((row, i) => (
                <div className="src-row" key={`${kind}-${i}`}>
                  {row.map((fd, j) => (
                    <label key={String(fd.key)} title={fd.key === 'duty' ? t('Duty cycle: (Trise/2 + Ton + Tfall/2) / Period') : isDerived(fd.key) ? t('Computed from the others') : undefined}>
                      {fd.label}
                      {unitOf(fd.unit) ? ` [${unitOf(fd.unit)}]` : ''}
                      <LiveInput
                        label={fd.label}
                        autoFocus={i === 0 && j === 0}
                        value={valueOf(fd.key)}
                        className={isDerived(fd.key) ? 'derived' : undefined}
                        placeholder={fd.optional ? '0' : undefined}
                        onChange={(v) => change(fd.key, v)}
                        onFocus={() => setFocus(fd.id)}
                        onBlur={() => setFocus('')}
                      />
                    </label>
                  ))}
                </div>
              ))}
              {kind === 'ac' && <p className="hint">{t('Only for .ac and .noise: in transient and at the operating point it\'s 0')}{' '}{current ? 'A' : 'V'}.</p>}
            </>
          )}
          <details className="src-adv">
            <summary>{kind === 'ac' ? t('Advanced: parasitics and syntax') : t('Advanced: AC, DC, parasitics and syntax')}</summary>
            <div className="src-row">
              {kind !== 'ac' && (
                <>
                  <label>
                    {t('AC amplitude')}
                    <input aria-label={t('AC amplitude')} value={spec.acMag} placeholder="—" onChange={(e) => setSpec({ ...spec, acMag: e.target.value })} />
                  </label>
                  <label>
                    {t('AC phase [°]')}
                    <input aria-label={t('AC phase')} value={spec.acPhase} placeholder="0" onChange={(e) => setSpec({ ...spec, acPhase: e.target.value })} />
                  </label>
                </>
              )}
              {!current && (
                <>
                  <label>
                    Rser [Ω]
                    <input aria-label="Rser" value={param('Rser')} placeholder="0" onChange={(e) => setParam('Rser', e.target.value)} />
                  </label>
                  <label>
                    Cpar [F]
                    <input aria-label="Cpar" value={param('Cpar')} placeholder="0" onChange={(e) => setParam('Cpar', e.target.value)} />
                  </label>
                </>
              )}
              {kind !== 'dc' && kind !== 'ac' && (
                <label title={t('The one .op and .dc use (otherwise, the waveform\'s value at t = 0)')}>
                  {t('DC for .op [')}{current ? 'A' : 'V'}]
                  <input aria-label={t('DC for .op')} value={spec.dc} placeholder="—" onChange={(e) => setSpec({ ...spec, dc: e.target.value })} />
                </label>
              )}
            </div>
            <p className="hint">{t('Value saved in the .asc')}</p>
            <code className="src-line">{fullLine(full)}</code>
            <div className="buttons left">
              <button type="button" onClick={() => setText(fullLine(full))}>{t('Edit as text')}</button>
              <button type="button" onClick={onAttributes}>{t('Attributes…')}</button>
            </div>
          </details>
          {warn && <p className="hint warn">{warn}</p>}
          <div className="buttons">
            {showToggles}
            <span className="spacer" />
            <button type="button" onClick={onClose}>{t('Cancel')}</button>
            <button type="submit" className="primary">{t('OK')}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Dibujos acotados (no a escala: proporciones mínimas para que se lean las cotas)

const W = 520;
const H = 150;

function Dim({ x1, x2, y, label, on }: { x1: number; x2: number; y: number; label: string; on: boolean }) {
  return (
    <g className={`dim${on ? ' on' : ''}`}>
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} />
      <text x={(x1 + x2) / 2} y={y - 6} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

function VDim({ x, y1, y2, label, on }: { x: number; y1: number; y2: number; label: string; on: boolean }) {
  return (
    <g className={`dim${on ? ' on' : ''}`}>
      <line x1={x} y1={y1} x2={x} y2={y2} />
      <line x1={x - 4} y1={y1} x2={x + 4} y2={y1} />
      <line x1={x - 4} y1={y2} x2={x + 4} y2={y2} />
      <text x={x + 6} y={(y1 + y2) / 2 + 4}>
        {label}
      </text>
    </g>
  );
}

/** Nivel con línea punteada hasta `to` (sin línea si `to` no pasa del rótulo); `x` es donde termina el rótulo */
function Level({ y, label, to, on, x = 56 }: { y: number; label: string; to: number; on: boolean; x?: number }) {
  return (
    <g className={`dim${on ? ' on' : ''}`}>
      {to > x + 6 && <line x1={x + 6} y1={y} x2={to} y2={y} strokeDasharray="3 3" />}
      <text x={x} y={y + 4} textAnchor="end">
        {label}
      </text>
    </g>
  );
}

function WaveDrawing({ spec, focus }: { spec: SourceSpec; focus: string }) {
  const a = spec.args.map((s) => spiceNumber(s ?? ''));
  const z = (i: number) => (isFinite(a[i]) ? a[i] : 0);
  const on = (id: string) => focus === id;
  let body: ReactNode = null;
  if (spec.kind === 'pulse') {
    const [td, tr, tf, ton] = [z(2), z(3), z(4), z(5)];
    const T = z(6) || ton + tr + tf || 1;
    const x0 = 66;
    const yl = 104;
    const yh = 40;
    const tdw = Math.max(48, (td / T) * 150);
    const trw = Math.max(30, (tr / T) * 200);
    const tfw = Math.max(30, (tf / T) * 200);
    let onw = Math.max(50, (ton / T) * 200);
    let offw = Math.max(60, ((T - tr - ton - tf) / T) * 200);
    // dos pulsos completos y que la señal baje al final: Ton y el tiempo apagado se achican
    // para que entre (las rampas y el Td conservan su ancho mínimo para que se lean las cotas)
    const room = 430 - tdw - 2 * (trw + tfw) - 18;
    const k = Math.min(1, room / (2 * onw + offw));
    onw *= k;
    offw *= k;
    const xa = x0 + tdw;
    const xb = xa + trw;
    const xc = xb + onw;
    const xd = xc + tfw;
    const xe = xd + offw;
    const xf = xe + trw;
    const xg = xf + onw;
    const xh = xg + tfw;
    body = (
      <>
        <path className="wave" d={`M${x0} ${yl}H${xa}L${xb} ${yh}H${xc}L${xd} ${yl}H${xe}L${xf} ${yh}H${xg}L${xh} ${yl}H${Math.max(xh + 18, 505)}`} />
        <Level y={yh} label="V2" to={xb} on={on('v2')} />
        <Level y={yl} label="V1" to={x0} on={on('v1')} />
        <Dim x1={xa} x2={xb} y={22} label="Tr" on={on('tr')} />
        <Dim x1={xb} x2={xc} y={22} label="Ton" on={on('ton')} />
        <Dim x1={xc} x2={xd} y={22} label="Tf" on={on('tf')} />
        <Dim x1={x0} x2={xa} y={132} label="Td" on={on('td')} />
        <Dim x1={xa} x2={xe} y={132} label={t('Period = 1/f')} on={on('per')} />
      </>
    );
  } else if (spec.kind === 'sine') {
    // la señal arranca más a la derecha para que entren la cota de A y el rótulo del offset
    const yc = 64;
    const A = 40;
    const x0 = 110;
    const fr = z(2) || 1;
    const td = z(3);
    const th = z(4);
    const ph = (z(5) * Math.PI) / 180;
    const T = 1 / fr;
    const span = td + 2 * T;
    let d = `M${x0} ${yc}`;
    for (let i = 0; i <= 240; i++) {
      const tt = (span * i) / 240;
      const y = tt < td ? Math.sin(ph) : Math.exp(-th * (tt - td)) * Math.sin(2 * Math.PI * fr * (tt - td) + ph);
      d += `L${(x0 + (tt / span) * 390).toFixed(1)} ${(yc - A * y).toFixed(1)}`;
    }
    const xs = x0 + (td / span) * 390;
    const xp = xs + (T / span) * 390;
    const xa = xs + (T / span) * 97.5;
    body = (
      <>
        <path className="wave" d={d} />
        <Level y={yc} label="Offset" to={505} on={on('off')} x={44} />
        <g className={`dim${on('amp') ? ' on' : ''}`}>
          <line x1={xa} y1={yc - A} x2={92} y2={yc - A} strokeDasharray="3 3" />
        </g>
        <VDim x={92} y1={yc} y2={yc - A} label="A" on={on('amp')} />
        {td > 0 && <Dim x1={x0} x2={xs} y={138} label="Td" on={on('td')} />}
        <Dim x1={xs} x2={xp} y={138} label={t('Period = 1/f')} on={on('per')} />
      </>
    );
  } else if (spec.kind === 'ac') {
    const cx = 230;
    const cy = 96;
    const R = 78;
    const phv = spiceNumber(spec.acPhase);
    const ph = ((isFinite(phv) ? phv : 0) * Math.PI) / 180;
    const ex = cx + R * Math.cos(ph);
    const ey = cy - R * Math.sin(ph);
    const right = Math.cos(ph) >= 0;
    body = (
      <>
        <g className="axis">
          <line x1={130} y1={cy} x2={336} y2={cy} />
          <line x1={cx} y1={10} x2={cx} y2={142} />
          <path d={`M332 ${cy - 3}L337 ${cy}L332 ${cy + 3}`} />
          <path d={`M${cx - 3} 14L${cx} 9L${cx + 3} 14`} />
          <text x={342} y={cy + 4}>Re</text>
          <text x={cx + 6} y={18}>Im</text>
        </g>
        <g className={`phasor${on('amp') ? ' on' : ''}`}>
          <line x1={cx} y1={cy} x2={ex} y2={ey} />
          <circle cx={ex} cy={ey} r={3} />
          <text x={ex + (right ? 8 : -8)} y={ey - 6} textAnchor={right ? 'start' : 'end'}>
            A={spec.acMag || '1'}
          </text>
        </g>
        {Math.abs(ph) > 0.02 && (
          <g className={`dim${on('phi') ? ' on' : ''}`}>
            <path d={`M${cx + 30} ${cy}A30 30 0 0 ${ph > 0 ? 0 : 1} ${(cx + 30 * Math.cos(ph)).toFixed(1)} ${(cy - 30 * Math.sin(ph)).toFixed(1)}`} fill="none" />
            <text x={cx + 42 * Math.cos(ph / 2) + 2} y={cy - 42 * Math.sin(ph / 2) + 4}>
              {spec.acPhase}°
            </text>
          </g>
        )}
      </>
    );
  } else if (spec.kind === 'exp') {
    const x0 = 70;
    const [t1, a1raw, t2raw, a2raw] = [z(2), z(3), z(4), z(5)];
    const a1 = a1raw || 1e-3;
    const t2 = t2raw || t1 + 5 * a1;
    const a2 = a2raw || a1;
    const span = t2 + 5 * a2;
    const sc = 430 / span;
    const X = (tt: number) => x0 + tt * sc;
    const yl = 104;
    const yh = 36;
    let d = `M${x0} ${yl}`;
    for (let i = 0; i <= 240; i++) {
      const tt = (span * i) / 240;
      let y = 0;
      if (tt > t1) y += 1 - Math.exp(-(tt - t1) / a1);
      if (tt > t2) y -= 1 - Math.exp(-(tt - t2) / a2);
      d += `L${X(tt).toFixed(1)} ${(yl + (yh - yl) * y).toFixed(1)}`;
    }
    body = (
      <>
        <path className="wave" d={d} />
        <Level y={yh} label="V2" to={X(t2)} on={on('v2')} />
        <Level y={yl} label="V1" to={505} on={on('v1')} />
        {t1 > 0 && <Dim x1={x0} x2={X(t1)} y={130} label={t('start')} on={on('td1')} />}
        <Dim x1={X(t1)} x2={X(t1) + Math.max(30, a1 * sc)} y={20} label="τ↑" on={on('tau1')} />
        <Dim x1={x0} x2={X(t2)} y={144} label={t('fall start')} on={on('td2')} />
        <Dim x1={X(t2)} x2={X(t2) + Math.max(30, a2 * sc)} y={20} label="τ↓" on={on('tau2')} />
      </>
    );
  } else if (spec.kind === 'dc') {
    body = (
      <>
        <path className="wave" d="M70 64H500" />
        <Level y={64} label={t('Value')} to={0} on={on('dc')} />
        <g className="axis">
          <line x1={70} y1={112} x2={500} y2={112} />
          <text x={500} y={128} textAnchor="end">t</text>
        </g>
      </>
    );
  } else if (spec.kind === 'sffm') {
    const fc = z(2) || 1e4;
    const fs = z(4) || 1e3;
    const m = z(3);
    const span = 2 / fs;
    let d = 'M70 74';
    for (let i = 0; i <= 600; i++) {
      const tt = (span * i) / 600;
      d += `L${(70 + (tt / span) * 430).toFixed(1)} ${(74 - 40 * Math.sin(2 * Math.PI * fc * tt + m * Math.sin(2 * Math.PI * fs * tt))).toFixed(1)}`;
    }
    body = (
      <>
        <path className="wave" d={d} />
        <Level y={74} label="Offset" to={505} on={on('off')} />
        <Level y={34} label="+A" to={70} on={on('amp')} />
        <Dim x1={70} x2={285} y={142} label={t('1 / modulating')} on={on('fs')} />
      </>
    );
  }
  return (
    <svg className="src-draw" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Waveform with its parameters')}>
      {body}
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// PWL: tabla con scroll y gráfico donde se agregan (click) y se arrastran puntos

function PwlEditor({ spec, setSpec, current }: { spec: SourceSpec; setSpec(s: SourceSpec): void; current: boolean }) {
  const [sel, setSel] = useState(-1);
  const svg = useRef<SVGSVGElement>(null);
  const table = useRef<HTMLDivElement>(null);
  const drag = useRef<{ geo: Geo; moved: boolean } | null>(null);
  const pts = spec.points;
  const setPts = (p: [string, string][]) => setSpec({ ...spec, points: p });
  type Geo = ReturnType<typeof geometry>;
  function geometry(p: [string, string][]) {
    const nums = p.map(([tt, v]) => [spiceNumber(tt), spiceNumber(v)]).filter(([tt, v]) => isFinite(tt) && isFinite(v));
    const T = Math.max(...nums.map(([tt]) => tt), 1e-9) * 1.15;
    const lo = Math.min(0, ...nums.map(([, v]) => v));
    const hi = Math.max(1, ...nums.map(([, v]) => v)) * 1.1;
    return {
      T, lo, hi,
      X: (tt: number) => 66 + (tt / T) * 430,
      Y: (v: number) => 124 - ((v - lo) / (hi - lo)) * 104,
      iX: (x: number) => ((x - 66) / 430) * T,
      iY: (y: number) => lo + ((124 - y) / 104) * (hi - lo),
    };
  }
  // período = tiempo del último punto (con Repeat, LTspice repite desde ahí); al cambiar el período
  // o la frecuencia se reescalan todos los tiempos
  const period = Math.max(0, ...pts.map(([tt]) => spiceNumber(tt)).filter(isFinite));
  const rescale = (p: number) => {
    if (!(p > 0) || !(period > 0)) return;
    const k = p / period;
    setPts(pts.map(([tt, v]) => (isFinite(spiceNumber(tt)) ? [engNumber(spiceNumber(tt) * k, 12), v] : [tt, v])) as [string, string][]);
  };
  const geo = drag.current?.geo ?? geometry(pts);
  const toSvg = (e: { clientX: number; clientY: number }) => {
    const b = svg.current!.getBoundingClientRect();
    return [((e.clientX - b.left) * W) / b.width, ((e.clientY - b.top) * H) / b.height];
  };
  const sorted = (p: [string, string][], keep: number) => {
    const item = p[keep];
    const s = [...p].sort((a, b) => (spiceNumber(a[0]) || 0) - (spiceNumber(b[0]) || 0));
    return { p: s, i: s.indexOf(item) };
  };
  useEffect(() => {
    if (sel >= 0) table.current?.querySelectorAll('tbody tr')[sel]?.scrollIntoView({ block: 'nearest' });
  }, [sel]);
  const valid = pts.map(([tt, v], i) => ({ t: spiceNumber(tt), v: spiceNumber(v), i })).filter((q) => isFinite(q.t) && isFinite(q.v));
  const order = [...valid].sort((a, b) => a.t - b.t);
  const path = order.length ? `M${geo.X(0)} ${geo.Y(order[0].v)}` + order.map((q) => `L${geo.X(q.t).toFixed(1)} ${geo.Y(q.v).toFixed(1)}`).join('') + 'H505' : '';
  const selPt = valid.find((q) => q.i === sel);
  const box = selPt && svg.current ? (() => {
    const b = svg.current.getBoundingClientRect();
    const k = b.width / W;
    let x = geo.X(selPt.t) * k + 10;
    if (x > b.width - 150) x -= 164;
    return { left: x, top: Math.max(2, geo.Y(selPt.v) * k - 14) };
  })() : null;
  const set = (i: number, c: 0 | 1, v: string) => setPts(pts.map((p, j) => (j === i ? (c ? [p[0], v] : [v, p[1]]) : p)) as [string, string][]);
  const remove = (i: number) => (setPts(pts.filter((_, j) => j !== i)), setSel(-1));
  const unit = current ? 'A' : 'V';
  return (
    <>
      <div className="src-pwl-graph">
        <svg
          ref={svg}
          className="src-draw"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={t('Waveform points: click to add, drag to move')}
          onPointerMove={(e) => {
            if (!drag.current || sel < 0) return;
            const [x, y] = toSvg(e);
            const tt = Math.max(0, drag.current.geo.iX(x));
            const v = drag.current.geo.iY(y);
            drag.current.moved = true;
            setPts(pts.map((p, j) => (j === sel ? [engNumber(tt), String(Number(v.toPrecision(3)))] : p)) as [string, string][]);
          }}
          onPointerUp={() => {
            if (!drag.current) return;
            const moved = drag.current.moved;
            drag.current = null;
            if (moved) {
              const s = sorted(pts, sel);
              setPts(s.p);
              setSel(s.i);
            }
          }}
        >
          <rect
            x={0}
            y={0}
            width={W}
            height={H}
            fill="transparent"
            className="src-pwl-hit"
            onClick={(e) => {
              const [x, y] = toSvg(e);
              const tt = geo.iX(x);
              if (tt < 0) return;
              const s = sorted([...pts, [engNumber(tt), String(Number(geo.iY(y).toPrecision(2)))]], pts.length);
              setPts(s.p);
              setSel(s.i);
            }}
          />
          <PwlGrid geo={geo} />
          {path && <path className="wave" d={path} />}
          {valid.map((q) => (
            <circle
              key={q.i}
              className={`src-pt${q.i === sel ? ' on' : ''}`}
              cx={geo.X(q.t)}
              cy={geo.Y(q.v)}
              r={q.i === sel ? 5.5 : 4}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setSel(q.i);
                drag.current = { geo: geometry(pts), moved: false };
                svg.current?.setPointerCapture(e.pointerId);
              }}
            />
          ))}
          <text className="src-pwl-tip" x={505} y={12} textAnchor="end">
            {t('click: add · drag: move')}
          </text>
        </svg>
        {box && sel >= 0 && (
          <div className="src-pop" style={box}>
            t<input aria-label={t('Point time')} value={pts[sel][0]} onChange={(e) => set(sel, 0, e.target.value)} />
            <span />
            A<input aria-label={t('Point amplitude')} value={pts[sel][1]} onChange={(e) => set(sel, 1, e.target.value)} />
            <button type="button" aria-label={t('Remove point')} title={t('Remove point')} onClick={() => remove(sel)}>
              ×
            </button>
          </div>
        )}
      </div>
      <div className="src-row">
        <label>
          {t('Frequency')} [Hz]
          <LiveInput label={t('Frequency')} value={period > 0 ? engNumber(1 / period) : ''} onChange={(v) => rescale(1 / spiceNumber(v))} />
        </label>
        <label>
          {t('Period')} [s]
          <LiveInput label={t('Period')} value={period > 0 ? engNumber(period) : ''} onChange={(v) => rescale(spiceNumber(v))} />
        </label>
      </div>
      <div className="src-pts" ref={table}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{t('Time [s]')}</th>
              <th>{t('Amplitude [')}{unit}]</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pts.map((p, i) => (
              <tr key={i} className={i === sel ? 'on' : ''} onFocus={() => setSel(i)}>
                <td>{i + 1}</td>
                <td>
                  <input aria-label={t('Time {p0}', { p0: i + 1 })} value={p[0]} onChange={(e) => set(i, 0, e.target.value)} />
                </td>
                <td>
                  <input aria-label={t('Amplitude {p0}', { p0: i + 1 })} value={p[1]} onChange={(e) => set(i, 1, e.target.value)} />
                </td>
                <td>
                  <button type="button" aria-label={t('Remove point {p0}', { p0: i + 1 })} onClick={() => remove(i)}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="buttons left">
        <button type="button" onClick={() => (setPts([...pts, ['', '']]), setSel(pts.length))}>{t('+ Point')}</button>
        <CsvImport onPoints={(p) => (setPts(p), setSel(-1))} />
        <label className="src-check">
          <input type="checkbox" checked={spec.repeat} onChange={(e) => setSpec({ ...spec, repeat: e.target.checked })} /> {t('Repeat')}
        </label>
      </div>
    </>
  );
}

/** Paso "lindo" (1, 2 o 5 × 10^n) para unas `n` divisiones de `span` */
function niceStep(span: number, n: number) {
  const raw = span / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/** Grilla gruesa (con escala numérica) y fina del gráfico del PWL */
function PwlGrid({ geo }: { geo: { T: number; lo: number; hi: number; X(t: number): number; Y(v: number): number } }) {
  const lines: ReactNode[] = [];
  const axis = (from: number, to: number, step: number, major: boolean, draw: (v: number, major: boolean, key: string) => void) => {
    for (let i = Math.ceil(from / step - 1e-9); i * step <= to + step * 1e-9; i++) draw(i * step, major, `${major ? 'M' : 'm'}${i}`);
  };
  const ts = niceStep(geo.T, 6);
  const vs = niceStep(geo.hi - geo.lo, 4);
  const vLine = (tt: number, major: boolean, key: string) => {
    const x = geo.X(tt);
    lines.push(<line key={`t${key}`} className={major ? 'major' : 'minor'} x1={x} y1={20} x2={x} y2={124} />);
    if (major) lines.push(<text key={`tl${key}`} x={x} y={138} textAnchor="middle">{engNumber(tt)}</text>);
  };
  const hLine = (v: number, major: boolean, key: string) => {
    const y = geo.Y(v);
    lines.push(<line key={`v${key}`} className={major ? 'major' : 'minor'} x1={66} y1={y} x2={496} y2={y} />);
    if (major) lines.push(<text key={`vl${key}`} x={60} y={y + 4} textAnchor="end">{engNumber(v)}</text>);
  };
  axis(0, geo.T, ts / 5, false, vLine);
  axis(geo.lo, geo.hi, vs / 5, false, hLine);
  axis(0, geo.T, ts, true, vLine);
  axis(geo.lo, geo.hi, vs, true, hLine);
  return <g className="src-grid">{lines}</g>;
}

/** Importar puntos de un CSV (tiempo, valor por línea; separador coma, punto y coma o tab) */
function CsvImport({ onPoints }: { onPoints(p: [string, string][]): void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => input.current?.click()}>{t('Import CSV')}</button>
      <input
        ref={input}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onPoints(csvPoints(await file.text()));
        }}
      />
    </>
  );
}

/** Líneas "t, v" (o con ; o tab); se saltan los encabezados y lo que no son dos números */
export function csvPoints(text: string): [string, string][] {
  const out: [string, string][] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/[;,\t]|\s+/).map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    if (!isFinite(spiceNumber(cells[0])) || !isFinite(spiceNumber(cells[1]))) continue;
    out.push([cells[0], cells[1]]);
  }
  return out;
}
