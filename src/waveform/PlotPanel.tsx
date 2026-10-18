// Visor de resultados: paneles apilados con eje X compartido, trazas como expresiones,
// Bode (magnitud y fase), cursores, medidas rápidas y exportación a CSV/PNG.
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { SimPlot } from '../engine/ngspice.ts';
import { paneCurves, type ComplexMode, type Curve, type PaneData } from './curves.ts';
import type { Resolver } from './expr.ts';
import { bandwidth3dB, nearestIndex, stats, stepPoint, toCsv, valueAt } from './measure.ts';
import { displayName, scaleOf, si } from './series.ts';
import { sameExpr, traceColor, type Pane, type Trace } from './view.ts';
import { WINDOWS, type FftWindow } from './fft.ts';

/** Atajos del visor (con el mouse sobre los gráficos), como en LTspice */
export type PlotAction =
  | 'fit' // Espacio
  | 'zoomBox' // Z
  | 'zoomPrev' // Shift+Z
  | 'autoY' // Ctrl+Y
  | 'grid' // Ctrl+G
  | 'addTrace' // A
  | 'addPane' // P
  | 'addPaneBelow' // B
  | 'paneUp' // U
  | 'paneDown' // D
  | 'removeTraces' // Backspace
  | 'cursor' // C
  | 'clearCursors' // Shift+C
  | 'cancel'; // Esc

export interface PlotPanelHandle {
  csv(): string;
  png(): Promise<Blob | null>;
  action(a: PlotAction): void;
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
  /** frecuencias de polos y ceros (.pz) para marcar en el eje de frecuencia */
  marks?: PzMark[];
}

export interface PzMark {
  f: number;
  kind: 'pole' | 'zero';
}

type Range = [number, number];
type CursorKey = 'a' | 'b';
interface Cursors {
  a?: number;
  b?: number;
  /** traza (etiqueta de la curva) que sigue cada cursor */
  ta?: string;
  tb?: string;
  /** último cursor movido: el que mueven las flechas */
  sel?: CursorKey;
}
/** distancia (px) a la línea de un cursor para tomarlo y arrastrarlo */
const GRAB = 6;

const MAX_ROWS = 16;

/** Rango de un eje Y; uno fijo si no hay datos finitos o son constantes */
const safeRange: uPlot.Range.Function = (_u, min, max) => {
  if (min == null || max == null || !Number.isFinite(min) || !Number.isFinite(max)) return [-1, 1];
  if (min === max) return [min - (Math.abs(min) || 1) * 0.1, max + (Math.abs(max) || 1) * 0.1];
  return uPlot.rangeNum(min, max, 0.1, true);
};
const fmt = (v: number, unit = '') => (Number.isFinite(v) ? `${si(v, 4)}${unit}` : '—');
const xUnit = (xName: string | undefined) => (xName === 'time' ? 's' : xName === 'frequency' ? 'Hz' : '');
/** fase de la misma traza y corrida (Bode), para la lectura de un cursor en magnitud */
const phaseOf = (d: PaneData, c: Curve) => (c.axis === 'ph' ? undefined : d.curves.find((o) => o.axis === 'ph' && o.trace === c.trace && o.run === c.run));

