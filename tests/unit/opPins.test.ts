import { describe, expect, it } from 'vitest';
import { opPinKey, opPinShown, toggleOpPin } from '../../src/sim/opPins.ts';

describe('punta de prueba sobre el OP (#228)', () => {
  it('claves por red y por componente', () => {
    expect(opPinKey({ net: 'Out' })).toBe('n:out');
    expect(opPinKey({ net: '0' })).toBeUndefined();
    // el pin de un transistor es su propia anotación: cada uno con su corriente
    expect(opPinKey({ symbol: 3, pin: 1 })).toBe('s:3:1');
    expect(opPinKey({ symbol: 3 })).toBe('s:3');
    expect(opPinKey({})).toBeUndefined();
  });
  it('se acumulan y otro clic las quita', () => {
    let p = toggleOpPin(new Set(), { net: 'a' });
    p = toggleOpPin(p, { symbol: 2 });
    expect([...p].sort()).toEqual(['n:a', 's:2']);
    expect(opPinShown(p, { net: 'A' })).toBe(true);
    expect(opPinShown(p, { net: 'b' })).toBe(false);
    p = toggleOpPin(p, { net: 'A' });
    expect([...p]).toEqual(['s:2']);
  });
  it('sin filtro se muestran todas', () => {
    expect(opPinShown(undefined, { net: 'x' })).toBe(true);
  });
});
