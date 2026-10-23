// Instancias desactualizadas (#199): cuando cambian los puertos de un subcircuito, su símbolo se
// actualiza (los pines que siguen conservan su lugar), pero las instancias ya colocadas no se
// recablean solas. En vez de quedar mal en silencio, se marcan: pines nuevos sin conectar y
// cables o etiquetas que llegaban a un pin que ya no existe (quedaron sueltos sobre el símbolo).
import { baseName, type AscDoc, type Point } from '../asc/model.ts';
import { parseAsc } from '../asc/parse.ts';
import type { Library } from '../library/library.ts';
import { distToSegment, inBox, pinPoints, symbolBox } from '../schematic/geometry.ts';
import { subName, usages, type Usage } from './subckt.ts';
import type { Project } from './turbo.ts';

export interface PinIssue {
  /** pines sin nada conectado */
  unconnected: string[];
  /** extremos de cable o etiquetas sueltos sobre el símbolo (iban a un pin que se quitó) */
  dangling: number;
}

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** Problemas de conexión de la instancia `index`, o null si está bien */
export function instancePinIssues(doc: AscDoc, index: number, lib: Library): PinIssue | null {
  const s = doc.symbols[index];
  const def = s && lib.symbol(s.type);
  if (!def) return null;
  const pins = pinPoints(s, def);
  const otherPins = doc.symbols.flatMap((o, i) => (i === index ? [] : pinPoints(o, lib.symbol(o.type))));
  // ¿algo (además de `skip`) toca el punto?
  const touches = (p: Point, skip?: { wire?: number; flag?: number }) =>
    doc.wires.some((w, i) => i !== skip?.wire && distToSegment(p, w) === 0) ||
    doc.flags.some((f, i) => i !== skip?.flag && same(f, p)) ||
    otherPins.some((q) => same(q, p));
  const unconnected = def.pins.filter((_, k) => !touches(pins[k])).map((pin, k) => pin.attrs.get('PinName') ?? String(k + 1));
  const box = symbolBox(s, def, lib);
  const loose = (p: Point, skip: { wire?: number; flag?: number }) => inBox(p, box) && !pins.some((q) => same(q, p)) && !touches(p, skip);
  let dangling = 0;
  doc.wires.forEach((w, i) => {
    for (const p of [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]) if (loose(p, { wire: i })) dangling++;
  });
  doc.flags.forEach((f, i) => loose(f, { flag: i }) && dangling++);
  return unconnected.length || dangling ? { unconnected, dangling } : null;
}

/** Instancias del subcircuito, en todo el proyecto, con problemas de conexión */
export function staleInstances(p: Project, name: string, lib: Library, label: (asc: string, name?: string) => string): (Usage & PinIssue)[] {
  const out: (Usage & PinIssue)[] = [];
  const texts = new Map<string, AscDoc>();
  const docOf = (u: Usage): AscDoc | undefined => {
    const w = u.where;
    const k = w.kind === 'subckt' ? `s:${w.name}` : w.kind === 'sim' ? `b:${w.sim}` : `v:${w.variant}`;
    if (!texts.has(k)) {
      const v = w.kind === 'subckt' ? undefined : p.variants.find((x) => x.id === w.variant);
      const asc = w.kind === 'subckt' ? p.files.find((f) => f.kind === 'schematic' && subName(f.name).toLowerCase() === w.name.toLowerCase())?.text : w.kind === 'sim' ? v?.sims.find((x) => x.id === w.sim)?.asc : v?.base;
      if (asc !== undefined) texts.set(k, parseAsc(asc));
    }
    return texts.get(k);
  };
  for (const u of usages(p, name, label)) {
    const d = docOf(u);
    const i = d ? d.symbols.findIndex((s) => s.attrs.get('InstName') === u.inst && subName(baseName(s.type)).toLowerCase() === name.toLowerCase()) : -1;
    const issue = d && i >= 0 ? instancePinIssues(d, i, lib) : null;
    if (issue) out.push({ ...u, ...issue });
  }
  return out;
}
