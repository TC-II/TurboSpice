// Operaciones de edición como funciones puras sobre AscDoc (para deshacer/rehacer).
import type { AscDoc, Flag, Orient, Point, SchText, Shape, SymbolInst, TextWindow, Wire } from '../asc/model.ts';
import { defaultWindows, effectiveWindows, ltspiceDefaultAs, ltspiceWindows, shownAlign } from '../asc/resolve.ts';
import { connectivity, onSegment } from '../netlist/connectivity.ts';
import { localAlign, mirrorX, rotateCW, toWorld } from '../asc/transform.ts';
import type { Library } from '../library/library.ts';
import { parseSource } from '../sim/sources.ts';
import { localBox, pinPoints, pivotNear, snap, symbolPivot, type ItemRef } from './geometry.ts';
import { mapShape, shapePoints, shiftShape } from './shapes.ts';

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

export function addWire(doc: AscDoc, a: Point, b: Point, lib?: Library): AscDoc {
  if (samePt(a, b)) return doc;
  let wires = splitAt(splitAt(doc.wires, a), b);
  // Cortar el cable nuevo donde terminan otros cables o hay pines (para que conecten igual
  // que en LTspice, que guarda los cables partidos)
  const stops: Point[] = [];
  const nw: Wire = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  for (const w of wires) for (const e of ends(w)) if (!samePt(e, a) && !samePt(e, b) && onSegment(e, nw)) stops.push(e);
  const dist = (p: Point) => Math.hypot(p.x - a.x, p.y - a.y);
  const pts = [a, ...stops.sort((p, q) => dist(p) - dist(q)), b].filter((p, i, arr) => i === 0 || !samePt(p, arr[i - 1]));
  const added = new Set<Wire>();
  for (let i = 1; i < pts.length; i++) {
    const w = { x1: pts[i - 1].x, y1: pts[i - 1].y, x2: pts[i].x, y2: pts[i].y };
    added.add(w);
    wires.push(w);
  }
  // Sin duplicados exactos
  const seen = new Set<string>();
  wires = wires.filter((w) => {
    const k = [w.x1, w.y1, w.x2, w.y2].join();
    const r = [w.x2, w.y2, w.x1, w.y1].join();
    if (seen.has(k) || seen.has(r)) return false;
    seen.add(k);
    return true;
  });
  // el cable nuevo no atraviesa componentes: se parte en sus pines (como LTspice)
  if (lib) wires = cutThroughBodies(doc, wires, lib, (_, w) => added.has(w));
  return mergeCollinear({ ...doc, wires }, lib);
}

/**
 * Un cable que pasa por dos pines del mismo componente lo pondría en corto. Como LTspice, se
 * quita el tramo entre esos pines (el que va sobre el cuerpo) y quedan dos cables que terminan
 * en ellos. Sólo para los pares que `applies` acepta (lo recién dibujado o movido) y si entre
 * los dos pines no llega nada más (otro pin, una etiqueta o el extremo de otro cable).
 */
function cutThroughBodies(doc: AscDoc, wires: Wire[], lib: Library, applies: (sym: number, w: Wire) => boolean): Wire[] {
  return cutPieces(doc, wires, lib, applies).flat();
}

/** Como cutThroughBodies, pero devuelve los tramos que quedan de cada cable (en su lugar) */
function cutPieces(doc: AscDoc, wires: Wire[], lib: Library, applies: (sym: number, w: Wire) => boolean): Wire[][] {
  const pins = doc.symbols.flatMap((s, sym) => pinPoints(s, lib.symbol(s.type)).map((p) => ({ p, sym })));
  if (!pins.length) return wires.map((w) => [w]);
  const marks: Point[] = [...pins.map((q) => q.p), ...doc.flags, ...wires.flatMap(ends)];
  return wires.map((w) => {
    if (isZero(w) || !doc.symbols.some((_, i) => applies(i, w))) return [w];
    // posición a lo largo del cable (las coordenadas son enteras: comparaciones exactas)
    const along = (p: Point) => (w.x1 !== w.x2 ? (p.x - w.x1) / (w.x2 - w.x1) : (p.y - w.y1) / (w.y2 - w.y1));
    const on = pins.filter((q) => applies(q.sym, w) && onSegment(q.p, w)).map((q) => ({ ...q, t: along(q.p) }));
    const cuts: { from: Point; to: Point; t0: number; t1: number }[] = [];
    for (const a of on)
      for (const b of on) {
        if (a.sym !== b.sym || a.t >= b.t) continue;
        if (marks.some((m) => onSegment(m, w) && along(m) > a.t && along(m) < b.t)) continue;
        cuts.push({ from: a.p, to: b.p, t0: a.t, t1: b.t });
      }
    if (!cuts.length) return [w];
    cuts.sort((c, d) => c.t0 - d.t0);
    const out: Wire[] = [];
    let start: Point = { x: w.x1, y: w.y1 };
    for (const c of cuts) {
      if (!samePt(start, c.from)) out.push(seg(start, c.from));
      start = c.to;
    }
    if (!samePt(start, { x: w.x2, y: w.y2 })) out.push(seg(start, { x: w.x2, y: w.y2 }));
    return out;
  });
}

/**
 * Corta los cables que atraviesan los componentes recién colocados (`refs`, pegados, duplicados
 * o rotados) y los cables nuevos que atraviesan cualquier componente. Cada cable cortado queda
 * en su lugar del archivo; las referencias a cables se reasignan a sus tramos.
 */
function cutNew(doc: AscDoc, refs: ItemRef[], lib: Library): { doc: AscDoc; refs: ItemRef[] } {
  const syms = new Set(refs.filter((r) => r.kind === 'symbol').map((r) => r.index));
  const news = new Set(refs.filter((r) => r.kind === 'wire').map((r) => doc.wires[r.index]));
  const pieces = cutPieces(doc, doc.wires, lib, (sym, w) => syms.has(sym) || news.has(w));
  if (pieces.every((p, i) => p.length === 1 && p[0] === doc.wires[i])) return { doc, refs };
  const at: number[] = [];
  pieces.reduce((n, p, i) => ((at[i] = n), n + p.length), 0);
  return {
    doc: { ...doc, wires: pieces.flat() },
    refs: refs.flatMap((r): ItemRef[] => (r.kind === 'wire' ? pieces[r.index].map((_, j) => ({ kind: 'wire', index: at[r.index] + j })) : [r])),
  };
}

