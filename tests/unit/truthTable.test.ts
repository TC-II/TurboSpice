import { describe, expect, it } from 'vitest';
import { parseTruthTable, truthTableTb } from '../../src/hdl/truthTable.ts';

// como los declara el módulo: module m(input [1:0] sel, input en, inout io, output y, output [2:0] q)
const PORTS = [
  { name: 'sel', dir: 'in' as const, bits: 2 },
  { name: 'en', dir: 'in' as const, bits: 1 },
  { name: 'io', dir: 'inout' as const, bits: 1 },
  { name: 'Y', dir: 'out' as const, bits: 1 },
  { name: 'q', dir: 'out' as const, bits: 3 },
];

describe('tabla de verdad', () => {
  it('el testbench: la primera entrada en los bits altos, las 2^n combinaciones, sin el inout', () => {
    const tb = truthTableTb('m', PORTS)!;
    expect(tb).toContain('reg [2:0] i;');
    expect(tb).toContain('wire [3:0] o;');
    expect(tb).toContain('m u (.sel(i[2:1]), .en(i[0]), .Y(o[3]), .q(o[2:0]));');
    expect(tb).toContain('for (k = 0; k < 8; k = k + 1) begin');
  });
  it('sin entradas o sin salidas, o con más de 10 bits de entrada: nada', () => {
    expect(
      truthTableTb(
        'm',
        PORTS.filter((p) => p.dir !== 'in'),
      ),
    ).toBeNull();
    expect(
      truthTableTb(
        'm',
        PORTS.filter((p) => p.dir !== 'out'),
      ),
    ).toBeNull();
    expect(truthTableTb('m', [{ name: 'a', dir: 'in', bits: 11 }, PORTS[3]])).toBeNull();
  });
  it('la tabla: cada fila, partida por puerto (con x y z)', () => {
    const t = parseTruthTable(['VCD info: …', 'TT 000 1010', 'TT 011 0xz1', '$finish called'], PORTS);
    expect(t.inputs.map((p) => p.name)).toEqual(['sel', 'en']);
    expect(t.outputs.map((p) => p.name)).toEqual(['Y', 'q']);
    expect(t.rows).toEqual([
      ['00', '0', '1', '010'],
      ['01', '1', '0', 'xz1'],
    ]);
  });
});
