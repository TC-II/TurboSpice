// Arma public/examples/ADC.turbo (ver scripts/adc/project.ts): Flash, SAR y sigma-delta de 8 bits,
// un workbench cada uno, con las fuentes de examples/adc/.
//   npx vite-node scripts/make-adc.ts
import { writeFileSync } from 'node:fs';
import { serializeTurbo } from '../src/project/turbo.ts';
import { build } from './adc/project.ts';

const p = await build();
const text = await serializeTurbo(p);
writeFileSync('public/examples/ADC.turbo', text);
const sims = p.variants[0].sims;
console.log(`ADC.turbo (${(text.length / 1024).toFixed(1)} kB):`);
for (const g of p.groups) console.log(`  ${g.name}: ${sims.filter((s) => s.group === g.id).map((s) => s.name).join(', ')}`);