/** Letra de InstName que usa LTspice para un prefijo (X → U, QN → Q, MN → M…) */
export function instLetter(prefix: string): string {
  const p = prefix.toUpperCase();
  if (p === 'X') return 'U';
  return p[0] ?? 'U';
}

/** Letra para numerar un símbolo: la de su InstName por defecto si la trae (LP1 → LP), si no la del prefijo */
function nameLetter(def: { attrs: Map<string, string> } | undefined): string {
  const m = /^([A-Za-z_]+)\d+$/.exec(def?.attrs.get('InstName') ?? '');
  return m ? m[1] : instLetter(def?.attrs.get('Prefix') ?? 'X');
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
  // sin InstName en el símbolo, o con uno por defecto ya usado (dos sondas LP1): el siguiente libre
  const dflt = def?.attrs.get('InstName')?.toUpperCase();
  if (!dflt || (/\d$/.test(dflt) && doc.symbols.some((o) => (o.attrs.get('InstName') ?? lib.symbol(o.type)?.attrs.get('InstName') ?? '').toUpperCase() === dflt)))
    attrs.set('InstName', nextInstName(doc, nameLetter(def), lib));
  const sym: SymbolInst = { type, x: at.x, y: at.y, orient, windows: new Map(), attrs };
  // colocado sobre un cable: el cable se parte en sus pines, no queda en corto
  return cutNew({ ...doc, symbols: [...doc.symbols, sym] }, [{ kind: 'symbol', index: doc.symbols.length }], lib).doc;
}

export function addFlag(doc: AscDoc, at: Point, name: string, ioPin?: string): AscDoc {
  const flags = doc.flags.filter((f) => !samePt(f, at));
  return { ...doc, flags: [...flags, ioPin ? { x: at.x, y: at.y, name, ioPin } : { x: at.x, y: at.y, name }] };
}

export function addText(doc: AscDoc, t: SchText): AscDoc {
  return { ...doc, texts: [...doc.texts, t] };
}

export function deleteItems(doc: AscDoc, refs: ItemRef[], lib?: Library): AscDoc {
  const del = (kind: ItemRef['kind']) => new Set(refs.filter((r) => r.kind === kind).map((r) => r.index));
  const [s, w, f, t, sh] = [del('symbol'), del('wire'), del('flag'), del('text'), del('shape')];
  const out = {
    ...doc,
    symbols: doc.symbols.filter((_, i) => !s.has(i)),
    wires: doc.wires.filter((_, i) => !w.has(i)),
    flags: doc.flags.filter((_, i) => !f.has(i)),
    texts: doc.texts.filter((_, i) => !t.has(i)),
    shapes: doc.shapes.filter((_, i) => !sh.has(i)),
  };
  // sin el cable de una T, los dos tramos que quedan alineados vuelven a ser uno
  return w.size ? mergeCollinear(out, lib) : out;
}

/**
 * Mueve los elementos. Con `drag` (arrastrar) se conservan las uniones con lo que no se
 * mueve: los cables no seleccionados que llegan a un punto movido se estiran (en L si eran
 * horizontales o verticales) y donde algo fijo (pin, etiqueta, cable que pasa) tocaba algo
 * movido se agrega un cable en L que los une. Al final se limpian los cables (mergeCollinear).
 * En `selOut` quedan los tramos donde terminaron los cables seleccionados (para reubicar la
 * selección: después de limpiar los cables cambian de índice).
 */
