import { describe, expect, it } from 'vitest';
import { wheelZoom } from '../../src/waveform/scales.ts';

describe('wheelZoom', () => {
  it('muchos eventos chicos acercan lo mismo que uno grande', () => {
    const one = wheelZoom({ deltaY: -120, deltaMode: 0 });
    const many = Array.from({ length: 8 }, () => wheelZoom({ deltaY: -15, deltaMode: 0 })).reduce((a, b) => a * b);
    expect(many).toBeCloseTo(one, 12);
    expect(one).toBeLessThan(1);
  });

  it('las líneas (Firefox) cuentan como píxeles', () => {
    expect(wheelZoom({ deltaY: 3, deltaMode: 1 })).toBeCloseTo(wheelZoom({ deltaY: 120, deltaMode: 0 }), 12);
  });

  it('alejar deshace acercar', () => {
    expect(wheelZoom({ deltaY: 100, deltaMode: 0 }) * wheelZoom({ deltaY: -100, deltaMode: 0 })).toBeCloseTo(1, 12);
  });
});
