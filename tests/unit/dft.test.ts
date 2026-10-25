import { describe, expect, it } from 'vitest';
import { analyze, defaultFs, dft, niceAbove, parseSi, sampleCount, spectrum, WINDOWS } from '../../src/waveform/dft.ts';

// 20 ciclos de 1 kHz con paso no uniforme (como un transitorio)
const t: number[] = [];
for (let x = 0; x <= 20e-3; x += 1e-6 * (1 + 0.5 * Math.sin(x * 7e3))) t.push(x);
const sig = (f: (x: number) => number) => ({ x: Float64Array.from(t), y: Float64Array.from(t, f) });

describe('DFT y THD', () => {
  it('senoidal de 1 kHz: pico en 1 kHz con su amplitud', () => {
    const { x, y } = sig((v) => 2 * Math.sin(2 * Math.PI * 1000 * v));
    const s = spectrum(x, y, { window: 'flattop' });
    let k = 1;
    for (let i = 2; i < s.amp.length; i++) if (s.amp[i] > s.amp[k]) k = i;
    expect(s.freq[k]).toBeCloseTo(1000, -1);
    expect(s.amp[k]).toBeCloseTo(2, 1);
    expect(analyze(s).thd).toBeLessThan(0.1);
  });

  it('10 % de tercera armónica: THD ≈ 10 %', () => {
    const { x, y } = sig((v) => Math.sin(2 * Math.PI * 1000 * v) + 0.1 * Math.sin(2 * Math.PI * 3000 * v));
    const r = analyze(spectrum(x, y, { window: 'flattop' }));
    expect(r.fundamental).toBeCloseTo(1000, -1);
    expect(r.thd).toBeGreaterThan(9.8);
    expect(r.thd).toBeLessThan(10.2);
    expect(r.harmonics[1]).toBeCloseTo(0.1, 2);
  });
});

describe('panel de DFT (#236)', async () => {
  const { paneCurves } = await import('../../src/waveform/curves.ts');
  const { asPlotView } = await import('../../src/waveform/view.ts');
  const { x, y } = sig((v) => Math.sin(2 * Math.PI * 1000 * v));
  const plot = { name: 'tran1', vectors: [{ name: 'time', type: 1, real: x }, { name: 'v(out)', type: 3, real: y }] } as never;
  const resolver = () => (fn: string, args: string[]) => (fn.toLowerCase() === 'v' && args[0] === 'out' ? { re: y } : null);
  const ctx = { plot, runs: [plot], labels: new Map(), resolver, mode: 'bode' as const };

  it('la traza del panel se muestra como espectro en dB con eje de frecuencias', () => {
    const d = paneCurves({ traces: [{ expr: 'V(out)', dft: { window: 'hann' } }] }, ctx);
    expect(d.xName).toBe('frequency');
    expect(d.yUnit).toBe('dB');
    expect(d.curves).toHaveLength(1);
    let k = 1;
    for (let i = 2; i < d.x.length; i++) if (d.curves[0].y[i] > d.curves[0].y[k]) k = i;
    expect(d.x[k]).toBeCloseTo(1000, -2);
    expect(d.info?.[0]).toMatch(/fundamental 1(\.00)?kHz/);
  });

  it('vistas de #245: el espectro del panel pasa a sus trazas', () => {
    const v = asPlotView({ tran: [{ traces: [{ expr: 'V(out)' }], fft: { window: 'hamming', from: 1e-3, to: 2e-3 } }, { traces: [], fft: { window: 'x' } }] });
    expect(v?.tran[0].traces[0].dft).toEqual({ window: 'hamming', from: 1e-3, to: 2e-3 });
    expect(v?.tran[0].fft).toBeUndefined();
    expect(v?.tran[1]).toEqual({ traces: [] });
  });

  it('la ventana y el rango de cada traza se guardan con la vista (#260)', () => {
    const tran = [{ traces: [{ expr: 'V(out)', dft: { window: 'hann' } }, { expr: 'V(out)', dft: { window: 'flattop', from: 1e-3, to: 2e-3 } }, { expr: 'V(in)', dft: { window: 'nope' } }] }];
    const v = asPlotView(JSON.parse(JSON.stringify({ tran })));
    expect(v?.tran[0].traces.map((x) => x.dft)).toEqual([{ window: 'hann' }, { window: 'flattop', from: 1e-3, to: 2e-3 }, undefined]);
  });

  it('dos DFT de la misma señal con distinta ventana en un panel: dos curvas y dos nombres (#260)', () => {
    const d = paneCurves({ traces: [{ expr: 'V(out)', dft: { window: 'hann' } }, { expr: 'V(out)', dft: { window: 'rect' } }] }, ctx);
    expect(d.curves.map((c) => c.label)).toEqual(['V(out)-Hann', 'V(out)-Rec']);
    expect(d.curves[0].y).not.toEqual(d.curves[1].y);
    // con otro rango, la segunda se lleva a la grilla de frecuencias de la primera
    const r = paneCurves({ traces: [{ expr: 'V(out)', dft: { window: 'hann' } }, { expr: 'V(out)', dft: { window: 'hann', from: 10e-3, to: 20e-3 } }] }, ctx);
    expect(r.curves[1].y.length).toBe(r.x.length);
    expect(r.curves[1].label).toMatch(/^V\(out\)-Hann 10(\.0+)?ms…20(\.0+)?ms$/);
  });

  it('DFT de distintas grillas: el eje llega hasta la mayor frecuencia, cada una vacía fuera de la suya y sin zoom hasta la menor', async () => {
    const { spectrum } = await import('../../src/waveform/dft.ts');
    const a = spectrum(x, y, { window: 'hann' }).freq;
    const b = spectrum(x, y, { window: 'hann', from: 10e-3, to: 12e-3 }).freq;
    const r = paneCurves({ traces: [{ expr: 'V(out)', dft: { window: 'hann', from: 10e-3, to: 12e-3 } }, { expr: 'V(out)', dft: { window: 'hann' } }] }, ctx);
    const top = Math.max(a[a.length - 1], b[b.length - 1]);
    const low = Math.min(a[a.length - 1], b[b.length - 1]);
    expect(r.x[r.x.length - 1]).toBe(top);
    for (const f of [...a, ...b]) expect(r.x.includes(f)).toBe(true);
    if (low < top) {
      expect(r.home).toEqual([r.x[0], low]);
      const short = r.curves.find((c) => Number.isNaN(c.y[r.x.length - 1]));
      const long = r.curves.find((c) => Number.isFinite(c.y[r.x.length - 1]));
      expect(short && long).toBeTruthy();
    } else expect(r.home).toBeUndefined();
  });
});

