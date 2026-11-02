// Vista partida de un subcircuito (#180): a la derecha del esquemático, su símbolo y sus
// parámetros con su valor por defecto. Una barra chica de dibujo: editar (los pines se arrastran, el
// cuerpo se agranda desde las esquinas, las figuras se mueven, se estiran desde sus extremos y se
// borran con Supr), pines (en la grilla), líneas, rectángulos y círculos (en pasos de 1) y textos
// (TEXT del .asy: un clic abre su ventanita para cambiarlos).
import { useEffect, useMemo, useRef, useState } from 'react';
import { GRID, WINDOW_ATTR } from '../asc/model.ts';
import { Icon, type IconName } from '../ui/icons.tsx';
import { AlignedText } from '../schematic/SchematicCanvas.tsx';
import {
  addPin,
  addShape,
  addText,
  setText,
  symTexts,
  type SymText,
  assignPin,
  copySym,
  pasteSym,
  type SymClip,
  formatParamList,
  moveWindow,
  movePin,
  removePin,
  removeShape,
  resizeBody,
  setShape,
  symParams,
  symPins,
  symShapes,
  symWindows,
  windowShown,
  type ShapeKind,
} from './symbolEdit.ts';
import { t } from '../i18n/i18n.ts';

type Tool = 'edit' | 'pin' | 'text' | ShapeKind;
type Quad = [number, number, number, number];
type Pt = { x: number; y: number };
type Drag =
  | { kind: 'pin'; index: number }
  /** esquina de un rectángulo o de la caja de un círculo (el cuerpo es el primer rectángulo) */
  | { kind: 'corner'; line: number; cx: 0 | 1; cy: 0 | 1 }
  /** extremo `end` (0: x1 y1, 1: x2 y2) de la figura de la línea `line` */
  | { kind: 'end'; line: number; end: 0 | 1 }
  /** la figura entera, desde donde se la agarró */
  | { kind: 'shape'; line: number; from: Pt; orig: Quad }
  /** un texto (TEXT), desde donde se lo agarró */
  | { kind: 'text'; line: number; from: Pt; orig: Pt }
  /** un rótulo (WINDOW n: nombre, valor, parámetros…), desde donde se lo agarró */
  | { kind: 'win'; n: number; from: Pt; orig: Pt }
  /** dibujando una figura nueva */
  | { kind: 'draw'; shape: ShapeKind; from: Pt; to: Pt }
  /** ventana de selección (en el fondo, con Editar) */
  | { kind: 'band'; from: Pt; to: Pt }
  /** lo seleccionado, todo junto (en pasos de `g`: de la grilla si hay pines) */
  | { kind: 'group'; from: Pt; orig: string; g: number }
  /** desplazando la vista (botón del medio o derecho) */
  | { kind: 'pan'; x: number; y: number; box: Quad; k: number };

const snapTo = (v: number, g: number) => Math.round(v / g) * g;
/** lo copiado con Ctrl+C / Ctrl+X (compartido entre los editores de símbolos) y cuántas veces se pegó */
let clip: SymClip | null = null;
let pastes = 0;
/** alineaciones y tamaños de letra de LTspice (índice → pt, spec §7.1) */
const ALIGNS = ['Left', 'Center', 'Right', 'Top', 'Bottom', 'VLeft', 'VCenter', 'VRight', 'VTop', 'VBottom'];
const SIZES = [8, 13, 20, 26, 32, 46, 65, 92];

/** el arrastre sigue aunque el mouse salga del dibujo (sin puntero real, p. ej. en tests, no hay captura) */
const capture = (e: React.PointerEvent) => {
  try {
    (e.currentTarget as Element).closest('svg')?.setPointerCapture(e.pointerId);
  } catch {
    /* sin captura */
  }
};

