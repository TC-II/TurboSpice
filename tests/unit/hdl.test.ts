import { describe, expect, it } from 'vitest';
import { addVerilogModule, applySynth, isStale, looksBehavioral, setHdlMode, topModuleOf, verilogFile } from '../../src/hdl/project.ts';
import { parseVvp, vvpForEngine } from '../../src/hdl/icarus.ts';
import { cosimSubckt, yosysToSubckt, type YosysJson } from '../../src/hdl/synth.ts';
import { applyVariants, renameSubckt, withSubckts } from '../../src/hdl/variants.ts';
import { busNames, busRange, formatRadix, joinBits, LOGIC_X, LOGIC_Z, logicState } from '../../src/waveform/digital.ts';
import { addTraceTo } from '../../src/waveform/view.ts';
import { newProject } from '../../src/project/turbo.ts';
import { portsOf } from '../../src/hdl/project.ts';

// Netlist de Yosys de: module m #(parameter W = 2) (input [1:0] a, input clk, output y, output reg q);
//   assign y = a[1] & a[0]; always @(posedge clk) q <= y;
const JSON: YosysJson = {
  modules: {
    m: {
      attributes: { top: '00000000000000000000000000000001' },
      parameter_default_values: { W: '00000000000000000000000000000010' },
      ports: { a: { direction: 'input', bits: [2, 3] }, clk: { direction: 'input', bits: [4] }, y: { direction: 'output', bits: [5] }, q: { direction: 'output', bits: [6] } },
      cells: {
        g: { type: '$_AND_', connections: { A: [2], B: [3], Y: [5] } },
        f: { type: '$_DFF_P_', connections: { C: [4], D: [5], Q: [6] } },
      },
      netnames: { q: { bits: [6], hide_name: 0, attributes: { init: '1' } } },
    },
  },
};

describe('Verilog → XSPICE (#209)', () => {
  it('traduce compuertas, flip-flops, buses, valores iniciales y parameter', () => {
    const b = yosysToSubckt(JSON, 'm.v');
    expect(b.pins.map((p) => `${p.dir}:${p.name}`)).toEqual(['in:a_1', 'in:a_0', 'in:clk', 'out:y', 'out:q']);
    expect(b.params).toEqual({ W: '2' });
    // la interfaz eléctrica y los parameter son parámetros del .subckt
    expect(b.subckt).toMatch(/^\.subckt m a_1 a_0 clk y q vcc=5 vil=\{vcc\/2\} .* tpd=1n w=2$/m);
    expect(b.subckt).toContain('ab_a_1 [a_1] [a_1_d] null hdl_in');
    expect(b.subckt).toMatch(/\[a_0_d a_1_d\] y_d hdl_and/);
    expect(b.subckt).toMatch(/ y_d clk_d null null q_d null hdl_dff1/);
    // cada salida con su propio nodo detrás de un buffer, y una fuga para el punto de operación
    expect(b.subckt).toContain('aob_q q_d q_o hdl_obuf');
    expect(b.subckt).toContain('ab_q [q] [q_o] null hdl_out');
    expect(b.subckt).toContain('rleak_q q 0 1g');
    expect(b.subckt).toContain('drive_low={iol}');
    expect(b.subckt).not.toContain('hdl_dlatch');
  });

  it('el módulo de más arriba es el que nadie instancia', () => {
    expect(topModuleOf('module half(input a); endmodule\nmodule full(input a); half h1 (.a(a)); endmodule')).toBe('full');
    expect(topModuleOf('module top(input a); sub u(a); endmodule\nmodule sub(input a); endmodule')).toBe('top');
  });

  it('reconoce código de comportamiento (retardos, $display) y no confunde #( de parámetros', () => {
    expect(looksBehavioral('always @(posedge clk) #5 y = ~y;')).toBe(true);
    expect(looksBehavioral('initial $display("hola");')).toBe(true);
    expect(looksBehavioral('module c #(parameter N = 4) (input a); cnt #(.N(8)) u1 (a); endmodule')).toBe(false);
    expect(looksBehavioral('assign y = a; // #5')).toBe(false);
  });
});

