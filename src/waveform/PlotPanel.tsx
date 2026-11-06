// Visor de resultados: paneles apilados con eje X compartido, trazas como expresiones,
// Bode (magnitud y fase), cursores, medidas rápidas y exportación a CSV/PNG.
import { Fragment, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { useEvent } from '../ui/useEvent.ts';
import { useHostWindow } from '../ui/hostWindow.ts';
import { createPortal, flushSync } from 'react-dom';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { SimPlot } from '../engine/ngspice.ts';
import { dftSampling, curveOn, paneCurves, traceLabel, type ComplexMode, type PaneData } from './curves.ts';
import type { Resolver } from './expr.ts';
import { toCsv } from './measure.ts';
import { extent } from './scales.ts';
import { scaleOf, si } from './series.ts';
import { PALETTE, acceptsTrace, colorFor, sameDft, isDftPane, reorderTrace, sameTrace, traceColor, type Cursors, type Pane, type PlotState, type TraceDft } from './view.ts';
import { addMarker, asMarkers, pickCurve, remapPanes, sameMarker, type Marker, type MarkerAxis, type MarkerKind } from './markers.ts';
import { MAX_SAMPLES, parseSi, sampleCount, WINDOWS, type DftWindow } from './dft.ts';
import { Icon } from '../ui/icons.tsx';
import type { ContextItem } from '../ui/ContextMenu.tsx';
import { SideSplit, useSideSize } from '../ui/SideSplit.tsx';
import { locale, t } from '../i18n/i18n.ts';
import { type PzMark, type Range, safeRange } from './plotShared.ts';
import { PaneView } from './PaneView.tsx';
import { CursorTable, StatsTable } from './PlotTables.tsx';
import { exportPng, markerReadings } from './plotExport.ts';

/** Atajos del visor (con el mouse sobre los gráficos), como en LTspice */
export type PlotAction =
  | 'fit' // Espacio
  | 'zoomBox' // Z
  | 'zoomPrev' // Shift+Z
  | 'autoY' // Ctrl+Y
  | 'grid' // Ctrl+G
  | 'addTrace' // T
  | 'addPane' // P
  | 'addPaneBelow' // B
  | 'paneUp' // U
  | 'paneDown' // Shift+U
  | 'removeTraces' // Backspace
  | 'cursor' // C
  | 'clearCursors' // Shift+C
  | 'markPoint' // M
  | 'markV' // V
  | 'markH' // H
  | 'markA' // A
  | 'markD' // D
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
  /** T: ir a la caja de expresiones (está en la barra de resultados) */
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

export function PlotPanel({
  plot,
  runs,
  labels,
  panes,
  setPanes,
  resolver,
  mode,
  active,
  setActive,
  onHoverExpr,
  handle,
  marks,
  initial,
  onState,
  onFocusTrace,
  onDftPicking,
  side,
  toolsHost,
}: Props) {
  const win = useHostWindow();
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
      win.removeEventListener('pointermove', move);
      win.removeEventListener('pointerup', up);
      resizePanes(i, ev.clientY - y0, true, start);
    };
    win.addEventListener('pointermove', move);
    win.addEventListener('pointerup', up);
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
  const dftConfig = useCallback((): TraceDft => {
    const [tFrom, tTo, fs] = [parseSi(dftText.from), parseSi(dftText.to), parseSi(dftText.fs)];
    const from = tFrom ?? xRange?.[0];
    const to = tTo ?? xRange?.[1];
    return { window: dftWindow, ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}), ...(fs ? { fs } : {}) };
  }, [dftText, xRange, dftWindow]);
  const time = scale?.name === 'time' ? scale.real : undefined;
  // (la frecuencia automática recorre la simulación: sólo cuando cambia lo que la define)
  const dftPreview = useMemo(() => (time && dftOpen ? dftSampling(dftConfig(), time) : null), [time, dftOpen, dftConfig]);
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
  const notifyPicking = useEvent((on: boolean) => onDftPicking?.(on));
  useEffect(() => notifyPicking(dftPicking), [dftPicking, notifyPicking]);
  useEffect(() => () => notifyPicking(false), [notifyPicking]);
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
    win.addEventListener('keydown', onKey, true);
    return () => win.removeEventListener('keydown', onKey, true);
  }, [dftPicking, dftEdit, win]);
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
      for (const [k, name] of [
        ['ta', 'A'],
        ['tb', 'B'],
      ] as const)
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
      const cols = data.filter((_, k) => !isF(k)).flatMap((pd) => pd.curves.filter((c) => !c.hidden).map((c) => ({ name: c.label, ys: curveOn(c, pd.x) })));
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
            const e = extent(
              data[k].x,
              data[k].curves.filter((c) => !c.hidden && c.axis === 'y').map((c) => curveOn(c, data[k].x)),
              xr[0],
              xr[1],
            );
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
        title={t(
          'Cursors: first click = cursor A, second = cursor B, then a click moves the nearest one; dragging a line moves it (Alt: to the simulated points, arrows: point by point; C; Shift+C clears them)',
        )}
      >
        {t('Cursors')}
      </button>
      <button
        className={markerMode ? 'active' : ''}
        onClick={() => setMarkerMode((v) => !v)}
        title={t(
          'Markers: a click puts a marker on the trace. With the mouse over the plot: M marker, V and H vertical and horizontal lines (select one to read where it cuts the traces), A and D two markers and their differences; drag them to move them (Delete removes the selected one, Shift+M all of them)',
        )}
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
                <option key={w} value={w}>
                  {windowName[w]}
                </option>
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
  const readoutSplit = useSideSize('readouts', side ? 'column' : 'row');
  const fUnplaced = cursorMode && fCursors.a === undefined && fCursors.b === undefined;

  return (
    <div className={`plot-panel${dftPicking ? ' dft-picking' : ''}`} data-marker-readings={markers.length ? markerReadings(markers, data).join('\n') : undefined}>
      {toolsHost ? createPortal(tools, toolsHost) : <div className="plot-tools">{tools}</div>}
      {(zoomMode || removing) && <p className="hint plot-info">{zoomMode ? t('Drag a box to zoom · Esc cancels') : t("Click a trace's name to remove it · Esc finishes")}</p>}
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
        {/* cursores y stats: el divisor cambia su ancho (o su alto) (#336) */}
        {(cursorMode || (showStats && allVisible.length > 0)) && <SideSplit dir={side ? 'column' : 'row'} onSize={readoutSplit.set} min={100} reserve={200} label={t('Resize cursors and stats')} />}
        {(cursorMode || (showStats && allVisible.length > 0)) && (
          <div className="readouts" style={readoutSplit.style}>
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
