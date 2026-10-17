// Operaciones de edición como funciones puras sobre AscDoc (para deshacer/rehacer).
import type { AscDoc, Flag, Orient, Point, SchText, SymbolInst, Wire } from '../asc/model.ts';
import { onSegment } from '../netlist/connectivity.ts';
import { mirrorX, rotateCW } from '../asc/transform.ts';
import type { Library } from '../library/library.ts';
import { pinPoints, snap, type ItemRef } from './geometry.ts';

const samePt = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const ends = (w: Wire): [Point, Point] => [
  { x: w.x1, y: w.y1 },
  { x: w.x2, y: w.y2 },
];

/** Parte los cables existentes en `p` si cae en su interior (unión en T, como LTspice) */
function splitAt(wires: Wire[], p: Point): Wire[] {
  const out: Wire[] = [];
  for (const w of wires) {
    const [a, b] = ends(w);
    if (!samePt(a, p) && !samePt(b, p) && onSegment(p, w)) {
      out.push({ x1: w.x1, y1: w.y1, x2: p.x, y2: p.y }, { x1: p.x, y1: p.y, x2: w.x2, y2: w.y2 });
    } else out.push(w);
  }
  return out;
}

export function addWire(doc: AscDoc, a: Point, b: Point): AscDoc {
  if (samePt(a, b)) return doc;
  let wires = splitAt(splitAt(doc.wires, a), b);
  // Cortar el cable nuevo donde terminan otros cables o hay pines (para que conecten igual
  // que en LTspice, que guarda los cables partidos)
  const stops: Point[] = [];
  const nw: Wire = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  for (const w of wires) for (const e of ends(w)) if (!samePt(e, a) && !samePt(e, b) && onSegment(e, nw)) stops.push(e);
  const dist = (p: Point) => Math.hypot(p.x - a.x, p.y - a.y);
  const pts = [a, ...stops.sort((p, q) => dist(p) - dist(q)), b].filter((p, i, arr) => i === 0 || !samePt(p, arr[i - 1]));
  for (let i = 1; i < pts.length; i++) wires.push({ x1: pts[i - 1].x, y1: pts[i - 1].y, x2: pts[i].x, y2: pts[i].y });
  // Sin duplicados exactos
  const seen = new Set<string>();
  wires = wires.filter((w) => {
    const k = [w.x1, w.y1, w.x2, w.y2].join();
    const r = [w.x2, w.y2, w.x1, w.y1].join();
    if (seen.has(k) || seen.has(r)) return false;
    seen.add(k);
    return true;
  });
  return { ...doc, wires };
}

/** Letra de InstName que usa LTspice para un prefijo (X → U, QN → Q, MN → M…) */
export function instLetter(prefix: string): string {
  const p = prefix.toUpperCase();
  if (p === 'X') return 'U';
  return p[0] ?? 'U';
}

export function nextInstName(doc: AscDoc, letter: string, lib: Library): string {
  const used = new Set(
    doc.symbols.map((s) => (s.attrs.get('InstName') ?? lib.symbol(s.type)?.attrs.get('InstName') ?? '').toUpperCase()),
  );
  for (let i = 1; ; i++) if (!used.has(`${letter}${i}`.toUpperCase())) return `${letter}${i}`;
}

export function placeSymbol(doc: AscDoc, type: string, at: Point, orient: Orient, lib: Library): AscDoc {
  const def = lib.symbol(type);
  const attrs = new Map<string, string>();
  if (!def?.attrs.has('InstName')) attrs.set('InstName', nextInstName(doc, instLetter(def?.attrs.get('Prefix') ?? 'X'), lib));
  const sym: SymbolInst = { type, x: at.x, y: at.y, orient, windows: new Map(), attrs };
  return { ...doc, symbols: [...doc.symbols, sym] };
}

export function addFlag(doc: AscDoc, at: Point, name: string): AscDoc {
  const flags = doc.flags.filter((f) => !samePt(f, at));
  return { ...doc, flags: [...flags, { x: at.x, y: at.y, name }] };
}

export function addText(doc: AscDoc, t: SchText): AscDoc {
  return { ...doc, texts: [...doc.texts, t] };
}

