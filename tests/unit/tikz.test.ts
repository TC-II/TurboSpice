import { describe, expect, it } from 'vitest';
import { parsePath, texText, tikzNum } from '../../src/schematic/tikz.ts';

describe('export a TikZ (#327)', () => {
  it('escapa el texto y deja el LaTeX entre $…$ tal cual', () => {
    expect(texText('2.2kΩ')).toBe('2.2k\\textohm{}');
    expect(texText('τ = RC_1 & 50%')).toBe('\\ensuremath{\\tau} = RC\\_1 \\& 50\\%');
    expect(texText('V_{out} = $\\frac{1}{RC}$')).toBe('V\\_\\{out\\} = $\\frac{1}{RC}$');
    expect(texText('{R1}')).toBe('\\{R1\\}');
  });

  it('números sin notación exponencial ni −0', () => {
    expect(tikzNum(1e-7)).toBe('0');
    expect(tikzNum(-0.0001)).toBe('0');
    expect(tikzNum(12.34567)).toBe('12.346');
  });

  it('lee caminos SVG relativos, H/V, cúbicas y arcos', () => {
    const [s] = parsePath('M10 10 h5 v5 l-5 0 z');
    expect(s.start).toEqual([10, 10]);
    expect(s.segs.map((g) => g.p)).toEqual([[15, 10], [15, 15], [10, 15]]);
    expect(s.closed).toBe(true);
    const [c] = parsePath('M0 0 C1 1 2 1 3 0 S5 -1 6 0');
    expect(c.segs[1].c?.[0]).toEqual([4, -1]);
    // medio círculo de radio 10: termina en el otro extremo y pasa por arriba
    const [a] = parsePath('M-10 0 A10 10 0 0 1 10 0');
    expect(a.segs.at(-1)?.p).toEqual([10, 0]);
    expect(Math.min(...a.segs.map((g) => g.p[1]))).toBeCloseTo(-10, 1);
  });
});
