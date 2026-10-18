// Flechitas con el sentido positivo de la corriente en los pines de cada componente (punta de
// prueba y anotación del punto de operación). Convención de SPICE: en los de dos terminales
// (R, C, L, V, I, D, B) la corriente entra por el primer nodo y sale por el segundo; en los
// dispositivos (Q, M, J, Z) y en los subcircuitos (X, como Ix(U1:pin) de LTspice) cada corriente
// de terminal es positiva entrando al dispositivo.
import type { AscDoc, Point, SymbolDef } from '../asc/model.ts';
import { transformOffset } from '../asc/transform.ts';
import type { Library } from '../library/library.ts';
import { localBox, pinPoints } from './geometry.ts';

export interface CurrentArrow {
  /** pin donde está la flecha */
  at: Point;
  /** del pin hacia el cuerpo del símbolo, a lo largo de su pata (vector unitario sobre un eje) */
  inward: Point;
  /** la corriente positiva entra al componente por este pin (si no, sale) */
  enters: boolean;
}

const TWO_TERMINAL = /^[RCLVIDB]/i;
const DEVICE = /^[QMJZX]/i;

/** Dirección (local al símbolo) del pin hacia el cuerpo: a lo largo de la línea que sale del pin */
export function pinInward(def: SymbolDef, k: number): Point | null {
  const p = def.pins[k];
  let best: { d: Point; len: number } | null = null;
  for (const s of def.shapes) {
    if (s.kind !== 'LINE') continue;
    const [x1, y1, x2, y2] = s.coords;
    const other = x1 === p.x && y1 === p.y ? { x: x2, y: y2 } : x2 === p.x && y2 === p.y ? { x: x1, y: y1 } : null;
    if (!other) continue;
    const dx = other.x - p.x;
    const dy = other.y - p.y;
    if ((dx && dy) || (!dx && !dy)) continue;
    const len = Math.abs(dx + dy);
    if (!best || len > best.len) best = { d: { x: Math.sign(dx), y: Math.sign(dy) }, len };
  }
  if (best) return best.d;
  // sin línea en el pin: hacia el centro del símbolo, sobre el eje dominante
  const b = localBox(def);
  const dx = (b.x1 + b.x2) / 2 - p.x;
  const dy = (b.y1 + b.y2) / 2 - p.y;
  if (!dx && !dy) return null;
  return Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
}

const order = (def: SymbolDef, k: number) => Number(def.pins[k].attrs.get('SpiceOrder') ?? k + 1);

/** Flechas de los pines de los componentes simulados (`elements`: índice de símbolo y prefijo) */
export function currentArrows(doc: AscDoc, lib: Library, elements: { sym: number; prefix: string }[]): CurrentArrow[] {
  const out: CurrentArrow[] = [];
  for (const el of elements) {
    const two = TWO_TERMINAL.test(el.prefix);
    if (!two && !DEVICE.test(el.prefix)) continue;
    const s = doc.symbols[el.sym];
    const def = s && lib.symbol(s.type);
    if (!def) continue;
    const pts = pinPoints(s, def);
    const orders = def.pins.map((_, k) => order(def, k));
    const first = Math.min(...orders);
    def.pins.forEach((_, k) => {
      const inward = pinInward(def, k);
      if (!inward) return;
      const d = transformOffset(inward.x, inward.y, s.orient);
      // dos terminales: entra por el primer nodo, sale por el otro (sólo se dibuja la que entra)
      const enters = !two || orders[k] === first;
      if (enters) out.push({ at: pts[k], inward: { x: Math.sign(d.x), y: Math.sign(d.y) }, enters });
    });
  }
  return out;
}

/** Capa SVG: flechitas justo afuera del pin, al costado del cable (sin tapar el símbolo ni los valores) */
export function CurrentArrowsLayer({ items }: { items: CurrentArrow[] }) {
  return (
    <g className="current-arrows">
      {items.map((a, i) => {
        // patas verticales: a la izquierda (el valor de corriente va a la derecha del símbolo);
        // horizontales: abajo (las tensiones de las redes van arriba)
        const n = a.inward.x === 0 ? { x: -5, y: 0 } : { x: 0, y: 5 };
        const at = (t: number) => ({ x: a.at.x + a.inward.x * t + n.x, y: a.at.y + a.inward.y * t + n.y });
        const [from, to] = a.enters ? [at(-14), at(-3)] : [at(-3), at(-14)];
        const ux = Math.sign(to.x - from.x);
        const uy = Math.sign(to.y - from.y);
        const head = `${to.x - 4 * ux - 2.5 * uy},${to.y - 4 * uy - 2.5 * ux} ${to.x},${to.y} ${to.x - 4 * ux + 2.5 * uy},${to.y - 4 * uy + 2.5 * ux}`;
        return (
          <g key={i} className="current-arrow">
            <line x1={from.x} y1={from.y} x2={to.x - 2 * ux} y2={to.y - 2 * uy} />
            <polygon points={head} />
          </g>
        );
      })}
    </g>
  );
}
