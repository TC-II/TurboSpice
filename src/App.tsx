// UI provisional de la fase 1: netlist → simular → ver resultados.
// El editor de esquemáticos (fase 2) reemplaza al textarea.
import { useEffect, useMemo, useRef, useState } from 'react';
import { EngineClient } from './engine/client.ts';
import type { SimPlot, SimResult } from './engine/ngspice.ts';
import { EXAMPLES } from './examples.ts';
import { Plot } from './waveform/Plot.tsx';
import { displayName, scaleOf, si, type ComplexView } from './waveform/series.ts';

type Status =
  | { kind: 'loading' }
  | { kind: 'idle' }
  | { kind: 'running'; percent: number; text: string }
  | { kind: 'done'; ms: number }
  | { kind: 'error'; message: string };

const FIRST = Object.keys(EXAMPLES)[0];

export function App() {
  const engine = useRef<EngineClient | null>(null);
  const [netlist, setNetlist] = useState(EXAMPLES[FIRST]);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [result, setResult] = useState<SimResult | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [plotName, setPlotName] = useState<string>('');
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [view, setView] = useState<ComplexView>('db');

  useEffect(() => {
    const e = new EngineClient();
    engine.current = e;
    e.onStatus = (text, percent) => setStatus({ kind: 'running', percent, text });
    e.ready.then(
      () => setStatus({ kind: 'idle' }),
      (err: Error) => setStatus({ kind: 'error', message: err.message }),
    );
    return () => e.abort();
  }, []);

  const simulate = async () => {
    const e = engine.current;
    if (!e) return;
    setStatus({ kind: 'running', percent: 0, text: '' });
    try {
      const { result, ms } = await e.simulate(netlist);
      setResult(result);
      setLog(result.log);
      // el último plot con eje X (p.ej. noise1 = espectro, no noise2 = totales)
      const withScale = result.plots.filter((p) => scaleOf(p));
      const shown = withScale[withScale.length - 1] ?? result.plots[result.plots.length - 1];
      setPlotName(shown?.name ?? '');
      setSelected({});
      setStatus(
        result.errors.length && !result.plots.length
          ? { kind: 'error', message: result.errors[0] }
          : { kind: 'done', ms },
      );
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message });
    }
  };

  const abort = () => {
    engine.current?.abort();
    engine.current!.ready.then(() => setStatus({ kind: 'idle' }));
    setStatus({ kind: 'error', message: 'Simulación abortada' });
  };

  const plot: SimPlot | undefined = result?.plots.find((p) => p.name === plotName);
  const scale = plot ? scaleOf(plot) : null;
  const traces = useMemo(() => (plot ? plot.vectors.filter((v) => v !== scale) : []), [plot, scale]);
  const chosen = useMemo(() => {
    if (!plot) return [];
    const names = selected[plot.name] ?? defaultTraces(traces.map((v) => v.name));
    return traces.filter((v) => names.includes(v.name));
  }, [plot, traces, selected]);
  const isComplex = traces.some((v) => v.imag);

  const toggle = (name: string) => {
    if (!plot) return;
    const cur = selected[plot.name] ?? chosen.map((v) => v.name);
    setSelected({
      ...selected,
      [plot.name]: cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name],
    });
  };

  const running = status.kind === 'running';

  return (
    <div className="app">
      <header>
        <h1>TurboSpice</h1>
        <select
          aria-label="Ejemplos"
          onChange={(e) => setNetlist(EXAMPLES[e.target.value])}
          defaultValue={FIRST}
        >
          {Object.keys(EXAMPLES).map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        {running ? (
          <button onClick={abort}>Abortar</button>
        ) : (
          <button className="primary" onClick={simulate} disabled={status.kind === 'loading'}>
            Simular
          </button>
        )}
        <StatusText status={status} />
      </header>

      <main>
        <section className="editor">
          <textarea
            spellCheck={false}
            value={netlist}
            onChange={(e) => setNetlist(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !running) simulate();
            }}
          />
          <pre className="log">{log.join('\n')}</pre>
        </section>

        <section className="results">
          {result && (
            <div className="toolbar">
              <select value={plotName} onChange={(e) => setPlotName(e.target.value)} aria-label="Plot">
                {result.plots.map((p) => (
                  <option key={p.name}>{p.name}</option>
                ))}
              </select>
              {isComplex && scale && (
                <select value={view} onChange={(e) => setView(e.target.value as ComplexView)} aria-label="Vista">
                  <option value="db">Magnitud (dB)</option>
                  <option value="phase">Fase (°)</option>
                  <option value="mag">Magnitud</option>
                  <option value="re">Real</option>
                  <option value="im">Imaginaria</option>
                </select>
              )}
            </div>
          )}
          {plot && scale && (
            <>
              <div className="traces">
                {traces.map((v) => (
                  <label key={v.name}>
                    <input type="checkbox" checked={chosen.includes(v)} onChange={() => toggle(v.name)} />
                    {displayName(v)}
                  </label>
                ))}
              </div>
              <Plot plot={plot} vectors={chosen} view={view} />
            </>
          )}
          {plot && !scale && <ScalarTable plot={plot} />}
          {!result && <p className="empty">Escribí o elegí una netlist y presioná Simular (Ctrl+Enter).</p>}
        </section>
      </main>
    </div>
  );
}

/** Por defecto mostramos tensiones de nodo (sin corrientes ni nodos internos). */
function defaultTraces(names: string[]): string[] {
  const nodes = names.filter((n) => !/#|[(@]/.test(n));
  return (nodes.length ? nodes : names).slice(0, 6);
}

function ScalarTable({ plot }: { plot: SimPlot }) {
  return (
    <table className="scalars">
      <tbody>
        {plot.vectors.map((v) => (
          <tr key={v.name}>
            <th>{displayName(v)}</th>
            <td>
              {Array.from(v.real, (re, i) =>
                v.imag ? `${si(re)} ${v.imag[i] < 0 ? '−' : '+'} j${si(Math.abs(v.imag[i]))}` : si(re),
              ).join(', ')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StatusText({ status }: { status: Status }) {
  switch (status.kind) {
    case 'loading':
      return <span className="status">Cargando motor…</span>;
    case 'idle':
      return <span className="status">Listo</span>;
    case 'running':
      return <span className="status">Simulando… {status.percent ? `${status.percent.toFixed(0)}%` : ''}</span>;
    case 'done':
      return <span className="status ok">Completado en {status.ms.toFixed(0)} ms</span>;
    case 'error':
      return <span className="status err">{status.message}</span>;
  }
}
