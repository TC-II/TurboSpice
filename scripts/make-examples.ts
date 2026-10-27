// Arma los proyectos de ejemplo de public/examples a partir de los .asc de examples/:
// - Sample Project.turbo (#158): el que se abre la primera vez. Tres variantes, un par de
//   simulaciones en cada una, corridas con cambios entre ellas (agregar, quitar, cambiar valores,
//   una repetida) y un opamp de TC2Lib modificado como archivos del proyecto (OA_Sample.asy +
//   OA_Sample.sub, con saturación a ±Vsat).
// - Examples.turbo: los ejemplos sueltos del menú, una variante cada uno. Los e2e abren además
//   RC Filter, RLC Bode y RC Sweep (.step), que ya no están en el menú: van a
//   tests/e2e/fixtures/Examples.turbo, con todos.
// - Transfer functions.turbo: las transferencias de 1er y 2do orden con RC y RLC (examples/filters/),
//   un workbench cada una con su respuesta al escalón, su Bode y su mapa de polos y ceros; los
//   pasatodo, con un operacional sin polos (OA_NoPole, archivos del proyecto).
// - Transistor amplifiers.turbo: emisor común, degenerado, colector común y base común
//   (examples/transistors/), con el BJT (BC547C) y el MOSFET (2N7000) uno al lado del otro.
// (ADC.turbo, el de simulación mixta con Verilog, lo arma scripts/make-adc.ts)
//   npx vite-node scripts/make-examples.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { AscDoc } from '../src/asc/model.ts';
import { parseAsc } from '../src/asc/parse.ts';
import { serializeAsc } from '../src/asc/serialize.ts';
import { readAsc } from '../src/schematic/fileio.ts';
import { setAnalysisLine } from '../src/schematic/directivesEdit.ts';
import { diffCircuits } from '../src/project/diff.ts';
import { addSim, recordRun, renameSim, selectSim, variantOf } from '../src/project/project.ts';
import { BENCHES, newId, newProject, serializeTurbo, variantFromAsc, type Project, type Sim } from '../src/project/turbo.ts';
import type { SimView } from '../src/sim/simList.ts';
import { patchLabels } from '../src/schematic/edit.ts';
import { Library } from '../src/library/library.ts';
import { buildBundle } from './build-library.mjs';

const lib = new Library(buildBundle());
/** Fuentes con forma de onda: el rótulo del valor oculto, como las deja la ventana de la fuente
 * (el dibujito del símbolo ya dice qué es) */
const hideWaveValues = (d: AscDoc): AscDoc =>
  patchLabels(
    d,
    d.symbols.flatMap((s, i) => (/^(voltage|current)$/i.test(s.type) && /^\s*(pulse|sine?|pwl|exp|sffm)\b/i.test(s.attrs.get('Value') ?? '') ? [i] : [])),
    new Map([[3, { visible: false }]]),
    lib,
  );

// Los comentarios de los .asc, en inglés (los originales se escribieron en castellano)
const COMMENTS: Record<string, string> = {
  'RC Filter.asc': 'RC low-pass filter: τ = RC = 1 ms',
  'RLC Bode.asc': '2nd-order RLC low-pass (f0 ≈ 5 kHz)',
  'Inverting Amplifier.asc': 'Inverting amplifier: Av = -R2/R1 = -10',
  'Half-wave Rectifier.asc': 'Half-wave rectifier with a capacitor filter',
  'Common Emitter.asc': 'Common-emitter amplifier: hover over Q1 to see its operating point',
  'RC Sweep (.step).asc': 'RC low-pass filter with .step: one run per value of R; the rise time is 2.2 RC',
};
/** El orden en Archivo › Examples */
const EXAMPLES = ['Half-wave Rectifier.asc', 'Common Emitter.asc', 'Inverting Amplifier.asc'];
/** Los de antes, que siguen usando los e2e */
const TEST_EXAMPLES = ['RC Filter.asc', 'RLC Bode.asc', 'RC Sweep (.step).asc', ...EXAMPLES];

