// Barra de la simulación elegida (#39), al lado de Simular: su nombre (click para renombrarla),
// los parámetros del análisis en una o dos líneas (el Barrido DC usa la segunda para la otra
// fuente; las redes y fuentes se pueden elegir en el esquemático), un cuadrado con su estado
// (sin correr, corriendo, lista) y una × para borrarla. Los cambios se aplican al salir del
// campo o con Enter y reemplazan el comando del esquemático. En una Complex simulation (#241) no
// hay campos: un ícono muestra el bloque .control al pasar el mouse y abre el Studio con un clic.
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { formatAnalysis, isNum, parseAnalysis, validateAnalysis, type Analysis, type StbMethod, type StbMode, type Sweep } from '../sim/analyses.ts';
import type { CircuitInfo, Picker } from './simDialogs.tsx';
import { t } from '../i18n/i18n.ts';
import { Icon } from '../ui/icons.tsx';

type BarField =
  | { kind: 'text'; label: string; value: string; set(v: string): Analysis; list?: 'nets' | 'sources' | 'probes'; placeholder?: string; width?: number; required?: boolean; numeric?: boolean; notGround?: boolean }
  | { kind: 'select'; label: string; value: string; options: [string, string][]; set(v: string): Analysis }
  | { kind: 'check'; label: string; value: boolean; set(v: boolean): Analysis; title?: string }
  /** casillas una debajo de la otra */
  | { kind: 'checks'; label: string; checks: Extract<BarField, { kind: 'check' }>[]; /** una al lado de la otra (si no, apiladas) */ inline?: boolean };

const UIC_TITLE =
  t('UIC (use initial conditions): doesn\'t compute the operating point. It starts with everything at 0 except the initial conditions (IC= on capacitors and inductors, .ic); sources are already at their value from t=0.');
const STARTUP_TITLE =
  t('startup (from LTspice): computes the operating point with the schematic\'s DC sources at 0 and brings them to their value in a 20 µs ramp. SINE, PULSE, PWL… sources and those inside subcircuits don\'t change. Useful to see sources, oscillators and PLLs starting up.');

const POINTS: Record<Sweep['type'], string> = { dec: t('Points/decade'), oct: t('Points/octave'), lin: t('Points') };

