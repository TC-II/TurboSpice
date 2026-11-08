// Un panel del visor: el gráfico de uPlot con sus ejes, cursores, markers, zoom y leyenda.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import uPlot from 'uplot';
import { curveOn, type Curve, type PaneData } from './curves.ts';
import { nearestIndex, stepPoint, valueAt } from './measure.ts';
import { alignScales, exactRange, extent, logLabeled, mapTicks, niceTicks, panBy, wheelZoom, zoomAt, type Aligned } from './scales.ts';
import { decimator } from './decimate.ts';
import { axisSpace, axisTicks, sampleEvents, si } from './series.ts';
import { DigitalLanes } from './DigitalLanes.tsx';
import { formatRadix, RADIXES, radixLabel, type Radix } from './digital.ts';
import { PALETTE, cursorForClick, reorderTrace, traceColor, type CursorKey, type Cursors, type Pane, type Trace } from './view.ts';
import { type Marker } from './markers.ts';
import { parseSi } from './dft.ts';
import { useTraceWidth } from './lineWidth.ts';
import { ContextMenu, type ContextItem } from '../ui/ContextMenu.tsx';
import { useHostWindow, winOf } from '../ui/hostWindow.ts';
import { t } from '../i18n/i18n.ts';
import { type PzMark, type Range, GRAB, PAN_SLOP, DECIMATE_FROM, safeRange, fix, allFinite, mountIn, xUnit, AXIS_X_BAND, AXIS_Y_BAND } from './plotShared.ts';
import { drawAxisHover, drawSamples, drawPzMarks, drawMarkers, drawCursors, type LabelHit } from './paneDraw.ts';

// Arrastre de una traza entre paneles: el dato lleva el id de esta página, para no mover otra
// traza si se suelta una arrastrada desde otra pestaña (sus números de panel y traza son de allá)
const TRACE_DRAG = 'application/x-trace';
const PAGE_ID = Math.random().toString(36).slice(2);
const traceDragData = (pane: number, trace: number) => JSON.stringify({ page: PAGE_ID, pane, trace });
/** Panel y traza que se están soltando, o null si no vienen de esta página */
function droppedTrace(e: { dataTransfer: DataTransfer }): { pane: number; trace: number } | null {
  try {
    const d = JSON.parse(e.dataTransfer.getData(TRACE_DRAG)) as { page?: string; pane?: unknown; trace?: unknown };
    return d.page === PAGE_ID && typeof d.pane === 'number' && typeof d.trace === 'number' ? { pane: d.pane, trace: d.trace } : null;
  } catch {
    return null;
  }
}

/** dónde cae una traza arrastrada: dentro del panel o en uno nuevo arriba/abajo */
export type DropWhere = 'in' | 'above' | 'below';
/** franja junto al borde superior/inferior que crea un panel nuevo (px, a lo sumo un cuarto del alto) */
const EDGE_PX = 28;
function dropWhere(e: React.DragEvent<HTMLElement>): DropWhere {
  const r = e.currentTarget.getBoundingClientRect();
  const edge = Math.min(EDGE_PX, r.height / 4);
  return e.clientY - r.top < edge ? 'above' : r.bottom - e.clientY < edge ? 'below' : 'in';
}

