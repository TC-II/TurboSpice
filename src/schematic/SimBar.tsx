// Barra de la simulación elegida (#39), al lado de Simular: su nombre (click para renombrarla),
// los parámetros del análisis en una o dos líneas (el Barrido DC usa la segunda para la otra
// fuente; las redes y fuentes se pueden elegir en el esquemático), un cuadrado con su estado
// (sin correr, corriendo, lista) y una × para borrarla. Los cambios se aplican al salir del
// campo o con Enter y reemplazan el comando del esquemático.
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { formatAnalysis, parseAnalysis, validateAnalysis, type Analysis, type Sweep } from '../sim/analyses.ts';
import type { CircuitInfo, Picker } from './simDialogs.tsx';
import { t } from '../i18n/i18n.ts';

type BarField =
  | { kind: 'text'; label: string; value: string; set(v: string): Analysis; list?: 'nets' | 'sources'; placeholder?: string; width?: number }
  | { kind: 'select'; label: string; value: string; options: [string, string][]; set(v: string): Analysis }
  | { kind: 'check'; label: string; value: boolean; set(v: boolean): Analysis; title?: string }
  /** casillas una debajo de la otra */
  | { kind: 'checks'; label: string; checks: Extract<BarField, { kind: 'check' }>[] };

const UIC_TITLE =
  t('UIC (use initial conditions): doesn\'t compute the operating point. It starts with everything at 0 except the initial conditions (IC= on capacitors and inductors, .ic); sources are already at their value from t=0.');
const STARTUP_TITLE =
  t('startup (from LTspice): computes the operating point with the schematic\'s DC sources at 0 and brings them to their value in a 20 µs ramp. SINE, PULSE, PWL… sources and those inside subcircuits don\'t change. Useful to see sources, oscillators and PLLs starting up.');

const POINTS: Record<Sweep['type'], string> = { dec: t('Points/decade'), oct: t('Points/octave'), lin: t('Points') };

/** Barrido en frecuencia: inicio, fin, puntos y tipo de barrido */
const sweepFields = (s: Sweep, set: (s: Sweep) => Analysis): BarField[] => [
  { kind: 'text', label: t('F start'), value: s.start, set: (start) => set({ ...s, start }) },
  { kind: 'text', label: t('F stop'), value: s.stop, set: (stop) => set({ ...s, stop }) },
  { kind: 'text', label: POINTS[s.type], value: s.points, set: (points) => set({ ...s, points }), width: 5 },
  {
    kind: 'select',
    label: t('Sweep'),
    value: s.type,
    options: [
      ['dec', t('per decade')],
      ['oct', t('per octave')],
      ['lin', t('linear')],
    ],
    set: (type) => set({ ...s, type: type as Sweep['type'] }),
  },
];

