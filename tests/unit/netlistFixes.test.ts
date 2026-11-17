import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import { Library } from '../../src/library/library.ts';
import { ltNetlist } from '../../src/netlist/ltnetlist.ts';
import { prepareSimulation, toNgspice } from '../../src/netlist/tongspice.ts';

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
