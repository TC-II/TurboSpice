// Modo netlist: escribir una netlist SPICE a mano → simular → ver resultados.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { EngineClient } from './engine/client.ts';
import type { SimPlot, SimResult } from './engine/ngspice.ts';
import { EXAMPLES } from './examples.ts';
import { Plot } from './waveform/Plot.tsx';
import { displayName, scaleOf, si, type ComplexView } from './waveform/series.ts';
import { t } from './i18n/i18n.ts';

export type Status =
  | { kind: 'loading' }
  | { kind: 'idle' }
  | { kind: 'running'; percent: number; text: string }
  | { kind: 'done'; ms: number }
  | { kind: 'error'; message: string };

const FIRST = Object.keys(EXAMPLES)[0];

export function NetlistMode({ engine }: { engine: EngineClient }) {
  const [netlist, setNetlist] = useState(EXAMPLES[FIRST]);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [result, setResult] = useState<SimResult | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [plotName, setPlotName] = useState<string>('');
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [view, setView] = useState<ComplexView>('db');

  useEffect(() => {
    engine.onStatus = (text, percent) => setStatus({ kind: 'running', percent, text });
    engine.ready.then(
      () => setStatus({ kind: 'idle' }),
      (err: Error) => setStatus({ kind: 'error', message: err.message }),
    );
  }, [engine]);

  const simulate = async () => {
    const e = engine;
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
    engine.abort();
    engine.ready.then(() => setStatus({ kind: 'idle' }));
    setStatus({ kind: 'error', message: t('Simulation aborted') });
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

  // Atajos de LTspice ([NetKeyBoardShortCut]); valen también escribiendo en la netlist
  const editor = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const goToLine = () => {
    const ta = editor.current;
    if (!ta) return;
    const n = Number(window.prompt(t('Go to line:')));
    if (!Number.isInteger(n) || n < 1) return;
    const lines = netlist.split('\n');
    const start = lines.slice(0, n - 1).reduce((s, l) => s + l.length + 1, 0);
    const end = start + (lines[n - 1]?.length ?? 0);
    ta.focus();
    ta.setSelectionRange(Math.min(start, netlist.length), Math.min(end, netlist.length));
    // llevar la línea a la vista
    ta.scrollTop = Math.max(0, (Math.min(n, lines.length) - 3) * (parseFloat(getComputedStyle(ta).lineHeight) || 16));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.altKey && k === 'r') {
        e.preventDefault();
        if (!running && status.kind !== 'loading') simulate();
      } else if (e.altKey && k === 's') {
        e.preventDefault();
        if (running) abort();
      } else if (ctrl && k === 'l') {
        e.preventDefault();
        logRef.current?.scrollIntoView({ block: 'nearest' });
        logRef.current?.focus();
      } else if (ctrl && k === 'g') {
        e.preventDefault();
        goToLine();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="netlist-mode">
      <header className="toolbar-row">
        <select
          aria-label={t('Examples')}
          onChange={(e) => setNetlist(EXAMPLES[e.target.value])}
          defaultValue={FIRST}
        >
          {Object.keys(EXAMPLES).map((k) => (
            <option key={k} value={k}>{t(k)}</option>
          ))}
        </select>
        {running ? (
          <button onClick={abort} title={t('Abort (Alt+S)')}>{t('Abort')}</button>
        ) : (
          <button className="primary" onClick={simulate} disabled={status.kind === 'loading'} title={t('Simulate (Alt+R / Ctrl+Enter)')}>
            {t('Simulate')}
          </button>
        )}
        <StatusText status={status} />
      </header>

      <main className="netlist-main">
        <section className="netlist-editor">
          <textarea
            ref={editor}
            spellCheck={false}
            value={netlist}
            onChange={(e) => setNetlist(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !running) simulate();
            }}
          />
          <pre className="log" ref={logRef} tabIndex={-1} title={t('ngspice log (Ctrl+L)')}>{log.join('\n')}</pre>
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
                <select value={view} onChange={(e) => setView(e.target.value as ComplexView)} aria-label={t('Display')}>
                  <option value="db">{t('Magnitude (dB)')}</option>
                  <option value="phase">{t('Phase (°)')}</option>
                  <option value="mag">{t('Magnitude')}</option>
                  <option value="re">Real</option>
                  <option value="im">{t('Imaginary')}</option>
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
          {!result && <p className="empty">{t('Write or pick a netlist and press Simulate (Alt+R or Ctrl+Enter). Ctrl+G: go to a line · Ctrl+L: log.')}</p>}
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

export function ScalarTable({ plot }: { plot: SimPlot }) {
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

export function StatusText({ status }: { status: Status }) {
  switch (status.kind) {
    case 'loading':
      return <span className="status">{t('Loading engine…')}</span>;
    case 'idle':
      return <span className="status">{t('Ready')}</span>;
    case 'running':
      return <span className="status">{t('Simulating…')}{' '}{status.percent ? `${status.percent.toFixed(0)}%` : ''}</span>;
    case 'done':
      return <span className="status ok">{t('Done in')}{' '}{status.ms.toFixed(0)} ms</span>;
    case 'error':
      return <span className="status err">{status.message}</span>;
  }
}
