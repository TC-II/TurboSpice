// Figuras decorativas del esquemático (LINE, RECTANGLE, CIRCLE, ARC): contorno, cercanía al
// cursor y transformaciones. Un arco se define por la caja de su elipse y dos puntos que dan
// los ángulos; en el archivo (xs,ys) es el FINAL y (xe,ye) el INICIO, y va en sentido
// antihorario (spec §12 de ASC-Parser).
import type { Point, Shape } from '../asc/model.ts';
import type { Box } from './geometry.ts';

/** Estilos de línea de LTspice (`[style]` al final de la línea): sin estilo = sólida */
export const LINE_STYLES = [
  { value: '', label: 'Sólida', dash: undefined },
  { value: '1', label: 'Guiones', dash: '10 5' },
  { value: '2', label: 'Puntos', dash: '2 5' },
  { value: '3', label: 'Raya y punto', dash: '10 5 2 5' },
  { value: '4', label: 'Raya y dos puntos', dash: '10 5 2 5 2 5' },
] as const;

export const lineDash = (style?: string) => LINE_STYLES.find((s) => s.value === (style ?? ''))?.dash;

/** Ángulos (paramétricos) de inicio y el recorrido antihorario de un arco */
export function arcAngles(c: number[]) {
  const [x1, y1, x2, y2, xEnd, yEnd, xStart, yStart] = c;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const a0 = Math.atan2(yStart - cy, xStart - cx);
  const a1 = Math.atan2(yEnd - cy, xEnd - cx);
  const span = (((a0 - a1) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return { cx, cy, rx: Math.abs(x2 - x1) / 2, ry: Math.abs(y2 - y1) / 2, a0, span: span < 1e-9 ? 2 * Math.PI : span };
}

/** Contorno de la figura como polilínea (elipses y arcos aproximados con tramos) */
export function shapeOutline(s: Shape): Point[] {
  const c = s.coords;
  switch (s.kind) {
    case 'LINE':
      return [{ x: c[0], y: c[1] }, { x: c[2], y: c[3] }];
    case 'RECTANGLE':
      return [{ x: c[0], y: c[1] }, { x: c[2], y: c[1] }, { x: c[2], y: c[3] }, { x: c[0], y: c[3] }, { x: c[0], y: c[1] }];
    case 'CIRCLE':
    case 'ARC': {
      const { cx, cy, rx, ry, a0, span } =
        s.kind === 'ARC' ? arcAngles(c) : { cx: (c[0] + c[2]) / 2, cy: (c[1] + c[3]) / 2, rx: Math.abs(c[2] - c[0]) / 2, ry: Math.abs(c[3] - c[1]) / 2, a0: 0, span: 2 * Math.PI };
      const n = Math.max(8, Math.ceil((span / (2 * Math.PI)) * 64));
      // antihorario en pantalla (y hacia abajo) = ángulo decreciente
      return Array.from({ length: n + 1 }, (_, i) => {
        const a = a0 - (span * i) / n;
        return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
      });
    }
  }
}

const segDist = (p: Point, a: Point, b: Point) => {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
};

/** Distancia de p al trazo de la figura (sólo el borde: el interior no la elige) */
export function shapeDist(s: Shape, p: Point): number {
  const pts = shapeOutline(s);
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(p, pts[i - 1], pts[i]));
  return d;
}

/** ¿El tramo a–b toca la caja? (Liang–Barsky) */
function segInBox(a: Point, b: Point, box: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [pq, q] of [[-dx, a.x - box.x1], [dx, box.x2 - a.x], [-dy, a.y - box.y1], [dy, box.y2 - a.y]]) {
    if (pq === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / pq;
    if (pq < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

/** ¿El recuadro de selección toca el trazo? (un marco grande no se elige por estar adentro) */
export function shapeInBox(s: Shape, box: Box): boolean {
  const pts = shapeOutline(s);
  return pts.some((p, i) => i > 0 && segInBox(pts[i - 1], p, box));
}

/** Caja del trazo (de un arco, sólo la parte dibujada) */
export function shapeBox(s: Shape): Box {
  const pts = shapeOutline(s);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

/** Puntos (x, y) que guarda la figura: extremos o caja, y en un arco también fin e inicio */
export function shapePoints(s: Shape): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 1 < s.coords.length; i += 2) out.push({ x: s.coords[i], y: s.coords[i + 1] });
  return out;
}

/**
 * Aplica `f` a todos los puntos de la figura. Si `f` espeja, el arco cambiaría de sentido:
 * se intercambian inicio y fin para que siga siendo antihorario.
 */
export function mapShape(s: Shape, f: (p: Point) => Point, mirrors = false): Shape {
  const pts = shapePoints(s).map(f);
  if (mirrors && s.kind === 'ARC') [pts[2], pts[3]] = [pts[3], pts[2]];
  return { ...s, coords: pts.flatMap((p) => [p.x, p.y]) };
}

export const shiftShape = (s: Shape, dx: number, dy: number) => mapShape(s, (p) => ({ x: p.x + dx, y: p.y + dy }));
