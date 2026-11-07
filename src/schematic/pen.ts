// Lápiz y goma (figura PATH, propia de TurboSpice): grosor, color y suavizado del trazo, y la goma
// que borra pedazos de los trazos.
//
// Cuantización: el puntero da posiciones con decimales; la grilla del esquemático es de 16 unidades
// y un trazo pegado a enteros (1/16 de grilla) ya se ve liso con el zoom normal, pero al acercarse
// el escalón de 1 unidad aparece en las curvas suaves. Se guarda con un decimal (0,1 unidad) después
// de simplificar el trazo (Ramer–Douglas–Peucker, tolerancia de medio píxel de pantalla): quedan
// muchos menos puntos que tomando uno cada 2 px, así que el archivo no crece aunque haya decimales.
import { useEffect, useState } from 'react';
import type { AscDoc, Point } from '../asc/model.ts';

/**
 * Estilo de un PATH, en las palabras del final de su línea: un dígito = guiones (como LTspice),
 * `w<n>` = grosor en unidades del esquemático (sigue al zoom), `c<rrggbb>` = color, `s` = suave.
 */
export interface PenStyle {
  dash?: string;
  width?: number;
  color?: string;
  smooth?: boolean;
}

export function parsePenStyle(style?: string): PenStyle {
  const out: PenStyle = {};
  for (const tok of (style ?? '').split(/\s+/)) {
    if (/^\d+$/.test(tok)) out.dash = tok;
    else if (/^w\d*\.?\d+$/.test(tok)) out.width = Number(tok.slice(1));
    else if (/^c[0-9a-f]{6}$/i.test(tok)) out.color = tok.slice(1).toLowerCase();
    else if (tok === 's') out.smooth = true;
  }
  return out;
}

export function penStyleString(p: PenStyle): string | undefined {
  const toks = [p.dash, p.width ? `w${p.width}` : '', p.color ? `c${p.color}` : '', p.smooth ? 's' : ''].filter(Boolean);
  return toks.length ? toks.join(' ') : undefined;
}

/** grosores del lápiz, en unidades del esquemático (la grilla es de 16); por defecto, el del medio */
export const PEN_WIDTHS = [1.5, 2.25, 3, 6, 12] as const;
/** radios de la goma, en píxeles de pantalla; por defecto, el del medio */
export const ERASER_SIZES = [5, 9, 15] as const;
/** colores del lápiz: '' = el de los dibujos del tema */
export const PEN_COLORS = ['', 'e03131', 'f08c00', '2f9e44', '1c7ed6', '9c36b5'] as const;

export interface PenPrefs {
  width: number;
  /** radio de la goma (px de pantalla) */
  eraser: number;
  color: string;
  smooth: boolean;
}

const KEY = 'turbospice.pen';
const EVENT = 'turbospice-pen';
let current: PenPrefs | undefined;

function loadPen(): PenPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<PenPrefs>;
    return {
      width: PEN_WIDTHS.includes(v.width as never) ? v.width! : PEN_WIDTHS[2],
      eraser: ERASER_SIZES.includes(v.eraser as never) ? v.eraser! : ERASER_SIZES[1],
      color: PEN_COLORS.includes(v.color as never) ? v.color! : '',
      smooth: v.smooth ?? true,
    };
  } catch {
    return { width: PEN_WIDTHS[2], eraser: ERASER_SIZES[1], color: '', smooth: true };
  }
}

export const penPrefs = (): PenPrefs => (current ??= loadPen());

export function setPenPrefs(p: Partial<PenPrefs>) {
  current = { ...penPrefs(), ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // sin almacenamiento: vale sólo para esta sesión
  }
  window.dispatchEvent(new Event(EVENT));
}

