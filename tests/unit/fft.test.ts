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
