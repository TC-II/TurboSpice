import { describe, expect, it } from 'vitest';
import type { SimPlot } from '../../src/engine/ngspice.ts';
import { evalMeasures, parseMeas, type MeasDef, type MeasValue } from '../../src/sim/meas.ts';

// transitorio: escalón RC (τ = 1 ms) y una senoidal de 1 kHz
const N = 20001;
const t = Float64Array.from({ length: N }, (_, k) => k * 1e-6); // 0..20 ms
const tran: SimPlot = {
  name: 'tran1',
  vectors: [
    { name: 'time', type: 1, real: t },
    { name: 'out', type: 3, real: t.map((x) => 1 - Math.exp(-x / 1e-3)) },
    { name: 'in', type: 3, real: t.map(() => 1) },
    { name: 's', type: 3, real: t.map((x) => 2 * Math.sin(2 * Math.PI * 1000 * x)) },
  ],
};
// AC: pasabajos de 1er orden con fc = 1 kHz
const f = Float64Array.from({ length: 401 }, (_, k) => 10 ** (k / 100));
const h = (x: number) => ({ re: 1 / (1 + (x / 1000) ** 2), im: -(x / 1000) / (1 + (x / 1000) ** 2) });
const ac: SimPlot = {
  name: 'ac1',
  vectors: [
    { name: 'frequency', type: 2, real: f },
    { name: 'out', type: 3, real: f.map((x) => h(x).re), imag: f.map((x) => h(x).im) },
  ],
};
const resolve = (p: SimPlot) => (fn: string, args: string[]) => {
  const v = p.vectors.find((x) => x.name === args[0].toLowerCase());
  return fn.toUpperCase() === 'V' && v ? { re: v.real, ...(v.imag ? { im: v.imag } : {}) } : null;
};
const run = (lines: string[], p: SimPlot) => evalMeasures(lines.map((l) => parseMeas(l) as MeasDef), p, resolve(p));
const val = (m: Map<string, unknown>, k: string) => (m.get(k) as MeasValue).value;

describe('.meas', () => {
  it('parsea las formas de LTspice', () => {
    expect(parseMeas('.meas TRAN tr TRIG V(out) VAL=0.1 RISE=1 TARG V(out) VAL=0.9 RISE=1')).toMatchObject({
      name: 'tr',
      analysis: 'tran',
      kind: 'trigtarg',
      trig: { lhs: 'V(out)', rhs: '0.1', edge: 'rise', n: 1 },
      targ: { lhs: 'V(out)', rhs: '0.9', edge: 'rise', n: 1 },
    });
    expect(parseMeas('.meas ac f3db WHEN mag(V(out))=0.707 FALL=last')).toMatchObject({ kind: 'when', when: { lhs: 'mag(V(out))', rhs: '0.707', edge: 'fall', n: 'last' } });
    expect(parseMeas('.measure tran vrms RMS V(s) FROM=5m TO=15m')).toMatchObject({ kind: 'rms', expr: 'V(s)', from: '5m', to: '15m' });
    expect(parseMeas('.meas tran x FIND V(out) AT 2m')).toMatchObject({ kind: 'find', at: '2m' });
    expect(parseMeas('.meas tran r PARAM {vmax/2}')).toMatchObject({ kind: 'param', expr: 'vmax/2' });
    expect(typeof parseMeas('.meas tran x FIND V(out)')).toBe('string');
  });

  it('transitorio: subida 10-90 %, valores, agregados, PARAM', () => {
    const m = run(
      [
        '.meas tran tr TRIG V(out) VAL=0.1 RISE=1 TARG V(out) VAL=0.9 RISE=1',
        '.meas tran v1 FIND V(out) AT=1m',
        '.meas tran t50 WHEN V(out)=0.5',
        '.meas tran vmax MAX V(out)',
        '.meas tran vrms RMS V(s) FROM=5m TO=15m',
        '.meas tran vpp PP V(s)',
        '.meas tran vavg AVG V(s) FROM=0 TO=0.5m',
        '.meas tran half PARAM vmax/2',
        '.meas tran per TRIG V(s) VAL=0 RISE=2 TARG V(s) VAL=0 RISE=3',
        '.meas ac g FIND V(out) AT=1k',
      ],
      tran,
    );
    expect(val(m, 'tr')).toBeCloseTo(1e-3 * Math.log(9), 6); // 2.197 ms
    expect(val(m, 'v1')).toBeCloseTo(1 - Math.exp(-1), 5);
    expect(val(m, 't50')).toBeCloseTo(1e-3 * Math.log(2), 6);
    expect(val(m, 'vmax')).toBeCloseTo(1 - Math.exp(-20), 6);
    expect(val(m, 'vrms')).toBeCloseTo(Math.SQRT2, 4);
    expect(val(m, 'vpp')).toBeCloseTo(4, 4);
    expect(val(m, 'vavg')).toBeCloseTo(4 / Math.PI, 3); // media de medio ciclo: 2A/π
    expect(val(m, 'half')).toBeCloseTo(val(m, 'vmax') / 2, 9);
    expect(val(m, 'per')).toBeCloseTo(1e-3, 6);
    expect(m.has('g')).toBe(false); // .meas ac no se aplica al transitorio
  });

  it('AC: f a −3 dB y valor complejo', () => {
    const m = run(['.meas ac g FIND V(out) AT=1k', '.meas ac f3db WHEN mag(V(out))=0.7071 FALL=1', '.meas ac gdb FIND db(V(out)) AT=1k'], ac);
    const g = m.get('g') as MeasValue;
    expect(g.value).toBeCloseTo(0.5, 6);
    expect(g.im).toBeCloseTo(-0.5, 6);
    expect(val(m, 'f3db')).toBeCloseTo(1000, -1);
    expect(val(m, 'gdb')).toBeCloseTo(-3.0103, 3);
  });

  it('errores por medición, sin cortar las demás', () => {
    const m = run(['.meas tran a WHEN V(out)=5', '.meas tran b MAX V(nada)', '.meas tran c MAX V(out)'], tran);
    expect(m.get('a')).toEqual({ error: 'la condición WHEN no se cumple' });
    expect((m.get('b') as { error: string }).error).toMatch(/no existe/);
    expect(val(m, 'c')).toBeGreaterThan(0.99);
  });
});
