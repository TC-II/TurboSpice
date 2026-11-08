import { describe, expect, it } from 'vitest';
import { quickValue } from '../../src/app/quickValue.ts';
import { setSymbolAttrs } from '../../src/schematic/edit.ts';
import type { AscDoc } from '../../src/asc/model.ts';

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

  it('Vcc: muestra 15 (no V=15) y guarda V=<valor> en Value', () => {
    const q = quickValue('X', 'TCLib\\Vcc', { Value: 'V=15' }, 'V=15')!;
    expect(q.shown).toBe('15');
    expect(q.store('12')).toBe('V=12');
    expect(q.store('V=9')).toBe('V=9');
    // sin Value en el componente: el del símbolo
    expect(quickValue('X', 'TCLib/Vcc', {}, 'V=15')?.shown).toBe('15');
  });

  it('otros subcircuitos X no tienen edición rápida; Value se crea si falta', () => {
    expect(quickValue('X', 'TCLib\\LM741', {}, 'LM741')).toBeNull();
    const doc = { symbols: [{ type: 'TCLib\\Vcc', x: 0, y: 0, orient: 'R0', attrs: new Map([['InstName', 'X1']]) }] } as unknown as AscDoc;
    const out = setSymbolAttrs(doc, 0, { Value: quickValue('X', 'TCLib\\Vcc', {}, 'V=15')!.store('12') });
    expect(out.symbols[0].attrs.get('Value')).toBe('V=12');
  });
});
