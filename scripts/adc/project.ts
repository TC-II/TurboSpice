// El proyecto de ejemplo ADC (lo escribe scripts/make-adc.ts): un workbench por convertidor, cada uno con sus testbenches.
// - Flash 3-bit: escalera de 8 resistencias, 7 comparadores y el codificador termómetro → binario
//   en Verilog (FLASHENC.v, con su símbolo dibujado a mano).
// - SAR 8-bit: arreglo de capacitores con sus llaves (redistribución de carga), el comparador
//   CMOS como subcircuito del proyecto (COMP.asc + COMP.asy) y la lógica de control en Verilog
//   (SARLOGIC.v).
// - Sigma-delta: modulador de primer orden (integrador RC + MODULATOR.v, el cuantizador de 1 bit) y
//   DOWNSAMPLER.v (cuenta los unos cada 64 ciclos); los dos con su símbolo dibujado a mano.
// Todo sale de examples/adc/: los esquemáticos de los testbenches (<adc>-<testbench>.asc) se
// editan en TurboSpice y se copian ahí; acá sólo se arma el proyecto y se sintetiza el Verilog.
import { readFileSync } from 'node:fs';
import { runYosys } from '@yowasp/yosys';
import { applySynth, addVerilogModule } from '../../src/hdl/project.ts';
import { synthesize } from '../../src/hdl/yosys.ts';
import { Library } from '../../src/library/library.ts';
import { newId, BENCHES, type Project, type Sim } from '../../src/project/turbo.ts';
import type { SimView } from '../../src/sim/simList.ts';
import { buildBundle } from '../build-library.mjs';

const SRC = 'examples/adc';
const read = (name: string) => readFileSync(`${SRC}/${name}`, 'utf8');

export const lib = new Library(buildBundle());

/** Sintetiza un módulo de examples/adc y lo agrega al proyecto (con su símbolo) */
async function withVerilog(p: Project, name: string): Promise<Project> {
  const text = read(`${name}.v`);
  const r = await synthesize(runYosys, { [`${name}.v`]: text }, `${name}.v`);
  if (r.error || !r.block) throw new Error(`${name}.v: ${r.error}`);
  return applySynth(addVerilogModule(p, name, text), name, text, r.block);
}

// --- proyecto ------------------------------------------------------------------------------------

type TraceSpec = string | { expr: string; radix: string };
const view = (panes: { traces: TraceSpec[]; digital?: boolean }[], plot = 'tran1'): SimView => {
  const colors = ['#2f9e44', '#1c7ed6', '#e03131', '#f08c00', '#0c8599', '#9c36b5'];
  let c = 0;
  return {
    panes: panes.map((p) => ({
      traces: p.traces.map((tr) => {
        const { expr, radix } = typeof tr === 'string' ? { expr: tr, radix: p.digital ? 'dec' : undefined } : tr;
        return { expr, color: colors[c++ % colors.length], ...(radix ? { radix } : {}) };
      }),
      ...(p.digital ? { digital: true } : {}),
    })),
    active: 0,
    plot,
  } as SimView;
};

export async function build(): Promise<Project> {
  const now = Date.parse('2026-10-26T12:00:00-03:00');
  let p: Project = { name: 'ADC', created: now, modified: now, files: [], activeVariant: BENCHES, variants: [], groups: [] };
  // los símbolos dibujados a mano (la síntesis los conserva)
  p = { ...p, files: ['FLASHENC', 'MODULATOR', 'DOWNSAMPLER'].map((m) => ({ name: `${m}.asy`, kind: 'symbol' as const, text: read(`${m}.asy`) })) };
  for (const m of ['FLASHENC', 'SARLOGIC', 'MODULATOR', 'DOWNSAMPLER']) p = await withVerilog(p, m);
  p = { ...p, files: [...p.files, { name: 'COMP.asc', kind: 'schematic', text: read('COMP.asc') }, { name: 'COMP.asy', kind: 'symbol', text: read('COMP.asy') },
    { name: 'ASW.lib', kind: 'model', module: 'model', text: read('ASW.lib') },
    { name: 'ASW.asy', kind: 'symbol', text: read('ASW.asy') },
  ] };
  lib.setProjectFiles(p.files);

  const groups = ['Flash 3-bit', 'SAR 8-bit', 'Sigma-delta'].map((name) => ({ id: newId('g'), name }));
  const bench = (g: number, name: string, asc: string, v: SimView): Sim => ({ id: newId('s'), name, asc, view: v, runs: [], group: groups[g].id });
  const flashView = view([{ traces: ['V(vin)', 'V(dac)'] }, { traces: ['Dig(x1.d[2:0])'], digital: true }]);
  const sims = [
    bench(0, 'Ramp: every code', read('flash-ramp.asc'), flashView),
    bench(0, 'Sine 20 kHz', read('flash-sine.asc'), flashView),
    bench(1, 'Comparator', read('sar-comparator.asc'), view([{ traces: ['V(out)'] }], 'dc1')),
    bench(1, 'Two conversions', read('sar-conversions.asc'), view([
      { traces: ['V(top)', 'V(vcm)'] },
      { traces: ['Dig(x2.smp_d)', 'Dig(x2.cmp_d)', { expr: 'Dig(x2.up[7:0])', radix: 'bin' }, 'Dig(x2.data[7:0])', 'Dig(x2.eoc_d)'], digital: true },
    ])),
    bench(1, 'Sine 1 kHz', read('sar-sine.asc'), view([{ traces: ['V(vin)', 'V(dac)'] }, { traces: ['Dig(x2.data[7:0])'], digital: true }])),
    bench(2, 'Sine 250 Hz', read('sigma-delta.asc'), view([{ traces: ['V(vin)', 'V(out)', 'V(int)'] }, { traces: ['Dig(x2.value[6:0])'], digital: true }])),
  ];
  return { ...p, modified: now, groups, variants: [{ id: BENCHES, name: 'ADC', base: sims[0].asc, activeSim: sims[0].id, sims }] };
}
