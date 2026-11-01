import { describe, expect, it } from 'vitest';
import { spiceName, spiceValue } from '../../src/netlist/spiceName.ts';

describe('nombres y valores con $…$ en la netlist (#328)', () => {
  it('nombres: sin $ ni llaves ni barras (ngspice lee $ como comentario)', () => {
    expect(spiceName('$R_2$')).toBe('R_2');
    expect(spiceName('$V_{out}$')).toBe('V_out');
    expect(spiceName('$R_{fe}$')).toBe('R_fe');
    expect(spiceName('$\\omega_0$')).toBe('omega_0');
    expect(spiceName('$i_{DS}^2$')).toBe('i_DS2');
  });

  it('sin $, el nombre no cambia', () => {
    for (const n of ['R1', 'out', 'N001', 'q[3]', 'Vcc+', '0']) expect(spiceName(n)).toBe(n);
  });

  it('valores: \\mu es micro (no mili) y los espacios de LaTeX desaparecen', () => {
    expect(spiceValue('$4.7\\,\\mu F$')).toBe('4.7uF');
    expect(spiceValue('$100\\,\\Omega$')).toBe('100');
    expect(spiceValue('$2.2k$')).toBe('2.2k');
    expect(spiceValue('{R1*2}')).toBe('{R1*2}');
    expect(spiceValue('1k')).toBe('1k');
    // como viene del .asc de LTspice, con la barra doble
    expect(spiceValue('$4.7\\\\,\\\\mu F$')).toBe('4.7uF');
    expect(spiceValue('$1\\\\,k\\\\Omega$')).toBe('1k');
    expect(spiceName('$\\\\omega_0$')).toBe('omega_0');
  });
});