export function PlotPanel({ plot, runs, labels, panes, setPanes, resolver, mode, active, setActive, onHoverExpr, onFft, handle, marks }: Props) {
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
  const exprInput = useRef<HTMLInputElement>(null);
  // eje Y fijado por un zoom a recuadro (por panel; sin entrada = autoescala)
  const [yRanges, setYRanges] = useState<Record<number, Range>>({});
  const [zoomMode, setZoomMode] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  // vistas anteriores (Shift+Z)
  const zoomHistory = useRef<{ x: Range | null; y: Record<number, Range> }[]>([]);

  const data = useMemo(
    () => panes.map((p) => paneCurves(p, { plot, runs, labels, resolver, mode })),
    [panes, plot, runs, labels, resolver, mode],
  );

  // Otro tipo de análisis (otro eje X): volver al rango completo y sin cursores. Al volver
  // a simular el mismo análisis se mantienen el zoom y los cursores.
  const scale = scaleOf(plot);
  const scaleName = scale?.name;
  useEffect(() => {
    setXRange(null);
    setYRanges({});
    zoomHistory.current = [];
    setCursors({});
  }, [scaleName]);
  useEffect(() => {
    const xs = scale?.real;
    if (!xs?.length) return;
    setXRange((r) => (r && (r[1] < xs[0] || r[0] > xs[xs.length - 1]) ? null : r));
  }, [scale]);

  // (los gráficos guardan los callbacks de cuando se crearon: el zoom actual va por refs)
  const zoomNow = useRef({ x: xRange, y: yRanges });
  zoomNow.current = { x: xRange, y: yRanges };
  /** Cambio de zoom que se deshace con Shift+Z */
  const zoomTo = (x: Range | null, y: Record<number, Range> = zoomNow.current.y) => {
    const cur = zoomNow.current;
    const same = (a: Range | null, b: Range | null) => (a && b ? a[0] === b[0] && a[1] === b[1] : a === b);
    if (same(x, cur.x) && y === cur.y) return;
    zoomHistory.current.push(cur);
    zoomNow.current = { x, y };
    if (zoomHistory.current.length > 50) zoomHistory.current.shift();
    setXRange(x);
    setYRanges(y);
  };
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
    action: (a) => {
      const i = Math.min(active, panes.length - 1);
      switch (a) {
        case 'fit':
          return zoomTo(null, {});
        case 'zoomBox':
          setRemoving(false);
          return setZoomMode(true);
        case 'zoomPrev': {
          const prev = zoomHistory.current.pop();
          if (prev) {
            zoomNow.current = prev;
            setXRange(prev.x);
            setYRanges(prev.y);
          }
          return;
        }
        case 'autoY':
          return zoomTo(xRange, {});
        case 'grid':
          return setShowGrid((v) => !v);
        case 'addTrace':
          return exprInput.current?.focus();
        case 'addPane':
          setPanes([...panes, { traces: [] }]);
          return setActive(panes.length);
        case 'addPaneBelow':
          setPanes([...panes.slice(0, i + 1), { traces: [] }, ...panes.slice(i + 1)]);
          return setActive(i + 1);
        case 'paneUp':
        case 'paneDown': {
          const j = a === 'paneUp' ? i - 1 : i + 1;
          if (j < 0 || j >= panes.length) return;
          const next = [...panes];
          [next[i], next[j]] = [next[j], next[i]];
          setPanes(next);
          return setActive(j);
        }
        case 'removeTraces':
          setZoomMode(false);
          return setRemoving(true);
        case 'cursor': {
          setCursorMode(true);
          const d = data.find((x) => x.x.length);
          if (cursors.a !== undefined || !d) return;
          const [lo, hi] = xRange ?? [d.x[0], d.x[d.x.length - 1]];
          return setCursors({ ...cursors, a: d.log ? Math.sqrt(lo * hi) : (lo + hi) / 2 });
        }
        case 'clearCursors':
          setCursors({});
          return setCursorMode(false);
        case 'cancel':
          setZoomMode(false);
          return setRemoving(false);
      }
    },
  }));

  // nombres para autocompletar el campo de expresión
  const names = useMemo(() => {
    const sc = scaleOf(plot);
    return [...new Set(plot.vectors.filter((v) => v !== sc).map(displayName))];
  }, [plot]);

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
            ref={exprInput}
            list="trace-names"
            value={expr}
            spellCheck={false}
            placeholder="Agregar traza: V(out)/V(in), I(R1)*V(n1), d(V(c))…"
            aria-label="Expresión"
            onChange={(e) => {
              setExpr(e.target.value);
              setExprError(undefined);
            }}
          />
          <datalist id="trace-names">
            {names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <button type="submit" title="Agregar la traza (A: ir al campo)">Agregar</button>
        </form>
        <button onClick={() => setPanes([...panes, { traces: [] }])} title="Agregar un panel; las trazas nuevas van al panel activo (P; B: debajo del activo)">+ Panel</button>
        <button
          className={cursorMode ? 'active' : ''}
          onClick={() => setCursorMode((v) => !v)}
          title="Cursores: click = cursor A, Shift+click o click derecho = cursor B; arrastrar una línea la mueve (Alt: a los puntos simulados, flechas: punto a punto; C; Shift+C los borra)"
        >
          Cursores
        </button>
        <button className={showStats ? 'active' : ''} onClick={() => setShowStats((v) => !v)} title="Máximo, mínimo, pico a pico, promedio, eficaz y frecuencia en el rango visible">
          Medidas
        </button>
        <button onClick={() => zoomTo(null, {})} title="Ver todo (Espacio o doble click en el gráfico; Z: zoom a un recuadro, Shift+Z: zoom anterior)">Ajustar</button>
        {onFft && data[0]?.xName === 'time' && (
          <button className={fftOpen ? 'active' : ''} onClick={() => setFftOpen((v) => !v)} title="Espectro (FFT) y distorsión armónica de una traza">
            FFT…
          </button>
        )}
        {exprError && <span className="hint warn">{exprError}</span>}
        {zoomMode && <span className="hint">Arrastrá un recuadro para hacer zoom · Esc cancela</span>}
        {removing && <span className="hint">Click en el nombre de una traza para quitarla · Esc termina</span>}
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
            yRange={yRanges[i] ?? null}
            onZoom={(r) => zoomTo(r)}
            onWheelZoom={(r) => {
              zoomNow.current = { ...zoomNow.current, x: r };
              setXRange(r);
            }}
            onBoxZoom={(x, y) => {
              setZoomMode(false);
              zoomTo(x, { ...zoomNow.current.y, [i]: y });
            }}
            zoomMode={zoomMode}
            removing={removing}
            showGrid={showGrid}
            cursorMode={cursorMode}
            cursors={cursors}
            onCursor={(c) => setCursors((old) => ({ ...old, ...c }))}
            onHoverExpr={onHoverExpr}
            marks={marks}
            register={(u) => (u ? charts.current.set(i, u) : charts.current.delete(i))}
          />
        ))}
      </div>
      {(cursorMode || (showStats && allVisible.length > 0)) && (
        <div className="readouts">
          {cursorMode && (cursors.a !== undefined || cursors.b !== undefined) && <CursorTable data={data} cursors={cursors} setCursors={setCursors} />}
          {cursorMode && cursors.a === undefined && cursors.b === undefined && (
            <p className="hint pad-x">Click en el gráfico para ubicar el cursor A; Shift+click o click derecho para el B. Arrastrá las líneas para moverlas.</p>
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
  /** eje Y fijo (zoom a recuadro); null = autoescala */
  yRange: Range | null;
  onZoom(r: Range | null): void;
  onWheelZoom(r: Range | null): void;
  onBoxZoom(x: Range, y: Range): void;
  zoomMode: boolean;
  removing: boolean;
  showGrid: boolean;
  cursorMode: boolean;
  cursors: Cursors;
  onCursor(c: Cursors): void;
  onHoverExpr?(e: string | undefined): void;
  marks?: PzMark[];
  register(u: uPlot | null): void;
}) {
  const { index, pane, data, xRange, yRange, zoomMode, removing, showGrid, cursorMode, cursors, onCursor } = props;
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<uPlot | null>(null);
  const cursorsRef = useRef(cursors);
  cursorsRef.current = cursors;
  // lo último de las props para los manejadores del gráfico, que vive mientras no cambien los datos
  const live = useRef(props);
  live.current = props;
  const marksRef = useRef(props.marks);
  marksRef.current = props.marks;
  const yRef = useRef(yRange);
  yRef.current = yRange;
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
    const bg = css.getPropertyValue('--bg').trim() || '#fff';
    const markColor = { pole: css.getPropertyValue('--err').trim(), zero: css.getPropertyValue('--accent').trim() };
    const ticks = (_u: uPlot, t: number[]) => t.map((x) => si(x, 3));
    const hasRight = data.curves.some((c) => c.axis !== 'y');
    const rightUnit = data.curves.some((c) => c.axis === 'ph') ? '°' : data.iUnit;
    const unitOf = (c: Curve) => (c.axis === 'ph' ? '°' : c.axis === 'i' ? data.iUnit : data.yUnit);
    let raf = 0;
    const opts: uPlot.Options = {
      width: Math.max(100, el.clientWidth),
      height: Math.max(80, el.clientHeight),
      legend: { show: false },
      scales: {
        x: { time: false, distr: data.log ? 3 : 1, ...(xRange ? { min: xRange[0], max: xRange[1] } : {}) },
        y: { range: (u, min, max) => yRef.current ?? safeRange(u, min, max, 'y') },
        i: { range: safeRange },
        ph: { range: safeRange },
      },
      axes: [
        {
          values: (_u, t) => t.map((v) => (v == null || (data.log && Math.abs(Math.log10(v) - Math.round(Math.log10(v))) > 1e-9) ? '' : si(v, 3))),
          stroke: muted,
          grid: { stroke: grid, show: showGrid },
          ticks: { stroke: grid },
        },
        { scale: 'y', values: ticks, stroke: muted, grid: { stroke: grid, show: showGrid }, ticks: { stroke: grid }, size: 58, label: data.yUnit || undefined, labelSize: 14 },
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
        // con los cursores activos no hay zoom por arrastre; Z: recuadro en X e Y (lo aplica setSelect).
        // Se cambia en vivo, sin recrear el gráfico.
        drag: live.current.zoomMode ? { x: true, y: true, setScale: false } : { x: !live.current.cursorMode, y: false, setScale: !live.current.cursorMode },
        points: { size: 6 },
        bind: {
          // doble click = ver todo, salvo con los cursores (dos clicks rápidos no deben reiniciar el zoom)
          dblclick: (_u, _t, handler) => (e) => {
            if (e.button === 0 && !live.current.cursorMode) handler(e);
            return null;
          },
        },
      },
      hooks: {
        setSelect: [
          (u) => {
            if (!live.current.zoomMode) return;
            const s = u.select;
            if (s.width < 4 || s.height < 4) return;
            const x: Range = [u.posToVal(s.left, 'x'), u.posToVal(s.left + s.width, 'x')];
            const y: Range = [u.posToVal(s.top + s.height, 'y'), u.posToVal(s.top, 'y')];
            u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
            live.current.onBoxZoom(x, y);
          },
        ],
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
              live.current.onZoom(full ? null : [min, max]);
            }
          },
        ],
        draw: [
          (u) => {
            const c = cursorsRef.current;
            const ctx = u.ctx;
            // f₀ de polos (×) y ceros (○): líneas verticales punteadas
            if (data.xName === 'frequency')
              for (const m of marksRef.current ?? []) {
                const px = u.valToPos(m.f, 'x', true);
                if (!(px >= u.bbox.left && px <= u.bbox.left + u.bbox.width)) continue;
                ctx.save();
                ctx.strokeStyle = ctx.fillStyle = markColor[m.kind];
                ctx.globalAlpha = 0.7;
                ctx.setLineDash([2, 3].map((d) => d * devicePixelRatio));
                ctx.lineWidth = devicePixelRatio;
                ctx.beginPath();
                ctx.moveTo(px, u.bbox.top);
                ctx.lineTo(px, u.bbox.top + u.bbox.height);
                ctx.stroke();
                ctx.font = `${11 * devicePixelRatio}px system-ui`;
                ctx.textAlign = 'center';
                ctx.fillText(m.kind === 'pole' ? '×' : '○', px, u.bbox.top + u.bbox.height - 4 * devicePixelRatio);
                ctx.restore();
              }
            if (!live.current.cursorMode) return;
            const dpr = devicePixelRatio;
            const { left, top, width, height } = u.bbox;
            for (const [name, v, tr] of [
              ['A', c.a, c.ta],
              ['B', c.b, c.tb],
            ] as const) {
              if (v === undefined) continue;
              const px = u.valToPos(v, 'x', true);
              if (!(px >= left && px <= left + width)) continue;
              ctx.save();
              ctx.strokeStyle = fg;
              ctx.setLineDash([5, 4]);
              ctx.lineWidth = dpr;
              ctx.beginPath();
              ctx.moveTo(px, top);
              ctx.lineTo(px, top + height);
              ctx.stroke();
              ctx.font = `${12 * dpr}px system-ui`;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'alphabetic';
              // lectura junto al cursor: x y, si sigue una traza de este panel, su valor
              const lines = [`${name}  ${fmt(v, xUnit(data.xName))}`];
              const curve = tr !== undefined ? data.curves.find((k) => k.label === tr && !k.hidden) : undefined;
              let boxY = top + 4 * dpr;
              if (curve) {
                const y = valueAt(data.x, curve.y, v);
                const ph = phaseOf(data, curve);
                lines.push(`${curve.label}: ${fmt(y, unitOf(curve))}${ph ? `  ${fmt(valueAt(data.x, ph.y, v), '°')}` : ''}`);
                const py = u.valToPos(y, curve.axis, true);
                if (Number.isFinite(py) && py >= top && py <= top + height) {
                  ctx.strokeStyle = curve.color;
                  ctx.setLineDash([2, 3]);
                  ctx.beginPath();
                  ctx.moveTo(left, py);
                  ctx.lineTo(left + width, py);
                  ctx.stroke();
                  ctx.setLineDash([]);
                  ctx.fillStyle = curve.color;
                  ctx.beginPath();
                  ctx.arc(px, py, 4 * dpr, 0, 2 * Math.PI);
                  ctx.fill();
                  boxY = Math.min(Math.max(top + 4 * dpr, py - 40 * dpr), top + height - 40 * dpr);
                }
              } else if (tr !== undefined || index !== 0) {
                // sin traza en este panel: la lectura de x va sólo en el primero
                lines.length = 0;
              }
              if (lines.length) {
                const lh = 15 * dpr;
                const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 8 * dpr;
                const bx = px + w + 6 * dpr > left + width ? px - w - 4 * dpr : px + 4 * dpr;
                ctx.globalAlpha = 0.85;
                ctx.fillStyle = bg;
                ctx.fillRect(bx, boxY, w, lh * lines.length + 4 * dpr);
                ctx.globalAlpha = 1;
                ctx.fillStyle = fg;
                lines.forEach((l, k) => ctx.fillText(l, bx + 4 * dpr, boxY + lh * (k + 1) - 2 * dpr));
              }
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
    live.current.register(u);
    const { over, root } = u;

    // Cursores con eventos de puntero (no 'click'): se ubican al apretar, se arrastran y
    // también se puede apretar sobre los ejes (se toma el borde del área del gráfico)
    const posX = (e: PointerEvent) => {
      const r = over.getBoundingClientRect();
      return Math.min(Math.max(e.clientX - r.left, 0), r.width);
    };
    const valX = (e: PointerEvent) => {
      const x = u.posToVal(posX(e), 'x');
      return e.altKey ? data.x[nearestIndex(data.x, x)] : x;
    };
    const grabbed = (e: PointerEvent): CursorKey | undefined => {
      const c = cursorsRef.current;
      const px = posX(e);
      let best: CursorKey | undefined;
      let dist = GRAB;
      for (const k of ['a', 'b'] as const) {
        const v = c[k];
        if (v === undefined) continue;
        const d = Math.abs(u.valToPos(v, 'x') - px);
        if (d <= dist) [best, dist] = [k, d];
      }
      return best;
    };
    let dragging: CursorKey | null = null;
    const down = (e: PointerEvent) => {
      if (!live.current.cursorMode || live.current.zoomMode || (e.button !== 0 && e.button !== 2)) return;
      e.preventDefault();
      el.focus({ preventScroll: true });
      const grab = grabbed(e);
      dragging = grab ?? (e.button === 2 || e.shiftKey ? 'b' : 'a');
      root.setPointerCapture(e.pointerId);
      live.current.onCursor(grab ? { sel: grab } : { [dragging]: valX(e), sel: dragging });
    };
    const move = (e: PointerEvent) => {
      if (dragging) live.current.onCursor({ [dragging]: valX(e) });
      else over.style.cursor = live.current.cursorMode && grabbed(e) ? 'ew-resize' : '';
    };
    const up = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = null;
      if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
    };
    const context = (e: MouseEvent) => live.current.cursorMode && e.preventDefault();
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
      live.current.onWheelZoom(lo <= x0 && hi >= x1 ? null : [Math.max(lo, x0), Math.min(hi, x1)]);
    };
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('contextmenu', context);
    over.addEventListener('wheel', wheel, { passive: false });
    const ro = new ResizeObserver(() => u.setSize({ width: Math.max(100, el.clientWidth), height: Math.max(80, el.clientHeight) }));
    ro.observe(el);
    const reg = live.current.register;
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
      root.removeEventListener('pointercancel', up);
      root.removeEventListener('contextmenu', context);
      over.removeEventListener('wheel', wheel);
      reg(null);
      chart.current = null;
      u.destroy();
    };
    // el gráfico se recrea sólo si cambian los datos; xRange y los cursores se aplican aparte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, showGrid]);

  useEffect(() => {
    const u = chart.current;
    if (!u) return;
    u.cursor.drag!.x = zoomMode || !cursorMode;
    u.cursor.drag!.y = zoomMode;
    u.cursor.drag!.setScale = !zoomMode && !cursorMode;
    if (!cursorMode) u.over.style.cursor = '';
    u.redraw(false);
  }, [cursorMode, zoomMode]);

  // (al fijar el eje X, uPlot vuelve a calcular el Y: el rango de yRef o la autoescala)
  useEffect(() => {
    const u = chart.current;
    if (!u) return;
    programmatic.current = true;
    u.setScale('x', xRange ? { min: xRange[0], max: xRange[1] } : { min: data.x[0], max: data.x[data.x.length - 1] });
    programmatic.current = false;
  }, [xRange, yRange, data, cursorMode, zoomMode, showGrid]);

  useEffect(() => {
    chart.current?.redraw(false);
  }, [cursors, props.marks]);

  // corridas (pasos de .step, barridos .dc anidados) con el color de la primera traza
  const runLegend = data.curves.filter((c) => c.trace === data.curves[0]?.trace && c.axis === data.curves[0]?.axis && c.runLabel);

  // valor de cada traza en la posición del mouse (la primera curva de cada traza)
  const firstCurve = (ti: number) => data.curves.find((c) => c.trace === ti);
  const unitOf = (c: Curve | undefined) => (c?.axis === 'ph' ? '°' : c?.axis === 'i' ? 'A' : data.yUnit);

  return (
    <div
      className={`pane${props.active ? ' active' : ''}${dragOver ? ' drop' : ''}${removing ? ' removing' : ''}${zoomMode ? ' zooming' : ''}`}
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
              <button
                className="name"
                onClick={() =>
                  props.onChange((p) => ({
                    traces: removing ? p.traces.filter((_, k) => k !== ti) : p.traces.map((x, k) => (k === ti ? { ...x, hidden: !x.hidden } : x)),
                  }))
                }
              >
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
        <div
          className={`pane-chart${cursorMode ? ' cursor-mode' : ''}`}
          ref={host}
          tabIndex={cursorMode ? 0 : undefined}
          onKeyDown={(e) => {
            // flechas: el último cursor movido, punto simulado a punto (Shift: de a 10)
            if (!cursorMode || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
            const k = cursors.sel ?? (cursors.a !== undefined ? 'a' : 'b');
            const v = cursors[k];
            if (v === undefined) return;
            e.preventDefault();
            onCursor({ [k]: stepPoint(data.x, v, (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1)), sel: k });
          }}
        />
      ) : (
        <p className="empty pane-empty">
          {pane.traces.length ? 'Ninguna traza se puede graficar en este análisis.' : 'Panel vacío: medí con la punta de prueba, escribí una expresión o arrastrá una traza acá.'}
        </p>
      )}
    </div>
  );
}

