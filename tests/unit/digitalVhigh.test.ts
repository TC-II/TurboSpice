// Bloques digitales nuevos: SpiceLine Vhigh=5 oculto (#370)
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import { effectiveWindows } from '../../src/asc/resolve.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';
import { Library } from '../../src/library/library.ts';
import { ltNetlist, ltNetlistText } from '../../src/netlist/ltnetlist.ts';
import { isLibraryDigital, translateDigital } from '../../src/netlist/digital.ts';
import { placeSymbol } from '../../src/schematic/edit.ts';

const lib = new Library(buildBundle());
const empty = () => parseAsc('Version 4\nSHEET 1 880 680\n');
const DIGITAL = readdirSync(join(__dirname, '..', '..', 'library', 'sym', 'Digital'))
  .filter((f) => f.endsWith('.asy'))
  .map((f) => f.replace(/\.asy$/, ''));

describe('bloques digitales: Vhigh=5 por omisión (#370)', () => {
  it('todos los símbolos de library/sym/Digital se reconocen como digitales', () => {
    expect(DIGITAL.length).toBeGreaterThan(10);
    for (const n of DIGITAL) expect(isLibraryDigital(lib.symbol(`Digital\\${n}`)?.attrs), n).toBe(true);
    expect(isLibraryDigital(lib.symbol('res')?.attrs)).toBe(false);
  });

  it('al colocarlos llevan SpiceLine Vhigh=5, sin rótulo visible, y el .asc lo guarda', () => {
    for (const n of DIGITAL) {
      const d = placeSymbol(empty(), `Digital\\${n}`, { x: 0, y: 0 }, 'R0', lib);
      const s = d.symbols[0];
      expect(s.attrs.get('SpiceLine'), n).toBe('Vhigh=5');
      expect(effectiveWindows(s, lib.symbol(s.type), lib.windowDefaults).has(39), n).toBe(false);
      expect(serializeAsc(d)).toMatch(/^SYMATTR SpiceLine Vhigh=5$/m);
    }
  });

  it('no se lo agregan a otros símbolos', () => {
    const d = placeSymbol(empty(), 'res', { x: 0, y: 0 }, 'R0', lib);
    expect(d.symbols[0].attrs.has('SpiceLine')).toBe(false);
  });

  it('llega a la línea A de la netlist y la traducción lo consume: nivel alto 5 y umbral 2,5', () => {
    const d = placeSymbol(empty(), 'Digital\\and', { x: 0, y: 0 }, 'R0', lib);
    expect(ltNetlistText(ltNetlist(d, lib))).toMatch(/^A1 .* AND Vhigh=5$/m);
    const warnings: string[] = [];
    const out = translateDigital('A1', ['a', 'b', '0', '0', '0', '0', 'q', '0'], 'AND Vhigh=5', warnings)?.join('\n') ?? '';
    expect(warnings).toEqual([]);
    expect(out).toContain('(V(a,0)-({5}+{0})/2)');
    expect(out).toMatch(/^B_A1__q q 0 V=\{0\}\+\(\{5\}-\{0\}\)\*V\(A1__x\)$/m);
  });

  it('un archivo guardado sin el campo sigue igual: sin SpiceLine, Vhigh=1 de LTspice', () => {
    const old = parseAsc('Version 4\nSHEET 1 880 680\nSYMBOL Digital\\and 0 0 R0\nSYMATTR InstName A1\n');
    expect(old.symbols[0].attrs.has('SpiceLine')).toBe(false);
    expect(ltNetlistText(ltNetlist(old, lib))).toMatch(/^A1 .* AND$/m);
    expect(serializeAsc(old)).not.toMatch(/SpiceLine/);
  });
});
