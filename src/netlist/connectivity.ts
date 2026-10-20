// Conectividad de un esquemático, con las reglas de LTspice (verificadas con LTspice -netlist):
// - los extremos de un cable se conectan entre sí y con cualquier punto de interés
//   (pin, etiqueta, extremo de otro cable) que caiga sobre el segmento;
// - dos cables que se cruzan por el medio NO se conectan;
// - etiquetas con el mismo nombre (distinguiendo mayúsculas) son la misma red; "0" es tierra;
// - nombre de red: tierra > etiqueta (la primera en orden alfabético) > N001, N002…
//   numeradas según el primer cable de cada red en el archivo.
import { toWorld } from '../asc/transform.ts';
import type { AscDoc, Point, SymbolDef } from '../asc/model.ts';

export interface PinRef {
  /** índice del símbolo en doc.symbols */
  sym: number;
  /** índice del pin en el .asy */
  pin: number;
  order: number;
  name: string;
  at: Point;
}

export interface Net {
  /** "0", nombre de etiqueta, "N001"… o "" si es un pin suelto (lo nombra el netlister) */
  name: string;
  pins: PinRef[];
  labels: string[];
  points: Point[];
  /** índices de cables que pertenecen a la red */
  wires: number[];
}

export interface Connectivity {
  nets: Net[];
  /** "sym:pin" → red */
  pinNet: Map<string, Net>;
  /** red que pasa por un punto (extremo, pin, etiqueta o interior de un cable) */
  netAt(p: Point): Net | undefined;
}

const key = (x: number, y: number) => `${x},${y}`;

