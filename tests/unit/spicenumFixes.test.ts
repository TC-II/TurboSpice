import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import { Library } from '../../src/library/library.ts';
import { ltNetlist } from '../../src/netlist/ltnetlist.ts';
import { parseSpiceNumber, stripAmpereUnit } from '../../src/netlist/spicenum.ts';
import { toNgspice } from '../../src/netlist/tongspice.ts';

const lib = new Library(buildBundle());
const resolver = { resolve: (p: string) => lib.resolveModelFile(p), defines: (m: string) => lib.definesModel(m) };
const gen = (src: string) => toNgspice(ltNetlist(parseAsc(src), lib), 't', resolver);

describe('parseSpiceNumber: "A" son amperes como en LTspice', () => {
  it('1A y 2.5Amps valen 1 y 2.5', () => {
    expect(parseSpiceNumber('1A')).toBe(1);
    expect(parseSpiceNumber('2.5Amps')).toBe(2.5);
    expect(parseSpiceNumber('3mA')).toBe(3e-3);
  });
  it('no rompe Meg, mil, f ni las unidades sueltas', () => {
    expect(parseSpiceNumber('1Meg')).toBe(1e6);
    expect(parseSpiceNumber('2mil')).toBeCloseTo(50.8e-6, 12);
    expect(parseSpiceNumber('5F')).toBeCloseTo(5e-15, 27);
    expect(parseSpiceNumber('1V')).toBe(1);
    expect(parseSpiceNumber('10Hz')).toBe(10);
  });
});

describe('stripAmpereUnit', () => {
  it('saca la unidad de los números con A… sin prefijo', () => {
    expect(stripAmpereUnit('1A')).toBe('1');
    expect(stripAmpereUnit('2.5Amps')).toBe('2.5');
    expect(stripAmpereUnit('-1e-3A')).toBe('-1e-3');
    expect(stripAmpereUnit('PULSE(0 1A 0 1n 1n 1m 2m)')).toBe('PULSE(0 1 0 1n 1n 1m 2m)');
    expect(stripAmpereUnit('DC 1A AC 2A')).toBe('DC 1 AC 2');
  });
  it('no toca mili, modelos, llaves ni attofaradios', () => {
    expect(stripAmpereUnit('1mA')).toBe('1mA');
    expect(stripAmpereUnit('{1A*2}')).toBe('{1A*2}');
    expect(stripAmpereUnit("'1A'")).toBe("'1A'");
    expect(stripAmpereUnit('2N2222 5k')).toBe('2N2222 5k');
    expect(stripAmpereUnit('R5a 1k')).toBe('R5a 1k');
    expect(stripAmpereUnit('10aF')).toBe('10aF');
    expect(stripAmpereUnit('1Meg')).toBe('1Meg');
  });
});

const src = (...lines: string[]) => `Version 4
SHEET 1 880 680
FLAG 0 0 0
${lines.join('\n')}
`;

describe('netlist: el motor no recibe "1A"', () => {
  it('fuente de corriente de valor 1A y PULSE(0 1A …)', () => {
    const t = gen(
      src(
        'SYMBOL current 0 0 R0',
        'SYMATTR InstName I1',
        'SYMATTR Value 1A',
        'SYMBOL current 200 0 R0',
        'SYMATTR InstName I2',
        'SYMATTR Value PULSE(0 1A 0 1n 1n 1m 2m)',
        'SYMBOL res 400 0 R0',
        'SYMATTR InstName R1',
        'SYMATTR Value 1k',
      ),
    ).text;
    expect(t).toMatch(/^I1 \S+ \S+ 1$/m);
    expect(t).toMatch(/^I2 \S+ \S+ PULSE\(0 1 0 1n 1n 1m 2m\)$/m);
    expect(t).not.toMatch(/\b\d+A\b/);
  });
});
