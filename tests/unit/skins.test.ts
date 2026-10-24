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

describe('trazos de los skins (#231)', () => {
  const { skins } = buildBundle();

  it('ningún stroke-width queda por debajo de 1 px (se dibujan con non-scaling-stroke)', () => {
    for (const [name, s] of Object.entries(skins)) {
      for (const m of s.body.matchAll(/stroke-width:\s*(\d*\.?\d+)/g)) expect(Number(m[1]), name).toBeGreaterThanOrEqual(1);
    }
  });

  it('los signos + y − de la fuente de tensión llevan contorno de 1 px', () => {
    expect(skins.voltage.body).toContain('stroke-width: 1px');
    expect(skins.voltage.body).not.toMatch(/stroke-width:\s*\.5/);
  });
});
