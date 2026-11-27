// Tabla de verdad de un módulo Verilog: un testbench generado recorre todas las combinaciones de
// las entradas (la primera entrada es el bit más significativo) y muestra las salidas; corre como
// «Correr testbench» (testbench.ts). Para un módulo combinacional: en uno con estado, cada fila
// depende de las anteriores.
import type { IcarusPort } from './icarus.ts';

export const TT_TOP = '__tt';
export const TT_FILE = `${TT_TOP}.v`;
/** Bits de entrada como mucho: 2^10 filas */
export const TT_MAX_BITS = 10;

const range = (hi: number, lo: number) => (hi === lo ? `[${hi}]` : `[${hi}:${lo}]`);

/** El testbench que recorre las entradas de `module`; null si no tiene entradas o salidas, o son demasiadas */
export function truthTableTb(module: string, ports: IcarusPort[]): string | null {
  const ins = ports.filter((p) => p.dir === 'in');
  const outs = ports.filter((p) => p.dir === 'out');
  const n = ins.reduce((a, p) => a + p.bits, 0);
  const m = outs.reduce((a, p) => a + p.bits, 0);
  if (!n || !m || n > TT_MAX_BITS) return null;
  // (cada puerto, su tramo de i u o: el primero, en los bits más altos)
  let hi = { i: n - 1, o: m - 1 };
  const conns = ports
    .filter((p) => p.dir !== 'inout')
    .map((p) => {
      const k = p.dir === 'in' ? 'i' : 'o';
      const c = `.${p.name}(${k}${range(hi[k], hi[k] - p.bits + 1)})`;
      hi = { ...hi, [k]: hi[k] - p.bits };
      return c;
    });
  return [
    '`timescale 1ns/1ps',
    `module ${TT_TOP};`,
    `  reg [${n - 1}:0] i;`,
    `  wire [${m - 1}:0] o;`,
    `  ${module} u (${conns.join(', ')});`,
    '  integer k;',
    '  initial begin',
    `    for (k = 0; k < ${2 ** n}; k = k + 1) begin`,
    '      i = k;',
    '      #1 $display("TT %b %b", i, o);',
    '    end',
    '    $finish;',
    '  end',
    'endmodule',
    '',
  ].join('\n');
}

export interface TruthTable {
  inputs: IcarusPort[];
  outputs: IcarusPort[];
  /** una fila por combinación: el valor de cada entrada y después de cada salida, en binario (con x y z) */
  rows: string[][];
}

/** La tabla, de lo que imprimió el testbench */
export function parseTruthTable(log: string[], ports: IcarusPort[]): TruthTable {
  const inputs = ports.filter((p) => p.dir === 'in');
  const outputs = ports.filter((p) => p.dir === 'out');
  const split = (bits: string, list: IcarusPort[]) => {
    let at = 0;
    return list.map((p) => bits.slice(at, (at += p.bits)));
  };
  const rows = log.flatMap((l) => {
    const m = /^TT ([01xz]+) ([01xz]+)$/i.exec(l.trim());
    return m ? [[...split(m[1], inputs), ...split(m[2], outputs)]] : [];
  });
  return { inputs, outputs, rows };
}
