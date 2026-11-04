import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { Library } from '../../src/library/library.ts';

describe('símbolos de la biblioteca que un subcircuito taparía', () => {
  it('reconoce los de la app (sin mayúsculas) y no los del proyecto', () => {
    const lib = new Library(buildBundle());
    expect(lib.hasLibrarySymbol('res')).toBe(true);
    expect(lib.hasLibrarySymbol('RES')).toBe(true);
    expect(lib.hasLibrarySymbol('mi_filtro')).toBe(false);
    // un símbolo del proyecto no cuenta: renombrar o crear el propio no choca consigo mismo
    lib.setProjectFiles([{ name: 'mi_filtro.asy', kind: 'symbol', text: 'Version 4\nSymbolType BLOCK\n' }]);
    expect(lib.hasLibrarySymbol('mi_filtro')).toBe(false);
  });
});
