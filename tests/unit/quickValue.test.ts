import { describe, expect, it } from 'vitest';
import { quickValue } from '../../src/app/quickValue.ts';

describe('edición rápida de valor (botón derecho)', () => {
  it('R, L y C: el valor tal cual', () => {
    const q = quickValue('R', 'res', { Value: '1k' }, '1k')!;
    expect(q.shown).toBe('1k');
    expect(q.store('2k')).toBe('2k');
    expect(quickValue('c', 'cap', {}, '1u')).not.toBeNull();
  });

  it('fuente V: sólo si es de continua', () => {
    expect(quickValue('V', 'cell', { Value: '5' }, '5')?.shown).toBe('5');
    expect(quickValue('V', 'voltage', { Value: 'SINE(0 1 1k)' }, 'SINE(0 1 1k)')).toBeNull();
    expect(quickValue('V', 'voltage', { Value: 'V' }, 'V')).toBeNull();
  });

  it('fuente I: de continua se edita rápido; recién colocada (Value "I") también, con el campo vacío', () => {
    expect(quickValue('I', 'current', { Value: '1m' }, '1m')?.shown).toBe('1m');
    expect(quickValue('I', 'current', { Value: 'DC 2m' }, 'DC 2m')?.shown).toBe('DC 2m');
    expect(quickValue('I', 'current', {}, 'I')?.shown).toBe('');
    expect(quickValue('I', 'current', { Value: 'I' }, 'I')?.store('3m')).toBe('3m');
    expect(quickValue('I', 'current', { Value: 'PULSE(0 1 0 1n 1n 1m 2m)' }, '')).toBeNull();
    expect(quickValue('I', 'current', { Value: '1m', Value2: 'AC 1' }, '1m')?.shown).toBe('1m');
  });
});
