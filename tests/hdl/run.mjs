// Verilog → Yosys (WebAssembly) → .subckt con XSPICE → ngspice (#209).
// Sintetiza cada caso, lo simula en ngspice.wasm, lo compara con ngspice nativo (si es la misma
// versión) y chequea el comportamiento esperado.
// Uso: node tests/hdl/run.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runYosys } from '@yowasp/yosys';
import { Ngspice } from '../../src/engine/ngspice.ts';
import { synthesize } from '../../src/hdl/yosys.ts';
import { compileIcarus, vvpForEngine } from '../../src/hdl/icarus.ts';
import { cosimSubckt } from '../../src/hdl/synth.ts';
import { CASES } from './cases.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..', '..', 'engine', 'dist-engine');
const { default: factory } = await import(pathToFileURL(join(DIST, 'ngspice.mjs')).href);
const codemodels = {};
for (const f of readdirSync(DIST).filter((f) => f.endsWith('.cm'))) codemodels[f] = new Uint8Array(readFileSync(join(DIST, f)));
const assets = { spinit: readFileSync(join(DIST, 'spinit'), 'utf8'), codemodels };
const ng = await Ngspice.create(factory, assets);

// Icarus en WebAssembly (engine/icarus/build.sh): el compilador y el simulador
const ICARUS = join(DIST, 'icarus');
const icarus = {
  program: async (name, print) => (await import(pathToFileURL(join(ICARUS, `${name}.mjs`)).href)).default({ print, printErr: print }),
  file: async (name) => new Uint8Array(readFileSync(join(ICARUS, name))),
};
const runtime = Object.fromEntries(['libvvp.so', 'ivlng.so', 'ivlng.vpi', 'system.vpi', 'v2005_math.vpi', 'va_math.vpi', 'v2009.vpi'].map((f) => [f, new Uint8Array(readFileSync(join(ICARUS, f)))]));
/** Verilog de comportamiento: compila con Icarus y arma el .subckt con d_cosim */
async function behavioral(c) {
  const top = c.top ?? /module\s+(\w+)/.exec(c.verilog)[1];
  const r = await compileIcarus(icarus, { [c.file]: c.verilog }, top, c.params);
  if (r.error) return { error: r.error };
  const vvpFile = `${top}.vvp`;
  return { block: cosimSubckt(top, r.ports, r.params, vvpFile, c.file), vvp: { [vvpFile.toLowerCase()]: vvpForEngine(r.vvp) } };
}

const nativeOk = (() => {
  try {
    return /ngspice-47\b/.test(execFileSync('ngspice', ['--version'], { encoding: 'utf8' }));
  } catch {
    return false;
  }
})();

/** V(node) nativo en los tiempos pedidos (print de ngspice -b) */
function nativeAt(netlist, node, times) {
  const dir = mkdtempSync(join(tmpdir(), 'hdl-'));
  const lines = times.map((tt, i) => `meas tran m${i} find v(${node}) at=${tt}`).join('\n');
  writeFileSync(join(dir, 'c.cir'), netlist.replace(/\.end\s*$/i, `.control\nrun\n${lines}\n.endc\n.end\n`));
  const out = execFileSync('ngspice', ['-b', 'c.cir'], { cwd: dir, encoding: 'utf8' });
  return times.map((_, i) => parseFloat(new RegExp(`^m${i}\\s*=\\s*(\\S+)`, 'm').exec(out)?.[1] ?? 'NaN'));
}

let failed = 0;
for (const c of CASES) {
  const t0 = Date.now();
  const problems = [];
  const syn = c.behavioral ? await behavioral(c) : await synthesize(runYosys, { [c.file]: c.verilog }, c.file, c.top, c.params);
  if (c.expectError) {
    if (!syn.error || !c.expectError.test(syn.error)) problems.push(`esperaba error ${c.expectError}, dio ${syn.error ?? 'ok'}`);
  } else if (syn.error) {
    problems.push(`Yosys: ${syn.error}`);
  } else {
    const netlist = `* ${c.name}\n${syn.block.subckt}\n${c.circuit}\n.end\n`;
    // libvvp no se puede inicializar dos veces: un motor nuevo para cada caso con Icarus
    const eng = c.behavioral ? await Ngspice.create(factory, assets) : ng;
    if (c.behavioral) {
      eng.writeLibs(runtime);
      eng.writeFiles(syn.vvp);
    }
    const res = eng.simulate(netlist);
    if (res.errors.length) problems.push(...res.errors.map((e) => `ngspice: ${e}`));
    const p = res.plots.find((x) => x.name.startsWith('tran'));
    const time = p?.vectors.find((v) => v.name === 'time')?.real;
    const at = (node, tt) => {
      const v = p.vectors.find((x) => x.name === node);
      if (!v) throw new Error(`no hay ${node}`);
      // un nodo digital trae sólo sus cambios (x): el último con instante ≤ t
      if (v.x) {
        let j = 0;
        while (j + 1 < v.x.length && v.x[j + 1] <= tt) j++;
        return v.real[j];
      }
      const k = time.findIndex((x) => x >= tt);
      return v.real[k];
    };
    if (p && c.check) {
      try {
        const msg = c.check(at, syn.block);
        if (msg) problems.push(msg);
      } catch (e) {
        problems.push(e.message);
      }
    }
    if (p && nativeOk && c.compare) {
      const [node, times] = c.compare;
      const want = nativeAt(netlist, node, times);
      times.forEach((tt, i) => {
        const got = at(node, tt);
        // (el nativo se lee de "meas", con 6 cifras)
        if (Math.abs(got - want[i]) > 1e-5 * Math.max(1, Math.abs(want[i]))) problems.push(`V(${node}) en ${tt}: wasm ${got}, nativo ${want[i]}`);
      });
    }
  }
  const ms = Date.now() - t0;
  if (problems.length) {
    failed++;
    console.log(`✗ ${c.name} (${ms} ms)\n    ${problems.join('\n    ')}`);
  } else console.log(`✓ ${c.name} (${ms} ms)${nativeOk && c.compare ? ' [igual al nativo]' : ''}`);
}
if (!nativeOk) console.log('(sin ngspice-47 nativo: sólo chequeos de comportamiento)');
if (failed) {
  console.log(`\n${failed} caso(s) fallaron`);
  process.exit(1);
}
