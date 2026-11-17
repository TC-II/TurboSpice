import { describe, expect, it } from 'vitest';
import { paneCurves, sweepSegments } from '../../src/waveform/curves.ts';

// .dc VD 0 2 1 I1 1 2 1: dos tramos (VD de 0 a 2 con I1 = 1 y 2); V(g) = 2·VD, Id = VD·I1
const vd = new Float64Array([0, 1, 2, 0, 1, 2]);
const i1 = new Float64Array([1, 1, 1, 2, 2, 2]);
const vecs: Record<string, Float64Array> = { g: vd.map((v) => 2 * v), d: vd.map((v, k) => v * i1[k]), n: new Float64Array([0, 2, 1, 0, 1, 2]) };
const plot = { name: 'dc1', vectors: [{ name: 'v-sweep', type: 3, real: vd }] } as never;
const resolver = () => (fn: string, args: string[]) => (fn.toLowerCase() === 'v' && vecs[args[0]] ? { re: vecs[args[0]] } : null);
const ctx = { plot, runs: [plot], labels: new Map(), resolver, mode: 'bode' as const };

describe('eje X elegido', () => {
  it('cada tramo de un .dc anidado, en función de la magnitud elegida', () => {
    const d = paneCurves({ traces: [{ expr: 'V(d)' }] }, { ...ctx, xExpr: 'V(g)' });
    expect(d.xName).toBe('V(g)');
    expect([...d.x]).toEqual([0, 2, 4]);
    expect(d.curves.map((c) => [...c.y])).toEqual([
      [0, 1, 2],
      [0, 2, 4],
    ]);
  });
  it('una magnitud no monótona no puede ser el eje X', () => {
    const d = paneCurves({ traces: [{ expr: 'V(d)' }] }, { ...ctx, xExpr: 'V(n)' });
    expect(d.errors.get(0)).toMatch(/monotonic|monótona/);
  });
  it('log X sólo con X positivo; log Y descarta los valores ≤ 0', () => {
    expect(paneCurves({ traces: [{ expr: 'V(d)' }] }, { ...ctx, logX: true }).log).toBe(false);
    const d = paneCurves({ traces: [{ expr: 'V(d)' }], logY: true }, ctx);
    expect(d.logY).toBe(true);
    expect(Number.isNaN(d.curves[0].y[0])).toBe(true);
  });
});

describe('barridos .dc descendentes', () => {
  it('sweepSegments corta según el sentido del barrido', () => {
    expect(sweepSegments(new Float64Array([5, 4, 3, 2, 1, 0]))).toEqual([[0, 6]]);
    expect(sweepSegments(new Float64Array([2, 1, 0, 2, 1, 0]))).toEqual([
      [0, 3],
      [3, 6],
    ]);
    expect(sweepSegments(new Float64Array([0, 1, 2, 0, 1, 2]))).toEqual([
      [0, 3],
      [3, 6],
    ]);
  });
  it('un .dc 5 → 0 se dibuja como una curva con X creciente', () => {
    const x = new Float64Array([5, 4, 3, 2, 1, 0]);
    const p = { name: 'dc1', vectors: [{ name: 'v-sweep', type: 3, real: x }] } as never;
    const c = { plot: p, runs: [p], labels: new Map(), resolver: () => (_fn: string, args: string[]) => (args[0] === 'a' ? { re: x.map((v) => 10 * v) } : null), mode: 'bode' as const };
    const d = paneCurves({ traces: [{ expr: 'V(a)' }] }, c);
    expect([...d.x]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(d.curves).toHaveLength(1);
    expect([...d.curves[0].y]).toEqual([0, 10, 20, 30, 40, 50]);
  });
});

describe('superposición de corridas', () => {
  it('con una sola corrida visible que no es plot, se dibuja ésa', () => {
    const x = new Float64Array([0, 1, 2]);
    const mk = (name: string, k: number) =>
      ({
        name,
        vectors: [
          { name: 'time', type: 1, real: x },
          { name: 'a', type: 3, real: x.map((v) => v * k) },
        ],
      }) as never;
    const [p1, p2] = [mk('tran1', 1), mk('tran2', 10)];
    const resolver = (p: { vectors: { name: string; real: Float64Array }[] }) => (fn: string, args: string[]) =>
      fn.toLowerCase() === 'v' ? { re: p.vectors.find((v) => v.name === args[0])!.real } : null;
    const d = paneCurves({ traces: [{ expr: 'V(a)' }] }, { plot: p1, runs: [p2], labels: new Map(), resolver: resolver as never, mode: 'bode' });
    expect([...d.curves[0].y]).toEqual([0, 10, 20]);
  });
});
