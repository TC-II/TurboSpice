import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { Library } from '../../src/library/library.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { ltNetlist, ltNetlistText } from '../../src/netlist/ltnetlist.ts';
import { bitNodeName, busBits, busWidth, instArray, isBusName, pinNodes } from '../../src/netlist/bus.ts';
import { ngNodeName, toNgspice } from '../../src/netlist/tongspice.ts';
import { displayName } from '../../src/waveform/series.ts';
import { addSubckt } from '../../src/project/subckt.ts';
import { newProject } from '../../src/project/turbo.ts';
import { portsOf, verilogSymbol } from '../../src/hdl/project.ts';

const lib = new Library(buildBundle());
const lines = (asc: string) => ltNetlistText(ltNetlist(parseAsc(asc), lib)).split('\n');

describe('nombres de bus', () => {
  it('rangos, concatenación y bits sueltos', () => {
    expect(busBits('d[3:0]')).toEqual(['d[3]', 'd[2]', 'd[1]', 'd[0]']);
    expect(busBits('d[0:2]')).toEqual(['d[0]', 'd[1]', 'd[2]']);
    expect(busBits('f[1:0],in')).toEqual(['f[1]', 'f[0]', 'in']);
    expect(busBits('d[3]')).toEqual(['d[3]']);
    expect(isBusName('d[3]')).toBe(false);
    expect(isBusName('a,b')).toBe(true);
    expect(busWidth('out')).toBe(1);
    expect(instArray('R1[2:0]')).toEqual(['R1[2]', 'R1[1]', 'R1[0]']);
    expect(instArray('R1')).toBeNull();
  });
  it('qué bits le tocan a cada copia de un pin', () => {
    const b = ['a[1]', 'a[0]'];
    expect(pinNodes(b, 1, 1, 2)).toEqual(['a[0]']); // un bit por copia
    expect(pinNodes(b, 2, 0, 1)).toEqual(b); // pin de bus
    expect(pinNodes(['0'], 1, 1, 2)).toEqual(['0']); // red simple: a todas
    expect(pinNodes(['a', 'b', 'c'], 1, 0, 2)).toBeNull();
  });
});

// el ejemplo de LTspice: R1[10:0] entre «f[9:0],in» y «f[10:0]», C1[10:0] de f[10:0] a tierra
const LADDER = `Version 4.1
SHEET 1 880 680
WIRE 128 144 80 144
WIRE 272 144 208 144
WIRE 272 208 272 144
WIRE 0 224 -128 224
WIRE -128 256 -128 224
WIRE 272 304 272 272
WIRE -128 400 -128 336
FLAG 272 304 0
FLAG 272 144 f[10:0]
FLAG 80 144 f[9:0],in
FLAG 0 224 in
FLAG -128 400 0
SYMBOL res 224 128 R90
SYMATTR InstName R1[10:0]
SYMATTR Value 100k
SYMBOL cap 256 208 R0
SYMATTR InstName C1[10:0]
SYMATTR Value 1n
SYMBOL voltage -128 240 R0
SYMATTR InstName V1
SYMATTR Value SINE(0 1 10k)
`;

