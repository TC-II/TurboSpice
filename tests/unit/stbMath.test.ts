import { describe, expect, it } from 'vitest';
import { closedLoopRoots, eigenvalues, evalModel, fitRational, margins, modelZeros, rootLocus } from '../../src/sim/stbMath.ts';

type C = { re: number; im: number };
const mul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const div = (a: C, b: C): C => {
  const m = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / m, im: (a.im * b.re - a.re * b.im) / m };
};
/** K·Π(1 − s/z)/Π(1 − s/p) */
const tf = (K: number, zeros: C[], poles: C[]) => (s: C) => {
  let n: C = { re: K, im: 0 };
  for (const z of zeros) n = mul(n, { re: 1 - div(s, z).re, im: -div(s, z).im });
  for (const p of poles) n = div(n, { re: 1 - div(s, p).re, im: -div(s, p).im });
  return n;
};
const sweep = (fn: (s: C) => C, f0 = 1, f1 = 1e8, ppd = 20) => {
  const f: number[] = [];
  for (let x = Math.log10(f0); x <= Math.log10(f1) + 1e-9; x += 1 / ppd) f.push(10 ** x);
  const v = f.map((x) => fn({ re: 0, im: 2 * Math.PI * x }));
  return { f, re: v.map((c) => c.re), im: v.map((c) => c.im) };
};
const near = (got: C[], want: C[], rel = 1e-3) => {
  expect(got.length).toBe(want.length);
  for (const w of want) {
    const d = Math.min(...got.map((g) => Math.hypot(g.re - w.re, g.im - w.im)));
    expect(d).toBeLessThan(rel * Math.hypot(w.re, w.im));
  }
};

describe('álgebra', () => {
  it('autovalores reales y complejos', () => {
    near(eigenvalues([[0, 1], [-2, -2]]), [{ re: -1, im: 1 }, { re: -1, im: -1 }], 1e-9);
    near(eigenvalues([[2, 0, 0], [1, 3, 0], [4, 5, 6]]), [{ re: 2, im: 0 }, { re: 3, im: 0 }, { re: 6, im: 0 }], 1e-9);
  });
});

describe('márgenes', () => {
  it('tres polos iguales: cruce de −180° en √3·ωp, inestable', () => {
    const w = 2 * Math.PI * 1e5;
    const k = 1e3;
    // T = k/(1+s/w)^3: cruce y fase −180° en √3·w
    const t3 = sweep(tf(k, [], [{ re: -w, im: 0 }, { re: -w, im: 0 }, { re: -w, im: 0 }]), 1, 1e8, 400);
    const m = margins(t3.f, t3.re, t3.im);
    expect(m.gain[0].f).toBeCloseTo((Math.sqrt(3) * w) / (2 * Math.PI), -2);
    expect(m.gain[0].margin).toBeCloseTo(-20 * Math.log10(k / 8), 1);
    expect(m.phase[0].margin).toBeLessThan(0);
  });
});

describe('ajuste racional', () => {
  const poles = [{ re: -2 * Math.PI * 10, im: 0 }, { re: -2 * Math.PI * 1e5, im: 2 * Math.PI * 3e5 }, { re: -2 * Math.PI * 1e5, im: -2 * Math.PI * 3e5 }];
  const zeros = [{ re: -2 * Math.PI * 1e6, im: 0 }];
  const fn = tf(1e4, zeros, poles);
  const d = sweep(fn);
  const m = fitRational(d.f, d.re, d.im)!;
  it('recupera polos y ceros', () => {
    expect(m.error).toBeLessThan(1e-3);
    near(m.poles, poles);
    near(modelZeros(m), zeros, 1e-2);
    const s = { re: 0, im: 2 * Math.PI * 1234 };
    const a = evalModel(m, s);
    const b = fn(s);
    expect(Math.hypot(a.re - b.re, a.im - b.im) / Math.hypot(b.re, b.im)).toBeLessThan(1e-3);
  });
  it('lazo cerrado: ceros de 1 + T', () => {
    for (const r of closedLoopRoots(m, 1)) {
      const v = fn(r);
      expect(Math.hypot(1 + v.re, v.im)).toBeLessThan(1e-3 * Math.hypot(v.re, v.im));
    }
  });
  it('lugar de raíces: ramas desde los polos', () => {
    const br = rootLocus(m);
    expect(br.length).toBe(3);
    near(br.map((b) => b[0]), poles);
  });
});
