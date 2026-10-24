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
      const pins = block.pins.map((p) => `${p.dir}:${p.name}`).join();
      if (pins !== 'in:clk,in:rst,in:en,out:q_3,out:q_2,out:q_1,out:q_0,out:tc') return `pines ${pins}`;
      if (block.params.N !== '4') return `parameter N = ${block.params.N}`;
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
    name: 'parameter por instancia: el mismo contador con N=6 (otra síntesis, chparam)',
    file: 'cnt.v',
    verilog: `module cnt #(parameter N = 4) (input clk, output reg [N-1:0] q);
  always @(posedge clk) q <= q + 1;
endmodule`,
    top: 'cnt',
    params: { N: '6' },
    circuit: `${CLK}
X1 clk q_5 q_4 q_3 q_2 q_1 q_0 cnt
.tran 1n 7u`,
    check: (at, block) => {
      if (block.pins.length !== 7) return `pines ${block.pins.map((p) => p.name)}`;
      // después de 41 flancos (el primero en t = 0) vale 41: no cabe en 4 bits
      const tt = 40 * 100e-9 + 50e-9;
      const q = [5, 4, 3, 2, 1, 0].reduce((acc, b) => acc * 2 + (at(`q_${b}`, tt) > 2.5 ? 1 : 0), 0);
      if (q !== 41) return `q = ${q} (esperaba 41: hay un flanco en t = 0)`;
    },
  },
  {
    name: 'tri-state e inout: bus compartido con pull-up',
    file: 'tri.v',
    verilog: `module tri_io(input a, input en, inout b, output y, output c);
  assign y = en ? a : 1'bz;
  assign b = en ? ~a : 1'bz;
  assign c = b;
endmodule`,
    circuit: `Va a 0 PULSE(0 5 0 1n 1n 49n 100n)
Ven en 0 PULSE(0 5 0 1n 1n 199n 400n)
Vp p 0 5
Ry y p 10k
Rb b p 10k
X1 a en b y c tri_io
.tran 1n 400n`,
    check: (at, block) => {
      if (block.pins.map((p) => `${p.dir}:${p.name}`).join() !== 'in:a,in:en,inout:b,out:y,out:c') return `pines ${block.pins.map((p) => p.dir + ':' + p.name)}`;
      // habilitado (0…200 ns): y = a, b = ~a; deshabilitado: el pull-up los lleva a 5 V y c lee b
      if (at('y', 30e-9) < 4.5 || at('y', 80e-9) > 0.5) return `y habilitado: ${at('y', 30e-9)} / ${at('y', 80e-9)}`;
      if (at('b', 30e-9) > 0.5 || at('b', 80e-9) < 4.5) return `b habilitado: ${at('b', 30e-9)} / ${at('b', 80e-9)}`;
      if (at('y', 280e-9) < 4.9 || at('b', 280e-9) < 4.9) return `alta impedancia: y=${at('y', 280e-9)} b=${at('b', 280e-9)}`;
      if (at('c', 280e-9) < 4.5) return `c lee el bus: ${at('c', 280e-9)}`;
    },
    compare: ['b', [30e-9, 80e-9, 280e-9]],
  },
  {
    name: 'memoria de 16×4 (Yosys la pasa a flip-flops)',
    file: 'ram.v',
    verilog: `module ram(input clk, input we, input [1:0] a, input [3:0] d, output [3:0] q);
  reg [3:0] mem [0:3];
  always @(posedge clk) if (we) mem[a] <= d;
  assign q = mem[a];
endmodule`,
    // escribe 1010 en la dirección 2 y la vuelve a leer después de pasar por la 0
    circuit: `${CLK}
Vwe we 0 PWL(0 5 140n 5 141n 0)
Va1 a_1 0 PWL(0 5 140n 5 141n 0 240n 0 241n 5)
Va0 a_0 0 0
Vd3 d_3 0 5
Vd2 d_2 0 0
Vd1 d_1 0 5
Vd0 d_0 0 0
X1 clk we a_1 a_0 d_3 d_2 d_1 d_0 q_3 q_2 q_1 q_0 ram
.tran 1n 300n`,
    check: (at) => {
      const q = (tt) => [3, 2, 1, 0].map((b) => (at(`q_${b}`, tt) > 2.5 ? 1 : 0)).join('');
      if (q(280e-9) !== '1010') return `leído de la dirección 2: ${q(280e-9)}`;
      if (q(200e-9) !== '0000') return `dirección 0: ${q(200e-9)}`;
    },
  },
  {
    name: 'interfaz eléctrica: histéresis (vil > vih), niveles y corriente de salida',
    file: 'buf.v',
    verilog: `module buf1(input a, output y); assign y = a; endmodule`,
    // entrada triangular 0…5 V; vil=3 vih=2 (Schmitt): sube a 1 recién en 3 V y baja en 2 V
    circuit: `Va a 0 PWL(0 0 100n 5 200n 0)
X1 a y buf1 vcc=5 vil=3 vih=2 vol=0.2 voh=4.5 iol=1m ioh=1m tr=1n tf=1n tpd=1n
Rl y 0 10k
X2 a y2 buf1 vcc=5 vil=3 vih=2 vol=0.2 voh=4.5 iol=1m ioh=1m tr=1n tf=1n tpd=1n
Rl2 y2 0 1k
.tran 0.1n 200n`,
    check: (at) => {
      // sube cuando a cruza 3 V (60 ns), baja cuando cruza 2 V de bajada (160 ns)
      if (at('y', 55e-9) > 1 || at('y', 70e-9) < 4) return `subida: ${at('y', 55e-9)} / ${at('y', 70e-9)}`;
      if (at('y', 150e-9) < 4 || at('y', 170e-9) > 1) return `bajada: ${at('y', 150e-9)} / ${at('y', 170e-9)}`;
      if (Math.abs(at('y', 100e-9) - 4.5) > 0.1) return `voh = ${at('y', 100e-9)} (esperaba 4.5)`;
      // con 1 mA como máximo, 1 kΩ no llega a 4.5 V: ≤ ~1 V
      if (at('y2', 100e-9) > 1.2) return `con 1 kΩ y 1 mA máximo: ${at('y2', 100e-9)}`;
    },
    compare: ['y2', [100e-9]],
  },
  {
    name: 'comportamiento (Icarus): retardos #, initial y un contador',
    file: 'beh.v',
    behavioral: true,
    verilog: `\`timescale 1ns/1ps
module beh(input clk, output reg y, output reg [3:0] cnt);
  initial begin y = 0; cnt = 0; end
  always @(posedge clk) begin
    #5 y = ~y;
    cnt <= cnt + 1;
  end
endmodule`,
    circuit: `${CLK}
X1 clk y cnt_3 cnt_2 cnt_1 cnt_0 beh
.tran 1n 500n`,
    check: (at, block) => {
      if (block.pins.map((p) => p.name).join() !== 'clk,y,cnt_3,cnt_2,cnt_1,cnt_0') return `pines ${block.pins.map((p) => p.name)}`;
      // y cambia 5 ns después de cada flanco de subida del reloj (≈0,5 ns + 5 ns + retardo y rampa)
      if (at('y', 4e-9) > 2.5 || at('y', 50e-9) < 2.5 || at('y', 150e-9) > 2.5) return `y: ${at('y', 4e-9)} ${at('y', 50e-9)} ${at('y', 150e-9)}`;
      const cnt = (tt) => [3, 2, 1, 0].reduce((a, b) => a * 2 + (at(`cnt_${b}`, tt) > 2.5 ? 1 : 0), 0);
      if (cnt(450e-9) !== 5) return `cnt = ${cnt(450e-9)} (esperaba 5)`;
    },
  },
  {
    name: 'comportamiento (Icarus): generador con delays, sin entradas',
    file: 'ring.v',
    behavioral: true,
    verilog: `\`timescale 1us/100ns
module ring(output reg [4:0] out);
  reg t;
  initial out = 0;
  always begin
    #1;
    t = out[4];
    out <<= 1;
    out[0] = ~t;
  end
endmodule`,
    circuit: `X1 out_4 out_3 out_2 out_1 out_0 ring
.tran 0.1u 20u`,
    check: (at) => {
      // anillo de Johnson de 5 bits: out[0] es 1 de 1 µs a 6 µs y 0 de 6 µs a 11 µs
      if (at('out_0', 3e-6) < 2.5 || at('out_0', 8e-6) > 2.5 || at('out_4', 7e-6) < 2.5) return `out_0 ${at('out_0', 3e-6)} ${at('out_0', 8e-6)} out_4 ${at('out_4', 7e-6)}`;
    },
  },
  {
    name: 'comportamiento (Icarus): parameter por instancia (defparam)',
    file: 'cntp.v',
    behavioral: true,
    top: 'cntp',
    params: { N: '6' },
    verilog: `\`timescale 1ns/1ps
module cntp #(parameter N = 4) (input clk, output reg [N-1:0] q);
  initial q = 0;
  always @(posedge clk) q <= q + 1;
endmodule`,
    circuit: `${CLK}
X1 clk q_5 q_4 q_3 q_2 q_1 q_0 cntp
.tran 1n 4u`,
    check: (at, block) => {
      if (block.pins.length !== 7) return `pines ${block.pins.map((p) => p.name)}`;
      const q = [5, 4, 3, 2, 1, 0].reduce((a, b) => a * 2 + (at(`q_${b}`, 3.05e-6) > 2.5 ? 1 : 0), 0);
      if (q !== 31) return `q = ${q} (esperaba 31)`;
    },
  },
  {
    name: 'error de sintaxis',
    file: 'bad.v',
    verilog: `module bad(input a, output y); assign y = ; endmodule`,
    expectError: /syntax error/i,
  },
];
