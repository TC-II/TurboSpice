import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { decode } from '../../src/asc/encoding.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { Library } from '../../src/library/library.ts';
import { ltNetlist } from '../../src/netlist/ltnetlist.ts';
import { netNames } from '../../src/schematic/NetNames.tsx';

const FIX = join(__dirname, '..', 'fixtures', 'asc');
const lib = new Library(buildBundle());
const fixtures = readdirSync(FIX).filter((f) => f.endsWith('.asc'));

describe('nombres de redes temporales', () => {
  it.each(fixtures)('%s: una etiqueta por red, con los nombres de la netlist, sobre la red', (f) => {
    const doc = parseAsc(decode(new Uint8Array(readFileSync(join(FIX, f)))).text);
    const lt = ltNetlist(doc, lib);
    const names = netNames(doc, lt.conn, lt.ncNames);
    const nodes = new Set(lt.elements.flatMap((e) => e.nodes).filter((n) => n !== '0' && !n.startsWith('MP_')));
    // cada nodo de la netlist tiene su etiqueta (y no hay etiquetas de más)
    expect(new Set(names.map((n) => n.name))).toEqual(new Set([...nodes, ...lt.conn.nets.filter((n) => n.name && n.name !== '0').map((n) => n.name)]));
    for (const n of names) {
      if (!n.nameable) continue;
      // poner un FLAG en ese punto conecta con la red
      const net = lt.conn.netAt(n.at);
      expect(net?.name || n.name).toBe(n.name);
      if (n.at.x % 16 || n.at.y % 16) throw new Error(`fuera de la grilla: ${n.name}`);
    }
  });
});

describe('compartir con un link', () => {
  it.each(fixtures.slice(0, 6))('%s: el link reproduce el mismo archivo', async (f) => {
    const { readShareHash, shareHash } = await import('../../src/schematic/share.ts');
    const { ascBytes, readAsc } = await import('../../src/schematic/fileio.ts');
    const { ltNetlistText } = await import('../../src/netlist/ltnetlist.ts');
    const orig = readAsc(new Uint8Array(readFileSync(join(FIX, f))), f);
    const { bytes } = ascBytes(orig.doc, lib, orig.encoding);
    const hash = await shareHash(bytes, f);
    expect(hash.length).toBeLessThan(bytes.length);
    const back = await readShareHash(`#${hash}`);
    expect(back!.name).toBe(f);
    expect(back!.bytes).toEqual(bytes);
    const reread = readAsc(back!.bytes, back!.name);
    expect(ltNetlistText(ltNetlist(reread.doc, lib))).toBe(ltNetlistText(ltNetlist(orig.doc, lib)));
  });

  it('un hash sin circuito no es un link compartido', async () => {
    const { readShareHash } = await import('../../src/schematic/share.ts');
    expect(await readShareHash('#x=1')).toBeNull();
    expect(await readShareHash('')).toBeNull();
  });
});

describe('colapsar los resultados (#36)', () => {
  it('ocultar y mostrar alternan con el esquemático expandido, sin otra forma de cerrarlos', async () => {
    const { toggleResults } = await import('../../src/ui/ResultsSplitter.tsx');
    expect(toggleResults('')).toBe('schematic');
    expect(toggleResults('results')).toBe('schematic');
    expect(toggleResults('schematic')).toBe('');
    expect(toggleResults(toggleResults(''))).toBe('');
  });

  it('se reajusta la vista cuando cambia el lienzo del esquemático', async () => {
    const { refitsSchematic } = await import('../../src/ui/ResultsSplitter.tsx');
    expect(refitsSchematic('', 'schematic')).toBe(true);
    expect(refitsSchematic('schematic', '')).toBe(true);
    expect(refitsSchematic('results', '')).toBe(true);
    expect(refitsSchematic('results', 'schematic')).toBe(true);
    // sin cambios, o con el esquemático oculto, no
    expect(refitsSchematic('schematic', 'schematic')).toBe(false);
    expect(refitsSchematic('', 'results')).toBe(false);
  });
});

describe('valores amigables', () => {
  it('4k7 → 4.7k, aviso de M (mili) y de valores no numéricos', async () => {
    const { checkValue } = await import('../../src/schematic/dialogs.tsx');
    expect(checkValue('R', '4k7')).toEqual({ value: '4.7k', info: '= 4.7kΩ' });
    expect(checkValue('R', '4R7')).toEqual({ value: '4.7', info: '= 4.7Ω' });
    expect(checkValue('C', '2u2 Rser=1')).toEqual({ value: '2.2u Rser=1', info: '= 2.2µF' });
    expect(checkValue('R', '1M').info).toMatch(/mili/);
    expect(checkValue('L', '{L0*2}')).toEqual({ value: '{L0*2}' });
    expect(checkValue('R', 'R=V(a)/2')).toEqual({ value: 'R=V(a)/2' });
    expect(checkValue('R', 'abc').warn).toMatch(/no parece/);
    expect(checkValue('V', 'SINE(0 1 1k)')).toEqual({ value: 'SINE(0 1 1k)' });
  });
});

describe('barra de herramientas (#38)', () => {
  it('los grupos que no entran pasan al desplegable, de derecha a izquierda', async () => {
    const { groupsThatFit } = await import('../../src/ui/Toolbar.tsx');
    const w = [100, 70, 230, 100, 70];
    expect(groupsThatFit(w, 600)).toBe(5);
    expect(groupsThatFit(w, 570)).toBe(5);
    // si no entran todos, se reserva lugar para el botón "Más herramientas"
    expect(groupsThatFit(w, 569, 40)).toBe(4);
    expect(groupsThatFit(w, 500, 40)).toBe(3);
    expect(groupsThatFit(w, 200, 40)).toBe(1);
    expect(groupsThatFit(w, 100, 40)).toBe(0);
  });

  it('menús: cada tipo de análisis tiene su ítem en la flecha de Simular', async () => {
    const { ANALYSES } = await import('../../src/sim/analyses.ts');
    expect(new Set(ANALYSES.map((a) => a.label)).size).toBe(ANALYSES.length);
  });
});
