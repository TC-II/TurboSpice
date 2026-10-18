// Editor de esquemáticos: vista SVG con zoom/paneo y las herramientas de edición con el mouse.
// Los atajos de teclado y los diálogos los maneja App (necesitan estado de toda la app).
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { GRID, type AscDoc, type Orient, type Point, type Wire } from '../asc/model.ts';
import type { Library } from '../library/library.ts';
import type { Connectivity } from '../netlist/connectivity.ts';
import { addFlag, addText, addWire, deleteItems, dragSegment, dragSegmentStraight, moveItems, moveVertex, moveVertexStraight, placeSymbol, removeVertex, sameConnections, setWindows, splitWire, wiresOn } from './edit.ts';
import { inverseOffset, toWorld } from '../asc/transform.ts';
import { effectiveWindows } from '../asc/resolve.ts';
import type { TextWindow } from '../asc/model.ts';
import {
  boxesIntersect,
  distToSegment,
  hitTest,
  hitTestAll,
  labelAt,
  pinPoints,
  placementOrigin,
  snap,
  snapLabel,
  snapPoint,
  symbolBox,
  textBox,
  wireVertexAt,
  sameRef,
  type Box,
  type ItemRef,
} from './geometry.ts';
import type { PickWhat } from './simDialogs.tsx';
import { AnnotationLayer, NetNamesLayer, type Annotation, type NetName } from './NetNames.tsx';
import type { BiasInfo } from '../sim/bias.ts';
import { AlignedText, SchematicCanvas, SymbolView } from './SchematicCanvas.tsx';

export type Tool =
  | { kind: 'select' }
  | { kind: 'wire'; start: Point | null }
  | { kind: 'place'; type: string; orient: Orient }
  | { kind: 'flag'; name: string }
  | { kind: 'text'; text: string; textKind: 'directive' | 'comment' }
  | { kind: 'delete' }
  | { kind: 'probe' }
  /** elegir una red o una fuente para un diálogo (Esc cancela) */
  | { kind: 'pick'; what: PickWhat };

export interface EditorHandle {
  fit(): void;
  /** Posición del cursor en el esquemático (para pegar/duplicar) */
  cursor(): Point;
  /** Elemento SVG y caja del contenido (para exportar) */
  svg(): SVGSVGElement | null;
  contentBox(): Box | null;
  /** Centra la vista en una caja (p.ej. el componente de un problema) */
  centerOn(b: Box): void;
}

interface Props {
  doc: AscDoc;
  lib: Library;
  conn: Connectivity;
  commit(doc: AscDoc): void;
  tool: Tool;
  setTool(t: Tool): void;
  selection: ItemRef[];
  setSelection(s: ItemRef[]): void;
  onEdit(ref: ItemRef): void;
  /** editar un rótulo (InstName, Value…) de un símbolo: botón derecho o doble click sobre el texto */
  onEditLabel?(sym: number, win: number): void;
  onProbe?(ref: { net?: string; symbol?: number }): void;
  highlightNet?: string;
  /** etiquetas temporales con los nombres de las redes */
  netNames?: NetName[];
  /** click en una etiqueta temporal de una red sin nombre */
  onNameNet?(at: Point): void;
  /** punto de operación de lo que está bajo el cursor (tooltip) */
  describe?(target: { net?: string; symbol?: number }): BiasInfo | null;
  /** valores anotados sobre el esquemático */
  annotations?: Annotation[];
  /** herramienta pick: valor que se elegiría en ese lugar (nombre de red o de fuente) */
  pickValue?(target: { net?: string; symbol?: number }): string | null;
  onPicked?(value: string): void;
  handle?: Ref<EditorHandle>;
  /** Cambia cada vez que se carga otro documento: ajusta la vista a su contenido */
  docKey?: number;
}

interface View {
  cx: number;
  cy: number;
  /** píxeles por unidad de LTspice */
  scale: number;
}

