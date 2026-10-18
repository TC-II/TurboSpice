import { describe, expect, it } from 'vitest';
import type { SimPlot } from '../../src/engine/ngspice.ts';
import { niceStep, pzCsv, pzMarks, pzRoots, pzRuns, rootInfo, ticks, unstable } from '../../src/waveform/pz.ts';
import { stepSweepPlots } from '../../src/waveform/series.ts';

// RLC serie: R = 10, L = 1m, C = 1µ → ω₀ = 31.6k rad/s, ζ = 0.158
const w0 = 1 / Math.sqrt(1e-3 * 1e-6);
const pz = (name: string, zeta: number): SimPlot => {
  const re = -zeta * w0;
  const im = w0 * Math.sqrt(1 - zeta * zeta);
  return {
    name,
    vectors: [
      { name: 'pole(1)', type: 0, real: Float64Array.of(re), imag: Float64Array.of(im) },
      { name: 'pole(2)', type: 0, real: Float64Array.of(re), imag: Float64Array.of(-im) },
    ],
  };
};

describe('polos y ceros', () => {
  it('f₀, Q, ζ y τ de un par complejo', () => {
    const [p] = pzRoots([pz('pz1', 0.158)]);
    const i = rootInfo(p);
    expect(i.f0).toBeCloseTo(5033, 0);
    expect(i.q).toBeCloseTo(3.16, 2);
    expect(i.zeta).toBeCloseTo(0.158, 3);
    expect(i.tau).toBeCloseTo(1 / (0.158 * w0), 9);
    expect(unstable(p)).toBe(false);
  });

  it('raíz real: sin Q, ζ = 1; en el origen: τ infinito', () => {
    expect(rootInfo({ re: -100, im: 0 })).toMatchObject({ zeta: 1, tau: 0.01 });
    expect(Number.isNaN(rootInfo({ re: -100, im: 0 }).q)).toBe(true);
    expect(rootInfo({ re: 0, im: 0 }).tau).toBe(Infinity);
  });

  it('corridas de .step y marcas para el Bode', () => {
    const plots = [{ name: 'ac1', vectors: [] }, pz('pz1', 0.1), pz('pz2', 0.2), pz('pz3', 0.4)];
    const runs = pzRuns(plots, plots[2]);
    expect(runs.map((p) => p.name)).toEqual(['pz1', 'pz2', 'pz3']);
    const roots = pzRoots(runs);
    expect(roots.map((r) => r.run)).toEqual([0, 0, 1, 1, 2, 2]);
    // un par conjugado es una sola frecuencia (todas iguales a ω₀/2π)
    expect(pzMarks(roots)).toEqual([{ f: expect.closeTo(w0 / (2 * Math.PI), 6), kind: 'pole' }]);
    expect(pzCsv(roots, (r) => `R=${r}`).split('\n')[1]).toMatch(/^"R=0","polo",1,/);
    // los .pz con .step no se convierten en "pz vs R"
    expect(stepSweepPlots(runs, { names: ['R'], runs: [0, 1, 2].map((v) => ({ label: `R=${v}`, values: [v] })) } as never)).toEqual([]);
  });

  it('polo en el semiplano derecho', () => {
    expect(unstable({ kind: 'pole', n: 1, re: 10, im: 1e3, run: 0 })).toBe(true);
    expect(unstable({ kind: 'zero', n: 1, re: 10, im: 0, run: 0 })).toBe(false);
  });

  it('escala de la grilla', () => {
    expect(niceStep(100)).toBe(20);
    expect(niceStep(7e4)).toBe(1e4);
    expect(ticks(-25, 25, 10)).toEqual([-20, -10, 0, 10, 20]);
  });
});