const example = (name: string): AscDoc => {
  const d = readAsc(readFileSync(`examples/${name}`), name).doc;
  return hideWaveValues({ ...d, texts: d.texts.map((x) => (x.kind === 'comment' && COMMENTS[name] ? { ...x, text: COMMENTS[name] } : x)) });
};
const setVal = (d: AscDoc, inst: string, value: string): AscDoc => ({
  ...d,
  symbols: d.symbols.map((s) => (s.attrs.get('InstName') === inst ? { ...s, attrs: new Map([...s.attrs, ['Value', value]]) } : s)),
});
const without = (d: AscDoc, inst: string): AscDoc => ({ ...d, symbols: d.symbols.filter((s) => s.attrs.get('InstName') !== inst) });

// el opamp ideal de TC2Lib, con otro nombre y la salida limitada a ±Vsat
const OA_ASY = `Version 4
SymbolType CELL
LINE Normal -192 -8 -80 48
LINE Normal -192 -8 -192 104
LINE Normal -181 16 -173 16
LINE Normal -180 80 -172 80
LINE Normal -176 84 -176 76
LINE Normal -80 48 -192 104
WINDOW 0 -113 80 Left 2
WINDOW 3 -176 32 Left 0
WINDOW 123 -176 48 Left 0
SYMATTR Value Avol=1Meg Vsat=5
SYMATTR SpiceModel OA_Sample
SYMATTR ModelFile OA_Sample.sub
SYMATTR Prefix X
SYMATTR Description TC2Lib OA_Ideal with the output limited to ±Vsat (a project file of the sample project)
SYMATTR Value2 GBWP=10Meg
PIN -192 80 NONE 0
PINATTR PinName In+
PINATTR SpiceOrder 1
PIN -192 16 NONE 0
PINATTR PinName In-
PINATTR SpiceOrder 2
PIN -80 48 NONE 0
PINATTR PinName OUT
PINATTR SpiceOrder 3
`;
const OA_SUB = `* OA_Sample: TC2Lib OA_Ideal (Javier Petrucci and Agustin Gullino, ITBA) modified to show
* the project files: one pole (GBWP) and the output limited to ±Vsat.
.SUBCKT OA_Sample 1 2 5
E1 N001 0 1 2 1
RF1 N002 N001 1
CF1 N002 0 {CF1}
B3 5 0 V=limit({Av}*V(N002), -{Vsat}, {Vsat})
.param Av={Avol}
.param f1={GBWP/Avol}
.param CF1={1/(2*PI*f1)}
.ends OA_Sample
`;

/** Agrega corridas a la simulación activa: cada circuito contra el anterior, cada 10 minutos */
function runs(p: Project, docs: AscDoc[], start: number): Project {
  const v = variantOf(p);
  let prev: AscDoc | undefined;
  docs.forEach((d, i) => {
    p = recordRun(p, v.activeSim, serializeAsc(d), start + i * 600e3, prev ? diffCircuits(prev, d).summary : undefined).project;
    prev = d;
  });
  return p;
}

const t0 = Date.parse('2026-10-22T14:00:00-03:00');
mkdirSync('public/examples', { recursive: true });

// --- Sample Project
let p = newProject('Sample Project');
p = { ...p, variants: [] };

// 1. Pasabajos RC: transitorio (tres corridas cambiando R1 y C1) y Bode
const rc = example('RC Filter.asc');
const v1 = variantFromAsc(rc, 'RC low-pass');
p = { ...p, variants: [v1], activeVariant: v1.id };
p = runs(p, [rc, setVal(rc, 'R1', '2k2'), setVal(setVal(rc, 'R1', '2k2'), 'C1', '470n'), setVal(setVal(rc, 'R1', '2k2'), 'C1', '470n')], t0);
p = { ...p, variants: p.variants.map((v) => ({ ...v, sims: v.sims.map((s) => ({ ...s, asc: serializeAsc(setVal(setVal(rc, 'R1', '2k2'), 'C1', '470n')) })) })) };
// (el Bode necesita excitación AC: la fuente sigue con su pulso y suma AC 1)
const rcAc = setVal(setVal(setVal(rc, 'R1', '2k2'), 'C1', '470n'), 'V1', 'PULSE(0 1 0 1u 1u 5m 10m) AC 1');
p = addSim(p, serializeAsc(setAnalysisLine(rcAc, '.ac dec 50 10 100k')), 'Bode')!.project;
p = runs(p, [parseAsc(variantOf(p).sims[1].asc)], t0 + 3600e3);
// se abre en el transitorio (la primera simulación)
p = selectSim(p, variantOf(p).sims[0].id);

