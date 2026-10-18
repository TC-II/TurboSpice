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
  /** `at` está sobre un cable vertical */
  vertical?: boolean;
}

/** Punto medio del cable más largo de la red (en la grilla), o su primer pin */
function anchor(net: Net, doc: AscDoc): { at: Point; onGrid: boolean; vertical?: boolean } {
  let best: { len: number; i: number } | null = null;
  for (const i of net.wires) {
    const w = doc.wires[i];
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    if (!best || len > best.len) best = { len, i };
  }
  if (best) {
    const w = doc.wires[best.i];
    if (w.y1 === w.y2) return { at: { x: clampSnap((w.x1 + w.x2) / 2, w.x1, w.x2), y: w.y1 }, onGrid: true };
    if (w.x1 === w.x2) return { at: { x: w.x1, y: clampSnap((w.y1 + w.y2) / 2, w.y1, w.y2) }, onGrid: true, vertical: true };
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
    const { at, onGrid, vertical } = anchor(net, doc);
    const auto = !net.labels.length;
    out.push({ name: net.name, at, auto, nameable: auto && onGrid, vertical });
  }
  return out;
}

/**
 * Puntos donde coinciden el nombre de una red y su tensión del punto de operación (clave
 * "x,y" → el cable es vertical): en un cable horizontal van uno al lado del otro (el nombre a
 * la izquierda) y en uno vertical, uno arriba del otro (el nombre arriba)
 */
export type Paired = Map<string, boolean>;
const key = (p: Point) => `${p.x},${p.y}`;

export function pairedPoints(names: NetName[], annotations: Annotation[]): Paired {
  const volts = new Set(annotations.filter((a) => a.kind === 'v').map((a) => key(a.at)));
  return new Map(names.filter((n) => volts.has(key(n.at))).map((n) => [key(n.at), !!n.vertical]));
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Recuadro de un valor del punto de operación (en coordenadas del esquemático) */
function annotationBox(a: Annotation, scale: number, paired?: Paired): Box {
  const fs = 11 / scale;
  const w = (a.text.length * 0.62 + 0.9) * fs;
  const h = fs * 1.5;
  const y = a.kind === 'v' ? a.at.y - h - 4 / scale : a.at.y - h / 2;
  // con el nombre de la red en un cable horizontal, a su derecha
  const x = a.kind === 'v' ? (paired?.get(key(a.at)) === false ? a.at.x + 2 / scale : a.at.x - w / 2) : a.at.x;
  return { x, y, w, h };
}

/** Recuadros de todos los valores: las tensiones se suben si pisan la corriente de un componente */
function layoutAnnotations(items: Annotation[], scale: number, paired?: Paired): Box[] {
  const boxes = items.map((a) => annotationBox(a, scale, paired));
  const currents = boxes.filter((_, i) => items[i].kind === 'i');
  return boxes.map((b, i) => {
    if (items[i].kind !== 'v') return b;
    let y = b.y;
    for (let k = 0; k < 4 && currents.some((c) => overlaps(c, { ...b, y })); k++) y -= b.h + 2 / scale;
    return { ...b, y };
  });
}

interface Props {
  names: NetName[];
  paired?: Paired;
  /** valores del punto de operación a esquivar (las corrientes junto a los componentes) */
  avoid?: Annotation[];
  /** píxeles por unidad: las etiquetas tienen tamaño fijo en pantalla */
  scale: number;
  onHover(name: string | undefined): void;
  onName?(at: Point): void;
}

export function NetNamesLayer({ names, paired, avoid, scale, onHover, onName }: Props) {
  const fs = 11 / scale;
  const taken = layoutAnnotations(avoid ?? [], scale, paired);
  return (
    <g className="net-names">
      {names.map((n) => {
        const w = (n.name.length * 0.62 + 0.9) * fs;
        const h = fs * 1.5;
        const pair = paired?.get(key(n.at));
        // junto a la tensión del OP: a su izquierda, o arriba si el cable es vertical
        const x = pair === false ? n.at.x - w - 2 / scale : n.at.x - w / 2;
        let y = n.at.y - h - 4 / scale - (pair ? h + 2 / scale : 0);
        // si pisa otro valor (la corriente de un componente vecino), se sube
        for (let k = 0; k < 4 && taken.some((b) => overlaps(b, { x, y, w, h })); k++) y -= h + 2 / scale;
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
            <text x={x + w / 2} y={y + h / 2} fontSize={fs} textAnchor="middle" dominantBaseline="central">
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
export function AnnotationLayer({ items, paired, scale }: { items: Annotation[]; paired?: Paired; scale: number }) {
  const fs = 11 / scale;
  const boxes = layoutAnnotations(items, scale, paired);
  return (
    <g className="op-annotations">
      {items.map((a, i) => {
        const { x, y, w, h } = boxes[i];
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
