// Los testbenches de Verilog de tests/hdl (*_tb.v) como «Correr testbench»: Icarus en WebAssembly
// con el libvvp de ngspice (src/hdl/testbench.ts), con los módulos de library/verilog.
// Uso: node tests/hdl/testbenches.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Ngspice } from '../../src/engine/ngspice.ts';
import { compileIcarus, vvpForEngine } from '../../src/hdl/icarus.ts';
import { TB_FILE, TB_TOP, TB_VVP, TB_WRAP, tbModule, tbNetlist, tbVerdict } from '../../src/hdl/testbench.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..', '..', 'engine', 'dist-engine');
const { default: factory } = await import(pathToFileURL(join(DIST, 'ngspice.mjs')).href);
const codemodels = {};
for (const f of readdirSync(DIST).filter((f) => f.endsWith('.cm'))) codemodels[f] = new Uint8Array(readFileSync(join(DIST, f)));
const assets = { spinit: readFileSync(join(DIST, 'spinit'), 'utf8'), codemodels };
const ICARUS = join(DIST, 'icarus');
const icarus = {
  program: async (name, print) => (await import(pathToFileURL(join(ICARUS, `${name}.mjs`)).href)).default({ print, printErr: print }),
  file: async (name) => new Uint8Array(readFileSync(join(ICARUS, name))),
};
const runtime = Object.fromEntries(['libvvp.so', 'ivlng.so', 'ivlng.vpi', 'system.vpi', 'v2005_math.vpi', 'va_math.vpi', 'v2009.vpi'].map((f) => [f, new Uint8Array(readFileSync(join(ICARUS, f)))]));

// la biblioteca, como -y: los módulos que falten se toman de ahí
const LIB = join(HERE, '..', '..', 'library', 'verilog');
const lib = Object.fromEntries(
  readdirSync(LIB, { recursive: true })
    .filter((f) => f.endsWith('.v'))
    .map((f) => [f.replace(/^.*[\\/]/, ''), readFileSync(join(LIB, f), 'utf8')]),
);

let failed = 0;
for (const tb of readdirSync(HERE).filter((f) => f.endsWith('_tb.v'))) {
  const t0 = Date.now();
  const text = readFileSync(join(HERE, tb), 'utf8');
  const r = await compileIcarus(icarus, { [tb]: text, [TB_FILE]: TB_WRAP }, TB_TOP, {}, { lib, roots: [tbModule(text)], wall: true });
  let v;
  if (r.vvp) {
    const ng = await Ngspice.create(factory, assets);
    ng.writeLibs(runtime);
    ng.writeFiles({ [TB_VVP]: vvpForEngine(r.vvp) });
    v = tbVerdict(r.log, ng.simulate(tbNetlist(r)).log);
  }
  const ok = v?.pass && v.finished;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${tb} (${Date.now() - t0} ms)${ok ? '' : `\n${r.error ?? ''}${r.log}\n${v?.output ?? ''}`}`);
}
if (failed) {
  console.log(`\n${failed} testbench(es) fallaron`);
  process.exit(1);
}