export function deleteItems(doc: AscDoc, refs: ItemRef[]): AscDoc {
  const del = (kind: ItemRef['kind']) => new Set(refs.filter((r) => r.kind === kind).map((r) => r.index));
  const [s, w, f, t] = [del('symbol'), del('wire'), del('flag'), del('text')];
  return {
    ...doc,
    symbols: doc.symbols.filter((_, i) => !s.has(i)),
    wires: doc.wires.filter((_, i) => !w.has(i)),
    flags: doc.flags.filter((_, i) => !f.has(i)),
    texts: doc.texts.filter((_, i) => !t.has(i)),
  };
}

/**
 * Mueve los elementos. Con `drag` (F8 de LTspice) los cables no seleccionados que tocan
 * pines, etiquetas o extremos movidos se estiran para seguir conectados.
 */
export function moveItems(doc: AscDoc, refs: ItemRef[], dx: number, dy: number, drag: boolean, lib: Library): AscDoc {
  if (!dx && !dy) return doc;
  const sel = (kind: ItemRef['kind']) => new Set(refs.filter((r) => r.kind === kind).map((r) => r.index));
  const [s, w, f, t] = [sel('symbol'), sel('wire'), sel('flag'), sel('text')];

  // Puntos que se mueven (para estirar cables conectados)
  const moving = new Set<string>();
  const key = (p: Point) => `${p.x},${p.y}`;
  if (drag) {
    doc.symbols.forEach((sym, i) => s.has(i) && pinPoints(sym, lib.symbol(sym.type)).forEach((p) => moving.add(key(p))));
    doc.flags.forEach((fl, i) => f.has(i) && moving.add(key(fl)));
    doc.wires.forEach((wr, i) => w.has(i) && ends(wr).forEach((p) => moving.add(key(p))));
  }
  const mv = (p: Point) => ({ x: p.x + dx, y: p.y + dy });

  // Conexiones directas (pin con pin, etiqueta sobre pin) sin cable que estirar: como el
  // "drag" de LTspice, se agrega un cable en L para que sigan conectadas
  const extra: Wire[] = [];
  if (drag) {
    const stay = new Set<string>();
    doc.symbols.forEach((sym, i) => !s.has(i) && pinPoints(sym, lib.symbol(sym.type)).forEach((p) => stay.add(key(p))));
    doc.flags.forEach((fl, i) => !f.has(i) && stay.add(key(fl)));
    const wireEnds = new Set(doc.wires.flatMap((wr) => ends(wr).map(key)));
    const done = new Set<string>();
    const moved: Point[] = [];
    doc.symbols.forEach((sym, i) => s.has(i) && moved.push(...pinPoints(sym, lib.symbol(sym.type))));
    doc.flags.forEach((fl, i) => f.has(i) && moved.push(fl));
    for (const p of moved) {
      const k = key(p);
      if (!stay.has(k) || wireEnds.has(k) || done.has(k)) continue;
      done.add(k);
      const corner = { x: p.x + dx, y: p.y };
      if (dx) extra.push({ x1: p.x, y1: p.y, x2: corner.x, y2: corner.y });
      if (dy) extra.push({ x1: corner.x, y1: corner.y, x2: p.x + dx, y2: p.y + dy });
    }
  }

  return {
    ...doc,
    symbols: doc.symbols.map((sym, i) => (s.has(i) ? { ...sym, x: sym.x + dx, y: sym.y + dy } : sym)),
    flags: doc.flags.map((fl, i): Flag => (f.has(i) ? { ...fl, ...mv(fl) } : fl)),
    texts: doc.texts.map((tx, i) => (t.has(i) ? { ...tx, ...mv(tx) } : tx)),
    wires: doc.wires.map((wr, i) => {
      if (w.has(i)) return { x1: wr.x1 + dx, y1: wr.y1 + dy, x2: wr.x2 + dx, y2: wr.y2 + dy };
      if (!drag) return wr;
      const [a, b] = ends(wr);
      const na = moving.has(key(a)) ? mv(a) : a;
      const nb = moving.has(key(b)) ? mv(b) : b;
      return { x1: na.x, y1: na.y, x2: nb.x, y2: nb.y };
    }).concat(extra),
  };
}

/** Rótulos al rotar: los que no están ocultos vuelven a la posición por defecto de la nueva orientación */
function resetWindows(sym: SymbolInst): SymbolInst {
  const windows = new Map([...sym.windows].filter(([, w]) => w.align === 'Invisible'));
  return { ...sym, windows };
}

