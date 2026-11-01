// Bode normalizado a partir de los polos y ceros de un .pz (#343)
import { describe, expect, it } from 'vitest';
import type { SimPlot } from '../../src/engine/ngspice.ts';
import { isPzBodePlot, pzBode, pzBodePlots, type Root } from '../../src/waveform/pz.ts';

const root = (kind: Root['kind'], re: number, im = 0): Root => ({ kind, n: 1, re, im, run: 0 });
/** |H| [dB] y fase [°] en la frecuencia más cercana a f */
const at = (b: NonNullable<ReturnType<typeof pzBode>>, f: number) => {
  let i = 0;
  for (let k = 0; k < b.f.length; k++) if (Math.abs(Math.log(b.f[k] / f)) < Math.abs(Math.log(b.f[i] / f))) i = k;
  return { db: 20 * Math.log10(Math.hypot(b.re[i], b.im[i])), deg: (Math.atan2(b.im[i], b.re[i]) * 180) / Math.PI, f: b.f[i] };
};
const pzPlot = (name: string, roots: [string, number, number][]): SimPlot => ({
  name,
  vectors: roots.map(([n, re, im]) => ({ name: n, type: 0, real: Float64Array.of(re), imag: Float64Array.of(im) })),
});

describe('Bode normalizado de un .pz', () => {
  it('un polo real: 0 dB en continua, −3 dB y −45° en su frecuencia, −20 dB/década después', () => {
    const fc = 1000 / (2 * Math.PI);
    const b = pzBode([root('pole', -1000)], 100)!;
    expect(b.atOrigin).toBe(false);
    expect(at(b, b.f[0]).db).toBeCloseTo(0, 1);
    expect(at(b, fc).db).toBeCloseTo(-3.01, 1);
    expect(at(b, fc).deg).toBeCloseTo(-45, 0);
    // el rango: una década antes y una después
    expect(b.f[0]).toBeLessThanOrEqual(fc / 10);
    expect(b.f[b.f.length - 1]).toBeGreaterThanOrEqual(fc * 10);
    // una década después del polo: −20 dB
    expect(at(b, fc * 10).db).toBeCloseTo(-20, 0);
  });
  it('un par complejo con Q alto: el pico en ω₀ y −180° al final', () => {
    // ω₀ = 1000, ζ = 0.1
    const b = pzBode([root('pole', -100, 994.987), root('pole', -100, -994.987)], 200)!;
    const p = at(b, 1000 / (2 * Math.PI));
    expect(p.db).toBeCloseTo(20 * Math.log10(1 / (2 * 0.1)), 0);
    // (con Q = 5 la fase cambia rápido: la grilla no cae justo en ω₀)
    expect(Math.abs(p.deg + 90)).toBeLessThan(5);
    expect(at(b, b.f[b.f.length - 1]).deg).toBeLessThan(-170);
  });
  it('un cero en el semiplano derecho suma fase negativa (como un polo) y ganancia positiva', () => {
    const b = pzBode([root('zero', 1000)], 100)!;
    const p = at(b, 1000 / (2 * Math.PI));
    expect(p.db).toBeCloseTo(3.01, 1);
    expect(p.deg).toBeCloseTo(-45, 0);
  });
  it('con un cero en el origen (pasa-altos) el máximo va a 0 dB y la fase arranca en +90°', () => {
    const b = pzBode([root('zero', 0), root('pole', -1000)], 100)!;
    expect(b.atOrigin).toBe(true);
    const mags = Array.from(b.f, (_, i) => Math.hypot(b.re[i], b.im[i]));
    expect(Math.max(...mags)).toBeCloseTo(1, 6);
    expect(at(b, b.f[0]).deg).toBeCloseTo(90, -1);
  });
  it('sin raíces (o sólo en el origen) no hay Bode', () => {
    expect(pzBode([])).toBeNull();
    expect(pzBode([root('pole', 0)])).toBeNull();
  });
  it('un plot pzbode por corrida, sólo si no hay otro análisis en frecuencia', () => {
    const pz1 = pzPlot('pz1', [['pole(1)', -1000, 0]]);
    const pz2 = pzPlot('pz2', [['pole(1)', -2000, 0]]);
    const out = pzBodePlots([pz1, pz2]);
    expect(out.map((p) => p.name)).toEqual(['pzbode1', 'pzbode2']);
    expect(out.every(isPzBodePlot)).toBe(true);
    expect(out[0].vectors.map((v) => v.name)).toEqual(['frequency', 'h']);
    expect(out[0].info).toMatch(/gain|ganancia/i);
    const ac: SimPlot = { name: 'ac1', vectors: [{ name: 'frequency', type: 2, real: Float64Array.of(1, 10) }] };
    expect(pzBodePlots([ac, pz1])).toEqual([]);
  });
});
