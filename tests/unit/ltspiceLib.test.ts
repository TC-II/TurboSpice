import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import { Library } from '../../src/library/library.ts';
import { libRelative } from '../../src/library/ltspiceLib.ts';
import { ltNetlist } from '../../src/netlist/ltnetlist.ts';
import { toNgspice } from '../../src/netlist/tongspice.ts';

// Símbolo y modelo inventados con la forma de los de ADI: SpiceModel es el archivo, Value el subcircuito
const ASY = `Version 4
SymbolType CELL
LINE Normal -32 32 32 64
SYMATTR Value XAMP1
SYMATTR Prefix X
SYMATTR SpiceModel XLT.lib
PIN -32 48 NONE 0
PINATTR PinName In-
PINATTR SpiceOrder 1
PIN -32 80 NONE 0
PINATTR PinName In+
PINATTR SpiceOrder 2
PIN 32 64 NONE 0
PINATTR PinName OUT
PINATTR SpiceOrder 3
`;
const LIB = `.subckt XAMP1 a b c
E1 c 0 b a 1e5
.ends XAMP1
`;
const ASC = `Version 4
SHEET 1 880 680
SYMBOL OpAmps\\\\XAMP1 0 0 R0
SYMATTR InstName U1
TEXT 0 200 Left 2 !.op
`;

const fresh = () => new Library(buildBundle());
const ng = (lib: Library) =>
  toNgspice(ltNetlist(parseAsc(ASC), lib), 't', {
    resolve: (p) => lib.resolveModelFile(p),
    defines: (m) => lib.definesModel(m),
    ltspiceFile: (m) => (lib.definesModel(m, false) ? undefined : lib.ltspiceFileDefining(m)),
  });

describe('librería de LTspice del usuario', () => {
  it('reconoce las rutas desde lib/ de la carpeta elegida', () => {
    expect(libRelative('lib/sym/OpAmps/LT1001.asy')).toBe('sym/OpAmps/LT1001.asy');
    expect(libRelative('LTspice/lib/sub/LTC.lib')).toBe('sub/LTC.lib');
    expect(libRelative('sym/res.asy')).toBe('sym/res.asy');
    expect(libRelative('lib/examples/x.asc')).toBeNull();
  });

  it('sus símbolos se usan sólo si la librería propia no los tiene', () => {
    const lib = fresh();
    expect(lib.symbol('OpAmps\\XAMP1')).toBeUndefined();
    lib.addLtspiceSymbol('OpAmps/XAMP1', ASY);
    expect(lib.symbol('OpAmps\\XAMP1')?.pins).toHaveLength(3);
    expect(lib.symbol('XAMP1')?.pins).toHaveLength(3);
    // res es de TurboSpice: gana a uno de LTspice con el mismo nombre
    lib.addLtspiceSymbol('res', ASY);
    expect(lib.symbol('res')?.pins).toHaveLength(2);
  });

  it('sus archivos de modelos se resuelven después de los propios y se incluyen solos', () => {
    const lib = fresh();
    lib.addLtspiceSymbol('OpAmps/XAMP1', ASY);
    lib.addLtspiceModelFile('XLT.lib', LIB);
    expect(lib.resolveModelFile('XLT.lib')).toBe('ltspice/xlt.lib');
    expect(lib.userFile('ltspice/xlt.lib')).toBe(LIB);
    const r = ng(lib);
    expect(r.text).toMatch(/^X_?U1 .* XAMP1$/m);
    expect(r.includes).toContain('ltspice/xlt.lib');
    // SpiceModel es el archivo: el modelo que se busca es Value (XAMP1), no "XLT.lib"
    expect(r.warnings.join('\n')).not.toMatch(/no se encontró el modelo/);
  });

  it('sin la librería de LTspice avisa que falta el modelo (Value, no el archivo de SpiceModel)', () => {
    const lib = fresh();
    lib.addSymbol('XAMP1', ASY);
    expect(ng(lib).warnings.join('\n')).toMatch(/no se encontró el modelo "XAMP1"/);
  });
});
