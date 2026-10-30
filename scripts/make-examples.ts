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
// - Loop stability.turbo: la ganancia de lazo (.stb) con la sonda simple y la diferencial
//   (examples/stability/): Tian, GFT, márgenes, lugar de raíces y el transitorio que los confirma.
// - sky130.turbo y gf180.turbo: transistores de los PDK (examples/pdk/, docs/pdk.md): curvas del
//   NMOS y el inversor en las esquinas tt, ff y ss, y su transitorio.
// (ADC.turbo, el de simulación mixta con Verilog, lo arma scripts/make-adc.ts)
//   npx vite-node scripts/make-examples.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { AscDoc } from '../src/asc/model.ts';
import { parseAsc } from '../src/asc/parse.ts';
import { writeData } from '../src/asc/dataText.ts';
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
const EXAMPLES = ['Half-wave Rectifier.asc', 'Common Emitter.asc', 'Inverting Amplifier.asc', 'Loop Gain (.stb).asc'];
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

// --- Loop stability: .stb con LoopProbe (simple) y DiffLoopProbe (diferencial), docs/estabilidad.md
{
  const groups = [
    { id: newId('g'), name: 'Single-ended (LoopProbe)' },
    { id: newId('g'), name: 'Differential (DiffLoopProbe)' },
    { id: newId('g'), name: 'How the probes work' },
  ];
  const note = (d: AscDoc, lines: string[], y = 560): AscDoc => ({
    ...d,
    texts: [...d.texts, { x: -64, y, align: 'Left', size: 2, kind: 'comment', text: lines.join('\\n') }],
  });
  const STB = { panes: [{ traces: [{ expr: 'loopgain', color: '#1c7ed6' }] }], active: 0, plot: 'stb1', mode: 'bode' } as SimView;
  const se = parseAsc(readFileSync('examples/stability/single.asc', 'utf8'));
  const df = parseAsc(readFileSync('examples/stability/diff.asc', 'utf8'));
  const bench = (g: number, name: string, doc: AscDoc, view?: SimView): Sim => ({ id: newId('s'), name, asc: serializeAsc(doc), view, runs: [], group: groups[g].id });
  const SE_NOTE = [
    'LP1 (Stability > LoopProbe) is in series in the loop, at the error point: the loop signal goes from the summing node into the op amp (the arrow).',
    'Outside .stb it is a plain wire. The .stb turns its sources on one at a time and computes T; next to the Bode plot: margins, poles and zeros of T,',
    'closed-loop poles and the root locus of 1 + k·T. U1 has two poles (10 Hz and 1 MHz): with gain -1 the phase margin is only about 25°.',
  ];
  const step = (d: AscDoc, v: string, val: string) => hideWaveValues(setVal(d, v, val));
  // diferencial de dos etapas: par Q1/Q2 con carga resistiva, emisor común PNP (Q5, Q6) con Miller (Cc1, Cc2),
  // fuentes de corriente Q7/Q8 manejadas por el CMFB (Q9, Q10, Q11)
  const dnote = (d: AscDoc, lines: string[]) => note(d, lines, 1072);
  const lowCc = setVal(setVal(df, 'Cc1', '22p'), 'Cc2', '22p');
  const dmStep = (d: AscDoc) => step(step(d, 'Vp', 'PULSE(0 10m 0.5u 10n 10n 2u 4u) AC 0.5'), 'Vn', 'PULSE(0 -10m 0.5u 10n 10n 2u 4u) AC 0.5 180');
  const TRAN = { panes: [{ traces: [{ expr: 'V(outp)', color: '#1c7ed6' }, { expr: 'V(outn)', color: '#e8590c' }] }], active: 0, plot: 'tran1' } as SimView;
  const DF_NOTE = [
    'Two-stage fully differential amplifier: the pair Q1/Q2 with RC1/RC2, then the PNP common emitters Q5/Q6 with Miller compensation (Cc1, Cc2).',
    'Q1 drives Q5 and Q2 drives Q6, so each output is in phase with its own side: the feedback crosses (outn to Q1, outp to Q2, by net labels) through R2/R1 (gain -10).',
    'Q7/Q8 are the output current sinks; the CMFB (Rcp, Rcn, Q9 to Q11) sets their base vb so that the outputs sit at Vcm.',
    'LP1 (Stability > DiffLoopProbe) is in series in the differential output; the .stb picks the mode (dm or cm). DM: about 58° of margin.',
  ];
  // cómo funcionan las sondas: la DiffLoopProbe armada a mano (dos Balun y dos LoopProbe) en lugar de LP1
  const bal = parseAsc(readFileSync('examples/stability/balun.asc', 'utf8'));
  const byHand: AscDoc = (() => {
    const part = parseAsc(`Version 4
SHEET 1 2500 1600
WIRE 448 1360 496 1360
WIRE 592 1360 640 1360
WIRE 448 1424 496 1424
WIRE 592 1424 640 1424
FLAG 1488 544 op
FLAG 1488 608 on
FLAG 1584 544 outp
FLAG 1584 608 outn
FLAG 352 1360 op
FLAG 352 1424 on
FLAG 736 1360 outp
FLAG 736 1424 outn
TEXT 352 1264 Left 2 ;LP1 by hand: two Balun back to back, a LoopProbe in each mode
SYMBOL Stability\\Balun 400 1392 R0
SYMATTR InstName B1
SYMBOL Stability\\LoopProbe 544 1360 R0
SYMATTR InstName LPd
SYMBOL Stability\\LoopProbe 544 1424 R0
SYMATTR InstName LPc
SYMBOL Stability\\Balun 688 1392 M0
SYMATTR InstName B2
`);
    const d = without(df, 'LP1');
    return { ...d, wires: [...d.wires, ...part.wires], flags: [...d.flags, ...part.flags], symbols: [...d.symbols, ...part.symbols], texts: [...d.texts, ...part.texts] };
  })();
  // la LoopProbe y el Balun dibujados como subcircuitos del proyecto (los mismos elementos que
  // LoopProbe.lib): doble clic en la instancia muestra su circuito, y el .stb los encuentra igual
  const SUBS = ['ProbeCircuit', 'BalunCircuit'].flatMap((n) => [
    { name: `${n}.asc`, kind: 'schematic' as const, text: readFileSync(`examples/stability/${n}.asc`, 'utf8') },
    { name: `${n}.asy`, kind: 'symbol' as const, text: readFileSync(`examples/stability/${n}.asy`, 'utf8') },
  ]);
  const inside = (d: AscDoc): AscDoc => ({
    ...d,
    symbols: d.symbols.map((x) => {
      const t = x.type.replace(/\\+/g, '/');
      return t === 'Stability/LoopProbe' && x.attrs.get('InstName') !== 'LP2' ? { ...x, type: 'ProbeCircuit' } : t === 'Stability/Balun' ? { ...x, type: 'BalunCircuit' } : x;
    }),
  });
  const TIAN = [
    'Double-click LP1 to see its circuit: ProbeCircuit is the LoopProbe (library/sub/Stability/LoopProbe.lib) drawn as a subcircuit of this project. In series in the loop,',
    'Vprb (an ammeter) goes from p1 to node x, Vinj (a series voltage) from x to p2 and Iinj (a current from ground) into x.',
    'All are 0 outside .stb: the probe is a wire. The .stb turns off every other AC source and runs two ac: run 1 with Vinj = 1, run 3 with Iinj = 1. With Vy = -V(x) and Iy = I(Vprb):',
    '   D = Vy1·Iy3 - Vy3·Iy1        T(Tian) = 1/(Vy1 + Iy3 - 2·D) - 1        T(GFT) = 1/(1/D - 1)',
    'Tian: the two injections (series voltage and shunt current) cancel the loading of the cut on both sides, so T does not depend on the impedances there',
    'nor on the probe orientation. It is what Spectre stb computes. GFT (Middlebrook): the same two runs read as a null double injection; it treats the reverse',
    'transmission across the cut as load and, with an input and an output (gft V1 V(out)), gives G = G∞·T/(1+T) + G0/(1+T). Both give the same closed-loop poles (zeros of 1 + T).',
    'Sources: M. Tian, V. Visvanathan, J. Hantgan and K. Kundert, "Striving for small-signal stability", IEEE Circuits and Devices Magazine 17(1), 2001.',
    'R. D. Middlebrook, "The general feedback theorem: a final solution for feedback systems", IEEE Microwave Magazine 7(2), 2006.',
    'SPICE implementations: Frank Wiedmann, https://sites.google.com/site/frankwiedmann/loopgain . More in docs/estabilidad.md.',
  ];
  const BALUN = [
    'Double-click B1 to see its circuit (BalunCircuit: the Stability > Balun drawn as a subcircuit of this project). An ideal balun with controlled sources. Ec, Ep and En build V(p) = V(c) + V(d)/2 and V(n) = V(c) - V(d)/2; Vsp and Vsn measure I(p) and I(n)',
    'and the F sources put them back on the mode side as I(d) = (I(p) - I(n))/2 and I(c) = I(p) + I(n). Then V(p)·I(p) + V(n)·I(n) = V(d)·I(d) + V(c)·I(c):',
    'it conserves power, so it neither isolates nor loads, and unlike a transformer it passes DC. Here Vp and Vn are 120° apart: d is their difference and c their mean (1 V with a 0.25 V ripple).',
    'A DiffLoopProbe is two baluns back to back (a direct connection) with a LoopProbe on d and another on c: the .stb injects in one of them, so it cuts only one mode.',
  ];
  const sims: Sim[] = [
    bench(0, 'Loop gain (Tian)', setAnalysisLine(note(se, SE_NOTE), '.stb LP1 dec 50 10 100meg'), STB),
    bench(
      0,
      'GFT: G, G∞, G0 and R',
      setAnalysisLine(note(se, ['Middlebrook\'s GFT with input V1 and output V(out): it gives the asymptotic gain model G = G∞·R/(1+R) + G0/(1+R):', 'G (closed loop), G∞ (ideal, -R2/R1 = -1), G0 (direct path) and R (return ratio). The probe must be at the error point and the signal must enter by its arrow; check G∞ first.']), '.stb LP1 dec 50 10 100meg gft V1 V(out)'),
      { panes: [{ traces: [{ expr: 'loopgain', color: '#1c7ed6' }] }, { traces: [{ expr: 'g', color: '#2f9e44' }, { expr: 'ginf', color: '#e8590c' }] }], active: 0, plot: 'stb1', mode: 'bode' },
    ),
    bench(0, 'Gain -10: more margin', setAnalysisLine(note(setVal(se, 'R2', '10k'), ['With R2 = 10k the feedback factor drops to 1/11: T crosses 0 dB lower, far from the 1 MHz pole, and the margin rises to about 54°.']), '.stb LP1 dec 50 10 100meg'), STB),
    bench(0, 'Step response', setAnalysisLine(note(step(se, 'V1', 'PULSE(0 0.1 0 10n 10n 5u 10u) AC 1'), ['The ringing of the step response is the 25° phase margin. The probe does not change the circuit: this is the same as without it.']), '.tran 20u'), {
      panes: [{ traces: [{ expr: 'V(out)', color: '#1c7ed6' }] }],
      active: 0,
      plot: 'tran1',
    }),
    bench(0, 'Closed-loop Bode', setAnalysisLine(se, '.ac dec 50 10 100meg'), { panes: [{ traces: [{ expr: 'V(out)', color: '#1c7ed6' }] }], active: 0, plot: 'ac1', mode: 'bode' }),
    bench(1, 'Differential-mode loop gain', setAnalysisLine(dnote(df, DF_NOTE), '.stb LP1 dm dec 50 10 100meg'), STB),
    bench(
      1,
      'DM without enough Miller (Cc = 22p)',
      setAnalysisLine(dnote(lowCc, ['With Cc1 = Cc2 = 22p the Miller capacitors no longer split the poles of the two stages: T crosses 0 dB near 2 MHz with about 15° of margin.']), '.stb LP1 dm dec 50 10 100meg'),
      STB,
    ),
    bench(
      1,
      'Common-mode loop gain',
      setAnalysisLine(dnote(df, ['In CM the probe breaks every loop that goes through the outputs: the CMFB and the R2 feedback, which in CM is positive', '(the outputs pull the bases up, the collectors go down and Q5/Q6 push the outputs further up). T is their sum: about 110° of margin.']), '.stb LP1 cm dec 50 10 100meg'),
      STB,
    ),
    bench(
      1,
      'CMFB loop alone (LoopProbe at cm)',
      setAnalysisLine(dnote(df, ['LP2 breaks only the CMFB; the positive CM loop through R2 stays closed inside it and is unstable on its own (a pole in the right half-plane).', 'T starts near -180° and the app flags a right half-plane pole: the margins of this Bode plot do not apply. Look at the closed-loop poles, or measure with LP1 in CM (nested loops).']), '.stb LP2 dec 50 10 100meg'),
      STB,
    ),
    bench(1, 'Differential step', setAnalysisLine(dnote(dmStep(df), ['A ±10 mV differential step: the outputs move ∓100 mV with the small overshoot of a 58° margin.']), '.tran 4u'), TRAN),
    bench(1, 'Differential step, Cc = 22p', setAnalysisLine(dnote(dmStep(lowCc), ['The same step with Cc = 22p: it rings at about 2 MHz, the crossover of T, with the 15° margin.']), '.tran 4u'), TRAN),
    bench(1, 'Common-mode step (Vcm)', setAnalysisLine(dnote(step(df, 'Vcm', 'PULSE(0 10m 0.5u 10n 10n 2u 4u)'), ['A 10 mV step in Vcm, the CMFB reference: both outputs follow it together. The probes are transparent here.']), '.tran 4u'), TRAN),
    bench(2, 'LoopProbe: Tian and GFT', setAnalysisLine(note(inside(se), TIAN), '.stb LP1 dec 50 10 100meg'), STB),
    bench(2, 'Balun: differential and common mode', setAnalysisLine(note(inside(bal), BALUN, 320), '.tran 3m'), {
      panes: [{ traces: [{ expr: 'V(p)', color: '#1c7ed6' }, { expr: 'V(n)', color: '#e8590c' }] }, { traces: [{ expr: 'V(d)', color: '#2f9e44' }, { expr: 'V(c)', color: '#ae3ec9' }] }],
      active: 0,
      plot: 'tran1',
    }),
    bench(
      2,
      'DiffLoopProbe by hand: DM',
      setAnalysisLine(dnote(inside(byHand), ['LP1 replaced by what it has inside (bottom): B1 splits (op, on) into d and c, LPd and LPc are in series in each mode and B2 joins them back into (outp, outn). Double-click any of them to see its circuit.', 'The .stb at LPd gives the same T as LP1 in DM (about 58°); at LPc, the same as LP1 in CM.']), '.stb LPd dec 50 10 100meg'),
      STB,
    ),
    bench(2, 'DiffLoopProbe by hand: CM', setAnalysisLine(dnote(inside(byHand), ['The .stb at LPc: the same T as LP1 in CM (about 110°).']), '.stb LPc dec 50 10 100meg'), STB),
  ];
  const ls: Project = {
    name: 'Loop stability', created: t0, modified: t0, groups, files: SUBS,
    activeVariant: BENCHES, variants: [{ id: BENCHES, name: 'Loop stability', base: sims[0].asc, activeSim: sims[0].id, sims }],
  };
  const text = await serializeTurbo(ls);
  writeFileSync('public/examples/Loop stability.turbo', text);
  console.log(`Loop stability.turbo: ${groups.length} workbenches, ${sims.length} testbenches (${(text.length / 1024).toFixed(1)} kB)`);
}

