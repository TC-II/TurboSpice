// Visor de resultados: paneles apilados con eje X compartido, trazas como expresiones,
// Bode (magnitud y fase), cursores, medidas rápidas y exportación a CSV/PNG.
import { Fragment, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { createPortal, flushSync } from 'react-dom';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { SimPlot } from '../engine/ngspice.ts';
import { dftSampling, paneCurves, traceLabel, type ComplexMode, type Curve, type PaneData } from './curves.ts';
import type { Resolver } from './expr.ts';
import { bandwidth3dB, cursorDiff, nearestIndex, stats, stepPoint, toCsv, valueAt } from './measure.ts';
import { alignScales, exactRange, extent, logLabeled, mapTicks, niceTicks, panBy, wheelZoom, zoomAt, type Aligned } from './scales.ts';
import { decimator } from './decimate.ts';
import { axisSpace, axisTicks, scaleOf, si, siFixed } from './series.ts';
import { DigitalLanes } from './DigitalLanes.tsx';
import { formatRadix, RADIXES, radixLabel, type Radix } from './digital.ts';
import { PALETTE, acceptsTrace, colorFor, sameDft, cursorForClick, isDftPane, reorderTrace, sameTrace, traceColor, type CursorKey, type Cursors, type Pane, type PlotState, type Trace, type TraceDft } from './view.ts';
import { addMarker, asMarkers, delta, horizontalCuts, markerName, markerValue, pickCurve, remapPanes, sameMarker, verticalCuts, type Marker, type MarkerAxis, type MarkerKind } from './markers.ts';
import { MAX_SAMPLES, parseSi, sampleCount, WINDOWS, type DftWindow } from './dft.ts';
import { useTraceWidth } from './lineWidth.ts';
import { Icon } from '../ui/icons.tsx';
import { ContextMenu, type ContextItem } from '../ui/ContextMenu.tsx';
import { locale, t } from '../i18n/i18n.ts';

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
  | 'markPoint' // M
  | 'markV' // V
  | 'markH' // H
  | 'markA' // A (con los markers activos)
  | 'markD' // D (con los markers activos)
  | 'clearMarkers' // Shift+M
  | 'deleteMarker' // Supr
  | 'cancel'; // Esc

export interface PlotPanelHandle {
  csv(): string;
  png(): Promise<Blob | null>;
  action(a: PlotAction): void;
  /** ¿está activo el modo Markers? (A y D ponen markers en vez de sus atajos de siempre) */
  markerMode(): boolean;
  /** ¿hay un marker seleccionado? (Supr lo borra) */
  markerSelected(): boolean;
  /** agrega la DFT de esa expresión (la punta de prueba en modo ⌖) */
  addDft(expr: string): void;
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
  /** lugar de la barra de resultados donde van Cursores, DFT, Medidas y Ajustar */
  toolsHost?: HTMLElement | null;
  /** A: ir a la caja de expresiones (está en la barra de resultados) */
  onFocusTrace?(): void;
  /** avisa cuando se entra o sale del modo ⌖ de la DFT (el esquemático pasa a la punta de prueba) */
  onDftPicking?(on: boolean): void;
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

const MAX_ROWS = 16;
/** desde cuántos puntos se decima lo que se le pasa a uPlot (con menos, van todos) */
const DECIMATE_FROM = 20_000;

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
/** franjas de los ejes que responden a la rueda y al arrastre (px): sólo las marcas y los números
 * (abajo) y la columna de números (a los costados), no toda la caja del eje */
const AXIS_X_BAND = 28;
const AXIS_Y_BAND = 44;

export function PlotPanel({ plot, runs, labels, panes, setPanes, resolver, mode, active, setActive, onHoverExpr, handle, marks, initial, onState, onFocusTrace, onDftPicking, side, toolsHost }: Props) {
  const [dftOpen, setDftOpen] = useState(false);
  // ⌖: elegir con un click en su cápsula la traza cuya DFT se agrega (#245)
  const [dftPicking, setDftPicking] = useState(false);
  const [dftWindow, setDftWindow] = useState<DftWindow>('hann');
  // muestreo escrito en la barra de la DFT; vacío = automático (el zoom y la densidad de la simulación)
  const [dftText, setDftText] = useState({ from: '', to: '', fs: '' });
  // DFT que se está editando desde la barra (su menú › Editar la DFT); null: la barra agrega una nueva
  const [dftEdit, setDftEdit] = useState<{ pane: number; trace: number } | null>(null);
  // los paneles de DFT (#236) tienen eje de frecuencias: cursores propios y zoom en X propio de
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
  // markers como en ViVA (M, V, H, A, D): se guardan con la simulación, como los cursores
  const [markerMode, setMarkerMode] = useState(init?.markerMode ?? false);
  const [markers, setMarkers] = useState<Marker[]>(() => asMarkers(init?.markers));
  const [selMarker, setSelMarker] = useState<Pick<Marker, 'kind' | 'id'> | null>(null);
  /** dónde está el mouse (panel y px dentro del área del gráfico): ahí ponen los markers las teclas */
  const pointer = useRef<{ pane: number; px: number; py: number } | null>(null);
  // cursores activos y todavía sin ubicar: el A sigue al mouse (línea y tabla preliminares)
  const [hoverX, setHoverX] = useState<number>();
  const charts = useRef(new Map<number, uPlot>());
  // eje Y fijado por un zoom a recuadro (por panel; sin entrada = autoescala)
  const [yRanges, setYRanges] = useState<Record<number, Range>>(init?.yRanges ?? {});
  // eje derecho (corrientes o fase) fijado con la rueda sobre él (por panel; sin entrada = todo el rango)
  const [rRanges, setRRanges] = useState<Record<number, Range>>({});
  const [zoomMode, setZoomMode] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  // vistas anteriores (Shift+Z)
  const zoomHistory = useRef<{ x: Range | null; y: Record<number, Range> }[]>([]);

  // las curvas de cada panel, recordadas por panel: cambiar uno (una traza, un color, ocultar) no
  // recalcula los demás ni recrea sus gráficos
  const curveCache = useRef<{ key: unknown[]; byPane: WeakMap<Pane, PaneData> }>({ key: [], byPane: new WeakMap() });
  const data = useMemo(() => {
    const key = [plot, runs, labels, resolver, mode];
    if (key.some((k, i) => k !== curveCache.current.key[i])) curveCache.current = { key, byPane: new WeakMap() };
    const m = curveCache.current.byPane;
    return panes.map((p) => {
      let d = m.get(p);
      if (!d) m.set(p, (d = paneCurves(p, { plot, runs, labels, resolver, mode })));
      return d;
    });
  }, [panes, plot, runs, labels, resolver, mode]);

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
    setRRanges({});
    zoomHistory.current = [];
    setCursors({});
    setMarkers([]);
  }, [scaleName]);
  useEffect(() => {
    onState?.({ scale: scaleName, xRange, yRanges, cursors, cursorMode, ...(markers.length ? { markers } : {}), ...(markerMode ? { markerMode } : {}) });
  }, [scaleName, xRange, yRanges, cursors, cursorMode, markers, markerMode, onState]);
  // (un marker seleccionado que ya no está, deja de estarlo)
  useEffect(() => {
    if (selMarker && !markers.some((m) => sameMarker(m, selMarker))) setSelMarker(null);
  }, [markers, selMarker]);
  useEffect(() => {
    const xs = scale?.real;
    if (!xs?.length) return;
    setXRange((r) => (r && (r[1] < xs[0] || r[0] > xs[xs.length - 1]) ? null : r));
  }, [scale]);

  // (los gráficos guardan los callbacks de cuando se crearon: el zoom actual va por refs)
  const zoomNow = useRef({ x: xRange, y: yRanges });
  zoomNow.current = { x: xRange, y: yRanges };
  // Rueda y paneo: muchos eventos seguidos (una rueda fina manda varios por cuadro) se acumulan y
  // se aplican una vez por cuadro; si no, cada uno redibujaba todos los paneles
  const wheel = useRef<{ raf: number; x?: { v: Range | null }; y: Record<number, Range>; r: Record<number, Range>; f: Record<number, Range | null> }>({ raf: 0, y: {}, r: {}, f: {} });
  const flushWheel = () => {
    const w = wheel.current;
    cancelAnimationFrame(w.raf);
    const { x, y, r, f } = w;
    wheel.current = { raf: 0, y: {}, r: {}, f: {} };
    // (flushSync: React y uPlot dibujan en este cuadro)
    flushSync(() => {
      if (x) {
        zoomNow.current = { ...zoomNow.current, x: x.v };
        setXRange(x.v);
      }
      if (Object.keys(y).length) {
        zoomNow.current = { ...zoomNow.current, y: { ...zoomNow.current.y, ...y } };
        setYRanges(zoomNow.current.y);
      }
      if (Object.keys(r).length) setRRanges((old) => ({ ...old, ...r }));
      for (const [k, v] of Object.entries(f)) setFRange(+k, v);
    });
  };
  const queueWheel = (f: (w: typeof wheel.current) => void) => {
    f(wheel.current);
    wheel.current.raf ||= requestAnimationFrame(flushWheel);
  };
  /** lo acumulado y sin aplicar del panel i (los manejadores de la rueda parten de ahí) */
  const wheelPending = (i: number) => {
    const w = wheel.current;
    return { x: isF(i) ? (i in w.f ? { v: w.f[i] } : undefined) : w.x, y: w.y[i], r: w.r[i] };
  };
  /** otro cambio de zoom (recuadro, ajustar, deshacer): lo acumulado ya no vale */
  const dropWheel = () => {
    cancelAnimationFrame(wheel.current.raf);
    wheel.current = { raf: 0, y: {}, r: {}, f: {} };
  };
  useEffect(() => () => cancelAnimationFrame(wheel.current.raf), []);

  /** Cambio de zoom que se deshace con Shift+Z */
  const zoomTo = (x: Range | null, y: Record<number, Range> = zoomNow.current.y) => {
    dropWheel();
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
    // (entre un panel de tiempo y uno de DFT no: la traza cambiaría de significado; a uno vacío sí, #260;
    // lo digital no comparte ejes con lo analógico, #209)
    const tt = panes[from]?.traces[ti];
    if (!tt || from === to || !acceptsTrace(panes[to], tt) || panes[to].traces.some((o) => sameTrace(o, tt))) return;
    setPanes(panes.map((p, k) => (k === from ? { ...p, traces: p.traces.filter((_, j) => j !== ti) } : k === to ? { ...p, traces: [...p.traces, tt], digital: panes[from].digital } : p)));
  };
  // Divisor entre paneles: arrastrarlo cambia la altura de los dos de al lado. Durante el
  // arrastre sólo se toca el DOM; al soltar, cada panel guarda su alto (size) en la vista
  const panesRef = useRef<HTMLDivElement>(null);
  const paneEls = () => [...(panesRef.current?.children ?? [])].filter((el): el is HTMLElement => el.classList.contains('pane'));
  const resizePanes = (i: number, dy: number, done: boolean, start?: number[]) => {
    const els = paneEls();
    const hs = start ?? els.map((el) => el.getBoundingClientRect().height);
    const MIN = 70;
    const pair = hs[i] + hs[i + 1];
    const a = Math.max(MIN, Math.min(pair - MIN, hs[i] + dy));
    const next = hs.map((h, k) => (k === i ? a : k === i + 1 ? pair - a : h));
    els.forEach((el, k) => (el.style.flex = `${next[k]} 1 0`));
    if (done) setPanes(panes.map((p, k) => ({ ...p, size: Math.round(next[k]) })));
  };
  const startSplit = (i: number, e: React.PointerEvent) => {
    e.preventDefault();
    const start = paneEls().map((el) => el.getBoundingClientRect().height);
    const y0 = e.clientY;
    const move = (ev: PointerEvent) => resizePanes(i, ev.clientY - y0, false, start);
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      resizePanes(i, ev.clientY - y0, true, start);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  /** doble clic en un divisor: todos los paneles vuelven a repartirse por igual */
  const resetSizes = () => {
    paneEls().forEach((el) => (el.style.flex = ''));
    setPanes(panes.map(({ size: _, ...p }) => p));
  };
  // --- DFT: muestreo de la barra (lo escrito o, vacío, lo automático: el zoom y la densidad de lo simulado)
  const typed = { from: parseSi(dftText.from), to: parseSi(dftText.to), fs: parseSi(dftText.fs) };
  const badField = (k: 'from' | 'to' | 'fs') => dftText[k].trim() !== '' && (typed[k] === null || (k === 'fs' && !(typed.fs! > 0)));
  /** la DFT que agrega (o aplica, al editar) la barra */
  const dftConfig = (): TraceDft => {
    const from = typed.from ?? xRange?.[0];
    const to = typed.to ?? xRange?.[1];
    return { window: dftWindow, ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}), ...(typed.fs ? { fs: typed.fs } : {}) };
  };
  const time = scale?.name === 'time' ? scale.real : undefined;
  // (la frecuencia automática recorre la simulación: sólo cuando cambia lo que la define)
  const dftPreview = useMemo(
    () => (time && dftOpen ? dftSampling(dftConfig(), time) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [time, dftOpen, dftText, xRange],
  );
  const dftN = dftPreview ? sampleCount(dftPreview.from, dftPreview.to, dftPreview.fs) : 0;
  const dftError = !dftPreview
    ? ''
    : badField('from') || badField('to') || badField('fs')
      ? t('Write a number, with an SI prefix if you want (1m, 2.5µ, 10M)')
      : dftPreview.to <= dftPreview.from
        ? t('The end time has to be after the start time')
        : dftN < 2
          ? t('Too few samples for the DFT: raise the sample rate or widen the range')
          : dftN > MAX_SAMPLES
            ? t('Too many samples for the DFT (more than 4 million): lower the sample rate or narrow the range')
            : '';
  /** DFT de una traza: traza nueva en el panel de DFT del mismo muestreo y ventana, o en uno nuevo debajo */
  const addDft = (expr: string) => {
    if (dftError) return;
    const dft = dftConfig();
    const tr = { expr, dft };
    const i = panes.findIndex((p) => isDftPane(p) && p.traces.every((tt) => sameDft(tt.dft, dft)));
    let color = colorFor(panes, expr);
    // otra DFT de la misma señal (otra ventana o muestreo): otro color, para distinguirlas
    const all = panes.flatMap((p) => p.traces.map((tt, k) => ({ tt, c: traceColor(tt, k).toLowerCase() })));
    if (all.some(({ tt, c }) => tt.dft && c === color && !sameTrace(tt, tr))) color = PALETTE.find((c) => !all.some((o) => o.c === c)) ?? color;
    if (i >= 0) {
      if (!panes[i].traces.some((tt) => sameTrace(tt, tr))) update(i, (p) => ({ ...p, traces: [...p.traces, { ...tr, color }] }));
      setActive(i);
    } else {
      setPanes([...panes, { traces: [{ ...tr, color }] }]);
      setActive(panes.length);
    }
    setDftPicking(false);
  };
  useEffect(() => onDftPicking?.(dftPicking), [dftPicking]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDftPicking?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps
  /** Editar la DFT: la barra toma su ventana y su muestreo, y «Aplicar» los guarda en la traza */
  const startDftEdit = (i: number, ti: number) => {
    const d = panes[i]?.traces[ti]?.dft;
    if (!d) return;
    const txt = (v: number | undefined) => (v === undefined ? '' : si(v, 12));
    setDftOpen(true);
    setDftPicking(false);
    setDftWindow(d.window);
    setDftText({ from: txt(d.from), to: txt(d.to), fs: txt(d.fs) });
    setDftEdit({ pane: i, trace: ti });
  };
  const applyDftEdit = () => {
    if (!dftEdit || dftError) return;
    const dft = dftConfig();
    update(dftEdit.pane, (p) => ({ ...p, traces: p.traces.map((x, k) => (k === dftEdit.trace ? { ...x, dft } : x)) }));
    setDftEdit(null);
  };
  // (si la traza que se editaba ya no está, se deja de editar)
  useEffect(() => {
    if (dftEdit && !panes[dftEdit.pane]?.traces[dftEdit.trace]?.dft) setDftEdit(null);
  }, [panes, dftEdit]);
  useEffect(() => {
    if (!dftPicking && !dftEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setDftPicking(false);
        setDftEdit(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dftPicking, dftEdit]);
  const isF = (i: number) => isDftPane(panes[i]);
  /**
   * Marker nuevo donde está el mouse (o en `at`). M, A y D van sobre la curva bajo el mouse (o la
   * más cercana); V y H, sin mouse sobre un gráfico, al medio del panel activo.
   */
  const placeMarker = (kind: MarkerKind, at = pointer.current) => {
    let p = at;
    if (!p && (kind === 'v' || kind === 'h')) {
      const u = charts.current.get(Math.min(active, panes.length - 1));
      if (u) p = { pane: Math.min(active, panes.length - 1), px: u.bbox.width / devicePixelRatio / 2, py: u.bbox.height / devicePixelRatio / 2 };
    }
    if (!p) return;
    const u = charts.current.get(p.pane);
    const d = data[p.pane];
    if (!u || !d?.curves.length || panes[p.pane]?.digital) return;
    const x = u.posToVal(p.px, 'x');
    const toPy = (v: number, a: MarkerAxis) => u.valToPos(v, a);
    let m: Omit<Marker, 'id'>;
    if (kind === 'v') m = { kind, pane: p.pane, x };
    else if (kind === 'h') {
      // la escala de la curva más cercana (corrientes o fase van en el eje derecho)
      const k = pickCurve(d.x, d.curves, x, p.py, toPy, Infinity);
      const axis = k >= 0 ? d.curves[k].axis : 'y';
      m = { kind, pane: p.pane, y: u.posToVal(p.py, axis), axis };
    } else {
      const k = pickCurve(d.x, d.curves, x, p.py, toPy, Infinity);
      if (k < 0) return;
      m = { kind, pane: p.pane, x, trace: d.curves[k].label };
    }
    const r = addMarker(markers, m);
    setMarkers(r.list);
    setSelMarker(r.added);
  };
  /** cursores activos, con el A en el medio de lo que se ve si no estaba */
  const startCursors = (extra: Cursors = {}) => {
    setCursorMode(true);
    const d = data.find((x, k) => x.x.length && !isF(k));
    if (cursors.a !== undefined || !d) return setCursors({ ...cursors, ...extra });
    const [lo, hi] = xRange ?? [d.x[0], d.x[d.x.length - 1]];
    setCursors({ ...cursors, a: d.log ? Math.sqrt(lo * hi) : (lo + hi) / 2, ...extra });
  };
  /** lo que el menú del botón derecho de una traza agrega a lo propio del panel */
  const traceActions = (i: number, ti: number): ContextItem[] => {
    const tt = panes[i]?.traces[ti];
    if (!tt) return [];
    const items: ContextItem[] = [];
    if (isTran && !isF(i)) items.push({ label: t('DFT of this trace'), onClick: () => (setDftOpen(true), addDft(tt.expr)) });
    if (isTran && tt.dft) items.push({ label: t('Edit the DFT (window and sampling)'), onClick: () => startDftEdit(i, ti) });
    const label = data[i]?.curves.find((c) => c.trace === ti)?.label;
    if (label !== undefined)
      for (const [k, name] of [['ta', 'A'], ['tb', 'B']] as const)
        items.push({
          label: t('Cursor {name} on this trace', { name }),
          onClick: () => (isF(i) ? (setCursorMode(true), setFCursors((c) => ({ ...c, [k]: label }))) : startCursors({ [k]: label })),
        });
    // orden de dibujo: la última de la leyenda queda encima de las demás
    const n = panes[i].traces.length;
    if (n > 1) {
      if (ti < n - 1) items.push({ label: t('Bring to front'), onClick: () => update(i, (p) => reorderTrace(p, ti, n - 1)) });
      if (ti > 0) items.push({ label: t('Send to back'), onClick: () => update(i, (p) => reorderTrace(p, ti, 0)) });
    }
    panes.forEach((p, j) => {
      if (j !== i && acceptsTrace(p, tt) && !p.traces.some((o) => sameTrace(o, tt))) items.push({ label: t('Move to pane {n}', { n: j + 1 }), onClick: () => moveTrace(i, ti, j) });
    });
    if (panes[i].traces.length > 1)
      items.push({
        label: t('Move to a new pane'),
        onClick: () => {
          setPanes([...panes.map((p, k) => (k === i ? { ...p, traces: p.traces.filter((_, j) => j !== ti) } : p)), { traces: [tt] }]);
          setActive(panes.length);
        },
      });
    return items;
  };

  useImperativeHandle(handle, () => ({
    addDft,
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
          setRRanges({});
          return zoomTo(null, {});
        case 'zoomBox':
          setRemoving(false);
          return setZoomMode(true);
        case 'zoomPrev': {
          const prev = zoomHistory.current.pop();
          dropWheel();
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
          setMarkers(remapPanes(markers, { swap: [i, j] }));
          return setActive(j);
        }
        case 'removeTraces':
          setZoomMode(false);
          return setRemoving(true);
        case 'cursor':
          return startCursors();
        case 'clearCursors':
          setFCursors({});
          setCursors({});
          return setCursorMode(false);
        case 'markPoint':
          return placeMarker('m');
        case 'markV':
          return placeMarker('v');
        case 'markH':
          return placeMarker('h');
        case 'markA':
          return placeMarker('a');
        case 'markD':
          return placeMarker('d');
        case 'clearMarkers':
          return setMarkers([]);
        case 'deleteMarker':
          if (selMarker) setMarkers(markers.filter((m) => !sameMarker(m, selMarker)));
          return setSelMarker(null);
        case 'cancel':
          setSelMarker(null);
          setZoomMode(false);
          return setRemoving(false);
      }
    },
    markerMode: () => markerMode,
    markerSelected: () => !!selMarker,
  }));

  const range: Range | null = xRange;
  const isTran = scaleName === 'time';
  // el nombre corto alcanza: el título «Window» va como encabezado de la lista
  const windowName: Record<DftWindow, string> = {
    hann: t('Hann'),
    hamming: t('Hamming'),
    blackman: t('Blackman'),
    blackmanharris: t('Blackman-Harris'),
    nuttall: t('Nuttall'),
    blackmannuttall: t('Blackman-Nuttall'),
    flattop: t('Flat top'),
    bartlett: t('Bartlett (triangular)'),
    welch: t('Welch'),
    cosine: t('Cosine'),
    gauss: t('Gaussian (σ = 0.4)'),
    kaiser: t('Kaiser (β = 9)'),
    tukey: t('Tukey (α = 0.5)'),
    rect: t('Rectangular'),
  };
  const timeData = data.filter((_, k) => !isF(k));
  const freqData = data.filter((_, k) => isF(k));
  const unplaced = cursorMode && cursors.a === undefined && cursors.b === undefined;
  const previewX = unplaced ? hoverX : undefined;
  const editedTrace = dftEdit ? panes[dftEdit.pane]?.traces[dftEdit.trace] : undefined;
  const allTraces = panes.flatMap((p) => p.traces);
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
      <button
        className={markerMode ? 'active' : ''}
        onClick={() => setMarkerMode((v) => !v)}
        title={t('Markers: a click puts a marker on the trace. With the mouse over the plot: M marker, V and H vertical and horizontal lines (select one to read where it cuts the traces), A and D two markers and their differences; drag them to move them (Delete removes the selected one, Shift+M all of them)')}
      >
        {t('Markers')}
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
      {/* la DFT es un grupo aparte */}
      {isTran && <span className="tool-sep" aria-hidden />}
      {isTran && (
        <button
          className={dftOpen ? 'active' : ''}
          onClick={() => {
            // al abrirla ya se elige la traza (⌖)
            setDftOpen(!dftOpen);
            setDftPicking(!dftOpen);
            setDftEdit(null);
          }}
          title={t('Spectrum (DFT) and harmonic distortion of a trace')}
        >
          DFT
        </button>
      )}
      {dftOpen && isTran && (
        <span className="dft-tools">
          <select value={dftWindow} aria-label={t('Window')} onChange={(e) => setDftWindow(e.target.value as DftWindow)}>
            <optgroup label={t('Window')}>
              {WINDOWS.map(([w]) => (
                <option key={w} value={w}>{windowName[w]}</option>
              ))}
            </optgroup>
          </select>
          {(
            [
              ['from', 't₀', 's', t('Start of the sampling (empty: the start of the zoom, or of the simulation)'), t('DFT start time')],
              ['to', 't₁', 's', t('End of the sampling (empty: the end of the zoom, or of the simulation)'), t('DFT end time')],
              ['fs', 'fs', 'Hz', t('Sample rate (empty: the density of the simulated points, rounded up to 1, 2 or 5 × 10ⁿ)'), t('DFT sample rate')],
            ] as const
          ).map(([k, name, unit, title, aria]) => (
            <label key={k} className={`dft-field${badField(k) ? ' bad' : ''}`} title={title}>
              {name}
              <input
                aria-label={aria}
                value={dftText[k]}
                spellCheck={false}
                placeholder={dftPreview ? si(dftPreview[k]) : ''}
                onChange={(e) => setDftText((old) => ({ ...old, [k]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && dftEdit && applyDftEdit()}
              />
              {unit}
            </label>
          ))}
          {dftEdit ? (
            <>
              <button className="primary" disabled={!!dftError} onClick={applyDftEdit}>
                {t('Apply')}
              </button>
              <button onClick={() => setDftEdit(null)}>{t('Cancel')}</button>
            </>
          ) : (
            <button
              className={`pick-btn dft-pick${dftPicking ? ' active' : ''}`}
              aria-label={t('Signal for the DFT')}
              title={t('Pick the signal for the DFT: a trace in the legend, or a wire or component with the probe (Esc cancels)')}
              disabled={!!dftError}
              onClick={() => setDftPicking((v) => !v)}
            >
              ⌖
            </button>
          )}
          {dftPreview && (
            <span className={`hint plot-info dft-sampling${dftError ? ' err' : ''}`}>
              {editedTrace ? `${t('Editing {name}', { name: traceLabel(editedTrace, allTraces) })} · ` : ''}
              {dftError ||
                t('{n} samples · Δf = {df}Hz', {
                  n: dftN.toLocaleString(locale()),
                  df: si(dftPreview.fs / dftN),
                })}
            </span>
          )}
        </span>
      )}
    </>
  );
  const allVisible = data.flatMap((d) => d.curves.filter((c) => !c.hidden));
  const fUnplaced = cursorMode && fCursors.a === undefined && fCursors.b === undefined;

  return (
    <div className={`plot-panel${dftPicking ? ' dft-picking' : ''}`} data-marker-readings={markers.length ? markerReadings(markers, data).join('\n') : undefined}>
      {toolsHost ? createPortal(tools, toolsHost) : <div className="plot-tools">{tools}</div>}
      {(zoomMode || removing) && (
        <p className="hint plot-info">{zoomMode ? t('Drag a box to zoom · Esc cancels') : t('Click a trace\'s name to remove it · Esc finishes')}</p>
      )}
      {plot.info && <p className="hint plot-info">{plot.info}</p>}
      {/* cursores y medidas: a la derecha de los paneles con los resultados abajo (son anchos y
          bajos); debajo con los resultados al costado */}
      <div className={`plot-main${side ? '' : ' beside'}`}>
      <div className="panes" ref={panesRef}>
        {panes.map((p, i) => (
          <Fragment key={i}>
          {i > 0 && (
            <div
              className="pane-split"
              role="separator"
              aria-orientation="horizontal"
              aria-label={t('Resize panes {a} and {b}', { a: i, b: i + 1 })}
              tabIndex={0}
              title={t('Drag to change the height of the panes · double-click: equal heights')}
              onPointerDown={(e) => startSplit(i - 1, e)}
              onDoubleClick={resetSizes}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                e.preventDefault();
                resizePanes(i - 1, e.key === 'ArrowUp' ? -16 : 16, true);
              }}
            />
          )}
          <PaneView
            index={i}
            pane={p}
            data={data[i]}
            active={i === active && panes.length > 1}
            onActivate={() => setActive(i)}
            // el único panel también se borra (#312): queda uno vacío, donde cae lo próximo que se mida
            canRemove={panes.length > 1 || p.traces.length > 0}
            onRemove={() => {
              setPanes(panes.length > 1 ? panes.filter((_, k) => k !== i) : [{ traces: [] }]);
              setMarkers((old) => remapPanes(old, { remove: i }));
              // (el zoom de los paneles de DFT que siguen se corre con ellos)
              setFRanges((old) => Object.fromEntries(Object.entries(old).flatMap(([k, v]) => (+k === i ? [] : [[+k > i ? +k - 1 : +k, v]]))));
            }}
            onChange={(f) => update(i, f)}
            onDropTrace={(from, ti) => moveTrace(from, ti, i)}
            xRange={isF(i) ? (fRanges[i] ?? null) : range}
            yRange={yRanges[i] ?? null}
            rRange={rRanges[i] ?? null}
            onZoom={(r) => (isF(i) ? setFRange(i, r) : r ? zoomTo(r) : (setRRanges({}), zoomTo(null, {})))}
            onWheelZoom={(r) => queueWheel((w) => (isF(i) ? (w.f[i] = r) : (w.x = { v: r })))}
            onWheelY={(r) => queueWheel((w) => (w.y[i] = r))}
            onWheelR={(r) => queueWheel((w) => (w.r[i] = r))}
            wheelPending={() => wheelPending(i)}
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
            onPickTrace={dftPicking && !isF(i) && !dftError ? addDft : undefined}
            samples={dftPreview && !dftError && !isF(i) && !p.digital ? { ...dftPreview, n: dftN } : undefined}
            labelOf={(tt) => traceLabel(tt, allTraces)}
            traceActions={(ti) => traceActions(i, ti)}
            showGrid={showGrid}
            cursorMode={cursorMode}
            cursors={isF(i) ? fCursors : cursors}
            onCursor={(c) => (isF(i) ? setFCursors : setCursors)((old) => ({ ...old, ...c }))}
            previewX={isF(i) ? undefined : previewX}
            onHoverX={unplaced && !isF(i) ? setHoverX : undefined}
            syncKey={isF(i) ? 'turbospice-dft' : 'turbospice'}
            onHoverExpr={onHoverExpr}
            marks={marks}
            register={(u) => (u ? charts.current.set(i, u) : charts.current.delete(i))}
            markerMode={markerMode}
            markers={markers.filter((m) => m.pane === i)}
            allMarkers={markers}
            selMarker={selMarker}
            onSelectMarker={setSelMarker}
            onMoveMarker={(m, patch) => setMarkers((old) => old.map((o) => (sameMarker(o, m) ? { ...o, ...patch } : o)))}
            onPlaceMarker={(px, py) => placeMarker('m', { pane: i, px, py })}
            onPointer={(p) => {
              if (p) pointer.current = { pane: i, ...p };
              else if (pointer.current?.pane === i) pointer.current = null;
            }}
            onAddBelow={
              i === panes.length - 1
                ? () => {
                    setPanes([...panes, { traces: [] }]);
                    setActive(panes.length);
                  }
                : undefined
            }
          />
          </Fragment>
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
  /** eje derecho (corrientes o fase) fijo por la rueda sobre él; null = todo el rango */
  rRange: Range | null;
  onWheelR(r: Range): void;
  /** rangos pedidos por la rueda o el paneo que todavía no se aplicaron (x: null = sin zoom) */
  wheelPending(): { x?: { v: Range | null }; y?: Range; r?: Range };
  /** recuadro arrastrado */
  onBoxZoom(x: Range, y: Range): void;
  zoomMode: boolean;
  removing: boolean;
  /** nombre de la traza en la leyenda (DFT(…), #260) */
  labelOf(tt: Trace): string;
  /** acciones de la traza para su menú del botón derecho (DFT, cursores, mover de panel) */
  traceActions(ti: number): ContextItem[];
  /** modo ⌖ de la DFT: un click en la cápsula elige la traza */
  onPickTrace?(expr: string): void;
  /** muestreo de la DFT que se está armando: se marcan el rango y, si se distinguen, las muestras */
  samples?: { from: number; to: number; fs: number; n: number };
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
  /** grupo de sincronización del cursor de uPlot (los paneles de DFT tienen otro eje X) */
  syncKey: string;
  /** modo Markers: un click pone un marker sobre la curva */
  markerMode: boolean;
  /** markers de este panel */
  markers: Marker[];
  /** todos (A y D pueden estar en paneles distintos) */
  allMarkers: Marker[];
  selMarker: Pick<Marker, 'kind' | 'id'> | null;
  onSelectMarker(m: Pick<Marker, 'kind' | 'id'> | null): void;
  onMoveMarker(m: Marker, patch: Partial<Marker>): void;
  onPlaceMarker(px: number, py: number): void;
  /** mouse sobre el área del gráfico (px desde su esquina) o afuera (null) */
  onPointer(p: { px: number; py: number } | null): void;
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
  const rRef = useRef(props.rRange);
  rRef.current = props.rRange;
  const programmatic = useRef(false);
  /** lleva el eje X del gráfico a [min, max] (con los datos decimados para ese rango) */
  const setX = useRef<((min: number, max: number) => void) | null>(null);
  /** el arrastre en curso empezó en este gráfico */
  const pressed = useRef(false);
  const [hover, setHover] = useState<number | null>(null);
  // valor escrito a mano en la etiqueta de una línea (V, H) o de un cursor: dónde va la caja y qué hace
  const [edit, setEdit] = useState<{ x: number; y: number; w: number; text: string; commit(v: number): void } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // menú del botón derecho sobre una traza de la leyenda
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; ti: number } | null>(null);
  /** cápsula bajo el mouse (muestra la información de su DFT) */
  const [chipHover, setChipHover] = useState<number | null>(null);
  const colorInputs = useRef(new Map<number, HTMLInputElement>());
  // los colores se leen del CSS al crear el gráfico: al cambiar de tema hay que recrearlo (si no,
  // la grilla del tema oscuro queda sobre el fondo claro)
  const [scheme, setScheme] = useState(0);
  const lineW = useTraceWidth();
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
    const rightScale = data.curves.some((c) => c.axis === 'ph') ? 'ph' : 'i';
    const rightUnit = rightScale === 'ph' ? '°' : data.iUnit;
    /** eje bajo el mouse (la rueda acerca ése): se resalta para que se sepa cuál es */
    let axisHover: 'left' | 'right' | 'bottom' | null = null;
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
    // Dos escalas Y sin zoom: rangos y marcas elegidos para que las dos usen la misma grilla (#300).
    // Con zoom en alguna, las marcas de la derecha van a la altura de las de la izquierda.
    let aligned: Aligned | null | undefined;
    const alignedY = () => {
      if (aligned === undefined) {
        const full = (scale: string) => safeRange(null as unknown as uPlot, fullY(scale)?.[0] ?? null, fullY(scale)?.[1] ?? null, scale) as Range;
        const most = Math.max(3, Math.floor(el.clientHeight / 40));
        const divs = [4, 5, 6, 7, 8].filter((n) => n <= most);
        aligned = hasRight ? alignScales(full('y'), full(rightScale), divs.length ? divs : [3]) : null;
      }
      return yRef.current || rRef.current ? null : aligned;
    };
    const divsOf = (u: uPlot) => Math.max(2, Math.round(u.bbox.height / devicePixelRatio / 45));
    const leftSplits = (u: uPlot, _i: number, min: number, max: number) => alignedY()?.leftTicks ?? niceTicks(min, max, divsOf(u));
    const rightSplits = (u: uPlot, _i: number, min: number, max: number) => {
      const a = alignedY();
      if (a) return a.rightTicks;
      const { min: y0, max: y1 } = u.scales.y;
      if (y0 == null || y1 == null || !(y1 > y0)) return niceTicks(min, max, divsOf(u));
      return mapTicks(niceTicks(y0, y1, divsOf(u)), [y0, y1], [min, max]);
    };
    // X sin zoom: todo, o hasta donde llegan todas las DFT (con zoom out se ve el resto)
    const x0 = data.x[0];
    const x1 = data.x[data.x.length - 1];
    const home = data.home ?? [x0, x1];
    /** rango de X pedido por la rueda o el paneo, dentro de los datos (null: sin zoom) */
    const toX = (lo: number, hi: number): Range | null => (!data.home && lo <= x0 && hi >= x1 ? null : [Math.max(lo, x0), Math.min(hi, x1)]);
    let raf = 0;
    /** etiquetas que se editan con un click (en px del canvas): las de las líneas V y H y las de los cursores */
    let labelHits: { x: number; y: number; w: number; h: number; value: number; commit(v: number): void }[] = [];
    const stepped = uPlot.paths.stepped!({ align: 1 });
    /** markers de este panel (puntos, líneas V y H, el par A/D) con sus lecturas */
    const drawMarkers = (u: uPlot, ctx: CanvasRenderingContext2D, k: { fg: string; bg: string; accent: string; unitOf(c: Curve): string }) => {
      const L = live.current;
      const list = L.markers;
      // (para los e2e: el canvas no se puede leer)
      u.root.dataset.markers = list.map(markerName).join('|');
      if (!list.length) return;
      const dpr = devicePixelRatio;
      const { left, top, width, height } = u.bbox;
      const xu = xUnit(data.xName);
      const inX = (px: number) => px >= left && px <= left + width;
      const inY = (py: number) => py >= top && py <= top + height;
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, width, height);
      ctx.clip();
      ctx.font = `${11 * dpr}px system-ui`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      /** recuadro con texto junto a (x, y): arriba a la derecha si entra */
      const label = (lines: string[], x: number, y: number, color: string, edit?: { value: number; commit(v: number): void }) => {
        const lh = 14 * dpr;
        const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 8 * dpr;
        const h = lh * lines.length + 4 * dpr;
        let bx = x + 6 * dpr;
        if (bx + w > left + width) bx = x - w - 6 * dpr;
        let by = y - h - 6 * dpr;
        if (by < top) by = y + 6 * dpr;
        by = Math.min(by, top + height - h);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = k.bg;
        ctx.fillRect(bx, by, w, h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = dpr;
        ctx.setLineDash([]);
        ctx.strokeRect(bx, by, w, h);
        ctx.fillStyle = k.fg;
        lines.forEach((l, n) => ctx.fillText(l, bx + 4 * dpr, by + lh * (n + 1) - dpr));
        if (edit) labelHits.push({ x: bx, y: by, w, h, ...edit });
      };
      const dot = (x: number, y: number, color: string, r = 3.5) => {
        if (!inX(x) || !inY(y)) return;
        ctx.beginPath();
        ctx.arc(x, y, r * dpr, 0, 2 * Math.PI);
        ctx.fillStyle = k.bg;
        ctx.fill();
        ctx.lineWidth = 2 * dpr;
        ctx.strokeStyle = color;
        ctx.setLineDash([]);
        ctx.stroke();
      };
      const stroke = (x0: number, y0: number, x1: number, y1: number, color: string, w: number, dash: number[]) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = w * dpr;
        ctx.setLineDash(dash.map((d) => d * dpr));
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      };
      const curveOf = (m: Marker) => data.curves.find((c) => c.label === m.trace && !c.hidden);
      /** posición en el canvas de un marker de punto (M, A, D) */
      const pointOf = (m: Marker) => {
        const c = curveOf(m);
        if (!c || m.x === undefined) return null;
        const y = valueAt(data.x, c.y, m.x);
        return { c, y, px: u.valToPos(m.x, 'x', true), py: u.valToPos(y, c.axis, true) };
      };
      for (const m of list) {
        const sel = !!L.selMarker && sameMarker(m, L.selMarker);
        const color = sel ? k.accent : k.fg;
        if (m.kind === 'v') {
          const px = u.valToPos(m.x!, 'x', true);
          if (!inX(px)) continue;
          stroke(px, top, px, top + height, color, sel ? 2 : 1.25, [6, 3]);
          label([`${markerName(m)}  ${fmt(m.x!, xu)}`], px, top, color, { value: m.x!, commit: (x) => L.onMoveMarker(m, { x }) });
          for (const cut of verticalCuts(m.x!, data.x, data.curves)) {
            const c = data.curves.find((o) => o.label === cut.label)!;
            const py = u.valToPos(cut.y, cut.axis, true);
            dot(px, py, c.color);
            if (sel && inY(py)) label([fmt(cut.y, k.unitOf(c))], px, py, c.color);
          }
        } else if (m.kind === 'h') {
          const axis = m.axis ?? 'y';
          const py = u.valToPos(m.y!, axis, true);
          if (!inY(py)) continue;
          stroke(left, py, left + width, py, color, sel ? 2 : 1.25, [6, 3]);
          const unit = axis === 'ph' ? '°' : axis === 'i' ? data.iUnit : data.yUnit;
          // (el nombre a la derecha: a la izquierda suelen estar los cortes)
          label([`${markerName(m)}  ${fmt(m.y!, unit)}`], left + width, py, color, { value: m.y!, commit: (y) => L.onMoveMarker(m, { y }) });
          for (const cut of horizontalCuts(m.y!, axis, data.x, data.curves, 32)) {
            const c = data.curves.find((o) => o.label === cut.label)!;
            const px = u.valToPos(cut.x, 'x', true);
            dot(px, py, c.color);
            if (sel && inX(px)) label([fmt(cut.x, xu)], px, py, c.color);
          }
        } else {
          const p = pointOf(m);
          if (!p) continue;
          dot(p.px, p.py, p.c.color, sel ? 5 : 4);
          if (inX(p.px) && inY(p.py)) label([`${markerName(m)}: ${fmt(m.x!, xu)}, ${fmt(p.y, k.unitOf(p.c))}`], p.px, p.py, sel ? k.accent : p.c.color);
        }
      }
      // A y D en este panel: la recta entre los dos y las diferencias
      const a = list.find((m) => m.kind === 'a');
      const d = list.find((m) => m.kind === 'd');
      const pa = a && pointOf(a);
      const pd = d && pointOf(d);
      if (pa && pd && a.x !== undefined && d.x !== undefined) {
        stroke(pa.px, pa.py, pd.px, pd.py, k.accent, 1.25, [2, 3]);
        const dd = delta({ x: a.x, y: pa.y }, { x: d.x, y: pd.y });
        label(
          [`Δx ${fmt(dd.dx, xu)}`, `Δy ${fmt(dd.dy, k.unitOf(pd.c))}`, `${t('slope')} ${fmt(dd.slope)}`, ...(xu === 's' ? [`1/Δx ${fmt(dd.inv, 'Hz')}`] : [])],
          (pa.px + pd.px) / 2,
          (pa.py + pd.py) / 2,
          k.accent,
        );
      }
      ctx.restore();
    };
    const opts: uPlot.Options = {
      width: Math.max(100, el.clientWidth),
      height: Math.max(80, el.clientHeight),
      legend: { show: false },
      scales: {
        x: { time: false, distr: data.log ? 3 : 1, range: (_u, min, max) => exactRange(min, max, data.log) as uPlot.Range.MinMax, ...(xRange ? { min: xRange[0], max: xRange[1] } : data.home ? { min: home[0], max: home[1] } : {}) },
        y: { range: (u, min, max) => yRef.current ?? alignedY()?.left ?? whole('y')(u, min, max, 'y') },
        i: { range: (u, min, max) => rRef.current ?? (rightScale === 'i' ? alignedY()?.right : null) ?? whole('i')(u, min, max, 'i') },
        ph: { range: (u, min, max) => rRef.current ?? (rightScale === 'ph' ? alignedY()?.right : null) ?? whole('ph')(u, min, max, 'ph') },
      },
      axes: [
        {
          space: (_u, _i, min, max) => (data.log ? 50 : axisSpace(min, max)),
          values: (_u, tt) => {
            if (!data.log) return axisTicks(tt);
            const lab = logLabeled(tt);
            return tt.map((v, i) => (lab[i] ? si(v!, 3) : ''));
          },
          stroke: muted,
          grid: { stroke: grid, width: 1, show: showGrid },
          ticks: { stroke: grid, width: 1 },
        },
        { scale: 'y', values: ticks('Y'), ...(hasRight ? { splits: leftSplits } : {}), stroke: muted, grid: { stroke: grid, width: 1, show: showGrid }, ticks: { stroke: grid, width: 1 }, size: 58, label: data.yUnit || undefined, labelSize: 14 },
        ...(hasRight
          ? [{ scale: rightScale, side: 1, values: ticks('R'), splits: rightSplits, stroke: muted, grid: { show: false }, size: 58, label: rightUnit, labelSize: 14 } as uPlot.Axis]
          : []),
      ],
      series: [
        { label: data.xName },
        ...data.curves.map((c) => ({
          label: c.label,
          scale: c.axis,
          stroke: c.color,
          width: lineW,
          dash: c.dash ? [6, 4] : undefined,
          // nodos digitales (#209): cada valor vale hasta el punto siguiente
          ...(c.digital ? { paths: stepped } : {}),
          show: !c.hidden,
          spanGaps: false,
        })),
      ],
      cursor: {
        sync: { key: props.syncKey },
        // Arrastrar = siempre el recuadro entre los dos puntos, en X e Y (lo aplica setSelect). Con los
        // cursores activos no hay zoom por arrastre (Z lo fuerza). Se cambia en vivo, sin recrear el gráfico.
        drag: { x: live.current.zoomMode || !(live.current.cursorMode || live.current.markerMode), y: live.current.zoomMode || !(live.current.cursorMode || live.current.markerMode), setScale: false },
        points: { size: 6 },
        bind: {
          // doble click = ver todo, salvo con los cursores (dos clicks rápidos no deben reiniciar el zoom)
          dblclick: (_u, _t, handler) => (e) => {
            if (e.button === 0 && !live.current.cursorMode && !live.current.markerMode) handler(e);
            return null;
          },
        },
      },
      hooks: {
        setSelect: [
          (u) => {
            if ((live.current.cursorMode || live.current.markerMode) && !live.current.zoomMode) return;
            // (un recuadro cancelado con clic derecho o Esc se descarta al soltar)
            if (el.classList.contains('zoom-cancelled')) return u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
            // (los demás paneles reciben el mismo arrastre por la sincronización: lo aplica sólo el que lo empezó)
            if (!pressed.current) return;
            const s = u.select;
            // (un click o un recuadro de menos de 4 px de lado no hace nada)
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
            raf = requestAnimationFrame(() => {
              const l = u.cursor.left;
              // (con los datos decimados el índice de uPlot no es el de data.x: se busca el punto más cercano)
              setHover(!dec ? (u.cursor.idx ?? null) : l != null && l >= 0 ? nearestIndex(data.x, u.posToVal(l, 'x')) : null);
              live.current.onHoverX?.(l != null && l >= 0 ? u.posToVal(l, 'x') : undefined);
            });
          },
        ],
        setScale: [
          (u, key) => {
            if (key !== 'x' || programmatic.current) return;
            const { min, max } = u.scales.x;
            // uPlot cambió el eje por su cuenta (doble click): los datos decimados son de otro rango
            if (dec) {
              cancelAnimationFrame(redecimate);
              redecimate = requestAnimationFrame(() => refresh());
            }
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
            labelHits = [];
            u.root.dataset.rangeY = `${u.scales.y?.min}|${u.scales.y?.max}`;
            u.root.dataset.rangeR = `${u.scales[rightScale]?.min}|${u.scales[rightScale]?.max}`;
            const c = cursorsRef.current;
            const ctx = u.ctx;
            // el eje que acerca la rueda, levemente resaltado
            if (axisHover) {
              const { left, top, width, height } = u.bbox;
              // (la franja resaltada es la misma que responde a la rueda; el bbox va en píxeles del canvas)
              const px = uPlot.pxRatio;
              ctx.save();
              ctx.fillStyle = fg;
              ctx.globalAlpha = 0.08;
              if (axisHover === 'left') ctx.fillRect(left - AXIS_Y_BAND * px, top, AXIS_Y_BAND * px, height);
              else if (axisHover === 'bottom') ctx.fillRect(left, top + height, width, AXIS_X_BAND * px);
              else ctx.fillRect(left + width, top, AXIS_Y_BAND * px, height);
              ctx.restore();
            }
            // muestreo de la DFT que se está armando: lo que queda afuera, sombreado; adentro, un
            // punto en cada muestra de cada curva (si están a más de 4 px una de otra)
            const sm = live.current.samples;
            u.root.dataset.samples = '';
            if (sm && data.xName === 'time') {
              const { left, top, width, height } = u.bbox;
              const dpr = devicePixelRatio;
              const clampX = (v: number) => Math.min(left + width, Math.max(left, u.valToPos(v, 'x', true)));
              const a = clampX(sm.from);
              const b = clampX(sm.from + (sm.n - 1) / sm.fs);
              ctx.save();
              ctx.fillStyle = fg;
              ctx.globalAlpha = 0.07;
              ctx.fillRect(left, top, a - left, height);
              ctx.fillRect(b, top, left + width - b, height);
              ctx.globalAlpha = 0.8;
              ctx.strokeStyle = markColor.zero;
              ctx.lineWidth = dpr;
              ctx.setLineDash([4 * dpr, 3 * dpr]);
              for (const x of [a, b]) {
                ctx.beginPath();
                ctx.moveTo(x, top);
                ctx.lineTo(x, top + height);
                ctx.stroke();
              }
              ctx.setLineDash([]);
              const { min, max } = u.scales.x;
              if (min != null && max != null) {
                const k0 = Math.max(0, Math.ceil((min - sm.from) * sm.fs));
                const k1 = Math.min(sm.n - 1, Math.floor((max - sm.from) * sm.fs));
                const gap = width / ((max - min) * sm.fs);
                if (k1 >= k0 && gap >= 4 * dpr) {
                  u.root.dataset.samples = String(k1 - k0 + 1);
                  for (const c of data.curves) {
                    if (c.hidden) continue;
                    ctx.fillStyle = c.color;
                    for (let k = k0; k <= k1; k++) {
                      const tk = sm.from + k / sm.fs;
                      const py = u.valToPos(valueAt(data.x, c.y, tk), c.axis, true);
                      if (!Number.isFinite(py) || py < top || py > top + height) continue;
                      ctx.beginPath();
                      ctx.arc(u.valToPos(tk, 'x', true), py, Math.min(3, gap / (3 * dpr)) * dpr, 0, 2 * Math.PI);
                      ctx.fill();
                    }
                  }
                }
              }
              ctx.restore();
            }
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
            drawMarkers(u, ctx, { fg, bg, accent: markColor.zero, unitOf });
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
                // (el preliminar, que sigue al mouse, no se edita)
                const key = name === 'A' ? 'a' : 'b';
                if (c[key] !== undefined) labelHits.push({ x: bx, y: boxY, w, h: lh * lines.length + 4 * dpr, value: v, commit: (x) => live.current.onCursor({ [key]: x, sel: key }) });
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
    const finite = data.curves.every((c) => allFinite(c.y));
    const ys = data.curves.map((c) => (finite || allFinite(c.y) ? c.y : Array.from(c.y, (v) => (Number.isFinite(v) ? v : null))));
    // muchos puntos: uPlot recibe sólo lo visible, a lo sumo 4 puntos por columna de píxeles (el
    // mismo dibujo; si no, recorre todo en cada cuadro de la rueda o del paneo). Con huecos o
    // escalones (digital) va todo.
    const dec = data.x.length > DECIMATE_FROM && finite && !data.curves.some((c) => c.digital) ? decimator(data.x, data.curves.map((c) => c.y)) : null;
    const firstX = opts.scales!.x;
    let redecimate = 0;
    // (antes de crear el gráfico no se sabe dónde queda el área: de sobra, el ancho entero)
    const u: uPlot = new uPlot(
      opts,
      (dec ? dec.view(firstX.min ?? x0, firstX.max ?? x1, Math.max(100, el.clientWidth) * devicePixelRatio, data.log) : [data.x, ...ys]) as uPlot.AlignedData,
      el,
    );
    /** lo visible en [min, max], en las columnas de píxeles del área del gráfico */
    const view = (min: number, max: number) => dec!.view(min, max, u.bbox.width, data.log, u.bbox.left) as uPlot.AlignedData;
    setX.current = (min, max) => {
      programmatic.current = true;
      u.batch(() => {
        if (dec) u.setData(view(min, max), false);
        u.setScale('x', { min, max });
      });
      programmatic.current = false;
    };
    /** vuelve a decimar para el rango que muestra el gráfico (otro ancho, o uPlot cambió el eje) */
    const refresh = () => {
      const { min, max } = u.scales.x;
      if (dec && min != null && max != null) setX.current?.(min, max);
    };
    chart.current = u;
    live.current.register(u);
    const { over, root } = u;

    // Markers: se toman (y se arrastran) con el botón izquierdo en cualquier modo; con el modo
    // Markers, un click en otro lado pone uno sobre la curva. Van en captura, antes que el zoom y
    // los cursores.
    const posY = (e: PointerEvent) => {
      const r = over.getBoundingClientRect();
      return Math.min(Math.max(e.clientY - r.top, 0), r.height);
    };
    const hitMarker = (e: PointerEvent): Marker | undefined => {
      const r = over.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      if (px < 0 || py < 0 || px > r.width || py > r.height) return undefined;
      let best: Marker | undefined;
      let dist = GRAB + 2;
      for (const m of live.current.markers) {
        let d = Infinity;
        if (m.kind === 'v') d = Math.abs(u.valToPos(m.x!, 'x') - px);
        else if (m.kind === 'h') d = Math.abs(u.valToPos(m.y!, m.axis ?? 'y') - py);
        else {
          const c = data.curves.find((o) => o.label === m.trace && !o.hidden);
          if (!c) continue;
          d = Math.hypot(u.valToPos(m.x!, 'x') - px, u.valToPos(valueAt(data.x, c.y, m.x!), c.axis) - py);
        }
        if (d <= dist) [best, dist] = [m, d];
      }
      return best;
    };
    let mdrag: Marker | null = null;
    let onMark = false;
    /** etiqueta editable bajo el mouse (en px del canvas) */
    const hitLabel = (e: PointerEvent) => {
      const r = u.ctx.canvas.getBoundingClientRect();
      const dpr = devicePixelRatio;
      const px = (e.clientX - r.left) * dpr;
      const py = (e.clientY - r.top) * dpr;
      const h = labelHits.findLast((l) => px >= l.x && px <= l.x + l.w && py >= l.y && py <= l.y + l.h);
      return h && { ...h, cx: r.left + h.x / dpr, cy: r.top + h.y / dpr };
    };
    const markDown = (e: PointerEvent) => {
      if (e.button !== 0 || live.current.zoomMode || axisAt(e)) return;
      const lab = hitLabel(e);
      if (lab) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setEdit({ x: lab.cx, y: lab.cy, w: Math.max(90, lab.w / devicePixelRatio), text: si(lab.value, 6), commit: lab.commit });
        return;
      }
      const m = hitMarker(e);
      const L = live.current;
      if (!m && L.selMarker) L.onSelectMarker(null);
      if (!m && !L.markerMode) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      el.focus({ preventScroll: true });
      L.onActivate();
      if (!m) return L.onPlaceMarker(posX(e), posY(e));
      L.onSelectMarker(m);
      mdrag = m;
      root.setPointerCapture(e.pointerId);
    };
    const markMove = (e: PointerEvent) => {
      const r = over.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      live.current.onPointer(inside ? { px: e.clientX - r.left, py: e.clientY - r.top } : null);
      if (mdrag) {
        e.stopImmediatePropagation();
        live.current.onMoveMarker(mdrag, mdrag.kind === 'h' ? { y: u.posToVal(posY(e), mdrag.axis ?? 'y') } : { x: valX(e) });
        return;
      }
      const m = hitMarker(e);
      onMark = !!m || !!hitLabel(e);
      if (!m && onMark) over.style.cursor = 'text';
      if (m) over.style.cursor = m.kind === 'h' ? 'ns-resize' : m.kind === 'v' ? 'ew-resize' : 'move';
    };
    const markUp = (e: PointerEvent) => {
      if (!mdrag) return;
      mdrag = null;
      e.stopImmediatePropagation();
      if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
    };

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
    // (arrastrar con el izquierdo sobre un eje panea sólo esa escala)
    let pan: { id: number; x: number; y: number; sx: Range; sy: Range; sr: Range | null; axis: 'left' | 'right' | 'bottom' | null; moved: boolean; click: PointerEvent | null } | null = null;
    let panned = false; // para no abrir el menú contextual tras un paneo con el botón derecho
    const panStart = (e: PointerEvent) => {
      const axis = e.button === 0 ? axisAt(e) : null;
      if (e.button !== 1 && e.button !== 2 && !axis) return false;
      const { min: x0, max: x1 } = u.scales.x;
      const { min: y0, max: y1 } = u.scales.y;
      if (x0 == null || x1 == null || y0 == null || y1 == null) return false;
      e.preventDefault();
      el.focus({ preventScroll: true });
      const click = e.button === 2 && live.current.cursorMode && !live.current.zoomMode ? e : null;
      const { min: r0, max: r1 } = u.scales[rightScale] ?? {};
      pan = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: [x0, x1], sy: [y0, y1], sr: r0 != null && r1 != null ? [r0, r1] : null, axis, moved: false, click };
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
      if (!pan.axis) over.style.cursor = 'grabbing';
      const r = over.getBoundingClientRect();
      const { axis } = pan;
      if (axis === 'right') {
        if (!pan.sr || !(r.height > 0) || !dy) return;
        const [lo, hi] = panBy(pan.sr[0], pan.sr[1], dy / r.height);
        if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) live.current.onWheelR([lo, hi]);
        return;
      }
      if (r.width > 0 && dx && axis !== 'left') {
        const [lo, hi] = panBy(pan.sx[0], pan.sx[1], -dx / r.width, data.log, [x0, x1]);
        live.current.onWheelZoom(toX(lo, hi));
      }
      if (r.height > 0 && dy && axis !== 'bottom') {
        const [lo, hi] = panBy(pan.sy[0], pan.sy[1], dy / r.height);
        if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) live.current.onWheelY([lo, hi]);
        // sobre el gráfico (no sobre el eje izquierdo) el eje derecho acompaña
        if (!axis && pan.sr) {
          const [rlo, rhi] = panBy(pan.sr[0], pan.sr[1], dy / r.height);
          if (Number.isFinite(rlo) && Number.isFinite(rhi) && rhi > rlo) live.current.onWheelR([rlo, rhi]);
        }
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
    /** sobre qué eje está el mouse (a la altura del área del gráfico) */
    const axisAt = (e: { clientX: number; clientY: number }): 'left' | 'right' | 'bottom' | null => {
      const r = over.getBoundingClientRect();
      if (e.clientY > r.bottom) return e.clientX >= r.left && e.clientX <= r.right && e.clientY <= r.bottom + AXIS_X_BAND ? 'bottom' : null;
      if (e.clientY < r.top) return null;
      if (e.clientX < r.left) return r.left - e.clientX <= AXIS_Y_BAND ? 'left' : null;
      return e.clientX - r.right > 0 && hasRight && e.clientX - r.right <= AXIS_Y_BAND ? 'right' : null;
    };
    const hoverAxis = (a: 'left' | 'right' | 'bottom' | null) => {
      if (a === axisHover) return;
      axisHover = a;
      root.style.cursor = a === 'bottom' ? 'ew-resize' : a ? 'ns-resize' : '';
      root.title = a ? t('Wheel: zoom this axis · drag: move it') : '';
      u.redraw(false);
    };
    const move = (e: PointerEvent) => {
      if (pan) return panMove(e);
      if (dragging) live.current.onCursor({ [dragging]: valX(e) });
      else if (!onMark) over.style.cursor = live.current.cursorMode && grabbed(e) ? 'ew-resize' : live.current.markerMode ? 'crosshair' : '';
      if (!dragging) hoverAxis(axisAt(e));
    };
    const leave = () => (hoverAxis(null), live.current.onPointer(null));
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
    /** rango de una escala contando lo pedido y todavía no aplicado */
    const now = (k: 'x' | 'y' | 'r'): Range | null => {
      const p = live.current.wheelPending();
      if (k === 'x' && p.x) return p.x.v ?? home;
      if (k !== 'x' && p[k]) return p[k]!;
      const { min, max } = u.scales[k === 'r' ? rightScale : k] ?? {};
      return min != null && max != null ? [min, max] : null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = over.getBoundingClientRect();
      const k = wheelZoom(e);
      // (fracción del área bajo el mouse: desde abajo en Y, desde la izquierda en X)
      const fy = r.height > 0 ? 1 - Math.min(Math.max(e.clientY - r.top, 0), r.height) / r.height : 0.5;
      const fx = r.width > 0 ? Math.min(Math.max(e.clientX - r.left, 0), r.width) / r.width : 0.5;
      const onYAxis = e.clientX < r.left;
      if (e.ctrlKey) {
        // Ctrl+rueda: desplaza la vista en X sin cambiar el zoom (y sin el zoom del navegador)
        const cur = now('x');
        if (!cur) return;
        const [lo, hi] = panBy(cur[0], cur[1], Math.log(wheelZoom(e, e.deltaY || e.deltaX)) / 1.5, data.log, [x0, x1]);
        if (lo !== cur[0] || hi !== cur[1]) live.current.onWheelZoom(toX(lo, hi));
        return;
      }
      const zone = axisAt(e);
      // fuera de las franjas de los ejes (debajo del gráfico o más allá de sus números): la rueda no hace nada
      if (!zone && (e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right)) return;
      if (zone === 'right') {
        // eje derecho (corrientes o fase): su propia escala
        const cur = now('r');
        if (!cur) return;
        const [lo, hi] = zoomAt(cur, fy, k);
        if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) live.current.onWheelR([lo, hi]);
        return;
      }
      if (e.clientX > r.right) return; // a la derecha, sin eje derecho: nada
      if (onYAxis || e.shiftKey) {
        const cur = now('y');
        if (!cur) return;
        const [lo, hi] = zoomAt(cur, fy, k);
        if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) live.current.onWheelY([lo, hi]);
        return;
      }
      const cur = now('x');
      if (!cur) return;
      const [lo, hi] = zoomAt(cur, fx, k, data.log);
      live.current.onWheelZoom(toX(lo, hi));
    };
    // mientras se arrastra un zoom, el recuadro se resalta y el resto del gráfico se oscurece
    // (uPlot deja el recuadro vacío al terminar: la sombra va sólo durante el arrastre)
    const selStart = (e: PointerEvent) => {
      if (e.button === 0 && (!live.current.cursorMode || live.current.zoomMode) && !axisAt(e)) {
        el.classList.add('selecting');
        pressed.current = true;
      }
    };
    const selEnd = () => {
      el.classList.remove('selecting');
      // (uPlot cierra el arrastre en el mouseup, que llega después del pointerup)
      setTimeout(() => {
        pressed.current = false;
        el.classList.remove('zoom-cancelled');
      }, 0);
    };
    // clic derecho o Esc mientras se arrastra el recuadro: se cancela el zoom (sin abrir el menú)
    const selCancel = (e: MouseEvent | KeyboardEvent) => {
      if (!pressed.current || el.classList.contains('zoom-cancelled')) return;
      if (e instanceof KeyboardEvent ? e.key !== 'Escape' : e.button !== 2) return;
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('selecting');
      el.classList.add('zoom-cancelled');
      if (e instanceof MouseEvent) {
        const block = (ev: Event) => ev.preventDefault();
        window.addEventListener('contextmenu', block, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('contextmenu', block, { capture: true }), 500);
      }
    };
    root.addEventListener('pointerdown', markDown, true);
    root.addEventListener('pointermove', markMove, true);
    root.addEventListener('pointerup', markUp, true);
    root.addEventListener('pointercancel', markUp, true);
    root.addEventListener('pointerdown', selStart);
    window.addEventListener('pointerup', selEnd);
    window.addEventListener('pointercancel', selEnd);
    window.addEventListener('mousedown', selCancel, true);
    window.addEventListener('keydown', selCancel, true);
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerleave', leave);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('contextmenu', context);
    root.addEventListener('wheel', wheel, { passive: false });
    const ro = new ResizeObserver(() => {
      u.setSize({ width: Math.max(100, el.clientWidth), height: Math.max(80, el.clientHeight) });
      // (el área nueva se conoce cuando uPlot aplica el tamaño)
      if (dec) {
        cancelAnimationFrame(redecimate);
        redecimate = requestAnimationFrame(refresh);
      }
    });
    ro.observe(el);
    const reg = live.current.register;
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(redecimate);
      setX.current = null;
      ro.disconnect();
      root.removeEventListener('pointerdown', markDown, true);
      root.removeEventListener('pointermove', markMove, true);
      root.removeEventListener('pointerup', markUp, true);
      root.removeEventListener('pointercancel', markUp, true);
      root.removeEventListener('pointerdown', selStart);
      window.removeEventListener('pointerup', selEnd);
      window.removeEventListener('pointercancel', selEnd);
      window.removeEventListener('mousedown', selCancel, true);
      window.removeEventListener('keydown', selCancel, true);
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerleave', leave);
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
  }, [data, showGrid, zoomMode, scheme, lineW, props.syncKey]);

  useEffect(() => {
    const u = chart.current;
    if (!u) return;
    if (zoomMode) return;
    u.cursor.drag!.x = !(cursorMode || props.markerMode);
    u.cursor.drag!.y = !(cursorMode || props.markerMode);
    if (!cursorMode) u.over.style.cursor = '';
    u.redraw(false);
  }, [cursorMode, zoomMode, props.markerMode]);

  // (al fijar el eje X, uPlot vuelve a calcular el Y: el rango de yRef o la autoescala)
  useEffect(() => {
    const home = data.home ?? [data.x[0], data.x[data.x.length - 1]];
    const [min, max] = xRange ?? home;
    setX.current?.(min, max);
  }, [xRange, yRange, props.rRange, data, cursorMode, zoomMode, showGrid]);

  useEffect(() => {
    chart.current?.redraw(false);
  }, [cursors, props.markers, props.selMarker, props.marks, props.previewX, props.samples?.from, props.samples?.fs, props.samples?.n]);

  // corridas (pasos de .step, barridos .dc anidados) con el color de la primera traza
  const runLegend = data.curves.filter((c) => c.trace === data.curves[0]?.trace && c.axis === data.curves[0]?.axis && c.runLabel);

  // valor de cada traza en la posición del mouse (la primera curva de cada traza)
  const firstCurve = (ti: number) => data.curves.find((c) => c.trace === ti);
  const unitOf = (c: Curve | undefined) => (c?.axis === 'ph' ? '°' : c?.axis === 'i' ? data.iUnit : data.yUnit);

  /** menú del botón derecho de una traza: lo de la leyenda y lo que agrega el visor */
  const setTrace = (ti: number, f: (x: Trace) => Trace) => props.onChange((p) => ({ traces: p.traces.map((x, k) => (k === ti ? f(x) : x)) }));
  const traceMenu = (ti: number, tt: Trace): ContextItem[] => [
    { label: t('Expression'), onClick: () => undefined, edit: { value: tt.expr, onCommit: (v) => setTrace(ti, (x) => ({ ...x, expr: v })) } },
    { label: tt.hidden ? t('Show') : t('Hide'), onClick: () => setTrace(ti, (x) => ({ ...x, hidden: !x.hidden })) },
    { label: t('Color…'), onClick: () => colorInputs.current.get(ti)?.click() },
    ...props.traceActions(ti),
    { label: t('Remove'), onClick: () => props.onChange((p) => ({ traces: p.traces.filter((_, k) => k !== ti) })) },
  ];

  return (
    <div
      className={`pane${pane.digital ? ' digital' : ''}${props.active ? ' active' : ''}${dragOver ? ' drop' : ''}${removing ? ' removing' : ''}${zoomMode ? ' zooming' : ''}`}
      // con un tamaño elegido (divisor entre paneles), la altura es proporcional a él
      style={pane.size ? { flex: `${pane.size} 1 0` } : undefined}
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
              // soltar otra traza del mismo panel sobre esta: pasa a este lugar (cambia el orden
              // de dibujo); de otro panel, sigue de largo al panel (se mueve)
              onDrop={(e) => {
                const raw = e.dataTransfer.getData('application/x-trace');
                if (!raw) return;
                const { pane: from, trace } = JSON.parse(raw) as { pane: number; trace: number };
                if (from !== index) return;
                e.preventDefault();
                e.stopPropagation();
                setDragOver(false);
                props.onChange((p) => reorderTrace(p, trace, ti));
              }}
              onPointerEnter={() => (props.onHoverExpr?.(tt.expr), setChipHover(ti))}
              onPointerLeave={() => (props.onHoverExpr?.(undefined), setChipHover(null))}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ at: { x: e.clientX, y: e.clientY }, ti });
              }}
              title={err ?? t('Click: show/hide · drag onto another trace to reorder, or to another pane · color in the square')}
            >
              <label className="swatch" style={{ background: traceColor(tt, ti) }}>
                <input
                  type="color"
                  ref={(el) => (el ? colorInputs.current.set(ti, el) : colorInputs.current.delete(ti))}
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
              {/* un bus (#209): en qué radix se muestra */}
              {pane.digital && (c?.bits ?? 1) > 1 && (
                <select
                  className="radix"
                  value={tt.radix ?? 'hex'}
                  aria-label={t('Radix of {expr}', { expr: tt.expr })}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => props.onChange((p) => ({ traces: p.traces.map((x, k) => (k === ti ? { ...x, radix: e.target.value as Radix } : x)) }))}
                >
                  {RADIXES.map((r) => (
                    <option key={r} value={r}>
                      {radixLabel[r]}
                    </option>
                  ))}
                </select>
              )}
              {/* el lugar del valor queda reservado aunque el mouse no esté sobre el gráfico */}
          {err ? (
            <span className="err">{err}</span>
          ) : pane.digital ? (
            <span className={`val${hover === null ? ' idle' : ''}`}>{hover === null ? ' ' : formatRadix(v, c?.bits ?? 1, tt.radix)}</span>
          ) : (
            <span className={`val${hover === null ? ' idle' : ''}`}>{fix(v, unitOf(c))}</span>
          )}
              <button className="x" aria-label={t('Remove {expr}', { expr: props.labelOf(tt) })} onClick={() => props.onChange((p) => ({ traces: p.traces.filter((_, k) => k !== ti) }))}>
                ✕
              </button>
            </span>
          );
        })}
        {/* la DFT bajo el mouse: su fundamental y THD, en el lugar del valor de X */}
        {chipHover !== null && data.info?.[chipHover] ? (
          <span className="xval dft-info">{data.info[chipHover]}</span>
        ) : data.x.length > 0 && (
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
      {pane.digital && data.curves.length ? (
        <DigitalLanes
          x={data.x}
          curves={data.curves}
          radix={(i) => pane.traces[i]?.radix}
          xRange={xRange}
          cursors={cursors}
          cursorMode={cursorMode}
          onCursor={onCursor}
          onZoom={props.onZoom}
          onWheelZoom={props.onWheelZoom}
          pendingX={() => props.wheelPending().x}
          onHover={setHover}
          fill={!!pane.size}
        />
      ) : data.curves.length ? (
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
      {edit &&
        createPortal(
          <input
            className="label-edit"
            autoFocus
            aria-label={t('Value')}
            title={t('Write the value (SI prefixes: 2.5m, 10k) · Enter applies, Esc cancels')}
            style={{ position: 'fixed', left: edit.x, top: edit.y, width: edit.w, zIndex: 50 }}
            value={edit.text}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setEdit({ ...edit, text: e.target.value })}
            onBlur={() => setEdit(null)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') return setEdit(null);
              if (e.key !== 'Enter') return;
              const v = parseSi(edit.text);
              if (v === null) return;
              edit.commit(v);
              setEdit(null);
            }}
          />,
          document.body,
        )}
      {/* (en body: un ancestro del panel con transform haría que position: fixed no sea la ventana) */}
      {menu && pane.traces[menu.ti] && createPortal(<ContextMenu at={menu.at} onClose={() => setMenu(null)} items={traceMenu(menu.ti, pane.traces[menu.ti])} />, document.body)}
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

/** Lecturas de los markers (cada punto, los cortes de cada línea y D − A): las dibuja el gráfico; acá van
 * en texto a data-marker-readings, para los e2e (el canvas no se puede leer) */
function markerReadings(markers: Marker[], data: PaneData[]): string[] {
  const rows: { m: Marker; trace: string; color?: string; x: string; y: string }[] = [];
  const unitOf = (d: PaneData, axis: MarkerAxis) => (axis === 'ph' ? '°' : axis === 'i' ? d.iUnit : d.yUnit);
  let a: { x: number; y: number; d: PaneData; axis: MarkerAxis } | undefined;
  let dm: typeof a;
  for (const m of markers) {
    const d = data[m.pane];
    if (!d) continue;
    const xu = xUnit(d.xName);
    if (m.kind === 'v')
      for (const c of verticalCuts(m.x!, d.x, d.curves))
        rows.push({ m, trace: c.label, color: d.curves.find((o) => o.label === c.label)?.color, x: fix(m.x!, xu), y: fix(c.y, unitOf(d, c.axis)) });
    else if (m.kind === 'h') {
      const cuts = horizontalCuts(m.y!, m.axis ?? 'y', d.x, d.curves, 8);
      if (!cuts.length) rows.push({ m, trace: '—', x: '—', y: fix(m.y!, unitOf(d, m.axis ?? 'y')) });
      for (const c of cuts) rows.push({ m, trace: c.label, color: d.curves.find((o) => o.label === c.label)?.color, x: fix(c.x, xu), y: fix(m.y!, unitOf(d, m.axis ?? 'y')) });
    } else {
      const c = d.curves.find((o) => o.label === m.trace);
      const y = markerValue(m, d.x, d.curves);
      rows.push({ m, trace: m.trace ?? '', color: c?.color, x: fix(m.x!, xu), y: fix(y, c ? unitOf(d, c.axis) : '') });
      if (c && (m.kind === 'a' || m.kind === 'd')) (m.kind === 'a' ? (a = { x: m.x!, y, d, axis: c.axis }) : (dm = { x: m.x!, y, d, axis: c.axis }));
    }
  }
  const dd = a && dm ? delta(a, dm) : null;
  const xu = dm ? xUnit(dm.d.xName) : '';
  const out = rows.map((r) => [markerName(r.m), r.trace, r.x.trim(), r.y.trim()].join('|'));
  if (dd && dm) out.push(['D − A', fix(dd.slope).trim(), fix(dd.dx, xu).trim(), fix(dd.dy, unitOf(dm.d, dm.axis)).trim()].join('|'));
  return out;
}