describe('identidad de las trazas y tipo de los paneles (#260)', async () => {
  const { traceLabel } = await import('../../src/waveform/curves.ts');
  const { acceptsTrace, addTraceTo, paneKind, sameTrace } = await import('../../src/waveform/view.ts');
  const hann = { expr: 'I(R1)', dft: { window: 'hann' as const } };
  const rect = { expr: 'i(r1)', dft: { window: 'rect' as const } };

  it('una DFT es la señal más su ventana y su muestreo', () => {
    expect(sameTrace(hann, { expr: 'I(R1)', dft: { window: 'hann' } })).toBe(true);
    expect(sameTrace(hann, rect)).toBe(false);
    expect(sameTrace(hann, { expr: 'I(R1)', dft: { window: 'hann', from: 0, to: 1 } })).toBe(false);
    expect(sameTrace(hann, { expr: 'I(R1)' })).toBe(false);
    expect(sameTrace({ expr: 'V( a )' }, { expr: 'v(a)' })).toBe(true);
  });

  it('nombre: la expresión y la ventana', () => {
    expect(traceLabel(hann)).toBe('I(R1)-Hann');
    expect(traceLabel(hann, [hann, { expr: 'V(x)', dft: { window: 'rect' } }])).toBe('I(R1)-Hann');
    expect(traceLabel(rect, [hann, rect])).toBe('i(r1)-Rec');
    expect(traceLabel({ expr: 'V(a)' })).toBe('V(a)');
  });

  it('el tipo del panel sale de sus trazas: uno vacío acepta cualquiera', () => {
    expect(paneKind({ traces: [] })).toBeNull();
    expect(paneKind({ traces: [hann] })).toBe('dft');
    expect(paneKind({ traces: [{ expr: 'V(a)' }] })).toBe('time');
    // (una vista vieja con fft en el panel pero sin trazas)
    expect(acceptsTrace({ traces: [], fft: { window: 'hann' } }, { expr: 'V(a)' })).toBe(true);
    expect(acceptsTrace({ traces: [] }, hann)).toBe(true);
    expect(acceptsTrace({ traces: [hann] }, { expr: 'V(a)' })).toBe(false);
    expect(acceptsTrace({ traces: [{ expr: 'V(a)' }] }, hann)).toBe(false);
    expect(acceptsTrace({ traces: [hann] }, rect)).toBe(true);
  });

  it('agregar una traza de tiempo con un panel de DFT activo: va a otro panel', () => {
    expect(addTraceTo([{ traces: [{ expr: 'V(a)' }] }, { traces: [hann] }], 1, 'V(b)')[0].traces.map((x) => x.expr)).toEqual(['V(a)', 'V(b)']);
    const n = addTraceTo([{ traces: [hann] }], 0, 'V(b)');
    expect(n).toHaveLength(2);
    expect(n[1].traces[0].expr).toBe('V(b)');
  });
});

