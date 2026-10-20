// Símbolos de TCLib y de LTspice con dibujo en ASC-Parser: todos en la librería (#75)
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import { Library } from '../../src/library/library.ts';
import { ltNetlist, ltNetlistText } from '../../src/netlist/ltnetlist.ts';

const bundle = buildBundle();
const lib = new Library(bundle);

describe('símbolos agregados (#75)', () => {
  it.each(['nm_nobulk', 'pm_nobulk', 'voltage2', 'signal', 'cell', 'xtal'])('%s: símbolo, skin y posiciones de rótulos', (n) => {
    expect(lib.symbol(n), n).toBeDefined();
    expect(bundle.skins[n], n).toBeDefined();
  });

  it('se usan como en LTspice (con la ruta Misc\ que escribe LTspice)', () => {
    const src = [
      'Version 4', 'SHEET 1 880 680',
      'SYMBOL Misc\\signal 0 0 R0', 'SYMATTR InstName V1',
      'SYMBOL Misc\\cell 128 0 R0', 'SYMATTR InstName V2', 'SYMATTR Value 9',
      'SYMBOL voltage2 256 0 R0', 'SYMATTR InstName V3',
      'SYMBOL Misc\\xtal 384 0 R0', 'SYMATTR InstName C1', 'SYMATTR Value 10p',
      'SYMBOL nm_nobulk 512 0 R0', 'SYMATTR InstName M1', 'FLAG 560 96 0',
      'SYMBOL pm_nobulk 640 0 R0', 'SYMATTR InstName M2',
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
  });
});
