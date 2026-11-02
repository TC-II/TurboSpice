// Arma public/examples/DSP.turbo (ver scripts/dsp/project.ts): filtros FIR, IIR y CIC, NCO y mezclador
// con la biblioteca DSP (#366).
//   npx vite-node scripts/make-dsp.ts
import { writeFileSync } from 'node:fs';
import { serializeTurbo } from '../src/project/turbo.ts';
import { build } from './dsp/project.ts';

const p = await build();
const text = await serializeTurbo(p);
writeFileSync('public/examples/DSP.turbo', text);
const sims = p.variants[0].sims;
console.log(`DSP.turbo (${(text.length / 1024).toFixed(1)} kB):`);
for (const g of p.groups)
  console.log(
    `  ${g.name}: ${sims
      .filter((s) => s.group === g.id)
      .map((s) => s.name)
      .join(', ')}`,
  );
