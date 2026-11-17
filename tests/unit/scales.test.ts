import { describe, expect, it } from 'vitest';
import { alignScales, mapTicks, niceStepAbove, niceTicks, exactRange, extent, logTicks, panBy, zoomAbout, zoomAt } from '../../src/waveform/scales.ts';

describe('escalas del visor', () => {
  it('extent: sólo valores finitos dentro del rango de X', () => {
    const x = [0, 1, 2, 3, 4];
    const y = [5, 1, NaN, 9, -3];
    expect(extent(x, [y])).toEqual([-3, 9]);
    expect(extent(x, [y], 1, 2)).toEqual([1, 1]);
    expect(extent(x, [y, [null, 7, 7, 7, 7]], 0, 2)).toEqual([1, 7]);
    expect(extent(x, [y], 10, 20)).toBeNull();
  });

  it('zoomAbout: acerca alrededor del punto, lineal y en décadas', () => {
    expect(zoomAbout(0, 10, 5, 0.5)).toEqual([2.5, 7.5]);
    expect(zoomAbout(0, 10, 0, 0.5)).toEqual([0, 5]);
    const [lo, hi] = zoomAbout(1, 1e4, 1e2, 0.5, true);
    expect(lo).toBeCloseTo(10);
    expect(hi).toBeCloseTo(1e3);
    expect(zoomAbout(2, 4, 3, 2)).toEqual([1, 5]);
  });

  it('panBy: desplaza en fracciones del ancho, lineal, en décadas y con límites', () => {
    expect(panBy(0, 10, 0.5)).toEqual([5, 15]);
    expect(panBy(0, 10, -0.2)).toEqual([-2, 8]);
    const [lo, hi] = panBy(10, 1e3, 0.5, true);
    expect(lo).toBeCloseTo(100);
    expect(hi).toBeCloseTo(1e4);
    expect(panBy(2, 6, -1, false, [0, 10])).toEqual([0, 4]);
    expect(panBy(2, 6, 2, false, [0, 10])).toEqual([6, 10]);
    expect(panBy(-5, 15, 0.3, false, [0, 10])).toEqual([0, 10]);
  });

  it('exactRange: el eje X va justo de fstart a fstop (#298)', () => {
    expect(exactRange(10, 3.7e6, true)).toEqual([10, 3.7e6]);
    expect(exactRange(2.3e3, 4.7e3, true)).toEqual([2.3e3, 4.7e3]);
    expect(exactRange(null, null, true)).toEqual([null, null]);
    const [lo, hi] = exactRange(100, 100, true) as [number, number];
    expect(Math.log10(hi) - Math.log10(lo)).toBeCloseTo(1);
    expect(exactRange(3, 3)).toEqual([2, 4]);
  });

  it('logTicks: varias décadas, números en las décadas y grilla en 1-2-5 (o 1…9 si entra)', () => {
    const r = logTicks(10, 1e6, 800);
    expect(r.linear).toBe(false);
    expect(r.ticks.filter((_, i) => r.labeled[i])).toEqual([10, 100, 1e3, 1e4, 1e5, 1e6]);
    expect(r.ticks).toHaveLength(5 * 3 + 1);
    expect(r.ticks).toContain(5000);
    // con más lugar, 1-2-3-5 con número y la grilla en todas
    const wide = logTicks(10, 1e6, 1500);
    expect(wide.ticks).toHaveLength(5 * 9 + 1);
    expect(wide.ticks.filter((_, i) => wide.labeled[i]).slice(0, 5)).toEqual([10, 20, 30, 50, 100]);
  });

  it('logTicks: con muchas décadas en poco lugar, una década de cada dos (y la grilla en todas)', () => {
    const r = logTicks(10, 1e15, 400);
    expect(r.ticks.filter((_, i) => r.labeled[i])).toEqual([1e2, 1e4, 1e6, 1e8, 1e10, 1e12, 1e14]);
    expect(r.ticks).toContain(1e3);
  });

  it('logTicks: menos de una década con lugar, 1-2-3-5 (lineal sólo si da más números)', () => {
    const r = logTicks(1000, 9000, 800);
    expect(r.linear).toBe(false);
    expect(r.ticks.filter((_, i) => r.labeled[i])).toEqual([1000, 2000, 3000, 5000]);
  });

  it('logTicks: con mucho zoom (sin ninguna mantisa adentro) no se queda sin números: pasos lineales', () => {
    const r = logTicks(1003, 1010, 800, 50, 72);
    expect(r.linear).toBe(true);
    expect(r.ticks).toEqual([1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010]);
    expect(r.labeled.every(Boolean)).toBe(true);
    const near = logTicks(990, 1010, 800, 50, 65);
    expect(near.linear).toBe(true);
    expect(near.ticks.length).toBeGreaterThanOrEqual(6);
    expect(logTicks(1.0001e6, 1.0002e6, 800, 50, 90).ticks.length).toBeGreaterThanOrEqual(3);
  });

  it('logTicks: rangos inválidos, sin marcas', () => {
    expect(logTicks(0, 10, 800).ticks).toEqual([]);
    expect(logTicks(10, 10, 800).ticks).toEqual([]);
    expect(logTicks(10, 100, 0).ticks).toEqual([]);
  });

  it('zoomAt: en escala log el punto bajo el mouse queda fijo y el factor es uniforme (#299)', () => {
    const r: [number, number] = [10, 3.7e6];
    const pos = ([lo, hi]: number[], v: number) => (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
    for (const f of [0.05, 0.3, 0.5, 0.9]) {
      const at = 10 ** (1 + Math.log10(3.7e5) * f);
      const z = zoomAt(r, f, 0.5, true);
      expect(pos(z, at)).toBeCloseTo(f, 9);
      expect(Math.log10(z[1] / z[0])).toBeCloseTo(Math.log10(r[1] / r[0]) * 0.5, 9);
    }
    expect(zoomAt([0, 10], 0.25, 0.5)).toEqual([1.25, 6.25]);
  });

  it('niceStepAbove y niceTicks: pasos 1, 2, 2,5, 5', () => {
    expect(niceStepAbove(0.3)).toBe(0.5);
    expect(niceStepAbove(2)).toBe(2);
    expect(niceStepAbove(21)).toBe(25);
    expect(niceStepAbove(60)).toBe(100);
    expect(niceTicks(-0.05, 1.03, 5)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it('alignScales: las dos escalas con la misma cantidad de divisiones y pasos lindos (#300)', () => {
    const nice = (v: number) => [1, 2, 2.5, 5].some((m) => Math.abs(v / 10 ** Math.floor(Math.log10(v)) - m) < 1e-9);
    const cases: [number, number][][] = [
      [
        [-60, 3],
        [-180, 0],
      ],
      [
        [0, 1.2],
        [-0.003, 0.0045],
      ],
      [
        [-1.1, 1.1],
        [0, 270],
      ],
      [
        [12, 13],
        [-5e-6, 5e-6],
      ],
    ];
    for (const [l, r] of cases) {
      const a = alignScales(l, r);
      expect(a.leftTicks.length).toBe(a.n + 1);
      expect(a.rightTicks.length).toBe(a.n + 1);
      expect(a.left[0]).toBeLessThanOrEqual(l[0]);
      expect(a.left[1]).toBeGreaterThanOrEqual(l[1]);
      expect(a.right[0]).toBeLessThanOrEqual(r[0]);
      expect(a.right[1]).toBeGreaterThanOrEqual(r[1]);
      expect(a.leftTicks[0]).toBe(a.left[0]);
      expect(a.leftTicks[a.n]).toBe(a.left[1]);
      expect(a.rightTicks[a.n]).toBe(a.right[1]);
      expect(nice(a.leftTicks[1] - a.leftTicks[0])).toBe(true);
      expect(nice(a.rightTicks[1] - a.rightTicks[0])).toBe(true);
    }
    // datos positivos: el rango no baja de 0
    expect(alignScales([0, 1.2], [0, 270]).left[0]).toBe(0);
  });

  it('mapTicks: las marcas de una escala a la misma altura en la otra', () => {
    expect(mapTicks([0, 5, 10], [0, 10], [-180, 0])).toEqual([-180, -90, 0]);
  });
});
