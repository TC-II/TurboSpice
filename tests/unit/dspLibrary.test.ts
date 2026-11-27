import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { symParams } from '../../src/project/symbolEdit.ts';

// Bibliotecas Verilog: cada módulo de library/verilog tiene su símbolo en la carpeta de library/sym
// con el mismo nombre (DSP, #366: scripts/gen-dsp-symbols.ts; 74HC y Stimuli: scripts/gen-logic-symbols.ts) y al revés
describe('bibliotecas Verilog (DSP, 74HC, Stimuli)', () => {
  const b = buildBundle();
  const mods = Object.keys(b.verilog ?? {});
  it('tiene módulos', () => expect(mods.length).toBeGreaterThan(5));
  it('cada módulo tiene su símbolo con sus parameter', () => {
    for (const m of mods) {
      const sym = b.symbols[`DSP/${m}`] ?? b.symbols[`74HC/${m}`] ?? b.symbols[`Stimuli/${m}`];
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
  it('cada símbolo de 74HC tiene su módulo, con la familia 74HC', () => {
    const syms = Object.keys(b.symbols).filter((p) => p.startsWith('74HC/'));
    expect(syms.length).toBe(15);
    for (const path of syms) {
      expect(mods, path).toContain(path.slice(5));
      expect(b.symbols[path]).toContain('SYMATTR SpiceLine vcc=5 vil={0.3*vcc} vih={0.7*vcc} vol=0 voh={vcc} iol=4m ioh=4m tr=6n tf=6n tpd=9n hdl=auto\n');
    }
  });
});
