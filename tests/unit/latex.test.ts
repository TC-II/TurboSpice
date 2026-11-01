import { describe, expect, it } from 'vitest';
import { hasLatex, labelPlain, labelTex, latexSpans, loadMathJax, mathSvg, plainText } from '../../src/schematic/latex.ts';

describe('LaTeX en rótulos (#328), con las reglas de ASC-Parser', () => {
  it('separa en los $ sin escapar', () => {
    expect(latexSpans('gain is $\\frac{V_o}{V_i}$ at DC')).toEqual([
      { latex: false, text: 'gain is ' },
      { latex: true, text: '\\frac{V_o}{V_i}' },
      { latex: false, text: ' at DC' },
    ]);
  });

  it('con $ impares, o escapados, todo queda literal', () => {
    expect(hasLatex('unbalanced $ stays literal')).toBe(false);
    expect(hasLatex('escapes: \\$ 50\\% R\\&D a\\_b')).toBe(false);
    expect(plainText('escapes: \\$ 50\\% R\\&D a\\_b')).toBe('escapes: $ 50% R&D a_b');
    expect(hasLatex('{R1*2}')).toBe(false);
  });

  it('en notación de LaTeX los escapes se resuelven; si no, el texto queda tal cual', () => {
    expect(labelPlain('escapes: \\$ 50\\% R\\&D a\\_b')).toBe('escapes: $ 50% R&D a_b');
    expect(labelPlain('unbalanced $ stays literal')).toBe('unbalanced $ stays literal');
    expect(labelPlain('C:\\lib\\x a\\_b')).toBe('C:\\lib\\x a\\_b');
  });

  it('el texto común va en \\text{} (sin comandos) y la fórmula tal cual', () => {
    expect(labelTex('Left: $\\tau$')).toBe('\\text{Left: }{\\tau}');
    expect(labelTex('a{b}$x$')).toBe('\\text{a}\\lbrace \\text{b}\\rbrace {x}');
  });

  it('MathJax compone la fórmula; un comando que no existe deja el texto crudo', async () => {
    await loadMathJax();
    const m = mathSvg('Left: $\\omega_0 = \\frac{1}{\\sqrt{LC}}$');
    expect(m).toBeTruthy();
    expect(m!.minY).toBeLessThan(0);
    expect(m!.w).toBeGreaterThan(m!.h);
    expect(m!.body).toContain('<path');
    expect(m!.body).not.toContain('currentColor');
    expect(mathSvg('$\\notacommand x$')).toBeNull();
  });
});