/** Campos de la barra por línea */
function barRows(a: Analysis): BarField[][] {
  const text = (label: string, value: string, set: (v: string) => Analysis, o: Partial<Extract<BarField, { kind: 'text' }>> = {}): BarField => ({ kind: 'text', label, value, set, ...o });
  switch (a.kind) {
    case 'tran':
      return [
        [
          text(t('Stop time'), a.tstop, (tstop) => ({ ...a, tstop })),
          text(t('Save from'), a.tstart, (tstart) => ({ ...a, tstart }), { placeholder: '0' }),
          text(t('Maximum step'), a.tmax, (tmax) => ({ ...a, tmax }), { placeholder: 'auto' }),
          {
            kind: 'checks',
            label: t('options'),
            checks: [
              { kind: 'check', label: 'UIC', value: a.uic, set: (uic) => ({ ...a, uic }), title: UIC_TITLE },
              { kind: 'check', label: 'startup', value: a.startup, set: (startup) => ({ ...a, startup }), title: STARTUP_TITLE },
            ],
          },
        ],
      ];
    case 'ac':
      return [sweepFields(a.sweep, (sweep) => ({ ...a, sweep }))];
    case 'dc':
      return [0, 1].map((i) => {
        const s = a.sweeps[i] ?? { src: '', start: '', stop: '', step: '' };
        const upd = (patch: Partial<typeof s>): Analysis => {
          const sweeps = [...a.sweeps];
          sweeps[i] = { ...s, ...patch };
          // la segunda fuente sin nombre no se escribe
          return { ...a, sweeps: sweeps.filter((x, k) => k === 0 || x.src) };
        };
        const n = i + 1;
        return [
          text(t('Source {n}', { n }), s.src, (src) => upd({ src }), { list: 'sources', placeholder: i ? t('optional') : '', width: 6 }),
          text(t('Start {n}', { n }), s.start, (start) => upd({ start })),
          text(t('Stop {n}', { n }), s.stop, (stop) => upd({ stop })),
          text(t('Increment {n}', { n }), s.step, (step) => upd({ step })),
        ];
      });
    case 'noise':
      return [
        [
          text(t('Output'), a.out, (out) => ({ ...a, out }), { list: 'nets' }),
          text(t('Reference'), a.ref, (ref) => ({ ...a, ref }), { list: 'nets', placeholder: t('ground') }),
          text(t('Source'), a.src, (src) => ({ ...a, src }), { list: 'sources' }),
        ],
        sweepFields(a.sweep, (sweep) => ({ ...a, sweep })),
      ];
    case 'op':
      return [];
    case 'tf':
      return [[text(t('Output'), a.out, (out) => ({ ...a, out }), { list: 'nets' }), text(t('Source'), a.src, (src) => ({ ...a, src }), { list: 'sources' })]];
    case 'sens':
      return [
        [text(t('Output'), a.out, (out) => ({ ...a, out }), { list: 'nets' }), { kind: 'check', label: t('In AC'), value: a.ac, set: (ac) => ({ ...a, ac }) }],
        ...(a.ac ? [sweepFields(a.sweep, (sweep) => ({ ...a, sweep }))] : []),
      ];
    case 'pz':
      return [
        [
          text(t('Input +'), a.inP, (inP) => ({ ...a, inP }), { list: 'nets' }),
          text(t('Input −'), a.inN, (inN) => ({ ...a, inN }), { list: 'nets' }),
          text(t('Output +'), a.outP, (outP) => ({ ...a, outP }), { list: 'nets' }),
          text(t('Output −'), a.outN, (outN) => ({ ...a, outN }), { list: 'nets' }),
        ],
        [
          { kind: 'select', label: t('Transfer'), value: a.type, options: [['vol', 'V/V'], ['cur', 'V/I']], set: (type) => ({ ...a, type: type as 'vol' }) },
          { kind: 'select', label: t('Compute'), value: a.which, options: [['pz', t('poles and zeros')], ['pol', t('poles')], ['zer', t('zeros')]], set: (which) => ({ ...a, which: which as 'pz' }) },
        ],
      ];
    case 'disto':
      return [[...sweepFields(a.sweep, (sweep) => ({ ...a, sweep })), text('f2/f1', a.f2overf1, (f2overf1) => ({ ...a, f2overf1 }), { placeholder: '—' })]];
    case 'sp':
      return [[...sweepFields(a.sweep, (sweep) => ({ ...a, sweep })), { kind: 'check', label: t('Noise'), value: a.noise, set: (noise) => ({ ...a, noise }) }]];
  }
}

/** Estado de la simulación elegida: sin correr, corriendo, lista o con error */
export type SimState = 'idle' | 'running' | 'ok' | 'err';

const STATE_TEXT: Record<SimState, string> = { idle: t('Not run'), running: t('Simulating…'), ok: t('Done'), err: 'Error' };

