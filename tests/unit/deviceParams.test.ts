// Parámetros de dispositivo guardados con .save (@Q1[gm]…) en el visor (#202)
import { describe, expect, it } from 'vitest';
import type { SimPlot } from '../../src/engine/ngspice.ts';
import type { BuiltSimulation } from '../../src/sim/schematicSim.ts';
import { deviceSaves, saveLine } from '../../src/sim/schematicSim.ts';
import { deviceExprUnit, deviceParams, deviceRefs, deviceTraceName, paramUnit, parseDeviceVector, traceDevice } from '../../src/sim/deviceParams.ts';
import { deviceParamTraces, traceResolver, vectorExpr } from '../../src/sim/traces.ts';
import { displayName } from '../../src/waveform/series.ts';
import { evalTrace, parseExpr } from '../../src/waveform/expr.ts';

describe('nombres de vectores @dev[param]', () => {
  it('se separan dispositivo y parámetro', () => {
    expect(parseDeviceVector('@q1[gm]')).toEqual({ device: 'q1', param: 'gm' });
    expect(parseDeviceVector('@q.x_u1.q1[ic]')).toEqual({ device: 'q.x_u1.q1', param: 'ic' });
    expect(parseDeviceVector('v(out)')).toBeNull();
    expect(parseDeviceVector('v1#branch')).toBeNull();
  });

  it('el nombre de adentro de una instancia se escribe como en la traza', () => {
    expect(traceDevice('q.x_u1.q1')).toBe('x_u1.q1');
    expect(traceDevice('r.x_u1.x_u2.r3')).toBe('x_u1.x_u2.r3');
    expect(traceDevice('q1')).toBe('q1');
  });

  it('las corrientes con nombre de LTspice y el resto con la sintaxis de ngspice', () => {
    expect(deviceTraceName('q1', 'ic')).toBe('Ic(Q1)');
    expect(deviceTraceName('r1', 'i')).toBe('I(R1)');
    expect(deviceTraceName('q1', 'gm')).toBe('@Q1[gm]');
    expect(deviceTraceName('m1', 'vdsat')).toBe('@M1[vdsat]');
    expect(deviceTraceName('q.x_u1.q1', 'gm')).toBe('@X_U1.Q1[gm]');
    expect(deviceTraceName('q.x_u1.q1', 'ic')).toBe('Ic(X_U1.Q1)');
    // antes: "Im(Q1)"
    expect(vectorExpr({ name: '@q1[gm]', type: 0, real: new Float64Array() })).toBe('@Q1[gm]');
    expect(displayName({ name: '@q1[gm]', type: 0, real: new Float64Array() })).toBe('@Q1[gm]');
    expect(displayName({ name: '@d1[id]', type: 0, real: new Float64Array() })).toBe('I(D1)');
  });

  it('referencias y unidad de una traza', () => {
    expect(deviceRefs('@Q1[gm]/Ic(Q1)*@x_u1.q1[gpi]')).toEqual([{ device: 'Q1', param: 'gm' }, { device: 'x_u1.q1', param: 'gpi' }]);
    expect(deviceExprUnit('@Q1[gm]')).toBe('S');
    expect(deviceExprUnit('V(out)')).toBeNull();
  });
});

describe('parámetros por tipo de dispositivo', () => {
  it('cada tipo ofrece los de su modelo', () => {
    const names = (d: string) => deviceParams(d).map((p) => p.name);
    expect(names('QN')).toEqual(expect.arrayContaining(['gm', 'gpi', 'go', 'cpi', 'cmu', 'vbe', 'ic']));
    expect(names('q.x_u1.q1')).toContain('gm');
    expect(names('MP')).toEqual(expect.arrayContaining(['gm', 'gds', 'vdsat', 'vth', 'cgs', 'id']));
    expect(names('D')).toEqual(expect.arrayContaining(['id', 'gd', 'cd', 'vd']));
    expect(names('JN')).toEqual(expect.arrayContaining(['gm', 'gds', 'id']));
    expect(names('R')).toEqual(['i', 'p']);
    expect(names('L')).toContain('flux');
    expect(names('X')).toEqual([]);
  });

  it('unidades por el nombre del parámetro', () => {
    expect(['gm', 'gds', 'cpi', 'cgs', 'vbe', 'vdsat', 'ic', 'p', 'qbe', 'flux', 'xyz'].map(paramUnit)).toEqual(['S', 'S', 'F', 'F', 'V', 'V', 'A', 'W', 'C', 'Wb', '']);
  });
});

