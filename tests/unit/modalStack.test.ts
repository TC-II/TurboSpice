import { describe, expect, it } from 'vitest';
import { isTopModal, pushModal } from '../../src/ui/modalStack.ts';

describe('pila de diálogos', () => {
  it('sólo el de más arriba responde a Escape', () => {
    const a = Symbol('a');
    const b = Symbol('b');
    const popA = pushModal(a);
    expect(isTopModal(a)).toBe(true);
    const popB = pushModal(b);
    expect(isTopModal(a)).toBe(false);
    expect(isTopModal(b)).toBe(true);
    popB();
    expect(isTopModal(a)).toBe(true);
    popA();
    expect(isTopModal(a)).toBe(false);
  });
  it('sacar uno del medio no cambia el de arriba', () => {
    const [a, b] = [Symbol('a'), Symbol('b')];
    const popA = pushModal(a);
    const popB = pushModal(b);
    popA();
    expect(isTopModal(b)).toBe(true);
    popB();
  });
});
