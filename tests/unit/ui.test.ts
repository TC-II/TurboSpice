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
