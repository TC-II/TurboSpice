// Guardado explícito sobre un corpus local:
//  1. makeExplicit → serialize → parse conserva atributos y ventanas efectivos.
//  2. (con Wine + LTspice) la netlist que genera LTspice del archivo guardado es idéntica a
//     la del original: LTspice interpreta igual lo que escribimos.
// Uso: node tests/corpus/explicit.mjs [--ltspice N] <dir|archivo>...
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { buildBundle } from '../../scripts/build-library.mjs';
import { decode, encode } from '../../src/asc/encoding.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { effectiveAttrs, effectiveWindows, makeExplicit } from '../../src/asc/resolve.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';
import { Library } from '../../src/library/library.ts';

const LTSPICE = join(homedir(), '.wine/drive_c/users', process.env.USER ?? '', 'AppData/Local/Programs/ADI/LTspice/LTspice.exe');

const args = process.argv.slice(2);
let ltSample = 0;
if (args[0] === '--ltspice') {
  ltSample = Number(args[1]);
  args.splice(0, 2);
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
const key = (m) => JSON.stringify([...m].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));

let total = 0;
let complete = 0;
const failures = [];
const candidates = [];
for (const root of args) {
  for (const file of walk(root)) {
    total++;
    const { text, encoding } = decode(new Uint8Array(readFileSync(file)));
    const doc = parseAsc(text);
    const { doc: explicit, missing } = makeExplicit(doc, lib);
    const out = serializeAsc(explicit);
    const again = parseAsc(out);
    doc.symbols.forEach((s, i) => {
      const def = lib.symbol(s.type);
      if (!def) return;
      const t = again.symbols[i];
      const same =
        key(effectiveAttrs(s, def)) === key(effectiveAttrs(t, def)) &&
        key(effectiveWindows(s, def, lib.windowDefaults)) === key(effectiveWindows(t, def, lib.windowDefaults));
      if (!same) failures.push(`${file}: ${s.type} ${s.attrs.get('InstName')} cambió al guardar`);
    });
    if (!missing.length) {
      complete++;
      candidates.push({ file, out, encoding });
    }
  }
}
console.log(`${total} archivos; ${complete} con todos los símbolos en la librería; ${failures.length} diferencias de modelo efectivo`);
failures.slice(0, 10).forEach((f) => console.log('  ✗', f));

// --- Oráculo: LTspice -netlist del original vs. del guardado ---------------------
const hasXvfb = (() => {
  try {
    execFileSync('which', ['xvfb-run'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
if (ltSample && !hasXvfb) console.log('(--ltspice requiere xvfb-run para no abrir LTspice en pantalla; instalar xorg-server-xvfb)');
if (ltSample && hasXvfb && existsSync(LTSPICE)) {
  const dir = mkdtempSync(join(tmpdir(), 'tsp-lt-'));
  const netlist = (asc) => {
    execFileSync('xvfb-run', ['-a', 'wine', LTSPICE, '-netlist', asc], { stdio: 'ignore', timeout: 60000 });
    const net = asc.replace(/\.asc$/, '.net');
    // primera línea: ruta del archivo (distinta entre original y copia)
    return readFileSync(net, 'latin1').split(/\r?\n/).slice(1).join('\n');
  };
  // muestra repartida a lo largo del corpus
  const step = Math.max(1, Math.floor(candidates.length / ltSample));
  const sample = candidates.filter((_, i) => i % step === 0).slice(0, ltSample);
  let ok = 0;
  sample.forEach(({ file, out, encoding }, i) => {
    // Copias en un directorio temporal para que .lib/.asy relativos no se resuelvan distinto
    const a = join(dir, `${i}-orig.asc`);
    const b = join(dir, `${i}-expl.asc`);
    copyFileSync(file, a);
    writeFileSync(b, encode(out, encoding).bytes);
    try {
      const na = netlist(a);
      const nb = netlist(b);
      if (na === nb) ok++;
      else {
        const la = na.split('\n');
        const lb = nb.split('\n');
        const j = la.findIndex((l, k) => l !== lb[k]);
        console.log(`  ✗ LTspice ${basename(file)}:\n      orig: ${la[j]}\n      expl: ${lb[j]}`);
      }
    } catch (e) {
      console.log(`  ? ${basename(file)}: ${e.message.split('\n')[0]}`);
    }
  });
  console.log(`LTspice -netlist: ${ok}/${sample.length} idénticas (original vs. guardado explícito); archivos en ${dir}`);
}
process.exit(failures.length ? 1 : 0);