export function SymbolEditor({
  name,
  text,
  ports,
  assign = true,
  keepAlign = false,
  params,
  onChange,
  onParams,
  onReset,
  onPickSymbol,
  onWidth,
  onAddPort,
}: {
  name: string;
  text: string;
  /** puertos del esquemático (para avisar los que no tienen pin) */
  ports: string[];
  /** la tabla «Puerto de cada pin» (en el editor de modelos los pines se editan a la izquierda) */
  assign?: boolean;
  /** al mover un pin no cambiar la alineación de su nombre (en el editor de modelos se elige en la tabla) */
  keepAlign?: boolean;
  onChange(text: string): void;
  onParams(ps: [string, string][]): void;
  /** volver al símbolo generado (rectángulo con los puertos a los costados); sin esto no hay botón Redo */
  onReset?(): void;
  /** elegir un .asy existente (opamp, transistor…) como símbolo (#199) */
  onPickSymbol?(): void;
  /** el ancho del panel cambió (se arrastra su borde izquierdo) */
  onWidth?(w: number): void;
  /** un pin nuevo con un nombre que no es puerto: agregar el puerto en el esquemático */
  onAddPort?(name: string): void;
  /** parámetros del símbolo (por defecto, los del SpiceLine) */
  params?: [string, string][];
}) {
  // mientras se arrastra se dibuja una copia local; al soltar se guarda
  const [live, setLive] = useState(text);
  useEffect(() => setLive(text), [text]);
  const [tool, setTool] = useState<Tool>('edit');
  // selección: figuras y textos (por su línea) y pines (por su índice)
  const [sel, setSel] = useState<number[]>([]);
  const [selPins, setSelPins] = useState<number[]>([]);
  const clearSel = () => {
    setSel([]);
    setSelPins([]);
  };
  const [preview, setPreview] = useState<Drag | null>(null);
  /** pin nuevo esperando nombre (no queda ningún puerto sin pin) */
  const [askPin, setAskPin] = useState<(Pt & { name: string }) | null>(null);
  const askInput = useRef<HTMLInputElement>(null);
  /** texto nuevo (sin `line`) o el que se cambia (doble clic), esperando su contenido */
  const [askText, setAskText] = useState<(Omit<SymText, 'line'> & { line?: number }) | null>(null);
  const askTextInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!askText) return;
    const id = setTimeout(() => askTextInput.current?.focus());
    return () => clearTimeout(id);
  }, [!!askText]); // eslint-disable-line react-hooks/exhaustive-deps
  // después del click (que deja el foco en el panel)
  useEffect(() => {
    if (!askPin) return;
    const id = setTimeout(() => askInput.current?.focus());
    return () => clearTimeout(id);
  }, [!!askPin]); // eslint-disable-line react-hooks/exhaustive-deps
  const drag = useRef<Drag | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const aside = useRef<HTMLElement>(null);
  const pins = useMemo(() => symPins(live), [live]);
  const shapes = useMemo(() => symShapes(live), [live]);
  const texts = useMemo(() => symTexts(live), [live]);
  // los parámetros como se verán en la instancia colocada: el SpiceLine en su WINDOW 39
  // los rótulos visibles, con el texto que tendrá cada instancia (el nombre, p. ej. X1)
  const attr = (k: string) => new RegExp(`^SYMATTR ${k} (.*)$`, 'm').exec(live)?.[1]?.trim() ?? '';
  const wins = symWindows(live)
    .filter(windowShown)
    .map((w) => ({ ...w, text: w.n === 0 ? attr('InstName') || `${attr('Prefix') || 'X'}1` : attr(WINDOW_ATTR[w.n] ?? '') }))
    .filter((w) => w.text);
  const ps = params ?? symParams(text);
  const bodyLine = shapes.find((s) => s.kind === 'RECTANGLE')?.line;
  const isItem = (l: number) => shapes.some((s) => s.line === l) || texts.some((x) => x.line === l);
  useEffect(() => setSel((v) => (v.every(isItem) ? v : v.filter(isItem))), [shapes, texts]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setSelPins((v) => (v.every((i) => i < pins.length) ? v : v.filter((i) => i < pins.length))), [pins]);
  // vista: lo que ocupa el símbolo. Fija mientras se arrastra y mientras el dibujo entre, para que
  // no salte con cada cambio; se reencuadra al cambiar de subcircuito o si algo queda afuera
  const [box, setBox] = useState<Quad>([0, 0, 0, 0]);
  const boxOf = useRef('');
  /** con zoom o paneo a mano la vista no se reencuadra sola (hasta Encuadrar) */
  const manual = useRef(false);
  const [fitTick, setFitTick] = useState(0);
  const [size, setSize] = useState({ w: 300, h: 300 });
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 300, h: el.clientHeight || 300 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  /** unidades del símbolo por píxel (las manijas miden lo mismo con cualquier zoom) */
  const upx = Math.max(box[2] / size.w, box[3] / size.h) || 1;
  useEffect(() => {
    if (drag.current) return;
    // los pines entran con su cuadradito y su nombre (11 unidades de alto, ~7 por letra)
    const pinX = pins.flatMap((p) => {
      const w = p.name.length * 7;
      const ext = { LEFT: [p.x - 6, p.x + 6 + w], RIGHT: [p.x - 6 - w, p.x + 6], TOP: [p.x - w / 2 - 6, p.x + w / 2 + 6], BOTTOM: [p.x - w / 2 - 6, p.x + w / 2 + 6] }[p.align];
      return ext ?? [p.x - 6, p.x + 6 + w];
    });
    const pinY = pins.flatMap((p) => [p.y - 18, p.y + 18]);
    const xs = [...shapes.flatMap((s) => [s.coords[0], s.coords[2]]), ...pinX, ...texts.map((x) => x.x)];
    const ys = [...shapes.flatMap((s) => [s.coords[1], s.coords[3]]), ...pinY, ...texts.map((x) => x.y)];
    const [lo, hi] = [Math.min(0, ...xs), Math.max(0, ...xs)];
    const [top, bot] = [Math.min(0, ...ys), Math.max(0, ...ys)];
    if (boxOf.current !== name) manual.current = false;
    if (boxOf.current === name && manual.current) return;
    setBox((b) => {
      const fits = boxOf.current === name && lo >= b[0] + 8 && top >= b[1] + 24 && hi <= b[0] + b[2] - 8 && bot <= b[1] + b[3] - 8;
      boxOf.current = name;
      return fits ? b : [lo - 64, top - 56, hi - lo + 128, bot - top + 120];
    });
  }, [shapes, pins, texts, name, fitTick]);
  const fit = () => {
    manual.current = false;
    boxOf.current = '';
    setFitTick((n) => n + 1);
  };
  // rueda: zoom alrededor del mouse (listener propio: el de React es pasivo y no frena el scroll)
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const m = el.getScreenCTM();
      if (!m) return;
      const c = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      const f = Math.min(Math.max(Math.exp(e.deltaY * 0.0015), 0.5), 2);
      manual.current = true;
      setBox((b) => {
        const w = Math.min(Math.max(b[2] * f, 24), 20000);
        const k = w / b[2];
        return [c.x - (c.x - b[0]) * k, c.y - (c.y - b[1]) * k, w, b[3] * k];
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  // deshacer / rehacer propios del símbolo (Ctrl+Z / Ctrl+Y): así lo borrado se recupera
  const undo = useRef<string[]>([]);
  const redo = useRef<string[]>([]);
  useEffect(() => {
    undo.current = [];
    redo.current = [];
  }, [name]);
  const change = (next: string) => {
    if (next === text) return;
    undo.current.push(text);
    if (undo.current.length > 200) undo.current.shift();
    redo.current = [];
    onChange(next);
  };
  const back = (from: React.MutableRefObject<string[]>, to: React.MutableRefObject<string[]>) => {
    const prev = from.current.pop();
    if (prev === undefined) return;
    to.current.push(text);
    clearSel();
    onChange(prev);
    aside.current?.focus({ preventScroll: true });
  };
  const missing = ports.filter((n) => !pins.some((p) => p.name.toLowerCase() === n.toLowerCase()));

  const toDoc = (e: React.PointerEvent, g: number): Pt => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: snapTo(p.x, g), y: snapTo(p.y, g) };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pin') {
      const p = toDoc(e, GRID);
      setLive((tt) => movePin(tt, d.index, p.x, p.y, keepAlign));
    } else if (d.kind === 'pan') {
      const [dx, dy] = [(e.clientX - d.x) * d.k, (e.clientY - d.y) * d.k];
      setBox([d.box[0] - dx, d.box[1] - dy, d.box[2], d.box[3]]);
    } else if (d.kind === 'corner') {
      const p = toDoc(e, 1);
      setLive((tt) => {
        const s = symShapes(tt).find((x) => x.line === d.line);
        if (!s) return tt;
        const [a, b, c, dd] = s.coords;
        const r = { x1: Math.min(a, c), y1: Math.min(b, dd), x2: Math.max(a, c), y2: Math.max(b, dd) };
        if (d.cx) r.x2 = Math.max(p.x, r.x1 + 2);
        else r.x1 = Math.min(p.x, r.x2 - 2);
        if (d.cy) r.y2 = Math.max(p.y, r.y1 + 2);
        else r.y1 = Math.min(p.y, r.y2 - 2);
        // el cuerpo arrastra los rótulos de nombre y valor
        return d.line === bodyLine ? resizeBody(tt, r) : setShape(tt, d.line, [r.x1, r.y1, r.x2, r.y2]);
      });
    } else if (d.kind === 'end') {
      const p = toDoc(e, 1);
      setLive((tt) => {
        const s = symShapes(tt).find((x) => x.line === d.line);
        if (!s) return tt;
        return setShape(tt, d.line, d.end ? [s.coords[0], s.coords[1], p.x, p.y] : [p.x, p.y, s.coords[2], s.coords[3]]);
      });
    } else if (d.kind === 'text') {
      const p = toDoc(e, 1);
      setLive((tt) => setText(tt, d.line, { x: d.orig.x + p.x - d.from.x, y: d.orig.y + p.y - d.from.y }));
    } else if (d.kind === 'win') {
      // en la grilla de los rótulos del esquemático (8)
      const p = toDoc(e, 1);
      setLive((tt) => moveWindow(tt, d.n, snapTo(d.orig.x + p.x - d.from.x, 8), snapTo(d.orig.y + p.y - d.from.y, 8)));
    } else if (d.kind === 'group') {
      const p = toDoc(e, d.g);
      setLive(moveGroup(d.orig, p.x - snapTo(d.from.x, d.g), p.y - snapTo(d.from.y, d.g)));
    } else if (d.kind === 'band') {
      const next = { ...d, to: toDoc(e, 1) };
      drag.current = next;
      setPreview(next);
    } else if (d.kind === 'shape') {
      const p = toDoc(e, 1);
      const [dx, dy] = [p.x - d.from.x, p.y - d.from.y];
      const o = d.orig;
      setLive((tt) => setShape(tt, d.line, [o[0] + dx, o[1] + dy, o[2] + dx, o[3] + dy]));
    } else {
      const next = { ...d, to: toDoc(e, 1) };
      drag.current = next;
      setPreview(next);
    }
  };
  const up = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.kind === 'pan') return;
    if (d.kind === 'band') {
      setPreview(null);
      const [x1, x2] = [Math.min(d.from.x, d.to.x), Math.max(d.from.x, d.to.x)];
      const [y1, y2] = [Math.min(d.from.y, d.to.y), Math.max(d.from.y, d.to.y)];
      const inside = (x: number, y: number) => x >= x1 && x <= x2 && y >= y1 && y <= y2;
      setSel([...shapes.filter((s) => inside(s.coords[0], s.coords[1]) && inside(s.coords[2], s.coords[3])).map((s) => s.line), ...texts.filter((x) => inside(x.x, x.y)).map((x) => x.line)]);
      setSelPins(pins.flatMap((p, i) => (inside(p.x, p.y) ? [i] : [])));
      return;
    }
    if (d.kind === 'draw') {
      setPreview(null);
      if (d.from.x === d.to.x && d.from.y === d.to.y) return;
      const c: Quad = [d.from.x, d.from.y, d.to.x, d.to.y];
      const next = addShape(live, d.shape, c);
      const l = symShapes(next).find((s) => s.kind === d.shape && s.coords.join() === c.join())?.line;
      setSel(l === undefined ? [] : [l]);
      setSelPins([]);
      change(next);
      return;
    }
    // clic en un texto sin moverlo: su ventanita para cambiarlo (contenido, alineación, tamaño)
    if (d.kind === 'text' && live === text) {
      const x = texts.find((tx) => tx.line === d.line);
      if (x) setAskText({ ...x });
      return;
    }
    change(live);
  };
  const start = (d: Drag) => (e: React.PointerEvent) => {
    if (tool !== 'edit' || e.button !== 0) return;
    e.stopPropagation();
    capture(e);
    drag.current = d;
  };
  // click en el fondo: dibuja (con una figura elegida), pone un pin o deselecciona
  const down = (e: React.PointerEvent) => {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      capture(e);
      manual.current = true;
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, box, k: upx };
      return;
    }
    if (e.button !== 0) return;
    aside.current?.focus({ preventScroll: true });
    if (tool === 'edit') {
      // en el fondo: ventana de selección
      clearSel();
      capture(e);
      const p = toDoc(e, 1);
      drag.current = { kind: 'band', from: p, to: p };
      return;
    }
    if (tool === 'text') {
      setAskText({ ...toDoc(e, 1), align: 'Left', size: 2, text: '' });
      return;
    }
    if (tool === 'pin') {
      const p = toDoc(e, GRID);
      if (missing[0]) change(addPin(live, missing[0], p.x, p.y));
      else setAskPin({ ...p, name: '' });
      return;
    }
    capture(e);
    const p = toDoc(e, 1);
    drag.current = { kind: 'draw', shape: tool, from: p, to: p };
    setPreview(drag.current);
  };
  const confirmPin = () => {
    if (!askPin) return;
    const n = askPin.name.trim();
    if (!/^[A-Za-z_][\w+-]*$/.test(n) || pins.some((p) => p.name.toLowerCase() === n.toLowerCase())) return;
    if (ports.some((x) => x.toLowerCase() === n.toLowerCase()) || !onAddPort) change(addPin(live, n, askPin.x, askPin.y));
    else {
      // el puerto nuevo va al esquemático; su pin aparece en un borde y después se lo lleva al click
      pendingPin.current = { ...askPin, name: n };
      onAddPort(n);
    }
    setAskPin(null);
  };
  const confirmText = () => {
    if (!askText) return;
    const { line, ...tx } = askText;
    if (!tx.text.trim()) return setAskText(null);
    const next = line === undefined ? addText(live, tx) : setText(live, line, tx);
    change(next);
    const l = line ?? symTexts(next).find((x) => x.x === tx.x && x.y === tx.y && x.text === tx.text.replace(/[\r\n]+/g, ' '))?.line;
    setSel(l === undefined ? [] : [l]);
    setSelPins([]);
    setAskText(null);
    aside.current?.focus({ preventScroll: true });
  };
  const pendingPin = useRef<(Pt & { name: string }) | null>(null);
  useEffect(() => {
    const p = pendingPin.current;
    if (!p) return;
    const i = symPins(text).findIndex((x) => x.name.toLowerCase() === p.name.toLowerCase());
    if (i < 0) return;
    pendingPin.current = null;
    onChange(movePin(text, i, p.x, p.y));
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  /** lo seleccionado, corrido (dx, dy) desde el texto `orig` */
  const moveGroup = (orig: string, dx: number, dy: number) => {
    let tt = orig;
    for (const s of symShapes(orig)) if (sel.includes(s.line)) tt = setShape(tt, s.line, [s.coords[0] + dx, s.coords[1] + dy, s.coords[2] + dx, s.coords[3] + dy]);
    for (const x of symTexts(orig)) if (sel.includes(x.line)) tt = setText(tt, x.line, { x: x.x + dx, y: x.y + dy });
    symPins(orig).forEach((p, i) => {
      if (selPins.includes(i)) tt = movePin(tt, i, p.x + dx, p.y + dy, keepAlign);
    });
    return tt;
  };
  const many = sel.length + selPins.length > 1;
  const startGroup = (e: React.PointerEvent) => start({ kind: 'group', from: toDoc(e, 1), orig: live, g: selPins.length ? GRID : 1 })(e);
  const hasSel = sel.length > 0 || selPins.length > 0;
  const remove = () => {
    if (!hasSel) return;
    let tt = live;
    for (const l of [...sel].sort((a, b) => b - a)) tt = removeShape(tt, l);
    for (const i of [...selPins].sort((a, b) => b - a)) tt = removePin(tt, i);
    change(tt);
    clearSel();
    // el botón queda deshabilitado y suelta el foco: que los atajos (Ctrl+Z) sigan en el panel
    aside.current?.focus({ preventScroll: true });
  };
  const keyDown = (e: React.KeyboardEvent) => {
    if ((e.target as Element).closest('input, select, textarea')) return;
    // las teclas sueltas (Supr, W, P…) son del panel, no herramientas del esquemático
    if (!e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation();
    if ((e.key === 'Delete' || e.key === 'Backspace') && hasSel) {
      e.preventDefault();
      e.stopPropagation();
      remove();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'y' || e.shiftKey) back(redo, undo);
      else back(undo, redo);
    } else if ((e.ctrlKey || e.metaKey) && /^[cx]$/i.test(e.key) && hasSel) {
      // copiar / cortar: figuras y pines seleccionados (sirve también entre símbolos)
      e.preventDefault();
      e.stopPropagation();
      clip = copySym(live, sel, selPins);
      pastes = 0;
      if (/x/i.test(e.key)) remove();
    } else if ((e.ctrlKey || e.metaKey) && /^v$/i.test(e.key) && clip) {
      // pegar corrido un paso de grilla más cada vez, y queda seleccionado
      e.preventDefault();
      e.stopPropagation();
      pastes++;
      const r = pasteSym(live, clip, GRID * pastes, GRID * pastes);
      change(r.text);
      setSel(r.shapes);
      setSelPins(r.pins);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setTool('edit');
      setAskPin(null);
      setAskText(null);
    }
  };
  // borde izquierdo: cambia el ancho del panel
  const resize = (e: React.PointerEvent) => {
    if (!onWidth || !aside.current) return;
    e.preventDefault();
    const right = aside.current.getBoundingClientRect().right;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => onWidth(Math.min(Math.max(right - ev.clientX, 260), window.innerWidth * 0.75));
    const done = () => {
      el.removeEventListener('pointermove', mv);
      el.removeEventListener('pointerup', done);
    };
    el.addEventListener('pointermove', mv);
    el.addEventListener('pointerup', done);
  };

  const shapeEl = (kind: ShapeKind, c: Quad, key: string | number, props: React.SVGProps<SVGElement> = {}) => {
    const [a, b, cc, d] = c;
    const p = props as Record<string, unknown>;
    if (kind === 'LINE') return <line key={key} x1={a} y1={b} x2={cc} y2={d} {...p} />;
    if (kind === 'RECTANGLE') return <rect key={key} x={Math.min(a, cc)} y={Math.min(b, d)} width={Math.abs(cc - a)} height={Math.abs(d - b)} {...p} />;
    return <ellipse key={key} cx={(a + cc) / 2} cy={(b + d) / 2} rx={Math.abs(cc - a) / 2} ry={Math.abs(d - b) / 2} {...p} />;
  };
  const label = (p: (typeof pins)[number]) => {
    const pos = { LEFT: [p.x + 6, p.y + 4, 'start'], RIGHT: [p.x - 6, p.y + 4, 'end'], TOP: [p.x, p.y + 14, 'middle'], BOTTOM: [p.x, p.y - 6, 'middle'] }[p.align] ?? [p.x + 6, p.y + 4, 'start'];
    return { x: pos[0] as number, y: pos[1] as number, anchor: pos[2] as 'start' | 'end' | 'middle' };
  };
  const selShape = sel.length === 1 && !selPins.length ? shapes.find((s) => s.line === sel[0]) : undefined;
  const tools: { id: Tool; icon: IconName; label: string }[] = [
    { id: 'edit', icon: 'select', label: t('Edit: drag a window to select several, move pins, corners and shapes (Del removes the selection; Ctrl+C, Ctrl+X, Ctrl+V)') },
    { id: 'pin', icon: 'pin', label: t('Pin (on the grid)') },
    { id: 'LINE', icon: 'line', label: t('Line') },
    { id: 'RECTANGLE', icon: 'rect', label: t('Rectangle') },
    { id: 'CIRCLE', icon: 'circle', label: t('Circle') },
    { id: 'text', icon: 'text', label: t('Text (click a text to change it)') },
  ];
  const hint =
    tool === 'edit'
      ? t('drag on the background to select several; drag the pins, the corners and the shapes')
      : tool === 'pin'
        ? missing.length
          ? t('click to place the pin of {port}', { port: missing[0] })
          : t('click to place a pin for a new port')
        : tool === 'text'
          ? t('click to place a text')
          : t('drag to draw');

  return (
    <aside ref={aside} className="sym-pane" aria-label={t('Symbol of {name}', { name })} tabIndex={-1} onKeyDown={keyDown}>
      {onWidth && <div className="sym-resize" onPointerDown={resize} title={t('Drag to change the width')} />}
      <header>
        <strong>{t('Symbol')}</strong>
        {onPickSymbol && (
          <button className="tree-add" onClick={onPickSymbol} title={t('Import the drawing and the pins of an existing symbol (an opamp, a transistor, a subcircuit…): the .asy')}>
            {t('Import from existing…')}
          </button>
        )}
        {onReset && (
          <button className="tree-add" onClick={onReset} title={t('Back to the generated symbol: a rectangle with the ports on the sides')}>
            {t('Redo')}
          </button>
        )}
      </header>
      <div className="sym-tools" role="toolbar" aria-label={t('Symbol drawing')}>
        {tools.map((x) => (
          <button
            key={x.id}
            className={tool === x.id ? 'active' : ''}
            aria-pressed={tool === x.id}
            aria-label={x.label}
            title={x.label}
            onClick={() => {
              setTool(x.id);
              setAskPin(null);
              setAskText(null);
            }}
          >
            <Icon name={x.icon} size={16} />
          </button>
        ))}
        <span className="sym-sep" />
        <button aria-label={t('Delete the selection (Del)')} title={t('Delete the selection (Del)')} disabled={!hasSel} onClick={remove}>
          <Icon name="trash" size={16} />
        </button>
        <button aria-label={t('Undo (Ctrl+Z)')} title={t('Undo (Ctrl+Z)')} disabled={!undo.current.length} onClick={() => back(undo, redo)}>
          <Icon name="undo" size={16} />
        </button>
        <button
          aria-label={t('Fit the symbol to the view (wheel: zoom, middle or right button: pan)')}
          title={t('Fit the symbol to the view (wheel: zoom, middle or right button: pan)')}
          onClick={fit}
        >
          <Icon name="fit" size={16} />
        </button>
        <span className="tree-meta">{hint}</span>
      </div>
      {askPin && (
        <form
          className="sym-ask"
          onSubmit={(e) => {
            e.preventDefault();
            confirmPin();
          }}
        >
          <input
            ref={askInput}
            aria-label={t('Name of the new port')}
            placeholder={t('Name of the new port')}
            value={askPin.name}
            spellCheck={false}
            onChange={(e) => setAskPin({ ...askPin, name: e.target.value.replace(/\s/g, '') })}
          />
          <button type="submit" className="tree-add">
            {t('Add')}
          </button>
          <button type="button" className="tree-add" onClick={() => setAskPin(null)}>
            {t('Cancel')}
          </button>
        </form>
      )}
      {askText && (
        <form
          className="sym-ask"
          onSubmit={(e) => {
            e.preventDefault();
            confirmText();
          }}
          onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setAskText(null))}
        >
          <input ref={askTextInput} aria-label={t('Text')} placeholder={t('Text')} value={askText.text} spellCheck={false} onChange={(e) => setAskText({ ...askText, text: e.target.value })} />
          <select aria-label={t('Align')} value={askText.align} onChange={(e) => setAskText({ ...askText, align: e.target.value })}>
            {ALIGNS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select aria-label={t('Size')} value={askText.size} onChange={(e) => setAskText({ ...askText, size: Number(e.target.value) })}>
            {SIZES.map((pt, i) => (
              <option key={i} value={i}>
                {pt} pt
              </option>
            ))}
          </select>
          <button type="submit" className="tree-add">
            {askText.line === undefined ? t('Add') : t('OK')}
          </button>
          <button type="button" className="tree-add" onClick={() => setAskText(null)}>
            {t('Cancel')}
          </button>
        </form>
      )}
      <svg
        ref={svg}
        className={`sym-canvas${tool === 'edit' ? '' : ' drawing'}`}
        viewBox={box.join(' ')}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          {/* grilla fina de 1×1 (tenue) y la de 16×16 encima */}
          <pattern id="sym-grid-fine" width={1} height={1} patternUnits="userSpaceOnUse" x={0} y={0}>
            <path d="M1 0H0V1" className="sym-grid-fine" />
          </pattern>
          <pattern id="sym-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse" x={0} y={0}>
            <path d={`M${GRID} 0H0V${GRID}`} className="sym-grid-major" />
          </pattern>
        </defs>
        <rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} fill="url(#sym-grid-fine)" />
        <rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} fill="url(#sym-grid)" />
        <g className="sym-shapes">
          {shapes.map((s) => shapeEl(s.kind, s.coords, s.line, { className: sel.includes(s.line) ? 'sel' : undefined }))}
          {/* banda ancha e invisible para agarrar las figuras sin apuntar al píxel */}
          {tool === 'edit' &&
            shapes.map((s) =>
              shapeEl(s.kind, s.coords, `hit${s.line}`, {
                className: 'hit',
                onPointerDown: (e: React.PointerEvent<SVGElement>) => {
                  if (e.button !== 0) return;
                  aside.current?.focus({ preventScroll: true });
                  if (many && sel.includes(s.line)) return startGroup(e);
                  setSel([s.line]);
                  setSelPins([]);
                  start({ kind: 'shape', line: s.line, from: toDoc(e, 1), orig: s.coords })(e);
                },
              }),
            )}
          {preview?.kind === 'band' && shapeEl('RECTANGLE', [preview.from.x, preview.from.y, preview.to.x, preview.to.y], 'band', { className: 'band' })}
          {preview?.kind === 'draw' && shapeEl(preview.shape, [preview.from.x, preview.from.y, preview.to.x, preview.to.y], 'preview', { className: 'preview' })}
        </g>
        {selShape &&
          tool === 'edit' &&
          (selShape.kind === 'LINE'
            ? ([0, 1] as const).map((end) => (
                <circle key={end} className="sym-end" cx={selShape.coords[end * 2]} cy={selShape.coords[end * 2 + 1]} r={5 * upx} onPointerDown={start({ kind: 'end', line: selShape.line, end })} />
              ))
            : ([0, 1] as const).flatMap((cx) =>
                ([0, 1] as const).map((cy) => {
                  const [x1, y1, x2, y2] = selShape.coords;
                  const x = cx ? Math.max(x1, x2) : Math.min(x1, x2);
                  const y = cy ? Math.max(y1, y2) : Math.min(y1, y2);
                  return (
                    <rect
                      key={`${cx}${cy}`}
                      className="sym-corner"
                      x={x - 5 * upx}
                      y={y - 5 * upx}
                      width={10 * upx}
                      height={10 * upx}
                      onPointerDown={start({ kind: 'corner', line: selShape.line, cx, cy })}
                    >
                      <title>{t('Resize')}</title>
                    </rect>
                  );
                }),
              ))}
        {texts.map((x) => (
          <g
            key={`t${x.line}`}
            className={`sym sym-text${sel.includes(x.line) ? ' sel' : ''}`}
            onPointerDown={(e) => {
              if (tool !== 'edit' || e.button !== 0) return;
              aside.current?.focus({ preventScroll: true });
              if (many && sel.includes(x.line)) return startGroup(e);
              setSel([x.line]);
              setSelPins([]);
              start({ kind: 'text', line: x.line, from: toDoc(e, 1), orig: { x: x.x, y: x.y } })(e);
            }}
            onDoubleClick={() => setAskText({ ...x })}
          >
            <AlignedText x={x.x} y={x.y} align={x.align} size={x.size} label className="win">
              {x.text}
            </AlignedText>
            <title>{t('Text of the symbol: click to change it, drag to move it')}</title>
          </g>
        ))}
        {wins.map((w) => (
          <g
            key={w.n}
            className={`sym ${w.n === 39 ? 'sym-param' : 'sym-win'}`}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              aside.current?.focus({ preventScroll: true });
              start({ kind: 'win', n: w.n, from: toDoc(e, 1), orig: { x: w.x, y: w.y } })(e);
            }}
          >
            <AlignedText x={w.x} y={w.y} align={w.align} size={w.size} label className="win">
              {w.text}
            </AlignedText>
            <title>{t('{attr} as shown on each instance: drag to move it', { attr: WINDOW_ATTR[w.n] ?? '' })}</title>
          </g>
        ))}
        {askPin && <rect className="sym-pin-new" x={askPin.x - 5} y={askPin.y - 5} width={10} height={10} />}
        {pins.map((p, i) => {
          const l = label(p);
          return (
            <g
              key={i}
              className={`sym-pin${selPins.includes(i) ? ' sel' : ''}`}
              onPointerDown={(e) => {
                if (tool !== 'edit' || e.button !== 0) return;
                aside.current?.focus({ preventScroll: true });
                if (many && selPins.includes(i)) return startGroup(e);
                setSel([]);
                setSelPins([i]);
                start({ kind: 'pin', index: i })(e);
              }}
            >
              <rect x={p.x - 5} y={p.y - 5} width={10} height={10} />
              {p.align !== 'NONE' && (
                <text x={l.x} y={l.y} textAnchor={l.anchor}>
                  {p.name}
                </text>
              )}
              <title>{t('{name} (order {n})', { name: p.name, n: p.order })}</title>
            </g>
          );
        })}
      </svg>
      {assign && missing.length > 0 && <p className="tree-warn">{t('Ports without a pin: {ports}', { ports: missing.join(', ') })}</p>}
      <div className="sym-bottom">
        {assign && pins.length > 1 && (
          <details className="sym-assign">
            <summary>{t('Port of each pin')}</summary>
            <table>
              <tbody>
                {pins.map((p, i) => (
                  <tr key={i}>
                    <td className="tree-meta">{t('Pin {n}', { n: i + 1 })}</td>
                    <td>
                      <select
                        aria-label={t('Port of pin {n}', { n: i + 1 })}
                        value={p.name}
                        onChange={(e) =>
                          onChange(
                            assignPin(
                              text,
                              i,
                              e.target.value,
                              ports.map((n) => ({ name: n })),
                            ),
                          )
                        }
                      >
                        {ports.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
        <ParamsEditor key={formatParamList(ps)} params={ps} onChange={onParams} />
      </div>
    </aside>
  );
}

/** Parámetros del subcircuito: nombre y valor por defecto; adentro se usan como {nombre} */
function ParamsEditor({ params, onChange }: { params: [string, string][]; onChange(ps: [string, string][]): void }) {
  const [rows, setRows] = useState(params);
  const valid = (ps: [string, string][]) => ps.filter(([k, v]) => /^[A-Za-z_]\w*$/.test(k.trim()) && v.trim());
  const commit = (ps = rows) => {
    const next = valid(ps).map(([k, v]) => [k.trim(), v.trim()] as [string, string]);
    if (formatParamList(next) !== formatParamList(params)) onChange(next);
  };
  return (
    <div className="sym-params">
      <h4>
        {t('Parameters')}
        <button className="tree-add" onClick={() => setRows([...rows, ['', '']])}>
          + {t('Add')}
        </button>
      </h4>
      {rows.length ? (
        <>
          <p className="tree-meta sym-params-help">
            {t(
              'Name: just the identifier, without braces (e.g. R3). Inside the subcircuit use it between braces in values and expressions: {R3}, {2*R3}. Each instance can override the default value (R3=10k).',
            )}
          </p>
          <table>
            <thead>
              <tr>
                <th>{t('Name')}</th>
                <th>{t('Default value')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, v], i) => (
                <tr key={i}>
                  <td>
                    <input
                      value={k}
                      aria-label={t('Parameter name')}
                      spellCheck={false}
                      onChange={(e) => setRows(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))}
                      onBlur={() => commit()}
                    />
                  </td>
                  <td>
                    <input
                      value={v}
                      className={k.trim() && !v.trim() ? 'bad' : undefined}
                      aria-invalid={!!k.trim() && !v.trim()}
                      aria-label={t('Default value of {name}', { name: k })}
                      spellCheck={false}
                      onChange={(e) => setRows(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))}
                      onBlur={() => commit()}
                      onKeyDown={(e) => e.key === 'Enter' && commit()}
                    />
                  </td>
                  <td>
                    <button
                      className="icon-x"
                      aria-label={t('Remove {name}', { name: k })}
                      onClick={() => {
                        const next = rows.filter((_, j) => j !== i);
                        setRows(next);
                        commit(next);
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.some(([k, v]) => k.trim() && !v.trim()) && <p className="tree-warn">{t('A parameter is saved once it has a default value (e.g. 1k)')}</p>}
        </>
      ) : (
        <p className="tree-meta">{t('None. Inside the subcircuit they are used as {name} (e.g. a resistor of value {R}); each instance can change them.')}</p>
      )}
    </div>
  );
}
