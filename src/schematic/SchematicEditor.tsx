// Editor de esquemáticos: vista SVG con zoom/paneo y las herramientas de edición con el mouse.
// Los atajos de teclado y los diálogos los maneja App (necesitan estado de toda la app).
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react';
import type { CircuitDiff } from '../project/diff.ts';
import { GRID, type AscDoc, type Point, type Wire } from '../asc/model.ts';
import type { Library } from '../library/library.ts';
import { connectivity, type Connectivity } from '../netlist/connectivity.ts';
import {
  addFlag,
  addText,
  addWire,
  deleteItems,
  setText,
  instLetter,
  nextInstName,
  dragSegment,
  dragSegmentStraight,
  moveItems,
  moveVertex,
  moveVertexStraight,
  placeSymbol,
  removeVertex,
  sameConnections,
  setWindows,
  previewSelection,
  splitWire,
  wiresOn,
} from './edit.ts';
import { inverseOffset, toWorld } from '../asc/transform.ts';
import { effectiveWindows } from '../asc/resolve.ts';
import {
  hitTest,
  hitTestAll,
  labelAt,
  pinPoints,
  placementOrigin,
  snap,
  snapLabel,
  snapPoint,
  fontSize,
  inlineEditable,
  visibleText,
  wireVertexAt,
  fixedPoints,
  illegibleSizes,
  sameRef,
  type Box,
  type ItemRef,
} from './geometry.ts';
import { AnnotationLayer, NetNamesLayer, pairedPoints, type Annotation, type NetName } from './NetNames.tsx';
import type { BiasInfo } from '../sim/bias.ts';
import { CurrentArrowsLayer, type CurrentArrow } from './currentArrows.tsx';
import { AlignedText, FlagView, SchematicCanvas, ShapeView, SymbolView } from './SchematicCanvas.tsx';
import { resizeShape, shapeHandles } from './shapes.ts';
import { SUBCKT_DRAG, type Tool, type EditorHandle, type View, type Drag, type InlineText } from './editorTypes.ts';
import { pinCurrents, orthoEnd, resizableBox, docBox, itemsIn, connectsAt, gridPointOnWire, freeEnd, looseWire, shapeFromClicks, dropMove, positionedAncestor, tipStyle } from './editorDoc.ts';
import { InlineEditor } from './InlineEditor.tsx';
import { useEvent } from '../ui/useEvent.ts';
import { useEditorView } from './useEditorView.ts';

export { SUBCKT_DRAG, type EditorHandle, type Tool, type View } from './editorTypes.ts';
export { dropMove, shapeFromClicks, tipStyle } from './editorDoc.ts';

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
  /** botón derecho en un componente: true si muestra un menú propio (si no, se edita) */
  onSymbolMenu?(symbol: number, at: { x: number; y: number }): boolean;
  /** botón derecho en un cable o una etiqueta: menú de la red (guardarla, #314); true si se mostró */
  onNetMenu?(net: string, at: { x: number; y: number }): boolean;
  /** botón derecho en un comentario: true si muestra su menú (tamaño, alineación…) */
  onTextMenu?(text: number, at: { x: number; y: number }): boolean;
  /** se soltó un subcircuito arrastrado desde el panel del proyecto (#199): el símbolo a colocar, o null si no se puede */
  onDropSubckt?(name: string): string | null;
  /** doble clic en un componente: true si lo abrió como subcircuito (#180) */
  onDescend?(symbol: number): boolean;
  /** editar un rótulo (InstName, Value…) de un símbolo: botón derecho o doble click sobre el texto */
  onEditLabel?(sym: number, win: number): void;
  onProbe?(ref: { net?: string; symbol?: number; pin?: number }): void;
  /** punta de prueba arrastrada de un punto a otro (#308): la resta o el cociente de los dos */
  onProbePair?(from: { net?: string; symbol?: number; pin?: number }, to: { net?: string; symbol?: number; pin?: number }): void;
  highlightNet?: string;
  /** color de los cables de cada red (nombre en minúsculas) con una traza en el gráfico */
  netColors?: Map<string, string>;
  /** H: resaltar la red bajo el cursor con cualquier herramienta */
  netHover?: boolean;
  /** lo que no se guardó en la simulación (#314), atenuado */
  unsaved?: { nets: Set<string>; symbols: Set<number> };
  /** etiquetas temporales con los nombres de las redes */
  netNames?: NetName[];
  /** click en una etiqueta temporal de una red sin nombre */
  onNameNet?(at: Point): void;
  /** punto de operación de lo que está bajo el cursor (tooltip) */
  describe?(target: { net?: string; symbol?: number }): BiasInfo | null;
  /** valores anotados sobre el esquemático */
  annotations?: Annotation[];
  /** etiqueta del OP elegida (#306): Delete la borra */
  selectedAnnotation?: string;
  onSelectAnnotation?(key: string | undefined): void;
  /** se arrastró una etiqueta del OP (desplazamiento en unidades del esquemático) */
  onMoveAnnotation?(key: string, dx: number, dy: number): void;
  /** flechitas con el sentido positivo de la corriente en los pines */
  currentArrows?: CurrentArrow[];
  /** herramienta pick: valor que se elegiría en ese lugar (nombre de red o de fuente) */
  pickValue?(target: { net?: string; symbol?: number }): string | null;
  onPicked?(value: string): void;
  handle?: Ref<EditorHandle>;
  /** Cambia cada vez que se carga otro documento: ajusta la vista a su contenido */
  docKey?: number;
  /** Ctrl+G: grilla; Ctrl+U: marcas de pines sueltos */
  showGrid?: boolean;
  showLoose?: boolean;
  /** Ver › Mostrar el comando de simulación (.tran, .ac…): oculto, no se selecciona ni entra en Ajustar */
  showSimCommand?: boolean;
  /** elemento bajo el mouse (con la herramienta de selección) y punto de la grilla más cercano; null al salir */
  onHover?(h: { ref: ItemRef | null; at: Point } | null): void;
  /** componente bajo el mouse (con la selección o la punta de prueba), undefined al salir: para la tabla del .op */
  onHoverSymbol?(index: number | undefined): void;
  /** red, componente o pin bajo el mouse (como los elige la punta de prueba), undefined al salir: para el panel de señales guardadas (#364) */
  onHoverTarget?(target: { net?: string; symbol?: number; pin?: number } | undefined): void;
  /** componente resaltado desde afuera (la fila de la tabla de resultados bajo el mouse) */
  highlightSymbol?: number;
  /** cambios contra la corrida anterior (historial, #153) */
  diff?: CircuitDiff;
}

