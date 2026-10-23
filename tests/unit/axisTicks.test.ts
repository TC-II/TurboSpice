import { describe, expect, it } from 'vitest';
import { axisTicks, si } from '../../src/waveform/series.ts';

describe('marcas de los ejes (#193)', () => {
  it('rango mínimo con valor grande: todas distintas', () => {
    const tt = [0.9996, 0.99965, 0.9997, 0.99975, 0.9998, 0.99985, 0.9999];
    const out = axisTicks(tt);
    expect(new Set(out).size).toBe(tt.length);
    expect(out[0]).toBe('999.60m');
    expect(out[6]).toBe('999.90m');
  });
  it('enteros', () => expect(axisTicks([0, 1, 2, 3, 4, 5])).toEqual(['0', '1', '2', '3', '4', '5']));
  it('simétrico con prefijo único', () => expect(axisTicks([-1e-3, -5e-4, 0, 5e-4, 1e-3])).toEqual(['-1.0m', '-0.5m', '0', '0.5m', '1.0m']));
  it('redondeo a 1000 sube de prefijo', () => expect(axisTicks([0, 0.99999])).toEqual(['0', '1.0']));
  it('si() con redondeo a 1000', () => {
    expect(si(0.99997, 3)).toBe('1');
    expect(si(999.97e-6, 3)).toBe('1m');
  });
});
