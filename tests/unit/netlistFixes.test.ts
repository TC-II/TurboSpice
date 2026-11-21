import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import { Library } from '../../src/library/library.ts';
import { ltNetlist } from '../../src/netlist/ltnetlist.ts';
import { prepareSimulation, pulseEdges, toNgspice } from '../../src/netlist/tongspice.ts';

const lib = new Library(buildBundle());
const resolver = { resolve: (p: string) => lib.resolveModelFile(p), defines: (m: string) => lib.definesModel(m) };
const gen = (src: string) => toNgspice(ltNetlist(parseAsc(src), lib), 't', resolver);

// (NL = barra + n literal, como separa las líneas el .asc)
const NL = '\\n';
const lcAsc = (...lines: string[]) => `Version 4
SHEET 1 880 680
FLAG 0 0 0
SYMBOL voltage 0 0 R0
SYMATTR InstName V1
SYMATTR Value 5
SYMBOL ind 200 16 R0
SYMATTR InstName L1
SYMATTR Value 1m
TEXT 0 200 Left 2 !${lines.join(NL)}
`;

describe('directivas con \\n literal en un mismo texto', () => {
  it('.ic I(L1) y .tran uic en el mismo texto: IC= limpio y sin .tran adentro', () => {
    const t = gen(lcAsc('.ic I(L1)=1', '.tran 1m uic')).text;
    expect(t).toMatch(/^L1 \S+ \S+ 1m ic=1$/m);
  });
  it('.param antes del .ic: la corriente inicial no se pierde', () => {
    const t = gen(lcAsc('.param a=1', '.ic I(L1)=1', '.tran 1m uic')).text;
    expect(t).toMatch(/^L1 \S+ \S+ 1m ic=1$/m);
  });
  it('.tran startup tras otra directiva aplica la rampa', () => {
    const t = gen(lcAsc('.param a=1', '.tran 1m startup')).text;
    expect(t).toMatch(/^V1 \S+ \S+ DC 5 PWL\(0 0 20u 5\)$/m);
  });
});

describe('diodo ideal: los nombres de ngspice siguen al elemento', () => {
  it('D1 pasa a BD1 también en ng.names (I(D1) busca @bd1[i])', () => {
    const asc = `Version 4
SHEET 1 880 680
FLAG 0 0 0
SYMBOL diode 0 0 R0
SYMATTR InstName D1
SYMATTR Value di
TEXT 0 200 Left 2 !.model di D(Ron=1 Vfwd=0.5)
`;
    const ng = toNgspice(ltNetlist(parseAsc(asc), lib), 't', resolver);
    const prep = prepareSimulation(ng, () => '');
    expect(prep.netlist).toMatch(/^BD1 /m);
    expect(ng.names.get('D1')).toBe('BD1');
  });
});

describe('nombres de instancia que parten la línea', () => {
  const named = (name: string) => `Version 4
SHEET 1 880 680
FLAG 0 0 0
SYMBOL res 0 0 R0
SYMATTR InstName ${name}
SYMATTR Value 1k
`;
  it('"R 1" y "R(2)" se informan; "R1" no', () => {
    expect(gen(named('R 1')).invalidNames).toEqual(['R 1']);
    expect(gen(named('R(2)')).invalidNames).toEqual(['R(2)']);
    expect(gen(named('R1')).invalidNames).toEqual([]);
  });
});

describe('PULSE con flancos en 0 (ngspice usaría TSTEP)', () => {
  it('flancos en 0 → 1/1000 de la fase más corta', () => {
    expect(pulseEdges('PULSE(0 5 0 0 0 500u 1m)')).toBe('PULSE(0 5 0 5e-7 5e-7 500u 1m)');
    expect(pulseEdges('PULSE(0 5 0.2m 0 0 454.545454545u 909.090909091u)')).toBe('PULSE(0 5 0.2m 4.54545454545e-7 4.54545454545e-7 454.545454545u 909.090909091u)');
    // sólo el que vale 0; el tiempo en bajo descuenta los flancos dados
    expect(pulseEdges('PULSE(0 1 0 1u 0 5m 10m)')).toBe('PULSE(0 1 0 1u 0.000004999 5m 10m)');
  });
  it('flancos dados, parámetros o sin PW: no cambia', () => {
    for (const v of ['PULSE(0 1 0 1n 1n 5u 10u)', 'PULSE(0 {V} 0 0 0 {ton} {tp})', 'PULSE(0 1 0 0 0)', 'PULSE(0 1)', '5', 'SINE(0 1 1k)']) expect(pulseEdges(v)).toBe(v);
  });
  it('en la netlist: .tran 0 300m no le da 300 µs de flanco a una cuadrada de 1 ms', () => {
    const t = gen(
      [
        'Version 4',
        'SHEET 1 880 680',
        'FLAG 0 64 0',
        'FLAG 0 -16 a',
        'SYMBOL voltage 0 -32 R0',
        'SYMATTR InstName V1',
        'SYMATTR Value PULSE(0 5 0 0 0 500u 1m)',
        'SYMBOL res 96 -32 R0',
        'SYMATTR InstName R1',
        'SYMATTR Value 1k',
        'TEXT 0 120 Left 2 !.tran 0 300m 0 1u',
        '',
      ].join('\n'),
    ).text;
    expect(t).toMatch(/^\.tran 0\.0003 300m 0 1u$/m);
    expect(t).toContain('PULSE(0 5 0 5e-7 5e-7 500u 1m)');
  });
});

describe('IC= de un capacitor a tierra sin uic', () => {
  const capAsc = (rot: string, value: string, tran: string) =>
    [
      'Version 4',
      'SHEET 1 880 680',
      'FLAG 0 0 a',
      'FLAG 0 64 0',
      `SYMBOL cap -16 0 ${rot}`,
      'SYMATTR InstName C1',
      `SYMATTR Value ${value}`,
      'SYMATTR SpiceLine IC=2.5',
      `TEXT 0 120 Left 2 !${tran}`,
      '',
    ].join('\n');
  it('.ic y además una fuente B que lo sostiene si el .op no converge (transient op)', () => {
    const t = gen(capAsc('R0', '1', '.tran 0 300m 0 1u')).text;
    expect(t).toMatch(/^\.ic V\(a\)=2\.5$/m);
    // con 1 F la ganancia sube para que τ = C/G sea de 100 ns
    expect(t).toMatch(/^B__C1_ic a 0 I=\(time > 0\) \? 0 : 10000000\*\(V\(a\)-\(2\.5\)\)$/m);
    expect(gen(capAsc('R0', '1n', '.tran 1m')).text).toMatch(/^B__C1_ic a 0 I=\(time > 0\) \? 0 : 1e6\*\(V\(a\)-\(2\.5\)\)$/m);
  });
  it('con uic no hace falta (ngspice usa el IC= del capacitor)', () => {
    expect(gen(capAsc('R0', '1n', '.tran 1m uic')).text).not.toMatch(/B__C1_ic/);
  });
});
