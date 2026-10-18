// Visor de resultados: paneles apilados con eje X compartido, trazas como expresiones,
// Bode (magnitud y fase), cursores, medidas rápidas y exportación a CSV/PNG.
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { SimPlot } from '../engine/ngspice.ts';
import { paneCurves, type ComplexMode, type Curve, type PaneData } from './curves.ts';
import type { Resolver } from './expr.ts';
import { bandwidth3dB, stats, toCsv, valueAt } from './measure.ts';
import { si } from './series.ts';
import { sameExpr, traceColor, type Pane, type Trace } from './view.ts';
import { WINDOWS, type FftWindow } from './fft.ts';

export interface PlotPanelHandle {
  csv(): string;
  png(): Promise<Blob | null>;
}

interface Props {
  plot: SimPlot;
  runs: SimPlot[];
  labels: Map<string, string>;
  panes: Pane[];
  setPanes(p: Pane[]): void;
  resolver(p: SimPlot): Resolver;
  mode: ComplexMode;
  /** panel donde van las trazas nuevas (punta de prueba, expresiones) */
  active: number;
  setActive(i: number): void;
  /** traza bajo el mouse (para resaltar su red en el esquemático) */
  onHoverExpr?(expr: string | undefined): void;
  /** FFT de una traza del transitorio en el rango dado (crea un plot derivado) */
  onFft?(o: { expr: string; window: FftWindow; from?: number; to?: number }): void;
  handle?: Ref<PlotPanelHandle>;
}

type Range = [number, number];
interface Cursors {
  a?: number;
  b?: number;
}

const MAX_ROWS = 16;

/** Rango de un eje Y; uno fijo si no hay datos finitos o son constantes */
const safeRange: uPlot.Range.Function = (_u, min, max) => {
  if (min == null || max == null || !Number.isFinite(min) || !Number.isFinite(max)) return [-1, 1];
  if (min === max) return [min - (Math.abs(min) || 1) * 0.1, max + (Math.abs(max) || 1) * 0.1];
  return uPlot.rangeNum(min, max, 0.1, true);
};
const fmt = (v: number, unit = '') => (Number.isFinite(v) ? `${si(v, 4)}${unit}` : '—');

