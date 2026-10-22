// Texto de la barra de estado con las propiedades del elemento bajo el mouse.
import type { AscDoc, Point } from '../asc/model.ts';
import { effectiveAttrs } from '../asc/resolve.ts';
import type { Connectivity } from '../netlist/connectivity.ts';
import type { Library } from '../library/library.ts';
import type { ItemRef } from './geometry.ts';
import { LINE_STYLES } from './shapes.ts';
import { t } from '../i18n/i18n.ts';

const netLabel = (name: string | undefined) => (name ? name : t('unnamed'));
const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Lista de "propiedad: valor" del elemento, en el orden en que conviene leerlos */
export function hoverInfo(doc: AscDoc, lib: Library, conn: Connectivity, ref: ItemRef): string[] {
  switch (ref.kind) {
    case 'symbol': {
      const inst = doc.symbols[ref.index];
      if (!inst) return [];
      const def = lib.symbol(inst.type);
      const attrs = effectiveAttrs(inst, def);
      const out = [attrs.get('InstName') || t('(unnamed)'), inst.type.split('\\').pop() ?? inst.type];
      for (const [k, v] of attrs) if (k !== 'InstName' && v !== '') out.push(`${k}: ${short(v)}`);
      out.push(t('orientation {orient}', { orient: inst.orient }), t('at ({x}, {y})', { x: inst.x, y: inst.y }));
      const pins = (def?.pins ?? []).map((p, i) => {
        const name = p.attrs.get('PinName') ?? String(i + 1);
        return `${name}→${netLabel(conn.pinNet.get(`${ref.index}:${i}`)?.name)}`;
      });
      if (pins.length) out.push(t('pins {p0}', { p0: pins.join(' ') }));
      return out;
    }
    case 'wire': {
      const w = doc.wires[ref.index];
      if (!w) return [];
      const net = conn.netAt({ x: w.x1, y: w.y1 });
      const out = [t('Wire'), t('net {p0}', { p0: netLabel(net?.name) }), `(${w.x1}, ${w.y1}) → (${w.x2}, ${w.y2})`, t('length {p0}', { p0: Math.hypot(w.x2 - w.x1, w.y2 - w.y1) })];
      if (net) out.push(t('{length} pin{p1}, {length2} wire{p3} in the net', { length: net.pins.length, p1: net.pins.length === 1 ? '' : 'es', length2: net.wires.length, p3: net.wires.length === 1 ? '' : 's' }));
      return out;
    }
    case 'flag': {
      const f = doc.flags[ref.index];
      if (!f) return [];
      return [f.name === '0' ? t('Ground') : t('Net label'), t('name: {name}', { name: f.name }), t('at ({x}, {y})', { x: f.x, y: f.y })];
    }
    case 'text': {
      const tt = doc.texts[ref.index];
      if (!tt) return [];
      return [tt.kind === 'directive' ? t('SPICE directive') : t('Comment'), short(tt.text.split('\\n').join(' ⏎ ')), t('size {size}', { size: tt.size }), t('at ({x}, {y})', { x: tt.x, y: tt.y })];
    }
    case 'shape': {
      const sh = doc.shapes[ref.index];
      if (!sh) return [];
      const name = { LINE: t('Line'), RECTANGLE: t('Rectangle'), CIRCLE: t('Circle'), ARC: t('Arc') }[sh.kind];
      const [x1, y1, x2, y2] = sh.coords;
      const style = LINE_STYLES.find((ls) => ls.value === (sh.style ?? ''))?.label ?? t('style {style}', { style: sh.style });
      return [name, `(${x1}, ${y1}) → (${x2}, ${y2})`, t('line {p0}', { p0: style.toLowerCase() })];
    }
  }
}

export const hoverCoords = (p: Point) => `(${p.x}, ${p.y})`;
