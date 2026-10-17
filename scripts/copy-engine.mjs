// Copia el motor compilado (engine/dist-engine) a public/engine y genera un manifest
// con los code models, que el Worker carga al iniciar.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
writeFileSync(join(DST, 'manifest.json'), JSON.stringify({ codemodels }, null, 2));
console.log(`motor copiado a public/engine (${codemodels.length} code models)`);