export function PaneView(props: {
  index: number;
  pane: Pane;
  data: PaneData;
  active: boolean;
  onActivate(): void;
  canRemove: boolean;
  onRemove(): void;
  onChange(f: (p: Pane) => Pane): void;
  /** traza soltada: en el panel, o en un panel nuevo arriba/abajo si se soltó junto a ese borde */
  onDropTrace(fromPane: number, trace: number, where: DropWhere): void;
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
  const win = useHostWindow();
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
  const [dragOver, setDragOver] = useState<DropWhere | null>(null);
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
    const css = winOf(el).getComputedStyle(el);
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
      if (!extents.has(scale)) {
        const e = extent(
          data.x,
          data.curves.filter((c) => !c.hidden && c.axis === scale).map((c) => curveOn(c, data.x)),
        );
        // dB y grados que varían menos que el ruido numérico (un pasatodo: |H| = 0 dB ± 1e-15) son
        // una recta (±1 dB o ±1° a su alrededor): sin esto el eje se estira hasta mostrar ese ruido
        const flat = e && (scale === 'ph' || (scale === 'y' && data.yUnit === 'dB')) && e[1] - e[0] < 1e-6;
        const mid = e ? Math.round(((e[0] + e[1]) / 2) * 1e6) / 1e6 : 0;
        extents.set(scale, flat ? [mid - 1, mid + 1] : e);
      }
      return extents.get(scale)!;
    };
    const whole =
      (scale: string): uPlot.Range.Function =>
      (u, min, max) => {
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
    let labelHits: LabelHit[] = [];
    const stepped = uPlot.paths.stepped!({ align: 1 });
    /** markers de este panel (puntos, líneas V y H, el par A/D) con sus lecturas */
    const opts: uPlot.Options = {
      width: Math.max(100, el.clientWidth),
      height: Math.max(80, el.clientHeight),
      legend: { show: false },
      scales: {
        x: {
          time: false,
          distr: data.log ? 3 : 1,
          range: (_u, min, max) => exactRange(min, max, data.log) as uPlot.Range.MinMax,
          ...(live.current.xRange ? { min: live.current.xRange[0], max: live.current.xRange[1] } : data.home ? { min: home[0], max: home[1] } : {}),
        },
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
        {
          scale: 'y',
          values: ticks('Y'),
          ...(hasRight ? { splits: leftSplits } : {}),
          stroke: muted,
          grid: { stroke: grid, width: 1, show: showGrid },
          ticks: { stroke: grid, width: 1 },
          size: 58,
          label: data.yUnit || undefined,
          labelSize: 14,
        },
        ...(hasRight ? [{ scale: rightScale, side: 1, values: ticks('R'), splits: rightSplits, stroke: muted, grid: { show: false }, size: 58, label: rightUnit, labelSize: 14 } as uPlot.Axis] : []),
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
            if (axisHover) drawAxisHover(u, ctx, axisHover, fg);
            const sm = live.current.samples;
            u.root.dataset.samples = '';
            if (sm && data.xName === 'time') drawSamples(u, ctx, data, sm, fg, markColor.zero);
            if (data.xName === 'frequency') drawPzMarks(u, ctx, marksRef.current ?? [], markColor);
            drawMarkers(u, ctx, data, live.current, { fg, bg, accent: markColor.zero, unitOf }, labelHits);
            if (!live.current.cursorMode) return;
            drawCursors(u, ctx, { data, index: live.current.index, c, previewX: live.current.previewX, fg, bg, unitOf, hits: labelHits, onCursor: (x) => live.current.onCursor(x) });
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
    const dec =
      data.x.length > DECIMATE_FROM && finite && !data.curves.some((c) => c.digital)
        ? decimator(
            data.x,
            data.curves.map((c) => c.y),
          )
        : null;
    const firstX = opts.scales!.x;
    let redecimate = 0;
    // (antes de crear el gráfico no se sabe dónde queda el área: de sobra, el ancho entero)
    const u: uPlot = new uPlot(
      opts,
      (dec ? dec.view(firstX.min ?? x0, firstX.max ?? x1, Math.max(100, el.clientWidth) * devicePixelRatio, data.log) : [data.x, ...ys]) as uPlot.AlignedData,
      mountIn(el),
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
        let d: number;
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
        win.addEventListener('contextmenu', block, { capture: true, once: true });
        setTimeout(() => win.removeEventListener('contextmenu', block, { capture: true }), 500);
      }
    };
    root.addEventListener('pointerdown', markDown, true);
    root.addEventListener('pointermove', markMove, true);
    root.addEventListener('pointerup', markUp, true);
    root.addEventListener('pointercancel', markUp, true);
    root.addEventListener('pointerdown', selStart);
    win.addEventListener('pointerup', selEnd);
    win.addEventListener('pointercancel', selEnd);
    win.addEventListener('mousedown', selCancel, true);
    win.addEventListener('keydown', selCancel, true);
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerleave', leave);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('contextmenu', context);
    root.addEventListener('wheel', wheel, { passive: false });
    const ro = new (winOf(el).ResizeObserver)(() => {
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
      win.removeEventListener('pointerup', selEnd);
      win.removeEventListener('pointercancel', selEnd);
      win.removeEventListener('mousedown', selCancel, true);
      win.removeEventListener('keydown', selCancel, true);
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
  }, [data, showGrid, zoomMode, scheme, lineW, props.syncKey, win]);

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
    {
      label: t('Color'),
      onClick: () => undefined,
      swatches: { colors: PALETTE, current: traceColor(tt, ti), onPick: (color) => setTrace(ti, (x) => ({ ...x, color })) },
    },
    { label: tt.hidden ? t('Show') : t('Hide'), onClick: () => setTrace(ti, (x) => ({ ...x, hidden: !x.hidden })) },
    ...props.traceActions(ti),
    { label: t('Remove'), onClick: () => props.onChange((p) => ({ traces: p.traces.filter((_, k) => k !== ti) })) },
  ];

  return (
    <div
      className={`pane${pane.digital ? ' digital' : ''}${props.active ? ' active' : ''}${dragOver === 'in' ? ' drop' : dragOver ? ` drop-${dragOver}` : ''}${removing ? ' removing' : ''}${zoomMode ? ' zooming' : ''}`}
      // con un tamaño elegido (divisor entre paneles), la altura es proporcional a él
      style={pane.size ? { flex: `${pane.size} 1 0` } : undefined}
      onPointerDown={props.onActivate}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(TRACE_DRAG)) {
          e.preventDefault();
          setDragOver(dropWhere(e));
        }
      }}
      onDragLeave={(e) => {
        // pasar a un hijo (la leyenda, el gráfico) también dispara dragleave: sólo cuenta salir del panel
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(null);
      }}
      onDrop={(e) => {
        setDragOver(null);
        const d = droppedTrace(e);
        if (d) props.onDropTrace(d.pane, d.trace, dropWhere(e));
      }}
    >
      <div className="pane-legend">
        {pane.traces.map((tt: Trace, ti) => {
          const c = firstCurve(ti);
          const err = data.errors.get(ti);
          const v = hover !== null && c ? (c.x ? sampleEvents(c.x, c.y, Float64Array.of(data.x[hover]))[0] : c.y[hover]) : NaN;
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
              onDragStart={(e) => e.dataTransfer.setData(TRACE_DRAG, traceDragData(index, ti))}
              // soltar otra traza del mismo panel sobre esta: pasa a este lugar (cambia el orden
              // de dibujo); de otro panel, sigue de largo al panel (se mueve)
              onDrop={(e) => {
                const d = droppedTrace(e);
                if (!d || d.pane !== index) return;
                const trace = d.trace;
                e.preventDefault();
                e.stopPropagation();
                setDragOver(null);
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
        ) : (
          data.x.length > 0 && (
            <span className={`xval${hover === null || data.x[hover] === undefined ? ' idle' : ''}`}>
              {data.xName} = {fix(hover !== null ? (data.x[hover] ?? NaN) : NaN, xUnit(data.xName))}
            </span>
          )
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
        <p className="empty pane-empty">{pane.traces.length ? t('No trace can be plotted in this analysis.') : t('Empty pane: probe with the probe tool, type an expression or drag a trace here.')}</p>
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
          win.document.body,
        )}
      {/* (en body: un ancestro del panel con transform haría que position: fixed no sea la ventana) */}
      {menu && pane.traces[menu.ti] && createPortal(<ContextMenu at={menu.at} onClose={() => setMenu(null)} items={traceMenu(menu.ti, pane.traces[menu.ti])} />, win.document.body)}
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
