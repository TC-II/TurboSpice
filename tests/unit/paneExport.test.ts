import { describe, expect, it } from 'vitest';
import { paneCsv, paneFigure, panePgfplots, plotIndices, printColor, type PaneFrame } from '../../src/waveform/paneExport.ts';
import type { Curve, PaneData } from '../../src/waveform/curves.ts';
import { PALETTE_DARK, PALETTE_LIGHT } from '../../src/waveform/view.ts';

const curve = (c: Partial<Curve> & Pick<Curve, 'label' | 'y'>): Curve => ({ trace: 0, run: 0, color: '#1971c2', dash: false, axis: 'y', hidden: false, ...c });

/** Un Bode chico: magnitud (dB) y fase, en escala log */
function bode(): PaneData {
  const x = Float64Array.from({ length: 41 }, (_, i) => 10 ** (1 + i / 10));
  const mag = x.map((f) => -10 * Math.log10(1 + (f / 1000) ** 2));
  const ph = x.map((f) => (-Math.atan(f / 1000) * 180) / Math.PI);
  return {
    x,
    xName: 'frequency',
    log: true,
    curves: [curve({ label: 'V(out)', y: mag }), curve({ label: 'V(out)', y: ph, axis: 'ph', dash: true, color: PALETTE_DARK[1] })],
    errors: new Map(),
    yUnit: 'dB',
    iUnit: 'A',
  };
}
const frame: PaneFrame = { x: [10, 1e5], y: [-45, 5], r: [-100, 0], grid: true, aspect: 0.5 };
const measure = (s: string, size: number) => s.length * size * 0.5;

describe('exportar un panel', () => {
  it('CSV: el eje X y cada curva visible con su unidad; con rango, sólo lo que cae adentro', () => {
    const d = bode();
    const all = paneCsv(d).trim().split('\n');
    expect(all[0]).toBe('frequency [Hz],V(out) [dB],V(out) [°]');
    expect(all).toHaveLength(42);
    const some = paneCsv(d, [100, 1000]).trim().split('\n');
    expect(some).toHaveLength(1 + 11);
    expect(Number(some[1].split(',')[0])).toBeCloseTo(100);
    d.curves[1].hidden = true;
    expect(paneCsv(d).split('\n')[0]).toBe('frequency [Hz],V(out) [dB]');
  });

  it('el color de la paleta oscura pasa al mismo tono de la clara (la figura va sobre blanco)', () => {
    expect(printColor(PALETTE_DARK[2])).toBe(PALETTE_LIGHT[2]);
    expect(printColor('#123456')).toBe('#123456');
  });

  it('plotIndices: cortes donde falta el valor y, con muchos puntos, a lo sumo cuatro por columna', () => {
    const xs = [0, 1, 2, 3, 4, 5];
    const ys = [1, 2, NaN, 4, 5, 6];
    expect(
      plotIndices(
        xs,
        ys,
        (v) => v,
        (v) => v,
        [0, 5],
        100,
      ),
    ).toEqual([
      [0, 1],
      [3, 4, 5],
    ]);
    // (rango visible 2..3: un punto más a cada lado)
    expect(
      plotIndices(
        [0, 1, 2, 3, 4, 5],
        [0, 0, 0, 0, 0, 0],
        (v) => v,
        (v) => v,
        [2, 3],
        100,
      ),
    ).toEqual([[1, 2, 3, 4]]);
    const n = 100_000;
    const big = Float64Array.from({ length: n }, (_, i) => i / n);
    const sin = big.map((t) => Math.sin(2 * Math.PI * 50 * t));
    const segs = plotIndices(
      big,
      sin,
      (v) => v * 200,
      (v) => v,
      [0, 1],
      200,
    );
    const pts = segs.flat().length;
    expect(pts).toBeLessThanOrEqual(4 * 401);
    // los picos siguen estando
    expect(Math.max(...segs.flat().map((k) => sin[k]))).toBeCloseTo(1, 3);
  });

  it('la figura: caja, marcas, números del eje log, leyenda, eje derecho y curvas recortadas', () => {
    const { svg, w, h } = paneFigure(bode(), frame, measure);
    expect(w).toBe(330);
    expect(h).toBeGreaterThan(150);
    expect(svg).toContain('<clipPath id="plot">');
    expect(svg).toContain('clip-path="url(#plot)"');
    expect(svg).toContain('font-family="Latin Modern Roman"');
    for (const label of ['>10<', '>100<', '>1k<', '>10k<', '>100k<', '>frequency (Hz)<', '>dB<', '>°<']) expect(svg).toContain(label);
    // misma traza en dos ejes: la leyenda dice cuál es cuál
    expect(svg).toContain('>V(out) [dB]<');
    expect(svg).toContain('>V(out) [°]<');
    // la fase, punteada y en el tono claro
    expect(svg).toContain(`stroke="${PALETTE_LIGHT[1]}" stroke-width="0.9" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="3 1.6"`);
    expect(new DOMParserLike(svg).ok).toBe(true);
  });

  it('pgfplots: ejes, escala log, grilla, colores, leyenda arriba y el eje derecho aparte', () => {
    const tex = panePgfplots(bode(), frame, 'Bode RC');
    expect(tex).toContain('\\documentclass[border=4pt]{standalone}');
    expect(tex).toContain('\\usepackage{pgfplots}');
    expect(tex).toContain('xmode=log');
    expect(tex).toContain('xmin=10');
    expect(tex).toContain('xmax=100000');
    expect(tex).toContain('grid=major');
    expect(tex).toContain('xlabel={frequency (Hz)}');
    expect(tex).toContain(`\\definecolor{ts1}{HTML}{1971C2}`);
    expect(tex).toContain('axis y line*=right');
    expect(tex).toContain('ylabel={\\textdegree{}}');
    expect(tex).toContain('\\addlegendentry{V(out) [dB]}');
    expect(tex).toContain('\\addlegendimage{color=ts2, thick, no markers, dashed}');
    expect(tex.match(/\\begin\{axis\}/g)).toHaveLength(2);
    expect(tex.match(/\\end\{axis\}/g)).toHaveLength(2);
    expect(tex.trim().endsWith('\\end{document}')).toBe(true);
  });
});

/** (sin DOM en los tests: alcanza con que las etiquetas abran y cierren) */
class DOMParserLike {
  ok: boolean;
  constructor(svg: string) {
    const body = svg.slice(svg.indexOf('<svg'));
    const opened = (body.match(/<(svg|g|defs|clipPath|text)\b/g) ?? []).length;
    const closed = (body.match(/<\/(svg|g|defs|clipPath|text)>/g) ?? []).length;
    this.ok = opened === closed;
  }
}
