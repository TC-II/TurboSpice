// Ida y vuelta sobre un corpus local de .asc: parse → serialize (fiel) debe reproducir
// el archivo, y el guardado explícito debe conservar el mismo modelo efectivo.
// Uso: node tests/corpus/roundtrip.mjs <dir|archivo>...   (por defecto, ~/ y la carpeta de LTspice)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { decode } from '../../src/asc/encoding.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';

const roots = process.argv.slice(2);
if (!roots.length) roots.push(join(homedir(), 'git'), join(homedir(), 'Documents'), join(homedir(), 'Downloads'));

function* walk(p) {
  const st = statSync(p);
  if (st.isFile()) {
    if (p.toLowerCase().endsWith('.asc')) yield p;
    return;
  }
  for (const e of readdirSync(p, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    yield* walk(join(p, e.name));
  }
}

// Normalización mínima: LTspice no siempre termina con salto de línea y usa \r\n o \n
const norm = (t) => t.split(/\r\n|\r|\n/).filter((l) => l.trim() !== '').join('\n');

let total = 0;
let exact = 0;
const failures = [];
for (const root of roots) {
  for (const file of walk(root)) {
    total++;
    try {
      const { text } = decode(new Uint8Array(readFileSync(file)));
      const out = serializeAsc(parseAsc(text));
      if (norm(out) === norm(text)) exact++;
      else {
        const a = norm(text).split('\n');
        const b = norm(out).split('\n');
        const i = a.findIndex((l, k) => l !== b[k]);
        failures.push(`${file}\n    línea ${i + 1}:\n    orig: ${JSON.stringify(a[i])}\n    out:  ${JSON.stringify(b[i])}`);
      }
    } catch (e) {
      failures.push(`${file}\n    ERROR ${e.message}`);
    }
  }
}
console.log(failures.slice(0, 15).join('\n'));
console.log(`\n${exact}/${total} idénticos tras parse → serialize (${failures.length} con diferencias)`);
process.exit(failures.length ? 1 : 0);
