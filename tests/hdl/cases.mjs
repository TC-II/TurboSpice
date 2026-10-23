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
    name: 'PWM de 4 bits: ciclo de trabajo d/16 y salida filtrada',
    file: 'pwm.v',
    verilog: `module pwm (input clk, input rst, input [3:0] d, output reg out, output wrap);
  reg [3:0] cnt;
  always @(posedge clk or posedge rst)
    if (rst) begin cnt <= 0; out <= 0; end
    else begin cnt <= cnt + 1; out <= (cnt < d); end
  assign wrap = &cnt;
endmodule`,
    circuit: `${CLK}
Vr rst 0 PWL(0 5 20n 5 21n 0)
V3 d3 0 5
V2 d2 0 0
V1b d1 0 5
V0 d0 0 0
X1 clk rst d3 d2 d1 d0 out wrap pwm
R1 out f 10k
C1 f 0 1n
.tran 1n 40u`,
    check: (at) => {
      // d = 1010 = 10: 10 de cada 16 ciclos en alto; el RC (τ = 10 µs) promedia ≈ 5·10/16·(1020/…)
      let high = 0;
      for (let k = 0; k < 160; k++) if (at('out', 20e-6 + k * 10e-9 + 5e-9) > 2.5) high++;
      if (Math.abs(high - 100) > 2) return `out alto ${high}/160 muestras (esperaba ~100)`;
      const vf = at('f', 39e-6);
      if (Math.abs(vf - 3.1) > 0.15) return `V(f) = ${vf} (esperaba ~3.1)`;
    },
    compare: ['f', [10e-6, 30e-6]],
  },
  {
    name: 'dos módulos en el archivo y constantes',
    file: 'two.v',
    verilog: `module inv(input a, output y); assign y = ~a; endmodule
module top(input a, output y, output one, output zero);
  inv u1(.a(a), .y(y));
  assign one = 1'b1;
  assign zero = 1'b0;
endmodule`,
    top: 'top',
    circuit: `Va a 0 PULSE(0 5 0 1n 1n 49n 100n)
X1 a y one zero top
.tran 1n 200n`,
    check: (at, block) => {
      if (block.name !== 'top') return `módulo ${block.name}`;
      if (at('one', 50e-9) < 4.9 || at('zero', 50e-9) > 0.1) return 'constantes mal';
      if ((at('y', 30e-9) > 2.5) === (at('a', 28e-9) > 2.5)) return 'y no es ~a';
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
