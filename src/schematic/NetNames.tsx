// Etiquetas temporales con el nombre de cada red (N001, NC_01, out…). Sólo visual: no forman
// parte del documento ni del historial.
import type { AscDoc, Point } from '../asc/model.ts';
import type { Connectivity, Net } from '../netlist/connectivity.ts';
import { snap } from './geometry.ts';

export interface NetName {
  name: string;
  /** punto de la red donde va la etiqueta (sobre un cable o un pin) */
  at: Point;
  /** nombre automático (sin etiqueta en el esquemático) */
  auto: boolean;
  /** la etiqueta se puede convertir en un FLAG en `at` */
  nameable: boolean;
}

/** Punto medio del cable más largo de la red (en la grilla), o su primer pin */
function anchor(net: Net, doc: AscDoc): { at: Point; onGrid: boolean } {
  let best: { len: number; i: number } | null = null;
  for (const i of net.wires) {
    const w = doc.wires[i];
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    if (!best || len > best.len) best = { len, i };
  }
  if (best) {
    const w = doc.wires[best.i];
    if (w.y1 === w.y2) return { at: { x: clampSnap((w.x1 + w.x2) / 2, w.x1, w.x2), y: w.y1 }, onGrid: true };
    if (w.x1 === w.x2) return { at: { x: w.x1, y: clampSnap((w.y1 + w.y2) / 2, w.y1, w.y2) }, onGrid: true };
    return { at: { x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 }, onGrid: false };
  }
  return { at: net.pins[0]?.at ?? net.points[0], onGrid: true };
}

const clampSnap = (v: number, a: number, b: number) => Math.min(Math.max(snap(v), Math.min(a, b)), Math.max(a, b));

export function netNames(doc: AscDoc, conn: Connectivity, ncNames: Map<string, string>): NetName[] {
  const out: NetName[] = [];
  for (const net of conn.nets) {
    if (net.name === '0') continue;
    if (!net.name) {
      // pin suelto: el netlister le da un NC_xx
      const p = net.pins[0];
      const nc = p && ncNames.get(`${p.sym}:${p.pin}`);
      if (nc) out.push({ name: nc, at: p.at, auto: true, nameable: true });
      continue;
    }
    const { at, onGrid } = anchor(net, doc);
    const auto = !net.labels.length;
    out.push({ name: net.name, at, auto, nameable: auto && onGrid });
  }
  return out;
}

interface Props {
  names: NetName[];
  /** píxeles por unidad: las etiquetas tienen tamaño fijo en pantalla */
  scale: number;
  onHover(name: string | undefined): void;
  onName?(at: Point): void;
}

export function NetNamesLayer({ names, scale, onHover, onName }: Props) {
  const fs = 11 / scale;
  return (
    <g className="net-names">
      {names.map((n) => {
        const w = (n.name.length * 0.62 + 0.9) * fs;
        const h = fs * 1.5;
        const x = n.at.x - w / 2;
        const y = n.at.y - h - 4 / scale;
        return (
          <g
            key={`${n.name}@${n.at.x},${n.at.y}`}
            className={`net-name${n.auto ? ' auto' : ''}${n.nameable && onName ? ' nameable' : ''}`}
            onPointerEnter={() => onHover(n.name)}
            onPointerLeave={() => onHover(undefined)}
            onPointerDown={(e) => {
              if (e.button !== 0 || !n.nameable || !onName) return;
              e.stopPropagation();
              onName(n.at);
            }}
          >
            <title>{n.nameable && onName ? `${n.name} · click para ponerle nombre` : n.name}</title>
            <line x1={n.at.x} y1={n.at.y} x2={n.at.x} y2={y + h} />
            <rect x={x} y={y} width={w} height={h} rx={3 / scale} />
            <text x={n.at.x} y={y + h / 2} fontSize={fs} textAnchor="middle" dominantBaseline="central">
              {n.name}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export interface Annotation {
  at: Point;
  text: string;
  kind: 'v' | 'i';
}

/** Valores del punto de operación sobre el esquemático (como el .op de LTspice) */
export function AnnotationLayer({ items, scale }: { items: Annotation[]; scale: number }) {
  const fs = 11 / scale;
  return (
    <g className="op-annotations">
      {items.map((a, i) => {
        const w = (a.text.length * 0.62 + 0.9) * fs;
        const h = fs * 1.5;
        const y = a.kind === 'v' ? a.at.y - h - 4 / scale : a.at.y - h / 2;
        const x = a.kind === 'v' ? a.at.x - w / 2 : a.at.x;
        return (
          <g key={i} className={`op-annotation ${a.kind}`}>
            <rect x={x} y={y} width={w} height={h} rx={3 / scale} />
            <text x={x + w / 2} y={y + h / 2} fontSize={fs} textAnchor="middle" dominantBaseline="central">
              {a.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}
