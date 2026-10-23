// Smoke test del motor WASM: corre cada caso en ngspice.wasm y lo compara con
// ngspice nativo (si está instalado) además de chequeos analíticos.
// Uso: node engine/smoke/run.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { Ngspice } from '../../src/engine/ngspice.ts';
import { CASES } from './cases.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..', 'dist-engine');

const { default: factory } = await import(pathToFileURL(join(DIST, 'ngspice.mjs')).href);
const codemodels = {};
for (const f of readdirSync(DIST).filter((f) => f.endsWith('.cm'))) {
  codemodels[f] = new Uint8Array(readFileSync(join(DIST, f)));
}
const ng = await Ngspice.create(factory, {
  spinit: readFileSync(join(DIST, 'spinit'), 'utf8'),
  codemodels,
});

// Sólo se compara contra el nativo si es la misma versión que la compilada a wasm
const WASM_VERSION = /NGSPICE_VERSION=(\d+)/.exec(readFileSync(join(HERE, '..', 'build.sh'), 'utf8'))[1];
const nativeVersion = (() => {
  try {
    return /ngspice-(\d+)/.exec(execFileSync('ngspice', ['--version'], { encoding: 'utf8' }))?.[1] ?? null;
  } catch {
    return null;
  }
})();
const hasNative = nativeVersion === WASM_VERSION;

// --- rawfile ASCII de ngspice nativo -------------------------------------
function parseRaw(text) {
  const plots = [];
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith('Title:')) { i++; continue; }
    const hdr = {};
    while (i < lines.length && !lines[i].startsWith('Variables:')) {
      const k = lines[i].indexOf(':');
      if (k > 0) hdr[lines[i].slice(0, k)] = lines[i].slice(k + 1).trim();
      i++;
    }
    const nvars = parseInt(hdr['No. Variables']);
    const npts = parseInt(hdr['No. Points']);
    const complex = /complex/.test(hdr.Flags);
    const names = [];
    for (let v = 0; v < nvars; v++) names.push(lines[++i].trim().split(/\s+/)[1]);
    i += 2; // "Values:"
    const data = names.map(() => ({ re: [], im: [] }));
    for (let p = 0; p < npts; p++) {
      for (let v = 0; v < nvars; v++) {
        const tok = lines[i++].trim().split(/\s+/).pop();
        const [re, im] = tok.split(',').map(Number);
        data[v].re.push(re);
        data[v].im.push(im ?? 0);
      }
    }
    plots.push({ name: hdr.Plotname, complex, names, data });
  }
  return plots;
}

// Normaliza nombres del rawfile ("v(out)", "i(v1)") a los de la API compartida
const normName = (n) =>
  n.toLowerCase().replace(/^v\((.*)\)$/, '$1').replace(/^i\((.*)\)$/, '$1#branch');

function runNative(netlist) {
  const dir = mkdtempSync(join(tmpdir(), 'tsp-'));
  writeFileSync(join(dir, 'c.cir'), netlist);
  execFileSync('ngspice', ['-b', '-r', 'out.raw', 'c.cir'], {
    cwd: dir,
    env: { ...process.env, SPICE_ASCIIRAWFILE: '1' },
    stdio: 'ignore',
  });
  return parseRaw(readFileSync(join(dir, 'out.raw'), 'utf8'));
}

