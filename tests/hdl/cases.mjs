// Casos de tests/hdl/run.mjs: Verilog, el circuito que lo usa y qué se espera.
// `check(at, block)`: at(nodo, t) es el valor del vector en t (V o digital); devuelve un string si algo está mal.
// `compare`: [nodo, tiempos] a comparar contra ngspice nativo.

const CLK = 'V1 clk 0 PULSE(0 5 0 1n 1n 49n 100n)';

export const CASES = [
  {
    name: 'combinacional: sumador completo',
    file: 'fa.v',
    verilog: `module fa(input a, input b, input ci, output s, output co);
  assign {co, s} = a + b + ci;
endmodule`,
    circuit: `Va a 0 PULSE(0 5 0 1n 1n 99n 200n)
Vb b 0 PULSE(0 5 0 1n 1n 199n 400n)
Vc ci 0 PULSE(0 5 0 1n 1n 399n 800n)
X1 a b ci s co fa vcc=5 tpd=1n
.tran 1n 800n`,
    check: (at) => {
      for (let k = 0; k < 8; k++) {
        const tt = k * 100e-9 + 50e-9;
        const n = ['a', 'b', 'ci'].filter((x) => at(x, tt) > 2.5).length;
        const s = at('s', tt) > 2.5 ? 1 : 0;
        const co = at('co', tt) > 2.5 ? 1 : 0;
        if (s !== (n & 1) || co !== n >> 1) return `a+b+ci=${n} en ${tt}: s=${s} co=${co}`;
      }
    },
    compare: ['s', [50e-9, 150e-9, 350e-9, 750e-9]],
  },
  {
    name: 'secuencial: contador de 4 bits con reset asíncrono y enable',
    file: 'counter.v',
    verilog: `module counter #(parameter N = 4) (
  input clk, input rst, input en,
  output reg [N-1:0] q,
  output tc
);
  always @(posedge clk or posedge rst)
    if (rst) q <= 0;
    else if (en) q <= q + 1;
  assign tc = &q;
endmodule`,
    circuit: `${CLK}
Vr rst 0 PWL(0 5 20n 5 21n 0)
Ve en 0 5
X1 clk rst en q_3 q_2 q_1 q_0 tc counter vcc=5 tpd=1n
.tran 1n 2u`,
    check: (at, block) => {
      if (block.inputs.join() !== 'clk,rst,en' || block.outputs.join() !== 'q_3,q_2,q_1,q_0,tc') return `pines ${block.inputs} / ${block.outputs}`;
      // flancos de subida en 100n·k + ~1n: después del k-ésimo flanco (k ≥ 1) vale k mod 16
      for (const k of [1, 2, 7, 15, 16, 19]) {
        const tt = k * 100e-9 + 50e-9;
        const q = [3, 2, 1, 0].reduce((acc, b) => acc * 2 + (at(`q_${b}`, tt) > 2.5 ? 1 : 0), 0);
        if (q !== k % 16) return `q después del flanco ${k}: ${q}`;
      }
      if (at('tc', 15 * 100e-9 + 50e-9) < 2.5) return 'tc no se activa en 15';
      // el nodo digital interno se ve como Dig(x1.q_0_d)
      if (at('x1.q_0_d', 150e-9) !== 1) return 'Dig(x1.q_0_d) no vale 1 después del primer flanco';
    },
    compare: ['q_1', [250e-9, 350e-9, 650e-9]],
  },
  {
    name: 'valor inicial (reg = 1) y latch',
    file: 'lat.v',
    verilog: `module lat(input d, input g, output reg q, output reg t);
  initial t = 1'b1;
  always @* if (g) q = d;
  always @(posedge g) t <= ~t;
endmodule`,
    circuit: `Vd d 0 PULSE(0 5 0 1n 1n 29n 60n)
Vg g 0 PULSE(0 5 100n 1n 1n 99n 200n)
X1 d g q t lat
.tran 1n 600n`,
    check: (at) => {
      if (at('t', 50e-9) < 2.5) return 't no arranca en 1';
      if (at('t', 150e-9) > 2.5) return 't no cambia en el primer flanco de g';
      // con g alto q sigue a d; con g bajo retiene
      if ((at('q', 115e-9) > 2.5) !== (at('d', 113e-9) > 2.5)) return 'q no sigue a d con g alto';
    },
  },
  {
    name: 'error: puerto inout',
    file: 'bidi.v',
    verilog: `module bidi(inout x, input e, output y); assign x = e ? 1'b1 : 1'bz; assign y = x; endmodule`,
    expectError: /inout/,
  },
  {
    name: 'error de sintaxis',
    file: 'bad.v',
    verilog: `module bad(input a, output y); assign y = ; endmodule`,
    expectError: /syntax error/i,
  },
];