// 2. Inversor con el opamp del proyecto: transitorio que satura y AC (la fuente lleva AC 1
// para que el análisis en frecuencia tenga excitación)
const inv0 = example('Inverting Amplifier.asc');
const inv: AscDoc = setVal(
  {
    ...inv0,
    symbols: inv0.symbols.map((s) =>
      /OA_Ideal/i.test(s.type)
        ? { ...s, type: 'OA_Sample', attrs: new Map([['InstName', 'U1'], ['Value', 'Avol=1Meg Vsat=5'], ['Value2', 'GBWP=10Meg']]) }
        : s,
    ),
  },
  'V1',
  'SINE(0 1 1k) AC 1',
);
const v2 = variantFromAsc(inv, 'Inverter (project opamp)');
p = { ...p, variants: [...p.variants, v2], activeVariant: v2.id };
p = renameSim(p, variantOf(p).activeSim, 'Saturates at ±5 V');
p = runs(p, [setVal(inv, 'R2', '4k7'), inv, setVal(inv, 'R2', '22k')], t0 + 7200e3);
p = { ...p, variants: p.variants.map((v) => (v.id === v2.id ? { ...v, sims: v.sims.map((s) => ({ ...s, asc: serializeAsc(setVal(inv, 'R2', '22k')) })) } : v)) };
p = addSim(p, serializeAsc(setAnalysisLine(inv, '.ac dec 20 10 10meg')), 'Bandwidth')!.project;

// 3. Bode RLC: una simulación sin corridas y otra que quita y agrega componentes
const rlc = example('RLC Bode.asc');
const v3 = variantFromAsc(rlc, 'RLC');
p = { ...p, variants: [...p.variants, v3], activeVariant: v3.id };
const sim3 = variantOf(p).activeSim;
// la respuesta al escalón con un pulso (la fuente del Bode es sólo AC 1: en el transitorio no excita)
const step = setAnalysisLine(hideWaveValues(setVal(rlc, 'V1', 'PULSE(0 1 0 1u 1u 1m 2m)')), '.tran 2m');
p = addSim(p, serializeAsc(step), 'Step response')!.project;
const firstR = rlc.symbols.find((s) => /^R/i.test(s.attrs.get('InstName') ?? ''))?.attrs.get('InstName') ?? 'R1';
p = runs(p, [step, without(step, firstR), step], t0 + 10800e3);
p = selectSim(p, sim3);

// 4. Emisor común: el transitorio que amplifica y el punto de operación
const ce = example('Common Emitter.asc');
const v4 = variantFromAsc(ce, 'Common emitter');
p = { ...p, variants: [...p.variants, v4], activeVariant: v4.id };
p = renameSim(p, variantOf(p).activeSim, 'Amplifier');
p = addSim(p, serializeAsc(setAnalysisLine(ce, '.op')), 'Bias point')!.project;
p = selectSim(p, variantOf(p).sims[0].id);

p = { ...p, activeVariant: p.variants[0].id, files: [{ name: 'OA_Sample.asy', kind: 'symbol', text: OA_ASY }, { name: 'OA_Sample.sub', kind: 'model', text: OA_SUB }] };
const sample = await serializeTurbo({ ...p, created: t0, modified: t0 + 10800e3 });
writeFileSync('public/examples/Sample Project.turbo', sample);
console.log(`Sample Project.turbo: ${p.variants.length} variantes, ${p.variants.reduce((n, v) => n + v.sims.length, 0)} simulaciones, ${(sample.length / 1024).toFixed(1)} kB`);
for (const v of p.variants) for (const s of v.sims) console.log(`  ${v.name} · ${s.name ?? '(auto)'}: ${s.runs.map((r) => r.summary ?? 'primera').join(' | ')}`);