export function moveItems(doc: AscDoc, refs: ItemRef[], dx: number, dy: number, drag: boolean, lib: Library, selOut?: Wire[]): AscDoc {
  if (!dx && !dy) return doc;
  const sel = (kind: ItemRef['kind']) => new Set(refs.filter((r) => r.kind === kind).map((r) => r.index));
  const [s, w, f, t, sh] = [sel('symbol'), sel('wire'), sel('flag'), sel('text'), sel('shape')];
  const key = (p: Point) => `${p.x},${p.y}`;
  const mv = (p: Point) => ({ x: p.x + dx, y: p.y + dy });
  const shift = (wr: Wire): Wire => ({ x1: wr.x1 + dx, y1: wr.y1 + dy, x2: wr.x2 + dx, y2: wr.y2 + dy });
  const base: AscDoc = {
    ...doc,
    symbols: doc.symbols.map((sym, i) => (s.has(i) ? { ...sym, x: sym.x + dx, y: sym.y + dy } : sym)),
    flags: doc.flags.map((fl, i): Flag => (f.has(i) ? { ...fl, ...mv(fl) } : fl)),
    texts: doc.texts.map((tx, i) => (t.has(i) ? { ...tx, ...mv(tx) } : tx)),
    // las figuras no conectan nada: se trasladan igual al mover y al arrastrar
    shapes: sh.size ? doc.shapes.map((x, i) => (sh.has(i) ? shiftShape(x, dx, dy) : x)) : doc.shapes,
  };
  // un componente movido sobre un cable (o un cable movido sobre un componente) no queda en corto
  const moved = new Set<Wire>();
  const moveWire = (wr: Wire) => {
    const m = shift(wr);
    moved.add(m);
    selOut?.push(m);
    return m;
  };
  const finish = (wires: Wire[]) =>
    mergeCollinear({ ...base, wires: cutThroughBodies(base, wires, lib, (sym, wr) => s.has(sym) || moved.has(wr)) }, lib);
  if (!drag) return finish(doc.wires.map((wr, i) => (w.has(i) ? moveWire(wr) : wr)));

  // Puntos que se mueven: pines y etiquetas seleccionados, extremos de cables seleccionados
  const moving = new Map<string, Point>();
  const stayPins = new Set<string>();
  doc.symbols.forEach((sym, i) =>
    pinPoints(sym, lib.symbol(sym.type)).forEach((p) => (s.has(i) ? moving.set(key(p), p) : stayPins.add(key(p)))),
  );
  const stayFlags = new Set<string>();
  doc.flags.forEach((fl, i) => (f.has(i) ? moving.set(key(fl), fl) : stayFlags.add(key(fl))));
  // Un cable seleccionado que se mueve a lo largo de sí mismo, con un extremo en un codo con un
  // cable no seleccionado, en el pin de un componente que queda, en una etiqueta (GND, nodo) o
  // en una T (y nada más lo mueve), no se traslada entero: se estira como si no
  // estuviera seleccionado, así el codo queda en su lugar y el cable no sobresale (igual que al
  // mover sólo el componente). Si se mueve de costado se traslada entero y su extremo se desliza
  // por los cables que llegan ahí; en diagonal, el codo se desliza con la parte de costado del
  // movimiento y el cable se estira con la otra.
  const otherSelEnds = (i: number, p: Point) => doc.wires.some((o, j) => j !== i && w.has(j) && ends(o).some((e) => samePt(e, p)));
  const unselEnd = (p: Point) =>
    stayPins.has(key(p)) || stayFlags.has(key(p)) || doc.wires.some((o, j) => !w.has(j) && onSegment(p, o));
  const pinned = (i: number, p: Point) => unselEnd(p) && !moving.has(key(p)) && !otherSelEnds(i, p);
  const stretchedSel = new Set<number>();
  const slide = new Map<string, Point>();
  doc.wires.forEach((wr, i) => {
    const along = (wr.y1 === wr.y2 && dx !== 0) || (wr.x1 === wr.x2 && dy !== 0);
    if (!w.has(i) || !along) return;
    const pins = ends(wr).filter((p) => pinned(i, p));
    if (!pins.length) return;
    w.delete(i);
    stretchedSel.add(i);
    const perp = wr.y1 === wr.y2 ? { x: 0, y: dy } : { x: dx, y: 0 };
    // (sólo un codo entre cables se desliza: un pin, una etiqueta o una T quedan donde están)
    const elbow = (p: Point) => !stayPins.has(key(p)) && !stayFlags.has(key(p)) && !doc.wires.some((o, j) => !w.has(j) && inInterior(p, o));
    if (perp.x || perp.y) for (const p of pins) if (elbow(p)) slide.set(key(p), perp);
  });
  doc.wires.forEach((wr, i) => w.has(i) && ends(wr).forEach((p) => moving.set(key(p), p)));
  // …y lo fijo que se apoya en el interior de un cable seleccionado (una T) también lo sigue
  const selWires = doc.wires.filter((_, i) => w.has(i));
  const inSelInterior = (p: Point) => selWires.some((sw) => onSegment(p, sw) && !ends(sw).some((e) => samePt(e, p)));
  const stayPoints: Point[] = [
    ...doc.symbols.flatMap((sym, i) => (s.has(i) ? [] : pinPoints(sym, lib.symbol(sym.type)))),
    ...doc.flags.filter((_, i) => !f.has(i)),
    ...doc.wires.flatMap((wr, i) => (w.has(i) ? [] : ends(wr))),
  ];
  for (const p of stayPoints) if (!moving.has(key(p)) && inSelInterior(p)) moving.set(key(p), p);

  // Puntos movidos donde queda algo fijo: se unen con un cable nuevo en vez de estirar
  const passes = (p: Point) =>
    doc.wires.some((wr, i) => !w.has(i) && onSegment(p, wr) && !ends(wr).some((e) => samePt(e, p)));
  const anchored = [...moving.values()].filter((p) => stayPins.has(key(p)) || stayFlags.has(key(p)) || passes(p));
  const anchoredKeys = new Set(anchored.map(key));
  const stretches = (p: Point) => moving.has(key(p)) && !anchoredKeys.has(key(p));

  const wires: Wire[] = [];
  doc.wires.forEach((wr, i) => {
    if (w.has(i)) return wires.push(moveWire(wr));
    const [a, b] = ends(wr);
    // un codo que se desliza se corre sólo de costado; lo demás que se mueve, entero
    const to = (p: Point) => {
      const d = slide.get(key(p));
      return d ? { x: p.x + d.x, y: p.y + d.y } : stretches(p) ? mv(p) : p;
    };
    const [ta, tb] = [to(a), to(b)];
    const [sa, sb] = [!samePt(ta, a), !samePt(tb, b)];
    if (!sa && !sb) return wires.push(wr);
    if (sa && sb && ta.x - a.x === tb.x - b.x && ta.y - a.y === tb.y - b.y) return wires.push(seg(ta, tb));
    // un extremo (q) queda o se mueve menos que el otro (m): el tramo conserva su dirección desde q
    const q = sa && !sb ? b : ta;
    const m = sa && !sb ? ta : tb;
    const c = wr.y1 === wr.y2 ? { x: m.x, y: q.y } : wr.x1 === wr.x2 ? { x: q.x, y: m.y } : m;
    const from = wires.length;
    pushPath(wires, sa && !sb ? [m, c, q] : [q, c, m]);
    if (stretchedSel.has(i)) selOut?.push(...wires.slice(from));
  });
  for (const p of anchored) {
    const corner = { x: p.x + dx, y: p.y };
    if (dx) wires.push(seg(p, corner));
    if (dy) wires.push(seg(corner, mv(p)));
  }
  return finish(wires);
}

// ---------------------------------------------------------------------------------------------
// Edición de cables: codos (vértices) y tramos. Conservan la conectividad (las reglas de
// src/netlist/connectivity.ts) y terminan limpiando los cables con mergeCollinear.

const isH = (w: Wire) => w.y1 === w.y2 && w.x1 !== w.x2;
const isV = (w: Wire) => w.x1 === w.x2 && w.y1 !== w.y2;
const isZero = (w: Wire) => w.x1 === w.x2 && w.y1 === w.y2;
const seg = (a: Point, b: Point): Wire => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
const ptKey = (p: Point) => `${p.x},${p.y}`;
/**
 * Agrega los tramos de un recorrido. Si todo queda en un punto se agrega igual un cable de
 * largo 0: mergeCollinear lo quita pero le pasa su lugar en el archivo a los cables vecinos.
 */
function pushPath(wires: Wire[], path: Point[]) {
  const segs = path.slice(1).flatMap((p, j) => (samePt(path[j], p) ? [] : [seg(path[j], p)]));
  wires.push(...(segs.length ? segs : [seg(path[0], path[0])]));
}
/** ¿p está en el interior de w (sin contar los extremos)? */
const inInterior = (p: Point, w: Wire) => onSegment(p, w) && !ends(w).some((e) => samePt(e, p));