// --- sky130 y gf180: modelos de PDK (docs/pdk.md); el PDK sale de los símbolos y la esquina, de la barra
for (const pdk of [
  { name: 'sky130', nmos: 'NMOS curves', curves: 'sky130_nfet_curves', inverter: 'sky130_inverter', vdd: '1.8' },
  { name: 'gf180', nmos: 'NMOS curves', curves: 'gf180_nmos_curves', inverter: 'gf180_inverter', vdd: '3.3' },
]) {
  const groups = [
    { id: newId('g'), name: pdk.nmos },
    { id: newId('g'), name: 'CMOS inverter' },
  ];
  // la esquina, como la elige la barra de simulación (;.pdk, sin directiva .lib)
  const corner = (d: AscDoc, c: string): AscDoc => writeData(d, 'pdk', { corner: c });
  const bench = (g: number, name: string, doc: AscDoc, view?: SimView): Sim => ({ id: newId('s'), name, asc: serializeAsc(doc), view, runs: [], group: groups[g].id });
  const nfet = parseAsc(readFileSync(`examples/pdk/${pdk.curves}.asc`, 'utf8'));
  const inv = parseAsc(readFileSync(`examples/pdk/${pdk.inverter}.asc`, 'utf8'));
  const vtc: SimView = { panes: [{ traces: [{ expr: 'V(out)', color: '#1c7ed6' }] }], active: 0, plot: 'dc1' };
  const pulse = setAnalysisLine(hideWaveValues(setVal(inv, 'V2', `PULSE(0 ${pdk.vdd} 0.5n 50p 50p 1n 2n)`)), '.tran 4n');
  const sims: Sim[] = [
    bench(0, 'ID against VDS (tt)', nfet, { panes: [{ traces: [{ expr: '-I(VD)', color: '#1c7ed6' }] }], active: 0, plot: 'dc1' }),
    bench(0, 'ID against VDS (ff)', corner(nfet, 'ff'), { panes: [{ traces: [{ expr: '-I(VD)', color: '#e8590c' }] }], active: 0, plot: 'dc1' }),
    bench(0, 'ID against VDS (ss)', corner(nfet, 'ss'), { panes: [{ traces: [{ expr: '-I(VD)', color: '#2f9e44' }] }], active: 0, plot: 'dc1' }),
    bench(1, 'Transfer curve (tt)', inv, vtc),
    bench(1, 'Transfer curve (ff)', corner(inv, 'ff'), vtc),
    bench(1, 'Transfer curve (ss)', corner(inv, 'ss'), vtc),
    bench(1, 'Step response (tt)', pulse, { panes: [{ traces: [{ expr: 'V(in)', color: '#2f9e44' }, { expr: 'V(out)', color: '#1c7ed6' }] }], active: 0, plot: 'tran1' }),
  ];
  const project: Project = {
    name: pdk.name, created: t0, modified: t0, groups, files: [],
    activeVariant: BENCHES, variants: [{ id: BENCHES, name: pdk.name, base: sims[0].asc, activeSim: sims[0].id, sims }],
  };
  const text = await serializeTurbo(project);
  writeFileSync(`public/examples/${pdk.name}.turbo`, text);
  console.log(`${pdk.name}.turbo: ${groups.length} workbenches, ${sims.length} testbenches (${(text.length / 1024).toFixed(1)} kB)`);
}
