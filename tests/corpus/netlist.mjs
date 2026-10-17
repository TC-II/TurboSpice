// Compara la netlist de TurboSpice (estilo LTspice) contra la que genera LTspice -netlist.
// Requiere Wine + LTspice; las netlists de LTspice se cachean por hash del archivo.
// Uso: node tests/corpus/netlist.mjs [--limit N] [--show N] <dir|archivo>...
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { buildBundle } from '../../scripts/build-library.mjs';
import { decode } from '../../src/asc/encoding.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { Library } from '../../src/library/library.ts';
import { ltNetlist, ltNetlistText } from '../../src/netlist/ltnetlist.ts';
import { compareNetlists, normalizeLtspice, readNet } from './compare.mjs';

const LTSPICE = join(homedir(), '.wine/drive_c/users', process.env.USER ?? '', 'AppData/Local/Programs/ADI/LTspice/LTspice.exe');

// LTspice muestra diálogos de error: sólo se ejecuta en una pantalla virtual (xvfb-run),
// nunca en la del usuario. Sin xvfb-run se usan únicamente las netlists ya cacheadas.
const XVFB = (() => {
  try {
    execFileSync('which', ['xvfb-run'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const CACHE = join(tmpdir(), 'turbospice-ltnet-cache');
mkdirSync(CACHE, { recursive: true });

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = Number(args[i + 1]);
  args.splice(i, 2);
  return v;
};
const limit = opt('--limit', Infinity);
const show = opt('--show', 8);

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

/** Netlist de LTspice (cacheada). null si LTspice no la generó; undefined si no se pudo ejecutar. */
export function ltspiceNetlist(file) {
  const bytes = readFileSync(file);
  const h = createHash('sha1').update(bytes).digest('hex');
  const cached = join(CACHE, `${h}.net`);
  if (existsSync(cached)) {
    const t = readNet(cached);
    return t === '' ? null : t;
  }
  if (!XVFB) return undefined; // sin pantalla virtual no se ejecuta LTspice
  const work = join(CACHE, `${h}.asc`);
  copyFileSync(file, work);
  try {
    execFileSync('xvfb-run', ['-a', 'wine', LTSPICE, '-netlist', work], { stdio: 'ignore', timeout: 60000 });
  } catch {
    /* LTspice puede salir con código ≠ 0 y aun así escribir la netlist */
  }
  const net = join(CACHE, `${h}.net`);
  if (!existsSync(net)) {
    writeFileSync(cached, '');
    return null;
  }
  return readNet(net);
}

const lib = new Library(buildBundle());
let n = 0;
let exact = 0;
let iso = 0;
let skipped = 0;
const failures = [];
for (const root of args) {
  for (const file of walk(root)) {
    if (n >= limit) break;
    const doc = parseAsc(decode(new Uint8Array(readFileSync(file))).text);
    if (doc.symbols.some((s) => !lib.symbol(s.type))) continue; // símbolos fuera de la librería
    n++;
    const ref = ltspiceNetlist(file);
    if (ref === undefined) {
      n--;
      continue;
    }
    if (ref === null) {
      skipped++;
      continue;
    }
    const ours = ltNetlistText(ltNetlist(doc, lib));
    const r = compareNetlists(normalizeLtspice(ref), ours);
    if (r.exact) exact++;
    if (r.equivalent) iso++;
    else failures.push(`${file}\n      ${r.reason}`);
    process.stderr.write(`\r${n} archivos…`);
  }
}
process.stderr.write('\n');
failures.slice(0, show).forEach((f) => console.log('✗', f));
const ok = n - skipped;
console.log(
  `\n${ok} netlists comparadas (${skipped} sin netlist de LTspice): ${iso} equivalentes, ${exact} idénticas incluidos nombres de nodos`,
);
if (!XVFB) console.log('(sin xvfb-run: sólo se compararon las netlists ya cacheadas; instalar xorg-server-xvfb)');
process.exit(iso === ok ? 0 : 1);
