import { describe, expect, it } from 'vitest';
import { streamPlan } from '../../src/engine/ngspice.ts';
import { FULL_SIM_BYTES, MAX_SIM_BYTES, simLimits } from '../../src/sim/estimate.ts';

const net = (body: string) => `* circuito\nV1 in 0 PULSE(0 1 0 1n 1n 1u 2u)\nR1 in out 1k\nC1 out 0 1n\n${body}\n.end`;

describe('transitorio punto a punto (.save none + SendData)', () => {
  it('un .tran con todo guardado: .save none antes de .end y se guardan todos los vectores', () => {
    const p = streamPlan(net('.tran 0 1m\n.save all @r1[i]\n.options savecurrents'));
    expect(p?.keep).toBeNull();
    expect(p?.netlist).toMatch(/\n\.save none\n\.end\n$/);
  });

  it('con sólo las señales elegidas (el .save de TurboSpice: nombres de vectores) guarda ésas y el tiempo', () => {
    const p = streamPlan(net('.tran 0 1m\n.save out v1#branch @r1[i]'));
    expect([...(p?.keep ?? [])].sort()).toEqual(['@r1[i]', 'out', 'time', 'v1#branch']);
  });

  it('no se usa si ngspice necesita sus vectores después de correr, o si no es sólo un transitorio', () => {
    expect(streamPlan(net('.tran 0 1m\n.meas tran vmax MAX v(out)'))).toBeNull();
    expect(streamPlan(net('.tran 0 1m\n.four 1k v(out)'))).toBeNull();
    expect(streamPlan(net('.control\nrun\n.endc'))).toBeNull();
    expect(streamPlan(net('.ac dec 10 1 1k'))).toBeNull();
    expect(streamPlan(net('.tran 0 1m\n.op'))).toBeNull();
    // un .save escrito a mano con v(…): el vector no se llama así
    expect(streamPlan(net('.tran 0 1m\n.save v(out)'))).toBeNull();
  });

  it('un .meas comentado (TurboSpice los evalúa aparte) no lo impide', () => {
    expect(streamPlan(net('.tran 0 1m\n* .meas tran vmax MAX v(out)'))).not.toBeNull();
  });

  it('punto a punto entra el doble', () => {
    expect(simLimits(false)).toEqual({ max: MAX_SIM_BYTES, full: FULL_SIM_BYTES });
    expect(simLimits(true)).toEqual({ max: 2 * MAX_SIM_BYTES, full: 2 * FULL_SIM_BYTES });
  });
});