function CursorTable({ data, cursors, setCursors }: { data: PaneData[]; cursors: Cursors; setCursors(f: (c: Cursors) => Cursors): void }) {
  const { a, b } = cursors;
  const dx = a !== undefined && b !== undefined ? b - a : NaN;
  const rows = data.flatMap((d) => d.curves.filter((c) => !c.hidden).map((c) => ({ d, c }))).slice(0, MAX_ROWS);
  const labels = [...new Set(data.flatMap((d) => d.curves.filter((c) => !c.hidden).map((c) => c.label)))];
  const xu = xUnit(data[0]?.xName);
  const traceSelect = (k: 'ta' | 'tb', name: string) => (
    <select value={cursors[k] ?? ''} aria-label={`Traza del cursor ${name}`} onChange={(e) => setCursors((c) => ({ ...c, [k]: e.target.value || undefined }))}>
      <option value="">{name}: sin traza</option>
      {labels.map((l) => (
        <option key={l} value={l}>
          {name}: {l}
        </option>
      ))}
    </select>
  );
  return (
    <div className="cursor-readout">
      <div className="cursor-tools">
        {traceSelect('ta', 'A')}
        {traceSelect('tb', 'B')}
        <button disabled={a === undefined} onClick={() => setCursors((c) => ({ ...c, a: undefined, sel: 'b' }))}>
          Borrar A
        </button>
        <button disabled={b === undefined} onClick={() => setCursors((c) => ({ ...c, b: undefined, sel: 'a' }))}>
          Borrar B
        </button>
        <button onClick={() => setCursors((c) => ({ ...c, a: c.b, b: c.a, ta: c.tb, tb: c.ta }))} title="Intercambiar A y B">
          A ⇄ B
        </button>
      </div>
      <table className="scalars readout">
        <thead>
          <tr>
            <th>Traza</th>
            <th>A {a !== undefined && `(${fmt(a, xu)})`}</th>
            <th>B {b !== undefined && `(${fmt(b, xu)})`}</th>
            <th>B − A</th>
            <th>pendiente</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ d, c }, i) => {
            const ya = a !== undefined ? valueAt(d.x, c.y, a) : NaN;
            const yb = b !== undefined ? valueAt(d.x, c.y, b) : NaN;
            const followed = c.label === cursors.ta || c.label === cursors.tb;
            return (
              <tr key={i} className={followed ? 'followed' : undefined}>
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
            <td>Δx = {fmt(dx, xu)}</td>
            <td>1/Δx = {fmt(1 / dx, xu === 's' ? 'Hz' : '')}</td>
          </tr>
        </tbody>
      </table>
    </div>
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
