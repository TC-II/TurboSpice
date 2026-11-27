import { describe, expect, it } from 'vitest';
import type { Element } from '../../src/netlist/ltnetlist.ts';
import { setupHoldProblems, type Wave } from '../../src/sim/setupHold.ts';

// un 74HC74 (U1) con D en la red d y el reloj en clk: flanco de subida en 100 ns (cruza 2,5 V)
const ff: Element = {
  sym: 0,
  name: 'XU1',
  prefix: 'X',
  nodes: ['d', 'clk', 'p', 'c', 'q', 'qn'],
  pinNames: ['d', 'clk', 'pre_n', 'clr_n', 'q', 'q_n'],
  value: 'hc74',
  attrs: new Map([
    ['SetupHold', 'D CLK 20n 3n'],
    ['SpiceLine', 'vcc=5 vil={0.3*vcc} vih={0.7*vcc}'],
  ]),
};
const n = 1e-9;
const clk: Wave = { x: Float64Array.of(0, 99 * n, 101 * n, 300 * n), y: Float64Array.of(0, 0, 5, 5), digital: false };
/** D, una tensión que sube de 0 a 5 V en 2 ns alrededor de `at` (ns) */
const d = (at: number): Wave => ({ x: Float64Array.of(0, (at - 1) * n, (at + 1) * n, 300 * n), y: Float64Array.of(0, 0, 5, 5), digital: false });
const run = (data: Wave) => setupHoldProblems([ff], (net) => (net === 'clk' ? clk : net === 'd' ? data : null));

describe('setup y hold', () => {
  it('D cambia 5 ns antes del flanco: no cumple el setup de 20 ns', () => {
    expect(run(d(95))).toEqual(['U1: D cambia 5ns antes del flanco de reloj en 100ns (setup 20ns); 1 en total']);
  });
  it('D cambia 1 ns después del flanco: no cumple el hold de 3 ns', () => {
    expect(run(d(101))).toEqual(['U1: D cambia 1ns después del flanco de reloj en 100ns (hold 3ns); 1 en total']);
  });
  it('con tiempo de sobra, nada; y una red digital cambia en el instante del evento', () => {
    expect(run(d(50))).toEqual([]);
    expect(run(d(150))).toEqual([]);
    expect(run({ x: Float64Array.of(0, 90 * n), y: Float64Array.of(0, 1), digital: true })).toEqual(['U1: D cambia 10ns antes del flanco de reloj en 100ns (setup 20ns); 1 en total']);
  });
  it('sin el atributo, o sin las señales guardadas, nada', () => {
    expect(setupHoldProblems([{ ...ff, attrs: new Map() }], () => clk)).toEqual([]);
    expect(setupHoldProblems([ff], () => null)).toEqual([]);
  });
});