/** Pines y etiquetas: ahí un cable partido no se vuelve a unir */
function fixedPoints(doc: AscDoc, lib?: Library): Set<string> {
  const out = new Set(doc.flags.map(ptKey));
  if (lib) for (const s of doc.symbols) for (const p of pinPoints(s, lib.symbol(s.type))) out.add(ptKey(p));
  return out;
}

/**
 * Limpieza de cables: quita los de largo 0 y los duplicados, y fusiona los superpuestos o
 * colineales contiguos en uno solo. Sólo se conservan los cortes donde llega algo más (pin,
 * etiqueta, otro cable que termina o pasa por ahí), así que la conectividad no cambia, y
 * tampoco el orden relativo de los cables (que define los nombres N001…).
 */
export function mergeCollinear(doc: AscDoc, lib?: Library): AscDoc {
  const src = doc.wires;
  const fixed = fixedPoints(doc, lib);
  // Orden de cada cable en el resultado. Uno de largo 0 que se quita le pasa su lugar a los
  // que llegan a ese punto (son de su misma red), así la red no cambia de número.
  const order = src.map((_, i) => i);
  src.forEach((z, i) => {
    if (!isZero(z)) return;
    src.forEach((w, j) => {
      if (!isZero(w) && ends(w).some((e) => e.x === z.x1 && e.y === z.y1)) order[j] = Math.min(order[j], i);
    });
  });
  const out: { key: number; w: Wire }[] = [];
  const lines = new Map<string, { i: number; lo: number; hi: number }[]>();
  const push = (k: string, v: { i: number; lo: number; hi: number }) => {
    const l = lines.get(k);
    if (l) l.push(v);
    else lines.set(k, [v]);
  };
  const seenDiag = new Set<string>();
  src.forEach((w, i) => {
    if (isZero(w)) return;
    if (isH(w)) push(`h${w.y1}`, { i, lo: Math.min(w.x1, w.x2), hi: Math.max(w.x1, w.x2) });
    else if (isV(w)) push(`v${w.x1}`, { i, lo: Math.min(w.y1, w.y2), hi: Math.max(w.y1, w.y2) });
    else {
      const k = [w.x1, w.y1, w.x2, w.y2].join();
      if (seenDiag.has(k) || seenDiag.has([w.x2, w.y2, w.x1, w.y1].join())) return;
      seenDiag.add(k);
      out.push({ key: order[i], w });
    }
  });
  for (const [lk, items] of lines) {
    const horiz = lk[0] === 'h';
    const c = Number(lk.slice(1));
    const at = (v: number): Point => (horiz ? { x: v, y: c } : { x: c, y: v });
    const inLine = new Set(items.map((it) => it.i));
    const isCut = (v: number) => {
      const p = at(v);
      return fixed.has(ptKey(p)) || src.some((o, j) => !inLine.has(j) && !isZero(o) && onSegment(p, o));
    };
    items.sort((a, b) => a.lo - b.lo || a.hi - b.hi);
    for (let g = 0; g < items.length; ) {
      // tramos de la misma línea que se superponen o se tocan
      let hi = items[g].hi;
      let e = g + 1;
      while (e < items.length && items[e].lo <= hi) hi = Math.max(hi, items[e++].hi);
      const group = items.slice(g, e);
      const lo = group[0].lo;
      const cuts = [...new Set(group.flatMap((it) => [it.lo, it.hi]))].filter((v) => v > lo && v < hi && isCut(v));
      const stops = [lo, ...cuts.sort((a, b) => a - b), hi];
      for (let j = 1; j < stops.length; j++) {
        const [a, b] = [stops[j - 1], stops[j]];
        const same = group.find((it) => it.lo === a && it.hi === b);
        const first = group.filter((it) => it.lo < b && it.hi > a).reduce((m, it) => (order[it.i] < order[m.i] ? it : m));
        const key = order[first.i];
        if (same) out.push({ key, w: src[same.i] });
        else {
          // con el sentido del cable más antiguo del tramo
          const o = src[first.i];
          const fwd = horiz ? o.x1 < o.x2 : o.y1 < o.y2;
          out.push({ key, w: fwd ? seg(at(a), at(b)) : seg(at(b), at(a)) });
        }
      }
      g = e;
    }
  }
  out.sort((a, b) => a.key - b.key);
  if (out.length === src.length && out.every((o, i) => o.w === src[i])) return doc;
  return { ...doc, wires: out.map((o) => o.w) };
}

/** Parte el cable `index` en `p` (que debe caer en su interior): deja un codo arrastrable */
export function splitWire(doc: AscDoc, index: number, p: Point): AscDoc {
  const w = doc.wires[index];
  if (!w || !inInterior(p, w)) return doc;
  const wires = [...doc.wires];
  wires.splice(index, 1, seg({ x: w.x1, y: w.y1 }, p), seg(p, { x: w.x2, y: w.y2 }));
  return { ...doc, wires };
}

/** Quita el codo en `p` si une exactamente dos tramos alineados y nada más llega ahí */
export function removeVertex(doc: AscDoc, p: Point, lib?: Library): AscDoc {
  if (fixedPoints(doc, lib).has(ptKey(p))) return doc;
  if (doc.wires.some((w) => inInterior(p, w))) return doc;
  const at = doc.wires.flatMap((w, i) => (!isZero(w) && ends(w).some((e) => samePt(e, p)) ? [i] : []));
  if (at.length !== 2) return doc;
  const far = (w: Wire) => (samePt({ x: w.x1, y: w.y1 }, p) ? { x: w.x2, y: w.y2 } : { x: w.x1, y: w.y1 });
  const [ia, ib] = at;
  const [fa, fb] = [far(doc.wires[ia]), far(doc.wires[ib])];
  // alineados y uno a cada lado de p
  const cross = (fa.x - p.x) * (fb.y - p.y) - (fa.y - p.y) * (fb.x - p.x);
  const dot = (fa.x - p.x) * (fb.x - p.x) + (fa.y - p.y) * (fb.y - p.y);
  if (cross !== 0 || dot >= 0) return doc;
  const wires = [...doc.wires];
  wires[ia] = seg(fa, fb);
  wires.splice(ib, 1);
  return { ...doc, wires };
}

