// Tipos de lo que TurboSpice usa de roughPen.js (el lápiz a mano alzada de ASC-Parser, #330)
type Pt = [number, number];
type Rand = () => number;
type Field = (p: Pt) => Pt;

interface RoughOptions {
  [k: string]: unknown;
  lock: number;
  warp: number;
  warpPeriod: number;
}

declare const RoughPen: {
  DEFAULTS: RoughOptions;
  fnv1a(s: string): number;
  mulberry32(seed: number): Rand;
  makeWarp(rand: Rand, amp: number, period: number): Field;
  makeTaper(anchors: Pt[], lock: number): (p: Pt) => number;
  penStroke(pts: Pt[], rand: Rand, opt: RoughOptions, warp: Field, taper: (p: Pt) => number, periodic: boolean): Pt[];
  roughen(svgText: string, options?: Partial<RoughOptions> & { pins?: Pt[]; seed?: string }): { svg: string };
};
export default RoughPen;
