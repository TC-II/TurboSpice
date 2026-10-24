// Copia el motor compilado (engine/dist-engine) a public/engine y genera un manifest
// con los code models y el hash de cada archivo, que el Worker carga al iniciar.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'engine', 'dist-engine');
const DST = join(ROOT, 'public', 'engine');

if (!existsSync(join(SRC, 'ngspice.wasm'))) {
  console.error('Falta el motor compilado: correr `npm run engine` (engine/build.sh)');
  process.exit(1);
}
rmSync(DST, { recursive: true, force: true });
mkdirSync(DST, { recursive: true });
cpSync(SRC, DST, { recursive: true });
const codemodels = readdirSync(SRC).filter((f) => f.endsWith('.cm')).sort();
// Icarus Verilog (#209): compilador y simulador de los bloques Verilog de comportamiento
const icarus = existsSync(join(SRC, 'icarus')) ? readdirSync(join(SRC, 'icarus')).sort().map((f) => `icarus/${f}`) : [];
// hash del contenido de cada archivo: el Worker guarda el motor en Cache Storage y sólo lo vuelve
// a bajar si cambió (GitHub Pages cambia el ETag de todo en cada deploy, #191)
const hashes = Object.fromEntries(
  ['ngspice.mjs', 'ngspice.wasm', ...codemodels, ...icarus].map((f) => [f, createHash('sha256').update(readFileSync(join(SRC, f))).digest('hex').slice(0, 16)]),
);
writeFileSync(join(DST, 'manifest.json'), JSON.stringify({ codemodels, icarus, hashes }, null, 2));
console.log(`motor copiado a public/engine (${codemodels.length} code models)`);