/**
 * Mueve el codo (extremo de uno o más cables) de `p` a `to`. Cada tramo conserva su
 * dirección desde su otro extremo y se agrega el codo necesario para seguir siendo
 * ortogonal; si dos tramos llegarían a `to` por el mismo lado, el segundo entra por el otro.
 * En `track.out` quedan los tramos donde terminó el cable `track.index` (el seleccionado).
 */
export function moveVertex(doc: AscDoc, p: Point, to: Point, lib?: Library, track?: { index: number; out: Wire[] }): AscDoc {
  if (samePt(p, to)) return doc;
  const used = new Set<string>();
  const side = (e: Point) => `${Math.sign(e.x - to.x)},${Math.sign(e.y - to.y)}`;
  let touched = false;
  const wires: Wire[] = [];
  doc.wires.forEach((w, i) => {
    const [a, b] = ends(w);
    const atA = samePt(a, p);
    const from = wires.length;
    if (isZero(w) || (!atA && !samePt(b, p))) wires.push(w);
    else {
      touched = true;
      const q = atA ? b : a;
      let c = to;
      if (isH(w) || isV(w)) {
        const keep = isH(w) ? { x: to.x, y: q.y } : { x: q.x, y: to.y };
        const other = isH(w) ? { x: q.x, y: to.y } : { x: to.x, y: q.y };
        c = !samePt(keep, to) && used.has(side(keep)) ? other : keep;
        used.add(side(c));
      }
      pushPath(wires, atA ? [to, c, q] : [q, c, to]);
    }
    if (i === track?.index) track.out.push(...wires.slice(from));
  });
  return touched ? mergeCollinear({ ...doc, wires }, lib) : doc;
}

/**
 * Desplaza un tramo horizontal en vertical (o uno vertical en horizontal), como en
 * LTspice/KiCad: un tramo vecino perpendicular se estira; si en el extremo hay otra cosa
 * (pin, etiqueta, unión en T, tramo alineado) se agrega un cable que la sigue uniendo.
 * En `selOut` queda el tramo desplazado (para reubicar la selección).
 */
export function dragSegment(doc: AscDoc, index: number, dx: number, dy: number, lib?: Library, selOut?: Wire[]): AscDoc {
  const w = doc.wires[index];
  if (!w || !(isH(w) || isV(w))) return doc;
  const d = isH(w) ? { x: 0, y: dy } : { x: dx, y: 0 };
  if (!d.x && !d.y) return doc;
  const fixed = fixedPoints(doc, lib);
  const mvp = (p: Point) => ({ x: p.x + d.x, y: p.y + d.y });
  const wires = [...doc.wires];
  const stubs: Wire[] = [];
  const others = doc.wires.flatMap((o, j) => (j !== index && !isZero(o) ? [j] : []));
  for (const e of ends(w)) {
    const endHere = others.filter((j) => ends(doc.wires[j]).some((q) => samePt(q, e)));
    const passHere = others.some((j) => inInterior(e, doc.wires[j]));
    const n = !fixed.has(ptKey(e)) && !passHere && endHere.length === 1 ? doc.wires[endHere[0]] : null;
    if (n && (isH(w) ? isV(n) : isH(n))) {
      // vecino perpendicular: se estira hasta el nuevo extremo
      const ne = mvp(e);
      wires[endHere[0]] = samePt({ x: n.x1, y: n.y1 }, e) ? { ...n, x1: ne.x, y1: ne.y } : { ...n, x2: ne.x, y2: ne.y };
    } else if (endHere.length || passHere || fixed.has(ptKey(e))) stubs.push(seg(e, mvp(e)));
  }
  const moved = { x1: w.x1 + d.x, y1: w.y1 + d.y, x2: w.x2 + d.x, y2: w.y2 + d.y };
  selOut?.push(moved);
  wires.splice(index, 1, moved, ...stubs);
  return mergeCollinear({ ...doc, wires }, lib);
}

/**
 * Como moveVertex pero sin codos (Ctrl+arrastre): cada cable que termina en `p` va en línea
 * recta desde su otro extremo hasta `to`, aunque quede en diagonal (`track`: como en moveVertex).
 */
export function moveVertexStraight(doc: AscDoc, p: Point, to: Point, lib?: Library, track?: { index: number; out: Wire[] }): AscDoc {
  if (samePt(p, to)) return doc;
  let touched = false;
  const wires = doc.wires.map((w) => {
    if (isZero(w)) return w;
    const [a, b] = ends(w);
    if (samePt(a, p)) return (touched = true), seg(to, b);
    if (samePt(b, p)) return (touched = true), seg(a, to);
    return w;
  });
  if (track && wires[track.index]) track.out.push(wires[track.index]);
  return touched ? mergeCollinear({ ...doc, wires }, lib) : doc;
}

/**
 * Como dragSegment pero en cualquier dirección y sin codos (Ctrl+arrastre): el tramo se
 * desplaza y los cables que terminan en sus extremos van en línea recta hasta la nueva
 * posición; si en el extremo hay otra cosa (pin, etiqueta, unión en T) se agrega un cable
 * recto que la sigue uniendo. En `selOut` queda el tramo desplazado.
 */
export function dragSegmentStraight(doc: AscDoc, index: number, dx: number, dy: number, lib?: Library, selOut?: Wire[]): AscDoc {
  const w = doc.wires[index];
  if (!w || (!dx && !dy)) return doc;
  const fixed = fixedPoints(doc, lib);
  const mvp = (p: Point) => ({ x: p.x + dx, y: p.y + dy });
  const wires = [...doc.wires];
  const stubs: Wire[] = [];
  const others = doc.wires.flatMap((o, j) => (j !== index && !isZero(o) ? [j] : []));
  for (const e of ends(w)) {
    const endHere = others.filter((j) => ends(doc.wires[j]).some((q) => samePt(q, e)));
    const passHere = others.some((j) => inInterior(e, doc.wires[j]));
    if (fixed.has(ptKey(e)) || passHere) stubs.push(seg(e, mvp(e)));
    else
      for (const j of endHere) {
        const n = wires[j];
        wires[j] = samePt({ x: n.x1, y: n.y1 }, e) ? { ...n, x1: e.x + dx, y1: e.y + dy } : { ...n, x2: e.x + dx, y2: e.y + dy };
      }
  }
  const moved = { x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy };
  selOut?.push(moved);
  wires.splice(index, 1, moved, ...stubs);
  return mergeCollinear({ ...doc, wires }, lib);
}