export function PlotPanel({ plot, runs, labels, panes, setPanes, resolver, mode, active, setActive, onHoverExpr, onFft, handle }: Props) {
  const [fftOpen, setFftOpen] = useState(false);
  const [fftExpr, setFftExpr] = useState('');
  const [fftWindow, setFftWindow] = useState<FftWindow>('hann');
  const [xRange, setXRange] = useState<Range | null>(null);
  const [cursorMode, setCursorMode] = useState(false);
  const [cursors, setCursors] = useState<Cursors>({});
  const [showStats, setShowStats] = useState(false);
  const [expr, setExpr] = useState('');
  const [exprError, setExprError] = useState<string>();
  const charts = useRef(new Map<number, uPlot>());

  const data = useMemo(
    () => panes.map((p) => paneCurves(p, { plot, runs, labels, resolver, mode })),
    [panes, plot, runs, labels, resolver, mode],
  );

  // Otro eje X (otro tipo de análisis): rango completo y sin cursores. Al volver a simular
  // el mismo análisis se conservan (#30)
  const axisKey = `${data[0]?.xName ?? ''}`;
  useEffect(() => {
    setXRange(null);
    setCursors({});
  }, [axisKey]);
  // último cursor tocado: lo mueven las flechas
  const [lastCursor, setLastCursor] = useState<'a' | 'b'>('a');
  useEffect(() => {
    if (!cursorMode) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const x = data[0]?.x;
      const v = cursors[lastCursor];
      if (!x || v === undefined) return;
      e.preventDefault();
      // un punto simulado (con Shift, diez)
      let k = 0;
      while (k < x.length - 1 && x[k] < v) k++;
      if (x[k] > v && k > 0 && e.key === 'ArrowRight') k--;
      const step = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1);
      setCursors((c) => ({ ...c, [lastCursor]: x[Math.min(x.length - 1, Math.max(0, k + step))] }));
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [cursorMode, cursors, lastCursor, data]);
  useEffect(() => {
    if (active >= panes.length) setActive(Math.max(0, panes.length - 1));
  }, [panes.length, active, setActive]);

  const update = (i: number, f: (p: Pane) => Pane) => setPanes(panes.map((p, k) => (k === i ? f(p) : p)));
  const addTrace = () => {
    const e = expr.trim();
    if (!e) return;
    const target = panes[active] ?? panes[0];
    if (target.traces.some((t) => sameExpr(t.expr, e))) return setExpr('');
    const test = paneCurves({ traces: [{ expr: e }] }, { plot, runs: [plot], labels, resolver, mode });
    if (test.errors.size) return setExprError(test.errors.get(0));
    setExprError(undefined);
    update(Math.min(active, panes.length - 1), (p) => ({ traces: [...p.traces, { expr: e }] }));
    setExpr('');
  };
  const moveTrace = (from: number, ti: number, to: number) => {
    if (from === to) return;
    const t = panes[from].traces[ti];
    setPanes(panes.map((p, k) => (k === from ? { traces: p.traces.filter((_, j) => j !== ti) } : k === to ? { traces: [...p.traces, t] } : p)));
  };

  useImperativeHandle(handle, () => ({
    csv: () => {
      const d = data[0];
      if (!d) return '';
      const cols = data.flatMap((pd) => pd.curves.filter((c) => !c.hidden).map((c) => ({ name: c.label, ys: c.y })));
      return toCsv(d.xName, d.x, cols);
    },
    png: () => exportPng(panes, data, charts.current),
  }));

  const range: Range | null = xRange;
  const allVisible = data.flatMap((d) => d.curves.filter((c) => !c.hidden));

  return (
    <div className="plot-panel">
      <div className="plot-tools">
        <form
          className="expr-form"
          onSubmit={(e) => {
            e.preventDefault();
            addTrace();
          }}
        >
          <input
            value={expr}
            spellCheck={false}
            placeholder="Agregar traza: V(out)/V(in), I(R1)*V(n1), d(V(c))…"
            aria-label="Expresión"
            onChange={(e) => {
              setExpr(e.target.value);
              setExprError(undefined);
            }}
          />
          <button type="submit">Agregar</button>
        </form>
        <button onClick={() => setPanes([...panes, { traces: [] }])} title="Agregar un panel (las trazas nuevas van al panel activo)">+ Panel</button>
        <button className={cursorMode ? 'active' : ''} onClick={() => setCursorMode((v) => !v)} title="Cursores: click = cursor A, Shift+click o click derecho = cursor B">
          Cursores
        </button>
        <button className={showStats ? 'active' : ''} onClick={() => setShowStats((v) => !v)} title="Máximo, mínimo, pico a pico, promedio, eficaz y frecuencia en el rango visible">
          Medidas
        </button>
        <button onClick={() => setXRange(null)} title="Ver todo el eje X (doble click en el gráfico)">Ajustar</button>
        {onFft && data[0]?.xName === 'time' && (
          <button className={fftOpen ? 'active' : ''} onClick={() => setFftOpen((v) => !v)} title="Espectro (FFT) y distorsión armónica de una traza">
            FFT…
          </button>
        )}
        {exprError && <span className="hint warn">{exprError}</span>}
      </div>
      {fftOpen && onFft && (
        <div className="plot-tools fft-tools">
          <select value={fftExpr} aria-label="Traza para la FFT" onChange={(e) => setFftExpr(e.target.value)}>
            <option value="">Traza…</option>
            {[...new Set(panes.flatMap((p) => p.traces.map((t) => t.expr)))].map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          <select value={fftWindow} aria-label="Ventana" onChange={(e) => setFftWindow(e.target.value as FftWindow)}>
            {WINDOWS.map(([w, l]) => (
              <option key={w} value={w}>Ventana {l}</option>
            ))}
          </select>
          <span className="hint">{range ? `Rango visible: ${si(range[0])}s … ${si(range[1])}s` : 'Todo el transitorio (hacé zoom para elegir un rango, p.ej. sin el arranque)'}</span>
          <button
            className="primary"
            disabled={!fftExpr}
            onClick={() => {
              onFft({ expr: fftExpr, window: fftWindow, from: range?.[0], to: range?.[1] });
              setFftOpen(false);
            }}
          >
            Calcular
          </button>
        </div>
      )}
      {plot.info && <p className="hint plot-info">{plot.info}</p>}
      <div className="panes">
        {panes.map((p, i) => (
          <PaneView
            key={i}
            index={i}
            pane={p}
            data={data[i]}
            active={i === active && panes.length > 1}
            onActivate={() => setActive(i)}
            canRemove={panes.length > 1}
            onRemove={() => setPanes(panes.filter((_, k) => k !== i))}
            onChange={(f) => update(i, f)}
            onDropTrace={(from, ti) => moveTrace(from, ti, i)}
            xRange={range}
            onZoom={setXRange}
            cursorMode={cursorMode}
            cursors={cursors}
            onCursor={(c) => {
              setCursors((old) => ({ ...old, ...c }));
              setLastCursor(c.a !== undefined ? 'a' : 'b');
            }}
            onHoverExpr={onHoverExpr}
            register={(u) => (u ? charts.current.set(i, u) : charts.current.delete(i))}
          />
        ))}
      </div>
      {(cursorMode || (showStats && allVisible.length > 0)) && (
        <div className="readouts">
          {cursorMode && (cursors.a !== undefined || cursors.b !== undefined) && (
            <>
              <div className="cursor-tools">
                <button onClick={() => setCursors((c) => ({ ...c, a: undefined }))} disabled={cursors.a === undefined}>Borrar A</button>
                <button onClick={() => setCursors((c) => ({ ...c, b: undefined }))} disabled={cursors.b === undefined}>Borrar B</button>
                <button onClick={() => setCursors((c) => ({ a: c.b, b: c.a }))}>Intercambiar A y B</button>
                <span className="hint">Arrastrá las líneas para moverlos; ←/→ mueven el último un punto (Shift: diez).</span>
              </div>
              <CursorTable data={data} cursors={cursors} />
            </>
          )}
          {cursorMode && cursors.a === undefined && cursors.b === undefined && (
            <p className="hint pad-x">Click en el gráfico para ubicar el cursor A; Shift+click o click derecho para el B.</p>
          )}
          {showStats && allVisible.length > 0 && <StatsTable data={data} range={range} />}
        </div>
      )}
    </div>
  );
}

function PaneView(props: {
  index: number;
  pane: Pane;
  data: PaneData;
  active: boolean;
  onActivate(): void;
  canRemove: boolean;
  onRemove(): void;
  onChange(f: (p: Pane) => Pane): void;
  onDropTrace(fromPane: number, trace: number): void;
  xRange: Range | null;
  onZoom(r: Range | null): void;
  cursorMode: boolean;
  cursors: Cursors;
  onCursor(c: Cursors): void;
  onHoverExpr?(e: string | undefined): void;
  register(u: uPlot | null): void;
}) {
  const { index, pane, data, xRange, onZoom, cursorMode, cursors, onCursor } = props;
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<uPlot | null>(null);
  const cursorsRef = useRef(cursors);
  cursorsRef.current = cursors;
  const programmatic = useRef(false);
  const [hover, setHover] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el || !data.curves.length) return;
    const css = getComputedStyle(el);
    const muted = css.getPropertyValue('--fg-muted').trim();
    const grid = css.getPropertyValue('--grid').trim();
    const fg = css.getPropertyValue('--fg').trim();
    const ticks = (_u: uPlot, t: number[]) => t.map((x) => si(x, 3));
    const hasRight = data.curves.some((c) => c.axis !== 'y');
    const rightUnit = data.curves.some((c) => c.axis === 'ph') ? '°' : data.iUnit;
    let raf = 0;
    const opts: uPlot.Options = {
      width: Math.max(100, el.clientWidth),
      height: Math.max(80, el.clientHeight),
      legend: { show: false },
      scales: {
        x: { time: false, distr: data.log ? 3 : 1, ...(xRange ? { min: xRange[0], max: xRange[1] } : {}) },
        y: { range: safeRange },
        i: { range: safeRange },
        ph: { range: safeRange },
      },
      axes: [
        {
          values: (_u, t) => t.map((v) => (v == null || (data.log && Math.abs(Math.log10(v) - Math.round(Math.log10(v))) > 1e-9) ? '' : si(v, 3))),
          stroke: muted,
          grid: { stroke: grid },
          ticks: { stroke: grid },
        },
        { scale: 'y', values: ticks, stroke: muted, grid: { stroke: grid }, ticks: { stroke: grid }, size: 58, label: data.yUnit || undefined, labelSize: 14 },
        ...(hasRight
          ? [{ scale: data.curves.some((c) => c.axis === 'ph') ? 'ph' : 'i', side: 1, values: ticks, stroke: muted, grid: { show: false }, size: 58, label: rightUnit, labelSize: 14 } as uPlot.Axis]
          : []),
      ],
      series: [
        { label: data.xName },
        ...data.curves.map((c) => ({
          label: c.label,
          scale: c.axis,
          stroke: c.color,
          width: 1.5,
          dash: c.dash ? [6, 4] : undefined,
          show: !c.hidden,
          spanGaps: false,
        })),
      ],
      cursor: {
        sync: { key: 'turbospice' },
        drag: { x: !cursorMode, y: false, setScale: !cursorMode },
        points: { size: 6 },
      },
      hooks: {
        setCursor: [
          (u) => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => setHover(u.cursor.idx ?? null));
          },
        ],
        setScale: [
          (u, key) => {
            if (key !== 'x' || programmatic.current) return;
            const { min, max } = u.scales.x;
            if (min != null && max != null) {
              const full = min <= data.x[0] && max >= data.x[data.x.length - 1];
              onZoom(full ? null : [min, max]);
            }
          },
        ],
        draw: [
          (u) => {
            const c = cursorsRef.current;
            const ctx = u.ctx;
            for (const [name, v] of [
              ['A', c.a],
              ['B', c.b],
            ] as const) {
              if (v === undefined) continue;
              const px = u.valToPos(v, 'x', true);
              if (px < u.bbox.left || px > u.bbox.left + u.bbox.width) continue;
              ctx.save();
              ctx.strokeStyle = fg;
              ctx.setLineDash([5, 4]);
              ctx.lineWidth = devicePixelRatio;
              ctx.beginPath();
              ctx.moveTo(px, u.bbox.top);
              ctx.lineTo(px, u.bbox.top + u.bbox.height);
              ctx.stroke();
              ctx.fillStyle = fg;
              ctx.font = `${12 * devicePixelRatio}px system-ui`;
              ctx.fillText(`${name} ${fmt(v)}`, px + 4 * devicePixelRatio, u.bbox.top + 14 * devicePixelRatio);
              // un punto sobre cada curva visible, en el valor que lee la tabla
              ctx.setLineDash([]);
              data.curves.forEach((cv, i) => {
                if (cv.hidden) return;
                const y = valueAt(data.x, cv.y, v);
                if (!Number.isFinite(y)) return;
                const py = u.valToPos(y, u.series[i + 1].scale ?? 'y', true);
                ctx.fillStyle = cv.color;
                ctx.beginPath();
                ctx.arc(px, py, 3.5 * devicePixelRatio, 0, 2 * Math.PI);
                ctx.fill();
              });
              ctx.restore();
            }
          },
        ],
      },
    };
    // valores no finitos (dB de 0, divisiones por 0) como huecos: uPlot no los admite
    const ys = data.curves.map((c) => Array.from(c.y, (v) => (Number.isFinite(v) ? v : null)));
    const u = new uPlot(opts, [data.x, ...ys] as uPlot.AlignedData, el);
    chart.current = u;
    props.register(u);
    const over = u.over;
    // Cursores: se colocan al apretar (no con "click", que se pierde si el gráfico se redibuja
    // entre que se aprieta y se suelta) y se arrastran tomando su línea.
    const lineAt = (offsetX: number): 'a' | 'b' | null => {
      const c = cursorsRef.current;
      let best: 'a' | 'b' | null = null;
      let d = 6;
      for (const k of ['a', 'b'] as const) {
        const v = c[k];
        if (v === undefined) continue;
        const dist = Math.abs(u.valToPos(v, 'x') - offsetX);
        if (dist <= d) [best, d] = [k, dist];
      }
      return best;
    };
    let dragging: 'a' | 'b' | null = null;
    const down = (e: PointerEvent) => {
      if (!cursorMode || (e.button !== 0 && e.button !== 2)) return;
      e.preventDefault();
      dragging = lineAt(e.offsetX) ?? (e.button === 2 || e.shiftKey ? 'b' : 'a');
      over.setPointerCapture(e.pointerId);
      onCursor({ [dragging]: u.posToVal(e.offsetX, 'x') });
    };
    const move = (e: PointerEvent) => {
      if (!cursorMode) return;
      if (dragging) onCursor({ [dragging]: u.posToVal(e.offsetX, 'x') });
      else over.style.cursor = lineAt(e.offsetX) ? 'ew-resize' : '';
    };
    const up = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = null;
      if (over.hasPointerCapture(e.pointerId)) over.releasePointerCapture(e.pointerId);
    };
    const context = (e: MouseEvent) => cursorMode && e.preventDefault();
    // rueda: zoom en X alrededor del cursor
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const { min, max } = u.scales.x;
      if (min == null || max == null) return;
      const k = Math.exp(e.deltaY * 0.0015);
      const at = u.posToVal(e.offsetX, 'x');
      const [a, b, c] = data.log ? [Math.log10(min), Math.log10(max), Math.log10(at)] : [min, max, at];
      let lo = c - (c - a) * k;
      let hi = c + (b - c) * k;
      if (data.log) [lo, hi] = [10 ** lo, 10 ** hi];
      const x0 = data.x[0];
      const x1 = data.x[data.x.length - 1];
      onZoom(lo <= x0 && hi >= x1 ? null : [Math.max(lo, x0), Math.min(hi, x1)]);
    };
    over.addEventListener('pointerdown', down);
    over.addEventListener('pointermove', move);
    over.addEventListener('pointerup', up);
    over.addEventListener('pointercancel', up);
    over.addEventListener('contextmenu', context);
    over.addEventListener('wheel', wheel, { passive: false });
    const ro = new ResizeObserver(() => u.setSize({ width: Math.max(100, el.clientWidth), height: Math.max(80, el.clientHeight) }));
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      over.removeEventListener('pointerdown', down);
      over.removeEventListener('pointermove', move);
      over.removeEventListener('pointerup', up);
      over.removeEventListener('pointercancel', up);
      over.removeEventListener('contextmenu', context);
      over.removeEventListener('wheel', wheel);
      props.register(null);
      chart.current = null;
      u.destroy();
    };
    // xRange se aplica aparte para no recrear el gráfico en cada zoom
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, cursorMode]);

  useEffect(() => {
    const u = chart.current;
    if (!u) return;
    programmatic.current = true;
    u.setScale('x', xRange ? { min: xRange[0], max: xRange[1] } : { min: data.x[0], max: data.x[data.x.length - 1] });
    programmatic.current = false;
  }, [xRange, data]);

  useEffect(() => {
    chart.current?.redraw(false);
  }, [cursors]);

  // corridas (pasos de .step, barridos .dc anidados) con el color de la primera traza
  const runLegend = data.curves.filter((c) => c.trace === data.curves[0]?.trace && c.axis === data.curves[0]?.axis && c.runLabel);

  // valor de cada traza en la posición del mouse (la primera curva de cada traza)
  const firstCurve = (ti: number) => data.curves.find((c) => c.trace === ti);
  const unitOf = (c: Curve | undefined) => (c?.axis === 'ph' ? '°' : c?.axis === 'i' ? 'A' : data.yUnit);

  return (
    <div
      className={`pane${props.active ? ' active' : ''}${dragOver ? ' drop' : ''}`}
      onPointerDown={props.onActivate}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-trace')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        const raw = e.dataTransfer.getData('application/x-trace');
        if (!raw) return;
        const { pane: from, trace } = JSON.parse(raw) as { pane: number; trace: number };
        props.onDropTrace(from, trace);
      }}
    >
      <div className="pane-legend">
        {pane.traces.map((t: Trace, ti) => {
          const c = firstCurve(ti);
          const err = data.errors.get(ti);
          const v = hover !== null && c ? c.y[hover] : NaN;
          return (
            <span
              key={`${t.expr}${ti}`}
              className={`trace-chip${t.hidden ? ' off' : ''}${err ? ' bad' : ''}`}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('application/x-trace', JSON.stringify({ pane: index, trace: ti }))}
              onPointerEnter={() => props.onHoverExpr?.(t.expr)}
              onPointerLeave={() => props.onHoverExpr?.(undefined)}
              title={err ?? 'Click: mostrar/ocultar · arrastrar a otro panel · color en el cuadrado'}
            >
              <label className="swatch" style={{ background: traceColor(t, ti) }}>
                <input
                  type="color"
                  aria-label={`Color de ${t.expr}`}
                  value={traceColor(t, ti)}
                  onChange={(e) => props.onChange((p) => ({ traces: p.traces.map((x, k) => (k === ti ? { ...x, color: e.target.value } : x)) }))}
                />
              </label>
              <button className="name" onClick={() => props.onChange((p) => ({ traces: p.traces.map((x, k) => (k === ti ? { ...x, hidden: !x.hidden } : x)) }))}>
                {t.expr}
              </button>
              {err ? <span className="err">{err}</span> : hover !== null && <span className="val">{fmt(v, unitOf(c))}</span>}
              <button className="x" aria-label={`Quitar ${t.expr}`} onClick={() => props.onChange((p) => ({ traces: p.traces.filter((_, k) => k !== ti) }))}>
                ✕
              </button>
            </span>
          );
        })}
        {hover !== null && data.x[hover] !== undefined && <span className="xval">{data.xName} = {fmt(data.x[hover])}</span>}
        {runLegend.length > 1 && (
          <span className="run-legend">
            {runLegend.map((c) => (
              <span key={c.run} style={{ color: c.color }}>
                ━ {c.runLabel}
              </span>
            ))}
          </span>
        )}
        {props.canRemove && (
          <button className="pane-x" onClick={props.onRemove} title="Quitar el panel">
            Quitar panel
          </button>
        )}
      </div>
      {data.curves.length ? (
        <div className="pane-chart" ref={host} />
      ) : (
        <p className="empty pane-empty">
          {pane.traces.length ? 'Ninguna traza se puede graficar en este análisis.' : 'Panel vacío: medí con la punta de prueba, escribí una expresión o arrastrá una traza acá.'}
        </p>
      )}
    </div>
  );
}

