import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { Library } from '../../src/library/library.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { addSubckt } from '../../src/project/subckt.ts';
import { newProject } from '../../src/project/turbo.ts';
import { buildSimulation } from '../../src/sim/schematicSim.ts';
import { blockInstances, hierDevice, instScope, scopeNet } from '../../src/sim/context.ts';
import { biasParams, elementBias, scopedNetBias } from '../../src/sim/bias.ts';
import { probeExpr, traceResolver } from '../../src/sim/traces.ts';

const lib = new Library(buildBundle());

// R1 de in a una red interna, R2 de ahí a out; V1 adentro para tener una rama
const BUF = `Version 4
SHEET 1 880 680
WIRE -128 0 -96 0
WIRE 96 0 128 0
FLAG -128 0 in
IOPIN -128 0 In
FLAG 128 0 out
IOPIN 128 0 Out
SYMBOL res -96 16 R270
SYMATTR InstName R1
SYMATTR Value 1k
SYMBOL res 16 16 R270
SYMATTR InstName R2
SYMATTR Value 1k
SYMBOL npn 300 0 R0
SYMATTR InstName Q1
`;

const TB = `Version 4
SHEET 1 880 680
FLAG -128 0 a
FLAG 128 0 0
SYMBOL BUF 0 0 R0
SYMATTR InstName U1
TEXT 0 100 Left 2 !.op
`;

const build = async () => {
  const p = addSubckt(newProject('P'), 'BUF', BUF);
  lib.setProjectFiles(p.files);
  try {
    return await buildSimulation(parseAsc(TB), lib, 't');
  } finally {
    lib.setProjectFiles([]);
  }
};

describe('valores en contexto adentro de una instancia (#199)', () => {
  it('nombres de ngspice de los dispositivos de adentro', () => {
    expect(hierDevice('x_u1.r1')).toBe('r.x_u1.r1');
    expect(hierDevice('x_u1.x_u2.q3')).toBe('q.x_u1.x_u2.q3');
    expect(hierDevice('r1')).toBeNull();
  });

  it('la punta de prueba mide corrientes y tensiones de la instancia', async () => {
    const built = await build();
    const inst = blockInstances(built);
    expect(inst.map((i) => i.prefix)).toEqual(['x_u1.']);
    const sc = instScope(built, 'BUF', inst[0].prefix, new Map([['in', 'a'], ['out', '0']]))!;
    expect(sc).toBeTruthy();
    const r1 = sc.block.lt.elements.find((e) => e.name === 'R1')!;
    expect(probeExpr(built, { symbol: r1.sym }, sc)).toBe('I(x_u1.r1)');
    const q1 = sc.block.lt.elements.find((e) => e.name === 'Q1')!;
    expect(probeExpr(built, { symbol: q1.sym }, sc)).toBe('Ic(x_u1.q1)');
    expect(probeExpr(built, { symbol: q1.sym, pin: 2 }, sc)).toBe('Ib(x_u1.q1)');
    // los puertos son las redes de arriba; las internas llevan el prefijo
    expect(probeExpr(built, { net: 'in' }, sc)).toBe('V(a)');
    expect(probeExpr(built, { net: 'out' }, sc)).toBeNull();
    expect(scopeNet(sc, r1.nodes[1]).toLowerCase()).toBe(`x_u1.${r1.nodes[1].toLowerCase()}`);
    // el resolver encuentra los vectores de savecurrents
    const plot = { name: 'op1', vectors: [{ name: '@r.x_u1.r1[i]', type: 0, real: new Float64Array([2e-3]) }, { name: '@q.x_u1.q1[ib]', type: 0, real: new Float64Array([1e-6]) }] };
    const res = traceResolver(built, plot as never);
    expect(res('I', ['x_u1.r1'])?.re[0]).toBe(2e-3);
    expect(res('Ib', ['x_u1.q1'])?.re[0]).toBe(1e-6);
  });

  it('punto de operación: parámetros pedidos y anotación de la instancia', async () => {
    const built = await build();
    const params = biasParams(built);
    expect(params).toContain('@q.x_u1.q1[gm]');
    expect(params).toContain('@r.x_u1.r1[p]');
    const sc = instScope(built, 'BUF', 'x_u1.', new Map([['in', 'a']]))!;
    const r1 = sc.block.lt.elements.find((e) => e.name === 'R1')!;
    const inner = r1.nodes[1];
    const bias = { '@r.x_u1.r1[i]': 1e-3, a: 2, [`x_u1.${r1.nodes[0].toLowerCase()}`]: 2, [`x_u1.${inner.toLowerCase()}`]: 1 };
    const b = elementBias(built, bias, r1, sc)!;
    expect(b.title).toBe('x_u1.R1');
    expect(b.short).toBe('1mA');
    expect(b.lines).toContain('V = 1V');
    expect(scopedNetBias(bias, sc, inner)?.short).toBe('1V');
    expect(scopedNetBias(bias, sc, 'in')?.short).toBe('2V');
  });
});
