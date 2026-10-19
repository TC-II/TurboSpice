// Corrientes de la punta de prueba en componentes de varios pines (#53)
import { describe, expect, it } from 'vitest';
import type { SimPlot } from '../../src/engine/ngspice.ts';
import type { BuiltSimulation } from '../../src/sim/schematicSim.ts';
import { multiPinPrefix, probeExpr, traceResolver } from '../../src/sim/traces.ts';

const sim = {
  lt: {
    elements: [
      { name: 'M1', prefix: 'MN', sym: 0 },
      { name: 'Q1', prefix: 'QN', sym: 1 },
      { name: 'R1', prefix: 'R', sym: 2 },
    ],
  },
  ng: { names: new Map([['M1', 'm1'], ['Q1', 'q1'], ['R1', 'r1']]) },
} as unknown as BuiltSimulation;

const vec = (name: string, v: number) => ({ name, type: 0, real: Float64Array.of(v, v) });
const plot: SimPlot = {
  name: 'tran1',
  vectors: [
    { name: 'time', type: 1, real: Float64Array.of(0, 1) },
    vec('@m1[id]', 1),
    vec('@m1[ig]', 2),
    vec('@m1[is]', -1),
    vec('@m1[ib]', 3),
    vec('@q1[ic]', 4),
    vec('@q1[ib]', 5),
    vec('@q1[ie]', 6),
    vec('@r1[i]', 7),
  ],
};

describe('punta de prueba en transistores', () => {
  it('cada pin mide su corriente (orden SpiceOrder: D G S B, C B E)', () => {
    expect([1, 2, 3, 4].map((pin) => probeExpr(sim, { symbol: 0, pin }))).toEqual(['Id(M1)', 'Ig(M1)', 'Is(M1)', 'Ib(M1)']);
    expect([1, 2, 3].map((pin) => probeExpr(sim, { symbol: 1, pin }))).toEqual(['Ic(Q1)', 'Ib(Q1)', 'Ie(Q1)']);
    expect(probeExpr(sim, { symbol: 2 })).toBe('I(R1)');
  });

  it('Id, Ig, Ic… se resuelven con las corrientes que guarda ngspice', () => {
    const r = traceResolver(sim, plot);
    const at = (fn: string, el: string) => r(fn, [el])?.re[0];
    expect([at('Id', 'M1'), at('Ig', 'M1'), at('Is', 'M1'), at('Ib', 'M1')]).toEqual([1, 2, -1, 3]);
    expect([at('Ic', 'Q1'), at('Ib', 'Q1'), at('Ie', 'Q1')]).toEqual([4, 5, 6]);
    expect(at('I', 'R1')).toBe(7);
  });

  it('sólo MOS, BJT y JFET son de varios pines', () => {
    expect(['MN', 'MP', 'QN', 'QP', 'JN', 'JP'].every(multiPinPrefix)).toBe(true);
    expect(['R', 'C', 'L', 'D', 'V', 'X'].some(multiPinPrefix)).toBe(false);
  });
});
