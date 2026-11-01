import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { tremorSkin, tremorWire } from '../../src/schematic/tremor.ts';

const { skins } = buildBundle();
const coords = (body: string) => [...body.matchAll(/d="([^"]+)"/g)].flatMap((m) => [...m[1].matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((p) => [Number(p[1]), Number(p[2])]));

describe('trazo Tremor (#330)', () => {
  it('redibuja la resistencia entera a mano alzada y llega justo a los pines', () => {
    const out = tremorSkin(skins.res, [[16, 16], [16, 96]], 'res|0|0');
    expect(out.body).not.toContain('<style');
    expect(out.body).not.toContain('class=');
    expect(out.body).toContain('stroke="currentColor"');
    const pts = coords(out.body);
    const xs = pts.map((p) => p[0]);
    // el cuerpo sigue midiendo 22 de ancho (de x = 5 a 27), con el temblor
    expect(Math.min(...xs)).toBeLessThan(6.5);
    expect(Math.max(...xs)).toBeGreaterThan(25.5);
    for (const pin of [[16, 16], [16, 96]]) expect(pts.some((p) => p[0] === pin[0] && p[1] === pin[1])).toBe(true);
  });

  it('la misma semilla da el mismo dibujo; otra, uno distinto', () => {
    const a = tremorSkin(skins.cap, [[16, 0], [16, 64]], 'cap|1|2');
    expect(tremorSkin(skins.cap, [[16, 0], [16, 64]], 'cap|1|2')).toBe(a);
    expect(tremorSkin(skins.cap, [[16, 0], [16, 64]], 'cap|9|9').body).not.toBe(a.body);
  });

  it('un cable conserva sus extremos', () => {
    const pts = tremorWire(0, 0, 160, 0).split(' ');
    expect(pts[0]).toBe('0,0');
    expect(pts.at(-1)).toBe('160,0');
    expect(pts.length).toBeGreaterThan(2);
  });
});

describe('el blanco de los skins a color (Boca Jrs)', () => {
  const boca = buildBundle().skinSets!['Boca Jrs'];
  it('la flecha blanca del BJT queda blanca (no toma el fondo, oscuro en el tema oscuro)', () => {
    expect(boca.npn.body).toContain('fill: #fff');
    expect(boca.npn.body).not.toContain('var(--sch-bg)');
    expect(boca.res_pipe.body).not.toContain('var(--sch-bg)');
  });

  it('en un skin en blanco y negro el blanco sigue siendo el fondo', () => {
    expect(skins.node.body).toContain('var(--sch-bg)');
  });

  it('a mano alzada, un trazo blanco sigue blanco (roughPen traza todo en negro)', () => {
    const out = tremorSkin(boca.npn, [[64, 0], [0, 48], [64, 96]], 'npn|0|0');
    expect(out.body).toMatch(/stroke="#fff"/);
  });
});

describe('Tremor igual que en ASC-Parser (#330)', () => {
  it('con la misma semilla, cada skin del Default sale con los mismos trazos que el original', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { default: RoughPen } = await import('../../src/schematic/roughPen.js');
    const ds = (s: string) => [...s.matchAll(/ d="([^"]+)"|stroke-width="([^"]+)"/g)].map((m) => m[1] ?? m[2]).join('|');
    for (const f of readdirSync('library/skins/default').filter((n) => n.endsWith('.svg'))) {
      const name = f.slice(0, -4);
      const seed = `${name.toLowerCase()}|128|-64`;
      const orig = RoughPen.roughen(readFileSync(`library/skins/default/${f}`, 'utf8'), { pins: [[0, 0]], seed }).svg;
      expect(ds(tremorSkin(skins[name], [[0, 0]], seed).body), name).toBe(ds(orig));
    }
  });
});