// --- Examples: una variante por .asc
async function examplesProject(names: string[], path: string) {
  let ex = newProject('Examples');
  ex = { ...ex, variants: names.map((name) => variantFromAsc(example(name), name.replace(/\.asc$/i, ''))) };
  ex = { ...ex, activeVariant: ex.variants[0].id, created: t0, modified: t0 };
  const text = await serializeTurbo(ex);
  writeFileSync(path, text);
  console.log(`${path}: ${ex.variants.map((v) => v.name).join(', ')} (${(text.length / 1024).toFixed(1)} kB)`);
}
await examplesProject(EXAMPLES, 'public/examples/Examples.turbo');
mkdirSync('tests/e2e/fixtures', { recursive: true });
await examplesProject(TEST_EXAMPLES, 'tests/e2e/fixtures/Examples.turbo');

// --- Transfer functions: un workbench por transferencia, con escalón, Bode y polos y ceros
const FILTERS: { name: string; file: string; tran: string; ac: string; out: [string, string] }[] = [
  { name: '1st order low-pass', file: 'lp1', tran: '.tran 1m', ac: '.ac dec 100 10 100k', out: ['out', '0'] },
  { name: '1st order high-pass', file: 'hp1', tran: '.tran 1m', ac: '.ac dec 100 10 100k', out: ['out', '0'] },
  { name: '1st order all-pass', file: 'ap1', tran: '.tran 1m', ac: '.ac dec 100 10 100k', out: ['out', '0'] },
  { name: '2nd order low-pass', file: 'lp2', tran: '.tran 1m', ac: '.ac dec 100 100 100k', out: ['out', '0'] },
  { name: '2nd order high-pass', file: 'hp2', tran: '.tran 1m', ac: '.ac dec 100 100 100k', out: ['out', '0'] },
  { name: '2nd order band-pass', file: 'bp2', tran: '.tran 1m', ac: '.ac dec 100 100 100k', out: ['out', '0'] },
  { name: '2nd order band-stop (notch)', file: 'bs2', tran: '.tran 1m', ac: '.ac dec 100 100 100k', out: ['out', '0'] },
  { name: '2nd order all-pass', file: 'ap2', tran: '.tran 1m', ac: '.ac dec 100 100 100k', out: ['out', '0'] },
];
const COLORS = ['#2f9e44', '#1c7ed6'];
const traces = (exprs: string[]) => exprs.map((expr, i) => ({ expr, color: COLORS[i % COLORS.length] }));
{
  const groups = FILTERS.map((f) => ({ id: newId('g'), name: f.name }));
  const sims: Sim[] = FILTERS.flatMap((f, i) => {
    // (en UTF-8: readAsc los tomaría por ANSI de LTspice)
    const base = parseAsc(readFileSync(`examples/filters/${f.file}.asc`, 'utf8'));
    const vout = f.out[1] === '0' ? `V(${f.out[0]})` : `V(${f.out[0]},${f.out[1]})`;
    const bench = (name: string, doc: AscDoc, view: SimView): Sim => ({ id: newId('s'), name, asc: serializeAsc(doc), view, runs: [], group: groups[i].id });
    // el escalón: la fuente salta de 0 a 1 en t = 0 y se queda ahí
    const step = hideWaveValues(setVal(base, 'V1', 'PULSE(0 1 0 1n 1n 1 2)'));
    const out = [
      bench('Step response', setAnalysisLine(step, f.tran), { panes: [{ traces: traces(['V(in)', vout]) }], active: 0, plot: 'tran1' }),
      bench('Bode', setAnalysisLine(base, f.ac), { panes: [{ traces: traces([vout]) }], active: 0, plot: 'ac1', mode: 'bode' }),
      bench('Poles and zeros', setAnalysisLine(base, `.pz in 0 ${f.out[0]} ${f.out[1]} vol pz`), { panes: [], plot: 'pz1' }),
    ];
    if (f.file === 'lp1') {
      // y el de antes con .step: una corrida por cada R, con el tiempo de subida medido
      const swept = setVal(step, 'R1', '{R}');
      const stepped: AscDoc = {
        ...swept,
        texts: [
          ...swept.texts,
          { x: 0, y: 256, align: 'Left', size: 2, kind: 'directive', text: '.step param R list 500 1k 2k\\n.meas tran trise TRIG V(out) VAL=0.1 RISE=1 TARG V(out) VAL=0.9 RISE=1' },
          { x: 0, y: 352, align: 'Left', size: 2, kind: 'comment', text: 'With .step, one run per value of R (500, 1k and 2k); the .meas gives the rise time, 2.2 RC.' },
        ],
      };
      out.push(bench('Step, R stepped (.step)', setAnalysisLine(stepped, f.tran), { panes: [{ traces: traces(['V(out)']) }], active: 0, plot: 'tran1' }));
    }
    return out;
  });
  const tf: Project = {
    name: 'Transfer functions', created: t0, modified: t0, groups,
    // el operacional de los pasatodo: sin polos (OA_Ideal tiene uno, que en el mapa de polos y
    // ceros aparece lejísimos y aplasta a los demás)
    files: [
      { name: 'OA_NoPole.asy', kind: 'symbol', text: readFileSync('examples/filters/OA_NoPole.asy', 'utf8') },
      { name: 'OA_NoPole.sub', kind: 'model', text: readFileSync('examples/filters/OA_NoPole.sub', 'utf8') },
    ],
    activeVariant: BENCHES, variants: [{ id: BENCHES, name: 'Transfer functions', base: sims[0].asc, activeSim: sims[0].id, sims }],
  };
  const text = await serializeTurbo(tf);
  writeFileSync('public/examples/Transfer functions.turbo', text);
  console.log(`Transfer functions.turbo: ${groups.length} workbenches, ${sims.length} testbenches (${(text.length / 1024).toFixed(1)} kB)`);
}