class UnionFind {
  private parent = new Map<string, string>();
  add(k: string) {
    if (!this.parent.has(k)) this.parent.set(k, k);
  }
  find(k: string): string {
    let r = k;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    let c = k;
    while (c !== r) {
      const n = this.parent.get(c)!;
      this.parent.set(c, r);
      c = n;
    }
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

/** ¿p cae sobre el segmento (incluidos extremos)? Admite cables diagonales. */
export function onSegment(p: Point, w: { x1: number; y1: number; x2: number; y2: number }): boolean {
  const cross = (w.x2 - w.x1) * (p.y - w.y1) - (w.y2 - w.y1) * (p.x - w.x1);
  if (cross !== 0) return false;
  return (
    p.x >= Math.min(w.x1, w.x2) && p.x <= Math.max(w.x1, w.x2) && p.y >= Math.min(w.y1, w.y2) && p.y <= Math.max(w.y1, w.y2)
  );
}

export function connectivity(doc: AscDoc, symbolOf: (type: string) => SymbolDef | undefined): Connectivity {
  const uf = new UnionFind();
  const points = new Map<string, Point>();
  const addPoint = (p: Point) => {
    const k = key(p.x, p.y);
    points.set(k, p);
    uf.add(k);
    return k;
  };

  // Pines en coordenadas del esquemático
  const pins: PinRef[] = [];
  doc.symbols.forEach((s, si) => {
    const def = symbolOf(s.type);
    def?.pins.forEach((p, pi) => {
      const at = toWorld(s, p.x, p.y);
      pins.push({
        sym: si,
        pin: pi,
        order: Number(p.attrs.get('SpiceOrder') ?? pi + 1),
        name: p.attrs.get('PinName') ?? '',
        at,
      });
      addPoint(at);
    });
  });

  for (const w of doc.wires) uf.union(addPoint({ x: w.x1, y: w.y1 }), addPoint({ x: w.x2, y: w.y2 }));
  for (const f of doc.flags) addPoint(f);

  // Puntos de interés sobre el interior de un cable se conectan a ese cable.
  // Índice por coordenada para cables horizontales/verticales (la gran mayoría).
  const horiz = new Map<number, number[]>();
  const vert = new Map<number, number[]>();
  const diag: number[] = [];
  doc.wires.forEach((w, i) => {
    if (w.y1 === w.y2) (horiz.get(w.y1) ?? horiz.set(w.y1, []).get(w.y1)!).push(i);
    else if (w.x1 === w.x2) (vert.get(w.x1) ?? vert.set(w.x1, []).get(w.x1)!).push(i);
    else diag.push(i);
  });
  const wiresThrough = (p: Point): number[] =>
    [...(horiz.get(p.y) ?? []), ...(vert.get(p.x) ?? []), ...diag].filter((i) => onSegment(p, doc.wires[i]));
  for (const [k, p] of points) {
    for (const i of wiresThrough(p)) uf.union(k, key(doc.wires[i].x1, doc.wires[i].y1));
  }

  // Etiquetas con el mismo nombre son la misma red. LTspice distingue mayúsculas acá
  // ("-v" y "-V" quedan como redes distintas en la netlist; recién el simulador las une)
  const labelRoot = new Map<string, string>();
  for (const f of doc.flags) {
    const n = f.name;
    const k = key(f.x, f.y);
    if (labelRoot.has(n)) uf.union(labelRoot.get(n)!, k);
    else labelRoot.set(n, k);
  }

  // Agrupar
  const byRoot = new Map<string, Net>();
  const netOf = (k: string) => {
    const r = uf.find(k);
    let n = byRoot.get(r);
    if (!n) byRoot.set(r, (n = { name: '', pins: [], labels: [], points: [], wires: [] }));
    return n;
  };
  for (const [k, p] of points) netOf(k).points.push(p);
  for (const p of pins) netOf(key(p.at.x, p.at.y)).pins.push(p);
  // Con varias etiquetas, LTspice nombra la red con la de mayor y, después mayor x y, en el
  // mismo punto, la última del archivo (verificado contra LTspice -netlist)
  const chosen = new Map<Net, { x: number; y: number; name: string }>();
  for (const f of doc.flags) {
    const n = netOf(key(f.x, f.y));
    n.labels.push(f.name);
    const c = chosen.get(n);
    if (!c || f.y > c.y || (f.y === c.y && f.x >= c.x)) chosen.set(n, f);
  }
  doc.wires.forEach((w, i) => netOf(key(w.x1, w.y1)).wires.push(i));

  // Redes que llegan a la netlist: las que tienen pines o etiquetas
  const nets = [...byRoot.values()].filter((n) => n.pins.length || n.labels.length);

  // Nombres
  const unnamed: Net[] = [];
  for (const n of nets) {
    if (n.labels.includes('0')) n.name = '0';
    else if (n.labels.length) n.name = chosen.get(n)!.name;
    else if (n.pins.length === 1 && !n.wires.length) n.name = ''; // pin suelto → NC_xx
    else unnamed.push(n);
  }
  // LTspice numera según el primer cable de cada red en el orden del archivo (verificado
  // contra LTspice -netlist); las redes sin cables (pines que se tocan) van al final, de
  // arriba hacia abajo y de izquierda a derecha.
  const topLeft = (n: Net) =>
    n.points.reduce((a, b) => (b.y < a.y || (b.y === a.y && b.x < a.x) ? b : a));
  const firstWire = (n: Net) => (n.wires.length ? Math.min(...n.wires) : Infinity);
  unnamed
    .map((n) => [n, firstWire(n), topLeft(n)] as const)
    .sort(([, wa, a], [, wb, b]) => wa - wb || a.y - b.y || a.x - b.x)
    .forEach(([n], i) => (n.name = `N${String(i + 1).padStart(3, '0')}`));

  const pinNet = new Map<string, Net>();
  for (const n of nets) for (const p of n.pins) pinNet.set(`${p.sym}:${p.pin}`, n);

  return {
    nets,
    pinNet,
    netAt(p: Point) {
      const k = key(p.x, p.y);
      if (points.has(k)) return byRoot.get(uf.find(k));
      const w = wiresThrough(p)[0];
      return w === undefined ? undefined : byRoot.get(uf.find(key(doc.wires[w].x1, doc.wires[w].y1)));
    },
  };
}