type Drag =
  | { mode: 'pan'; sx: number; sy: number; view: View }
  | { mode: 'move'; start: Point; refs: ItemRef[]; detach: boolean; moved: boolean }
  | { mode: 'box'; start: Point; additive: boolean }
  /** mover un codo de cable; `base` es el documento con el cable ya partido si hizo falta */
  | { mode: 'vertex'; base: AscDoc; at: Point; free: boolean; commitBase: boolean }
  /** desplazar un tramo de cable en forma perpendicular */
  | { mode: 'segment'; start: Point; index: number }
  /**
   * arrastrar un rótulo (InstName/Value) de un símbolo; si su componente está seleccionado junto
   * con otros, el mismo rótulo de todos. `at` es el ancla de cada uno en el esquemático.
   */
  | { mode: 'label'; start: Point; sym: number; shift: boolean; items: { sym: number; win: number; w: TextWindow; at: Point }[]; moved: boolean };

function docBox(doc: AscDoc, lib: Library): Box | null {
  const boxes: Box[] = [];
  for (const w of doc.wires) boxes.push({ x1: Math.min(w.x1, w.x2), y1: Math.min(w.y1, w.y2), x2: Math.max(w.x1, w.x2), y2: Math.max(w.y1, w.y2) });
  for (const s of doc.symbols) boxes.push(symbolBox(s, lib.symbol(s.type), lib));
  for (const f of doc.flags) boxes.push({ x1: f.x - 16, y1: f.y - 16, x2: f.x + 16, y2: f.y + 16 });
  for (const t of doc.texts) if (!(t.kind === 'comment' && t.text.startsWith('.study '))) boxes.push(textBox(t));
  if (!boxes.length) return null;
  return {
    x1: Math.min(...boxes.map((b) => b.x1)),
    y1: Math.min(...boxes.map((b) => b.y1)),
    x2: Math.max(...boxes.map((b) => b.x2)),
    y2: Math.max(...boxes.map((b) => b.y2)),
  };
}

/** Elementos dentro de un recuadro de selección */
function itemsIn(doc: AscDoc, b: Box, lib: Library): ItemRef[] {
  const out: ItemRef[] = [];
  doc.symbols.forEach((s, i) => boxesIntersect(symbolBox(s, lib.symbol(s.type), lib), b) && out.push({ kind: 'symbol', index: i }));
  doc.wires.forEach((w, i) => {
    const wb = { x1: Math.min(w.x1, w.x2), y1: Math.min(w.y1, w.y2), x2: Math.max(w.x1, w.x2), y2: Math.max(w.y1, w.y2) };
    if (boxesIntersect(wb, b)) out.push({ kind: 'wire', index: i });
  });
  doc.flags.forEach((f, i) => f.x >= b.x1 && f.x <= b.x2 && f.y >= b.y1 && f.y <= b.y2 && out.push({ kind: 'flag', index: i }));
  doc.texts.forEach((t, i) => !(t.kind === 'comment' && t.text.startsWith('.study ')) && boxesIntersect(textBox(t), b) && out.push({ kind: 'text', index: i }));
  return out;
}

/** ¿Hay algo conectable en p? (pin, extremo de cable, etiqueta o cable que pasa) */
function connectsAt(doc: AscDoc, p: Point, lib: Library): boolean {
  if (doc.flags.some((f) => f.x === p.x && f.y === p.y)) return true;
  if (doc.symbols.some((s) => pinPoints(s, lib.symbol(s.type)).some((q) => q.x === p.x && q.y === p.y))) return true;
  return doc.wires.some((w) => {
    const minx = Math.min(w.x1, w.x2);
    const maxx = Math.max(w.x1, w.x2);
    const miny = Math.min(w.y1, w.y2);
    const maxy = Math.max(w.y1, w.y2);
    const cross = (w.x2 - w.x1) * (p.y - w.y1) - (w.y2 - w.y1) * (p.x - w.x1);
    return cross === 0 && p.x >= minx && p.x <= maxx && p.y >= miny && p.y <= maxy;
  });
}

/** Punto de la grilla sobre un cable horizontal o vertical, el más cercano a p */
function gridPointOnWire(w: Wire, p: Point): Point | null {
  if (w.y1 === w.y2 && w.x1 !== w.x2) return { x: Math.min(Math.max(snap(p.x), Math.min(w.x1, w.x2)), Math.max(w.x1, w.x2)), y: w.y1 };
  if (w.x1 === w.x2 && w.y1 !== w.y2) return { x: w.x1, y: Math.min(Math.max(snap(p.y), Math.min(w.y1, w.y2)), Math.max(w.y1, w.y2)) };
  return null;
}

