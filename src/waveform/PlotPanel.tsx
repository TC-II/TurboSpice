// Visor de resultados: paneles apilados con eje X compartido, trazas como expresiones,
// Bode (magnitud y fase), cursores, medidas rápidas y exportación a CSV/PNG.
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { createPortal } from 'react-dom';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { SimPlot } from '../engine/ngspice.ts';
import { paneCurves, traceLabel, type ComplexMode, type Curve, type PaneData } from './curves.ts';
import type { Resolver } from './expr.ts';
import { bandwidth3dB, cursorDiff, nearestIndex, stats, stepPoint, toCsv, valueAt } from './measure.ts';
import { boxAxes, extent, panBy, zoomAbout } from './scales.ts';
import { axisTicks, scaleOf, si, siFixed } from './series.ts';
import { PALETTE, acceptsTrace, colorFor, sameFft, cursorForClick, isFftPane, sameTrace, traceColor, type CursorKey, type Cursors, type Pane, type PlotState, type Trace } from './view.ts';
import { WINDOWS, type FftWindow } from './fft.ts';
import { Icon } from '../ui/icons.tsx';
import { t } from '../i18n/i18n.ts';

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
  handle?: Ref<PlotPanelHandle>;
  /** lugar de la barra de resultados donde van Cursores, FFT, Medidas y Ajustar */
  toolsHost?: HTMLElement | null;
  /** A: ir a la caja de expresiones (está en la barra de resultados) */
  onFocusTrace?(): void;
  /** resultados al costado del esquemático: cursores y medidas van debajo de los paneles (si
   * no, a la derecha) */
  side?: boolean;
  /** frecuencias de polos y ceros (.pz) para marcar en el eje de frecuencia */
  marks?: PzMark[];
  /** zoom y cursores con los que arranca (los de la simulación elegida, #39) */
  initial?: PlotState;
  /** avisa cada cambio de zoom o cursores (para guardarlos con la simulación) */
  onState?(s: PlotState): void;
}

export interface PzMark {
  f: number;
  kind: 'pole' | 'zero';
}

type Range = [number, number];
/** distancia (px) a la línea de un cursor para tomarlo y arrastrarlo */
const GRAB = 6;
// px que tiene que moverse el botón derecho para panear en vez de hacer clic
const PAN_SLOP = 4;
/** px que debe moverse un arrastre en el eje menos movido para contar como recuadro en X e Y */
const DRAG_UNI = 20;

const MAX_ROWS = 16;

/** Rango de un eje Y; uno fijo si no hay datos finitos o son constantes */
const safeRange: uPlot.Range.Function = (_u, min, max) => {
  if (min == null || max == null || !Number.isFinite(min) || !Number.isFinite(max)) return [-1, 1];
  if (min === max) return [min - (Math.abs(min) || 1) * 0.1, max + (Math.abs(max) || 1) * 0.1];
  return uPlot.rangeNum(min, max, 0.1, true);
};
const fmt = (v: number, unit = '') => (Number.isFinite(v) ? `${si(v, 4)}${unit}` : '—');
/** Lecturas que cambian con el mouse (cursores, leyenda): siempre del mismo ancho, sin parpadeo */
const fix = (v: number, unit = '') => `${siFixed(v)}${Number.isFinite(v) ? unit : ' '.repeat(unit.length)}`;
const allFinite = (y: Float64Array) => {
  for (let i = 0; i < y.length; i++) if (!Number.isFinite(y[i])) return false;
  return true;
};
const xUnit = (xName: string | undefined) => (xName === 'time' ? 's' : xName === 'frequency' ? 'Hz' : '');
/** fase de la misma traza y corrida (Bode), para la lectura de un cursor en magnitud */
const phaseOf = (d: PaneData, c: Curve) => (c.axis === 'ph' ? undefined : d.curves.find((o) => o.axis === 'ph' && o.trace === c.trace && o.run === c.run));