describe('módulos Verilog del proyecto (#209)', () => {
  it('sintetizar guarda el resultado en el .v y crea el símbolo con los parámetros (sin mostrarlos)', () => {
    let p = addVerilogModule(newProject('P'), 'm', 'module m(); endmodule');
    expect(isStale(verilogFile(p, 'm')!)).toBe(true);
    p = applySynth(p, 'm', 'module m(); endmodule', yosysToSubckt(JSON, 'm.v'));
    const f = verilogFile(p, 'm')!;
    expect(isStale(f)).toBe(false);
    expect(f.synth?.pins.length).toBe(5);
    const asy = p.files.find((x) => x.name === 'm.asy')!.text;
    expect(asy).toContain('SYMATTR ModelFile m.sub');
    expect(asy).toMatch(/SYMATTR SpiceLine vcc=5 .*tpd=1n W=2/);
    expect(asy).not.toMatch(/^WINDOW 39 /m);
    // cambiar a comportamiento la deja desactualizada (hay que compilar con Icarus)
    expect(isStale(verilogFile(setHdlMode(p, 'm', 'behavioral'), 'm')!)).toBe(true);
  });
});

describe('parameter por instancia (#209)', () => {
  const net = '* t\nX1 a b m params: vcc=5 W=2\nX2 a c m params: vcc=5 W=4\nX3 a d m W={k}\n.end\n';
  it('las instancias con otro valor usan su variante', () => {
    const r = applyVariants(net, [{ name: 'm', params: { W: '2' } }]);
    expect(r.netlist).toContain('X1 a b m params: vcc=5 W=2');
    expect(r.netlist).toContain('X2 a c m__w4 params: vcc=5 W=4');
    expect(r.needs).toEqual([{ module: 'm', params: { W: '4' }, name: 'm__w4' }]);
    expect(r.warnings[0]).toMatch(/W/);
  });
  it('renombra el .subckt de la variante y lo agrega antes de .end', () => {
    const sub = renameSubckt('.subckt m a b\nr1 a b 1\n.ends m\n', 'm', 'm__w4');
    expect(sub).toBe('.subckt m__w4 a b\nr1 a b 1\n.ends m__w4\n');
    expect(withSubckts('* t\n.end\n', [sub])).toBe(`* t\n${sub}.end\n`);
  });
});

describe('comportamiento con Icarus (#209)', () => {
  const vvp = `#! vvp
:vpi_module "/ivl/system.vpi";
S_0x1 .scope module, "pp" "pp" 2 2;
    .port_info 0 /INPUT 1 "clk";
    .port_info 1 /INPUT 3 "d";
    .port_info 2 /INOUT 1 "b";
    .port_info 3 /OUTPUT 3 "q";
P_0x2 .param/l "N" 0 2 2, +C4<00000000000000000000000000000011>;
S_0x3 .scope module, "u1" "inv" 3 4, 5 6 0, S_0x1;
    .port_info 0 /INPUT 1 "x";
`;
  it('lee del .vvp los puertos y parameter del módulo de más arriba', () => {
    const r = parseVvp(vvp, 'pp');
    expect(r.ports).toEqual([
      { name: 'clk', dir: 'in', bits: 1 },
      { name: 'd', dir: 'in', bits: 3 },
      { name: 'b', dir: 'inout', bits: 1 },
      { name: 'q', dir: 'out', bits: 3 },
    ]);
    expect(r.params).toEqual({ N: '3' });
    expect(vvpForEngine(vvp)).toContain(':vpi_module "/usr/local/lib/ngspice/system.vpi";');
  });
  it('arma el .subckt con d_cosim: entradas, salidas e inout en ese orden', () => {
    const b = cosimSubckt('pp', parseVvp(vvp, 'pp').ports, { N: '3' }, 'pp.vvp', 'pp.v');
    expect(b.pins.map((p) => p.name)).toEqual(['clk', 'd_2', 'd_1', 'd_0', 'b', 'q_2', 'q_1', 'q_0']);
    expect(b.subckt).toContain('acosim [clk_d d_2_d d_1_d d_0_d] [q_2_d q_1_d q_0_d] [b_d] hdl_cosim');
    expect(b.subckt).toContain('sim_args=["pp.vvp"]');
    expect(b.subckt).toContain('lib_args=["/usr/local/lib/ngspice/libvvp.so" "/usr/local/lib/ngspice/ivlng"]');
  });
});

