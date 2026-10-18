// Texto de la barra de estado con las propiedades del elemento bajo el mouse.
import type { AscDoc, Point } from '../asc/model.ts';
import { effectiveAttrs } from '../asc/resolve.ts';
import type { Connectivity } from '../netlist/connectivity.ts';
import type { Library } from '../library/library.ts';
import type { ItemRef } from './geometry.ts';

const netLabel = (name: string | undefined) => (name ? name : 'sin nombre');
const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Lista de "propiedad: valor" del elemento, en el orden en que conviene leerlos */
export function hoverInfo(doc: AscDoc, lib: Library, conn: Connectivity, ref: ItemRef): string[] {
  switch (ref.kind) {
    case 'symbol': {
      const inst = doc.symbols[ref.index];
      if (!inst) return [];
      const def = lib.symbol(inst.type);
      const attrs = effectiveAttrs(inst, def);
      const out = [attrs.get('InstName') || '(sin nombre)', inst.type.split('\\').pop() ?? inst.type];
      for (const [k, v] of attrs) if (k !== 'InstName' && v !== '') out.push(`${k}: ${short(v)}`);
      out.push(`orientación ${inst.orient}`, `en (${inst.x}, ${inst.y})`);
      const pins = (def?.pins ?? []).map((p, i) => {
        const name = p.attrs.get('PinName') ?? String(i + 1);
        return `${name}→${netLabel(conn.pinNet.get(`${ref.index}:${i}`)?.name)}`;
      });
      if (pins.length) out.push(`pines ${pins.join(' ')}`);
      return out;
    }
    case 'wire': {
      const w = doc.wires[ref.index];
      if (!w) return [];
      const net = conn.netAt({ x: w.x1, y: w.y1 });
      const out = ['Cable', `red ${netLabel(net?.name)}`, `(${w.x1}, ${w.y1}) → (${w.x2}, ${w.y2})`, `largo ${Math.hypot(w.x2 - w.x1, w.y2 - w.y1)}`];
      if (net) out.push(`${net.pins.length} pin${net.pins.length === 1 ? '' : 'es'}, ${net.wires.length} cable${net.wires.length === 1 ? '' : 's'} en la red`);
      return out;
    }
    case 'flag': {
      const f = doc.flags[ref.index];
      if (!f) return [];
      return [f.name === '0' ? 'Tierra' : 'Etiqueta de red', `nombre: ${f.name}`, `en (${f.x}, ${f.y})`];
    }
    case 'text': {
      const t = doc.texts[ref.index];
      if (!t) return [];
      return [t.kind === 'directive' ? 'Directiva SPICE' : 'Comentario', short(t.text.split('\\n').join(' ⏎ ')), `tamaño ${t.size}`, `en (${t.x}, ${t.y})`];
    }
  }
}

export const hoverCoords = (p: Point) => `(${p.x}, ${p.y})`;