export function SimBar({ sim, info, state, stateDetail, stale, running, picker, onApply, onRun }: {
  /** la simulación elegida (sin ninguna, la barra queda vacía hasta elegir un tipo) */
  sim?: {
    name: string;
    /** el nombre lo puso el usuario (si no, es el automático) */
    custom: boolean;
    /** su comando de análisis */
    line: string;
  };
  info: CircuitInfo;
  state: SimState;
  /** detalle del estado (tiempo, avance o mensaje de error), en el tooltip */
  stateDetail?: string;
  /** se simuló pero sus resultados ya no están en memoria */
  stale: boolean;
  running: boolean;
  /** elegir una red o una fuente haciendo click en el esquemático */
  picker: Picker;
  onApply(line: string): void;
  onRun(): void;
}) {
  const line = sim?.line ?? '';
  const [draft, setDraft] = useState(() => parseAnalysis(line));
  // la línea que la barra acaba de aplicar: vuelve un render después (la lista sigue al
  // esquemático en un efecto) y no debe pisar lo que ya se está escribiendo en otro campo
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (line !== applied.current) setDraft(parseAnalysis(line));
    applied.current = null;
  }, [line]);
  const errors = draft ? validateAnalysis(draft) : [];
  const apply = (a: Analysis | null = draft) => {
    if (!a) return;
    const next = formatAnalysis(a);
    if (next !== line && !validateAnalysis(a).length) {
      applied.current = next;
      onApply(next);
    }
  };
  const change = (a: Analysis) => (setDraft(a), apply(a));
  const rows = sim && draft ? barRows(draft) : [];

  // el indicador de estado vive bajo el widget del usuario (#213)
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById('sim-state-slot')), []);
  const stateEl = sim && (
    <span
      className={`status sim-state ${state}`}
      role="status"
      aria-label={t('Simulation: {p0}', { p0: STATE_TEXT[state].toLowerCase() })}
      title={stateDetail ? `${STATE_TEXT[state]}: ${stateDetail}` : STATE_TEXT[state]}
    />
  );

  return (
    <div className="simbar" role="group" aria-label={t('Selected simulation')}>
      <datalist id="bar-nets">{info.nets.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="bar-sources">{info.sources.map((n) => <option key={n} value={n} />)}</datalist>
      {!sim ? (
        <span className="sb-hint">{t('Select simulation type')}</span>
      ) : null}
      {sim && (
        <div className="sb-rows">
          {!draft && <code className="sb-line">{line}</code>}
          {draft && !rows.length && <span className="sb-hint">{t('No parameters')}</span>}
          {rows.map((r, i) => (
            <div className="sb-row" key={i}>
              {r.map((f) =>
                f.kind === 'checks' ? (
                  <div key={f.label} className="sb-checks">
                    {f.checks.map((c) => (
                      <label key={c.label} className="sb-check" title={c.title}>
                        <input type="checkbox" checked={c.value} onChange={(e) => change(c.set(e.target.checked))} /> {c.label}
                      </label>
                    ))}
                  </div>
                ) : f.kind === 'check' ? (
                  <label key={f.label} className="sb-check" title={f.title}>
                    <input type="checkbox" checked={f.value} onChange={(e) => change(f.set(e.target.checked))} /> {f.label}
                  </label>
                ) : f.kind === 'select' ? (
                  <label key={f.label} className="sb-field">
                    <span>{f.label}</span>
                    <select value={f.value} aria-label={f.label} onChange={(e) => change(f.set(e.target.value))}>
                      {f.options.map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label key={f.label} className="sb-field">
                    <span>{f.label}</span>
                    <input
                      value={f.value}
                      aria-label={f.label}
                      placeholder={f.placeholder}
                      spellCheck={false}
                      size={f.width ?? 7}
                      list={f.list && `bar-${f.list}`}
                      onChange={(e) => setDraft(f.set(e.target.value.trim()))}
                      onBlur={() => apply()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') apply();
                        if (e.key === 'Escape') setDraft(parseAnalysis(line));
                      }}
                    />
                    {/* como en el menú completo: elegir la red o la fuente en el esquemático */}
                    {f.list && (
                      <button
                        type="button"
                        className="pick-btn"
                        title={f.list === 'nets' ? t('Pick the net on the schematic') : t('Pick the source on the schematic')}
                        aria-label={t('Pick {label} on the schematic', { label: f.label })}
                        disabled={f.list === 'nets' && !info.nets.length}
                        onClick={(e) => {
                          e.preventDefault();
                          picker(f.list === 'nets' ? 'net' : 'source').then((v) => v && change(f.set(v)));
                        }}
                      >
                        ⌖
                      </button>
                    )}
                  </label>
                ),
              )}
            </div>
          ))}
        </div>
      )}
      {slot && stateEl && createPortal(stateEl, slot)}
      {sim && errors.length > 0 && <span className="sb-hint warn">{errors[0]}</span>}
      {sim && stale && !running && (
        <button className="sb-run" onClick={onRun} title={t('Its results are no longer in memory (those of the last simulations viewed are kept)')}>
          {t('Run again')}
        </button>
      )}
    </div>
  );
}
