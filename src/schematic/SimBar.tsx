// Barra de la simulación elegida (#39), al lado de Simular: su nombre (click para renombrarla),
// los parámetros del análisis en una o dos líneas (el Barrido DC usa la segunda para la otra
// fuente; las redes y fuentes se pueden elegir en el esquemático), un cuadrado con su estado
// (sin correr, corriendo, lista) y una × para borrarla. Los cambios se aplican al salir del
// campo o con Enter y reemplazan el comando del esquemático.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/icons.tsx';
import { formatAnalysis, parseAnalysis, validateAnalysis, type Analysis, type Sweep } from '../sim/analyses.ts';
import type { CircuitInfo, Picker } from './simDialogs.tsx';

type BarField =
  | { kind: 'text'; label: string; value: string; set(v: string): Analysis; list?: 'nets' | 'sources'; placeholder?: string; width?: number }
  | { kind: 'select'; label: string; value: string; options: [string, string][]; set(v: string): Analysis }
  | { kind: 'check'; label: string; value: boolean; set(v: boolean): Analysis };

const POINTS: Record<Sweep['type'], string> = { dec: 'Puntos/década', oct: 'Puntos/octava', lin: 'Puntos' };

/** Barrido en frecuencia: inicio, fin, puntos y tipo de barrido */
const sweepFields = (s: Sweep, set: (s: Sweep) => Analysis): BarField[] => [
  { kind: 'text', label: 'F inicio', value: s.start, set: (start) => set({ ...s, start }) },
  { kind: 'text', label: 'F fin', value: s.stop, set: (stop) => set({ ...s, stop }) },
  { kind: 'text', label: POINTS[s.type], value: s.points, set: (points) => set({ ...s, points }), width: 5 },
  {
    kind: 'select',
    label: 'Barrido',
    value: s.type,
    options: [
      ['dec', 'por década'],
      ['oct', 'por octava'],
      ['lin', 'lineal'],
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
          text('Tiempo final', a.tstop, (tstop) => ({ ...a, tstop })),
          text('Guardar desde', a.tstart, (tstart) => ({ ...a, tstart }), { placeholder: '0' }),
          text('Paso máximo', a.tmax, (tmax) => ({ ...a, tmax }), { placeholder: 'auto' }),
          { kind: 'check', label: 'UIC', value: a.uic, set: (uic) => ({ ...a, uic }) },
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
          text(`Fuente ${n}`, s.src, (src) => upd({ src }), { list: 'sources', placeholder: i ? 'opcional' : '', width: 6 }),
          text(`Inicio ${n}`, s.start, (start) => upd({ start })),
          text(`Fin ${n}`, s.stop, (stop) => upd({ stop })),
          text(`Incremento ${n}`, s.step, (step) => upd({ step })),
        ];
      });
    case 'noise':
      return [
        [
          text('Salida', a.out, (out) => ({ ...a, out }), { list: 'nets' }),
          text('Referencia', a.ref, (ref) => ({ ...a, ref }), { list: 'nets', placeholder: 'tierra' }),
          text('Fuente', a.src, (src) => ({ ...a, src }), { list: 'sources' }),
        ],
        sweepFields(a.sweep, (sweep) => ({ ...a, sweep })),
      ];
    case 'op':
      return [];
    case 'tf':
      return [[text('Salida', a.out, (out) => ({ ...a, out }), { list: 'nets' }), text('Fuente', a.src, (src) => ({ ...a, src }), { list: 'sources' })]];
    case 'sens':
      return [
        [text('Salida', a.out, (out) => ({ ...a, out }), { list: 'nets' }), { kind: 'check', label: 'En AC', value: a.ac, set: (ac) => ({ ...a, ac }) }],
        ...(a.ac ? [sweepFields(a.sweep, (sweep) => ({ ...a, sweep }))] : []),
      ];
    case 'pz':
      return [
        [
          text('Entrada +', a.inP, (inP) => ({ ...a, inP }), { list: 'nets' }),
          text('Entrada −', a.inN, (inN) => ({ ...a, inN }), { list: 'nets' }),
          text('Salida +', a.outP, (outP) => ({ ...a, outP }), { list: 'nets' }),
          text('Salida −', a.outN, (outN) => ({ ...a, outN }), { list: 'nets' }),
        ],
        [
          { kind: 'select', label: 'Transferencia', value: a.type, options: [['vol', 'V/V'], ['cur', 'V/I']], set: (type) => ({ ...a, type: type as 'vol' }) },
          { kind: 'select', label: 'Calcular', value: a.which, options: [['pz', 'polos y ceros'], ['pol', 'polos'], ['zer', 'ceros']], set: (which) => ({ ...a, which: which as 'pz' }) },
        ],
      ];
    case 'disto':
      return [[...sweepFields(a.sweep, (sweep) => ({ ...a, sweep })), text('f2/f1', a.f2overf1, (f2overf1) => ({ ...a, f2overf1 }), { placeholder: '—' })]];
    case 'sp':
      return [[...sweepFields(a.sweep, (sweep) => ({ ...a, sweep })), { kind: 'check', label: 'Ruido', value: a.noise, set: (noise) => ({ ...a, noise }) }]];
  }
}

