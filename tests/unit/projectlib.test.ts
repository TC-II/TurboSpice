import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { Library } from '../../src/library/library.ts';

const lib = new Library(buildBundle());
const asy = (pins: number) => `Version 4\nSymbolType BLOCK\nRECTANGLE Normal -32 -32 32 32\n${Array.from({ length: pins }, (_, i) => `PIN -32 ${i * 16} LEFT 8\nPINATTR PinName p${i}\nPINATTR SpiceOrder ${i + 1}`).join('\n')}\n`;

describe('archivos del proyecto en la librería (#155)', () => {
  it('ganan a los del usuario y a la librería, y se van al abrir otro proyecto', () => {
    lib.addSymbol('res', asy(1));
    lib.setProjectFiles([{ name: 'res.asy', kind: 'symbol', text: asy(3) }, { name: 'opamp.lib', kind: 'model', text: '.subckt mio a b\n.ends\n' }]);
    expect(lib.symbol('res')?.pins).toHaveLength(3);
    expect(lib.resolveModelFile('C:\\x\\opamp.lib')).toBe('project/opamp.lib');
    expect(lib.userFile('project/opamp.lib')).toContain('.subckt mio');
    expect(lib.definesModel('mio')).toBe(true);
    expect(lib.symbolPaths()).toContain('Proyecto/res');
    lib.setProjectFiles([]);
    expect(lib.symbol('res')?.pins).toHaveLength(1);
    expect(lib.definesModel('mio')).toBe(false);
    lib.removeSymbol('res');
  });
});
