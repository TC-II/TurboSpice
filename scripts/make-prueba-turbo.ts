// Arma public/examples/prueba.turbo (#158): un proyecto para probar el formato a mano. Tres
// variantes, un par de simulaciones en cada una, corridas con cambios entre ellas (agregar,
// quitar, cambiar valores, una repetida) y un opamp de TC2Lib modificado como archivos del
// proyecto (OA_Prueba.asy + OA_Prueba.sub, con saturación a ±Vsat).
//   npx vite-node scripts/make-prueba-turbo.ts
import { readFileSync, writeFileSync } from 'node:fs';
import type { AscDoc } from '../src/asc/model.ts';
import { parseAsc } from '../src/asc/parse.ts';
import { serializeAsc } from '../src/asc/serialize.ts';
import { readAsc } from '../src/schematic/fileio.ts';
import { setAnalysisLine } from '../src/schematic/directivesEdit.ts';
import { diffCircuits } from '../src/project/diff.ts';
import { addSim, recordRun, renameSim, selectSim, variantOf } from '../src/project/project.ts';
import { newProject, serializeTurbo, variantFromAsc, type Project } from '../src/project/turbo.ts';

const example = (name: string) => readAsc(readFileSync(`public/examples/${name}`), name).doc;
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
SYMATTR SpiceModel OA_Prueba
SYMATTR ModelFile OA_Prueba.sub
SYMATTR Prefix X
SYMATTR Description OA_Ideal de TC2Lib con la salida limitada a ±Vsat (archivo de prueba del proyecto)
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
const OA_SUB = `* OA_Prueba: OA_Ideal de TC2Lib (Javier Petrucci y Agustin Gullino, ITBA) modificado para
* probar los archivos del proyecto: un polo (GBWP) y la salida limitada a ±Vsat.
.SUBCKT OA_Prueba 1 2 5
E1 N001 0 1 2 1
RF1 N002 N001 1
CF1 N002 0 {CF1}
B3 5 0 V=limit({Av}*V(N002), -{Vsat}, {Vsat})
.param Av={Avol}
.param f1={GBWP/Avol}
.param CF1={1/(2*PI*f1)}
.ends OA_Prueba
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
let p = newProject('Prueba');
p = { ...p, variants: [] };

// 1. Pasabajos RC: transitorio (tres corridas cambiando R1 y C1) y Bode
const rc = example('Filtro RC.asc');
const v1 = variantFromAsc(rc, 'Pasabajos RC');
p = { ...p, variants: [v1], activeVariant: v1.id };
p = runs(p, [rc, setVal(rc, 'R1', '2k2'), setVal(setVal(rc, 'R1', '2k2'), 'C1', '470n'), setVal(setVal(rc, 'R1', '2k2'), 'C1', '470n')], t0);
p = { ...p, variants: p.variants.map((v) => ({ ...v, sims: v.sims.map((s) => ({ ...s, asc: serializeAsc(setVal(setVal(rc, 'R1', '2k2'), 'C1', '470n')) })) })) };
p = addSim(p, serializeAsc(setAnalysisLine(setVal(setVal(rc, 'R1', '2k2'), 'C1', '470n'), '.ac dec 50 10 100k')), 'Bode')!.project;
p = runs(p, [parseAsc(variantOf(p).sims[1].asc)], t0 + 3600e3);

// 2. Inversor con el opamp del proyecto: transitorio que satura y AC
const inv0 = example('Inversor OA_Ideal.asc');
const inv: AscDoc = {
  ...inv0,
  symbols: inv0.symbols.map((s) =>
    /OA_Ideal/i.test(s.type)
      ? { ...s, type: 'OA_Prueba', attrs: new Map([['InstName', 'U1'], ['Value', 'Avol=1Meg Vsat=5'], ['Value2', 'GBWP=10Meg']]) }
      : s,
  ),
};
const v2 = variantFromAsc(inv, 'Inversor (OA del proyecto)');
p = { ...p, variants: [...p.variants, v2], activeVariant: v2.id };
p = renameSim(p, variantOf(p).activeSim, 'Satura a ±5 V');
p = runs(p, [setVal(inv, 'R2', '4k7'), inv, setVal(inv, 'R2', '22k')], t0 + 7200e3);
p = { ...p, variants: p.variants.map((v) => (v.id === v2.id ? { ...v, sims: v.sims.map((s) => ({ ...s, asc: serializeAsc(setVal(inv, 'R2', '22k')) })) } : v)) };
p = addSim(p, serializeAsc(setAnalysisLine(inv, '.ac dec 20 10 10meg')), 'Ancho de banda')!.project;

// 3. Bode RLC: una simulación sin corridas y otra que quita y agrega componentes
const rlc = example('Bode RLC.asc');
const v3 = variantFromAsc(rlc, 'RLC');
p = { ...p, variants: [...p.variants, v3], activeVariant: v3.id };
const sim3 = variantOf(p).activeSim;
p = addSim(p, serializeAsc(setAnalysisLine(rlc, '.tran 5m')), 'Respuesta al escalón')!.project;
const firstR = rlc.symbols.find((s) => /^R/i.test(s.attrs.get('InstName') ?? ''))?.attrs.get('InstName') ?? 'R1';
p = runs(p, [setAnalysisLine(rlc, '.tran 5m'), setAnalysisLine(without(rlc, firstR), '.tran 5m'), setAnalysisLine(rlc, '.tran 5m')], t0 + 10800e3);
p = selectSim(p, sim3);

p = { ...p, activeVariant: p.variants[0].id, files: [{ name: 'OA_Prueba.asy', kind: 'symbol', text: OA_ASY }, { name: 'OA_Prueba.sub', kind: 'model', text: OA_SUB }] };
const text = await serializeTurbo({ ...p, created: t0, modified: t0 + 10800e3 });
writeFileSync('public/examples/prueba.turbo', text);
console.log(`public/examples/prueba.turbo: ${p.variants.length} variantes, ${p.variants.reduce((n, v) => n + v.sims.length, 0)} simulaciones, ${(text.length / 1024).toFixed(1)} kB`);
for (const v of p.variants) for (const s of v.sims) console.log(`  ${v.name} · ${s.name ?? '(auto)'}: ${s.runs.map((r) => r.summary ?? 'primera').join(' | ')}`);