function CursorTable({ data, cursors }: { data: PaneData[]; cursors: Cursors }) {
  const { a, b } = cursors;
  const dx = a !== undefined && b !== undefined ? b - a : NaN;
  const rows = data.flatMap((d) => d.curves.filter((c) => !c.hidden).map((c) => ({ d, c }))).slice(0, MAX_ROWS);
  return (
    <table className="scalars readout">
      <thead>
        <tr>
          <th>Traza</th>
          <th>A {a !== undefined && `(${fmt(a)})`}</th>
          <th>B {b !== undefined && `(${fmt(b)})`}</th>
          <th>B − A</th>
          <th>pendiente</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ d, c }, i) => {
          const ya = a !== undefined ? valueAt(d.x, c.y, a) : NaN;
          const yb = b !== undefined ? valueAt(d.x, c.y, b) : NaN;
          return (
            <tr key={i}>
              <td style={{ color: c.color }}>{c.label}</td>
              <td>{fmt(ya)}</td>
              <td>{fmt(yb)}</td>
              <td>{fmt(yb - ya)}</td>
              <td>{fmt((yb - ya) / dx)}</td>
            </tr>
          );
        })}
        <tr className="dx">
          <td>{data[0]?.xName}</td>
          <td colSpan={2} />
          <td>Δx = {fmt(dx)}</td>
          <td>1/Δx = {fmt(1 / dx)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function StatsTable({ data, range }: { data: PaneData[]; range: Range | null }) {
  const rows = data.flatMap((d) => d.curves.filter((c) => !c.hidden).map((c) => ({ d, c }))).slice(0, MAX_ROWS);
  const db = (d: PaneData, c: Curve) => d.yUnit === 'dB' && c.axis === 'y';
  return (
    <table className="scalars readout">
      <thead>
        <tr>
          <th>Traza</th>
          <th>Mínimo</th>
          <th>Máximo</th>
          <th>Pico a pico</th>
          <th>Promedio</th>
          <th>Eficaz</th>
          <th>Frecuencia / −3 dB</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ d, c }, i) => {
          const s = stats(d.x, c.y, range?.[0], range?.[1]);
          if (!s) return null;
          const bw = db(d, c) ? bandwidth3dB(d.x, c.y) : null;
          return (
            <tr key={i}>
              <td style={{ color: c.color }}>{c.label}</td>
              <td>{fmt(s.min)} @ {fmt(s.xMin)}</td>
              <td>{fmt(s.max)} @ {fmt(s.xMax)}</td>
              <td>{fmt(s.pp)}</td>
              <td>{db(d, c) ? '—' : fmt(s.avg)}</td>
              <td>{db(d, c) ? '—' : fmt(s.rms)}</td>
              <td>{bw ? `${Number.isFinite(bw.low) ? `${fmt(bw.low)} … ` : ''}${fmt(bw.high)}` : fmt(s.freq, 'Hz')}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** PNG con todos los paneles apilados y la leyenda de cada uno */
async function exportPng(panes: Pane[], data: PaneData[], charts: Map<number, uPlot>): Promise<Blob | null> {
  const list = panes.map((_, i) => charts.get(i)).filter((u): u is uPlot => !!u);
  if (!list.length) return null;
  const dpr = devicePixelRatio;
  const legendH = 22 * dpr;
  const w = Math.max(...list.map((u) => u.ctx.canvas.width));
  const h = list.reduce((s, u) => s + u.ctx.canvas.height + legendH, 0);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const css = getComputedStyle(document.documentElement);
  ctx.fillStyle = css.getPropertyValue('--bg').trim() || '#fff';
  ctx.fillRect(0, 0, w, h);
  let y = 0;
  panes.forEach((_, i) => {
    const u = charts.get(i);
    if (!u) return;
    ctx.font = `${13 * dpr}px system-ui, sans-serif`;
    let x = 8 * dpr;
    for (const c of data[i].curves.filter((c) => !c.hidden && c.run === 0)) {
      ctx.fillStyle = c.color;
      ctx.fillText(c.label, x, y + 16 * dpr);
      x += ctx.measureText(c.label).width + 16 * dpr;
    }
    y += legendH;
    // uPlot dibuja ejes y curvas en su canvas (sin fondo)
    ctx.drawImage(u.ctx.canvas, 0, y);
    y += u.ctx.canvas.height;
  });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
