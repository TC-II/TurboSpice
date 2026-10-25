import { describe, expect, it } from 'vitest';
import { decimator } from '../../src/waveform/decimate.ts';

/** Paso variable (como el de una transitoria) y dos curvas */
function wave(n: number) {
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const x = new Float64Array(n);
  for (let i = 1; i < n; i++) x[i] = x[i - 1] + 0.1 + rnd() * (i % 1000 < 50 ? 5 : 0.5);
  const a = x.map((t) => Math.sin(t / 50) + 0.3 * (rnd() - 0.5));
  const b = x.map((t) => Math.cos(t / 7) * 2);
  return { x, ys: [a, b] };
}

/** mínimo y máximo de y con x en [lo, hi) */
function minMax(x: ArrayLike<number>, y: ArrayLike<number>, lo: number, hi: number) {
  let mn = Infinity;
  let mx = -Infinity;
  for (let k = 0; k < x.length; k++)
    if (x[k] >= lo && x[k] < hi) {
      mn = Math.min(mn, y[k]);
      mx = Math.max(mx, y[k]);
    }
  return [mn, mx];
}

describe('decimator', () => {
  const { x, ys } = wave(200_000);
  const d = decimator(x, ys);

  it('cada píxel de uPlot tiene el mismo mínimo y máximo que con todos los datos', () => {
    const lo = x[30_000] + 0.05;
    const hi = x[170_000] - 0.05;
    for (const [cols, offset] of [[500, 0], [497, 57], [612, 80.5]]) {
      const [ox, ...oy] = d.view(lo, hi, cols, false, offset);
      expect(ox.length).toBeLessThan(cols * 4 + 20);
      // el píxel de cada punto, como lo redondea uPlot
      const px = (v: number) => Math.round(offset + (cols * (v - lo)) / (hi - lo));
      const byPx = (xs: ArrayLike<number>, y: ArrayLike<number>) => {
        const m = new Map<number, [number, number]>();
        for (let k = 0; k < xs.length; k++) {
          if (xs[k] < lo || xs[k] > hi) continue;
          const p = px(xs[k]);
          const [a, b] = m.get(p) ?? [Infinity, -Infinity];
          m.set(p, [Math.min(a, y[k]), Math.max(b, y[k])]);
        }
        return m;
      };
      for (let s = 0; s < ys.length; s++) expect(byPx(ox, oy[s])).toEqual(byPx(x, ys[s]));
    }
  });

  it('incluye el punto anterior y el siguiente a lo visible, y el primero y el último', () => {
    const lo = x[1000] + 0.01;
    const hi = x[150_000] + 0.01;
    const [ox, oy] = d.view(lo, hi, 300);
    expect(ox[0]).toBe(x[0]);
    expect(ox[1]).toBe(x[1000]);
    expect(oy[1]).toBe(ys[0][1000]);
    expect(ox[ox.length - 2]).toBe(x[150_001]);
    expect(ox[ox.length - 1]).toBe(x[x.length - 1]);
    // x creciente
    for (let k = 1; k < ox.length; k++) expect(ox[k]).toBeGreaterThanOrEqual(ox[k - 1]);
  });

  it('con pocos puntos visibles van todos, tal cual', () => {
    const [ox, oa, ob] = d.view(x[5000], x[5100], 1000);
    expect(Array.from(ox.slice(1, -1))).toEqual(Array.from(x.slice(4999, 5102)));
    expect(Array.from(oa.slice(1, -1))).toEqual(Array.from(ys[0].slice(4999, 5102)));
    expect(Array.from(ob.slice(1, -1))).toEqual(Array.from(ys[1].slice(4999, 5102)));
  });

  it('todo el rango: empieza y termina en los extremos de los datos', () => {
    const [ox] = d.view(x[0], x[x.length - 1], 800);
    expect(ox[0]).toBe(x[0]);
    expect(ox[ox.length - 1]).toBe(x[x.length - 1]);
    expect(ox.length).toBeLessThanOrEqual(801 * 4 + 4);
  });

  it('eje logarítmico: columnas iguales en décadas', () => {
    const f = Float64Array.from({ length: 100_000 }, (_, k) => 10 ** (1 + (6 * k) / 99_999));
    const y = f.map((v) => Math.sin(Math.log(v) * 40));
    const [ox, oy] = decimator(f, [y]).view(100, 1e6, 400, true);
    for (let c = 0; c < 399; c++) {
      const a = 10 ** (2 + (c + 0.5) / 100);
      const b = 10 ** (2 + (c + 1.5) / 100);
      expect(minMax(ox, oy, a, b)).toEqual(minMax(f, y, a, b));
    }
  });
});