export function SchematicEditor(props: Props) {
  const {
    doc,
    lib,
    conn,
    commit,
    tool,
    setTool,
    selection,
    setSelection,
    onEdit,
    onEditLabel,
    onProbe,
    onProbePair,
    highlightNet,
    netColors,
    handle,
    docKey,
    netNames,
    onNameNet,
    describe,
    annotations,
    selectedAnnotation,
    onSelectAnnotation,
    onMoveAnnotation,
    currentArrows,
    pickValue,
    onPicked,
  } = props;
  const { showGrid = true, showLoose = true, showSimCommand = false, onHover, diff } = props;
  const lastHover = useRef('');
  const svgRef = useRef<SVGSVGElement>(null);
  // comentario que se está escribiendo en el lugar (`index` null: uno nuevo)
  const [inline, setInline] = useState<InlineText | null>(null);
  const inlineRef = useRef<InlineText | null>(null);
  inlineRef.current = inline;
  const { size, view, setView, viewRef, viewHistory, pushView, zoomTo, heavy, svgRect, moveView, commitView, viewOf, toDoc, onWheel } = useEditorView(svgRef);
  // Mover todo en un esquemático pesado (#195): si se mueve todo lo que se ve, nada se estira y el
  // resultado es una traslación: se desplaza el dibujo ya armado y el documento se arma al soltar
  const selectsWhole = (refs: ItemRef[]) => {
    const n = (kind: ItemRef['kind']) => new Set(refs.filter((r) => r.kind === kind).map((r) => r.index));
    const texts = n('text');
    return (
      n('symbol').size === doc.symbols.length &&
      n('wire').size === doc.wires.length &&
      n('flag').size === doc.flags.length &&
      n('shape').size === doc.shapes.length &&
      doc.texts.every((t, i) => texts.has(i) || !visibleText(t, showSimCommand))
    );
  };
  const shiftWhole = (dx: number, dy: number) => {
    const g = svgRef.current?.querySelector('g.schematic');
    if (dx || dy) g?.setAttribute('transform', `translate(${dx} ${dy})`);
    else g?.removeAttribute('transform');
  };
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
  // punta de prueba: sobre una red mide tensión (punta), sobre un componente corriente (pinza)
  const [probeKind, setProbeKind] = useState<'' | 'v' | 'i'>('');
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<AscDoc | null>(null);
  // para el Ctrl+R de la ventana con un rótulo agarrado (fuera del ciclo de render)
  const dragNow = useRef(drag);
  dragNow.current = drag;
  // dónde terminaron los cables seleccionados en el fantasma de un movimiento o del arrastre de
  // un tramo o un codo (se reordenan y fusionan): con el documento al que corresponden, para no
  // usarlos con otro
  const [previewMoved, setPreviewMoved] = useState<{ doc: AscDoc; wires: Wire[] } | null>(null);
  const previewMove = (refs: ItemRef[], dx: number, dy: number, stretch: boolean) => {
    const wires: Wire[] = [];
    const next = moveItems(doc, refs, dx, dy, stretch, lib, wires);
    setPreview(next);
    setPreviewMoved({ doc: next, wires });
  };
  const previewNow = useRef(preview);
  previewNow.current = preview;
  // fuera la traslación de mover todo en el mismo cuadro en que llega el documento movido
  useLayoutEffect(() => {
    if (!(drag?.mode === 'move' && drag.whole)) shiftWhole(0, 0);
  }, [doc, drag]);
  const [boxEnd, setBoxEnd] = useState<Point | null>(null);
  const [hoverNet, setHoverNet] = useState<string | undefined>();
  /** de dónde salen las flight lines (H) */
  const [flightFrom, setFlightFrom] = useState<Point | undefined>();
  /** símbolo dueño del rótulo bajo el cursor (se resalta y el cursor indica que se puede mover) */
  const [hoverLabel, setHoverLabel] = useState<number | undefined>();
  const hoverSymOut = useRef<number | undefined>(undefined);
  const hoverTargetOut = useRef('');
  const [grabLabel, setGrabLabel] = useState<{ sym: number; win: number } | undefined>();
  // componente bajo el puntero (cuerpo o rótulo): se pinta mientras el puntero está encima
  const [hoverSym, setHoverSym] = useState<number | undefined>();
  const [hoverFlag, setHoverFlag] = useState<number | undefined>();
  const [hoverWire, setHoverWire] = useState<number | undefined>();
  // después de arrastrar, lo movido sigue seleccionado mientras el puntero esté encima; al alejarse se deselecciona
  const deselectOnLeave = useRef(false);
  const [labelNet, setLabelNet] = useState<string | undefined>();
  // nombre de red y tensión del OP en el mismo punto: se acomodan para no pisarse
  const paired = useMemo(() => (netNames && annotations ? pairedPoints(netNames, annotations) : undefined), [netNames, annotations]);
  const [pickHover, setPickHover] = useState<{ value: string; symbol?: number } | null>(null);
  // la red bajo el cursor sólo se resalta con la punta de prueba o al elegir una red: al terminar
  // (el clic que elige vuelve a la herramienta anterior) se suelta, si no quedaba pintada para
  // siempre y en todos los testbench (el editor y los nombres de red son los mismos)
  useEffect(() => {
    if (tool.kind === 'probe' || tool.kind === 'pick') return;
    if (!props.netHover) setHoverNet(undefined);
    setPickHover(null);
  }, [tool.kind, props.netHover]);
  const [tip, setTip] = useState<{ x: number; y: number; w: number; h: number; info: BiasInfo } | null>(null);
  const spaceDown = useRef(false);
  const spaceUsed = useRef(false);
  const lastClick = useRef<{ p: Point; i: number; t: number } | null>(null);
  // táctil: punteros activos, pellizco (zoom + paneo con dos dedos) y toque largo (editar)
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; cx: number; cy: number; view: View } | null>(null);
  const longPress = useRef<number | undefined>(undefined);

  // la selección no puede apuntar a elementos que ya no existen (deshacer, borrar, abrir otro)
  const dropStale = useEvent(() => {
    const n = { symbol: doc.symbols.length, wire: doc.wires.length, flag: doc.flags.length, text: doc.texts.length, shape: doc.shapes.length };
    const valid = selection.filter((r) => r.index < n[r.kind]);
    if (valid.length !== selection.length) setSelection(valid);
  });
  useEffect(() => dropStale(), [doc, dropStale]);

  const fit = useCallback(() => {
    const b = docBox(doc, lib, showSimCommand);
    viewHistory.current.push(viewRef.current);
    setView(b ? viewOf(b, 48) : { cx: 0, cy: 0, scale: 1 });
  }, [doc, lib, showSimCommand, viewOf, setView, viewHistory, viewRef]);

  /** Edita en el lugar un comentario existente; false si no es un comentario común */
  const editInline = useEvent((index: number) => {
    const tt = doc.texts[index];
    if (!inlineEditable(tt)) return false;
    setSelection([{ kind: 'text', index }]);
    setInline({ index, x: tt.x, y: tt.y, align: tt.align, size: tt.size, value: tt.text.split('\\n').join('\n'), box: tt.box });
    return true;
  });

  useImperativeHandle(
    handle,
    () => ({
      fit,
      fitIfLost: () => {
        const b = docBox(doc, lib, showSimCommand);
        const v = viewRef.current;
        const [hw, hh] = [size.w / 2 / v.scale, size.h / 2 / v.scale];
        if (b && (b.x2 < v.cx - hw || b.x1 > v.cx + hw || b.y2 < v.cy - hh || b.y1 > v.cy + hh)) fit();
      },
      cursor: () => snapPoint(cursor),
      svg: () => svgRef.current,
      contentBox: () => docBox(doc, lib, showSimCommand),
      centerOn: (b: Box) => {
        viewHistory.current.push(viewRef.current);
        setView((v) => ({ cx: (b.x1 + b.x2) / 2, cy: (b.y1 + b.y2) / 2, scale: Math.max(v.scale, Math.min(2, size.w / (b.x2 - b.x1 + 200))) }));
      },
      zoomPrev: () => {
        const v = viewHistory.current.pop();
        if (v) setView(v);
      },
      spacePanned: () => spaceUsed.current,
      rotateLabel: () => {
        const d = dragNow.current;
        if (d?.mode !== 'label') return false;
        // horizontal ↔ vertical, con el mismo anclaje (Left ↔ VLeft…)
        const turn = (a: string) => (a.startsWith('V') ? a.slice(1) : `V${a}`);
        const items = d.items.map((it) => ({ ...it, w: { ...it.w, align: turn(it.w.align) } }));
        const nd = { ...d, items, moved: true };
        dragNow.current = nd;
        setDrag(nd);
        const base = previewNow.current ?? doc;
        setPreview(
          setWindows(
            base,
            items.map((it) => ({ sym: it.sym, win: it.win, w: { ...(base.symbols[it.sym]?.windows.get(it.win) ?? it.w), align: it.w.align } })),
          ),
        );
        return true;
      },
      view: () => viewRef.current,
      setView: (v: View) => setView(v),
      editText: (index: number) => editInline(index),
    }),
    [fit, cursor, doc, lib, showSimCommand, size.w, size.h, setView, viewHistory, viewRef, editInline],
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
      if (e.code === 'Space' && !e.repeat && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        spaceDown.current = true;
        spaceUsed.current = false;
      }
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
  /** tamaños de letra que no se dibujan por ilegibles (lod-N) */
  const lod = illegibleSizes(view.scale);

  /**
   * Qué mide la punta de prueba en p: como en LTspice, un cable o un pin mide la tensión
   * de su red; el cuerpo de un componente, su corriente.
   */
  /**
   * Qué mide la punta de prueba en p: la tensión de una red o la corriente de un componente. En
   * los de varios pines (MOS, BJT, JFET) la corriente es la de un pin (`pins`: sólo con la punta
   * de prueba): se mide sobre el pin, no sobre el cuerpo.
   */
  const probeTarget = (p: Point, pins = false): { net?: string; symbol?: number; pin?: number } | null => {
    if (pins) {
      let best: { symbol: number; pin: number; d: number } | null = null;
      doc.symbols.forEach((s, i) => {
        const def = lib.symbol(s.type);
        if (!def || !pinCurrents(def.pins.length, s.attrs.get('Prefix') ?? def.attrs.get('Prefix') ?? '')) return;
        pinPoints(s, def).forEach((q, k) => {
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d <= tol * 2 && (!best || d < best.d)) best = { symbol: i, pin: Number(def.pins[k].attrs.get('SpiceOrder') ?? k + 1), d };
        });
      });
      if (best) return { symbol: (best as { symbol: number }).symbol, pin: (best as { pin: number }).pin };
    }
    const g = snapPoint(p);
    const near = Math.hypot(p.x - g.x, p.y - g.y) <= tol * 1.5;
    const hit = hitTest(doc, p, lib, tol, showSimCommand);
    if (hit?.kind === 'wire') return { net: conn.netAt({ x: doc.wires[hit.index].x1, y: doc.wires[hit.index].y1 })?.name };
    if (near) {
      const net = conn.netAt(g)?.name;
      if (net) return { net };
    }
    if (hit?.kind === 'symbol') {
      // el cuerpo de un transistor no mide: la corriente va por pin
      const s = doc.symbols[hit.index];
      const def = lib.symbol(s.type);
      if (pins && def && pinCurrents(def.pins.length, s.attrs.get('Prefix') ?? def.attrs.get('Prefix') ?? '')) return null;
      return { symbol: hit.index };
    }
    if (hit?.kind === 'flag') return { net: conn.netAt(doc.flags[hit.index])?.name };
    return null;
  };

  /** Termina la escritura en el lugar: `save` la guarda (vacía, borra el comentario) */
  const finishInline = (save: boolean) => {
    const it = inlineRef.current;
    if (!it) return;
    inlineRef.current = null;
    setInline(null);
    // en el archivo los saltos de línea son "\n" literales
    const text = it.value.replace(/\r?\n/g, '\\n');
    if (save) {
      if (it.index === null) {
        if (text.trim()) {
          commit(addText(doc, { x: it.x, y: it.y, align: it.align, size: it.size, kind: 'comment', text }));
          setSelection([{ kind: 'text', index: doc.texts.length }]);
        }
      } else if (!text.trim()) {
        commit(deleteItems(doc, [{ kind: 'text', index: it.index }], lib));
        setSelection([]);
      } else if (text !== doc.texts[it.index]?.text) commit(setText(doc, it.index, { text }));
    }
    if (tool.kind === 'comment') setTool({ kind: 'select' });
  };

  // Botón derecho sin arrastrar: terminar cable / volver a seleccionar (como Esc en LTspice)
  const rightClick = (p: Point, screen?: { x: number; y: number }) => {
    if (tool.kind === 'wire' && tool.start) setTool({ kind: 'wire', start: null });
    else if (tool.kind === 'shape' && tool.pts.length) setTool({ ...tool, pts: [] });
    else if (tool.kind === 'move' && tool.refs) {
      setPreview(null);
      setTool({ ...tool, refs: null, start: null });
    } else if (tool.kind === 'zoom') setTool(tool.prev);
    else if (tool.kind !== 'select') setTool({ kind: 'select' });
    else {
      const label = labelAt(doc, p, lib, tol, lod);
      if (label && onEditLabel) return onEditLabel(label.sym, label.win);
      const hit = hitTest(doc, p, lib, tol, showSimCommand);
      // un componente con menú propio (#180: propagar al grupo): lo muestra quien lo pide
      if (hit?.kind === 'symbol' && screen && props.onSymbolMenu?.(hit.index, screen)) return;
      const net = hit?.kind === 'wire' ? conn.netAt({ x: doc.wires[hit.index].x1, y: doc.wires[hit.index].y1 })?.name : hit?.kind === 'flag' ? conn.netAt(doc.flags[hit.index])?.name : undefined;
      if (net && screen && props.onNetMenu?.(net, screen)) return;
      if (hit?.kind === 'text' && screen && inlineEditable(doc.texts[hit.index]) && props.onTextMenu?.(hit.index, screen)) {
        setSelection([hit]);
        return;
      }
      if (hit) onEdit(hit);
    }
  };

  // inicio y fin del arco (3.er y 4.º click): en LTspice tienen resolución de 1 punto, sin grilla
  const arcEnd = (t: Tool, p: Point): Point | null => (t.kind === 'shape' && t.shape === 'ARC' && t.pts.length >= 2 ? { x: Math.round(p.x), y: Math.round(p.y) } : null);

  /** manija de la figura seleccionada (sola) bajo `p` */
  const shapeHandleAt = (p: Point): { index: number; handle: number } | null => {
    if (tool.kind !== 'select' || selection.length !== 1 || selection[0].kind !== 'shape') return null;
    const index = selection[0].index;
    const s = doc.shapes[index];
    if (!s) return null;
    const hr = 6 / view.scale;
    const handle = shapeHandles(s).findIndex((c) => Math.abs(p.x - c.x) <= hr && Math.abs(p.y - c.y) <= hr);
    return handle >= 0 ? { index, handle } : null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // click afuera del comentario que se escribe: lo deja (y ese click no hace otra cosa)
    if (inlineRef.current) {
      e.preventDefault();
      finishInline(true);
      return;
    }
    if (selectedAnnotation) onSelectAnnotation?.(undefined);
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
        const hit = hitTest(doc, at, lib, tol * 2, showSimCommand);
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
      if (spaceDown.current) spaceUsed.current = true;
      pushView();
      setDrag({ mode: 'pan', sx: e.clientX, sy: e.clientY, view });
      return;
    }
    if (e.button === 2) {
      // botón derecho: arrastrando mueve la vista; un click (sin arrastrar) se resuelve al soltar
      setDrag({ mode: 'pan', sx: e.clientX, sy: e.clientY, view, right: true });
      return;
    }
    if (e.button !== 0) return;

    switch (tool.kind) {
      case 'select': {
        // una manija de la figura seleccionada: arrastrarla le cambia el tamaño
        const sh = shapeHandleAt(p);
        if (sh) return setDrag({ mode: 'shapesize', ...sh });
        // la esquina de la caja del comentario seleccionado: arrastrarla cambia el tamaño de letra
        const only = selection.length === 1 && selection[0].kind === 'text' ? selection[0].index : -1;
        const rb = only >= 0 ? resizableBox(doc.texts[only]) : null;
        if (rb) {
          const hr = 6 / view.scale;
          for (const cx of [rb.x1, rb.x2]) {
            for (const cy of [rb.y1, rb.y2]) {
              if (Math.abs(p.x - cx) <= hr && Math.abs(p.y - cy) <= hr) {
                setDrag({ mode: 'textsize', index: only, left: cx === rb.x1, top: cy === rb.y1, box: rb });
                return;
              }
            }
          }
        }
        // un rótulo se arrastra sólo con su componente ya seleccionado; si hay otros seleccionados,
        // se mueve el mismo rótulo de todos (si no se mueve, es un click sobre el componente)
        const label = labelAt(doc, p, lib, tol, lod);
        const selSyms = selection.filter((r) => r.kind === 'symbol' && doc.symbols[r.index]).map((r) => r.index);
        if (label && selSyms.includes(label.sym)) {
          const syms = selSyms;
          const items = syms.flatMap((si) => {
            const inst = doc.symbols[si];
            const w = si === label.sym ? label.w : effectiveWindows(inst, lib.symbol(inst.type), lib.windowDefaults).get(label.win);
            return w && w.align !== 'Invisible' ? [{ sym: si, win: label.win, w, at: toWorld(inst, w.x, w.y) }] : [];
          });
          setDrag({ mode: 'label', start: p, sym: label.sym, shift: e.shiftKey, items, moved: false });
          return;
        }
        // clicks repetidos en el mismo lugar alternan entre elementos superpuestos
        const all = hitTestAll(doc, p, lib, tol, showSimCommand);
        // (un doble click, más rápido, edita y no alterna)
        const lc = lastClick.current;
        // (en un codo de cables no se alterna: se arrastra el codo)
        const onVertex = all[0]?.kind === 'wire' && !e.shiftKey && !!wireVertexAt(doc, p, lib, tol * 1.5);
        const again = !onVertex && !!lc && Math.hypot(lc.p.x - p.x, lc.p.y - p.y) < tol && all.length > 1 && e.timeStamp - lc.t > 350;
        const pickIdx = again ? (lc!.i + 1) % all.length : 0;
        lastClick.current = { p, i: pickIdx, t: e.timeStamp };
        // el rótulo de un componente sin seleccionar es parte del componente: lo selecciona y lo mueve
        const hit: ItemRef | null = label ? { kind: 'symbol', index: label.sym } : (all[pickIdx] ?? null);
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
        // (un cable suelto, sin nada en sus puntas, se traslada entero en cualquier dirección y
        // puede apoyarse sobre un pin o un nodo)
        if (hit.kind === 'wire' && !e.shiftKey && !(already && selection.length > 1) && !looseWire(doc, hit.index, lib)) {
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
            setDrag(v ? { mode: 'vertex', base: doc, at: v, free: freeEnd(doc, v), commitBase: false } : { mode: 'segment', start: g, index: hit.index });
            return;
          }
        }
        const sel = e.shiftKey ? (already ? selection.filter((s) => !(s.kind === hit.kind && s.index === hit.index)) : [...selection, hit]) : already ? selection : [hit];
        setSelection(sel);
        const editText = hit.kind === 'text' && already && selection.length === 1 && !e.shiftKey ? hit.index : undefined;
        setDrag({ mode: 'move', start: g, refs: sel, detach: e.ctrlKey || e.metaKey, moved: false, whole: heavy() && selectsWhole(sel), editText });
        return;
      }
      case 'wire': {
        if (!tool.start) {
          setTool({ kind: 'wire', start: g });
          return;
        }
        // con Ctrl, un tramo recto (puede ir en diagonal); si no, uno solo horizontal o vertical
        const end = e.ctrlKey || e.metaKey ? g : orthoEnd(tool.start, g);
        const ends = connectsAt(doc, end, lib) && !(end.x === tool.start.x && end.y === tool.start.y);
        commit(addWire(doc, tool.start, end, lib));
        setTool({ kind: 'wire', start: ends ? null : end });
        return;
      }
      case 'place':
        commit(placeSymbol(doc, tool.type, placementOrigin(lib.symbol(tool.type), tool.orient, g), tool.orient, lib));
        return;
      case 'flag':
        commit(addFlag(doc, g, tool.name, tool.ioPin));
        if (tool.name !== '0') setTool({ kind: 'select' });
        return;
      case 'text':
        commit(addText(doc, { x: g.x, y: g.y, align: 'Left', size: 2, kind: tool.textKind, text: tool.text }));
        setTool({ kind: 'select' });
        return;
      case 'comment':
        // justo donde se hizo click (sin grilla), como en un editor de texto
        setSelection([]);
        setInline({ index: null, x: Math.round(p.x), y: Math.round(p.y), align: 'Left', size: 2, value: '' });
        return;
      case 'delete':
        // un click borra lo que está bajo la cruz; arrastrando, todo lo del recuadro (al soltar)
        setDrag({ mode: 'box', start: p, additive: false, erase: true });
        setBoxEnd(p);
        return;
      case 'move': {
        if (tool.refs && tool.start) {
          // segundo click: se suelta donde está y termina
          const r = dropMove(tool, preview);
          if (r.commit) commit(r.commit);
          setPreview(null);
          setSelection(r.selection);
          setTool(r.tool);
          return;
        }
        const hit = hitTest(doc, p, lib, tol, showSimCommand);
        if (!hit) {
          // un recuadro elige varios elementos
          setDrag({ mode: 'box', start: p, additive: false });
          setBoxEnd(p);
          return;
        }
        const refs = selection.some((s) => s.kind === hit.kind && s.index === hit.index) ? selection : [hit];
        setSelection(refs);
        setTool({ ...tool, refs, start: g });
        return;
      }
      case 'pencil':
        setDrag({ mode: 'pencil', pts: [{ x: Math.round(p.x), y: Math.round(p.y) }] });
        return;
      case 'shape': {
        const at = arcEnd(tool, p) ?? g;
        const s = shapeFromClicks(tool.shape, [...tool.pts, at], tool.style);
        if (s === 'invalid') return;
        if (s === 'more') return setTool({ ...tool, pts: [...tool.pts, at] });
        commit({ ...doc, shapes: [...doc.shapes, s] });
        setTool({ ...tool, pts: [] });
        return;
      }
      case 'zoom':
        setDrag({ mode: 'zoom', start: p });
        setBoxEnd(p);
        return;
      case 'probe': {
        // se mide al soltar: en el mismo lugar es una traza; en otro, la resta o el cociente
        const target = probeTarget(p, true);
        if (target) {
          setDrag({ mode: 'probe', start: p, from: target });
          setBoxEnd(p);
        }
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
    // dónde termina el cable agarrado, para que el naranja no pase a los tramos nuevos (#315)
    const wires: Wire[] = [];
    const sel = selection.find((r) => r.kind === 'wire');
    const nd =
      d.mode === 'vertex'
        ? (straight ? moveVertexStraight : moveVertex)(d.base, d.at, g, lib, sel && d.base === doc ? { index: sel.index, out: wires } : undefined)
        : (straight ? dragSegmentStraight : dragSegment)(doc, d.index, g.x - d.start.x, g.y - d.start.y, lib, wires);
    if (nd === from) setPreview(null);
    else if ((d.mode === 'vertex' && d.free) || sameConnections(doc, nd, lib)) {
      setPreview(nd);
      setPreviewMoved({ doc: nd, wires });
    }
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

  // Rotar/espejar (Ctrl+R / Ctrl+E) mientras se mueve: App cambia el documento y el fantasma
  // se recalcula en el acto con la posición actual del cursor, sin esperar a mover el mouse
  // (también con la herramienta Move, M, que mueve sin arrastrar)
  const refreshMove = useEvent(() => {
    const g = snapPoint(cursorRef.current);
    if (drag?.mode === 'move') previewMove(drag.refs, g.x - drag.start.x, g.y - drag.start.y, !drag.detach);
    else if (tool.kind === 'move' && tool.refs && tool.start) previewMove(tool.refs, g.x - tool.start.x, g.y - tool.start.y, tool.stretch);
  });
  useEffect(() => refreshMove(), [doc, refreshMove]);

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
        const r = svgRect();
        // el punto del esquemático bajo el centro inicial queda bajo el centro actual
        const docX = pc.view.cx + (pc.cx - r.left - r.width / 2) / pc.view.scale;
        const docY = pc.view.cy + (pc.cy - r.top - r.height / 2) / pc.view.scale;
        const cx = (a.x + b.x) / 2 - r.left - r.width / 2;
        const cy = (a.y + b.y) / 2 - r.top - r.height / 2;
        moveView({ scale, cx: docX - cx / scale, cy: docY - cy / scale });
        return;
      }
    }
    const p = toDoc(e);
    setCursor(p);
    if (onHover && !drag) {
      const ref = tool.kind === 'select' ? hitTest(doc, p, lib, tol, showSimCommand) : null;
      const at = snapPoint(p);
      const k = `${ref ? `${ref.kind}${ref.index}` : ''}@${at.x},${at.y}`;
      if (k !== lastHover.current) {
        lastHover.current = k;
        onHover({ ref, at });
      }
    }
    const la = tool.kind === 'select' && !drag ? labelAt(doc, p, lib, tol, lod) : null;
    const lh = la ? la.sym : drag?.mode === 'label' ? drag.sym : undefined;
    if (lh !== hoverLabel) setHoverLabel(lh);
    // (un rótulo se arrastra sólo con su componente ya seleccionado: entonces se pinta de verde)
    const gl =
      drag?.mode === 'label'
        ? { sym: drag.sym, win: drag.items.find((it) => it.sym === drag.sym)?.win ?? -1 }
        : la && selection.some((r) => r.kind === 'symbol' && r.index === la.sym)
          ? { sym: la.sym, win: la.win }
          : undefined;
    if (gl?.sym !== grabLabel?.sym || gl?.win !== grabLabel?.win) setGrabLabel(gl);
    const body = tool.kind === 'select' && !drag && lh === undefined ? hitTest(doc, p, lib, tol, showSimCommand) : null;
    const hs = lh ?? (body?.kind === 'symbol' ? body.index : undefined);
    if (hs !== hoverSym) setHoverSym(hs);
    const hf = body?.kind === 'flag' ? body.index : undefined;
    if (hf !== hoverFlag) setHoverFlag(hf);
    const hw = body?.kind === 'wire' ? body.index : undefined;
    if (hw !== hoverWire) setHoverWire(hw);
    if (deselectOnLeave.current && !drag && !selection.some((r) => (r.kind === 'symbol' && r.index === hs) || (r.kind === 'flag' && r.index === hf) || (r.kind === 'wire' && r.index === hw))) {
      deselectOnLeave.current = false;
      setSelection([]);
    }
    // la punta de prueba mide la corriente por pin en los transistores; la información del punto
    // de operación (describe) sigue saliendo sobre el cuerpo
    const probe = tool.kind === 'probe' && (!drag || drag.mode === 'probe') ? probeTarget(p, true) : null;
    const target = describe && !drag ? probeTarget(p) : null;
    // (con la punta de prueba, el componente de un pin o el de su cuerpo)
    const hsym = drag ? undefined : tool.kind === 'probe' ? (probe?.symbol ?? (target ?? probeTarget(p))?.symbol) : hs;
    if (hsym !== hoverSymOut.current) {
      hoverSymOut.current = hsym;
      props.onHoverSymbol?.(hsym);
    }
    if (props.onHoverTarget) {
      const ht = drag ? null : tool.kind === 'probe' ? probe : probeTarget(p, true);
      const k = ht ? `${ht.net ?? ''}|${ht.symbol ?? ''}|${ht.pin ?? ''}` : '';
      if (k !== hoverTargetOut.current) {
        hoverTargetOut.current = k;
        props.onHoverTarget(ht ?? undefined);
      }
    }
    if (tool.kind === 'probe') {
      setHoverNet(probe?.net);
      setProbeKind(probe?.net ? 'v' : probe?.symbol !== undefined ? 'i' : '');
    }
    if (props.netHover && tool.kind !== 'probe' && tool.kind !== 'pick') {
      setHoverNet(drag ? undefined : probeTarget(p)?.net);
      const g = snapPoint(p);
      setFlightFrom((c) => (c?.x === g.x && c?.y === g.y ? c : g));
    }
    if (tool.kind === 'pick') {
      const t = probeTarget(p);
      const v = t && pickValue?.(t);
      setPickHover(v ? { value: v, symbol: t?.symbol } : null);
      setHoverNet(v && t?.net ? t.net : undefined);
    }
    const info = target && describe ? describe(target) : null;
    if (info) {
      // en píxeles de pantalla respecto del contenedor (que puede tener padding por los paneles)
      const box = positionedAncestor(svgRef.current)?.getBoundingClientRect() ?? svgRect();
      setTip({ x: e.clientX - box.left, y: e.clientY - box.top, w: box.width, h: box.height, info });
    } else if (tip) setTip(null);
    if (tool.kind === 'move' && tool.refs && tool.start && !drag) {
      const g = snapPoint(p);
      previewMove(tool.refs, g.x - tool.start.x, g.y - tool.start.y, tool.stretch);
    }
    if (!drag) return;
    if (drag.mode === 'pencil') {
      // un punto cada ~2 px de pantalla: el trazo sigue la mano sin llenarse de puntos
      const last = drag.pts[drag.pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) * view.scale >= 2) setDrag({ ...drag, pts: [...drag.pts, { x: Math.round(p.x), y: Math.round(p.y) }] });
      return;
    }
    if (drag.mode === 'pan') {
      if (drag.right && !drag.moved) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
        pushView();
        setDrag({ ...drag, moved: true });
      }
      moveView({ ...drag.view, cx: drag.view.cx - (e.clientX - drag.sx) / drag.view.scale, cy: drag.view.cy - (e.clientY - drag.sy) / drag.view.scale });
    } else if (drag.mode === 'label') {
      // de a 8 (desde donde estaba); Shift: libre
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      const free = e.shiftKey;
      const edits = drag.items.map((it) => {
        const inst = doc.symbols[it.sym];
        // se mueve de a 8 desde donde estaba (las posiciones óptimas no caen en la grilla de 8:
        // ajustar la posición absoluta lo haría saltar al empezar a arrastrar)
        const to = free ? { x: Math.round(it.at.x + dx), y: Math.round(it.at.y + dy) } : { x: it.at.x + snapLabel(dx), y: it.at.y + snapLabel(dy) };
        const d = inverseOffset(to.x - inst.x, to.y - inst.y, inst.orient);
        return { sym: it.sym, win: it.win, w: { ...it.w, x: d.x, y: d.y } };
      });
      if (!drag.moved && Math.hypot(dx, dy) > tol) setDrag({ ...drag, moved: true });
      setPreview(setWindows(doc, edits));
    } else if (drag.mode === 'shapesize') {
      const s = resizeShape(doc.shapes[drag.index], drag.handle, snapPoint(p));
      if (s) setPreview({ ...doc, shapes: doc.shapes.map((x, i) => (i === drag.index ? s : x)) });
    } else if (drag.mode === 'textsize') {
      // la esquina arrastrada sigue al cursor y la opuesta queda fija: la caja pasa a tener tamaño
      // propio; el texto se parte para entrar en el ancho y lo que no entra en el alto se recorta
      const tt = doc.texts[drag.index];
      const fs = fontSize(tt.size);
      const b = drag.box;
      const min = fs;
      const x1 = drag.left ? Math.min(p.x, b.x2 - min) : b.x1;
      const x2 = drag.left ? b.x2 : Math.max(p.x, b.x1 + min);
      const y1 = drag.top ? Math.min(p.y, b.y2 - min) : b.y1;
      const y2 = drag.top ? b.y2 : Math.max(p.y, b.y1 + min);
      const x = tt.align === 'Right' ? x2 : tt.align === 'Center' ? (x1 + x2) / 2 : x1;
      const box = { w: Math.round(x2 - x1), h: Math.round(y2 - y1) };
      setPreview(setText(doc, drag.index, { box, x: Math.round(x), y: Math.round(y1 + fs / 2) }));
    } else if (drag.mode === 'move') {
      const g = snapPoint(p);
      const dx = g.x - drag.start.x;
      const dy = g.y - drag.start.y;
      if ((dx || dy) && !drag.moved) setDrag({ ...drag, moved: true });
      if (drag.whole) shiftWhole(dx, dy);
      else previewMove(drag.refs, dx, dy, !drag.detach);
    } else if (drag.mode === 'vertex' || drag.mode === 'segment') {
      wirePreview(drag, snapPoint(p), e.ctrlKey || e.metaKey);
    } else {
      setBoxEnd(p);
    }
  };

  // sin ratón no hay «pasar por arriba»: al levantar el dedo o el lápiz se suelta la red resaltada
  useEffect(() => {
    const off = () => setHoverNet(undefined);
    window.addEventListener('blur', off);
    return () => window.removeEventListener('blur', off);
  }, []);
  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') setHoverNet(undefined);
    if (e.pointerType === 'touch') {
      touches.current.delete(e.pointerId);
      clearTimeout(longPress.current);
      if (pinch.current) {
        if (touches.current.size < 2) {
          pinch.current = null;
          commitView();
        }
        return;
      }
    }
    if (!drag) return;
    if (drag.mode === 'pencil' && drag.pts.length > 1) {
      const style = tool.kind === 'pencil' ? tool.style : undefined;
      commit({ ...doc, shapes: [...doc.shapes, { kind: 'PATH', coords: drag.pts.flatMap((q) => [q.x, q.y]), ...(style ? { style } : {}) }] });
    }
    if (drag.mode === 'pan') commitView();
    if (drag.mode === 'pan' && drag.right && !drag.moved) {
      // en Windows el menú contextual llega después de soltar, cuando ya puede haber un diálogo
      // bajo el cursor (fuera del svg): ese menú del navegador no se muestra
      const block = (ev: Event) => ev.preventDefault();
      window.addEventListener('contextmenu', block, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('contextmenu', block, { capture: true }), 300);
      rightClick(toDoc(e), { x: e.clientX, y: e.clientY });
    }
    if ((drag.mode === 'label' || drag.mode === 'move') && drag.moved) deselectOnLeave.current = true;
    if (drag.mode === 'label' && preview && drag.moved) commit(preview);
    if ((drag.mode === 'textsize' || drag.mode === 'shapesize') && preview) commit(preview);
    if (drag.mode === 'move' && !drag.moved && drag.editText !== undefined) editInline(drag.editText);
    if (drag.mode === 'label' && !drag.moved) {
      // click sobre un rótulo sin moverlo: selecciona su componente (Shift: agrega/quita)
      const ref: ItemRef = { kind: 'symbol', index: drag.sym };
      const already = selection.some((r) => sameRef(r, ref));
      setSelection(drag.shift ? (already ? selection.filter((r) => !sameRef(r, ref)) : [...selection, ref]) : already ? selection : [ref]);
    }
    if (drag.mode === 'move' && drag.moved && (preview || drag.whole)) {
      // al mover se limpian los cables (pueden cambiar de índice): reubicar la selección donde
      // terminaron los cables seleccionados (trasladados o estirados)
      const g = snapPoint(toDoc(e));
      const moved: Wire[] = [];
      const next = moveItems(doc, drag.refs, g.x - drag.start.x, g.y - drag.start.y, !drag.detach, lib, moved);
      commit(drag.whole ? next : preview!);
      if (moved.length) setSelection([...drag.refs.filter((r) => r.kind !== 'wire'), ...wiresOn(drag.whole ? next : preview!, moved).map((index) => ({ kind: 'wire' as const, index }))]);
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
      const found = itemsIn(doc, b, lib, showSimCommand);
      if (drag.erase) {
        // sin arrastrar (menos de unos píxeles): es un click sobre un elemento
        const click = (b.x2 - b.x1) * view.scale < 4 && (b.y2 - b.y1) * view.scale < 4;
        const hit = click ? hitTest(doc, drag.start, lib, tol, showSimCommand) : null;
        const refs = click ? (hit ? [hit] : []) : found;
        if (refs.length) commit(deleteItems(doc, refs, lib));
      }
      // con M / S el recuadro elige lo que se va a mover
      if (tool.kind === 'move') {
        setSelection(found);
        if (found.length) setTool({ ...tool, refs: found, start: snapPoint(boxEnd) });
      } else if (!drag.erase) setSelection(drag.additive ? [...selection, ...found] : found);
    }
    if (drag.mode === 'probe') {
      const to = boxEnd && probeTarget(boxEnd, true);
      const same = (a: typeof to, b: typeof to) => !!a && !!b && a.net === b.net && a.symbol === b.symbol && a.pin === b.pin;
      if (to && !same(to, drag.from) && onProbePair) onProbePair(drag.from, to);
      else onProbe?.(drag.from);
    }
    if (drag.mode === 'zoom' && boxEnd) {
      const b = { x1: Math.min(drag.start.x, boxEnd.x), y1: Math.min(drag.start.y, boxEnd.y), x2: Math.max(drag.start.x, boxEnd.x), y2: Math.max(drag.start.y, boxEnd.y) };
      // un click sin arrastrar acerca al doble alrededor del punto
      if ((b.x2 - b.x1) * view.scale < 6 && (b.y2 - b.y1) * view.scale < 6) zoomTo({ cx: drag.start.x, cy: drag.start.y, scale: Math.min(8, view.scale * 2) });
      else zoomTo(viewOf(b, 0, 8));
      if (tool.kind === 'zoom') setTool(tool.prev);
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
    const hit = hitTest(doc, p, lib, t, showSimCommand);
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
    if (tool.kind !== 'select' || inlineRef.current) return;
    const p = toDoc(e);
    const label = labelAt(doc, p, lib, tol, lod);
    if (label && onEditLabel) return onEditLabel(label.sym, label.win);
    if (wireGesture(p, tol)) return;
    const hit = hitTest(doc, p, lib, tol, showSimCommand);
    // doble clic en un subcircuito del proyecto: bajar a su esquemático (#180)
    if (hit?.kind === 'symbol' && props.onDescend?.(hit.index)) return;
    if (hit?.kind === 'text' && editInline(hit.index)) return;
    if (hit) onEdit(hit);
  };

  // Con un fantasma (mover, arrastrar un tramo…) los cables cambian de índice, pero conn, la
  // selección, el hover y el diff son del documento: se recalcula la conectividad del fantasma y
  // se reubica la selección, si no los estilos por índice (bus, naranja) caen en otros cables (#315)
  const previewing = !!preview && preview.wires !== doc.wires;
  const shownConn = useMemo(() => (previewing ? connectivity(preview!, (t) => lib.symbol(t)) : conn), [previewing, preview, conn, lib]);
  const shownSelection = useMemo(
    () => (previewing ? previewSelection(selection, doc, preview!, previewMoved?.doc === preview ? previewMoved.wires : undefined) : selection),
    [previewing, selection, doc, preview, previewMoved],
  );
  // el comentario que se edita en el lugar no se dibuja (lo reemplaza el cuadro de texto)
  const shown = inline?.index != null ? setText(preview ?? doc, inline.index, { text: '' }) : (preview ?? doc);
  const g = snapPoint(cursor);
  // fin del arco que se está dibujando (sigue al cursor sin la grilla)
  const arcAt = arcEnd(tool, cursor);
  const [gx, gy, ax, ay] = [g.x, g.y, arcAt?.x, arcAt?.y];
  // lo que se está por colocar, dibujado igual a como va a quedar (colores, InstName, tierra)
  const ghost = useMemo(() => {
    const g = { x: gx, y: gy };
    if (tool.kind === 'place') {
      const def = lib.symbol(tool.type);
      const o = placementOrigin(def, tool.orient, g);
      const attrs = new Map<string, string>();
      if (def && !def.attrs.has('InstName')) attrs.set('InstName', nextInstName(doc, instLetter(def.attrs.get('Prefix') ?? 'X'), lib));
      const inst = { type: tool.type, x: o.x, y: o.y, orient: tool.orient, windows: new Map(), attrs };
      return <SymbolView inst={inst} def={def} lib={lib} />;
    }
    if (tool.kind === 'flag') {
      const flag = { x: g.x, y: g.y, name: tool.name };
      return <FlagView flag={flag} doc={{ ...doc, flags: [...doc.flags, flag] }} lib={lib} />;
    }
    if (tool.kind === 'text') {
      return (
        <g className="texts">
          <g className={tool.textKind}>
            <AlignedText x={g.x} y={g.y} align="Left" size={2}>
              {tool.text.split('\\n')[0]}
            </AlignedText>
          </g>
        </g>
      );
    }
    if (tool.kind === 'shape' && tool.pts.length) {
      const pts = [...tool.pts, ax !== undefined && ay !== undefined ? { x: ax, y: ay } : g];
      const [a, b] = pts;
      if (tool.shape !== 'ARC' || pts.length === 2) {
        // el arco, mientras se elige la caja, se ve como la elipse entera
        const kind = tool.shape === 'ARC' ? 'CIRCLE' : tool.shape;
        return (
          <g className="shapes">
            <ShapeView s={{ kind, coords: [a.x, a.y, b.x, b.y], style: tool.style }} />
          </g>
        );
      }
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const end = pts[pts.length - 1];
      // (la caja y el radio son guías, en gris)
      const box = (
        <g className="ghost">
          <ShapeView s={{ kind: 'CIRCLE', coords: [a.x, a.y, b.x, b.y], style: '2' }} />
        </g>
      );
      // 3 clicks: falta el inicio (se ve el radio); 4: el arco desde el inicio hasta el cursor
      return pts.length === 3 ? (
        <>
          {box}
          <line className="ghost" x1={c.x} y1={c.y} x2={end.x} y2={end.y} strokeDasharray="2 5" />
        </>
      ) : (
        <>
          {box}
          <g className="shapes">
            <ShapeView s={{ kind: 'ARC', coords: [a.x, a.y, b.x, b.y, end.x, end.y, pts[2].x, pts[2].y], style: tool.style }} />
          </g>
        </>
      );
    }
    return null;
  }, [tool, gx, gy, ax, ay, lib, doc]);

  // codos arrastrables de los cables seleccionados
  // (un extremo de cable es codo si no está sobre un pin o una etiqueta: wireVertexAt con tol 0)
  const vertices = useMemo(() => {
    const out = new Map<string, Point>();
    const fixed = fixedPoints(doc, lib);
    for (const r of selection) {
      const w = r.kind === 'wire' ? doc.wires[r.index] : undefined;
      if (!w) continue;
      for (const e of [
        { x: w.x1, y: w.y1 },
        { x: w.x2, y: w.y2 },
      ])
        if (!fixed.has(`${e.x},${e.y}`)) out.set(`${e.x},${e.y}`, e);
    }
    return [...out.values()];
  }, [selection, doc, lib]);

  const resizeHover = (() => {
    if (drag?.mode === 'textsize' || drag?.mode === 'shapesize') return true;
    if (!drag && shapeHandleAt(cursor)) return true;
    const only = selection.length === 1 && selection[0].kind === 'text' ? selection[0].index : -1;
    const rb = only >= 0 && !drag ? resizableBox(doc.texts[only]) : null;
    const hr = 6 / view.scale;
    return !!rb && [rb.x1, rb.x2].some((cx) => Math.abs(cursor.x - cx) <= hr) && [rb.y1, rb.y2].some((cy) => Math.abs(cursor.y - cy) <= hr);
  })();
  const gridR = Math.min(1.75, 1.35 / view.scale);
  // Nivel de detalle (#195): los textos ilegibles se ocultan con una clase en el svg, que cambia
  // sólo con la escala (en un gesto pesado, al aplicar la vista), así el estilo se recalcula una vez
  const cursorClass =
    drag?.mode === 'pan' && (!drag.right || drag.moved)
      ? 'grabbing'
      : tool.kind === 'select'
        ? resizeHover
          ? 'resize'
          : ''
        : tool.kind === 'probe' && probeKind
          ? `probe tool-probe-${probeKind}`
          : tool.kind;

  return (
    <>
      <svg
        ref={svgRef}
        className={`editor tool-${cursorClass}${lod ? ` lod-${lod}` : ''}`}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        onWheel={onWheel}
        onDragOver={(e) => {
          if (props.onDropSubckt && e.dataTransfer.types.includes(SUBCKT_DRAG)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={(e) => {
          const name = e.dataTransfer.getData(SUBCKT_DRAG);
          if (!name || !props.onDropSubckt) return;
          e.preventDefault();
          const type = props.onDropSubckt(name);
          if (!type) return;
          commit(placeSymbol(doc, type, placementOrigin(lib.symbol(type), 'R0', snapPoint(toDoc(e))), 'R0', lib));
          setTool({ kind: 'select' });
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          setTip(null);
          setHoverNet(undefined);
          setHoverLabel(undefined);
          setGrabLabel(undefined);
          setHoverSym(undefined);
          setHoverFlag(undefined);
          setHoverWire(undefined);
          setPickHover(null);
          lastHover.current = '';
          onHover?.(null);
          if (hoverSymOut.current !== undefined) props.onHoverSymbol?.((hoverSymOut.current = undefined));
          if (hoverTargetOut.current) {
            hoverTargetOut.current = '';
            props.onHoverTarget?.(undefined);
          }
        }}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <circle cx={0} cy={0} r={gridR} className="grid-dot" />
          </pattern>
        </defs>
        {showGrid && view.scale * GRID >= 5 && <rect x={snap(vb.x) - GRID} y={snap(vb.y) - GRID} width={vb.w + 2 * GRID} height={vb.h + 2 * GRID} fill="url(#grid)" />}
        <SchematicCanvas
          doc={shown}
          lib={lib}
          conn={shownConn}
          selection={tool.kind === 'pick' && pickHover?.symbol !== undefined ? [{ kind: 'symbol', index: pickHover.symbol }] : shownSelection}
          highlightNet={labelNet ?? highlightNet ?? hoverNet}
          flightFrom={props.netHover && hoverNet ? flightFrom : undefined}
          hoverSymbol={hoverSym ?? props.highlightSymbol}
          grabLabel={grabLabel}
          hoverFlag={hoverFlag}
          hoverWire={previewing ? undefined : hoverWire}
          netColors={netColors}
          unsaved={props.unsaved}
          showLoose={showLoose}
          showSimCommand={showSimCommand}
          diff={previewing ? undefined : diff}
        />
        <g className="schematic placing">{ghost}</g>
        {drag?.mode === 'pencil' && (
          <g className="schematic">
            <g className="shapes">
              <polyline points={drag.pts.map((q) => `${q.x},${q.y}`).join(' ')} />
            </g>
          </g>
        )}
        {tool.kind === 'wire' && tool.start && (
          // el cable que se está trazando, igual a como va a quedar (horizontal/vertical, o recto con Ctrl)
          <g className="wires drawing">
            {(() => {
              const end = ctrlHeld ? g : orthoEnd(tool.start, g);
              return <line x1={tool.start.x} y1={tool.start.y} x2={end.x} y2={end.y} />;
            })()}
          </g>
        )}
        {tool.kind === 'select' && !drag && vertices.length > 0 && (
          <g className="wire-vertices">
            {vertices.map((v) => (
              <rect key={`${v.x},${v.y}`} x={v.x - 3 / view.scale} y={v.y - 3 / view.scale} width={6 / view.scale} height={6 / view.scale} />
            ))}
          </g>
        )}
        {tool.kind === 'select' &&
          !inline &&
          (!drag || drag.mode === 'textsize') &&
          selection.length === 1 &&
          selection[0].kind === 'text' &&
          (() => {
            const rb = resizableBox(shown.texts[selection[0].index]);
            if (!rb) return null;
            const k = 6 / view.scale;
            return (
              <g className="text-bbox">
                <rect x={rb.x1 - 2} y={rb.y1 - 2} width={rb.x2 - rb.x1 + 4} height={rb.y2 - rb.y1 + 4} />
                {[rb.x1, rb.x2].flatMap((cx) => [rb.y1, rb.y2].map((cy) => <rect key={`${cx},${cy}`} className="handle" x={cx - k / 2} y={cy - k / 2} width={k} height={k} />))}
              </g>
            );
          })()}
        {tool.kind === 'select' &&
          (!drag || drag.mode === 'shapesize') &&
          selection.length === 1 &&
          selection[0].kind === 'shape' &&
          shown.shapes[selection[0].index] &&
          (() => {
            const k = 6 / view.scale;
            return (
              <g className="text-bbox">
                {shapeHandles(shown.shapes[selection[0].index]).map((c, i) => (
                  <rect key={i} className="handle" x={c.x - k / 2} y={c.y - k / 2} width={k} height={k} />
                ))}
              </g>
            );
          })()}
        {inline && <InlineEditor it={inline} onChange={(value) => setInline({ ...inline, value })} onDone={finishInline} />}
        {currentArrows && currentArrows.length > 0 && <CurrentArrowsLayer items={currentArrows} />}
        {annotations && annotations.length > 0 && (
          <AnnotationLayer
            items={annotations}
            paired={paired}
            scale={view.scale}
            selected={selectedAnnotation}
            onSelect={tool.kind === 'select' || tool.kind === 'probe' ? onSelectAnnotation : undefined}
            onMove={tool.kind === 'select' || tool.kind === 'probe' ? onMoveAnnotation : undefined}
          />
        )}
        {netNames && netNames.length > 0 && !drag && (
          <NetNamesLayer
            names={netNames}
            paired={paired}
            avoid={annotations}
            scale={view.scale}
            onHover={setLabelNet}
            onName={tool.kind === 'select' || tool.kind === 'probe' ? onNameNet : undefined}
          />
        )}
        {drag?.mode === 'probe' && boxEnd && (Math.abs(boxEnd.x - drag.start.x) + Math.abs(boxEnd.y - drag.start.y)) * view.scale > 4 && (
          <line className="probe-drag" x1={drag.start.x} y1={drag.start.y} x2={boxEnd.x} y2={boxEnd.y} />
        )}
        {(drag?.mode === 'box' || drag?.mode === 'zoom') && boxEnd && (
          <rect className="selbox" x={Math.min(drag.start.x, boxEnd.x)} y={Math.min(drag.start.y, boxEnd.y)} width={Math.abs(boxEnd.x - drag.start.x)} height={Math.abs(boxEnd.y - drag.start.y)} />
        )}
        {tool.kind === 'wire' && (
          // cruz de pantalla completa en el punto de la grilla (reemplaza al cursor del mouse)
          <g className="wire-crosshair">
            <line x1={vb.x} y1={g.y} x2={vb.x + vb.w} y2={g.y} />
            <line x1={g.x} y1={vb.y} x2={g.x} y2={vb.y + vb.h} />
          </g>
        )}
        {tool.kind === 'delete' && (
          // cursor de borrar: una cruz chica a 45° que sigue al mouse (sin grilla)
          <path
            className="delete-cursor"
            d={`M ${cursor.x - 5 / view.scale} ${cursor.y - 5 / view.scale} l ${10 / view.scale} ${10 / view.scale} M ${cursor.x + 5 / view.scale} ${cursor.y - 5 / view.scale} l ${-10 / view.scale} ${10 / view.scale}`}
          />
        )}
        {tool.kind !== 'select' &&
          tool.kind !== 'comment' &&
          tool.kind !== 'place' &&
          tool.kind !== 'probe' &&
          tool.kind !== 'pick' &&
          tool.kind !== 'delete' &&
          tool.kind !== 'move' &&
          tool.kind !== 'pencil' && <circle cx={(arcEnd(tool, cursor) ?? g).x} cy={(arcEnd(tool, cursor) ?? g).y} r={3 / view.scale} className="snap-cursor" />}
      </svg>
      {tip && (
        <div
          className="bias-tip"
          role="tooltip"
          // del lado del cursor que tenga lugar, para no tapar lo que se señala
          style={tipStyle(tip)}
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

/**
 * Cuadro para escribir un comentario en el lugar, dentro del svg (sigue al zoom): la primera
 * línea queda donde va a quedar el texto. Enter lo deja (Shift+Enter: otra línea), Esc cancela.
 */