/** Índices de los cables de `doc` que caen sobre alguno de los tramos `segs` (para la selección) */
export function wiresOn(doc: AscDoc, segs: Wire[]): number[] {
  return doc.wires.flatMap((w, i) => (!isZero(w) && segs.some((s) => ends(w).every((e) => onSegment(e, s))) ? [i] : []));
}

/**
 * La selección de `doc` vista sobre `preview` (el fantasma de un movimiento o de un arrastre),
 * donde los cables cambian de índice. Con `moved` (los tramos donde terminaron los cables
 * seleccionados, de moveItems, dragSegment o moveVertex) se buscan ahí; si no, cada cable
 * seleccionado se busca por identidad (los que no se tocaron conservan el objeto) y, si no
 * está, se descarta: el mismo índice puede ser otro cable aunque la cantidad no cambie.
 */
export function previewSelection(selection: ItemRef[], doc: AscDoc, preview: AscDoc, moved?: Wire[]): ItemRef[] {
  const others = selection.filter((r) => r.kind !== 'wire');
  const wires = selection.filter((r) => r.kind === 'wire');
  if (!wires.length) return selection;
  let idx: number[];
  if (moved) idx = wiresOn(preview, moved);
  else {
    const at = new Map(preview.wires.map((w, i) => [w, i]));
    idx = wires.flatMap((r) => at.get(doc.wires[r.index]) ?? []);
  }
  return [...others, ...idx.map((index) => ({ kind: 'wire' as const, index }))];
}

/**
 * ¿Las dos versiones tienen la misma conectividad? (los mismos pines y etiquetas en cada
 * red). Editar codos y tramos la usa para no crear ni romper uniones por accidente.
 */
export function sameConnections(a: AscDoc, b: AscDoc, lib: Library): boolean {
  const sig = (d: AscDoc) =>
    connectivity(d, (t) => lib.symbol(t))
      .nets.map((n) => [n.wires.length ? '~' : '', ...n.pins.map((p) => `${p.sym}:${p.pin}`), ...n.labels.map((l) => `@${l}`)].sort().join(' '))
      .sort()
      .join('|');
  return sig(a) === sig(b);
}

const sameWindow = (a: TextWindow, b: TextWindow) => a.x === b.x && a.y === b.y && a.align === b.align && a.size === b.size;

/**
 * Rótulos al rotar o espejar, como LTspice: los que estaban en la posición por defecto pasan a
 * la por defecto de la nueva orientación; los movidos a mano conservan su WINDOW (en coordenadas
 * del símbolo, así que acompañan al cuerpo); los ocultos siguen ocultos.
 */
function reorientWindows(sym: SymbolInst, orient: Orient, lib: Library): SymbolInst {
  const def = lib.symbol(sym.type);
  if (!def) return { ...sym, orient };
  const before = defaultWindows(def, sym.orient, lib.windowDefaults);
  const after = defaultWindows(def, orient, lib.windowDefaults);
  // la de LTspice (un .asc guardado por LTspice) también cuenta como «sin mover» (#74)
  const ltBefore = ltspiceWindows(def, sym.orient, lib.windowDefaults);
  const windows = new Map<number, TextWindow>();
  for (const [i, raw] of sym.windows) {
    const w = ltspiceDefaultAs(raw, ltBefore.get(i), before.get(i)) ?? raw;
    const d = before.get(i);
    const n = after.get(i);
    if (d && sameWindow(w, d)) continue;
    if (w.align === 'Invisible' && d && n && w.x === d.x && w.y === d.y) windows.set(i, { ...n, align: 'Invisible', size: w.size });
    else windows.set(i, w);
  }
  return { ...sym, orient, windows };
}

/** Último punto fijo usado por documento resultante: rotar/espejar otra vez lo reutiliza */
const lastPivot = new WeakMap<AscDoc, { key: string; c: Point }>();
const refsKey = (refs: ItemRef[]) => refs.map((r) => `${r.kind}${r.index}`).sort().join(' ');

/**
 * Punto fijo para rotar/espejar la selección. Un símbolo solo gira alrededor de su
 * symbolPivot; varios elementos, alrededor del centro de su geometría llevado a la grilla
 * (pivotNear). Si se rota otra vez el resultado de la rotación anterior se usa el mismo punto,
 * así 4 rotaciones o 2 espejados siempre vuelven exactamente al lugar de partida.
 */
