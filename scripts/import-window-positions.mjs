// Importa las posiciones óptimas de los rótulos (InstName, Value…) de ASC-Parser
// (engine/component_defaults.js) a library/window-positions.json (#74).
// Uso: node scripts/import-window-positions.mjs [carpeta de ASC-Parser]
//      (por defecto, ../ASC-Parser junto a este repositorio)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(process.argv[2] ?? join(ROOT, '..', 'ASC-Parser'));
const FILE = join(SRC, 'engine', 'component_defaults.js');

// el archivo es un script que define COMPONENT_DEFAULTS: se evalúa aislado y se lee la tabla
const table = vm.runInNewContext(`${readFileSync(FILE, 'utf8')}\n;COMPONENT_DEFAULTS`, {});

// mismo formato que window-defaults.json: símbolo (minúsculas) → orientación → índice →
// [x, y, alineación, tamaño], en coordenadas del símbolo (antes de rotar)
const out = {};
for (const [name, byOrient] of Object.entries(table).sort(([a], [b]) => a.localeCompare(b))) {
  const o = (out[name.toLowerCase()] = {});
  for (const [orient, wins] of Object.entries(byOrient)) {
    o[orient] = Object.fromEntries(
      Object.entries(wins).map(([i, w]) => [i, [w.ox, w.oy, w.align, typeof w.fontSize === 'number' ? w.fontSize : 2]]),
    );
  }
}
writeFileSync(join(ROOT, 'library', 'window-positions.json'), `${JSON.stringify(out, null, 1)}\n`);

let commit = '';
try {
  commit = execFileSync('git', ['-C', SRC, 'log', '-1', '--format=%H', '--', 'engine/component_defaults.js'], { encoding: 'utf8' }).trim();
} catch {}
if (commit) writeFileSync(join(ROOT, 'library', 'window-positions.source-commit'), `${commit}\n`);
console.log(`posiciones de rótulos: ${Object.keys(out).length} símbolos de ${FILE}${commit ? ` (commit ${commit.slice(0, 7)})` : ''}`);
