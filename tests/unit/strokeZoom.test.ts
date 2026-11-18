import { describe, expect, it } from 'vitest';
import { STROKE_REF_SCALE, strokeZoom } from '../../src/schematic/strokeZoom.ts';

describe('grosor de las líneas según el zoom', () => {
  it('en la escala de referencia, el de la Configuración', () => {
    expect(strokeZoom(STROKE_REF_SCALE)).toBe(1);
    expect(strokeZoom(0)).toBe(1);
    expect(strokeZoom(NaN)).toBe(1);
  });

  it('crece con la raíz del zoom, no en proporción', () => {
    expect(strokeZoom(STROKE_REF_SCALE * 4)).toBeCloseTo(2);
    expect(strokeZoom(STROKE_REF_SCALE / 4)).toBeCloseTo(0.5);
    expect(strokeZoom(STROKE_REF_SCALE * 2)).toBeCloseTo(Math.SQRT2);
  });

  it('en escalones de √2 del zoom: un zoom chico no lo cambia', () => {
    expect(strokeZoom(STROKE_REF_SCALE * 1.15)).toBe(1);
    expect(strokeZoom(STROKE_REF_SCALE / 1.15)).toBe(1);
    expect(strokeZoom(STROKE_REF_SCALE * 1.5)).toBeCloseTo(2 ** 0.25);
    // todo el rango de la rueda cae en pocos valores distintos
    const values = new Set<number>();
    for (let s = 0.03; s <= 8; s *= 1.05) values.add(strokeZoom(s));
    expect(values.size).toBeLessThanOrEqual(10);
  });

  it('de lejos nunca baja de la mitad', () => {
    expect(strokeZoom(0.03)).toBe(0.5);
    expect(strokeZoom(STROKE_REF_SCALE / 8)).toBe(0.5);
  });
});