export function transformPivot(doc: AscDoc, refs: ItemRef[], lib: Library): Point {
  const last = lastPivot.get(doc);
  if (last && last.key === refsKey(refs)) return last.c;
  const one = refs.length === 1 && refs[0].kind === 'symbol' ? doc.symbols[refs[0].index] : undefined;
  const oneDef = one && lib.symbol(one.type);
  if (one && oneDef) {
    const p = symbolPivot(oneDef);
    return toWorld(one, p.x, p.y);
  }
  const pts: Point[] = [];
  for (const r of refs) {
    if (r.kind === 'symbol') {
      const sym = doc.symbols[r.index];
      const def = lib.symbol(sym.type);
      if (!def) pts.push(sym);
      else {
        const b = localBox(def);
        pts.push(...pinPoints(sym, def), ...[[b.x1, b.y1], [b.x2, b.y2]].map(([x, y]) => toWorld(sym, x, y)));
      }
    }
    if (r.kind === 'wire') pts.push(...ends(doc.wires[r.index]));
    if (r.kind === 'flag') pts.push(doc.flags[r.index]);
    if (r.kind === 'text') pts.push(doc.texts[r.index]);
    if (r.kind === 'shape') pts.push(...shapePoints(doc.shapes[r.index]).slice(0, 2));
  }
  const c = {
    x: (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2,
    y: (Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) / 2,
  };
  return pivotNear(c, { x: 0, y: 0 });
}

/** Rota (90° horario) o espeja la selección alrededor de un punto fijo (transformPivot) */
export function transformItems(doc: AscDoc, refs: ItemRef[], op: 'rotate' | 'mirror', lib: Library): AscDoc {
  if (!refs.length) return doc;
  const c = transformPivot(doc, refs, lib);
  const tp = (p: Point): Point =>
    op === 'rotate' ? { x: c.x - (p.y - c.y) + 0, y: c.y + (p.x - c.x) + 0 } : { x: 2 * c.x - p.x + 0, y: p.y };

  const sel = (kind: ItemRef['kind']) => new Set(refs.filter((r) => r.kind === kind).map((r) => r.index));
  const [s, w, f, t, sh] = [sel('symbol'), sel('wire'), sel('flag'), sel('text'), sel('shape')];
  const turned: AscDoc = {
    ...doc,
    symbols: doc.symbols.map((sym, i) => {
      if (!s.has(i)) return sym;
      const at = tp(sym);
      const orient = op === 'rotate' ? rotateCW(sym.orient) : mirrorX(sym.orient);
      return reorientWindows({ ...sym, ...at }, orient, lib);
    }),
    wires: doc.wires.map((wr, i) => {
      if (!w.has(i)) return wr;
      const [a, b] = ends(wr).map(tp);
      return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }),
    flags: doc.flags.map((fl, i) => (f.has(i) ? { ...fl, ...tp(fl) } : fl)),
    texts: doc.texts.map((tx, i) => (t.has(i) ? { ...tx, ...tp(tx) } : tx)),
    shapes: doc.shapes.map((x, i) => (sh.has(i) ? mapShape(x, tp, op === 'mirror') : x)),
  };
  // rotado sobre un cable: se parte en sus pines igual que al moverlo
  const out = mergeCollinear(cutNew(turned, refs, lib).doc, lib);
  lastPivot.set(out, { key: refsKey(refs), c });
  return out;
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

/**
 * Cambia el símbolo de una pieza sin cambiar su componente (la fuente V pasa a Cell para DC).
 * El primer pin queda donde estaba y el resto va a los del símbolo nuevo; los cables que llegan
 * a esos pines se siguen con `moveVertex`, así no quedan desconectados.
 */
export function setSymbolType(doc: AscDoc, index: number, type: string, lib: Library): AscDoc {
  const inst = doc.symbols[index];
  if (inst.type === type) return doc;
  const before = pinPoints(inst, lib.symbol(inst.type));
  const moved: SymbolInst = { ...inst, type };
  const after = pinPoints(moved, lib.symbol(type));
  const dx = before[0] && after[0] ? before[0].x - after[0].x : 0;
  const dy = before[0] && after[0] ? before[0].y - after[0].y : 0;
  const next: SymbolInst = { ...moved, x: inst.x + dx, y: inst.y + dy };
  const target = pinPoints(next, lib.symbol(type));
  let out: AscDoc = { ...doc, symbols: doc.symbols.map((s, i) => (i === index ? next : s)) };
  before.forEach((p, i) => {
    if (i === 0 || !target[i] || samePt(p, target[i])) return;
    out = moveVertex(out, p, target[i], lib);
    // lo que estaba apoyado en el pin sin cable (una tierra, una etiqueta, el pin de otro
    // componente) no se mueve: queda unido con un tramo nuevo
    const left = out.flags.some((f) => samePt(f, p)) || out.symbols.some((s, j) => j !== index && pinPoints(s, lib.symbol(s.type)).some((q) => samePt(q, p)));
    if (left) out = addWire(out, target[i], p, lib);
  });
  return out;
}

/**
 * Al abrir un .asc, una fuente V con valor DC usa el símbolo Cell (#121). Sólo cambia el símbolo:
 * el componente sigue siendo V y los cables se siguen con `setSymbolType`.
 */
export function dcSourcesAsCell(doc: AscDoc, lib: Library): AscDoc {
  let out = doc;
  doc.symbols.forEach((s, i) => {
    if (s.type !== 'voltage') return;
    const p = parseSource({ Value: s.attrs.get('Value'), Value2: s.attrs.get('Value2'), SpiceLine: s.attrs.get('SpiceLine') });
    if (p?.kind === 'dc' && p.dc.trim()) out = setSymbolType(out, i, 'cell', lib);
  });
  return out;
}

export function setText(doc: AscDoc, index: number, patch: Partial<SchText>): AscDoc {
  return { ...doc, texts: doc.texts.map((t, i) => (i === index ? { ...t, ...patch } : t)) };
}

/** Nombre de la etiqueta; con `ioPin` también su puerto ('' = deja de ser puerto) */
export function setFlagName(doc: AscDoc, index: number, name: string, ioPin?: string): AscDoc {
  const set = (f: AscDoc['flags'][number]) => {
    if (ioPin === undefined) return { ...f, name };
    const { ioPin: _, ...rest } = f;
    return ioPin ? { ...rest, name, ioPin } : { ...rest, name };
  };
  return { ...doc, flags: doc.flags.map((f, i) => (i === index ? set(f) : f)) };
}

/** Estilo de línea de las figuras indicadas ('' = sólida, sin campo en el archivo) */
export function setShapeStyle(doc: AscDoc, indices: number[], style: string): AscDoc {
  const set = new Set(indices);
  return {
    ...doc,
    shapes: doc.shapes.map((x, i): Shape => {
      if (!set.has(i)) return x;
      const { style: _, ...rest } = x;
      return style ? { ...rest, style } : rest;
    }),
  };
}


/** Copia de los elementos seleccionados desplazada (duplicar / pegar) */
export function duplicateItems(doc: AscDoc, refs: ItemRef[], dx: number, dy: number, lib: Library): { doc: AscDoc; refs: ItemRef[] } {
  let out = doc;
  const newRefs: ItemRef[] = [];
  for (const r of refs) {
    if (r.kind === 'symbol') {
      const s = doc.symbols[r.index];
      const def = lib.symbol(s.type);
      const attrs = new Map(s.attrs);
      if (attrs.has('InstName')) attrs.set('InstName', nextInstName(out, nameLetter(def), lib));
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
    } else if (r.kind === 'shape') {
      out = { ...out, shapes: [...out.shapes, shiftShape(doc.shapes[r.index], dx, dy)] };
      newRefs.push({ kind: 'shape', index: out.shapes.length - 1 });
    } else {
      const t = doc.texts[r.index];
      out = { ...out, texts: [...out.texts, { ...t, x: t.x + dx, y: t.y + dy }] };
      newRefs.push({ kind: 'text', index: out.texts.length - 1 });
    }
  }
  return cutNew(out, newRefs, lib);
}

/** Todos los elementos del documento (Ctrl+A) */
export function allItems(doc: AscDoc): ItemRef[] {
  return [
    ...doc.symbols.map((_, index) => ({ kind: 'symbol' as const, index })),
    ...doc.wires.map((_, index) => ({ kind: 'wire' as const, index })),
    ...doc.flags.map((_, index) => ({ kind: 'flag' as const, index })),
    ...doc.texts.map((_, index) => ({ kind: 'text' as const, index })),
    ...doc.shapes.map((_, index) => ({ kind: 'shape' as const, index })),
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
    shapes: doc.shapes.filter((_, i) => has('shape', i)),
    dataFlags: [],
  };
}

/**
 * Pega un fragmento con su esquina superior izquierda en `at` (sobre la grilla). Los
 * componentes cuyo nombre ya existe en el documento reciben uno nuevo, como al duplicar.
 */
export function pasteItems(doc: AscDoc, frag: AscDoc, at: Point, lib: Library): { doc: AscDoc; refs: ItemRef[] } {
  const pts: Point[] = [...frag.symbols, ...frag.flags, ...frag.texts, ...frag.wires.flatMap(ends), ...frag.shapes.flatMap((x) => shapePoints(x).slice(0, 2))];
  if (!pts.length) return { doc, refs: [] };
  const dx = snap(at.x - Math.min(...pts.map((p) => p.x)));
  const dy = snap(at.y - Math.min(...pts.map((p) => p.y)));
  const nameOf = (s: SymbolInst) => (s.attrs.get('InstName') ?? lib.symbol(s.type)?.attrs.get('InstName') ?? '').toUpperCase();
  let symbols = doc.symbols;
  for (const s of frag.symbols) {
    const attrs = new Map(s.attrs);
    const name = nameOf(s);
    if (name && symbols.some((o) => nameOf(o) === name)) {
      attrs.set('InstName', nextInstName({ ...doc, symbols }, nameLetter(lib.symbol(s.type)), lib));
    }
    symbols = [...symbols, { ...s, x: s.x + dx, y: s.y + dy, attrs, windows: new Map(s.windows) }];
  }
  const out: AscDoc = {
    ...doc,
    symbols,
    wires: [...doc.wires, ...frag.wires.map((w) => ({ x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy }))],
    flags: [...doc.flags, ...frag.flags.map((f) => ({ ...f, x: f.x + dx, y: f.y + dy }))],
    texts: [...doc.texts, ...frag.texts.map((t) => ({ ...t, x: t.x + dx, y: t.y + dy }))],
    shapes: [...doc.shapes, ...frag.shapes.map((x) => shiftShape(x, dx, dy))],
  };
  const refs: ItemRef[] = [
    ...frag.symbols.map((_, i) => ({ kind: 'symbol' as const, index: doc.symbols.length + i })),
    ...frag.wires.map((_, i) => ({ kind: 'wire' as const, index: doc.wires.length + i })),
    ...frag.flags.map((_, i) => ({ kind: 'flag' as const, index: doc.flags.length + i })),
    ...frag.texts.map((_, i) => ({ kind: 'text' as const, index: doc.texts.length + i })),
    ...frag.shapes.map((_, i) => ({ kind: 'shape' as const, index: doc.shapes.length + i })),
  ];
  return cutNew(out, refs, lib);
}

/** Mueve el rótulo `win` (0 = InstName, 3 = Value…) de un símbolo: queda como WINDOW explícito */
export function setWindow(doc: AscDoc, index: number, win: number, w: TextWindow): AscDoc {
  return setWindows(doc, [{ sym: index, win, w }]);
}

/**
 * Cambia varios rótulos a la vez. `w: null` borra el WINDOW explícito: el rótulo vuelve a la
 * posición por defecto (la del .asy o la de window-defaults.json para la orientación).
 */
export function setWindows(doc: AscDoc, edits: { sym: number; win: number; w: TextWindow | null }[]): AscDoc {
  if (!edits.length) return doc;
  return {
    ...doc,
    symbols: doc.symbols.map((s, i) => {
      const mine = edits.filter((e) => e.sym === i);
      if (!mine.length) return s;
      const windows = new Map(s.windows);
      for (const e of mine) {
        if (e.w) windows.set(e.win, e.w);
        else windows.delete(e.win);
      }
      return { ...s, windows };
    }),
  };
}

/**
 * Cambio de un rótulo desde el diálogo: `reset` vuelve a la posición por defecto (borra el
 * WINDOW explícito); además ocultar/mostrar, alineación (tal como se ve en el esquemático) y
 * tamaño. Los campos ausentes no cambian.
 */
export interface LabelPatch {
  reset?: boolean;
  visible?: boolean;
  align?: string;
  size?: number;
  /** si el símbolo no tiene ese rótulo, dónde ponerlo al mostrarlo (p. ej. la SpiceLine de un C) */
  create?: TextWindow;
}

/** Aplica los mismos cambios de rótulos (por índice de WINDOW) a varios símbolos */
export function patchLabels(doc: AscDoc, syms: number[], patches: Map<number, LabelPatch>, lib: Library): AscDoc {
  const edits: { sym: number; win: number; w: TextWindow | null }[] = [];
  for (const si of syms) {
    const inst = doc.symbols[si];
    const def = inst && lib.symbol(inst.type);
    if (!def) continue;
    const eff = effectiveWindows(inst, def, lib.windowDefaults);
    const dflt = defaultWindows(def, inst.orient, lib.windowDefaults);
    for (const [win, p] of patches) {
      const cur = eff.get(win);
      const base = p.reset ? dflt.get(win) : cur;
      if (!cur && p.create && p.visible !== false) {
        edits.push({ sym: si, win, w: { ...p.create } });
        continue;
      }
      if (!cur || !base) continue;
      const hidden = base.align === 'Invisible';
      const visible = p.visible ?? !hidden;
      let align = base.align;
      if (!visible) align = 'Invisible';
      else if (p.align) align = localAlign(p.align, inst.orient);
      else if (hidden) align = shownAlign(win, eff, dflt);
      const w = { ...base, align, size: p.size ?? base.size };
      // igual a la posición por defecto: sin WINDOW explícito, como si nunca se hubiera tocado
      const d = dflt.get(win);
      if (d && sameWindow(w, d)) {
        if (inst.windows.has(win)) edits.push({ sym: si, win, w: null });
      } else if (!sameWindow(w, cur)) edits.push({ sym: si, win, w });
    }
  }
  return setWindows(doc, edits);
}
