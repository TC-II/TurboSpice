import { describe, expect, it } from 'vitest';
import { boxAxes, extent, panBy, zoomAbout } from '../../src/waveform/scales.ts';

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

  it('panBy: desplaza sin cambiar el ancho, en décadas y sin salirse de los datos', () => {
    expect(panBy(2, 4, 0.5, 0, 10)).toEqual([3, 5]);
    expect(panBy(2, 4, -0.5, 0, 10)).toEqual([1, 3]);
    expect(panBy(7, 9, 5, 0, 10)).toEqual([8, 10]);
    expect(panBy(1, 3, -5, 0, 10)).toEqual([0, 2]);
    const [lo, hi] = panBy(10, 100, 1, 1, 1e4, true);
    expect(lo).toBeCloseTo(100);
    expect(hi).toBeCloseTo(1e3);
  });

  it('boxAxes: recuadro, casi horizontal, casi vertical y click', () => {
    expect(boxAxes({ width: 100, height: 80 }, 500, 200)).toEqual({ x: true, y: true });
    expect(boxAxes({ width: 100, height: 200 }, 500, 200)).toEqual({ x: true, y: false });
    expect(boxAxes({ width: 500, height: 60 }, 500, 200)).toEqual({ x: false, y: true });
    expect(boxAxes({ width: 2, height: 3 }, 500, 200)).toEqual({ x: false, y: false });
    expect(boxAxes({ width: 500, height: 200 }, 500, 200)).toEqual({ x: true, y: true });
  });
});