describe('ventanas de la DFT', () => {
  // 1 kHz de amplitud 1, muestreado parejo durante 10 ms (justo en un bin)
  const N = 4096;
  const x = Float64Array.from({ length: N }, (_, k) => (k * 10e-3) / N);
  const sine = (f: number) => Float64Array.from(x, (tt) => Math.sin(2 * Math.PI * f * tt));
  // (las muestras de la DFT son justo los puntos: sin interpolar)
  const exact = { to: 10e-3, fs: N / 10e-3 };
  it('todas miden bien la amplitud de un seno', () => {
    for (const [w] of WINDOWS) {
      const s = spectrum(x, sine(1000), { ...exact, window: w });
      const peak = Math.max(...s.amp);
      expect(peak, w).toBeGreaterThan(0.97);
      expect(peak, w).toBeLessThan(1.03);
    }
  });
  it('las de bajo derrame lo dejan muy por debajo de la rectangular', () => {
    // 1050 Hz: entre dos bins, así la rectangular derrama a todo el espectro (más de 40 dB menos)
    const far = (w: (typeof WINDOWS)[number][0]) => {
      const s = spectrum(x, sine(1050), { ...exact, window: w });
      // lejos del tono (más de 20 kHz)
      return Math.max(...s.amp.filter((_, k) => s.freq[k] > 20e3));
    };
    const rect = far('rect');
    for (const w of ['blackmanharris', 'nuttall', 'blackmannuttall', 'kaiser'] as const) expect(far(w), w).toBeLessThan(rect / 100);
  });
});

describe('DFT de cualquier largo (sin potencia de 2)', () => {
  // generador fijo (los tests no dependen del azar)
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  /** DFT por la definición, para comparar */
  const naive = (re: Float64Array, im: Float64Array) => {
    const N = re.length;
    const or = new Float64Array(N);
    const oi = new Float64Array(N);
    for (let k = 0; k < N; k++)
      for (let n = 0; n < N; n++) {
        const a = (-2 * Math.PI * ((k * n) % N)) / N;
        or[k] += re[n] * Math.cos(a) - im[n] * Math.sin(a);
        oi[k] += re[n] * Math.sin(a) + im[n] * Math.cos(a);
      }
    return [or, oi];
  };
  it('da lo mismo que la definición para N primo, par, impar y potencia de 2', () => {
    for (const N of [1, 2, 3, 5, 7, 12, 100, 257, 1000, 1024, 1500]) {
      const re = Float64Array.from({ length: N }, rnd);
      const im = Float64Array.from({ length: N }, rnd);
      const [er, ei] = naive(re, im);
      dft(re, im);
      let err = 0;
      let mag = 0;
      for (let k = 0; k < N; k++) {
        err = Math.max(err, Math.hypot(re[k] - er[k], im[k] - ei[k]));
        mag = Math.max(mag, Math.hypot(er[k], ei[k]));
      }
      expect(err / mag, `N = ${N}`).toBeLessThan(1e-10);
    }
  });

  it('muestrea a fs entre t₀ y t₁: N, resolución y Nyquist', () => {
    // transitorio con paso de 1 µs: 1 kHz durante 20 ms
    const x = Float64Array.from({ length: 20001 }, (_, k) => k * 1e-6);
    const y = x.map((v) => Math.sin(2 * Math.PI * 1000 * v));
    expect(sampleCount(2e-3, 7e-3, 100e3)).toBe(500);
    const s = spectrum(x, y, { from: 2e-3, to: 7e-3, fs: 100e3, window: 'rect' });
    expect(s.n).toBe(500);
    expect(s.freq[1]).toBeCloseTo(200, 9);
    expect(s.freq[s.freq.length - 1]).toBeCloseTo(50e3, 6);
    // 5 períodos justos (muestreo coherente): todo en el bin de 1 kHz
    expect(s.amp[5]).toBeCloseTo(1, 6);
    for (let k = 1; k < s.amp.length; k++) if (k !== 5) expect(s.amp[k]).toBeLessThan(1e-6);
  });

  it('sin fs, la densidad de la simulación redondeada hacia arriba', () => {
    expect(niceAbove(3.2e5)).toBe(5e5);
    expect(niceAbove(1e6)).toBe(1e6);
    expect(niceAbove(1.1e6)).toBe(2e6);
    const x = Float64Array.from({ length: 1001 }, (_, k) => k * 1e-6);
    expect(defaultFs(x, 0, 1e-3)).toBe(2e6);
  });

  it('demasiadas o muy pocas muestras: error', () => {
    const x = Float64Array.from([0, 1]);
    const y = Float64Array.from([0, 1]);
    expect(() => spectrum(x, y, { fs: 1 })).toThrow(/Too few/);
    expect(() => spectrum(x, y, { fs: 1e7 })).toThrow(/Too many/);
  });

  it('campos con prefijo SI', () => {
    expect(parseSi('1m')).toBeCloseTo(1e-3, 15);
    expect(parseSi('10M')).toBe(10e6);
    expect(parseSi('2.5µs')).toBeCloseTo(2.5e-6, 15);
    expect(parseSi('100kHz')).toBe(100e3);
    expect(parseSi(' 1e-3 ')).toBe(1e-3);
    expect(parseSi('1meg')).toBe(1e6);
    expect(parseSi('abc')).toBeNull();
    expect(parseSi('')).toBeNull();
  });
});

