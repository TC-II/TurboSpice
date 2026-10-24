// «Convertir la selección en subcircuito» (#180): lo seleccionado pasa a un esquemático nuevo y en
// su lugar queda una instancia. Cada red que cruza el borde de la selección es un puerto: adentro,
// una etiqueta con IOPIN; afuera, la instancia se conecta por etiquetas con el mismo nombre que la
// red (si la red no tenía nombre, se le pone uno). La tierra no es puerto: adentro se repite.
import { baseName, emptyDoc, GRID, type AscDoc, type Point } from '../asc/model.ts';
import type { Library } from '../library/library.ts';
import type { Connectivity, Net } from '../netlist/connectivity.ts';
import { deleteItems, instLetter, nextInstName } from '../schematic/edit.ts';
import { pinPoints, type ItemRef } from '../schematic/geometry.ts';
import { makeSymbol } from '../library/makeSymbol.ts';
import { parseAsy } from '../asc/parse.ts';
import { t } from '../i18n/i18n.ts';

export interface Extracted {
  /** esquemático del subcircuito */
  sub: AscDoc;
  /** el circuito de arriba con la instancia en lugar de lo seleccionado */
  parent: AscDoc;
  /** texto del símbolo (.asy) */
  symbol: string;
  ports: string[];
  inst: string;
}

const snap = (v: number) => Math.round(v / GRID) * GRID;
const isAuto = (n: Net) => !n.labels.length || /^N\d+$/i.test(n.name);

/** @deprecated ya no está en la interfaz (se sacó «From selection» del panel Módulos y Alt+B); queda sólo por sus tests */
export function extractSubckt(doc: AscDoc, refs: ItemRef[], conn: Connectivity, lib: Library, name: string): Extracted | string {
  const pick = (k: ItemRef['kind']) => new Set(refs.filter((r) => r.kind === k).map((r) => r.index));
  const [S, W, F, T, SH] = [pick('symbol'), pick('wire'), pick('flag'), pick('text'), pick('shape')];
  if (!S.size) return t('Select at least one component');

  const pinAt = (sym: number, pin: number): Point | undefined => {
    const s = doc.symbols[sym];
    return pinPoints(s, lib.symbol(s.type))[pin];
  };
  const flagsOn = (n: Net, sel: boolean) => doc.flags.map((f, i) => ({ f, i })).filter(({ f, i }) => F.has(i) === sel && conn.netAt(f) === n);
  // un punto de la red de cada lado del borde
  const anchor = (n: Net, inside: boolean): Point | undefined => {
    const p = n.pins.find((x) => S.has(x.sym) === inside);
    if (p) return pinAt(p.sym, p.pin);
    const w = n.wires.find((i) => W.has(i) === inside);
    if (w !== undefined) return { x: doc.wires[w].x1, y: doc.wires[w].y1 };
    const f = flagsOn(n, inside)[0];
    return f && { x: f.f.x, y: f.f.y };
  };
  const has = (n: Net, inside: boolean) => n.pins.some((x) => S.has(x.sym) === inside) || n.wires.some((i) => W.has(i) === inside) || flagsOn(n, inside).length > 0;

  const sub = emptyDoc();
  sub.symbols = doc.symbols.filter((_, i) => S.has(i)).map((s) => ({ ...s, windows: new Map(s.windows), attrs: new Map(s.attrs) }));
  sub.wires = doc.wires.filter((_, i) => W.has(i)).map((w) => ({ ...w }));
  sub.flags = doc.flags.filter((_, i) => F.has(i)).map((f) => ({ ...f }));
  sub.texts = doc.texts.filter((_, i) => T.has(i)).map((x) => ({ ...x }));
  sub.shapes = doc.shapes.filter((_, i) => SH.has(i)).map((x) => ({ ...x }));

  // puertos: redes que cruzan el borde
  const taken = new Set<string>(doc.flags.map((f) => f.name.toLowerCase()));
  const ports: { port: string; outer: string; outerAnchor?: Point }[] = [];
  let k = 1;
  for (const n of conn.nets) {
    if (!has(n, true)) continue;
    const a = anchor(n, true);
    if (n.name === '0') {
      // la tierra es global: adentro, su propio símbolo de tierra
      if (a && !sub.flags.some((f) => f.name === '0')) sub.flags.push({ x: a.x, y: a.y, name: '0' });
      continue;
    }
    if (!has(n, false) || !a) continue;
    let port = isAuto(n) ? '' : n.name;
    if (!port) {
      while (taken.has(`p${k}`)) k++;
      port = `p${k++}`;
    }
    taken.add(port.toLowerCase());
    const inner = sub.flags.find((f) => f.x === a.x && f.y === a.y);
    if (inner) {
      inner.name = port;
      inner.ioPin = 'BiDir';
    } else sub.flags.push({ x: a.x, y: a.y, name: port, ioPin: 'BiDir' });
    ports.push({ port, outer: isAuto(n) ? '' : n.name, outerAnchor: isAuto(n) ? anchor(n, false) : undefined });
  }
  if (!ports.length) return t('Nothing connects the selection with the rest: there would be no ports');

  // el subcircuito, centrado en el origen
  const pts = [...sub.symbols, ...sub.flags, ...sub.wires.flatMap((w) => [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }])];
  const cx = snap((Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2);
  const cy = snap((Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) / 2);
  for (const s of sub.symbols) (s.x -= cx), (s.y -= cy);
  for (const f of sub.flags) (f.x -= cx), (f.y -= cy);
  for (const w of sub.wires) (w.x1 -= cx), (w.y1 -= cy), (w.x2 -= cx), (w.y2 -= cy);
  for (const x of sub.texts) (x.x -= cx), (x.y -= cy);

  // arriba: sin lo seleccionado, con la instancia y etiquetas en sus pines
  const symbol = makeSymbol({ name, pins: ports.map((p) => p.port), block: true });
  const def = parseAsy(symbol, name);
  let parent = deleteItems(doc, refs, lib);
  const inst = nextInstName(parent, instLetter('X'), lib);
  const at = { x: cx, y: cy };
  parent = { ...parent, symbols: [...parent.symbols, { type: name, x: at.x, y: at.y, orient: 'R0', windows: new Map(), attrs: new Map([['InstName', inst]]) }] };
  const flags = [...parent.flags];
  const used = new Set(flags.map((f) => f.name.toLowerCase()));
  def.pins.forEach((pin, i) => {
    const p = ports[i];
    let net = p.outer;
    if (!net) {
      net = `${inst}_${p.port}`;
      for (let j = 2; used.has(net.toLowerCase()); j++) net = `${inst}_${p.port}_${j}`;
      used.add(net.toLowerCase());
      // la parte de afuera de la red no tenía nombre: se lo pone una etiqueta
      if (p.outerAnchor) flags.push({ x: p.outerAnchor.x, y: p.outerAnchor.y, name: net });
    }
    flags.push({ x: at.x + pin.x, y: at.y + pin.y, name: net });
  });
  parent = { ...parent, flags };
  return { sub, parent, symbol, ports: ports.map((p) => p.port), inst: baseName(inst) };
}
