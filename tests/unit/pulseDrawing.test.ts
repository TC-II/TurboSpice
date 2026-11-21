import { describe, expect, it } from 'vitest';
import { pulseWidths } from '../../src/schematic/SourceDialog.tsx';

const span = (w: ReturnType<typeof pulseWidths>) => w.tdw + 2 * (w.trw + w.onw + w.tfw) + w.offw;

describe('dibujo de PULSE: anchos acotados', () => {
  const cases: [number, number, number, number, number][] = [
    [0, 0, 0, 5e-3, 10e-3],
    [1, 0, 0, 5e-3, 10e-3], // Td de cien períodos
    [0, 9e-3, 9e-3, 1e-3, 10e-3], // flancos que no entran en el período
    [0, 1, 1, 1e-6, 1e-6],
    [1e3, 1e3, 1e3, 1e-9, 2e-9],
    [0, 1e-9, 1e-9, 5e-3, 10e-3],
  ];
  it.each(cases)('td=%s tr=%s tf=%s ton=%s T=%s: entra y nada es negativo', (td, tr, tf, ton, T) => {
    const w = pulseWidths(td, tr, tf, ton, T);
    for (const v of Object.values(w)) expect(v).toBeGreaterThan(20);
    expect(span(w)).toBeLessThanOrEqual(412 + 1e-9);
    expect(w.tdw).toBeLessThanOrEqual(110);
  });
  it('crecen con el parámetro', () => {
    expect(pulseWidths(2e-3, 0, 0, 5e-3, 10e-3).tdw).toBeGreaterThan(pulseWidths(1e-3, 0, 0, 5e-3, 10e-3).tdw);
    expect(pulseWidths(0, 2e-3, 0, 5e-3, 10e-3).trw).toBeGreaterThan(pulseWidths(0, 1e-3, 0, 5e-3, 10e-3).trw);
  });
});
