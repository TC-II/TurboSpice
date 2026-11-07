import { describe, expect, it } from 'vitest';
import { buildBundle, normalizeSkin } from '../../scripts/build-library.mjs';
import { Library } from '../../src/library/library.ts';

const TRANSISTORS = ['npn', 'pnp', 'NPN_ideal', 'PNP_ideal', 'nmos', 'pmos', 'nmos4', 'pmos4', 'nm_ic', 'pm_ic', 'nm_ic_4', 'pm_ic_4', 'njf', 'pjf'];

describe('skins de transistores (#57)', () => {
  const { skins } = buildBundle();

  it('sin el círculo envolvente, como en LTspice', () => {
    for (const t of TRANSISTORS) {
      expect(skins[t], t).toBeDefined();
      const radii = [...skins[t].body.matchAll(/<circle\b[^>]*\br="([\d.]+)"/g)].map((m) => Number(m[1]));
      expect(
        radii.filter((r) => r > 10),
        t,
      ).toEqual([]);
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

describe('skins para elegir (#329)', () => {
  const bundle = buildBundle();
  const lib = new Library(bundle);

  it('Boca Jrs viene de library/skins y conserva sus colores', () => {
    expect(lib.skinNames()).toEqual(['Default', 'Boca Jrs']);
    const res = bundle.skinSets['Boca Jrs'].res.body;
    expect(res).toContain('#103f79');
    expect(res).toContain('#f3b229');
  });

  it('el skin elegido gana; lo que no dibuja sale del Default', () => {
    const boca = lib.withSkin('Boca Jrs');
    expect(boca.skinName).toBe('Boca Jrs');
    expect(boca.skin('res')).toBe(bundle.skinSets['Boca Jrs'].res);
    expect(bundle.skinSets['Boca Jrs'].LoopProbe).toBeUndefined();
    expect(boca.skin('LoopProbe')).toBe(bundle.skins.LoopProbe);
    expect(lib.skin('res')).toBe(bundle.skins.res);
    expect(boca.withSkin('Default').skin('res')).toBe(bundle.skins.res);
    expect(lib.withSkin('no existe').skinName).toBe('Default');
  });

  it('comparte símbolos y la cuenta de cambios con la librería original', () => {
    const boca = lib.withSkin('Boca Jrs');
    const rev = lib.rev;
    boca.addSymbol('mio', 'Version 4\nSymbolType CELL\nPIN 0 0 NONE 0\nPINATTR PinName a\n');
    expect(lib.symbol('mio')).toBeDefined();
    expect(lib.rev).toBe(boca.rev);
    expect(lib.rev).toBeGreaterThan(rev);
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

  it('stroke-width como atributo pasa a style, para el grosor de líneas de la Configuración (#367)', () => {
    const { body } = normalizeSkin('<svg viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="0" stroke="#000000" stroke-width="1.5"/><path d="M0 0" style="fill:none" stroke-width="2"/></svg>');
    expect(body).not.toMatch(/\sstroke-width="/);
    expect(body).toContain('<line style="stroke-width: 1.5px;"');
    expect(body).toContain('style="fill:none;stroke-width: 2px;"');
    for (const n of ['nmos', 'nmos4', 'nm_ic', 'pm_ic_4']) expect(skins[n].body).not.toMatch(/\sstroke-width="/);
  });
});
