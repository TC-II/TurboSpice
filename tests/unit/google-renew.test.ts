import { describe, expect, it } from 'vitest';
import { RENEW_BEFORE, shouldRenew } from '../../src/cloud/google.ts';

describe('renovar la sesión de Google en un gesto (#192)', () => {
  const now = 1_000_000_000;
  const ok = { signedIn: true, pending: false, lastTry: 0 };
  it('token con tiempo de sobra: no', () => {
    expect(shouldRenew({ expires: now + 50 * 60_000 }, now, ok)).toBe(false);
  });
  it('por vencer, vencido o sin token: sí', () => {
    expect(shouldRenew({ expires: now + RENEW_BEFORE - 1 }, now, ok)).toBe(true);
    expect(shouldRenew({ expires: now - 1 }, now, ok)).toBe(true);
    expect(shouldRenew(null, now, ok)).toBe(true);
  });
  it('sin sesión, con un pedido en curso o un intento hace menos de un minuto: no', () => {
    expect(shouldRenew(null, now, { ...ok, signedIn: false })).toBe(false);
    expect(shouldRenew(null, now, { ...ok, pending: true })).toBe(false);
    expect(shouldRenew(null, now, { ...ok, lastTry: now - 30_000 })).toBe(false);
    expect(shouldRenew(null, now, { ...ok, lastTry: now - 61_000 })).toBe(true);
  });
});
