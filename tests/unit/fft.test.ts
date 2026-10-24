import { describe, expect, it } from 'vitest';
import { spectrum, thd } from '../../src/waveform/fft.ts';

// 20 ciclos de 1 kHz con paso no uniforme (como un transitorio)
const t: number[] = [];
for (let x = 0; x <= 20e-3; x += 1e-6 * (1 + 0.5 * Math.sin(x * 7e3))) t.push(x);
const sig = (f: (x: number) => number) => ({ x: Float64Array.from(t), y: Float64Array.from(t, f) });

describe('FFT y THD', () => {
  it('senoidal de 1 kHz: pico en 1 kHz con su amplitud', () => {
    const { x, y } = sig((v) => 2 * Math.sin(2 * Math.PI * 1000 * v));
    const s = spectrum(x, y, { window: 'flattop' });
    let k = 1;
    for (let i = 2; i < s.amp.length; i++) if (s.amp[i] > s.amp[k]) k = i;
    expect(s.freq[k]).toBeCloseTo(1000, -1);
    expect(s.amp[k]).toBeCloseTo(2, 1);
    expect(thd(s).thd).toBeLessThan(0.1);
  });

  it('10 % de tercera armónica: THD ≈ 10 %', () => {
    const { x, y } = sig((v) => Math.sin(2 * Math.PI * 1000 * v) + 0.1 * Math.sin(2 * Math.PI * 3000 * v));
    const r = thd(spectrum(x, y, { window: 'flattop' }));
    expect(r.fundamental).toBeCloseTo(1000, -1);
    expect(r.thd).toBeGreaterThan(9.8);
    expect(r.thd).toBeLessThan(10.2);
    expect(r.harmonics[1]).toBeCloseTo(0.1, 2);
  });
});

describe('panel de FFT (#236)', async () => {
  const { paneCurves } = await import('../../src/waveform/curves.ts');
  const { asPlotView } = await import('../../src/waveform/view.ts');
  const { x, y } = sig((v) => Math.sin(2 * Math.PI * 1000 * v));
  const plot = { name: 'tran1', vectors: [{ name: 'time', type: 1, real: x }, { name: 'v(out)', type: 3, real: y }] } as never;
  const resolver = () => (fn: string, args: string[]) => (fn.toLowerCase() === 'v' && args[0] === 'out' ? { re: y } : null);
  const ctx = { plot, runs: [plot], labels: new Map(), resolver, mode: 'bode' as const };

  it('la traza del panel se muestra como espectro en dB con eje de frecuencias', () => {
    const d = paneCurves({ traces: [{ expr: 'V(out)', fft: { window: 'hann' } }] }, ctx);
    expect(d.xName).toBe('frequency');
    expect(d.yUnit).toBe('dB');
    expect(d.curves).toHaveLength(1);
    let k = 1;
    for (let i = 2; i < d.x.length; i++) if (d.curves[0].y[i] > d.curves[0].y[k]) k = i;
    expect(d.x[k]).toBeCloseTo(1000, -2);
    expect(d.info?.[0]).toMatch(/fundamental 1(\.00)?kHz/);
  });

  it('vistas de #245: la FFT del panel pasa a sus trazas', () => {
    const v = asPlotView({ tran: [{ traces: [{ expr: 'V(out)' }], fft: { window: 'hamming', from: 1e-3, to: 2e-3 } }, { traces: [], fft: { window: 'x' } }] });
    expect(v?.tran[0].traces[0].fft).toEqual({ window: 'hamming', from: 1e-3, to: 2e-3 });
    expect(v?.tran[0].fft).toBeUndefined();
    expect(v?.tran[1]).toEqual({ traces: [] });
  });

  it('la ventana y el rango de cada traza se guardan con la vista (#260)', () => {
    const tran = [{ traces: [{ expr: 'V(out)', fft: { window: 'hann' } }, { expr: 'V(out)', fft: { window: 'flattop', from: 1e-3, to: 2e-3 } }, { expr: 'V(in)', fft: { window: 'nope' } }] }];
    const v = asPlotView(JSON.parse(JSON.stringify({ tran })));
    expect(v?.tran[0].traces.map((x) => x.fft)).toEqual([{ window: 'hann' }, { window: 'flattop', from: 1e-3, to: 2e-3 }, undefined]);
  });

  it('dos FFT de la misma señal con distinta ventana en un panel: dos curvas y dos nombres (#260)', () => {
    const d = paneCurves({ traces: [{ expr: 'V(out)', fft: { window: 'hann' } }, { expr: 'V(out)', fft: { window: 'rect' } }] }, ctx);
    expect(d.curves.map((c) => c.label)).toEqual(['FFT(V(out), Hann)', 'FFT(V(out), Rectangular)']);
    expect(d.curves[0].y).not.toEqual(d.curves[1].y);
    // con otro rango, la segunda se lleva a la grilla de frecuencias de la primera
    const r = paneCurves({ traces: [{ expr: 'V(out)', fft: { window: 'hann' } }, { expr: 'V(out)', fft: { window: 'hann', from: 10e-3, to: 20e-3 } }] }, ctx);
    expect(r.curves[1].y.length).toBe(r.x.length);
    expect(r.curves[1].label).toMatch(/^FFT\(V\(out\), 10(\.0+)?ms…20(\.0+)?ms\)$/);
  });
});

