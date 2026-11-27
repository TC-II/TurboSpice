import { describe, expect, it } from 'vitest';
import { parseVcd, vcdValue } from '../../src/waveform/vcd.ts';

// (como lo escribe Icarus: $dumpvars con los valores iniciales, y una señal del dut con el mismo código que la del testbench)
const VCD = `$date
	Fri Nov 27 02:19:58 2026
$end
$timescale
	1ps
$end
$scope module cnt_tb $end
$var reg 1 ! clk $end
$var wire 4 " q [3:0] $end
$var real 1 # v $end
$scope module dut $end
$var wire 1 ! clk $end
$upscope $end
$upscope $end
$enddefinitions $end
#0
$dumpvars
0!
bxxxx "
r0.5 #
$end
#5000
1!
b0 "
#10000
0!
b1010 "
#15000
1!
bz "
`;

describe('vcd', () => {
  it('las señales, con su módulo y ancho; sin las real', () => {
    const v = parseVcd(VCD);
    expect(v.signals.map((s) => [s.scope.join('.'), s.name, s.bits])).toEqual([
      ['cnt_tb', 'clk', 1],
      ['cnt_tb', 'q', 4],
      ['cnt_tb.dut', 'clk', 1],
    ]);
    expect(v.end).toBeCloseTo(15e-9);
  });
  it('los cambios en segundos, con X y Z; dos variables con el mismo código comparten los datos', () => {
    const [clk, q, dutClk] = parseVcd(VCD).signals;
    expect([...clk.x]).toEqual([0, 5e-9, 10e-9, 15e-9]);
    expect([...clk.y]).toEqual([0, 1, 0, 1]);
    expect([...q.y]).toEqual([0.5, 0, 10, NaN]);
    expect(dutClk.y).toBe(clk.y);
  });
  it('un valor más corto que el bus se extiende como dice el formato', () => {
    expect(vcdValue('1', 4)).toBe(1);
    expect(vcdValue('z', 4)).toBeNaN();
    expect(vcdValue('x1', 4)).toBe(0.5);
    expect(vcdValue('z1', 3)).toBe(0.5);
  });
});