/** Estado de la simulación elegida: sin correr, corriendo, lista o con error */
export type SimState = 'idle' | 'running' | 'ok' | 'err';

const STATE_TEXT: Record<SimState, string> = { idle: 'Sin correr', running: 'Simulando…', ok: 'Lista', err: 'Error' };

export function SimBar({ sim, info, state, stateDetail, stale, running, picker, onApply, onRun, onRename, onDelete }: {
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
  /** nombre propio; vacío vuelve al automático */
  onRename(name: string): void;
  onDelete(): void;
}) {
  const line = sim?.line ?? '';
  const [draft, setDraft] = useState(() => parseAnalysis(line));
  // nombre en edición (null: no se está renombrando)
  const [naming, setNaming] = useState<string | null>(null);
  const endNaming = (ok: boolean) => {
    if (ok && sim && naming !== null && naming.trim() !== (sim.custom ? sim.name : '')) onRename(naming);
    setNaming(null);
  };
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

  return (
    <div className="simbar" role="group" aria-label="Simulación elegida">
      <datalist id="bar-nets">{info.nets.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="bar-sources">{info.sources.map((n) => <option key={n} value={n} />)}</datalist>
      {!sim ? (
        <span className="sb-hint">Seleccionar tipo de simulación</span>
      ) : naming !== null ? (
        <input
          className="sb-name-edit"
          aria-label="Nombre de la simulación"
          value={naming}
          placeholder={sim.name}
          size={Math.max(12, naming.length + 1)}
          autoFocus
          onChange={(e) => setNaming(e.target.value)}
          onBlur={() => endNaming(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') endNaming(true);
            if (e.key === 'Escape') endNaming(false);
          }}
        />
      ) : (
        <button className="sb-name" title={`${line}\nClick para renombrarla (vacío: nombre automático)`} onClick={() => setNaming(sim.custom ? sim.name : '')}>
          {sim.name}
        </button>
      )}
      {sim && (
        <div className="sb-rows">
          {!draft && <code className="sb-line">{line}</code>}
          {draft && !rows.length && <span className="sb-hint">Sin parámetros</span>}
          {rows.map((r, i) => (
            <div className="sb-row" key={i}>
              {r.map((f) =>
                f.kind === 'check' ? (
                  <label key={f.label} className="sb-check">
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
                        title={f.list === 'nets' ? 'Elegir la red en el esquemático' : 'Elegir la fuente en el esquemático'}
                        aria-label={`Elegir ${f.label} en el esquemático`}
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
      {sim && (
        <span
          className={`status sim-state ${state}`}
          role="status"
          aria-label={`Simulación: ${STATE_TEXT[state].toLowerCase()}`}
          title={stateDetail ? `${STATE_TEXT[state]}: ${stateDetail}` : STATE_TEXT[state]}
        />
      )}
      {sim && errors.length > 0 && <span className="sb-hint warn">{errors[0]}</span>}
      {sim && (
        <button className="sb-delete" aria-label="Borrar simulación" title="Borrar esta simulación (y sus resultados)" onClick={onDelete}>
          <Icon name="delete" size={16} />
        </button>
      )}
      {sim && stale && !running && (
        <button className="sb-run" onClick={onRun} title="Sus resultados ya no están en memoria (se conservan los de las últimas simulaciones vistas)">
          Volver a correr
        </button>
      )}
    </div>
  );
}
