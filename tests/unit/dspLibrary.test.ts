import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { symParams } from '../../src/project/symbolEdit.ts';

// Biblioteca DSP (#366): cada módulo de library/verilog tiene su símbolo en library/sym/DSP
// (scripts/gen-dsp-symbols.ts) y al revés
describe('biblioteca DSP', () => {
  const b = buildBundle();
  const mods = Object.keys(b.verilog ?? {});
  it('tiene módulos', () => expect(mods.length).toBeGreaterThan(5));
  it('cada módulo tiene su símbolo con sus parameter', () => {
    for (const m of mods) {
      const sym = b.symbols[`DSP/${m}`];
      expect(sym, m).toBeDefined();
      expect(sym).toMatch(new RegExp(`^SYMATTR Value ${m}$`, 'm'));
      const params = new Set(symParams(sym).map(([k]) => k));
      for (const p of b.verilog![m].matchAll(/parameter\s+(\w+)/g)) expect(params.has(p[1]), `${m}: ${p[1]}`).toBe(true);
    }
  });
  it('cada símbolo de DSP tiene su módulo', () => {
    // (o su .subckt en library/sub/DSP: el ADC y el DAC ideales)
    for (const path of Object.keys(b.symbols).filter((p) => p.startsWith('DSP/'))) {
      const name = path.slice(4);
      if (!mods.includes(name)) expect(b.subs[`DSP/${name}.sub`]?.subckts, name).toContain(name);
    }
  });
});
