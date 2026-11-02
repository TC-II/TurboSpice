import { describe, expect, it } from 'vitest';
import { MERGED_LINE, mergeCosim, mergedLine, type MergeModule } from '../../src/hdl/cosimMerge.ts';

// Los bloques DSP en un solo módulo de Icarus (#366)
const bits = (n: string, w: number) => Array.from({ length: w }, (_, k) => `${n}_${w - 1 - k}`);
const MODS: MergeModule[] = [
  {
    name: 'dsp_delay',
    pins: [{ name: 'clk', dir: 'in' as const }, ...bits('d', 2).map((name) => ({ name, dir: 'in' as const })), ...bits('q', 2).map((name) => ({ name, dir: 'out' as const }))],
    params: { W: '2' },
  },
  { name: 'dsp_neg', pins: [...bits('x', 2).map((name) => ({ name, dir: 'in' as const })), ...bits('y', 2).map((name) => ({ name, dir: 'out' as const }))], params: { W: '2', SAT: '1' } },
];
// x (de afuera) → z⁻¹ → m (interna) → −1 → y (la usa la resistencia)
const NET = `* t
X1 clk x__1__ x__0__ m__1__ m__0__ dsp_delay vcc=5 tpd=1n W=2
X2 m__1__ m__0__ y__1__ y__0__ dsp_neg vcc=5 tpd=1n SAT=0 W=2
Vx1 x__1__ 0 5
Vx0 x__0__ 0 0
R1 y__1__ 0 1k
R__float1 m__1__ 0 1e12
R__float2 y__0__ 0 1e12
.tran 1u
.end`;

describe('cosimMerge', () => {
  it('junta las instancias: puertos para lo de afuera, wire para lo interno', () => {
    const m = mergeCosim(NET, MODS, () => true)!;
    expect(m.instances).toEqual(['x1', 'x2']);
    // clk y x[1:0] entran; sale y__1__, que usa R1 (y__0__ sólo tiene su R de gmin: queda adentro)
    expect([...m.ports.values()]).toEqual(['clk', 'x__1__', 'x__0__', 'y__1__']);
    expect(m.verilog).toMatch(/dsp_delay x1 \(\.clk\(w_0\), \.d\(\{w_1, w_2\}\), \.q\(\{w_3, w_4\}\)\);/);
    // el parameter distinto del de por omisión
    expect(m.verilog).toMatch(/dsp_neg #\(\.SAT\(0\)\) x2/);
    expect(m.verilog).toMatch(/wire w_3, w_4, w_6;/);
    // la R de gmin de un nodo que ya no existe se va; las de los puertos quedan
    expect(m.netlist).not.toMatch(/R__float1/);
    expect(m.netlist).not.toMatch(/^X1 /m);
    expect(m.netlist).toMatch(new RegExp(`^${MERGED_LINE.replace(/[()*]/g, '\\$&')}$`, 'm'));
    expect(mergedLine(m, [{ name: 'w_0' }, { name: 'w_5' }])).toBe('xdsp clk y__1__ dsp_cosim vcc=5 tpd=1n');
  });
  it('las redes internas que piden las trazas salen como puertos, con sus nombres de antes', () => {
    const m = mergeCosim(NET, MODS, () => true, ['Dig(m[1:0])', 'Dig(x1.q[1:0])'])!;
    expect([...m.ports.values()]).toContain('m__0__');
    expect(m.aliases.get('m[0]')).toBe('xdsp.w_4_d');
    expect(m.aliases.get('x1.q_1_d')).toBe('xdsp.w_3_d');
  });
  it('nada que juntar con menos de dos instancias o si `mergeable` no las quiere', () => {
    expect(mergeCosim(NET, MODS, (n) => n === 'dsp_neg')).toBeNull();
  });
});