describe('buses en la netlist', () => {
  it('componentes en arreglo: un elemento por bit, en el orden del bus', () => {
    const l = lines(LADDER);
    expect(l.filter((x) => x.startsWith('R1['))).toHaveLength(11);
    expect(l).toContain('R1[10] f[10] f[9] 100k');
    expect(l).toContain('R1[0] f[0] in 100k');
    // la tierra (red simple) va a las 11 copias
    expect(l).toContain('C1[7] f[7] 0 1n');
    expect(l).toContain('V1 in 0 SINE(0 1 10k)');
  });

  it('un bus que no encaja con el arreglo avisa', () => {
    const lt = ltNetlist(parseAsc(LADDER.replace('C1[10:0]', 'C1[2:0]')), lib);
    expect(lt.warnings.join(' ')).toMatch(/C1\[2:0\]/);
  });

  it('un subcircuito con un puerto de bus: el pin es un bus y la instancia lleva un nodo por bit', () => {
    // DUO: d[1:0] → R[1:0] a tierra
    const DUO = `Version 4
SHEET 1 880 680
FLAG 0 0 d[1:0]
IOPIN 0 0 In
FLAG 0 80 0
SYMBOL res -16 -16 R0
SYMATTR InstName R[1:0]
SYMATTR Value 1k
`;
    const p = addSubckt(newProject('P'), 'DUO', DUO);
    const asy = p.files.find((f) => f.name === 'DUO.asy')!.text;
    expect(asy).toContain('PINATTR PinName d[1:0]');
    const [, x, y] = /^PIN (-?\d+) (-?\d+)/m.exec(asy)!;
    lib.setProjectFiles(p.files);
    const l = lines(`Version 4
SHEET 1 880 680
FLAG ${x} ${y} x[1:0]
SYMBOL DUO 0 0 R0
SYMATTR InstName U1
`);
    lib.setProjectFiles([]);
    expect(l).toContain('X§U1 x[1] x[0] DUO ;§pnba d[1])d[0]');
    expect(l).toContain('.subckt DUO d[1] d[0]');
    expect(l).toContain('R[0] d[0] 0 1k');
    // en ngspice los bits van como d__1__ (los corchetes son de XSPICE), adentro y afuera
    lib.setProjectFiles(p.files);
    const ng = toNgspice(ltNetlist(parseAsc(`Version 4
SHEET 1 880 680
FLAG ${x} ${y} x[1:0]
SYMBOL DUO 0 0 R0
SYMATTR InstName U1
`), lib), 't', { resolve: () => undefined }).text;
    lib.setProjectFiles([]);
    expect(ng).toMatch(/^\.subckt DUO d__1__ d__0__$/m);
    expect(ng).toMatch(/ x__1__ x__0__ DUO/);
    expect(ng).not.toMatch(/x\[1\]/);
  });

  it('un subcircuito en arreglo va como X_S__1__: con corchetes, sus elementos XSPICE no encuentran el modelo', () => {
    const ng = toNgspice(ltNetlist(parseAsc(`Version 4
SHEET 1 880 680
FLAG 0 16 a
FLAG 0 96 b[1:0]
FLAG -48 32 c
FLAG -48 80 0
SYMBOL TCLib\\\\switch 0 0 R0
SYMATTR InstName S[1:0]
`), lib), 't', { resolve: () => undefined }).text;
    expect(ng).toMatch(/^X_S__1__ a b__1__ c 0 switch/m);
    expect(ng).toMatch(/^X_S__0__ a b__0__ c 0 switch/m);
    expect(ng).not.toMatch(/X_S\[/);
  });

  it('V(f[3]) busca el vector f__3__ y la lista lo muestra como f[3]', () => {
    expect(ngNodeName('f[3]')).toBe('f__3__');
    expect(ngNodeName('in')).toBe('in');
    expect(bitNodeName('x1.d__2__')).toBe('x1.d[2]');
    expect(displayName({ name: 'f__3__', type: 3, real: new Float64Array() } as never)).toBe('V(f[3])');
  });
});

describe('buses en los módulos Verilog', () => {
  it('el símbolo generado tiene un pin por bus', () => {
    const pins = [
      { name: 'clk', dir: 'in' as const },
      { name: 'q_1', dir: 'out' as const },
      { name: 'q_0', dir: 'out' as const },
    ];
    expect(portsOf(pins).map((p) => p.name)).toEqual(['clk', 'q[1:0]']);
    const asy = verilogSymbol('m', { pins, params: {} });
    expect([...asy.matchAll(/PinName (\S+)/g)].map((m) => m[1])).toEqual(['clk', 'q[1:0]']);
  });
});
