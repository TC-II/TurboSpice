import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';

const TRANSISTORS = ['npn', 'pnp', 'NPN_ideal', 'PNP_ideal', 'nmos', 'pmos', 'nmos4', 'pmos4', 'nm_nobulk', 'pm_nobulk', 'njf', 'pjf'];

describe('skins de transistores (#57)', () => {
  const { skins } = buildBundle();

  it('sin el círculo envolvente, como en LTspice', () => {
    for (const t of TRANSISTORS) {
      expect(skins[t], t).toBeDefined();
      const radii = [...skins[t].body.matchAll(/<circle\b[^>]*\br="([\d.]+)"/g)].map((m) => Number(m[1]));
      expect(radii.filter((r) => r > 10), t).toEqual([]);
    }
  });

  it('la caja (viewBox) no va más allá del dibujo: los pines están en x = 0 y en el borde derecho', () => {
    for (const t of TRANSISTORS) {
      const [x, y, w, h] = skins[t].viewBox.split(/\s+/).map(Number);
      expect([x, y, h], t).toEqual([0, 0, 96]);
      expect(w, t).toBe(/^(npn|pnp)/i.test(t) ? 64 : 48);
    }
  });
});
