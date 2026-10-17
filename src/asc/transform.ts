// Orientaciones de LTspice: rotar (horario, eje Y hacia abajo) y después espejar en X.
import type { Orient, Point } from './model.ts';

const rotationSteps = (o: Orient) => parseInt(o.slice(1), 10) / 90;
const isMirrored = (o: Orient) => o[0] === 'M';

/** Transforma un desplazamiento local del símbolo al marco del esquemático. */
export function transformOffset(x: number, y: number, o: Orient): Point {
  let rx = x;
  let ry = y;
  for (let i = 0; i < rotationSteps(o); i++) [rx, ry] = [-ry, rx];
  if (isMirrored(o)) rx = -rx;
  return { x: rx + 0, y: ry + 0 }; // +0 normaliza -0
}

/** Punto local de un símbolo (pin, vértice) → coordenadas del esquemático */
export function toWorld(sym: { x: number; y: number; orient: Orient }, x: number, y: number): Point {
  const d = transformOffset(x, y, sym.orient);
  return { x: sym.x + d.x, y: sym.y + d.y };
}

const ROT90: Record<string, string> = {
  Left: 'VRight',
  Right: 'VLeft',
  Top: 'VBottom',
  Bottom: 'VTop',
  Center: 'VCenter',
  VLeft: 'Left',
  VRight: 'Right',
  VTop: 'Top',
  VBottom: 'Bottom',
  VCenter: 'Center',
};
const MIRROR: Record<string, string> = { Left: 'Right', Right: 'Left', VTop: 'VBottom', VBottom: 'VTop' };

/** Alineación de texto local → alineación en el esquemático (spec §6.3) */
export function transformAlign(align: string, o: Orient): string {
  if (!(align in ROT90)) return align; // Invisible u otros
  let a = align;
  for (let i = 0; i < rotationSteps(o); i++) a = ROT90[a];
  return isMirrored(o) ? (MIRROR[a] ?? a) : a;
}

/** Alineaciones de texto de LTspice (sin Invisible) */
export const ALIGNS = ['Left', 'Center', 'Right', 'Top', 'Bottom', 'VLeft', 'VCenter', 'VRight', 'VTop', 'VBottom'] as const;

/** Inversa de transformAlign: alineación vista en el esquemático → la que va en el WINDOW */
export function localAlign(world: string, o: Orient): string {
  return ALIGNS.find((a) => transformAlign(a, o) === world) ?? world;
}

/** Componer: aplicar `next` a un símbolo que ya tiene orientación `o` (rotar/espejar en el editor) */
export function rotateCW(o: Orient): Orient {
  // Rotar el resultado visual 90° horario. Con espejo, la rotación visual horaria
  // equivale a rotar el ángulo local en sentido inverso.
  const steps = rotationSteps(o);
  const next = isMirrored(o) ? (steps + 3) % 4 : (steps + 1) % 4;
  return `${o[0]}${next * 90}` as Orient;
}

export function mirrorX(o: Orient): Orient {
  return `${isMirrored(o) ? 'R' : 'M'}${o.slice(1)}` as Orient;
}

/** Matriz SVG (a b c d) de la orientación, para transform="matrix(a b c d tx ty)" */
export function orientMatrix(o: Orient): [number, number, number, number] {
  const ex = transformOffset(1, 0, o);
  const ey = transformOffset(0, 1, o);
  return [ex.x, ex.y, ey.x, ey.y];
}

/** Inversa de transformOffset: desplazamiento en el esquemático → desplazamiento local */
export function inverseOffset(x: number, y: number, o: Orient): Point {
  const ex = transformOffset(1, 0, o);
  const ey = transformOffset(0, 1, o);
  // la matriz de orientación es ortogonal: la inversa es la traspuesta
  return { x: x * ex.x + y * ex.y + 0, y: x * ey.x + y * ey.y + 0 };
}
