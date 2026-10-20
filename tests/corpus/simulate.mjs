// .asc → netlist ngspice → simulación en ngspice WASM, sobre un corpus local.
// Reporta cuántos esquemáticos simulan sin errores y agrupa los errores más comunes.
// Uso: node tests/corpus/simulate.mjs [--show N] <dir|archivo>...
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildBundle } from '../../scripts/build-library.mjs';
import { decode } from '../../src/asc/encoding.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { Ngspice } from '../../src/engine/ngspice.ts';
import { Library } from '../../src/library/library.ts';
import { ltNetlist } from '../../src/netlist/ltnetlist.ts';
import { prepareSimulation, toNgspice } from '../../src/netlist/tongspice.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'engine', 'dist-engine');

const args = process.argv.slice(2);
let show = 10;
let only = null;
for (;;) {
  if (args[0] === '--show') show = Number(args.splice(0, 2)[1]);
  else if (args[0] === '--only') only = new RegExp(args.splice(0, 2)[1], 'i');
  else break;
}

function* walk(p) {
  if (statSync(p).isFile()) {
    if (p.toLowerCase().endsWith('.asc')) yield p;
    return;
  }
  for (const e of readdirSync(p, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    yield* walk(join(p, e.name));
  }
}

const lib = new Library(buildBundle());
const { default: factory } = await import(pathToFileURL(join(DIST, 'ngspice.mjs')).href);
const codemodels = Object.fromEntries(
  readdirSync(DIST)
    .filter((f) => f.endsWith('.cm'))
    .map((f) => [f, new Uint8Array(readFileSync(join(DIST, f)))]),
);
const assets = { spinit: readFileSync(join(DIST, 'spinit'), 'utf8'), codemodels };
let ng = await Ngspice.create(factory, assets);

let n = 0;
let ok = 0;
const reasons = new Map();
const examples = [];
for (const root of args) {
  for (const file of walk(root)) {
    const doc = parseAsc(decode(new Uint8Array(readFileSync(file))).text);
    if (doc.symbols.some((s) => !lib.symbol(s.type))) continue;
    if (!doc.texts.some((t) => t.kind === 'directive' && /(^|\\n)\s*\.(tran|ac|dc|op|noise|tf)\b/i.test(t.text))) continue;
    n++;
    const net = toNgspice(ltNetlist(doc, lib), basename(file), {
      resolve: (p) => lib.resolveModelFile(p),
      defines: (m) => lib.definesModel(m),
      cmpFile: (m) => lib.cmpFileDefining(m),
    });
    const prep = prepareSimulation(net, (rel) => readFileSync(join(ROOT, 'library', 'sub', rel), 'latin1'));
    ng.writeFiles(prep.files);
    const res = ng.simulate(prep.netlist);
    if (res.aborted) ng = await Ngspice.create(factory, assets);
    const missing = net.warnings.filter((w) => /no se encontró|no tiene valor/.test(w));
    if (!res.errors.length && res.plots.length && !missing.length) ok++;
    else {
      const reason = missing[0]?.replace(/^\S+: /, '').replace(/"[^"]*"/, '"…"') ?? res.errors[0]?.replace(/\d+/g, '#').slice(0, 80) ?? 'sin resultados';
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
      if (examples.length < show && (!only || only.test(reason))) examples.push(`${file}\n    ${[...missing, ...res.errors].slice(0, 3).join('\n    ')}`);
    }
    process.stderr.write(`\r${n}…`);
  }
}
process.stderr.write('\n');
examples.forEach((e) => console.log('✗', e));
console.log('\nMotivos más frecuentes:');
[...reasons].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([r, c]) => console.log(`  ${String(c).padStart(4)}  ${r}`));
console.log(`\n${ok}/${n} esquemáticos simulan sin errores en ngspice`);