/** ¿El codo en p es un extremo suelto? (arrastrarlo puede conectarlo a otra cosa) */
function freeEnd(doc: AscDoc, p: Point): boolean {
  const at = doc.wires.filter((w) => (w.x1 === p.x && w.y1 === p.y) || (w.x2 === p.x && w.y2 === p.y));
  return at.length === 1 && !doc.wires.some((w) => w !== at[0] && distToSegment(p, w) === 0);
}

export function SchematicEditor(props: Props) {
  const { doc, lib, conn, commit, tool, setTool, selection, setSelection, onEdit, onEditLabel, onProbe, highlightNet, handle, docKey, netNames, onNameNet, describe, annotations, pickValue, onPicked } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ cx: 0, cy: 0, scale: 1 });
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<AscDoc | null>(null);
  const [boxEnd, setBoxEnd] = useState<Point | null>(null);
  const [hoverNet, setHoverNet] = useState<string | undefined>();
  /** símbolo dueño del rótulo bajo el cursor (se resalta y el cursor indica que se puede mover) */
  const [hoverLabel, setHoverLabel] = useState<number | undefined>();
  const [labelNet, setLabelNet] = useState<string | undefined>();
  const [pickHover, setPickHover] = useState<{ value: string; symbol?: number } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; w: number; h: number; info: BiasInfo } | null>(null);
  const spaceDown = useRef(false);
  const lastClick = useRef<{ p: Point; i: number; t: number } | null>(null);
  // táctil: punteros activos, pellizco (zoom + paneo con dos dedos) y toque largo (editar)
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; cx: number; cy: number; view: View } | null>(null);
  const longPress = useRef<number | undefined>(undefined);

  useEffect(() => {
    const el = svgRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const b = docBox(doc, lib);
    if (!b) return setView({ cx: 0, cy: 0, scale: 1 });
    const pad = 48;
    const scale = Math.min(4, Math.max(0.05, Math.min(size.w / (b.x2 - b.x1 + 2 * pad), size.h / (b.y2 - b.y1 + 2 * pad))));
    setView({ cx: (b.x1 + b.x2) / 2, cy: (b.y1 + b.y2) / 2, scale });
  }, [doc, lib, size]);

  useImperativeHandle(
    handle,
    () => ({
      fit,
      cursor: () => snapPoint(cursor),
      svg: () => svgRef.current,
      contentBox: () => docBox(doc, lib),
      centerOn: (b: Box) =>
        setView((v) => ({ cx: (b.x1 + b.x2) / 2, cy: (b.y1 + b.y2) / 2, scale: Math.max(v.scale, Math.min(2, size.w / (b.x2 - b.x1 + 200))) })),
    }),
    [fit, cursor, doc, lib, size.w],
  );

  // Ajustar la vista al cargar otro documento (y cuando se conoce el tamaño del lienzo)
  const fittedKey = useRef<number | undefined>(undefined);
  const hasSize = size.w > 0 && size.h > 0;
  useEffect(() => {
    if (hasSize && fittedKey.current !== docKey) {
      fittedKey.current = docKey;
      fit();
    }
  }, [docKey, hasSize, fit]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) spaceDown.current = true;
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && (spaceDown.current = false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const vb = {
    x: view.cx - size.w / 2 / view.scale,
    y: view.cy - size.h / 2 / view.scale,
    w: size.w / view.scale,
    h: size.h / view.scale,
  };
  const tol = 6 / view.scale;

  const toDoc = (e: { clientX: number; clientY: number }): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: vb.x + (e.clientX - r.left) / view.scale, y: vb.y + (e.clientY - r.top) / view.scale };
  };

  const onWheel = (e: React.WheelEvent) => {
    const p = toDoc(e);
    const k = Math.exp(-e.deltaY * 0.0015);
    const scale = Math.min(8, Math.max(0.03, view.scale * k));
    // mantener fijo el punto bajo el cursor
    setView({ scale, cx: p.x - (p.x - view.cx) * (view.scale / scale), cy: p.y - (p.y - view.cy) * (view.scale / scale) });
  };

  /**
   * Qué mide la punta de prueba en p: como en LTspice, un cable o un pin mide la tensión
   * de su red; el cuerpo de un componente, su corriente.
   */
  const probeTarget = (p: Point): { net?: string; symbol?: number } | null => {
    const g = snapPoint(p);
    const near = Math.hypot(p.x - g.x, p.y - g.y) <= tol * 1.5;
    const hit = hitTest(doc, p, lib, tol);
    if (hit?.kind === 'wire') return { net: conn.netAt({ x: doc.wires[hit.index].x1, y: doc.wires[hit.index].y1 })?.name };
    if (near) {
      const net = conn.netAt(g)?.name;
      if (net) return { net };
    }
    if (hit?.kind === 'symbol') return { symbol: hit.index };
    if (hit?.kind === 'flag') return { net: conn.netAt(doc.flags[hit.index])?.name };
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    svgRef.current!.setPointerCapture(e.pointerId);
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      clearTimeout(longPress.current);
      if (touches.current.size === 2) {
        // segundo dedo: se cancela lo que hacía el primero y empieza el pellizco
        const [a, b] = [...touches.current.values()];
        pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, view };
        setDrag(null);
        setPreview(null);
        setBoxEnd(null);
        return;
      }
      const at = toDoc(e);
      longPress.current = window.setTimeout(() => {
        const hit = hitTest(doc, at, lib, tol * 2);
        if (hit && touches.current.size === 1) {
          setDrag(null);
          setPreview(null);
          // sobre un cable: agrega un codo (o quita el que hay ahí), como el doble click
          if (!wireGesture(at, tol * 2)) onEdit(hit);
        }
      }, 550);
    }
    const p = toDoc(e);
    const g = snapPoint(p);
    if (e.button === 1 || (e.button === 0 && spaceDown.current)) {
      setDrag({ mode: 'pan', sx: e.clientX, sy: e.clientY, view });
      return;
    }
    if (e.button === 2) {
      // Botón derecho: terminar cable / volver a seleccionar (como Esc en LTspice)
      if (tool.kind === 'wire' && tool.start) setTool({ kind: 'wire', start: null });
      else if (tool.kind !== 'select') setTool({ kind: 'select' });
      else {
        const label = labelAt(doc, p, lib, tol);
        if (label && onEditLabel) return onEditLabel(label.sym, label.win);
        const hit = hitTest(doc, p, lib, tol);
        if (hit) onEdit(hit);
      }
      return;
    }
    if (e.button !== 0) return;

    switch (tool.kind) {
      case 'select': {
        // un rótulo se arrastra directamente; con su componente seleccionado junto a otros, se
        // mueve el mismo rótulo de todos (si no se mueve, es un click sobre el componente)
        const label = labelAt(doc, p, lib, tol);
        if (label) {
          const selSyms = selection.filter((r) => r.kind === 'symbol').map((r) => r.index);
          const syms = selSyms.includes(label.sym) ? selSyms : [label.sym];
          const items = syms.flatMap((si) => {
            const inst = doc.symbols[si];
            const w = si === label.sym ? label.w : effectiveWindows(inst, lib.symbol(inst.type), lib.windowDefaults).get(label.win);
            return w && w.align !== 'Invisible' ? [{ sym: si, win: label.win, w, at: toWorld(inst, w.x, w.y) }] : [];
          });
          setDrag({ mode: 'label', start: p, sym: label.sym, shift: e.shiftKey, items, moved: false });
          return;
        }
        // clicks repetidos en el mismo lugar alternan entre elementos superpuestos
        const all = hitTestAll(doc, p, lib, tol);
        // (un doble click, más rápido, edita y no alterna)
        const lc = lastClick.current;
        // (en un codo de cables no se alterna: se arrastra el codo)
        const onVertex = all[0]?.kind === 'wire' && !e.shiftKey && !!wireVertexAt(doc, p, lib, tol * 1.5);
        const again = !onVertex && !!lc && Math.hypot(lc.p.x - p.x, lc.p.y - p.y) < tol && all.length > 1 && e.timeStamp - lc.t > 350;
        const pickIdx = again ? (lc!.i + 1) % all.length : 0;
        lastClick.current = { p, i: pickIdx, t: e.timeStamp };
        const hit = all[pickIdx] ?? null;
        if (again && hit && !e.shiftKey) {
          setSelection([hit]);
          setDrag({ mode: 'move', start: g, refs: [hit], detach: e.ctrlKey || e.metaKey, moved: false });
          return;
        }
        if (!hit) {
          setDrag({ mode: 'box', start: p, additive: e.shiftKey });
          setBoxEnd(p);
          if (!e.shiftKey) setSelection([]);
          return;
        }
        const already = selection.some((s) => s.kind === hit.kind && s.index === hit.index);
        // un cable solo: se arrastra un codo o un tramo (Alt+click agrega un codo ahí);
        // con Ctrl, en línea recta (sin codos, puede quedar en diagonal); si es parte de una
        // selección se mueve todo junto
        if (hit.kind === 'wire' && !e.shiftKey && !(already && selection.length > 1)) {
          const straight = e.ctrlKey || e.metaKey;
          const v = wireVertexAt(doc, p, lib, tol * 1.5);
          const at = gridPointOnWire(doc.wires[hit.index], p);
          if (e.altKey && at && !v) {
            const base = splitWire(doc, hit.index, at);
            setSelection([]);
            setDrag({ mode: 'vertex', base, at, free: false, commitBase: base !== doc });
            return;
          }
          if (v || at || straight) {
            setSelection([hit]);
            setDrag(
              v
                ? { mode: 'vertex', base: doc, at: v, free: freeEnd(doc, v), commitBase: false }
                : { mode: 'segment', start: g, index: hit.index },
            );
            return;
          }
        }
        const sel = e.shiftKey ? (already ? selection.filter((s) => !(s.kind === hit.kind && s.index === hit.index)) : [...selection, hit]) : already ? selection : [hit];
        setSelection(sel);
        setDrag({ mode: 'move', start: g, refs: sel, detach: e.ctrlKey || e.metaKey, moved: false });
        return;
      }
      case 'wire': {
        if (!tool.start) {
          setTool({ kind: 'wire', start: g });
          return;
        }
        // con Ctrl, un solo tramo recto (puede ir en diagonal); si no, en L
        let d: AscDoc;
        if (e.ctrlKey || e.metaKey) d = addWire(doc, tool.start, g, lib);
        else {
          const corner = { x: g.x, y: tool.start.y };
          d = addWire(addWire(doc, tool.start, corner, lib), corner, g, lib);
        }
        const ends = connectsAt(doc, g, lib) && !(g.x === tool.start.x && g.y === tool.start.y);
        commit(d);
        setTool({ kind: 'wire', start: ends ? null : g });
        return;
      }
      case 'place':
        commit(placeSymbol(doc, tool.type, placementOrigin(lib.symbol(tool.type), tool.orient, g), tool.orient, lib));
        return;
      case 'flag':
        commit(addFlag(doc, g, tool.name));
        if (tool.name !== '0') setTool({ kind: 'select' });
        return;
      case 'text':
        commit(addText(doc, { x: g.x, y: g.y, align: 'Left', size: 2, kind: tool.textKind, text: tool.text }));
        setTool({ kind: 'select' });
        return;
      case 'delete': {
        const hit = hitTest(doc, p, lib, tol);
        if (hit) commit(deleteItems(doc, [hit], lib));
        return;
      }
      case 'probe': {
        const target = probeTarget(p);
        if (target) onProbe?.(target);
        return;
      }
      case 'pick': {
        const target = probeTarget(p);
        const v = target && pickValue?.(target);
        if (v) onPicked?.(v);
        return;
      }
    }
  };

  // arrastre de un codo o un tramo: cambia el recorrido pero no la conectividad (si el nuevo
  // lugar crearía o rompería una unión, el cable se queda en la última posición válida).
  // Con Ctrl (apretado en cualquier momento del arrastre) va en línea recta, sin codos.
  const wirePreview = (d: Drag & { mode: 'vertex' | 'segment' }, g: Point, straight: boolean) => {
    const from = d.mode === 'vertex' ? d.base : doc;
    const nd =
      d.mode === 'vertex'
        ? (straight ? moveVertexStraight : moveVertex)(d.base, d.at, g, lib)
        : (straight ? dragSegmentStraight : dragSegment)(doc, d.index, g.x - d.start.x, g.y - d.start.y, lib);
    if (nd === from) setPreview(null);
    else if ((d.mode === 'vertex' && d.free) || sameConnections(doc, nd, lib)) setPreview(nd);
  };
  const wirePreviewRef = useRef(wirePreview);
  wirePreviewRef.current = wirePreview;
  const dragging = drag?.mode === 'vertex' || drag?.mode === 'segment' ? drag : null;
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') wirePreviewRef.current(dragging, snapPoint(cursorRef.current), e.ctrlKey || e.metaKey);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [dragging]);

  // Ctrl apretado mientras se dibuja un cable: el fantasma va en línea recta
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const drawingWire = tool.kind === 'wire' && !!tool.start;
  useEffect(() => {
    if (!drawingWire) return setCtrlHeld(false);
    const onKey = (e: KeyboardEvent) => setCtrlHeld(e.ctrlKey || e.metaKey);
    const onBlur = () => setCtrlHeld(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, [drawingWire]);

  const onPointerMove = (e: React.PointerEvent) => {
    if (drawingWire && ctrlHeld !== (e.ctrlKey || e.metaKey)) setCtrlHeld(e.ctrlKey || e.metaKey);
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      const prev = touches.current.get(e.pointerId)!;
      if (Math.hypot(prev.x - e.clientX, prev.y - e.clientY) > 6) clearTimeout(longPress.current);
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.current && touches.current.size >= 2) {
        const [a, b] = [...touches.current.values()];
        const pc = pinch.current;
        const scale = Math.min(8, Math.max(0.03, pc.view.scale * (Math.hypot(a.x - b.x, a.y - b.y) / pc.d)));
        const r = svgRef.current!.getBoundingClientRect();
        // el punto del esquemático bajo el centro inicial queda bajo el centro actual
        const docX = pc.view.cx + (pc.cx - r.left - r.width / 2) / pc.view.scale;
        const docY = pc.view.cy + (pc.cy - r.top - r.height / 2) / pc.view.scale;
        const cx = (a.x + b.x) / 2 - r.left - r.width / 2;
        const cy = (a.y + b.y) / 2 - r.top - r.height / 2;
        setView({ scale, cx: docX - cx / scale, cy: docY - cy / scale });
        return;
      }
    }
    const p = toDoc(e);
    setCursor(p);
    const lh = tool.kind === 'select' && !drag ? labelAt(doc, p, lib, tol)?.sym : drag?.mode === 'label' ? drag.sym : undefined;
    if (lh !== hoverLabel) setHoverLabel(lh);
    const target = (tool.kind === 'probe' || describe) && !drag ? probeTarget(p) : null;
    if (tool.kind === 'probe') setHoverNet(target?.net);
    if (tool.kind === 'pick') {
      const t = probeTarget(p);
      const v = t && pickValue?.(t);
      setPickHover(v ? { value: v, symbol: t?.symbol } : null);
      setHoverNet(v && t?.net ? t.net : undefined);
    }
    const info = target && describe ? describe(target) : null;
    if (info) {
      const r = svgRef.current!.getBoundingClientRect();
      setTip({ x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height, info });
    } else if (tip) setTip(null);
    if (!drag) return;
    if (drag.mode === 'pan') {
      setView({ ...drag.view, cx: drag.view.cx - (e.clientX - drag.sx) / drag.view.scale, cy: drag.view.cy - (e.clientY - drag.sy) / drag.view.scale });
    } else if (drag.mode === 'label') {
      // snap del ancla a la grilla de 8; Shift: libre
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      const free = e.shiftKey;
      const edits = drag.items.map((it) => {
        const inst = doc.symbols[it.sym];
        const to = free ? { x: Math.round(it.at.x + dx), y: Math.round(it.at.y + dy) } : { x: snapLabel(it.at.x + dx), y: snapLabel(it.at.y + dy) };
        const d = inverseOffset(to.x - inst.x, to.y - inst.y, inst.orient);
        return { sym: it.sym, win: it.win, w: { ...it.w, x: d.x, y: d.y } };
      });
      if (!drag.moved && Math.hypot(dx, dy) > tol) setDrag({ ...drag, moved: true });
      setPreview(setWindows(doc, edits));
    } else if (drag.mode === 'move') {
      const g = snapPoint(p);
      const dx = g.x - drag.start.x;
      const dy = g.y - drag.start.y;
      if (dx || dy) setDrag({ ...drag, moved: true });
      setPreview(moveItems(doc, drag.refs, dx, dy, !drag.detach, lib));
    } else if (drag.mode === 'vertex' || drag.mode === 'segment') {
      wirePreview(drag, snapPoint(p), e.ctrlKey || e.metaKey);
    } else {
      setBoxEnd(p);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      touches.current.delete(e.pointerId);
      clearTimeout(longPress.current);
      if (pinch.current) {
        if (touches.current.size < 2) pinch.current = null;
        return;
      }
    }
    if (!drag) return;
    if (drag.mode === 'label' && preview && drag.moved) commit(preview);
    if (drag.mode === 'label' && !drag.moved) {
      // click sobre un rótulo sin moverlo: selecciona su componente (Shift: agrega/quita)
      const ref: ItemRef = { kind: 'symbol', index: drag.sym };
      const already = selection.some((r) => sameRef(r, ref));
      setSelection(drag.shift ? (already ? selection.filter((r) => !sameRef(r, ref)) : [...selection, ref]) : already ? selection : [ref]);
    }
    if (drag.mode === 'move' && preview && drag.moved) {
      commit(preview);
      // al mover se limpian los cables (pueden cambiar de índice): reubicar la selección
      const g = snapPoint(toDoc(e));
      const [dx, dy] = [g.x - drag.start.x, g.y - drag.start.y];
      const moved = drag.refs.flatMap((r) => {
        const w = r.kind === 'wire' ? doc.wires[r.index] : undefined;
        return w ? [{ x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy }] : [];
      });
      if (moved.length) setSelection([...drag.refs.filter((r) => r.kind !== 'wire'), ...wiresOn(preview, moved).map((index) => ({ kind: 'wire' as const, index }))]);
    }
    if (drag.mode === 'vertex' || drag.mode === 'segment') {
      const next = preview ?? (drag.mode === 'vertex' && drag.commitBase ? drag.base : null);
      if (next) {
        commit(next);
        setSelection([]);
      }
    }
    if (drag.mode === 'box' && boxEnd) {
      const b = {
        x1: Math.min(drag.start.x, boxEnd.x),
        y1: Math.min(drag.start.y, boxEnd.y),
        x2: Math.max(drag.start.x, boxEnd.x),
        y2: Math.max(drag.start.y, boxEnd.y),
      };
      const found = itemsIn(doc, b, lib);
      setSelection(drag.additive ? [...selection, ...found] : found);
    }
    setDrag(null);
    setPreview(null);
    setBoxEnd(null);
    svgRef.current!.releasePointerCapture(e.pointerId);
  };

  /**
   * Doble click (o toque largo) sobre un cable: en un codo que une dos tramos alineados lo
   * quita; en el medio de un tramo lo parte ahí y deja un codo para arrastrar.
   */
  function wireGesture(p: Point, t: number): boolean {
    const hit = hitTest(doc, p, lib, t);
    if (hit?.kind !== 'wire') return false;
    const v = wireVertexAt(doc, p, lib, t * 1.5);
    const at = gridPointOnWire(doc.wires[hit.index], p);
    const nd = v ? removeVertex(doc, v, lib) : at ? splitWire(doc, hit.index, at) : doc;
    if (nd !== doc) {
      commit(nd);
      setSelection([]);
    }
    return true;
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool.kind !== 'select') return;
    const p = toDoc(e);
    const label = labelAt(doc, p, lib, tol);
    if (label && onEditLabel) return onEditLabel(label.sym, label.win);
    if (wireGesture(p, tol)) return;
    const hit = hitTest(doc, p, lib, tol);
    if (hit) onEdit(hit);
  };

  const shown = preview ?? doc;
  const g = snapPoint(cursor);
  const ghost = useMemo(() => {
    if (tool.kind === 'place') {
      const def = lib.symbol(tool.type);
      const o = placementOrigin(def, tool.orient, g);
      const inst = { type: tool.type, x: o.x, y: o.y, orient: tool.orient, windows: new Map(), attrs: new Map() };
      return <SymbolView inst={inst} def={def} lib={lib} />;
    }
    if (tool.kind === 'wire' && tool.start) {
      return (
        <path d={`M ${tool.start.x} ${tool.start.y} ${ctrlHeld ? `L ${g.x} ${g.y}` : `H ${g.x} V ${g.y}`}`} className="ghost-wire" />
      );
    }
    if (tool.kind === 'flag') {
      return tool.name === '0' ? (
        <path d={`M ${g.x - 16} ${g.y} H ${g.x + 16} M ${g.x - 9} ${g.y + 6} H ${g.x + 9} M ${g.x - 3} ${g.y + 12} H ${g.x + 3}`} />
      ) : (
        <AlignedText x={g.x} y={g.y + 8} align="Top" size={2}>{tool.name}</AlignedText>
      );
    }
    if (tool.kind === 'text') {
      return <AlignedText x={g.x} y={g.y} align="Left" size={2}>{tool.text.split('\\n')[0]}</AlignedText>;
    }
    return null;
  }, [tool, g.x, g.y, lib, ctrlHeld]);

  // codos arrastrables de los cables seleccionados
  const vertices = useMemo(() => {
    const out = new Map<string, Point>();
    for (const r of selection) {
      const w = r.kind === 'wire' ? doc.wires[r.index] : undefined;
      if (!w) continue;
      for (const e of [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]) if (wireVertexAt(doc, e, lib, 0)) out.set(`${e.x},${e.y}`, e);
    }
    return [...out.values()];
  }, [selection, doc, lib]);

  const gridR = Math.min(1.5, 1.1 / view.scale);
  const cursorClass = tool.kind === 'select' ? (drag?.mode === 'pan' ? 'grabbing' : hoverLabel !== undefined ? 'label' : '') : tool.kind;

  return (
    <>
    <svg
      ref={svgRef}
      onPointerLeave={() => setTip(null)}
      className={`editor tool-${cursorClass}`}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
      style={{ ['--px' as string]: `${1 / view.scale}` }}
    >
      <defs>
        <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
          <circle cx={0} cy={0} r={gridR} className="grid-dot" />
        </pattern>
      </defs>
      {view.scale * GRID >= 5 && <rect x={snap(vb.x) - GRID} y={snap(vb.y) - GRID} width={vb.w + 2 * GRID} height={vb.h + 2 * GRID} fill="url(#grid)" />}
      <SchematicCanvas
        doc={shown}
        lib={lib}
        conn={conn}
        selection={tool.kind === 'pick' && pickHover?.symbol !== undefined ? [{ kind: 'symbol', index: pickHover.symbol }] : selection}
        highlightNet={labelNet ?? highlightNet ?? hoverNet}
        hoverSymbol={hoverLabel}
      />
      <g className="ghost">{ghost}</g>
      {tool.kind === 'select' && !drag && vertices.length > 0 && (
        <g className="wire-vertices">
          {vertices.map((v) => (
            <rect key={`${v.x},${v.y}`} x={v.x - 3 / view.scale} y={v.y - 3 / view.scale} width={6 / view.scale} height={6 / view.scale} />
          ))}
        </g>
      )}
      {annotations && annotations.length > 0 && <AnnotationLayer items={annotations} scale={view.scale} />}
      {netNames && netNames.length > 0 && !drag && (
        <NetNamesLayer names={netNames} scale={view.scale} onHover={setLabelNet} onName={tool.kind === 'select' || tool.kind === 'probe' ? onNameNet : undefined} />
      )}
      {drag?.mode === 'box' && boxEnd && (
        <rect
          className="selbox"
          x={Math.min(drag.start.x, boxEnd.x)}
          y={Math.min(drag.start.y, boxEnd.y)}
          width={Math.abs(boxEnd.x - drag.start.x)}
          height={Math.abs(boxEnd.y - drag.start.y)}
        />
      )}
      {tool.kind === 'wire' && (
        // cruz de pantalla completa en el punto de la grilla (reemplaza al cursor del mouse)
        <g className="wire-crosshair">
          <line x1={vb.x} y1={g.y} x2={vb.x + vb.w} y2={g.y} />
          <line x1={g.x} y1={vb.y} x2={g.x} y2={vb.y + vb.h} />
        </g>
      )}
      {tool.kind !== 'select' && tool.kind !== 'probe' && tool.kind !== 'pick' && <circle cx={g.x} cy={g.y} r={3 / view.scale} className="snap-cursor" />}
    </svg>
    {tip && (
      <div
        className="bias-tip"
        role="tooltip"
        // del lado del cursor que tenga lugar, para no tapar lo que se señala
        style={{
          left: tip.x < tip.w - 220 ? tip.x + 16 : undefined,
          right: tip.x < tip.w - 220 ? undefined : tip.w - tip.x + 16,
          top: tip.y < tip.h - 200 ? tip.y + 16 : undefined,
          bottom: tip.y < tip.h - 200 ? undefined : tip.h - tip.y + 16,
        }}
      >
        <strong>{tip.info.title}</strong>
        {tip.info.lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    )}
    </>
  );
}