export function usePenPrefs(): PenPrefs {
  const [p, setP] = useState(penPrefs);
  useEffect(() => {
    const on = () => setP(penPrefs());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return p;
}

/** el estilo con que se guarda un trazo nuevo */
export const newStrokeStyle = (p: PenPrefs, dash?: string) => penStyleString({ dash: dash || undefined, width: p.width, color: p.color || undefined, smooth: p.smooth });

const q = (v: number) => Math.round(v * 10) / 10;

/** Ramer–Douglas–Peucker: saca los puntos que se apartan menos de `eps` de la recta */
export function simplify(pts: Point[], eps: number): Point[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = pts[a];
    const B = pts[b];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.hypot(dx, dy);
    let far = -1;
    let dmax = eps;
    for (let i = a + 1; i < b; i++) {
      const P = pts[i];
      const d = len ? Math.abs(dy * (P.x - A.x) - dx * (P.y - A.y)) / len : Math.hypot(P.x - A.x, P.y - A.y);
      if (d > dmax) {
        dmax = d;
        far = i;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** el trazo listo para guardar: simplificado (tolerancia `eps`) y con un decimal */
export function strokeCoords(pts: Point[], eps: number): number[] {
  const out: number[] = [];
  for (const p of simplify(pts, eps)) {
    const x = q(p.x);
    const y = q(p.y);
    if (out.length && out[out.length - 2] === x && out[out.length - 1] === y) continue;
    out.push(x, y);
  }
  return out;
}

/** curva suave por los puntos (Catmull-Rom pasada a Bézier cúbicas) */
export function smoothPath(pts: Point[]): string {
  if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
  const f = (v: number) => Math.round(v * 100) / 100;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C ${f(p1.x + (p2.x - p0.x) / 6)} ${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)} ${f(p2.y - (p3.y - p1.y) / 6)} ${p2.x} ${p2.y}`;
  }
  return d;
}

/** tramo del segmento a→b (en t ∈ [0,1]) que cae dentro del círculo, o null */
function insideSpan(a: Point, b: Point, c: Point, r: number): [number, number] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - c.x;
  const fy = a.y - c.y;
  const A = dx * dx + dy * dy;
  const C = fx * fx + fy * fy - r * r;
  if (A === 0) return C <= 0 ? [0, 1] : null;
  const B = 2 * (fx * dx + fy * dy);
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return null;
  const s = Math.sqrt(disc);
  const t0 = Math.max(0, (-B - s) / (2 * A));
  const t1 = Math.min(1, (-B + s) / (2 * A));
  return t0 < t1 ? [t0, t1] : null;
}

/**
 * Goma: lo que queda de la polilínea después de borrar el círculo (centro `c`, radio `r`). Puede
 * partirse en varios trazos; los que quedan de un solo punto se descartan. null = no la tocó.
 */
export function eraseCircle(pts: Point[], c: Point, r: number): Point[][] | null {
  const pieces: Point[][] = [];
  let cur: Point[] = [];
  let touched = false;
  const at = (a: Point, b: Point, tt: number) => ({ x: q(a.x + (b.x - a.x) * tt), y: q(a.y + (b.y - a.y) * tt) });
  if (Math.hypot(pts[0].x - c.x, pts[0].y - c.y) > r) cur.push(pts[0]);
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const span = insideSpan(a, b, c, r);
    if (!span) {
      if (!cur.length) cur.push(a);
      cur.push(b);
      continue;
    }
    touched = true;
    const [t0, t1] = span;
    if (t0 > 0) {
      if (!cur.length) cur.push(a);
      cur.push(at(a, b, t0));
    }
    if (cur.length > 1) pieces.push(cur);
    cur = [];
    if (t1 < 1) cur.push(at(a, b, t1), b);
  }
  if (cur.length > 1) pieces.push(cur);
  return touched ? pieces : null;
}

/** el documento con la goma pasada por `c` (los PATH tocados se parten); el mismo si no tocó nada */
export function eraseAt(doc: AscDoc, c: Point, r: number): AscDoc {
  let changed = false;
  const shapes = doc.shapes.flatMap((s) => {
    if (s.kind !== 'PATH') return [s];
    const pts: Point[] = [];
    for (let i = 0; i + 1 < s.coords.length; i += 2) pts.push({ x: s.coords[i], y: s.coords[i + 1] });
    // (un trazo grueso se toca desde su borde, no sólo desde el centro)
    const pieces = pts.length > 1 ? eraseCircle(pts, c, r + (parsePenStyle(s.style).width ?? 0) / 2) : null;
    if (!pieces) return [s];
    changed = true;
    return pieces.map((pp) => ({ ...s, coords: pp.flatMap((p) => [p.x, p.y]) }));
  });
  return changed ? { ...doc, shapes } : doc;
}
