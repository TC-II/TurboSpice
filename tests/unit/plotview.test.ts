import { describe, expect, it } from 'vitest';
import { bandwidth3dB, nearestIndex, stats, stepPoint, toCsv, valueAt } from '../../src/waveform/measure.ts';
import { controlPlots, parsePlt, serializePlt } from '../../src/waveform/view.ts';

describe('medidas', () => {
  it('seno: pico a pico, eficaz, frecuencia', () => {
    const xs = Float64Array.from({ length: 4001 }, (_, k) => k * 1e-6);
    const ys = xs.map((t) => 1 + 2 * Math.sin(2 * Math.PI * 1000 * t));
    const s = stats(xs, ys)!;
    expect(s.pp).toBeCloseTo(4, 3);
    expect(s.avg).toBeCloseTo(1, 3);
    expect(s.rms).toBeCloseTo(Math.sqrt(1 + 2), 3);
    expect(s.freq).toBeCloseTo(1000, 0);
    expect(valueAt(xs, ys, 0.25e-3)).toBeCloseTo(3, 3);
    expect(stats(xs, ys, 0, 0.25e-3)!.max).toBeCloseTo(3, 3);
  });

  it('ancho de banda a -3 dB', () => {
    const f = Float64Array.from({ length: 301 }, (_, k) => 10 ** (k / 50));
    const db = f.map((x) => 20 * Math.log10(1 / Math.hypot(1, x / 1000)));
    const bw = bandwidth3dB(f, db);
    expect(bw.high).toBeGreaterThan(990);
    expect(bw.high).toBeLessThan(1010);
    expect(bw.low).toBeNaN();
  });

  it('cursores: punto más cercano y paso a paso', () => {
    const xs = [0, 1, 2, 4, 8];
    expect(nearestIndex(xs, -1)).toBe(0);
    expect(nearestIndex(xs, 2.9)).toBe(2);
    expect(nearestIndex(xs, 3.1)).toBe(3);
    expect(nearestIndex(xs, 9)).toBe(4);
    expect(stepPoint(xs, 2, 1)).toBe(4);
    expect(stepPoint(xs, 2, -1)).toBe(1);
    expect(stepPoint(xs, 2.5, 1)).toBe(4);
    expect(stepPoint(xs, 2.5, -1)).toBe(2);
    expect(stepPoint(xs, 3.5, -1)).toBe(2);
    expect(stepPoint(xs, 1, 10)).toBe(8);
    expect(stepPoint(xs, 1, -10)).toBe(0);
  });

  it('CSV', () => {
    expect(toCsv('time', [0, 1], [{ name: 'V(a,b)', ys: [1, null] }])).toBe('time,"V(a,b)"\n0,1\n1,\n');
  });
});

describe('vista de ploteo', () => {
  it('plot en .control: un panel por línea', () => {
    expect(controlPlots('run\nplot v(out) in xlimit 0 1m\nplot i(v1) ylog\nprint x')).toEqual([
      { traces: [{ expr: 'V(out)' }, { expr: 'V(in)' }] },
      { traces: [{ expr: 'I(v1)' }] },
    ]);
  });

  it('.plt de LTspice: lee paneles, trazas y colores; escribe y relee igual', () => {
    const plt = `[Transient Analysis]\r\n{\r\n   Npanes: 2\r\n   Active Pane: 1\r\n   {\r\n      traces: 2 {524290,0,"V(out)"} {524292,0,"V(in)"}\r\n      X: ('m',0,0,0.01,0.1)\r\n   },\r\n   {\r\n      traces: 1 {34603010,0,"I(L1)"}\r\n   }\r\n}\r\n[AC Analysis]\r\n{\r\n   Npanes: 1\r\n   {\r\n      traces: 1 {2,0,"V(out)/V(in)"}\r\n   }\r\n}\r\n`;
    const v = parsePlt(plt);
    expect(v.tran).toEqual([
      { traces: [{ expr: 'V(out)' }, { expr: 'V(in)', color: '#ff0000' }] },
      { traces: [{ expr: 'I(L1)' }] },
    ]);
    expect(v.ac).toEqual([{ traces: [{ expr: 'V(out)/V(in)' }] }]);
    expect(parsePlt(serializePlt(v))).toEqual(v);
  });
});