// --- Transistor amplifiers: un workbench por configuración, con el BJT y el MOSFET en el mismo
// esquemático (la misma entrada): formas de onda, respuesta en frecuencia y punto de operación
const AMPS: { name: string; file: string; sine: string }[] = [
  { name: 'Common emitter / source', file: 'ce', sine: 'SINE(0 5m 1k)' },
  { name: 'Degenerated common emitter / source', file: 'ced', sine: 'SINE(0 200m 1k)' },
  { name: 'Common collector / drain (follower)', file: 'cc', sine: 'SINE(0 500m 1k)' },
  { name: 'Common base / gate', file: 'cb', sine: 'SINE(0 10m 1k)' },
];
{
  const IN = '#2f9e44', BJT = '#1c7ed6', MOS = '#e8590c';
  const outs = [{ expr: 'V(out_bjt)', color: BJT }, { expr: 'V(out_mos)', color: MOS }];
  const groups = AMPS.map((a) => ({ id: newId('g'), name: a.name }));
  const sims: Sim[] = AMPS.flatMap((a, i) => {
    const base = parseAsc(readFileSync(`examples/transistors/${a.file}.asc`, 'utf8'));
    const bench = (name: string, doc: AscDoc, view?: SimView): Sim => ({ id: newId('s'), name, asc: serializeAsc(doc), view, runs: [], group: groups[i].id });
    return [
      bench('Waveforms', setAnalysisLine(hideWaveValues(setVal(base, 'VIN', a.sine)), '.tran 5m'), {
        // (en el seguidor, la entrada junto a las salidas: se ve que la siguen)
        ...(a.file === 'cc'
          ? { panes: [{ traces: [{ expr: 'V(in)', color: IN }, ...outs] }], active: 0 }
          : { panes: [{ traces: [{ expr: 'V(in)', color: IN }] }, { traces: outs }], active: 1 }),
        plot: 'tran1',
      }),
      bench('Frequency response', setAnalysisLine(base, '.ac dec 50 1 100Meg'), { panes: [{ traces: outs }], active: 0, plot: 'ac1', mode: 'bode' }),
      bench('Bias point', setAnalysisLine(base, '.op')),
    ];
  });
  const amps: Project = {
    name: 'Transistor amplifiers', created: t0, modified: t0, groups, files: [],
    activeVariant: BENCHES, variants: [{ id: BENCHES, name: 'Transistor amplifiers', base: sims[0].asc, activeSim: sims[0].id, sims }],
  };
  const text = await serializeTurbo(amps);
  writeFileSync('public/examples/Transistor amplifiers.turbo', text);
  console.log(`Transistor amplifiers.turbo: ${groups.length} workbenches, ${sims.length} testbenches (${(text.length / 1024).toFixed(1)} kB)`);
}
