import { describe, expect, it } from 'vitest';
import { hideOpTag, moveOpTag, noOpTags, opPinKey, opPinShown, opTagVisible, toggleOpPin, toggleOpTag, unhideOpTags } from '../../src/sim/opPins.ts';

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

describe('etiquetas del OP movibles y persistentes (#306)', () => {
  it('con «Anotar el OP» se ven todas; sin, sólo las fijadas y las movidas', () => {
    let t = toggleOpTag(noOpTags(), { net: 'out' });
    expect(opTagVisible(t, 'n:out', false)).toBe(true);
    expect(opTagVisible(t, 'n:in', false)).toBe(false);
    expect(opTagVisible(t, 'n:in', true)).toBe(true);
    t = moveOpTag(t, 's:2', 10, 0);
    t = moveOpTag(t, 's:2', 5, -4);
    expect(t.moved.get('s:2')).toEqual({ dx: 15, dy: -4 });
    expect(opTagVisible(t, 's:2', false)).toBe(true);
  });
  it('Delete la oculta hasta volver a activar el OP', () => {
    let t = moveOpTag(noOpTags(), 'n:a', 3, 3);
    t = hideOpTag(t, 'n:a');
    expect(opTagVisible(t, 'n:a', true)).toBe(false);
    expect(t.moved.has('n:a')).toBe(false);
    t = unhideOpTags(t);
    expect(opTagVisible(t, 'n:a', true)).toBe(true);
    expect(opTagVisible(t, 'n:a', false)).toBe(false);
  });
  it('la punta de prueba la vuelve a mostrar o la quita', () => {
    let t = hideOpTag(noOpTags(), 'n:a');
    t = toggleOpTag(t, { net: 'A' });
    expect(opTagVisible(t, 'n:a', false)).toBe(true);
    t = moveOpTag(t, 'n:a', 1, 1);
    t = toggleOpTag(t, { net: 'a' });
    expect(opTagVisible(t, 'n:a', false)).toBe(false);
    expect(t.hidden.has('n:a')).toBe(false);
  });
});