/** Rota (90° horario) o espeja la selección alrededor de su centro, sobre la grilla */
export function transformItems(doc: AscDoc, refs: ItemRef[], op: 'rotate' | 'mirror', lib: Library): AscDoc {
  if (!refs.length) return doc;
  const pts: Point[] = [];
  for (const r of refs) {
    if (r.kind === 'symbol') pts.push(...pinPoints(doc.symbols[r.index], lib.symbol(doc.symbols[r.index].type)), doc.symbols[r.index]);
    if (r.kind === 'wire') pts.push(...ends(doc.wires[r.index]));
    if (r.kind === 'flag') pts.push(doc.flags[r.index]);
    if (r.kind === 'text') pts.push(doc.texts[r.index]);
  }
  const c = {
    x: snap((Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2),
    y: snap((Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) / 2),
  };
  const tp = (p: Point): Point =>
    op === 'rotate' ? { x: c.x - (p.y - c.y), y: c.y + (p.x - c.x) } : { x: 2 * c.x - p.x, y: p.y };

  const sel = (kind: ItemRef['kind']) => new Set(refs.filter((r) => r.kind === kind).map((r) => r.index));
  const [s, w, f, t] = [sel('symbol'), sel('wire'), sel('flag'), sel('text')];
  return {
    ...doc,
    symbols: doc.symbols.map((sym, i) => {
      if (!s.has(i)) return sym;
      const at = tp(sym);
      const orient = op === 'rotate' ? rotateCW(sym.orient) : mirrorX(sym.orient);
      return resetWindows({ ...sym, ...at, orient });
    }),
    wires: doc.wires.map((wr, i) => {
      if (!w.has(i)) return wr;
      const [a, b] = ends(wr).map(tp);
      return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }),
    flags: doc.flags.map((fl, i) => (f.has(i) ? { ...fl, ...tp(fl) } : fl)),
    texts: doc.texts.map((tx, i) => (t.has(i) ? { ...tx, ...tp(tx) } : tx)),
  };
}

export function setSymbolAttrs(doc: AscDoc, index: number, attrs: Record<string, string | null>): AscDoc {
  return {
    ...doc,
    symbols: doc.symbols.map((s, i) => {
      if (i !== index) return s;
      const a = new Map(s.attrs);
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null) a.delete(k);
        else a.set(k, v);
      }
      return { ...s, attrs: a };
    }),
  };
}

export function setText(doc: AscDoc, index: number, patch: Partial<SchText>): AscDoc {
  return { ...doc, texts: doc.texts.map((t, i) => (i === index ? { ...t, ...patch } : t)) };
}

export function setFlagName(doc: AscDoc, index: number, name: string): AscDoc {
  return { ...doc, flags: doc.flags.map((f, i) => (i === index ? { ...f, name } : f)) };
}

/** Copia de los elementos seleccionados desplazada (F6 duplicar / pegar) */
export function duplicateItems(doc: AscDoc, refs: ItemRef[], dx: number, dy: number, lib: Library): { doc: AscDoc; refs: ItemRef[] } {
  let out = doc;
  const newRefs: ItemRef[] = [];
  for (const r of refs) {
    if (r.kind === 'symbol') {
      const s = doc.symbols[r.index];
      const def = lib.symbol(s.type);
      const attrs = new Map(s.attrs);
      if (attrs.has('InstName')) attrs.set('InstName', nextInstName(out, instLetter(def?.attrs.get('Prefix') ?? 'X'), lib));
      out = { ...out, symbols: [...out.symbols, { ...s, x: s.x + dx, y: s.y + dy, attrs, windows: new Map(s.windows) }] };
      newRefs.push({ kind: 'symbol', index: out.symbols.length - 1 });
    } else if (r.kind === 'wire') {
      const w = doc.wires[r.index];
      out = { ...out, wires: [...out.wires, { x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy }] };
      newRefs.push({ kind: 'wire', index: out.wires.length - 1 });
    } else if (r.kind === 'flag') {
      const f = doc.flags[r.index];
      out = { ...out, flags: [...out.flags, { ...f, x: f.x + dx, y: f.y + dy }] };
      newRefs.push({ kind: 'flag', index: out.flags.length - 1 });
    } else {
      const t = doc.texts[r.index];
      out = { ...out, texts: [...out.texts, { ...t, x: t.x + dx, y: t.y + dy }] };
      newRefs.push({ kind: 'text', index: out.texts.length - 1 });
    }
  }
  return { doc: out, refs: newRefs };
}

