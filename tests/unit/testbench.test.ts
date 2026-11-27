import { describe, expect, it } from 'vitest';
import { tbModule, tbVerdict } from '../../src/hdl/testbench.ts';

// el log de ngspice de un testbench
const log = (...tb: string[]) => [
  'Circuit: * testbench',
  'Initial Transient Solution',
  '--------------------------',
  'Node                                   Voltage',
  '----                                   -------',
  'o                                            0',
  'a.x1.ab_o#branch_1_0                         0',
  ...tb,
  'No. of Data Rows : 1008',
];

describe('testbench', () => {
  it('PASS: dice PASS, no FAIL y llegó a $finish', () => {
    const v = tbVerdict('', log('VCD info: dumpfile dump.vcd opened for output.', 'PASS', '/src/frag_tb.v:55: $finish called at 41000 (1ps)'));
    expect(v).toEqual({ pass: true, finished: true, output: 'VCD info: dumpfile dump.vcd opened for output.\nPASS\n/src/frag_tb.v:55: $finish called at 41000 (1ps)' });
  });
  it('FAIL: un $fatal, o PASS y FAIL, o un warning al compilar', () => {
    const fatal = tbVerdict('', log('FAIL (i): obtenido=0000 esperado=0001', 'FATAL: frag_tb.v:54: FAIL: 1 errores', '       Time: 41000  Scope: frag_tb'));
    expect(fatal.pass).toBe(false);
    expect(fatal.finished).toBe(true);
    expect(tbVerdict('', log('PASS', 'FAIL x')).pass).toBe(false);
    expect(tbVerdict('a.v:3: warning: Port 1 (a) of m expects 4 bits, got 1.', log('PASS')).pass).toBe(false);
  });
  it('sin $finish: no terminó', () => {
    expect(tbVerdict('', log('arranca')).finished).toBe(false);
  });
  it('el módulo del testbench: el primero, sin comentarios', () => {
    expect(tbModule('// module viejo;\n`timescale 1ns/1ps\nmodule frag_tb;\nendmodule\nmodule otro; endmodule')).toBe('frag_tb');
  });
});
