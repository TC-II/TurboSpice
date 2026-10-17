// Deriva de un corpus de .asc guardados por LTspice dónde ubica LTspice los rótulos
// (WINDOW) de cada símbolo al rotarlo. En R0/M0 LTspice usa los WINDOW del .asy y no
// escribe nada; al rotar escribe posiciones propias por símbolo. Las tomamos como la
// moda observada (las orientaciones Mxx usan las mismas que Rxx).
//
// Salida: library/window-defaults.json  { símbolo (minúsculas): { R90: { idx: [x, y, align, size] } } }
// Uso: node scripts/derive-window-defaults.mjs <dir>...
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from '../src/asc/encoding.ts';
import { baseName } from '../src/asc/model.ts';
import { parseAsc } from '../src/asc/parse.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'library', 'window-defaults.json');
const MIN_SAMPLES = 3;
const MIN_SHARE = 0.35;

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

// stats[símbolo][rotación][idx] = Map(clave → cantidad); total[símbolo][rotación] = instancias
const stats = {};
const total = {};
for (const root of process.argv.slice(2)) {
  for (const file of walk(root)) {
    let doc;
    try {
      doc = parseAsc(decode(new Uint8Array(readFileSync(file))).text);
    } catch {
      continue;
    }
    for (const s of doc.symbols) {
      if (s.orient === 'R0' || s.orient === 'M0') continue;
      const name = baseName(s.type).toLowerCase(); // LTspice no distingue mayúsculas
      const rot = `R${s.orient.slice(1)}`;
      total[name] ??= {};
      total[name][rot] = (total[name][rot] ?? 0) + 1;
      for (const [idx, w] of s.windows) {
        // "Invisible" es una decisión del usuario, no la posición por defecto
        if (w.align === 'Invisible') continue;
        const slot = (((stats[name] ??= {})[rot] ??= {})[idx] ??= new Map());
        const key = JSON.stringify([w.x, w.y, w.align, w.size]);
        slot.set(key, (slot.get(key) ?? 0) + 1);
      }
    }
  }
}

const result = {};
for (const [name, rots] of Object.entries(stats)) {
  for (const [rot, idxs] of Object.entries(rots)) {
    const n = total[name][rot];
    if (n < MIN_SAMPLES) continue;
    for (const [idx, counts] of Object.entries(idxs)) {
      const [key, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
      if (count / n < MIN_SHARE) continue;
      ((result[name] ??= {})[rot] ??= {})[idx] = JSON.parse(key);
    }
  }
}

const sorted = Object.fromEntries(Object.keys(result).sort().map((k) => [k, result[k]]));
writeFileSync(OUT, JSON.stringify(sorted, null, 1) + '\n');
console.log(`${Object.keys(sorted).length} símbolos con posiciones por orientación → library/window-defaults.json`);