describe('identidad de las trazas y tipo de los paneles (#260)', async () => {
  const { traceLabel } = await import('../../src/waveform/curves.ts');
  const { acceptsTrace, addTraceTo, paneKind, sameTrace } = await import('../../src/waveform/view.ts');
  const hann = { expr: 'I(R1)', fft: { window: 'hann' as const } };
  const rect = { expr: 'i(r1)', fft: { window: 'rect' as const } };

  it('una FFT es la señal más su ventana y rango', () => {
    expect(sameTrace(hann, { expr: 'I(R1)', fft: { window: 'hann' } })).toBe(true);
    expect(sameTrace(hann, rect)).toBe(false);
    expect(sameTrace(hann, { expr: 'I(R1)', fft: { window: 'hann', from: 0, to: 1 } })).toBe(false);
    expect(sameTrace(hann, { expr: 'I(R1)' })).toBe(false);
    expect(sameTrace({ expr: 'V( a )' }, { expr: 'v(a)' })).toBe(true);
  });

  it('nombre: FFT(…), con la ventana si hace falta distinguir', () => {
    expect(traceLabel(hann)).toBe('FFT(I(R1))');
    expect(traceLabel(hann, [hann, { expr: 'V(x)', fft: { window: 'rect' } }])).toBe('FFT(I(R1))');
    expect(traceLabel(hann, [hann, rect])).toBe('FFT(I(R1), Hann)');
    expect(traceLabel({ expr: 'V(a)' })).toBe('V(a)');
  });

  it('el tipo del panel sale de sus trazas: uno vacío acepta cualquiera', () => {
    expect(paneKind({ traces: [] })).toBeNull();
    expect(paneKind({ traces: [hann] })).toBe('fft');
    expect(paneKind({ traces: [{ expr: 'V(a)' }] })).toBe('time');
    // (una vista vieja con fft en el panel pero sin trazas)
    expect(acceptsTrace({ traces: [], fft: { window: 'hann' } }, { expr: 'V(a)' })).toBe(true);
    expect(acceptsTrace({ traces: [] }, hann)).toBe(true);
    expect(acceptsTrace({ traces: [hann] }, { expr: 'V(a)' })).toBe(false);
    expect(acceptsTrace({ traces: [{ expr: 'V(a)' }] }, hann)).toBe(false);
    expect(acceptsTrace({ traces: [hann] }, rect)).toBe(true);
  });

  it('agregar una traza de tiempo con un panel de FFT activo: va a otro panel', () => {
    expect(addTraceTo([{ traces: [{ expr: 'V(a)' }] }, { traces: [hann] }], 1, 'V(b)')[0].traces.map((x) => x.expr)).toEqual(['V(a)', 'V(b)']);
    const n = addTraceTo([{ traces: [hann] }], 0, 'V(b)');
    expect(n).toHaveLength(2);
    expect(n[1].traces[0].expr).toBe('V(b)');
  });
});