export function PlotPanel({ plot, runs, labels, panes, setPanes, resolver, mode, active, setActive, onHoverExpr, handle, marks, initial, onState, onFocusTrace, side, toolsHost }: Props) {
  const [fftOpen, setFftOpen] = useState(false);
  // ⌖: elegir con un click en su cápsula la traza cuya FFT se agrega (#245)
  const [fftPicking, setFftPicking] = useState(false);
  const [fftWindow, setFftWindow] = useState<FftWindow>('hann');
  // los paneles de FFT (#236) tienen eje de frecuencias: cursores propios y zoom en X propio de
  // cada panel (#260; los de tiempo comparten el eje X: es el mismo tiempo para todos)
  const [fRanges, setFRanges] = useState<Record<number, Range>>({});
  const setFRange = (i: number, r: Range | null) =>
    setFRanges((old) => {
      const next = { ...old };
      if (r) next[i] = r;
      else delete next[i];
      return next;
    });
  const [fCursors, setFCursors] = useState<Cursors>({});
  // el estado inicial vale sólo si es del mismo eje X
  const init = initial && initial.scale === scaleOf(plot)?.name ? initial : undefined;
  const [xRange, setXRange] = useState<Range | null>(init?.xRange ?? null);
  const [cursorMode, setCursorMode] = useState(init?.cursorMode ?? false);
  const [cursors, setCursors] = useState<Cursors>(init?.cursors ?? {});
  const [showStats, setShowStats] = useState(false);
  // cursores activos y todavía sin ubicar: el A sigue al mouse (línea y tabla preliminares)
  const [hoverX, setHoverX] = useState<number>();
  const charts = useRef(new Map<number, uPlot>());
  // eje Y fijado por un zoom a recuadro (por panel; sin entrada = autoescala)
  const [yRanges, setYRanges] = useState<Record<number, Range>>(init?.yRanges ?? {});
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
  const lastScale = useRef(scaleName);
  useEffect(() => {
    if (lastScale.current === scaleName) return;
    lastScale.current = scaleName;
    setXRange(null);
    setYRanges({});
    zoomHistory.current = [];
    setCursors({});
  }, [scaleName]);
  useEffect(() => {
    onState?.({ scale: scaleName, xRange, yRanges, cursors, cursorMode });
  }, [scaleName, xRange, yRanges, cursors, cursorMode, onState]);
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

  const update = (i: number, f: (p: Pane) => Pane) => setPanes(panes.map((p, k) => (k === i ? { ...p, ...f(p) } : p)));
  const moveTrace = (from: number, ti: number, to: number) => {
    // (entre un panel de tiempo y uno de FFT no: la traza cambiaría de significado; a uno vacío sí, #260)
    const tt = panes[from]?.traces[ti];
    if (!tt || from === to || !acceptsTrace(panes[to], tt) || panes[to].traces.some((o) => sameTrace(o, tt))) return;
    setPanes(panes.map((p, k) => (k === from ? { ...p, traces: p.traces.filter((_, j) => j !== ti) } : k === to ? { ...p, traces: [...p.traces, tt] } : p)));
  };
  /** FFT de una traza: traza nueva en el panel de FFT del mismo rango y ventana, o en uno nuevo debajo */
  const addFft = (expr: string) => {
    const fft = { window: fftWindow, ...(xRange ? { from: xRange[0], to: xRange[1] } : {}) };
    const tr = { expr, fft };
    const i = panes.findIndex((p) => isFftPane(p) && p.traces.every((tt) => sameFft(tt.fft, fft)));
    let color = colorFor(panes, expr);
    // otra FFT de la misma señal (otra ventana o rango): otro color, para distinguirlas
    const all = panes.flatMap((p) => p.traces.map((tt, k) => ({ tt, c: traceColor(tt, k).toLowerCase() })));
    if (all.some(({ tt, c }) => tt.fft && c === color && !sameTrace(tt, tr))) color = PALETTE.find((c) => !all.some((o) => o.c === c)) ?? color;
    if (i >= 0) {
      if (!panes[i].traces.some((tt) => sameTrace(tt, tr))) update(i, (p) => ({ ...p, traces: [...p.traces, { ...tr, color }] }));
      setActive(i);
    } else {
      setPanes([...panes, { traces: [{ ...tr, color }] }]);
      setActive(panes.length);
    }
    setFftPicking(false);
  };
  useEffect(() => {
    if (!fftPicking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setFftPicking(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [fftPicking]);
  const isF = (i: number) => isFftPane(panes[i]);

  useImperativeHandle(handle, () => ({
    csv: () => {
      const d = data[0];
      if (!d) return '';
      const cols = data.filter((_, k) => !isF(k)).flatMap((pd) => pd.curves.filter((c) => !c.hidden).map((c) => ({ name: c.label, ys: c.y })));
      return toCsv(d.xName, d.x, cols);
    },
    png: () => exportPng(panes, data, charts.current),
    action: (a) => {
      const i = Math.min(active, panes.length - 1);
      switch (a) {
        case 'fit':
          setFRanges({});
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
        case 'autoY': {
          // Y a lo que se ve ahora (con el zoom en X), fijo hasta el próximo cambio
          if (!xRange && !Object.keys(fRanges).length) return zoomTo(null, {});
          const ys: Record<number, Range> = {};
          charts.current.forEach((u, k) => {
            const xr = isF(k) ? (fRanges[k] ?? null) : xRange;
            if (!xr) return;
            const e = extent(data[k].x, data[k].curves.filter((c) => !c.hidden && c.axis === 'y').map((c) => c.y), xr[0], xr[1]);
            if (e) ys[k] = safeRange(u, e[0], e[1], 'y') as Range;
          });
          return zoomTo(xRange, ys);
        }
        case 'grid':
          return setShowGrid((v) => !v);
        case 'addTrace':
          return onFocusTrace?.();
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
          setFCursors({});
          setCursors({});
          return setCursorMode(false);
        case 'cancel':
          setZoomMode(false);
          return setRemoving(false);
      }
    },
  }));

  const range: Range | null = xRange;
  const isTran = scaleName === 'time';
  const windowName: Record<FftWindow, string> = {
    hann: t('Hann Window'),
    hamming: t('Hamming Window'),
    blackman: t('Blackman Window'),
    flattop: t('Flat Top Window'),
    rect: t('Rectangular Window'),
  };
  const timeData = data.filter((_, k) => !isF(k));
  const freqData = data.filter((_, k) => isF(k));
  const unplaced = cursorMode && cursors.a === undefined && cursors.b === undefined;
  const previewX = unplaced ? hoverX : undefined;
  // en este orden, en la barra de resultados (toolsHost) o arriba de los paneles
  const tools = (
    <>
      <button
        className={cursorMode ? 'active' : ''}
        onClick={() => setCursorMode((v) => !v)}
        title={t('Cursors: first click = cursor A, second = cursor B, then a click moves the nearest one; dragging a line moves it (Alt: to the simulated points, arrows: point by point; C; Shift+C clears them)')}
      >
        {t('Cursors')}
      </button>
      <button className={showStats ? 'active' : ''} onClick={() => setShowStats((v) => !v)} title={t('Maximum, minimum, peak-to-peak, average, RMS and frequency in the visible range')}>
        {t('Stats')}
      </button>
      <button
        className="fit-btn"
        onClick={() => {
          setFRanges({});
          zoomTo(null, {});
        }}
        title={t('Fit to view')}
        aria-label={t('Fit to view')}
      >
        <Icon name="fit" />
      </button>
      {isTran && (
        <button
          className={fftOpen ? 'active' : ''}
          onClick={() => {
            setFftOpen((v) => !v);
            setFftPicking(false);
          }}
          title={t('Spectrum (FFT) and harmonic distortion of a trace')}
        >
          FFT
        </button>
      )}
      {fftOpen && isTran && (
        <span className="fft-tools">
          <select value={fftWindow} aria-label={t('Window')} onChange={(e) => setFftWindow(e.target.value as FftWindow)}>
            {WINDOWS.map(([w]) => (
              <option key={w} value={w}>{windowName[w]}</option>
            ))}
          </select>
          <button
            className={`pick-btn fft-pick${fftPicking ? ' active' : ''}`}
            aria-label={t('Trace for the FFT')}
            title={t('Pick the trace for the FFT: click its name in the legend (Esc cancels)')}
            onClick={() => setFftPicking((v) => !v)}
          >
            ⌖
          </button>
          <span className="hint">
            {range
              ? t('Computed only over the current range: ({p0}s … {p1}s)', { p0: si(range[0]), p1: si(range[1]) })
              : t('Using all the points (zoom in to compute over a range)')}
          </span>
        </span>
      )}
    </>
  );
  const allTraces = panes.flatMap((p) => p.traces);
  const allVisible = data.flatMap((d) => d.curves.filter((c) => !c.hidden));
  const fUnplaced = cursorMode && fCursors.a === undefined && fCursors.b === undefined;

  return (
    <div className={`plot-panel${fftPicking ? ' fft-picking' : ''}`}>
      {toolsHost ? createPortal(tools, toolsHost) : <div className="plot-tools">{tools}</div>}
      {fftPicking && <p className="hint plot-info">{t('Click a trace in the legend to add its FFT · Esc cancels')}</p>}
      {(zoomMode || removing) && (
        <p className="hint plot-info">{zoomMode ? t('Drag a box to zoom · Esc cancels') : t('Click a trace\'s name to remove it · Esc finishes')}</p>
      )}
      {plot.info && <p className="hint plot-info">{plot.info}</p>}
      {/* cursores y medidas: a la derecha de los paneles con los resultados abajo (son anchos y
          bajos); debajo con los resultados al costado */}
      <div className={`plot-main${side ? '' : ' beside'}`}>
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
            onRemove={() => {
              setPanes(panes.filter((_, k) => k !== i));
              // (el zoom de los paneles de FFT que siguen se corre con ellos)
              setFRanges((old) => Object.fromEntries(Object.entries(old).flatMap(([k, v]) => (+k === i ? [] : [[+k > i ? +k - 1 : +k, v]]))));
            }}
            onChange={(f) => update(i, f)}
            onDropTrace={(from, ti) => moveTrace(from, ti, i)}
            xRange={isF(i) ? (fRanges[i] ?? null) : range}
            yRange={yRanges[i] ?? null}
            onZoom={(r) => (isF(i) ? setFRange(i, r) : r ? zoomTo(r) : zoomTo(null, {}))}
            onWheelZoom={(r) => {
              if (isF(i)) return setFRange(i, r);
              zoomNow.current = { ...zoomNow.current, x: r };
              setXRange(r);
            }}
            onWheelY={(r) => {
              zoomNow.current = { ...zoomNow.current, y: { ...zoomNow.current.y, [i]: r } };
              setYRanges(zoomNow.current.y);
            }}
            onBoxZoom={(x, y) => {
              setZoomMode(false);
              if (isF(i)) {
                if (x) setFRange(i, x);
                if (y) setYRanges({ ...zoomNow.current.y, [i]: y });
                return;
              }
              zoomTo(x ?? zoomNow.current.x, y ? { ...zoomNow.current.y, [i]: y } : zoomNow.current.y);
            }}
            zoomMode={zoomMode}
            removing={removing}
            onPickTrace={fftPicking && !isF(i) ? addFft : undefined}
            labelOf={(tt) => traceLabel(tt, allTraces)}
            showGrid={showGrid}
            cursorMode={cursorMode}
            cursors={isF(i) ? fCursors : cursors}
            onCursor={(c) => (isF(i) ? setFCursors : setCursors)((old) => ({ ...old, ...c }))}
            previewX={isF(i) ? undefined : previewX}
            onHoverX={unplaced && !isF(i) ? setHoverX : undefined}
            syncKey={isF(i) ? 'turbospice-fft' : 'turbospice'}
            onHoverExpr={onHoverExpr}
            marks={marks}
            register={(u) => (u ? charts.current.set(i, u) : charts.current.delete(i))}
            onAddBelow={
              i === panes.length - 1
                ? () => {
                    setPanes([...panes, { traces: [] }]);
                    setActive(panes.length);
                  }
                : undefined
            }
          />
        ))}
      </div>
      {(cursorMode || (showStats && allVisible.length > 0)) && (
        <div className="readouts">
          {cursorMode && (
            <section className="readout-card" aria-label={t('Cursors')}>
              <h4>{t('Cursors')}</h4>
              {timeData.length > 0 && <CursorTable data={timeData} cursors={previewX !== undefined ? { ...cursors, a: previewX } : cursors} preview={unplaced} setCursors={setCursors} />}
              {freqData.length > 0 && !fUnplaced && <CursorTable data={freqData} cursors={fCursors} setCursors={setFCursors} />}
              {unplaced && <p className="hint">{t('Click on the plot to set cursor A, then click again for B. Drag the lines to move them.')}</p>}
            </section>
          )}
          {showStats && allVisible.length > 0 && (
            <section className="readout-card" aria-label={t('Stats')}>
              <h4>{t('Stats')}</h4>
              <StatsTable data={timeData} range={range} />
              {data.map((d, k) => (isF(k) ? <StatsTable key={k} data={[d]} range={fRanges[k] ?? null} /> : null))}
            </section>
          )}
        </div>
      )}
      </div>
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
  /** eje Y fijo (zoom a recuadro); null = todo el rango de los datos (no se reajusta con el zoom en X, #200) */
  yRange: Range | null;
  onZoom(r: Range | null): void;
  onWheelZoom(r: Range | null): void;
  /** Y de este panel por la rueda sobre el eje (o con Shift) */
  onWheelY(r: Range): void;
  /** recuadro arrastrado: null en el eje que no se acerca (arrastre casi horizontal o vertical) */
  onBoxZoom(x: Range | null, y: Range | null): void;
  zoomMode: boolean;
  removing: boolean;
  /** nombre de la traza en la leyenda (FFT(…), #260) */
  labelOf(tt: Trace): string;
  /** modo ⌖ de la FFT: un click en la cápsula elige la traza */
  onPickTrace?(expr: string): void;
  showGrid: boolean;
  cursorMode: boolean;
  cursors: Cursors;
  onCursor(c: Cursors): void;
  onHoverExpr?(e: string | undefined): void;
  marks?: PzMark[];
  register(u: uPlot | null): void;
  /** sólo en el último panel: "+" en su borde inferior para agregar uno debajo */
  onAddBelow?(): void;
  /** cursor A preliminar (todavía sin ubicar): sigue al mouse */
  previewX?: number;
  /** posición del mouse en X (mientras haya cursores sin ubicar) */
  onHoverX?(x: number | undefined): void;
  /** grupo de sincronización del cursor de uPlot (los paneles de FFT tienen otro eje X) */
  syncKey: string;
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
  /** el arrastre en curso empezó en este gráfico */
  const pressed = useRef(false);
  const [hover, setHover] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // los colores se leen del CSS al crear el gráfico: al cambiar de tema hay que recrearlo (si no,
  // la grilla del tema oscuro queda sobre el fondo claro)
  const [scheme, setScheme] = useState(0);
  useEffect(() => {
    const bump = () => setScheme((n) => n + 1);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', bump);
    return () => (mo.disconnect(), mq.removeEventListener('change', bump));
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el || !data.curves.length) return;
    const css = getComputedStyle(el);
    const muted = css.getPropertyValue('--fg-muted').trim();
    const grid = css.getPropertyValue('--grid').trim();
    const fg = css.getPropertyValue('--fg').trim();
    const bg = css.getPropertyValue('--bg').trim() || '#fff';
    const markColor = { pole: css.getPropertyValue('--err').trim(), zero: css.getPropertyValue('--accent').trim() };
    // (las etiquetas quedan también en data-ticks-<escala> de la raíz de uPlot: el canvas no se puede leer en los e2e)
    const ticks = (scale: string) => (u: uPlot, tt: number[]) => {
      const out = axisTicks(tt);
      u.root.dataset[`ticks${scale}`] = out.join('|');
      return out;
    };
    const hasRight = data.curves.some((c) => c.axis !== 'y');
    const rightUnit = data.curves.some((c) => c.axis === 'ph') ? '°' : data.iUnit;
    const unitOf = (c: Curve) => (c.axis === 'ph' ? '°' : c.axis === 'i' ? data.iUnit : data.yUnit);
    // Y sin zoom fijado: el rango de todos los datos (no el de lo visible), así el zoom en X no
    // cambia la escala de amplitud (#200); Ctrl+Y la ajusta a lo visible
    // (los datos no cambian mientras vive el gráfico: se recorren una vez por escala, no en cada
    // rueda o paneo, que con millones de puntos se notaba)
    const extents = new Map<string, Range | null>();
    const fullY = (scale: string) => {
      if (!extents.has(scale)) extents.set(scale, extent(data.x, data.curves.filter((c) => !c.hidden && c.axis === scale).map((c) => c.y)));
      return extents.get(scale)!;
    };
    const whole = (scale: string): uPlot.Range.Function => (u, min, max) => {
      const e = fullY(scale);
      return safeRange(u, e?.[0] ?? min, e?.[1] ?? max, scale);
    };
    let raf = 0;
    const stepped = uPlot.paths.stepped!({ align: 1 });
    const opts: uPlot.Options = {
      width: Math.max(100, el.clientWidth),
      height: Math.max(80, el.clientHeight),
      legend: { show: false },
      scales: {
        x: { time: false, distr: data.log ? 3 : 1, ...(xRange ? { min: xRange[0], max: xRange[1] } : {}) },
        y: { range: (u, min, max) => yRef.current ?? whole('y')(u, min, max, 'y') },
        i: { range: whole('i') },
        ph: { range: whole('ph') },
      },
      axes: [
        {
          values: (_u, tt) => tt.map((v) => (v == null || (data.log && Math.abs(Math.log10(v) - Math.round(Math.log10(v))) > 1e-9) ? '' : si(v, 3))),
          stroke: muted,
          grid: { stroke: grid, width: 1, show: showGrid },
          ticks: { stroke: grid, width: 1 },
        },
        { scale: 'y', values: ticks('Y'), stroke: muted, grid: { stroke: grid, width: 1, show: showGrid }, ticks: { stroke: grid, width: 1 }, size: 58, label: data.yUnit || undefined, labelSize: 14 },
        ...(hasRight
          ? [{ scale: data.curves.some((c) => c.axis === 'ph') ? 'ph' : 'i', side: 1, values: ticks('R'), stroke: muted, grid: { show: false }, size: 58, label: rightUnit, labelSize: 14 } as uPlot.Axis]
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
          // nodos digitales (#209): cada valor vale hasta el punto siguiente
          ...(c.digital ? { paths: stepped } : {}),
          show: !c.hidden,
          spanGaps: false,
        })),
      ],
      cursor: {
        sync: { key: props.syncKey },
        // con los cursores activos no hay zoom por arrastre; Z: recuadro en X e Y (lo aplica setSelect).
        // Se cambia en vivo, sin recrear el gráfico.
        // Arrastrar = recuadro en X e Y (lo aplica setSelect); casi horizontal o casi vertical (menos de
        // `uni` px en el otro eje) = zoom sólo en X o sólo en Y. Con los cursores activos no hay zoom
        // por arrastre (Z lo fuerza). Se cambia en vivo, sin recrear el gráfico.
        drag: live.current.zoomMode ? { x: true, y: true, setScale: false } : { x: !live.current.cursorMode, y: !live.current.cursorMode, uni: DRAG_UNI, setScale: false },
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
            if (live.current.cursorMode && !live.current.zoomMode) return;
            // (los demás paneles reciben el mismo arrastre por la sincronización: lo aplica sólo el que lo empezó)
            if (!pressed.current) return;
            const s = u.select;
            const ax = live.current.zoomMode ? { x: s.width >= 4, y: s.height >= 4 } : boxAxes(s, u.over.clientWidth, u.over.clientHeight);
            if (!ax.x && !ax.y) return;
            // (con el zoom forzado por Z hacen falta los dos ejes, como siempre)
            if (live.current.zoomMode && !(ax.x && ax.y)) return;
            const x: Range = [u.posToVal(s.left, 'x'), u.posToVal(s.left + s.width, 'x')];
            const y: Range = [u.posToVal(s.top + s.height, 'y'), u.posToVal(s.top, 'y')];
            u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
            live.current.onBoxZoom(ax.x ? x : null, ax.y ? y : null);
          },
        ],
        setCursor: [
          (u) => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
              setHover(u.cursor.idx ?? null);
              const l = u.cursor.left;
              live.current.onHoverX?.(l != null && l >= 0 ? u.posToVal(l, 'x') : undefined);
            });
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
            // (rangos visibles de X e Y, para leerlos en los e2e: el canvas no se puede leer)
            u.root.dataset.rangeX = `${u.scales.x.min}|${u.scales.x.max}`;
            u.root.dataset.rangeY = `${u.scales.y?.min}|${u.scales.y?.max}`;
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
            const pa = c.a === undefined && c.b === undefined ? live.current.previewX : c.a;
            for (const [name, v, tr] of [
              ['A', pa, c.ta],
              ['B', c.b, c.tb],
            ] as const) {
              if (v === undefined) continue;
              const px = u.valToPos(v, 'x', true);
              if (!(px >= left && px <= left + width)) continue;
              ctx.save();
              ctx.strokeStyle = fg;
              ctx.setLineDash([5, 4]);
              ctx.lineWidth = 1.5 * dpr;
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
    // valores no finitos (dB de 0, divisiones por 0) como huecos: uPlot no los admite. Sin ellos
    // va el arreglo tal cual (copiarlo a un Array de JS costaba ~100 ms y decenas de MB por millón de puntos)
    const ys = data.curves.map((c) => (allFinite(c.y) ? c.y : Array.from(c.y, (v) => (Number.isFinite(v) ? v : null))));
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
    // paneo con el botón del medio o el derecho: el derecho, en modo cursor, pone el cursor B
    // si se suelta sin moverse más de PAN_SLOP px (clic); si se mueve, panea
    let pan: { id: number; x: number; y: number; sx: Range; sy: Range; moved: boolean; click: PointerEvent | null } | null = null;
    let panned = false; // para no abrir el menú contextual tras un paneo con el botón derecho
    const panStart = (e: PointerEvent) => {
      if (e.button !== 1 && e.button !== 2) return false;
      const { min: x0, max: x1 } = u.scales.x;
      const { min: y0, max: y1 } = u.scales.y;
      if (x0 == null || x1 == null || y0 == null || y1 == null) return false;
      e.preventDefault();
      el.focus({ preventScroll: true });
      const click = e.button === 2 && live.current.cursorMode && !live.current.zoomMode ? e : null;
      pan = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: [x0, x1], sy: [y0, y1], moved: false, click };
      panned = false;
      root.setPointerCapture(e.pointerId);
      return true;
    };
    const panMove = (e: PointerEvent) => {
      if (!pan) return;
      const dx = e.clientX - pan.x;
      const dy = e.clientY - pan.y;
      if (!pan.moved && Math.hypot(dx, dy) < PAN_SLOP) return;
      pan.moved = panned = true;
      over.style.cursor = 'grabbing';
      const r = over.getBoundingClientRect();
      const x0 = data.x[0];
      const x1 = data.x[data.x.length - 1];
      if (r.width > 0 && dx) {
        const [lo, hi] = panBy(pan.sx[0], pan.sx[1], -dx / r.width, data.log, [x0, x1]);
        live.current.onWheelZoom(lo <= x0 && hi >= x1 ? null : [lo, hi]);
      }
      if (r.height > 0 && dy) {
        const [lo, hi] = panBy(pan.sy[0], pan.sy[1], dy / r.height);
        if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) live.current.onWheelY([lo, hi]);
      }
    };
    const panEnd = (e: PointerEvent) => {
      if (!pan) return false;
      const { moved, click } = pan;
      pan = null;
      over.style.cursor = '';
      if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
      if (!moved && click) {
        // clic derecho sin arrastre: lo de siempre (cursor B)
        const px = posX(click);
        const grab = grabbed(click);
        const k = grab ?? cursorForClick(cursorsRef.current, valX(click), true, (v) => Math.abs(u.valToPos(v, 'x') - px));
        live.current.onCursor(grab ? { sel: grab } : { [k]: valX(click), sel: k });
      }
      return true;
    };
    const down = (e: PointerEvent) => {
      if (panStart(e)) return;
      if (!live.current.cursorMode || live.current.zoomMode || e.button !== 0) return;
      e.preventDefault();
      el.focus({ preventScroll: true });
      const grab = grabbed(e);
      const px = posX(e);
      dragging = grab ?? cursorForClick(cursorsRef.current, valX(e), e.shiftKey, (v) => Math.abs(u.valToPos(v, 'x') - px));
      root.setPointerCapture(e.pointerId);
      live.current.onCursor(grab ? { sel: grab } : { [dragging]: valX(e), sel: dragging });
    };
    const move = (e: PointerEvent) => {
      if (pan) return panMove(e);
      if (dragging) live.current.onCursor({ [dragging]: valX(e) });
      else over.style.cursor = live.current.cursorMode && grabbed(e) ? 'ew-resize' : '';
    };
    const up = (e: PointerEvent) => {
      if (panEnd(e) || !dragging) return;
      dragging = null;
      if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
    };
    const context = (e: MouseEvent) => {
      if (live.current.cursorMode || panned) e.preventDefault();
      panned = false;
    };
    // rueda: zoom en X alrededor del cursor; sobre el eje Y (o con Shift), zoom en Y de este panel;
    // Ctrl+rueda: desplaza en X
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = over.getBoundingClientRect();
      const k = Math.exp(e.deltaY * 0.0015);
      const onYAxis = e.clientX < r.left;
      if (e.ctrlKey) {
        // Ctrl+rueda: desplaza la vista en X sin cambiar el zoom (y sin el zoom del navegador)
        const { min, max } = u.scales.x;
        if (min == null || max == null) return;
        const x0 = data.x[0];
        const x1 = data.x[data.x.length - 1];
        const [lo, hi] = panBy(min, max, (e.deltaY || e.deltaX) * 0.001, data.log, [x0, x1]);
        if (lo !== min || hi !== max) live.current.onWheelZoom(lo <= x0 && hi >= x1 ? null : [lo, hi]);
        return;
      }
      if (e.clientX > r.right && e.clientY <= r.bottom) return; // eje derecho: sin zoom
      if (onYAxis || e.shiftKey) {
        const { min, max } = u.scales.y;
        if (min == null || max == null) return;
        const [lo, hi] = zoomAbout(min, max, u.posToVal(Math.min(Math.max(e.clientY - r.top, 0), r.height), 'y'), k);
        if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) live.current.onWheelY([lo, hi]);
        return;
      }
      const { min, max } = u.scales.x;
      if (min == null || max == null) return;
      const at = u.posToVal(Math.min(Math.max(e.clientX - r.left, 0), r.width), 'x');
      const [lo, hi] = zoomAbout(min, max, at, k, data.log);
      const x0 = data.x[0];
      const x1 = data.x[data.x.length - 1];
      live.current.onWheelZoom(lo <= x0 && hi >= x1 ? null : [Math.max(lo, x0), Math.min(hi, x1)]);
    };
    // mientras se arrastra un zoom, el recuadro se resalta y el resto del gráfico se oscurece
    // (uPlot deja el recuadro vacío al terminar: la sombra va sólo durante el arrastre)
    const selStart = (e: PointerEvent) => {
      if (e.button === 0 && (!live.current.cursorMode || live.current.zoomMode)) {
        el.classList.add('selecting');
        pressed.current = true;
      }
    };
    const selEnd = () => {
      el.classList.remove('selecting');
      // (uPlot cierra el arrastre en el mouseup, que llega después del pointerup)
      setTimeout(() => (pressed.current = false), 0);
    };
    root.addEventListener('pointerdown', selStart);
    window.addEventListener('pointerup', selEnd);
    window.addEventListener('pointercancel', selEnd);
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('contextmenu', context);
    root.addEventListener('wheel', wheel, { passive: false });
    const ro = new ResizeObserver(() => u.setSize({ width: Math.max(100, el.clientWidth), height: Math.max(80, el.clientHeight) }));
    ro.observe(el);
    const reg = live.current.register;
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      root.removeEventListener('pointerdown', selStart);
      window.removeEventListener('pointerup', selEnd);
      window.removeEventListener('pointercancel', selEnd);
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
      root.removeEventListener('pointercancel', up);
      root.removeEventListener('contextmenu', context);
      root.removeEventListener('wheel', wheel);
      reg(null);
      chart.current = null;
      u.destroy();
    };
    // el gráfico se recrea sólo si cambian los datos, la grilla, el tema o el modo zoom (Z, el
    // recuadro en X e Y se configura al crearlo); xRange y los cursores se aplican aparte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, showGrid, zoomMode, scheme, props.syncKey]);

  useEffect(() => {
    const u = chart.current;
    if (!u) return;
    if (zoomMode) return;
    u.cursor.drag!.x = !cursorMode;
    u.cursor.drag!.y = !cursorMode;
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
  }, [cursors, props.marks, props.previewX]);

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
        {pane.traces.map((tt: Trace, ti) => {
          const c = firstCurve(ti);
          const err = data.errors.get(ti);
          const v = hover !== null && c ? c.y[hover] : NaN;
          return (
            <span
              key={`${props.labelOf(tt)}${ti}`}
              className={`trace-chip${tt.hidden ? ' off' : ''}${err ? ' bad' : ''}${props.onPickTrace ? ' pickable' : ''}`}
              draggable={!props.onPickTrace}
              onClickCapture={(e) => {
                if (!props.onPickTrace) return;
                e.preventDefault();
                e.stopPropagation();
                props.onPickTrace(tt.expr);
              }}
              onDragStart={(e) => e.dataTransfer.setData('application/x-trace', JSON.stringify({ pane: index, trace: ti }))}
              onPointerEnter={() => props.onHoverExpr?.(tt.expr)}
              onPointerLeave={() => props.onHoverExpr?.(undefined)}
              title={err ?? t('Click: show/hide · drag to another pane · color in the square')}
            >
              <label className="swatch" style={{ background: traceColor(tt, ti) }}>
                <input
                  type="color"
                  aria-label={t('Color of {expr}', { expr: props.labelOf(tt) })}
                  value={traceColor(tt, ti)}
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
                {props.labelOf(tt)}
              </button>
              {/* el lugar del valor queda reservado aunque el mouse no esté sobre el gráfico */}
          {err ? <span className="err">{err}</span> : <span className={`val${hover === null ? ' idle' : ''}`}>{fix(v, unitOf(c))}</span>}
              <button className="x" aria-label={t('Remove {expr}', { expr: props.labelOf(tt) })} onClick={() => props.onChange((p) => ({ traces: p.traces.filter((_, k) => k !== ti) }))}>
                ✕
              </button>
            </span>
          );
        })}
        {data.x.length > 0 && (
          <span className={`xval${hover === null || data.x[hover] === undefined ? ' idle' : ''}`}>
            {data.xName} = {fix(hover !== null ? (data.x[hover] ?? NaN) : NaN, xUnit(data.xName))}
          </span>
        )}
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
          <button className="pane-x" onClick={props.onRemove} title={t('Remove the pane')}>
            {t('Remove pane')}
          </button>
        )}
      </div>
      {data.info?.map((l) => (
        <p key={l} className="hint plot-info fft-info">{l}</p>
      ))}
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
          {pane.traces.length ? t('No trace can be plotted in this analysis.') : t('Empty pane: probe with the probe tool, type an expression or drag a trace here.')}
        </p>
      )}
      {props.onAddBelow && (
        <div className="pane-add">
          <button aria-label={t('Add pane')} title={t('Add a pane below (P)')} onPointerDown={(e) => e.stopPropagation()} onClick={props.onAddBelow}>
            +
          </button>
        </div>
      )}
    </div>
  );
}

