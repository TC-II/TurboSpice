// Casos de tests/hdl/run.mjs: Verilog, el circuito que lo usa y qué se espera.
// `check(at, block)`: at(nodo, t) es el valor del vector en t (V o digital); devuelve un string si algo está mal.
// `compare`: [nodo, tiempos] a comparar contra ngspice nativo.
import { readFileSync, readdirSync } from 'node:fs';

// la biblioteca DSP (#366), toda junta: un caso la usa desde un módulo de más arriba
const DSP_DIR = new URL('../../library/verilog/DSP/', import.meta.url);
const DSP = readdirSync(DSP_DIR)
  .filter((f) => f.endsWith('.v'))
  .map((f) => readFileSync(new URL(f, DSP_DIR), 'utf8'))
  .join('\n');
/** Valor con signo de un bus de `w` bits leído como tensiones (nombre_7 … nombre_0) */
const word = (at, name, w, tt) => {
  const u = Array.from({ length: w }, (_, k) => w - 1 - k).reduce((acc, b) => acc * 2 + (at(`${name}_${b}`, tt) > 2.5 ? 1 : 0), 0);
  return u >= 2 ** (w - 1) ? u - 2 ** w : u;
};
/** Valor sin signo de un bus de `w` bits */
const uword = (at, name, w, tt) => Array.from({ length: w }, (_, k) => w - 1 - k).reduce((acc, b) => acc * 2 + (at(w > 1 ? `${name}_${b}` : name, tt) > 2.5 ? 1 : 0), 0);
const nodes = (name, w) => Array.from({ length: w }, (_, k) => `${name}_${w - 1 - k}`).join(' ');
/** dsp_tap/dsp_mul en Q1.7 con redondeo y saturación */
const q7 = (a, b) => Math.max(-128, Math.min(127, Math.floor((a * b + 64) / 128)));
const FIR = [32, -64, 96, 16];

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
      if (at('q', 115e-9) > 2.5 !== at('d', 113e-9) > 2.5) return 'q no sigue a d con g alto';
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
      if (at('y', 30e-9) > 2.5 === at('a', 28e-9) > 2.5) return 'y no es ~a';
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
    // y: salida pura (dac_bridge, niveles exactos); z: tri-state (bidi_bridge, con corriente máxima)
    verilog: `module buf1(input a, input en, output y, output z);
  assign y = a;
  assign z = en ? a : 1'bz;
endmodule`,
    // entrada triangular 0…5 V; vil=3 vih=2 (Schmitt): sube a 1 recién en 3 V y baja en 2 V
    circuit: `Va a 0 PWL(0 0 100n 5 200n 0)
Ven en 0 5
X1 a en y z buf1 vcc=5 vil=3 vih=2 vol=0.2 voh=4.5 iol=1m ioh=1m tr=1n tf=1n tpd=1n
Rl y 0 1k
Rz z 0 1k
.tran 0.1n 200n`,
    check: (at) => {
      // sube cuando a cruza 3 V (60 ns), baja cuando cruza 2 V de bajada (160 ns)
      if (at('y', 55e-9) > 1 || at('y', 70e-9) < 4) return `subida: ${at('y', 55e-9)} / ${at('y', 70e-9)}`;
      if (at('y', 150e-9) < 4 || at('y', 170e-9) > 1) return `bajada: ${at('y', 150e-9)} / ${at('y', 170e-9)}`;
      // la salida pura llega a voh aunque la carga sea de 1 kΩ; vol también es exacto
      if (Math.abs(at('y', 100e-9) - 4.5) > 0.01) return `voh = ${at('y', 100e-9)} (esperaba 4.5)`;
      if (Math.abs(at('y', 20e-9) - 0.2) > 0.01) return `vol = ${at('y', 20e-9)} (esperaba 0.2)`;
      // la tri-state, con 1 mA como máximo, en 1 kΩ no llega a 4.5 V: ≤ ~1 V
      if (at('z', 100e-9) > 1.2) return `con 1 kΩ y 1 mA máximo: ${at('z', 100e-9)}`;
    },
    compare: ['z', [100e-9]],
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
    name: 'DSP (#366): constantes, sumador y restador con saturación, multiplicador, negador, ×2^K',
    file: 'arith.v',
    top: 'arith',
    verilog: `${DSP}
module arith(output signed [7:0] add, output signed [7:0] sub, output signed [7:0] mul, output signed [7:0] neg, output signed [7:0] sh, output signed [7:0] wrap);
  wire signed [7:0] a, b, m;
  dsp_const #(.W(8), .VALUE(100)) ca(.y(a));
  dsp_const #(.W(8), .VALUE(-60)) cb(.y(b));
  dsp_const #(.W(8), .VALUE(-128)) cm(.y(m));
  dsp_add #(.W(8)) u1(.a(a), .b(a), .y(add));
  dsp_sub #(.W(8)) u2(.a(a), .b(b), .y(sub));
  dsp_mul #(.W(8), .F(7)) u3(.a(a), .b(b), .y(mul));
  dsp_neg #(.W(8)) u4(.x(m), .y(neg));
  dsp_shift #(.W(8), .K(-2)) u5(.x(b), .y(sh));
  dsp_add #(.W(8), .SAT(0)) u6(.a(a), .b(a), .y(wrap));
endmodule`,
    circuit: `X1 ${['add', 'sub', 'mul', 'neg', 'sh', 'wrap'].map((n) => nodes(n, 8)).join(' ')} arith
.tran 1n 20n`,
    check: (at) => {
      const want = { add: 127, sub: 127, mul: q7(100, -60), neg: 127, sh: -15, wrap: 200 - 256 };
      for (const [n, v] of Object.entries(want)) {
        const got = word(at, n, 8, 10e-9);
        if (got !== v) return `${n} = ${got} (esperaba ${v})`;
      }
    },
  },
  {
    name: 'DSP (#366): FIR de 4 taps (impulso → retardos z⁻¹ → taps → sumadores)',
    file: 'fir4.v',
    top: 'fir4',
    verilog: `${DSP}
module fir4(input clk, output signed [7:0] y);
  wire signed [7:0] x, d1, d2, d3, p0, p1, p2, p3, s1, s2;
  dsp_impulse #(.W(8), .VALUE(127)) u0(.clk(clk), .y(x));
  dsp_delay #(.W(8)) z1(.clk(clk), .d(x), .q(d1));
  dsp_delay #(.W(8)) z2(.clk(clk), .d(d1), .q(d2));
  dsp_delay #(.W(8)) z3(.clk(clk), .d(d2), .q(d3));
${FIR.map((c, k) => `  dsp_tap #(.W(8), .F(7), .COEF(${c})) t${k}(.x(${k ? `d${k}` : 'x'}), .y(p${k}));`).join('\n')}
  dsp_add #(.W(8)) a1(.a(p0), .b(p1), .y(s1));
  dsp_add #(.W(8)) a2(.a(p2), .b(p3), .y(s2));
  dsp_add #(.W(8)) a3(.a(s1), .b(s2), .y(y));
endmodule`,
    circuit: `${CLK}
X1 clk ${nodes('y', 8)} fir4 tpd=1n
.tran 1n 800n`,
    check: (at) => {
      // (el reloj sube en 0, 100n…): en el ciclo k sale el coeficiente k por el impulso
      const want = [...FIR.map((c) => q7(c, 127)), 0, 0];
      for (let k = 0; k < want.length; k++) {
        const got = word(at, 'y', 8, k * 100e-9 + 50e-9);
        if (got !== want[k]) return `y en el ciclo ${k}: ${got} (esperaba ${want[k]})`;
      }
    },
  },
  {
    name: 'DSP (#366): parameter negativo por instancia (dsp_shift con K=-2; Yosys no lo acepta en -chparam)',
    file: 'dsp_shift.v',
    top: 'dsp_shift',
    params: { K: '-2', W: '8' },
    verilog: readFileSync(new URL('dsp_shift.v', DSP_DIR), 'utf8'),
    // x = −100 (0x9C), un bit por fuente
    circuit: `${Array.from({ length: 8 }, (_, b) => `Vx${b} x_${b} 0 ${(0x9c >> b) & 1 ? 5 : 0}`).join('\n')}
X1 ${nodes('x', 8)} ${nodes('y', 8)} dsp_shift
.tran 1n 20n`,
    check: (at) => {
      const got = word(at, 'y', 8, 10e-9);
      if (got !== -25) return `y = ${got} (esperaba −100 >> 2 = −25)`;
    },
  },
  {
    name: 'DSP (#366): CIC de 1 etapa por 4 (integrador, ↓4 y peine con su reloj clko): un escalón de 5 da 20',
    file: 'cic.v',
    top: 'cic',
    verilog: `${DSP}
module cic(input clk, output signed [7:0] y, output slow);
  wire signed [7:0] x, i, id, d, dd;
  dsp_step #(.W(8), .VALUE(5)) u0(.clk(clk), .y(x));
  dsp_add #(.W(8), .SAT(0)) a1(.a(x), .b(id), .y(i));
  dsp_delay #(.W(8)) z1(.clk(clk), .d(i), .q(id));
  dsp_downsample #(.W(8), .M(4)) ds(.clk(clk), .x(i), .y(d), .clko(slow));
  dsp_delay #(.W(8)) z2(.clk(slow), .d(d), .q(dd));
  dsp_sub #(.W(8), .SAT(0)) c1(.a(d), .b(dd), .y(y));
endmodule`,
    circuit: `${CLK}
X1 clk ${nodes('y', 8)} slow cic tpd=1n
.tran 1n 4u`,
    check: (at) => {
      // (el integrador envuelve: 5·t pasa de 127 enseguida; el peine lo deshace)
      for (const tt of [2.05e-6, 2.65e-6, 3.45e-6, 3.95e-6]) {
        const got = word(at, 'y', 8, tt);
        if (got !== 20) return `y en ${tt * 1e6} µs: ${got} (esperaba 4·5 = 20)`;
      }
    },
  },
  {
    name: 'DSP (#366): aritmética, lógica de bits y ruteo (abs, requant, Σ4, min/max, comparador, #1, CLZ, AND/OR/XOR/NOT, máscara, rotación, rev, Gray, paridad, MUX, decodificador, prioridad, split/join)',
    file: 'comb.v',
    top: 'comb',
    verilog: `${DSP}
module comb(
  output signed [7:0] abs_b, output signed [7:0] rq_a, output signed [7:0] rq_up, output signed [7:0] s4,
  output signed [7:0] mn, output signed [7:0] mx, output lt, output eq, output gt,
  output [4:0] pop, output [4:0] clz, output [7:0] and_, output [7:0] or_, output [7:0] xor_, output [7:0] not_,
  output [7:0] msk, output [7:0] rot, output [7:0] rev, output [7:0] gray, output [7:0] bin, output par,
  output [7:0] m2, output [7:0] m4, output [7:0] dec, output [2:0] idx, output valid, output [7:0] hi, output [7:0] lo
);
  wire signed [7:0] a, b, c;
  wire [15:0] j;
  dsp_const #(.W(8), .VALUE(100)) ca(.y(a));
  dsp_const #(.W(8), .VALUE(-60)) cb(.y(b));
  dsp_const #(.W(8), .VALUE(7)) cc(.y(c));
  dsp_abs #(.W(8)) u1(.x(b), .y(abs_b));
  dsp_requant #(.W(8), .SHIFT(2)) u2(.x(a), .y(rq_a));
  dsp_requant #(.W(8), .SHIFT(-1)) u3(.x(a), .y(rq_up));
  dsp_sum4 #(.W(8)) u4(.a(a), .b(a), .c(b), .d(b), .y(s4));
  dsp_minmax #(.W(8)) u5(.a(a), .b(b), .mn(mn), .mx(mx));
  dsp_cmp #(.W(8)) u6(.a(a), .b(b), .lt(lt), .eq(eq), .gt(gt));
  dsp_popcount #(.W(8)) u7(.x(a), .n(pop));
  dsp_clz #(.W(8)) u8(.x(c), .n(clz));
  dsp_and #(.W(8)) u9(.a(a), .b(b), .y(and_));
  dsp_or #(.W(8)) u10(.a(a), .b(b), .y(or_));
  dsp_xor #(.W(8)) u11(.a(a), .b(b), .y(xor_));
  dsp_not #(.W(8)) u12(.x(a), .y(not_));
  dsp_mask #(.W(8), .MASK(15)) u13(.x(a), .y(msk));
  dsp_rotate #(.W(8), .K(3)) u14(.x(a), .y(rot));
  dsp_bitrev #(.W(8)) u15(.x(a), .y(rev));
  dsp_bin2gray #(.W(8)) u16(.x(a), .y(gray));
  dsp_gray2bin #(.W(8)) u17(.x(gray), .y(bin));
  dsp_parity #(.W(8)) u18(.x(a), .p(par));
  dsp_mux2 #(.W(8)) u19(.a(a), .b(b), .sel(1'b1), .y(m2));
  dsp_mux4 #(.W(8)) u20(.a(a), .b(b), .c(c), .d(a), .sel(2'd2), .y(m4));
  dsp_decoder u21(.sel(3'd5), .en(1'b1), .y(dec));
  dsp_prienc u22(.x(a), .idx(idx), .valid(valid));
  dsp_join u23(.hi(a), .lo(b), .y(j));
  dsp_split u24(.x(j), .hi(hi), .lo(lo));
endmodule`,
    // (nombre, bits, valor esperado sin signo)
    outs: [
      ['abs_b', 8, 60],
      ['rq_a', 8, 25],
      ['rq_up', 8, 127],
      ['s4', 8, 80],
      ['mn', 8, 196],
      ['mx', 8, 100],
      ['lt', 1, 0],
      ['eq', 1, 0],
      ['gt', 1, 1],
      ['pop', 5, 3],
      ['clz', 5, 5],
      ['and_', 8, 0x44],
      ['or_', 8, 0xe4],
      ['xor_', 8, 0xa0],
      ['not_', 8, 0x9b],
      ['msk', 8, 4],
      ['rot', 8, 0x23],
      ['rev', 8, 0x26],
      ['gray', 8, 0x56],
      ['bin', 8, 0x64],
      ['par', 1, 1],
      ['m2', 8, 0xc4],
      ['m4', 8, 7],
      ['dec', 8, 0x20],
      ['idx', 3, 6],
      ['valid', 1, 1],
      ['hi', 8, 0x64],
      ['lo', 8, 0xc4],
    ],
    get circuit() {
      return `X1 ${this.outs.map(([n, w]) => (w > 1 ? nodes(n, w) : n)).join(' ')} comb\n.tran 1n 20n`;
    },
    check(at) {
      for (const [n, w, v] of this.outs) {
        const got = uword(at, n, w, 10e-9);
        if (got !== v) return `${n} = ${got} (esperaba ${v})`;
      }
    },
  },
  {
    name: 'DSP (#366): secuenciales (contador, LFSR, SIPO, MAC, integrador, diferenciador, promedio móvil, PWM)',
    file: 'seq.v',
    top: 'seq',
    verilog: `${DSP}
module seq(input clk, output [7:0] cnt, output tc, output [15:0] lf, output [7:0] sr, output signed [7:0] mac,
  output signed [7:0] integ, output signed [7:0] dif, output signed [7:0] avg, output pwm);
  wire signed [7:0] half, three, forty;
  dsp_const #(.W(8), .VALUE(64)) c1(.y(half));
  dsp_const #(.W(8), .VALUE(3)) c2(.y(three));
  dsp_const #(.W(8), .VALUE(40)) c3(.y(forty));
  dsp_counter #(.W(8), .MOD(10)) u1(.clk(clk), .rst(1'b0), .en(1'b1), .down(1'b0), .q(cnt), .tc(tc));
  dsp_lfsr u2(.clk(clk), .q(lf), .prbs());
  dsp_shiftreg #(.W(8)) u3(.clk(clk), .d(1'b1), .q(sr));
  dsp_mac #(.W(8), .F(7)) u4(.clk(clk), .clr(1'b0), .a(half), .b(half), .acc(mac));
  dsp_integrator #(.W(8)) u5(.clk(clk), .clr(1'b0), .x(three), .y(integ));
  dsp_diff #(.W(8)) u6(.clk(clk), .x(forty), .y(dif));
  dsp_movavg #(.W(8), .K(2)) u7(.clk(clk), .x(forty), .y(avg));
  dsp_pwm #(.N(3)) u8(.clk(clk), .duty(3'd3), .q(pwm));
endmodule`,
    circuit: `${CLK}
X1 clk ${nodes('cnt', 8)} tc ${nodes('lf', 16)} ${nodes('sr', 8)} ${nodes('mac', 8)} ${nodes('integ', 8)} ${nodes('dif', 8)} ${nodes('avg', 8)} pwm seq tpd=1n
.tran 1n 1.6u`,
    check: (at) => {
      // (el reloj sube en 0, 100n…: en el ciclo k ya hubo k + 1 flancos; x es constante desde 0, así que
      // el diferenciador ya da 0 en el ciclo 0)
      let lf = 44257;
      for (let k = 0; k < 14; k++) {
        const tt = k * 100e-9 + 50e-9;
        const e = k + 1;
        const fb = ((lf >> 15) ^ (lf >> 13) ^ (lf >> 12) ^ (lf >> 10)) & 1;
        lf = ((lf << 1) | fb) & 0xffff;
        const want = { cnt: e % 10, lf, sr: Math.min(255, 2 ** e - 1), mac: Math.min(127, 32 * e), integ: ((3 * e + 128) % 256) - 128, dif: 0, avg: Math.min(4, e) * 10 };
        for (const [n, v] of Object.entries(want)) {
          const got = n === 'cnt' || n === 'sr' || n === 'lf' ? uword(at, n, n === 'lf' ? 16 : 8, tt) : word(at, n, 8, tt);
          if (got !== v) return `${n} en el ciclo ${k}: ${got} (esperaba ${v})`;
        }
        if (at('tc', tt) > 2.5 !== (e % 10 === 9)) return `tc en el ciclo ${k}`;
        // PWM de período 8: los 3 primeros ciclos de cada período en 1 (n = e mod 8 después del flanco)
        if (at('pwm', tt) > 2.5 !== e % 8 < 3) return `pwm en el ciclo ${k}`;
      }
    },
  },
  {
    name: 'DSP (#366): control y memoria (flancos, sincronizador, 1-shot, antirrebote, DEMUX, RAM, ↑L, envolvente, PISO)',
    file: 'ctl.v',
    top: 'ctl',
    verilog: `${DSP}
module ctl(input clk, input d, output rise, output fall, output sq, output os, output db, output [7:0] da, output [7:0] dbb,
  output [7:0] ram, output signed [7:0] up, output signed [7:0] env, output ser);
  wire signed [7:0] k;
  dsp_const #(.W(8), .VALUE(100)) c1(.y(k));
  dsp_edge u1(.clk(clk), .d(d), .rise(rise), .fall(fall));
  dsp_sync u2(.clk(clk), .d(d), .q(sq));
  dsp_oneshot #(.N(3)) u3(.clk(clk), .trig(d), .q(os));
  dsp_debounce #(.N(2)) u4(.clk(clk), .d(d), .q(db));
  dsp_demux2 #(.W(8)) u5(.x(k), .sel(1'b1), .a(da), .b(dbb));
  dsp_ram #(.W(8)) u6(.clk(clk), .we(1'b1), .addr(4'd3), .d(k), .q(ram));
  dsp_upsample #(.W(8), .L(4)) u7(.clk(clk), .x(k), .y(up), .clko());
  dsp_envelope #(.W(8), .K(1)) u8(.clk(clk), .x(k), .y(env));
  dsp_piso #(.W(8)) u9(.clk(clk), .load(1'b0), .x(k), .q(ser));
endmodule`,
    // d sube en 420n y baja en 1020n (entre flancos)
    circuit: `${CLK}
Vd d 0 PWL(0 0 420n 0 421n 5 1020n 5 1021n 0)
X1 clk d rise fall sq os db ${nodes('da', 8)} ${nodes('dbb', 8)} ${nodes('ram', 8)} ${nodes('up', 8)} ${nodes('env', 8)} ser ctl tpd=1n
.tran 1n 2u`,
    check: (at) => {
      const hi = (n, tt) => at(n, tt) > 2.5;
      // d se muestrea en el flanco de 500n: rise en el ciclo que sigue (500n–600n), sync dos flancos después
      if (!hi('rise', 550e-9) || hi('rise', 650e-9) || hi('rise', 450e-9)) return 'rise';
      if (!hi('fall', 1150e-9) || hi('fall', 1250e-9)) return 'fall';
      if (hi('sq', 550e-9) || !hi('sq', 650e-9) || !hi('sq', 1050e-9) || hi('sq', 1250e-9)) return 'sync';
      // 1-shot de 3 ciclos desde el flanco que ve el disparo (500n)
      if (!hi('os', 550e-9) || !hi('os', 750e-9) || hi('os', 850e-9)) return 'one-shot';
      // antirrebote de 2 ciclos: q sube después de ver d estable dos flancos
      if (hi('db', 650e-9) || !hi('db', 850e-9)) return 'antirrebote';
      if (uword(at, 'da', 8, 100e-9) !== 0 || uword(at, 'dbb', 8, 100e-9) !== 100) return 'demux';
      if (uword(at, 'ram', 8, 150e-9) !== 100) return `ram = ${uword(at, 'ram', 8, 150e-9)}`;
      // ↑4: x en el primero de cada 4 ciclos, 0 en los otros
      const ups = [0, 1, 2, 3, 4].map((k) => word(at, 'up', 8, k * 100e-9 + 50e-9)).join();
      if (ups !== '100,0,0,0,100') return `up ${ups}`;
      const e = word(at, 'env', 8, 1.95e-6);
      if (e < 98 || e > 100) return `envolvente ${e}`;
      if (hi('ser', 1.5e-6)) return 'piso';
    },
  },
  {
    name: '.step con un bloque sintetizado (alterparam y reset reevalúan los parámetros del .subckt)',
    file: 'stepinv.v',
    fresh: true,
    verilog: 'module stepinv(input a, output y); assign y = ~a; endmodule',
    circuit: `Va a 0 PULSE(0 5 0 1n 1n 49n 100n)
X1 a y stepinv vcc=5 tpd=1n
.param k=1
.tran 1n 200n
.control
foreach ts 1 2
  alterparam k = $ts
  reset
  run
end
.endc`,
    check: (at) => {
      if (at('y', 25e-9) > 2.5 || at('y', 75e-9) < 2.5) return 'y no es el inverso de a';
    },
  },
  {
    name: 'DSP (#366): divisor, raíz cuadrada, CORDIC (cos/sen y magnitud/fase) y multiplicador complejo',
    file: 'math.v',
    top: 'math',
    verilog: `${DSP}
module math(output signed [15:0] q1, output signed [15:0] q2, output signed [15:0] q0, output signed [15:0] r,
  output signed [15:0] c0, output signed [15:0] s0, output signed [15:0] c90, output signed [15:0] s90,
  output signed [15:0] mag, output [15:0] ph, output signed [15:0] yr, output signed [15:0] yi);
  wire signed [15:0] quarter, half, mquarter, zero, five;
  wire [15:0] p90;
  dsp_const #(.VALUE(8192)) k1(.y(quarter));
  dsp_const #(.VALUE(16384)) k2(.y(half));
  dsp_const #(.VALUE(-8192)) k3(.y(mquarter));
  dsp_const #(.VALUE(0)) k4(.y(zero));
  dsp_const #(.VALUE(5)) k5(.y(five));
  dsp_const #(.VALUE(16384)) k6(.y(p90));
  dsp_div u1(.a(quarter), .b(half), .y(q1));
  dsp_div u2(.a(mquarter), .b(half), .y(q2));
  dsp_div u3(.a(five), .b(zero), .y(q0));
  dsp_sqrt u4(.x(quarter), .y(r));
  dsp_cordic u5(.phase(zero), .cos(c0), .sin(s0));
  dsp_cordic u6(.phase(p90), .cos(c90), .sin(s90));
  dsp_magphase u7(.x(half), .y(half), .mag(mag), .phase(ph));
  dsp_cmul u8(.ar(half), .ai(zero), .br(zero), .bi(half), .yr(yr), .yi(yi));
endmodule`,
    outs: ['q1', 'q2', 'q0', 'r', 'c0', 's0', 'c90', 's90', 'mag', 'ph', 'yr', 'yi'],
    get circuit() {
      return `X1 ${this.outs.map((n) => nodes(n, 16)).join(' ')} math\n.tran 1n 20n`;
    },
    check(at) {
      // [valor, tolerancia]: el CORDIC tiene el error de sus 16 iteraciones
      const want = {
        q1: [16384, 0],
        q2: [-16384, 0],
        q0: [32767, 0],
        r: [16384, 0],
        c0: [32767, 4],
        s0: [0, 4],
        c90: [0, 4],
        s90: [32767, 4],
        mag: [23170, 4],
        ph: [8192, 4],
        yr: [0, 0],
        yi: [8192, 0],
      };
      for (const [n, [v, tol]] of Object.entries(want)) {
        const got = n === 'ph' ? uword(at, n, 16, 10e-9) : word(at, n, 16, 10e-9);
        if (Math.abs(got - v) > tol) return `${n} = ${got} (esperaba ${v} ± ${tol})`;
      }
    },
  },
  {
    name: 'DSP (#366): sigma-delta, FIR8, biquad, CIC, FIFO y rampa',
    file: 'blocks.v',
    top: 'blocks',
    verilog: `${DSP}
module blocks(input clk, output q, output signed [15:0] fir, output signed [15:0] iir, output signed [15:0] cic, output cv,
  output [7:0] fq, output full, output empty, output signed [15:0] ramp);
  wire signed [15:0] half, imp, step, small;
  dsp_const #(.VALUE(16384)) k1(.y(half));
  dsp_const #(.VALUE(256)) k2(.y(small));
  dsp_impulse #(.VALUE(32767)) u0(.clk(clk), .y(imp));
  dsp_step #(.VALUE(16384)) u1(.clk(clk), .y(step));
  dsp_sdm u2(.clk(clk), .x(half), .q(q));
  dsp_fir8 u3(.clk(clk), .x(imp), .y(fir));
  dsp_biquad u4(.clk(clk), .x(step), .y(iir));
  dsp_cic #(.R(8), .N(2)) u5(.clk(clk), .x(small), .y(cic), .valid(cv));
  dsp_fifo #(.W(8)) u6(.clk(clk), .wr(1'b1), .rd(1'b0), .d(8'd77), .q(fq), .empty(empty), .full(full));
  dsp_ramp #(.INC(256)) u7(.clk(clk), .y(ramp));
endmodule`,
    fresh: true,
    circuit: `${CLK}
X1 clk q ${nodes('fir', 16)} ${nodes('iir', 16)} ${nodes('cic', 16)} cv ${nodes('fq', 8)} full empty ${nodes('ramp', 16)} blocks tpd=1n
.tran 1n 8u`,
    check: (at) => {
      // sigma-delta de 0,5: 3 de cada 4 bits en 1 (promedio (1 + 0,5)/2), en 64 ciclos
      let ones = 0;
      for (let k = 8; k < 72; k++) ones += at('q', k * 100e-9 + 50e-9) > 2.5 ? 1 : 0;
      if (Math.abs(ones - 48) > 1) return `sigma-delta: ${ones} unos en 64 (esperaba 48)`;
      // FIR8: en el ciclo k sale el coeficiente k por el impulso (el reloj sube en 0)
      const fir = [287, 1571, 5375, 9151, 9151, 5375, 1571, 287, 0].map((c) => Math.floor((c * 32767 + 16384) / 32768));
      for (let k = 0; k < fir.length; k++) {
        const got = word(at, 'fir', 16, k * 100e-9 + 50e-9);
        if (got !== fir[k]) return `FIR8 en el ciclo ${k}: ${got} (esperaba ${fir[k]})`;
      }
      const iir = word(at, 'iir', 16, 7.95e-6);
      if (Math.abs(iir - 16384) > 40) return `biquad: ${iir} (esperaba ≈16384)`;
      if (word(at, 'cic', 16, 7.95e-6) !== 256) return `CIC: ${word(at, 'cic', 16, 7.95e-6)} (esperaba 256: ganancia 1)`;
      if (uword(at, 'fq', 8, 3e-6) !== 77 || at('full', 3e-6) < 2.5 || at('empty', 3e-6) > 2.5) return 'FIFO';
      if (at('empty', 50e-9) > 2.5 && at('full', 50e-9) > 2.5) return 'FIFO al principio';
      if (word(at, 'ramp', 16, 450e-9) !== 5 * 256) return `rampa: ${word(at, 'ramp', 16, 450e-9)}`;
    },
  },
  {
    name: 'DSP (#366): ADC y DAC ideales (fuentes B) alrededor de un z⁻¹',
    file: 'adcdac.v',
    top: 'dsp_delay',
    verilog: readFileSync(new URL('dsp_delay.v', DSP_DIR), 'utf8'),
    circuit: `${readFileSync(new URL('../../library/sub/DSP/dsp_adc.sub', import.meta.url), 'utf8')}
${readFileSync(new URL('../../library/sub/DSP/dsp_dac.sub', import.meta.url), 'utf8')}
${CLK}
Vin vin 0 0.3
XA vin ${nodes('d', 16)} dsp_adc vref=1
X1 clk ${nodes('d', 16)} ${nodes('q', 16)} dsp_delay tpd=1n
XD ${nodes('q', 16)} vout dsp_dac vref=1
.tran 1n 400n`,
    check: (at) => {
      const code = word(at, 'd', 16, 50e-9);
      if (code !== Math.floor(0.3 * 32768)) return `ADC: ${code} (esperaba ${Math.floor(0.3 * 32768)})`;
      const v = at('vout', 350e-9);
      if (Math.abs(v - 0.3) > 1 / 32768) return `DAC: ${v} V (esperaba 0,3 V ± 1 LSB)`;
    },
  },
  {
    name: 'error de sintaxis',
    file: 'bad.v',
    verilog: `module bad(input a, output y); assign y = ; endmodule`,
    expectError: /syntax error/i,
  },
];
