// Símbolos de TCLib y de LTspice con dibujo en ASC-Parser: todos en la librería (#75)
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import { Library } from '../../src/library/library.ts';
import { ltNetlist, ltNetlistText } from '../../src/netlist/ltnetlist.ts';

const bundle = buildBundle();
const lib = new Library(bundle);

describe('símbolos agregados (#75)', () => {
  it.each(['nm_ic', 'pm_ic', 'nm_ic_4', 'pm_ic_4', 'voltage2', 'signal', 'cell', 'xtal'])('%s: símbolo, skin y posiciones de rótulos', (n) => {
    expect(lib.symbol(n), n).toBeDefined();
    expect(bundle.skins[n], n).toBeDefined();
  });

  it('se usan como en LTspice (con la ruta Misc\\ que escribe LTspice)', () => {
    const src = [
      'Version 4',
      'SHEET 1 880 680',
      'SYMBOL Misc\\signal 0 0 R0',
      'SYMATTR InstName V1',
      'SYMBOL Misc\\cell 128 0 R0',
      'SYMATTR InstName V2',
      'SYMATTR Value 9',
      'SYMBOL voltage2 256 0 R0',
      'SYMATTR InstName V3',
      'SYMBOL Misc\\xtal 384 0 R0',
      'SYMATTR InstName C1',
      'SYMATTR Value 10p',
      'SYMBOL nm_ic 512 0 R0',
      'SYMATTR InstName M1',
      'FLAG 560 96 0',
      'SYMBOL pm_ic 640 0 R0',
      'SYMATTR InstName M2',
      'SYMBOL nm_ic_4 768 0 R0',
      'SYMATTR InstName M3',
      'FLAG 816 48 sub',
      '',
    ].join('\n');
    const net = ltNetlistText(ltNetlist(parseAsc(src), lib));
    expect(net).toMatch(/^V1 \S+ \S+ SINE\(0 1 1K\)$/m);
    expect(net).toMatch(/^V2 \S+ \S+ 9$/m);
    expect(net).toMatch(/^V3 \S+ \S+ SINE\(0 1 1K\)$/m);
    expect(net).toMatch(/^C1 \S+ \S+ 10p$/m);
    // MOSFET de 3 pines: el bulk va a la fuente (conectada a tierra)
    const m1 = /^M1 (\S+) (\S+) (\S+) (\S+) NMOS$/m.exec(net);
    expect(m1?.[4]).toBe(m1?.[3]);
    expect(net).toMatch(/^M2 \S+ \S+ \S+ \S+ PMOS$/m);
    // nm_ic_4: el bulk es su propio pin (48,48), como nmos4
    expect(net).toMatch(/^M3 \S+ \S+ \S+ sub NMOS$/m);
  });

  it('nm_nobulk y pm_nobulk (TCLib) abren como nm_ic y pm_ic, con su dibujo (#367)', () => {
    for (const [old, now] of [
      ['nm_nobulk', 'nm_ic'],
      ['pm_nobulk', 'pm_ic'],
    ]) {
      expect(lib.symbol(old)?.pins.map((p) => p.attrs.get('PinName'))).toEqual(lib.symbol(now)?.pins.map((p) => p.attrs.get('PinName')));
      expect(lib.skin(old)).toBeDefined();
      expect(lib.skin(old)).toBe(lib.skin(now));
      // y las posiciones de rótulos del nuevo
      expect(lib.symbol(old)?.name).toBe(now);
    }
  });
});
