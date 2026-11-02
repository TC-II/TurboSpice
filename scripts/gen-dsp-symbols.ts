// Símbolos de la biblioteca DSP (#366): sintetiza cada módulo de library/verilog/DSP con Yosys y
// escribe su símbolo (el mismo que genera la app, verilogSymbol) en library/sym/DSP. El buscador
// los muestra como cualquier símbolo; al elegir uno, el .v se copia al proyecto y se sintetiza ahí.
// Uso: node scripts/gen-dsp-symbols.ts (después de cambiar los pines o parameter de un módulo)
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runYosys } from '@yowasp/yosys';
import { synthesize } from '../src/hdl/yosys.ts';
import { verilogSymbol } from '../src/hdl/project.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'library', 'verilog', 'DSP');
const OUT = join(ROOT, 'library', 'sym', 'DSP');
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(SRC).filter((x) => x.endsWith('.v'))) {
  const name = f.replace(/\.v$/, '');
  const r = await synthesize(runYosys, { [f]: readFileSync(join(SRC, f), 'utf8') }, f, name);
  if (!r.block) throw new Error(`${f}: ${r.error}`);
  writeFileSync(join(OUT, `${name}.asy`), verilogSymbol(name, r.block));
  console.log(`${name}: ${r.block.pins.length} pines`);
}
