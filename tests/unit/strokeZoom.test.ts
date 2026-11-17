import { describe, expect, it } from 'vitest';
import { STROKE_REF_SCALE, strokeZoom } from '../../src/schematic/strokeZoom.ts';

describe('grosor de las líneas según el zoom (prueba)', () => {
  it('en la escala de referencia todas dan 1; fija da 1 siempre', () => {
    for (const m of ['fixed', 'prop', 'steps', 'soft']) expect(strokeZoom(m, STROKE_REF_SCALE)).toBeCloseTo(1);
    expect(strokeZoom('fixed', 8)).toBe(1);
    expect(strokeZoom(undefined, 0.1)).toBe(1);
  });

  it('proporcional sigue al zoom, con mínimo y máximo', () => {
    expect(strokeZoom('prop', STROKE_REF_SCALE * 2)).toBeCloseTo(2);
    expect(strokeZoom('prop', STROKE_REF_SCALE / 2)).toBeCloseTo(0.5);
    expect(strokeZoom('prop', 0.03)).toBe(0.35);
    expect(strokeZoom('prop', 100)).toBe(6);
  });

  it('en escalones de √2: no cambia con un zoom chico', () => {
    expect(strokeZoom('steps', STROKE_REF_SCALE * 1.1)).toBe(1);
    expect(strokeZoom('steps', STROKE_REF_SCALE * 1.5)).toBeCloseTo(Math.SQRT2);
    expect(strokeZoom('steps', STROKE_REF_SCALE * 2.1)).toBeCloseTo(2);
    expect(strokeZoom('steps', 0.03)).toBe(0.5);
  });

  it('suave: la raíz del zoom', () => {
    expect(strokeZoom('soft', STROKE_REF_SCALE * 4)).toBeCloseTo(2);
    expect(strokeZoom('soft', STROKE_REF_SCALE / 4)).toBeCloseTo(0.5);
  });
});
