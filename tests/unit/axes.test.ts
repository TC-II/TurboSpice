import { describe, expect, it } from 'vitest';
import { paneCurves } from '../../src/waveform/curves.ts';

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
