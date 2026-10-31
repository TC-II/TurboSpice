import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import { Library } from '../../src/library/library.ts';
import { ltNetlist } from '../../src/netlist/ltnetlist.ts';
import { toNgspice } from '../../src/netlist/tongspice.ts';
import { formatAnalysis, parseAnalysis } from '../../src/sim/analyses.ts';

const lib = new Library(buildBundle());

/** .asc con cada símbolo suelto y una etiqueta de red en cada pin (en orden) */
export function ascOf(parts: { sym: string; name: string; value?: string; nets: string[] }[], texts: string[]): string {
  const out = ['Version 4', 'SHEET 1 8000 8000'];
  parts.forEach((p, i) => {
    const x = i * 400;
    const def = lib.symbol(p.sym)!;
    def.pins.forEach((pin, k) => out.push(`FLAG ${x + pin.x} ${pin.y} ${p.nets[k]}`));
    out.push(`SYMBOL ${p.sym} ${x} 0 R0`, `SYMATTR InstName ${p.name}`);
    if (p.value !== undefined) out.push(`SYMATTR Value ${p.value}`);
  });
  texts.forEach((tt, i) => out.push(`TEXT 0 ${600 + i * 40} Left 2 ${tt}`));
  return out.join('\n') + '\n';
}

/** Amplificador inversor (ganancia −10) con un operacional de un polo y la sonda en su entrada */
export const INVERTING = (analysis: string) =>
  ascOf(
    [
      { sym: 'voltage', name: 'Vin', value: 'AC 1', nets: ['in', '0'] },
      { sym: 'res', name: 'R1', value: '1k', nets: ['in', 'inv'] },
      { sym: 'res', name: 'R2', value: '10k', nets: ['inv', 'out'] },
      { sym: 'Stability/LoopProbe', name: 'LP1', nets: ['inv', 'ai'] },
      { sym: 'e', name: 'E1', value: '-1e5', nets: ['o1', '0', 'ai', '0'] },
      { sym: 'res', name: 'Rp', value: '1k', nets: ['o1', 'o2'] },
      { sym: 'cap', name: 'Cp', value: '15.9u', nets: ['o2', '0'] },
      { sym: 'e', name: 'E2', value: '1', nets: ['o3', '0', 'o2', '0'] },
      { sym: 'res', name: 'Ro', value: '100', nets: ['o3', 'out'] },
      { sym: 'res', name: 'RL', value: '2k', nets: ['out', '0'] },
    ],
    [analysis],
  );

describe('.stb', () => {
  it('se lee y se escribe', () => {
    for (const l of ['.stb LP1 dec 100 1 100meg', '.stb LP1 dm dec 10 1 1g gft', '.stb LP1 dec 10 1 1g gft Vin V(out)']) expect(formatAnalysis(parseAnalysis(l)!)).toBe(l);
    expect(parseAnalysis('.stb LP1 dec 10 1 1g')).toMatchObject({ method: 'tian', mode: '', probe: 'LP1' });
    expect(parseAnalysis('.stb LP1 cm dec 10 1 1g gft Vin V(out)')).toMatchObject({ method: 'gft', mode: 'cm', input: 'Vin', output: 'out' });
  });

  it('se traduce a un .control con las corridas de inyección', () => {
    const ng = toNgspice(ltNetlist(parseAsc(INVERTING(';.stb LP1 dec 10 1 10meg gft Vin V(out)')), lib), 'stb', { resolve: (p) => lib.resolveModelFile(p) });
    expect(ng.warnings).toEqual([]);
    expect(ng.text).toMatch(/alter vin acmag=0/);
    expect(ng.text).toMatch(/alter @v\.x_lp1\.vinj\[acmag\]=1/);
    expect(ng.text).toMatch(/alter @i\.x_lp1\.iinj\[acmag\]=1/);
    // GFT: modelo asintótico y el A-β equivalente
    expect(ng.text).toMatch(/let r = /);
    expect(ng.text).toMatch(/let ginf = /);
    expect(ng.text).toMatch(/let g0 = /);
    expect(ng.text).toMatch(/let beta = 1\//);
    expect(ng.text).toMatch(/let a = ginf\*\(ginf\*r\+g0\)/);
    expect(ng.text).toMatch(/let t = -ab/);
  });

  it('Tian: modelo A-β (T = −Aβ) y, con entrada y salida, A y β', () => {
    expect(formatAnalysis(parseAnalysis('.stb LP1 dec 10 1 1g tian Vin V(out)')!)).toBe('.stb LP1 dec 10 1 1g tian Vin V(out)');
    const ng = toNgspice(ltNetlist(parseAsc(INVERTING(';.stb LP1 dec 10 1 10meg tian Vin V(out)')), lib), 'stb', { resolve: (p) => lib.resolveModelFile(p) });
    expect(ng.warnings).toEqual([]);
    expect(ng.text).toMatch(/alter vin acmag=1/);
    expect(ng.text).toMatch(/let t = -ab/);
    expect(ng.text).toMatch(/let a = g\*\(1-t\)/);
    expect(ng.text).toMatch(/let beta = /);
    expect(ng.text).not.toMatch(/let ginf = /);
  });

  it('sonda diferencial: inyecta en el modo elegido', () => {
    const asc = ascOf(
      [
        { sym: 'voltage', name: 'V1', value: 'AC 1', nets: ['a', '0'] },
        { sym: 'res', name: 'R1', value: '1k', nets: ['a', 'p'] },
        { sym: 'res', name: 'R2', value: '1k', nets: ['a', 'n'] },
        { sym: 'Stability/DiffLoopProbe', name: 'LP2', nets: ['p', 'n', 'q', 'm'] },
        { sym: 'res', name: 'R3', value: '1k', nets: ['q', '0'] },
        { sym: 'res', name: 'R4', value: '1k', nets: ['m', '0'] },
      ],
      [';.stb LP2 cm dec 10 1 1meg'],
    );
    const ng = toNgspice(ltNetlist(parseAsc(asc), lib), 'stb', { resolve: (p) => lib.resolveModelFile(p) });
    expect(ng.warnings).toEqual([]);
    expect(ng.text).toMatch(/alter @v\.x_lp2\.xcm\.vinj\[acmag\]=1/);
    expect(ng.text).not.toMatch(/xdm\.vinj/);
  });

  it('avisa si falta la sonda y no lo combina con .step', () => {
    const missing = toNgspice(ltNetlist(parseAsc(INVERTING(';.stb LPX dec 10 1 1meg')), lib), 'stb', { resolve: (p) => lib.resolveModelFile(p) });
    expect(missing.warnings.join()).toMatch(/LPX/);
    expect(missing.text).not.toMatch(/\.control/);
  });
});

