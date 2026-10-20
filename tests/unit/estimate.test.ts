import { describe, expect, it } from 'vitest';
import { parseAnalysis } from '../../src/sim/analyses.ts';
import { analysisPoints, checkSimSize, countVectors, MAX_SIM_BYTES, sweepPoints } from '../../src/sim/estimate.ts';

const points = (line: string) => analysisPoints(parseAnalysis(line)!);

describe('estimación de puntos (#58)', () => {
  it('barridos dec, oct y lin', () => {
    expect(sweepPoints({ type: 'dec', points: '1000000', start: '10', stop: '100meg' })).toBe(7_000_001);
    expect(sweepPoints({ type: 'dec', points: '100', start: '1', stop: '1meg' })).toBe(601);
    expect(sweepPoints({ type: 'oct', points: '10', start: '1k', stop: '8k' })).toBe(31);
    expect(sweepPoints({ type: 'lin', points: '50', start: '1k', stop: '2k' })).toBe(50);
    expect(sweepPoints({ type: 'dec', points: '{n}', start: '1', stop: '1k' })).toBeNaN();
  });

  it('.ac, .noise, .dc y .tran', () => {
    expect(points('.ac dec 10 1 1k')).toBe(31);
    expect(points('.noise V(out) V1 dec 10 1 1k')).toBe(31);
    expect(points('.dc V1 0 5 0.1')).toBe(51);
    expect(points('.dc V1 0 5 1 V2 0 1 0.5')).toBe(18);
    // sin paso: TurboSpice usa tstop/1000
    expect(points('.tran 1m')).toBe(1001);
    // el paso máximo manda
    expect(points('.tran 0 1 0 1u')).toBe(1_000_001);
    expect(points('.op')).toBeNaN();
  });
});

describe('estimación de vectores (#58)', () => {
  it('nodos + ramas de fuentes e inductores + corrientes de savecurrents', () => {
    const net = '* t\nV1 in 0 1\nR1 in out 1k\nL1 out 0 1m\nC1 out 0 1n\n.ac dec 10 1 1k\n.options savecurrents\n.end';
    // nodos in, out; ramas V1 y L1; corrientes R1, L1, C1; escala
    expect(countVectors(net)).toBe(2 + 2 + 3 + 1);
  });

  it('subcircuitos: nodos internos y dispositivos por instancia, también en archivos incluidos', () => {
    const net = '* t\nV1 a 0 1\nX1 a b amp\nX2 b c amp gain=2\nR1 c 0 1k\n.include amp.lib\n.end';
    const lib = '.subckt amp in out params: gain=1\nR1 in mid 1k\nQ1 out mid 0 npn\n.ends amp\n';
    // top: nodos a b c, V1 (rama), R1 (corriente); cada amp: nodo mid, R1 (1), Q1 (4)
    expect(countVectors(net, { 'amp.lib': lib })).toBe(3 + 1 + 1 + 2 * (1 + 1 + 4) + 1);
  });

  it('no cuenta lo que está en .control ni los comentarios', () => {
    expect(countVectors('* t\nR1 a 0 1\n* R2 b 0 1\n.control\nlet x = 1\n.endc\n.end')).toBe(1 + 1 + 1);
  });
});

describe('chequeo de tamaño (#58)', () => {
  // ~40 vectores, como el circuito del issue
  const net = ['* t', ...Array.from({ length: 13 }, (_, i) => `R${i} n${i} n${i + 1} 1k`), 'V1 n0 0 1', '.end'].join('\n');

  it('.ac dec 1000000 10 100meg no se simula y propone menos puntos', () => {
    const r = checkSimSize(['.ac dec 1000000 10 100meg'], net, {});
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].text).toMatch(/7,0 M puntos × 29 vectores ≈ 3,0 GB/);
    expect(r.errors[0].fix).toEqual({ from: '.ac dec 1000000 10 100meg', to: '.ac dec 1000 10 100meg' });
    // y avisa que tantos puntos por década no sirven
    expect(r.warnings[0].text).toMatch(/puntos por década/);
  });

  it('lo razonable pasa sin avisos', () => {
    expect(checkSimSize(['.ac dec 1000 10 100meg', '.tran 10m'], net, {})).toEqual({ errors: [], warnings: [] });
  });

  it('cuenta las corridas de .step', () => {
    const line = '.ac dec 2000 1 1g';
    expect(checkSimSize([line], net, {}, 1).errors).toHaveLength(0);
    expect(checkSimSize([line], net, {}, 200).errors).toHaveLength(1);
  });

  it('.tran con paso máximo muy chico propone uno mayor', () => {
    const r = checkSimSize(['.tran 0 1 0 1n'], net, {});
    expect(r.errors).toHaveLength(1);
    const to = r.errors[0].fix!.to;
    expect(to).toMatch(/^\.tran 0 1 0 \S+$/);
    expect(points(to) * 29 * 8).toBeLessThan(MAX_SIM_BYTES);
  });
});
