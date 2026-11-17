// Recargar la librería de LTspice con un .asy modificado devuelve el símbolo nuevo
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { Library } from '../../src/library/library.ts';

const asy = (pins: number) =>
  `Version 4\nSymbolType CELL\nLINE Normal 0 0 32 32\n${Array.from({ length: pins }, (_, i) => `PIN ${16 * i} 0 NONE 0\nPINATTR PinName p${i}\nPINATTR SpiceOrder ${i + 1}`).join('\n')}\n`;

describe('addLtspiceSymbol', () => {
  it('un .asy recargado con otro contenido no devuelve el viejo (por ruta ni por nombre)', () => {
    const lib = new Library(buildBundle());
    lib.addLtspiceSymbol('Misc/zzchip', asy(2));
    expect(lib.symbol('Misc/zzchip')?.pins).toHaveLength(2);
    expect(lib.symbol('zzchip')?.pins).toHaveLength(2);
    lib.addLtspiceSymbol('Misc/zzchip', asy(3));
    expect(lib.symbol('Misc/zzchip')?.pins).toHaveLength(3);
    expect(lib.symbol('zzchip')?.pins).toHaveLength(3);
  });
});