describe('fundamental y THD', () => {
  it('una fundamental de pocos bins (cerca de la continua) se encuentra igual', () => {
    // 100 Hz con Δf = 50 Hz: el bin 2, dentro del lóbulo de Hann de la continua
    const x3 = Float64Array.from({ length: 2001 }, (_, k) => k * 1e-5);
    const y3 = x3.map((v) => 0.5 + Math.sin(2 * Math.PI * 100 * v) + 0.2 * Math.sin(2 * Math.PI * 300 * v));
    // (no con Flat top: su lóbulo de ±5 bins mezcla el tono del bin 2 con su imagen del bin −2)
    for (const w of ['rect', 'hann', 'blackmanharris'] as const) {
      const a = analyze(spectrum(x3, y3, { from: 0, to: 20e-3, fs: 100e3, window: w }));
      expect(Math.abs(a.fundamental - 100), w).toBeLessThan(5); // (Δf/10)
      // (con la rectangular y Hann la 3.ª, 4 bins más arriba, queda fuera del lóbulo de la fundamental)
      if (w !== 'blackmanharris') expect(a.harmonics[1], w).toBeCloseTo(0.2, 1);
    }
  });

  it('las armónicas arriba de fs/2 se pliegan (como en un ADC)', () => {
    // 3,1 kHz a 10 kHz: la 2.ª (6,2 kHz) cae en 3,8 kHz
    const fs2 = 10e3;
    const n2 = 1000;
    const x2 = Float64Array.from({ length: n2 + 1 }, (_, k) => k / fs2);
    const y2 = x2.map((v) => Math.sin(2 * Math.PI * 3100 * v) + 0.1 * Math.sin(2 * Math.PI * 6200 * v));
    const a = analyze(spectrum(x2, y2, { from: 0, to: n2 / fs2, fs: fs2, window: 'rect' }));
    expect(a.harmonics[0]).toBeCloseTo(0.1, 3);
    expect(a.thd).toBeCloseTo(10, 1);
  });
});

describe('vista guardada de la DFT', async () => {
  const { asPlotView, sameDft } = await import('../../src/waveform/view.ts');
  const { traceLabel } = await import('../../src/waveform/curves.ts');
  it('las vistas de antes (fft) se leen como DFT, y la frecuencia de muestreo se guarda', () => {
    const v = asPlotView({ tran: [{ traces: [{ expr: 'V(out)', fft: { window: 'hann', from: 1e-3 } }, { expr: 'V(out)', dft: { window: 'rect', fs: 1e6 } }, { expr: 'V(a)', dft: { window: 'rect', fs: -1 } }] }] });
    expect(v?.tran[0].traces.map((x) => x.dft)).toEqual([{ window: 'hann', from: 1e-3 }, { window: 'rect', fs: 1e6 }, { window: 'rect' }]);
  });
  it('otra frecuencia de muestreo es otra DFT, y su nombre lo dice', () => {
    expect(sameDft({ window: 'hann', fs: 1e6 }, { window: 'hann', fs: 2e6 })).toBe(false);
    const a = { expr: 'V(out)', dft: { window: 'hann' as const, fs: 10e6 } };
    const b = { expr: 'V(out)', dft: { window: 'hann' as const } };
    expect(traceLabel(a, [a, b])).toBe('V(out)-Hann 10MHz');
    expect(traceLabel(b, [a, b])).toMatch(/^V\(out\)-Hann (automatic sample rate|muestreo automático)$/);
  });
});