function CursorTable({ data, cursors, preview, setCursors }: { data: PaneData[]; cursors: Cursors; preview?: boolean; setCursors(f: (c: Cursors) => Cursors): void }) {
  const { a, b } = cursors;
  const dx = a !== undefined && b !== undefined ? b - a : NaN;
  const rows = data.flatMap((d) => d.curves.filter((c) => !c.hidden).map((c) => ({ d, c }))).slice(0, MAX_ROWS);
  const labels = [...new Set(data.flatMap((d) => d.curves.filter((c) => !c.hidden).map((c) => c.label)))];
  const xu = xUnit(data[0]?.xName);
  const traceSelect = (k: 'ta' | 'tb', name: string) => (
    <select value={cursors[k] ?? ''} aria-label={t('Cursor {name} trace', { name })} onChange={(e) => setCursors((c) => ({ ...c, [k]: e.target.value || undefined }))}>
      <option value="">{name}{t(': no trace')}</option>
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
        <button disabled={a === undefined || preview} onClick={() => setCursors((c) => ({ ...c, a: undefined, sel: 'b' }))}>
          {t('Clear A')}
        </button>
        <button disabled={b === undefined} onClick={() => setCursors((c) => ({ ...c, b: undefined, sel: 'a' }))}>
          {t('Clear B')}
        </button>
        <button onClick={() => setCursors((c) => ({ ...c, a: c.b, b: c.a, ta: c.tb, tb: c.ta }))} title={t('Swap A and B')}>
          A ⇄ B
        </button>
      </div>
      <table className="scalars readout">
        <thead>
          <tr>
            <th>{t('Trace')}</th>
            <th>A</th>
            <th>B</th>
            <th>B − A</th>
            <th>{t('slope')}</th>
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
                <td>{fix(ya)}</td>
                <td>{fix(yb)}</td>
                <td>{fix(cursorDiff(a ?? NaN, b ?? NaN, ya, yb).dy)}</td>
                <td>{fix(cursorDiff(a ?? NaN, b ?? NaN, ya, yb).slope)}</td>
              </tr>
            );
          })}
          <tr className="dx">
            <td>{data[0]?.xName}</td>
            <td className={preview ? 'xa preview' : 'xa'} title={preview ? t('Follows the mouse: click to fix it') : undefined}>{fix(a ?? NaN, xu)}</td>
            <td className="xb">{fix(b ?? NaN, xu)}</td>
            <td className="xd">{fix(dx, xu)}</td>
            <td className="xf">{fix(cursorDiff(a ?? NaN, b ?? NaN, NaN, NaN).freq, xu === 's' ? 'Hz' : '')}</td>
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
          <th>{t('Trace')}</th>
          <th>{t('Minimum')}</th>
          <th>{t('Maximum')}</th>
          <th>{t('Peak to peak')}</th>
          <th>{t('Average')}</th>
          <th>{t('RMS')}</th>
          <th>{t('Frequency / −3 dB')}</th>
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
