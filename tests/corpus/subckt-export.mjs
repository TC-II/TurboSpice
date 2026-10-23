// Oráculo de exportar subcircuitos a LTspice (#199, #10): un testbench con un subcircuito del
// proyecto (sacado de la selección, colocado dos veces) se exporta a .zip; LTspice lo abre y lo
// simula (.op) y el resultado tiene que ser el mismo que el de TurboSpice (ngspice).
// Requiere ngspice; LTspice (Wine) sólo bajo xvfb-run, nunca en la pantalla del usuario: sin
// xvfb-run se compara TurboSpice contra los valores esperados y LTspice se saltea.
// Uso: node tests/corpus/subckt-export.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBundle } from '../../scripts/build-library.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';
import { Library } from '../../src/library/library.ts';
import { connectivity } from '../../src/netlist/connectivity.ts';
import { extractSubckt } from '../../src/project/extract.ts';
import { exportAllZip } from '../../src/project/exchange.ts';
import { newProject } from '../../src/project/turbo.ts';
import { readZip } from '../../src/project/zip.ts';
import { buildSimulation } from '../../src/sim/schematicSim.ts';
import { readRaw } from './raw.mjs';

const LTSPICE = join(homedir(), '.wine/drive_c/users', process.env.USER ?? '', 'AppData/Local/Programs/ADI/LTspice/LTspice.exe');
const has = (cmd) => {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

// V1 = 3 V con dos divisores R1/R2 (1k/2k) en paralelo; cada divisor pasa a ser una instancia de DIV
const flat = `Version 4
SHEET 1 880 680
FLAG 0 16 in
FLAG 0 96 0
FLAG 128 16 in
FLAG 128 96 mid
FLAG 128 144 mid
FLAG 128 224 0
SYMBOL voltage 0 0 R0
SYMATTR InstName V1
SYMATTR Value 3
SYMBOL res 112 0 R0
SYMATTR InstName R1
SYMATTR Value 1k
SYMBOL res 112 128 R0
SYMATTR InstName R2
SYMATTR Value 2k
TEXT 0 300 Left 2 !.op
`;

const lib = new Library(buildBundle());
const doc = parseAsc(flat);
const conn = connectivity(doc, (tt) => lib.symbol(tt));
// R1, R2 y las etiquetas de x = 128
const refs = [
  { kind: 'symbol', index: 1 },
  { kind: 'symbol', index: 2 },
  ...doc.flags.map((f, i) => ({ kind: 'flag', index: i, f })).filter((x) => x.f.x === 128).map(({ kind, index }) => ({ kind, index })),
];
const r = extractSubckt(doc, refs, conn, lib, 'DIV');
if (typeof r === 'string') throw new Error(r);
// la segunda instancia: una copia de la primera (con sus etiquetas) corrida a la derecha
const parent = r.parent;
const inst = parent.symbols[parent.symbols.length - 1];
parent.symbols.push({ ...inst, x: inst.x + 320, attrs: new Map([['InstName', 'X2']]) });
for (const f of parent.flags.filter((f) => f.x >= inst.x - 64 && f.x <= inst.x + 64 && f.name !== '0')) parent.flags.push({ ...f, x: f.x + 320 });
const p0 = newProject('Oráculo DIV');
const p = {
  ...p0,
  files: [{ name: 'DIV.asc', kind: 'schematic', text: serializeAsc(r.sub) }, { name: 'DIV.asy', kind: 'symbol', text: r.symbol }],
  variants: p0.variants.map((v) => ({ ...v, sims: v.sims.map((s) => ({ ...s, asc: serializeAsc(parent) })) })),
};
lib.setProjectFiles(p.files);

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed++;
};
const near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));

// TurboSpice: la netlist de ngspice, corrida con el ngspice del sistema
const dir = mkdtempSync(join(tmpdir(), 'turbospice-subckt-'));
const built = await buildSimulation(parent, lib, 'oraculo');
writeFileSync(join(dir, 'ts.cir'), built.netlist.replace(/\n\.end\s*$/i, '\n.control\nop\nprint all\n.endc\n.end'));
const out = execFileSync('ngspice', ['-b', join(dir, 'ts.cir')], { encoding: 'utf8' });
const ng = Object.fromEntries([...out.matchAll(/^(\S+) = (\S+)$/gm)].map((m) => [m[1].toLowerCase(), Number(m[2])]));
const tsI = ng['v1#branch'];
check(near(tsI, -2e-3), `TurboSpice: I(V1) = ${tsI} (dos divisores de 3 kΩ: -2 mA)`);

// exportar a .zip y escribirlo como lo descomprimiría el usuario
const files = await readZip(exportAllZip(p, lib).bytes);
const ex = join(dir, 'zip');
mkdirSync(ex);
for (const f of files) writeFileSync(join(ex, f.path), f.data);
check(['DIV.asc', 'DIV.asy'].every((n) => files.some((f) => f.path === n)), `el .zip trae DIV.asc y DIV.asy junto al testbench (${files.map((f) => f.path).join(', ')})`);

if (!has('xvfb-run') || !existsSync(LTSPICE)) {
  console.log(`- LTspice: se saltea (${has('xvfb-run') ? 'no está LTspice en Wine' : 'falta xvfb-run'}); los archivos quedaron en ${ex}`);
} else {
  const tb = files.find((f) => /\.asc$/i.test(f.path) && f.path !== 'DIV.asc').path;
  try {
    execFileSync('xvfb-run', ['-a', 'wine', LTSPICE, '-Run', '-b', join(ex, tb)], { stdio: 'ignore', timeout: 90000, cwd: ex });
  } catch {
    /* LTspice puede salir con código ≠ 0 y aun así escribir el .raw */
  }
  const raw = join(ex, tb.replace(/\.asc$/i, '.raw'));
  if (!existsSync(raw)) check(false, `LTspice no escribió ${raw}`);
  else {
    const rr = readRaw(raw);
    const val = (name) => {
      const i = rr.vars.findIndex((v) => v.name.toLowerCase() === name.toLowerCase());
      return i < 0 ? undefined : rr.data[i].re[0];
    };
    const ltI = val('I(V1)');
    check(ltI !== undefined && near(ltI, tsI), `LTspice: I(V1) = ${ltI}, igual que TurboSpice`);
    check(near(val('V(in)'), 3), `LTspice: V(in) = ${val('V(in)')}`);
  }
}

console.log(failed ? `\n${failed} fallo(s)` : '\nOráculo de subcircuitos OK');
process.exit(failed ? 1 : 0);