function compareNative(result, native) {
  // Mismo orden de plots; comparamos vector a vector por nombre normalizado.
  const issues = [];
  let compared = 0;
  native.forEach((np, k) => {
    const wp = result.plots.filter((p) => p.name !== 'const')[k];
    if (!wp) return issues.push(`falta plot #${k} (${np.name})`);
    const used = new Set();
    np.names.forEach((n, v) => {
      const want = normName(n);
      // corrientes XSPICE: "i(a1)" en el rawfile ↔ "a1#branch_1_0" en la API
      // (un dispositivo con varias salidas repite el nombre: elegimos por datos)
      const dist = (x) => x.real.reduce((d, a, i) => d + Math.abs(a - (np.data[v].re[i] ?? NaN)), 0);
      const wv =
        wp.vectors.find((x) => x.name.toLowerCase() === want) ??
        wp.vectors
          .filter((x) => !used.has(x) && x.name.toLowerCase().startsWith(`${want}_`))
          .sort((a, b) => dist(a) - dist(b))[0];
      if (!wv) return issues.push(`${wp.name}: falta vector ${n}`);
      used.add(wv);
      const ref = np.data[v];
      if (wv.real.length !== ref.re.length) {
        return issues.push(`${wp.name}.${n}: largo ${wv.real.length} vs ${ref.re.length}`);
      }
      for (let i = 0; i < ref.re.length; i++) {
        const pairs = [[wv.real[i], ref.re[i]]];
        // la parte imaginaria de "frequency" en el rawfile no es significativa
        if (np.complex && n !== 'frequency') pairs.push([wv.imag?.[i] ?? 0, ref.im[i]]);
        for (const [a, b] of pairs) {
          // el rawfile ASCII tiene ~16 cifras significativas
          if (Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(b))) {
            return issues.push(`${wp.name}.${n}[${i}]: ${a} vs ${b}`);
          }
        }
      }
      compared++;
    });
  });
  return { issues, compared };
}

// --- ejecución -------------------------------------------------------------
let failed = 0;
for (const c of CASES) {
  // archivos que necesita el caso (p.ej. un .osdi); si falta alguno, se saltea
  if (c.files) {
    const missing = Object.values(c.files).filter((f) => !existsSync(join(HERE, '..', f)));
    if (missing.length) {
      console.log(`- ${c.name}: falta ${missing.join(', ')} (bash engine/build.sh)`);
      continue;
    }
    ng.writeFiles(Object.fromEntries(Object.entries(c.files).map(([k, f]) => [k, new Uint8Array(readFileSync(join(HERE, '..', f)))])));
  }
  const t0 = performance.now();
  const res = ng.simulate(c.netlist);
  const ms = (performance.now() - t0).toFixed(0);
  const problems = [...res.errors.map((e) => `ngspice: ${e}`)];
  if (res.aborted) problems.push('ngspice abortó');
  try {
    const msg = c.check?.(res);
    if (msg) problems.push(msg);
  } catch (e) {
    problems.push(`check: ${e.message}`);
  }
  let nativeInfo = '';
  if (hasNative && c.native !== false) {
    const { issues, compared } = compareNative(res, runNative(c.netlist));
    problems.push(...issues.slice(0, 5));
    nativeInfo = ` [nativo: ${compared} vectores iguales]`;
  }
  if (problems.length) {
    failed++;
    console.log(`✗ ${c.name} (${ms} ms)${nativeInfo}\n    ${problems.join('\n    ')}`);
  } else {
    console.log(`✓ ${c.name} (${ms} ms)${nativeInfo}`);
  }
}

const wasm = readFileSync(join(DIST, 'ngspice.wasm'));
const cmTotal = Object.values(codemodels).reduce((a, b) => a + b.length, 0);
console.log(
  `\nngspice.wasm: ${(wasm.length / 1e6).toFixed(2)} MB (gzip ${(gzipSync(wasm, { level: 9 }).length / 1e6).toFixed(2)} MB)` +
    `, code models: ${(cmTotal / 1e3).toFixed(0)} kB, ngspice.mjs: ${(statSync(join(DIST, 'ngspice.mjs')).size / 1e3).toFixed(0)} kB`,
);
if (!hasNative) {
  console.log(
    nativeVersion
      ? `(ngspice nativo ${nativeVersion} ≠ ${WASM_VERSION}: sólo chequeos analíticos)`
      : '(ngspice nativo no encontrado: sólo chequeos analíticos)',
  );
}
console.log(failed ? `\n${failed} caso(s) fallaron` : '\nTodos los casos pasaron');
process.exit(failed ? 1 : 0);
