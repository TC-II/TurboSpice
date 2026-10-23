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
import { CASES } from './cases.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..', '..', 'engine', 'dist-engine');
const { default: factory } = await import(pathToFileURL(join(DIST, 'ngspice.mjs')).href);
const codemodels = {};
for (const f of readdirSync(DIST).filter((f) => f.endsWith('.cm'))) codemodels[f] = new Uint8Array(readFileSync(join(DIST, f)));
const ng = await Ngspice.create(factory, { spinit: readFileSync(join(DIST, 'spinit'), 'utf8'), codemodels });

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
  const syn = await synthesize(runYosys, { [c.file]: c.verilog }, c.file, c.top);
  if (c.expectError) {
    if (!syn.error || !c.expectError.test(syn.error)) problems.push(`esperaba error ${c.expectError}, dio ${syn.error ?? 'ok'}`);
  } else if (syn.error) {
    problems.push(`Yosys: ${syn.error}`);
  } else {
    const netlist = `* ${c.name}\n${syn.block.subckt}\n${c.circuit}\n.end\n`;
    const res = ng.simulate(netlist);
    if (res.errors.length) problems.push(...res.errors.map((e) => `ngspice: ${e}`));
    const p = res.plots.find((x) => x.name.startsWith('tran'));
    const time = p?.vectors.find((v) => v.name === 'time')?.real;
    const at = (node, tt) => {
      const v = p.vectors.find((x) => x.name === node);
      if (!v) throw new Error(`no hay ${node}`);
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
