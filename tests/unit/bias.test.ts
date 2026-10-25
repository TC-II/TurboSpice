import { describe, expect, it } from 'vitest';
import { emptyDoc, type AscDoc, type SchText } from '../../src/asc/model.ts';
import { setAnalysisLine } from '../../src/schematic/directivesEdit.ts';
import { biasCommand, pinBias, sameCircuit } from '../../src/sim/bias.ts';
import type { BuiltSimulation } from '../../src/sim/schematicSim.ts';
import type { Element } from '../../src/netlist/ltnetlist.ts';

const text = (kind: SchText['kind'], t: string, y = 0): SchText => ({ x: 0, y, align: 'Left', size: 2, kind, text: t });
// mismos componentes y cables (se comparan por referencia, como en el historial)
const empty = emptyDoc();
const doc = (...texts: SchText[]): AscDoc => ({ ...empty, texts });

describe('sameCircuit (punto de operación)', () => {
  const base = doc(text('directive', '.tran 1m'), text('directive', '.model D1 D(Is=1n)', 40), text('comment', 'filtro', 80));

  it('no cambia con el comando de análisis ni con los comentarios', () => {
    expect(sameCircuit(base, setAnalysisLine(base, '.dc V1 0 5 0.1'))).toBe(true);
    expect(sameCircuit(base, { ...base, texts: base.texts.map((t) => (t.kind === 'comment' ? { ...t, text: 'otro' } : t)) })).toBe(true);
  });

  it('cambia con el resto de las directivas', () => {
    expect(sameCircuit(base, { ...base, texts: base.texts.map((t) => (t.text.startsWith('.model') ? { ...t, text: '.model D1 D(Is=2n)' } : t)) })).toBe(false);
  });

  it('en una directiva de varias líneas sólo ignora las de análisis', () => {
    const a = doc(text('directive', '.ac dec 10 1 1k\\n.param R=1k'));
    expect(sameCircuit(a, doc(text('directive', '.tran 1m\\n.param R=1k')))).toBe(true);
    expect(sameCircuit(a, doc(text('directive', '.ac dec 10 1 1k\\n.param R=2k')))).toBe(false);
  });

  it('cambia con componentes o cables', () => {
    expect(sameCircuit(base, { ...base, symbols: [] })).toBe(false);
    expect(sameCircuit(base, { ...base, wires: [] })).toBe(false);
  });
});

describe('punto de operación que se anota (t = 0 en un .tran)', () => {
  it('op en continua; en un .tran, su primer punto (con o sin uic)', () => {
    expect(biasCommand('* x\nR1 a 0 1k\n.ac dec 10 1 1k\n.end')).toEqual({ cmd: 'op', atZero: false });
    expect(biasCommand('* x\n.tran 0 5m\n.end')).toEqual({ cmd: 'tran 1p 1p', atZero: true });
    expect(biasCommand('* x\n.TRAN 1u 5m 0 UIC\n.end')).toEqual({ cmd: 'tran 1p 1p uic', atZero: true });
  });
});

describe('corriente del OP en el pin de un transistor', () => {
  const sim = { ng: { names: new Map([['Q1', 'q1'], ['R1', 'r1']]) } } as unknown as BuiltSimulation;
  const q = { name: 'Q1', prefix: 'QN', nodes: ['c', 'b', 'e'] } as unknown as Element;
  const bias = { '@q1[ic]': 1e-3, '@q1[ib]': 1e-5, '@q1[ie]': -1.01e-3 };
  it('cada pin (SpiceOrder) da la de su terminal', () => {
    expect(pinBias(sim, bias, q, 1)).toBe('Ic = 1mA');
    expect(pinBias(sim, bias, q, 2)).toBe('Ib = 10µA');
    expect(pinBias(sim, bias, q, 3)).toBe('Ie = -1.01mA');
  });
  it('un componente de dos terminales no tiene corriente por pin', () => {
    expect(pinBias(sim, bias, { name: 'R1', prefix: 'R', nodes: ['a', 'b'] } as unknown as Element, 1)).toBeNull();
  });
});
