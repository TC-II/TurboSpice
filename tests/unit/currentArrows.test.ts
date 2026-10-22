import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import { Library } from '../../src/library/library.ts';
import { ltNetlist } from '../../src/netlist/ltnetlist.ts';
import { currentArrows } from '../../src/schematic/currentArrows.tsx';

const lib = new Library(buildBundle());

const arrowsOf = (body: string) => {
  const doc = parseAsc(`Version 4\nSHEET 1 880 680\n${body}\n`);
  return currentArrows(doc, lib, ltNetlist(doc, lib).elements);
};

describe('flechas de sentido positivo de corriente', () => {
  it('R: sólo la flecha que entra, por el primer nodo', () => {
    const a = arrowsOf('SYMBOL res 0 0 R0\nSYMATTR InstName R1\nSYMATTR Value 1k');
    expect(a).toEqual([{ at: { x: 16, y: 16 }, inward: { x: 0, y: 1 }, enters: true, sym: 0, pin: 1 }]);
  });

  it('respeta rotación y espejado', () => {
    const r90 = arrowsOf('SYMBOL res 0 0 R90\nSYMATTR InstName R1\nSYMATTR Value 1k');
    // rotado: la pata del pin A queda horizontal, apuntando hacia el pin B
    const [a] = r90;
    expect(r90.length).toBe(1);
    expect(a.enters).toBe(true);
    expect(a.inward.y).toBe(0);
    expect(Math.abs(a.inward.x)).toBe(1);
    const m0 = arrowsOf('SYMBOL npn 0 0 M0\nSYMATTR InstName Q1');
    const base = m0.find((x) => x.at.y === 48 && x.inward.y === 0)!;
    // espejado: la base queda a la derecha y su pata va hacia la izquierda
    expect(base.at.x).toBe(0);
    expect(base.inward.x).toBe(-1);
  });

  it('BJT y MOSFET: todas las corrientes de terminal entran al dispositivo', () => {
    const q = arrowsOf('SYMBOL npn 0 0 R0\nSYMATTR InstName Q1');
    expect(q).toHaveLength(3);
    expect(q.every((x) => x.enters)).toBe(true);
    const m = arrowsOf('SYMBOL nmos4 0 0 R0\nSYMATTR InstName M1');
    expect(m).toHaveLength(4);
    expect(m.every((x) => x.enters)).toBe(true);
    // gate horizontal hacia la derecha; drain hacia abajo; source hacia arriba; bulk hacia la izquierda
    expect(m.map((x) => x.inward)).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: -1, y: 0 },
    ]);
  });

  it('subcircuitos: las corrientes de los puertos entran (como Ix(U1:pin))', () => {
    const doc = parseAsc('Version 4\nSHEET 1 880 680\nSYMBOL TCLib\\Amp_Current 0 0 R0\nSYMATTR InstName X1\n');
    const pins = lib.symbol(doc.symbols[0].type)!.pins.length;
    const a = currentArrows(doc, lib, [{ sym: 0, prefix: 'X' }]);
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(pins);
    expect(a.every((x) => x.enters)).toBe(true);
  });
});
