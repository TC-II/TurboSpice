// Uso: node worker.mjs <archivo.asc> <out.json>
// Lado TurboSpice: parse, símbolos, roundtrip, netlist, simulación (mismo camino que la app).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = 'C:/_DATA/ITBA/Repositorios GitHub/TurboSpice';
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { buildBundle } = await imp('scripts/build-library.mjs');
const { decode } = await imp('src/asc/encoding.ts');
const { parseAsc } = await imp('src/asc/parse.ts');
const { serializeAsc } = await imp('src/asc/serialize.ts');
const { Ngspice } = await imp('src/engine/ngspice.ts');
const { Library } = await imp('src/library/library.ts');
const { ltNetlist, ltNetlistText } = await imp('src/netlist/ltnetlist.ts');
const { buildSimulation } = await imp('src/sim/schematicSim.ts');

const [file, out] = process.argv.slice(2);
const r = { file, stage: 'parse' };
const save = () => writeFileSync(out, JSON.stringify(r));
process.on('uncaughtException', (e) => { r.exception = String(e?.stack ?? e).slice(0, 1500); save(); process.exit(0); });

globalThis.fetch = async (url) => {
  const rel = decodeURIComponent(String(url).replace(/^.*?library\/sub\//, ''));
  try {
    const b = readFileSync(join(ROOT, 'public', 'library', 'sub', rel));
    return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  } catch { return { ok: false }; }
};

const text = decode(new Uint8Array(readFileSync(file))).text;
const doc = parseAsc(text);
const norm = (t) => t.split(/\r\n|\r|\n/).filter((l) => l.trim() !== '').join('\n');
r.roundtrip = norm(serializeAsc(doc)) === norm(text);

const lib = new Library(buildBundle());
// archivos hermanos, como los que el usuario agrega en la app
const dir = dirname(file);
const me = basename(file).toLowerCase();
for (const f of readdirSync(dir)) {
  const ext = extname(f).toLowerCase();
  const p = join(dir, f);
  try {
    if (ext === '.asy') lib.addSymbol(f.slice(0, -4), decode(new Uint8Array(readFileSync(p))).text);
    else if (ext === '.asc' && f.toLowerCase() !== me && !f.includes('__v')) lib.addSchematic(f, decode(new Uint8Array(readFileSync(p))).text);
    else if (['.lib', '.sub', '.inc', '.mod', '.cir', '.txt', '.bjt', '.dio', '.mos', '.jft', '.model', '.sp', '.spi', '.spice'].includes(ext))
      lib.addModelFile(f, decode(new Uint8Array(readFileSync(p))).text);
  } catch {}
}
r.nSymbols = doc.symbols.length;
r.missingSymbols = [...new Set(doc.symbols.filter((s) => !lib.symbol(s.type)).map((s) => s.type))];
r.stage = 'netlist';
const lt = ltNetlist(doc, lib);
r.ltNet = ltNetlistText(lt);
r.hasSim = doc.texts.some((t) => t.kind === 'directive' && /(^|\\n)\s*\.(tran|ac|dc|op|noise|tf)\b/i.test(t.text));
if (!r.hasSim) { r.stage = 'done'; save(); process.exit(0); }

r.stage = 'build';
const sim = await buildSimulation(doc, lib, basename(file));
r.ngNet = sim.netlist;
if (process.env.DUMP) writeFileSync(process.env.DUMP, JSON.stringify({ netlist: sim.netlist, files: sim.files }));
r.warnings = sim.warnings;
r.tooBig = sim.tooBig;
if (sim.tooBig.length) { r.stage = 'done'; save(); process.exit(0); }

r.stage = 'simulate';
const DIST = join(ROOT, 'engine', 'dist-engine');
const { default: factory } = await import(pathToFileURL(join(DIST, 'ngspice.mjs')).href);
const codemodels = Object.fromEntries(readdirSync(DIST).filter((f) => f.endsWith('.cm')).map((f) => [f, new Uint8Array(readFileSync(join(DIST, f)))]));
const ng = await Ngspice.create(factory, { spinit: readFileSync(join(DIST, 'spinit'), 'utf8'), codemodels });
ng.writeFiles(sim.files);
const t0 = Date.now();
let netlist = process.env.EXTRA ? sim.netlist.replace(/\n\.end\s*$/i, '\n' + process.env.EXTRA + '\n.end') : sim.netlist;
if (process.env.TMAX) {
  // experimento: paso máximo como LTspice ≈ min(tstop/1024, T_sine/8.7)
  const { parseSpiceNumber, formatSpiceNumber } = await imp('src/netlist/spicenum.ts');
  let tmin = Infinity;
  for (const m of netlist.matchAll(/SINE\s*\(\s*(\S+)\s+(\S+)\s+([^\s)]+)/gi)) { const f = parseSpiceNumber(m[3]); if (f > 0) tmin = Math.min(tmin, 1 / f); }
  netlist = netlist.replace(/^\.tran\s+(.*)$/im, (l, a) => {
    const args = a.split(/\s+/);
    const nums = args.filter((x) => !/^[a-z]/i.test(x));
    const flags = args.filter((x) => /^[a-z]/i.test(x));
    const tstop = parseSpiceNumber(nums[1]);
    if (!Number.isFinite(tstop)) return l;
    let tmax = Math.min(tstop / 1024, tmin / 8.7);
    if (nums[3] && Number.isFinite(parseSpiceNumber(nums[3]))) tmax = Math.min(tmax, parseSpiceNumber(nums[3]));
    r.tmaxExp = tmax;
    return ['.tran', nums[0], nums[1], nums[2] ?? '0', formatSpiceNumber(tmax), ...flags].join(' ');
  });
}
const res = ng.simulate(netlist);
r.simMs = Date.now() - t0;
r.errors = res.errors;
r.aborted = res.aborted;
r.log = res.log.slice(-60);
// vectores (submuestreados para no inflar el JSON)
r.plots = res.plots.map((p) => ({
  name: p.name,
  type: p.type,
  vectors: p.vectors.map((v) => {
    const n = v.real.length;
    const step = Math.max(1, Math.floor(n / 4000));
    const re = [], im = [];
    for (let i = 0; i < n; i += step) { re.push(v.real[i]); if (v.imag) im.push(v.imag[i]); }
    if ((n - 1) % step) { re.push(v.real[n - 1]); if (v.imag) im.push(v.imag[n - 1]); }
    return { name: v.name, re, im: v.imag ? im : undefined };
  }),
}));
r.stage = 'done';
save();
process.exit(0);
