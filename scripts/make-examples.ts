// Arma los proyectos de ejemplo de public/examples a partir de los .asc de examples/:
// - Sample Project.turbo (#158): el que se abre la primera vez. Tres variantes, un par de
//   simulaciones en cada una, corridas con cambios entre ellas (agregar, quitar, cambiar valores,
//   una repetida) y un opamp de TC2Lib modificado como archivos del proyecto (OA_Sample.asy +
//   OA_Sample.sub, con saturación a ±Vsat).
// - Examples.turbo: cada .asc de examples/ es una variante.
// (ADC sigma-delta.turbo, el ejemplo de simulación mixta con Verilog, no sale de acá: es un proyecto
//  guardado desde TurboSpice, con su módulo Verilog sintetizado)
//   npx vite-node scripts/make-examples.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { AscDoc } from '../src/asc/model.ts';
import { parseAsc } from '../src/asc/parse.ts';
import { serializeAsc } from '../src/asc/serialize.ts';
import { readAsc } from '../src/schematic/fileio.ts';
import { setAnalysisLine } from '../src/schematic/directivesEdit.ts';
import { diffCircuits } from '../src/project/diff.ts';
import { addSim, recordRun, renameSim, selectSim, variantOf } from '../src/project/project.ts';
import { newProject, serializeTurbo, variantFromAsc, type Project } from '../src/project/turbo.ts';
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
const EXAMPLES = ['RC Filter.asc', 'RLC Bode.asc', 'RC Sweep (.step).asc', 'Half-wave Rectifier.asc', 'Common Emitter.asc', 'Inverting Amplifier.asc'];

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
let ex = newProject('Examples');
ex = { ...ex, variants: EXAMPLES.map((name) => variantFromAsc(example(name), name.replace(/\.asc$/i, ''))) };
ex = { ...ex, activeVariant: ex.variants[0].id, created: t0, modified: t0 };
const examples = await serializeTurbo(ex);
writeFileSync('public/examples/Examples.turbo', examples);
console.log(`Examples.turbo: ${ex.variants.map((v) => v.name).join(', ')} (${(examples.length / 1024).toFixed(1)} kB)`);
