import { describe, expect, it } from 'vitest';
import { exactRange, extent, logLabeled, panBy, zoomAbout } from '../../src/waveform/scales.ts';

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

  it('logLabeled: décadas; con menos de dos, también 2 y 5', () => {
    expect(logLabeled([10, 20, 50, 100, 200, 1000])).toEqual([true, false, false, true, false, true]);
    expect(logLabeled([2000, 3000, 5000, 10000, 20000])).toEqual([true, false, true, true, true]);
    expect(logLabeled([3000, 4000, null])).toEqual([true, true, false]);
  });
});
