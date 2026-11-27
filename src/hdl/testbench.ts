// Testbenches de Verilog (*_tb.v): el módulo sin puertos corre con el libvvp de ngspice, como raíz
// junto a un módulo de un pin (d_cosim necesita una salida). El veredicto: un warning de
// compilación (-Wall) es FAIL; si no, PASS si la salida dice PASS y no FAIL (un $fatal dice
// "FATAL: … FAIL: …").
import type { IcarusResult } from './icarus.ts';
import { cosimSubckt } from './synth.ts';

export const TB_TOP = '__tb';
export const TB_FILE = `${TB_TOP}.v`;
export const TB_VVP = `${TB_TOP}.vvp`;
export const TB_WRAP = `module ${TB_TOP}(output o);\n  assign o = 1'b0;\nendmodule\n`;

/** El módulo de más arriba de un testbench: el primero del archivo */
export const tbModule = (text: string) => /^\s*module\s+([A-Za-z_][\w$]*)/m.exec(text.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, ''))?.[1];

/**
 * La netlist que corre el testbench compilado (compileIcarus con TB_WRAP y `roots: [tbModule]`).
 * `tstop`: tiempo simulado máximo en segundos; ngspice sigue después del $finish, pero sin eventos
 * es barato. Un testbench sin $finish con un reloj de 100 MHz tarda ~1 s por cada 10 ms simulados.
 */
export function tbNetlist(r: IcarusResult, tstop = 1): string {
  const block = cosimSubckt(TB_TOP, r.ports ?? [], r.params ?? {}, TB_VVP, TB_FILE);
  return `* testbench\n${block.subckt}\nX1 o ${TB_TOP}\nR1 o 0 1k\n.tran ${tstop / 1000} ${tstop}\n.end\n`;
}

export interface TbVerdict {
  pass: boolean;
  /** llegó a $finish (o $fatal) */
  finished: boolean;
  /** lo que imprimió el testbench ($display, $fatal…), sin las líneas de ngspice */
  output: string;
}

/** El veredicto, del log de la compilación y el de ngspice */
export function tbVerdict(compileLog: string, simLog: string[]): TbVerdict {
  if (/warning/i.test(compileLog)) return { pass: false, finished: false, output: compileLog };
  // (lo de Icarus empieza después de la tabla de la solución inicial: «nodo  tensión» bajo «----  -------»)
  let from = simLog.findIndex((l) => /^-+\s+-+$/.test(l.trim())) + 1;
  while (from > 0 && from < simLog.length && /^\S+\s+-?[\d.]+(e[-+]?\d+)?$/i.test(simLog[from].trim())) from++;
  const lines = simLog.slice(from).filter((l) => !/^No\. of Data Rows/.test(l));
  const output = lines.join('\n');
  return { pass: /PASS/i.test(output) && !/FAIL/i.test(output), finished: /\$finish called|^FATAL:/m.test(output), output };
}

/** Lo que muestra la vista del testbench */
export interface TbOutcome {
  error?: string;
  /** salida de Icarus al compilar (avisos) */
  compileLog: string;
  verdict?: TbVerdict;
  /** el .vcd que escribió ($dumpvars) */
  vcd?: string;
  /** nombres de estado de las señales (states.ts) */
  states?: Map<string, Map<number, string>>;
}

/** Un testbench nuevo (+ Nuevo › Verilog con un nombre *_tb) */
export const tbTemplate = (name: string) => `\`timescale 1ns/1ps\nmodule ${name};\n  initial begin\n    $display("PASS");\n    $finish;\n  end\nendmodule\n`;