/** Barrido en frecuencia: inicio, fin, puntos y tipo de barrido */
const sweepFields = (s: Sweep, set: (s: Sweep) => Analysis): BarField[] => [
  { kind: 'text', label: t('F start'), value: s.start, set: (start) => set({ ...s, start }), required: true, numeric: true },
  { kind: 'text', label: t('F stop'), value: s.stop, set: (stop) => set({ ...s, stop }), required: true, numeric: true },
  { kind: 'text', label: POINTS[s.type], value: s.points, set: (points) => set({ ...s, points }), width: 5, required: true, numeric: true },
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

/** Qué le falta a un campo (se marca en rojo; el texto queda como ayuda al pasar el mouse) */
const fieldProblem = (f: Extract<BarField, { kind: 'text' }>): string | undefined =>
  f.required && !f.value.trim()
    ? t('{what} is missing', { what: f.label })
    : f.notGround && f.value.trim() === '0'
      ? t('{what} can\'t be ground (0): choose a node', { what: f.label })
    : f.numeric && f.value.trim() && !isNum(f.value)
      ? t('{what}: "{v}" isn\'t a number', { what: f.label, v: f.value })
      : undefined;

/** Campos de la barra por línea */
function barRows(a: Analysis, info: CircuitInfo): BarField[][] {
  const text = (label: string, value: string, set: (v: string) => Analysis, o: Partial<Extract<BarField, { kind: 'text' }>> = {}): BarField => ({ kind: 'text', label, value, set, ...o });
  switch (a.kind) {
    case 'tran':
      return [
        [
          text(t('Stop time'), a.tstop, (tstop) => ({ ...a, tstop }), { required: true, numeric: true }),
          text(t('Save from'), a.tstart, (tstart) => ({ ...a, tstart }), { placeholder: '0', numeric: true }),
          text(t('Maximum step'), a.tmax, (tmax) => ({ ...a, tmax }), { placeholder: 'auto', numeric: true }),
          {
            kind: 'checks',
            label: t('options'),
            inline: true,
            checks: [
              { kind: 'check', label: 'UIC', value: a.uic, set: (uic) => ({ ...a, uic }), title: UIC_TITLE },
              { kind: 'check', label: '.startup', value: a.startup, set: (startup) => ({ ...a, startup }), title: STARTUP_TITLE },
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
          text(t('Source {n}', { n }), s.src, (src) => upd({ src }), { list: 'sources', placeholder: i ? t('optional') : '', width: 6, required: !i }),
          // la segunda fuente sólo pide sus valores si tiene nombre
          text(t('Start {n}', { n }), s.start, (start) => upd({ start }), { required: !i || !!s.src, numeric: true }),
          text(t('Stop {n}', { n }), s.stop, (stop) => upd({ stop }), { required: !i || !!s.src, numeric: true }),
          text(t('Increment {n}', { n }), s.step, (step) => upd({ step }), { required: !i || !!s.src, numeric: true }),
        ];
      });
    case 'noise': {
      // en columnas (ver COLUMNS): fuente; salida y referencia; F start y F stop; barrido y puntos
      const [fstart, fstop, points, sweep] = sweepFields(a.sweep, (sw) => ({ ...a, sweep: sw }));
      return [
        [text(t('Source'), a.src, (src) => ({ ...a, src }), { list: 'sources', required: true })],
        [
          text(t('Output'), a.out, (out) => ({ ...a, out }), { list: 'nets', required: true }),
          text(t('Reference'), a.ref, (ref) => ({ ...a, ref }), { list: 'nets', placeholder: t('ground') }),
        ],
        [fstart, fstop],
        [sweep, points],
      ];
    }
    case 'op':
      return [];
    case 'tf':
      return [[text(t('Output'), a.out, (out) => ({ ...a, out }), { list: 'nets', required: true }), text(t('Source'), a.src, (src) => ({ ...a, src }), { list: 'sources', required: true })]];
    case 'sens':
      return [
        [text(t('Output'), a.out, (out) => ({ ...a, out }), { list: 'nets', required: true }), { kind: 'check', label: t('In AC'), value: a.ac, set: (ac) => ({ ...a, ac }) }],
        ...(a.ac ? [sweepFields(a.sweep, (sweep) => ({ ...a, sweep }))] : []),
      ];
    case 'pz':
      return [
        // en columnas (ver COLUMNS): entrada + y −, salida + y −, transferencia y qué calcular
        [
          text(t('Input +'), a.inP, (inP) => ({ ...a, inP }), { list: 'nets', required: true, notGround: true }),
          text(t('Input −'), a.inN, (inN) => ({ ...a, inN }), { list: 'nets', required: true }),
        ],
        [
          text(t('Output +'), a.outP, (outP) => ({ ...a, outP }), { list: 'nets', required: true, notGround: true }),
          text(t('Output −'), a.outN, (outN) => ({ ...a, outN }), { list: 'nets', required: true }),
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
    case 'stb':
      return [
        [
          // la sonda diferencial lleva modo DM/CM; la simple, ninguno (como en el diálogo)
          text(t('Loop probe'), a.probe, (probe) => {
            const d = info.probes?.find((p) => p.name.toLowerCase() === probe.toLowerCase())?.diff;
            return { ...a, probe, mode: d === undefined ? a.mode : d ? a.mode || 'dm' : '' };
          }, { list: 'probes', required: true, width: 6 }),
          { kind: 'select', label: t('Method'), value: a.method, options: [['tian', 'Tian'], ['gft', 'GFT']], set: (method) => ({ ...a, method: method as StbMethod }) },
          ...(a.mode ? [{ kind: 'select', label: t('Mode'), value: a.mode, options: [['dm', 'DM'], ['cm', 'CM']], set: (mode: string) => ({ ...a, mode: mode as StbMode }) } as BarField] : []),
        ],
        ...(a.method === 'gft'
          ? [
              [
                text(t('Input source'), a.input, (input) => ({ ...a, input }), { list: 'sources', placeholder: t('optional'), width: 6 }),
                text(t('Output'), a.output, (output) => ({ ...a, output }), { list: 'nets', placeholder: t('optional'), width: 6, notGround: true }),
              ],
            ]
          : []),
        sweepFields(a.sweep, (sweep) => ({ ...a, sweep })),
      ];
  }
}

/** Análisis cuyos grupos de campos van en columnas (uno debajo del otro) en vez de en filas */
const COLUMNS = new Set<Analysis['kind']>(['pz', 'noise']);

/** Estado de la simulación elegida: sin correr, corriendo, lista o con error */
export type SimState = 'idle' | 'running' | 'ok' | 'err';

const STATE_TEXT: Record<SimState, string> = { idle: t('Not run'), running: t('Simulating…'), ok: t('Done'), err: 'Error' };

export function SimBar({ sim, info, state, stateDetail, stale, running, picker, onPickCancel, control, pdk, onAllCorners, onStudio, onApply, onRun }: {
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
  /** deja de elegir en el esquemático (el foco pasó a otro control) */
  onPickCancel?(): void;
  /** texto del bloque .control si la simulación es Complex (#241) */
  control?: string;
  /**
   * El circuito usa un PDK (docs/pdk.md): su esquina se elige acá. `fixed`: la fija una directiva
   * .lib del esquemático (el texto de la directiva, para el tooltip).
   */
  pdk?: { name: string; corner: string; corners: readonly string[]; fixed?: string; onChange(corner: string): void };
  /** crear un testbench por esquina del PDK */
  onAllCorners?(): void;
  /** abrir el Studio */
  onStudio(): void;
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
  const apply = (a: Analysis | null = draft) => {
    if (!a) return;
    const next = formatAnalysis(a);
    // lo incompleto también se guarda (las cajas quedan en rojo y al correr se avisa qué falta), así
    // lo que se ve es lo que se simula; sólo no, si al volver a leer la línea los valores cambiarían
    // de caja (p. ej. a un barrido le falta el inicio y el fin pasaría a ser el inicio)
    const ok = !validateAnalysis(a).length || JSON.stringify(parseAnalysis(next)) === JSON.stringify(a);
    if (next !== line && ok) {
      applied.current = next;
      onApply(next);
    }
  };
  const change = (a: Analysis) => (setDraft(a), apply(a));
  // la tierra vale en los nodos de referencia (Input −, Output −, Reference), no en los +
  const pick = (f: Extract<BarField, { kind: 'text' }>) =>
    picker(f.list === 'nets' ? 'net' : f.list === 'probes' ? 'probe' : 'source', { ground: f.list === 'nets' && !f.notGround }).then((v) => v && change(f.set(v)));
  const rows = sim && draft && control === undefined ? barRows(draft, info) : [];
  /** columnas de la grilla con varias filas (0: sin grilla) */
  const gridCols = rows.length > 1 && !(draft && COLUMNS.has(draft.kind)) ? Math.max(...rows.map((r) => r.length)) : 0;

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
      {pdk && (
        <div
          className="sb-pdk"
          role="radiogroup"
          aria-label={t('{pdk} corner', { pdk: pdk.name })}
          title={pdk.fixed ? t('Set by the directive {line}', { line: pdk.fixed }) : t('Process corner of the {pdk} models: typical, fast or slow NMOS and PMOS (first letter NMOS, second PMOS)', { pdk: pdk.name })}
        >
          <span className="chip pdk-chip">{pdk.name}</span>
          {pdk.corners.map((c) => (
            <button
              type="button"
              key={c}
              role="radio"
              aria-checked={c === pdk.corner}
              className={c === pdk.corner ? 'active' : ''}
              disabled={!!pdk.fixed && c !== pdk.corner}
              onClick={() => pdk.onChange(c)}
            >
              {c}
            </button>
          ))}
          {onAllCorners && (
            <button type="button" className="sb-pdk-all" title={t('Create one testbench per corner from this one')} aria-label={t('Create one testbench per corner from this one')} onClick={onAllCorners}>
              {t('All')}
            </button>
          )}
        </div>
      )}
      <datalist id="bar-nets">{info.nets.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="bar-sources">{info.sources.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="bar-probes">{(info.probes ?? []).map((p) => <option key={p.name} value={p.name} />)}</datalist>
      {!sim ? (
        <span className="sb-hint">{t('Select simulation type')}</span>
      ) : null}
      {sim && control !== undefined && (
        <span className="sb-complex">
          <button type="button" className="sb-studio" onClick={onStudio} aria-label={t('Open the Studio')} title={t('Complex simulation: click to open the Studio')}>
            <Icon name="study" size={16} /> {t('Complex simulation')}
          </button>
          <pre className="sb-control-pop" role="tooltip">{control}</pre>
        </span>
      )}
      {sim && control === undefined && (
        // varias filas (DC, ruido…): en grilla, para que los cuadros queden alineados en columnas
        <div className={draft && COLUMNS.has(draft.kind) ? 'sb-rows sb-cols' : gridCols ? 'sb-rows sb-grid' : 'sb-rows'} style={gridCols ? { gridTemplateColumns: `repeat(${gridCols}, auto auto)` } : undefined}>
          {!draft && <code className="sb-line">{line}</code>}
          {draft && !rows.length && <span className="sb-hint">{draft.kind === 'op' ? t('Run and pick to inspect the nodes') : t('No parameters')}</span>}
          {rows.map((r, i) => (
            <div className="sb-row" key={i}>
              {r.map((f) =>
                f.kind === 'checks' ? (
                  <div key={f.label} className={`sb-checks${f.inline ? ' inline' : ''}`}>
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
                    <span className="sb-box">
                    <select value={f.value} aria-label={f.label} onChange={(e) => change(f.set(e.target.value))}>
                      {f.options.map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    </span>
                  </label>
                ) : (
                  <label key={f.label} className="sb-field">
                    <span>{f.label}</span>
                    <span className="sb-box">
                    <input
                      value={f.value}
                      aria-label={f.label}
                      className={fieldProblem(f) ? 'missing' : undefined}
                      title={fieldProblem(f)}
                      aria-invalid={!!fieldProblem(f) || undefined}
                      placeholder={f.placeholder}
                      spellCheck={false}
                      size={f.width ?? 7}
                      list={f.list && `bar-${f.list}`}
                      onChange={(e) => setDraft(f.set(e.target.value.trim()))}
                      // con el cursor en un campo de red o fuente se elige en el esquemático: un clic
                      // ahí completa el campo, y también se puede escribir
                      onFocus={() => f.list && pick(f)}
                      onBlur={(e) => {
                        apply();
                        // el foco se fue a otro control (al hacer clic en el esquemático no hay otro)
                        if (f.list && e.relatedTarget) onPickCancel?.();
                      }}
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
                        title={f.list === 'nets' ? t('Pick the net on the schematic') : f.list === 'probes' ? t('Pick the loop probe on the schematic') : t('Pick the source on the schematic')}
                        aria-label={t('Pick {label} on the schematic', { label: f.label })}
                        onClick={(e) => {
                          e.preventDefault();
                          pick(f);
                        }}
                      >
                        ⌖
                      </button>
                    )}
                    </span>
                  </label>
                ),
              )}
              {/* en la grilla, una fila más corta se completa para que la siguiente empiece abajo */}
              {gridCols > r.length && Array.from({ length: 2 * (gridCols - r.length) }, (_, k) => <span key={`pad${k}`} />)}
            </div>
          ))}
        </div>
      )}
      {slot && stateEl && createPortal(stateEl, slot)}
      {sim && stale && !running && (
        <button className="sb-run" onClick={onRun} title={t('Its results are no longer in memory (those of the last simulations viewed are kept)')}>
          {t('Run again')}
        </button>
      )}
    </div>
  );
}
