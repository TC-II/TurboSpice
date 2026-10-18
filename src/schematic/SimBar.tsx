// Barra de la simulación elegida (#39): su nombre y los parámetros del análisis en una o dos
// líneas (el Barrido DC usa la segunda para la otra fuente). Los cambios se aplican al salir
// del campo o con Enter y reemplazan el comando del esquemático.
import { useEffect, useState } from 'react';
import { formatAnalysis, parseAnalysis, validateAnalysis, type Analysis, type Sweep } from '../sim/analyses.ts';
import type { CircuitInfo } from './simDialogs.tsx';

type BarField =
  | { kind: 'text'; label: string; value: string; set(v: string): Analysis; list?: 'nets' | 'sources'; placeholder?: string; width?: number }
  | { kind: 'select'; label: string; value: string; options: [string, string][]; set(v: string): Analysis }
  | { kind: 'check'; label: string; value: boolean; set(v: boolean): Analysis };

const sweepFields = (s: Sweep, set: (s: Sweep) => Analysis): BarField[] => [
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
  { kind: 'text', label: 'Puntos', value: s.points, set: (points) => set({ ...s, points }), width: 5 },
  { kind: 'text', label: 'Inicio', value: s.start, set: (start) => set({ ...s, start }) },
  { kind: 'text', label: 'Fin', value: s.stop, set: (stop) => set({ ...s, stop }) },
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

export function SimBar({ name, line, info, stale, running, onApply, onRun, onEdit }: {
  /** nombre de la simulación elegida */
  name: string;
  /** su comando de análisis */
  line: string;
  info: CircuitInfo;
  /** se simuló pero sus resultados ya no están en memoria */
  stale: boolean;
  running: boolean;
  onApply(line: string): void;
  onRun(): void;
  /** abrir el diálogo completo del comando */
  onEdit(): void;
}) {
  const [draft, setDraft] = useState(() => parseAnalysis(line));
  useEffect(() => setDraft(parseAnalysis(line)), [line]);
  const errors = draft ? validateAnalysis(draft) : [];
  const apply = (a: Analysis | null = draft) => {
    if (!a) return;
    const next = formatAnalysis(a);
    if (next !== line && !validateAnalysis(a).length) onApply(next);
  };
  const rows = draft ? barRows(draft) : [];

  return (
    <div className="simbar" role="group" aria-label="Simulación elegida">
      <datalist id="bar-nets">{info.nets.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="bar-sources">{info.sources.map((n) => <option key={n} value={n} />)}</datalist>
      <span className="sb-name" title={`${line}\nEn el menú Simular se elige otra simulación, se crea una nueva o se duplica ésta.`}>
        {name}
      </span>
      <div className="sb-rows">
        {!draft && <code className="sb-line">{line}</code>}
        {draft && !rows.length && <span className="sb-hint">Sin parámetros</span>}
        {rows.map((r, i) => (
          <div className="sb-row" key={i}>
            {r.map((f) =>
              f.kind === 'check' ? (
                <label key={f.label} className="sb-check">
                  <input type="checkbox" checked={f.value} onChange={(e) => (setDraft(f.set(e.target.checked)), apply(f.set(e.target.checked)))} /> {f.label}
                </label>
              ) : f.kind === 'select' ? (
                <label key={f.label} className="sb-field">
                  <span>{f.label}</span>
                  <select value={f.value} aria-label={f.label} onChange={(e) => (setDraft(f.set(e.target.value)), apply(f.set(e.target.value)))}>
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
                </label>
              ),
            )}
          </div>
        ))}
      </div>
      {errors.length > 0 && <span className="sb-hint warn">{errors[0]}</span>}
      <button className="sb-edit" onClick={onEdit} title="Todas las opciones del comando de análisis (A)">
        Más opciones…
      </button>
      {stale && !running && (
        <button className="sb-run" onClick={onRun} title="Sus resultados ya no están en memoria (se conservan los de las últimas simulaciones vistas)">
          Volver a correr
        </button>
      )}
    </div>
  );
}
