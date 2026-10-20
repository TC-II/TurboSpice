import { describe, expect, it } from 'vitest';
import { evalTrace, parseExpr, references, unwrapDeg, type Wave } from '../../src/waveform/expr.ts';

const x = Float64Array.from([0, 1, 2, 3]);
const vecs: Record<string, Wave> = {
  'V:out': { re: Float64Array.from([0, 2, 4, 6]) },
  'V:in': { re: Float64Array.from([1, 1, 1, 1]) },
  'I:R1': { re: Float64Array.from([1e-3, 2e-3, 3e-3, 4e-3]) },
  'Ic:Q1': { re: Float64Array.from([5, 5, 5, 5]) },
};
const ctx = {
  scale: x,
  scaleName: 'time',
  resolve: (fn: string, args: string[]) => {
    if (fn.toUpperCase() === 'V' && args.length === 2) {
      const a = vecs[`V:${args[0]}`];
      const b = vecs[`V:${args[1]}`];
      return a && b ? { re: a.re.map((v, k) => v - b.re[k]) } : null;
    }
    return vecs[`${fn}:${args[0]}`] ?? null;
  },
};
const ev = (s: string) => Array.from(evalTrace(s, ctx).re);

describe('expresiones de trazas', () => {
  it('aritmética, referencias y sufijos', () => {
    expect(ev('V(out)/V(in)')).toEqual([0, 2, 4, 6]);
    expect(ev('V(out,in)')).toEqual([-1, 1, 3, 5]);
    expect(ev('I(R1)*1k')).toEqual([1, 2, 3, 4]);
    expect(ev('-V(out)+2^3')).toEqual([8, 6, 4, 2]);
    expect(ev('out*2')).toEqual([0, 4, 8, 12]);
    expect(ev('Ic(Q1)')).toEqual([5, 5, 5, 5]);
    expect(ev('time*2')).toEqual([0, 2, 4, 6]);
    expect(ev('d(V(out))')).toEqual([2, 2, 2, 2]);
    expect(ev('integ(V(in))')).toEqual([0, 1, 2, 3]);
    expect(ev('max(V(out), 3)')).toEqual([3, 3, 4, 6]);
  });

  it('complejos: db, fase, módulo', () => {
    const ac = {
      scale: Float64Array.from([1, 10]),
      scaleName: 'frequency',
      resolve: () => ({ re: Float64Array.from([0, 0.1]), im: Float64Array.from([1, 0]) }),
    };
    expect(Array.from(evalTrace('db(V(x))', ac).re)).toEqual([0, -20]);
    expect(Array.from(evalTrace('ph(V(x))', ac).re)).toEqual([90, 0]);
    const w = evalTrace('V(x)*j', ac);
    expect(Array.from(w.re)).toEqual([-1, 0]);
    expect(Array.from(w.im!)).toEqual([0, 0.1]);
  });

  it('fase desenrollada', () => {
    const re = Float64Array.from([1, 0, -1, 0, 1]);
    const im = Float64Array.from([0, -1, -0.0001, 1, 0.0001]);
    expect(Array.from(unwrapDeg(re, im)).map(Math.round)).toEqual([0, -90, -180, -270, -360]);
  });

  it('errores y referencias', () => {
    expect(() => ev('V(nope)')).toThrow(/no existe/);
    expect(() => ev('foo(1)')).toThrow(/desconocida/);
    expect(() => parseExpr('V(out')).toThrow();
    expect(references(parseExpr('db(V(a)/I(R1))+Ic(Q1)'))).toEqual([
      { fn: 'V', args: ['a'] },
      { fn: 'I', args: ['R1'] },
      { fn: 'Ic', args: ['Q1'] },
    ]);
  });
});

describe('corridas de .step con @n (como LTspice)', () => {
  // corrida 1: out = 1; corrida 2: out = 10; sin @, la que se grafica (out = 100)
  const runs: Record<string, number> = { '': 100, '1': 1, '2': 10 };
  const rctx = {
    scale: x,
    scaleName: 'frequency',
    resolve: (fn: string, args: string[], run?: number) => {
      const v = runs[run === undefined ? '' : String(run)];
      return v !== undefined && fn.toUpperCase() === 'V' && args[0] === 'out' ? { re: new Float64Array(4).fill(v) } : null;
    },
  };
  const rev = (s: string) => evalTrace(s, rctx).re[0];

  it('V(x)@n y nodo@n eligen la corrida', () => {
    expect(rev('V(out)@2')).toBe(10);
    expect(rev('V(out) @1 + out@2')).toBe(11);
    expect(rev('V(out)')).toBe(100);
    // la fórmula de Middlebrook del ejemplo de ganancia de lazo se puede leer
    expect(() => parseExpr('1/(1-1/(2*(I(Vp)@1*V(x2)@2-V(x2)@1*I(Vp)@2)+V(x2)@1+I(Vp)@2))')).not.toThrow();
  });

  it('una corrida que no existe avisa', () => {
    expect(() => rev('V(out)@3')).toThrow(/no existe V\(out\)@3/);
  });
});