const sim = {
  lt: {
    elements: [
      { name: 'Q1', prefix: 'QN', sym: 0 },
      { name: 'Q§X1', prefix: 'QN', sym: 1 },
      { name: 'R1', prefix: 'R', sym: 2 },
    ],
    blocks: [],
  },
  ng: { names: new Map([['Q1', 'q1'], ['Q§X1', 'q_x1'], ['R1', 'r1']]) },
} as unknown as BuiltSimulation;

const vec = (name: string, v: number) => ({ name, type: 0, real: Float64Array.of(v, v) });
const plot: SimPlot = {
  name: 'tran1',
  vectors: [{ name: 'time', type: 1, real: Float64Array.of(0, 1) }, vec('@q1[gm]', 0.04), vec('@q_x1[gm]', 0.02), vec('@q.x_u1.q1[gm]', 0.01), vec('@q1[ic]', 1e-3)],
};

describe('graficar parámetros de dispositivo', () => {
  it('@Q1[gm] se parsea como referencia', () => {
    expect(parseExpr('@Q1[gm]')).toEqual({ t: 'ref', fn: '@', args: ['Q1', 'gm'] });
    expect(parseExpr('@Q1[gm]@2')).toEqual({ t: 'ref', fn: '@', args: ['Q1', 'gm'], run: 2 });
  });

  it('se resuelve con el nombre del esquemático, el de adentro de una instancia o el de ngspice', () => {
    const r = traceResolver(sim, plot);
    const ctx = { resolve: r, scale: plot.vectors[0].real, scaleName: 'time' };
    expect(evalTrace('@Q1[gm]', ctx).re[0]).toBe(0.04);
    expect(evalTrace('@QX1[gm]', ctx).re[0]).toBe(0.02);
    expect(evalTrace('@x_u1.q1[gm]', ctx).re[0]).toBe(0.01);
    expect(evalTrace('@q.x_u1.q1[gm]', ctx).re[0]).toBe(0.01);
    expect(evalTrace('Ic(Q1)/@Q1[gm]', ctx).re[0]).toBeCloseTo(0.025);
    expect(() => evalTrace('@Q1[gpi]', ctx)).toThrow(/@Q1\[gpi\]/);
  });

  it('los parámetros que piden las trazas se guardan con .save all', () => {
    expect(deviceSaves(['@Q1[gm]', 'Ic(Q1)/@QX1[GPI]', '@x_u1.q1[gm]', '@q.x_u1.q1[cpi]', 'V(out)'], sim.lt, sim.ng)).toEqual(['@q1[gm]', '@q_x1[gpi]', '@q.x_u1.q1[gm]', '@q.x_u1.q1[cpi]']);
    expect(saveLine('* t\nR1 a 0 1\n.end', [])).toBe('');
    expect(saveLine('* t\nR1 a 0 1\n.end', ['@q1[gm]'])).toBe('.save all @q1[gm]\n');
    // un .save del usuario no deja afuera las tensiones y corrientes
    expect(saveLine('* t\n.save @q1[gm]\n.end', [])).toBe('.save all\n');
    expect(saveLine('* t\n.save none\n.end', [])).toBe('');
  });

  it('la caja de trazas ofrece los parámetros de cada dispositivo', () => {
    const h = deviceParamTraces(sim);
    expect(h.has('@Q1[gm]')).toBe(true);
    expect(h.has('@QX1[cpi]')).toBe(true);
    expect(h.has('@R1[p]')).toBe(true);
    // las corrientes ya se ofrecen como I(…)
    expect(h.has('Ic(Q1)')).toBe(false);
  });
});