describe('señales digitales en el visor (#209)', () => {
  it('buses: rango, valor y radix', () => {
    expect(busRange('x1.q[3:0]')).toEqual({ base: 'x1.q', bits: [3, 2, 1, 0] });
    expect(busRange('x1.q_0_d')).toBeNull();
    const v = joinBits([new Float64Array([1, 1, 0.5]), new Float64Array([0, 1, 1])]);
    expect([...v]).toEqual([2, 3, LOGIC_X]);
    expect(formatRadix(58, 8, 'hex')).toBe('0x3A');
    expect(formatRadix(5, 4, 'bin')).toBe('0b0101');
    expect(formatRadix(14, 4, 'sdec')).toBe('-2');
    expect(formatRadix(LOGIC_X, 4, 'hex')).toBe('X');
    expect(busNames(['x1.q_3_d', 'x1.q_2_d', 'x1.q_1_d', 'x1.q_0_d', 'x1.clk_d'])).toEqual(['Dig(x1.q[3:0])']);
  });
  it('X y Z se distinguen en bits y buses', () => {
    // bus de 2 bits: todos en Z → Z; Z junto a un bit manejado → X; un bit X → X
    const v = joinBits([new Float64Array([NaN, NaN, 0.5, 1]), new Float64Array([NaN, 1, 1, NaN])]);
    expect(v[0]).toBeNaN();
    expect([...v.slice(1)]).toEqual([LOGIC_X, LOGIC_X, LOGIC_X]);
    expect([0, 1, 7].map(logicState)).toEqual(['v', 'v', 'v']);
    expect(logicState(LOGIC_X)).toBe('x');
    expect(logicState(LOGIC_Z)).toBe('z');
    expect(formatRadix(LOGIC_Z, 4, 'hex')).toBe('Z');
    expect(formatRadix(LOGIC_Z, 1)).toBe('Z');
    expect(formatRadix(LOGIC_X, 1)).toBe('X');
    expect(formatRadix(1, 1)).toBe('1');
  });
  it('una señal digital va a un panel digital, y una analógica nunca a uno digital', () => {
    let panes = addTraceTo([{ traces: [{ expr: 'V(out)' }] }], 0, 'Dig(x1.q[3:0])');
    expect(panes.map((p) => !!p.digital)).toEqual([false, true]);
    expect(panes[1].traces[0].expr).toBe('Dig(x1.q[3:0])');
    panes = addTraceTo(panes, 1, 'V(in)');
    expect(panes[0].traces.map((t) => t.expr)).toEqual(['V(out)', 'V(in)']);
    // un panel vacío toma el tipo de la primera traza
    expect(addTraceTo([{ traces: [] }], 0, 'Dig(a)')[0].digital).toBe(true);
  });
});

describe('pines en la vista del módulo (#209)', () => {
  it('los bits de un bus se muestran juntos', () => {
    const pins = [
      { name: 'clk', dir: 'in' as const },
      { name: 'a_1', dir: 'in' as const },
      { name: 'a_0', dir: 'in' as const },
      { name: 'q_3', dir: 'out' as const },
      { name: 'q_2', dir: 'out' as const },
      { name: 'q_1', dir: 'out' as const },
      { name: 'q_0', dir: 'out' as const },
      { name: 'x_0', dir: 'out' as const },
    ];
    expect(portsOf(pins)).toEqual([
      { name: 'clk', dir: 'in', bits: 1 },
      { name: 'a[1:0]', dir: 'in', bits: 2 },
      { name: 'q[3:0]', dir: 'out', bits: 4 },
      { name: 'x_0', dir: 'out', bits: 1 },
    ]);
  });
});