/** Todos los elementos del documento (Ctrl+A) */
export function allItems(doc: AscDoc): ItemRef[] {
  return [
    ...doc.symbols.map((_, index) => ({ kind: 'symbol' as const, index })),
    ...doc.wires.map((_, index) => ({ kind: 'wire' as const, index })),
    ...doc.flags.map((_, index) => ({ kind: 'flag' as const, index })),
    ...doc.texts.map((_, index) => ({ kind: 'text' as const, index })),
  ];
}

/** Documento con sólo los elementos seleccionados (para copiar al portapapeles como .asc) */
export function extractItems(doc: AscDoc, refs: ItemRef[]): AscDoc {
  const has = (kind: ItemRef['kind'], i: number) => refs.some((r) => r.kind === kind && r.index === i);
  return {
    ...doc,
    symbols: doc.symbols.filter((_, i) => has('symbol', i)),
    wires: doc.wires.filter((_, i) => has('wire', i)),
    flags: doc.flags.filter((_, i) => has('flag', i)),
    texts: doc.texts.filter((_, i) => has('text', i)),
    shapes: [],
    dataFlags: [],
  };
}

/**
 * Pega un fragmento con su esquina superior izquierda en `at` (sobre la grilla). Los
 * componentes cuyo nombre ya existe en el documento reciben uno nuevo, como al duplicar.
 */
export function pasteItems(doc: AscDoc, frag: AscDoc, at: Point, lib: Library): { doc: AscDoc; refs: ItemRef[] } {
  const pts: Point[] = [...frag.symbols, ...frag.flags, ...frag.texts, ...frag.wires.flatMap(ends)];
  if (!pts.length) return { doc, refs: [] };
  const dx = snap(at.x - Math.min(...pts.map((p) => p.x)));
  const dy = snap(at.y - Math.min(...pts.map((p) => p.y)));
  const nameOf = (s: SymbolInst) => (s.attrs.get('InstName') ?? lib.symbol(s.type)?.attrs.get('InstName') ?? '').toUpperCase();
  let symbols = doc.symbols;
  for (const s of frag.symbols) {
    const attrs = new Map(s.attrs);
    const name = nameOf(s);
    if (name && symbols.some((o) => nameOf(o) === name)) {
      attrs.set('InstName', nextInstName({ ...doc, symbols }, instLetter(lib.symbol(s.type)?.attrs.get('Prefix') ?? 'X'), lib));
    }
    symbols = [...symbols, { ...s, x: s.x + dx, y: s.y + dy, attrs, windows: new Map(s.windows) }];
  }
  const out: AscDoc = {
    ...doc,
    symbols,
    wires: [...doc.wires, ...frag.wires.map((w) => ({ x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy }))],
    flags: [...doc.flags, ...frag.flags.map((f) => ({ ...f, x: f.x + dx, y: f.y + dy }))],
    texts: [...doc.texts, ...frag.texts.map((t) => ({ ...t, x: t.x + dx, y: t.y + dy }))],
  };
  const refs: ItemRef[] = [
    ...frag.symbols.map((_, i) => ({ kind: 'symbol' as const, index: doc.symbols.length + i })),
    ...frag.wires.map((_, i) => ({ kind: 'wire' as const, index: doc.wires.length + i })),
    ...frag.flags.map((_, i) => ({ kind: 'flag' as const, index: doc.flags.length + i })),
    ...frag.texts.map((_, i) => ({ kind: 'text' as const, index: doc.texts.length + i })),
  ];
  return { doc: out, refs };
}

/** Mueve el rótulo `win` (0 = InstName, 3 = Value…) de un símbolo: queda como WINDOW explícito */
export function setWindow(doc: AscDoc, index: number, win: number, w: { x: number; y: number; align: string; size: number }): AscDoc {
  return {
    ...doc,
    symbols: doc.symbols.map((s, i) => (i === index ? { ...s, windows: new Map(s.windows).set(win, w) } : s)),
  };
}
