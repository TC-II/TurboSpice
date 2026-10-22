import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { Library } from '../../src/library/library.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';
import { connectivity } from '../../src/netlist/connectivity.ts';
import { ltNetlist } from '../../src/netlist/ltnetlist.ts';
import { usedFiles } from '../../src/project/exchange.ts';
import { extractSubckt } from '../../src/project/extract.ts';
import { addSubckt, childSubckts, removeSubckt, renameSubckt, storeSubckt, subcktFile, symbolOutdated, updateSymbol, usages } from '../../src/project/subckt.ts';
import { newProject } from '../../src/project/turbo.ts';

const lib = new Library(buildBundle());

// R1 de in a mid, R2 de mid a out
const BUF = `Version 4
SHEET 1 880 680
WIRE -128 0 -96 0
WIRE 96 0 128 0
FLAG -128 0 in
IOPIN -128 0 In
FLAG 128 0 out
IOPIN 128 0 Out
SYMBOL res -96 16 R270
SYMATTR InstName R1
SYMATTR Value 1k
SYMBOL res 16 16 R270
SYMATTR InstName R2
SYMATTR Value 1k
`;

const tb = (type = 'BUF') => `Version 4
SHEET 1 880 680
FLAG -128 0 a
FLAG 128 0 0
SYMBOL ${type} 0 0 R0
SYMATTR InstName U1
TEXT 0 100 Left 2 !.op
`;

const withSub = () => {
  const p = addSubckt(newProject('P'), 'BUF', BUF);
  return { ...p, variants: p.variants.map((v) => ({ ...v, sims: v.sims.map((s) => ({ ...s, asc: tb() })) })) };
};

describe('subcircuitos del proyecto (#180)', () => {
  it('se agregan con un símbolo generado con sus puertos', () => {
    const p = withSub();
    expect(subcktFile(p, 'buf')?.kind).toBe('schematic');
    const sym = p.files.find((f) => f.name === 'BUF.asy')!;
    expect(sym.text).toContain('SymbolType BLOCK');
    expect([...sym.text.matchAll(/PinName (\w+)/g)].map((m) => m[1])).toEqual(['in', 'out']);
    expect(symbolOutdated(p, 'BUF')).toBe(false);
  });

  it('el netlister los usa como bloque jerárquico', () => {
    const p = withSub();
    lib.setProjectFiles(p.files);
    const lt = ltNetlist(parseAsc(tb()), lib);
    expect(lt.blocks.map((b) => b.name)).toEqual(['BUF']);
    expect(lt.warnings.join(' ')).not.toMatch(/Missing schematic/);
    lib.setProjectFiles([]);
  });

  it('guardar el texto avisa si cambiaron los puertos y el símbolo se regenera', () => {
    let p = withSub();
    const doc = parseAsc(BUF);
    doc.flags.push({ x: 0, y: 64, name: 'vdd', ioPin: 'In' });
    p = storeSubckt(p, 'BUF', serializeAsc(doc));
    expect(symbolOutdated(p, 'BUF')).toBe(true);
    p = updateSymbol(p, 'BUF');
    expect(symbolOutdated(p, 'BUF')).toBe(false);
    expect(p.files.find((f) => f.name === 'BUF.asy')!.text).toContain('PinName vdd');
  });

  it('usos, renombrar y borrar', () => {
    let p = withSub();
    const label = () => 'x';
    expect(usages(p, 'BUF', label).map((u) => u.inst)).toEqual(['U1']);
    p = renameSubckt(p, 'BUF', 'AMP');
    expect(subcktFile(p, 'BUF')).toBeUndefined();
    expect(subcktFile(p, 'AMP')).toBeDefined();
    expect(p.files.some((f) => f.name === 'AMP.asy')).toBe(true);
    expect(parseAsc(p.variants[0].sims[0].asc).symbols[0].type).toBe('AMP');
    expect(usages(p, 'AMP', label)).toHaveLength(1);
    p = removeSubckt(p, 'AMP');
    expect(p.files).toHaveLength(0);
  });

  it('subcircuitos anidados: el árbol y la exportación los incluyen', () => {
    let p = withSub();
    p = addSubckt(p, 'TOP', tb('BUF'));
    expect(childSubckts(p, subcktFile(p, 'TOP')!.text)).toEqual(['BUF']);
    const names = usedFiles(p.files, [tb('TOP')]).map((f) => f.name).sort();
    expect(names).toEqual(['BUF.asc', 'BUF.asy', 'TOP.asc', 'TOP.asy']);
  });
});

describe('convertir la selección en subcircuito (#180)', () => {
  // V1 → R1 → R2 → tierra; se extraen R1 y R2
  const flat = parseAsc(`Version 4
SHEET 1 880 680
WIRE 0 -16 0 -64
WIRE 0 -64 64 -64
WIRE 144 -64 176 -64
WIRE 256 -64 288 -64
WIRE 288 -64 288 32
FLAG 0 80 0
FLAG 288 32 0
SYMBOL voltage 0 -16 R0
SYMATTR InstName V1
SYMATTR Value 1
SYMBOL res 48 -48 R270
SYMATTR InstName R1
SYMATTR Value 1k
SYMBOL res 160 -48 R270
SYMATTR InstName R2
SYMATTR Value 1k
TEXT 0 120 Left 2 !.op
`);

  it('las redes que cruzan el borde son puertos; la tierra se repite adentro', () => {
    const conn = connectivity(flat, (ty) => lib.symbol(ty));
    const sel = [
      { kind: 'symbol' as const, index: 1 },
      { kind: 'symbol' as const, index: 2 },
      { kind: 'wire' as const, index: 2 },
    ];
    const r = extractSubckt(flat, sel, conn, lib, 'DIV');
    if (typeof r === 'string') throw new Error(r);
    // R2 termina en tierra: no es puerto (la tierra es global)
    expect(r.ports).toEqual(['p1']);
    expect(r.sub.symbols.map((s) => s.attrs.get('InstName'))).toEqual(['R1', 'R2']);
    expect(r.sub.flags.filter((f) => f.ioPin).map((f) => f.name)).toEqual(['p1']);
    expect(r.sub.flags.some((f) => f.name === '0')).toBe(true);
    // arriba: V1 y la instancia, conectada por etiquetas
    expect(r.parent.symbols.map((s) => s.type)).toEqual(['voltage', 'DIV']);
    const names = r.parent.flags.map((f) => f.name);
    expect(names.filter((n) => n === `${r.inst}_p1`)).toHaveLength(2);

    // el circuito de arriba con el subcircuito da la misma netlist eléctrica
    lib.setProjectFiles([
      { name: 'DIV.asc', kind: 'schematic', text: serializeAsc(r.sub) },
      { name: 'DIV.asy', kind: 'symbol', text: r.symbol },
    ]);
    const lt = ltNetlist(r.parent, lib);
    expect(lt.warnings.join(' ')).not.toMatch(/Missing/);
    expect(lt.blocks[0].ports).toHaveLength(1);
    lib.setProjectFiles([]);
  });

  it('sin conexión con el resto no hay puertos', () => {
    const conn = connectivity(flat, (ty) => lib.symbol(ty));
    const all = flat.symbols.map((_, i) => ({ kind: 'symbol' as const, index: i }));
    const wires = flat.wires.map((_, i) => ({ kind: 'wire' as const, index: i }));
    const flags = flat.flags.map((_, i) => ({ kind: 'flag' as const, index: i }));
    expect(typeof extractSubckt(flat, [...all, ...wires, ...flags], conn, lib, 'ALL')).toBe('string');
  });
});
