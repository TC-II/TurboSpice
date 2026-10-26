// Punta de prueba (#308): cada traza a un eje Y con su unidad o libre; con dos ejes ocupados, a un panel nuevo
import { describe, expect, it } from 'vitest';
import { exprUnit, paneUnits, placeTrace } from '../../src/waveform/curves.ts';

const pane = (...exprs: string[]) => ({ traces: exprs.map((expr) => ({ expr })) });
const exprs = (ps: { traces: { expr: string }[] }[]) => ps.map((p) => p.traces.map((t) => t.expr));

describe('ejes Y por unidad', () => {
  it('unidades: V, A, Ω, S y arbitraria', () => {
    expect(['V(a)', 'V(a)-V(b)', 'I(R1)', 'I(R1)-I(R2)', 'V(a)/I(R1)', 'I(R1)/V(a)', 'V(a)/V(b)'].map(exprUnit)).toEqual(['V', 'V', 'A', 'A', 'Ω', 'S', '']);
  });
  it('la corriente va a la derecha si comparte panel', () => {
    expect(paneUnits(pane('I(R1)', 'V(a)').traces)).toEqual(['V', 'A']);
    expect(paneUnits(pane('V(a)/I(R1)', 'V(a)').traces)).toEqual(['Ω', 'V']);
  });
  it('mismo eje, eje libre o panel nuevo', () => {
    expect(placeTrace([pane('V(a)')], 0, 'V(b)').index).toBe(0);
    expect(placeTrace([pane('V(a)/I(R1)')], 0, 'V(b)').index).toBe(0);
    const r = placeTrace([pane('V(a)/I(R1)', 'V(a)')], 0, 'I(R1)');
    expect(r.index).toBe(1);
    expect(exprs(r.panes)).toEqual([['V(a)/I(R1)', 'V(a)'], ['I(R1)']]);
    expect(placeTrace([pane('V(a)/I(R1)', 'V(a)')], 0, 'V(b)').index).toBe(0);
  });
});
