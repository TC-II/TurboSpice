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

describe('parámetros de subcircuito (#180)', () => {
  it('el .subckt los declara con su valor por defecto y la instancia los pasa', async () => {
    const { setSymParams } = await import('../../src/project/symbolEdit.ts');
    const { ltNetlistText } = await import('../../src/netlist/ltnetlist.ts');
    let p = addSubckt(newProject('P'), 'BUF', BUF.replace('SYMATTR Value 1k\nSYMBOL res 16', 'SYMATTR Value {R}\nSYMBOL res 16'));
    p = { ...p, files: p.files.map((f) => (f.kind === 'symbol' ? { ...f, text: setSymParams(f.text, [['R', '2k']]) } : f)) };
    lib.setProjectFiles(p.files);
    const withVal = tb().replace('SYMATTR InstName U1', 'SYMATTR InstName U1\nSYMATTR SpiceLine R=5k');
    const text = ltNetlistText(ltNetlist(parseAsc(withVal), lib));
    expect(text).toMatch(/^\.subckt BUF in out params: R=2k$/m);
    expect(text).toMatch(/^X§U1 \S+ \S+ BUF params: R=5k/m);
    // sin valor propio, la instancia usa el del símbolo
    expect(ltNetlistText(ltNetlist(parseAsc(tb()), lib))).toMatch(/^X§U1 \S+ \S+ BUF params: R=2k/m);
    lib.setProjectFiles([]);
  });
});

describe('exportar e importar subcircuitos (#180)', () => {
  it('el .zip trae el .asc, el .asy y lo que usa adentro; importarlo lo reconstruye', async () => {
    const { exportSubcktZip, subcktFilesFrom } = await import('../../src/project/exchange.ts');
    const { readZip } = await import('../../src/project/zip.ts');
    const { subcktSymbol } = await import('../../src/project/subckt.ts');
    let p = addSubckt(newProject('P'), 'BUF', BUF);
    p = addSubckt(p, 'TOP', tb('BUF'));
    const z = exportSubcktZip(p, 'TOP', lib)!;
    expect(z.name).toBe('TOP.zip');
    const entries = await readZip(z.bytes);
    expect(entries.map((e) => e.path).sort()).toEqual(['BUF.asc', 'BUF.asy', 'TOP.asc', 'TOP.asy']);
    const files = subcktFilesFrom(entries, [], (n, asc) => subcktSymbol(n, parseAsc(asc)));
    expect(files.filter((f) => f.kind === 'schematic').map((f) => f.name).sort()).toEqual(['BUF.asc', 'TOP.asc']);
    // un .asc suelto recibe un símbolo generado
    const loose = subcktFilesFrom([{ path: 'x/AMP.asc', data: new TextEncoder().encode(BUF) }], [], (n, asc) => subcktSymbol(n, parseAsc(asc)));
    expect(loose.map((f) => [f.name, f.kind])).toEqual([['AMP.asc', 'schematic'], ['AMP.asy', 'symbol']]);
  });
});

describe('edición del símbolo (#180)', () => {
  it('mover pines, agrandar el cuerpo, sincronizar con los puertos y parámetros', async () => {
    const e = await import('../../src/project/symbolEdit.ts');
    const p = addSubckt(newProject('P'), 'BUF', BUF);
    let sym = p.files.find((f) => f.kind === 'symbol')!.text;
    expect(e.symPins(sym).map((x) => x.name)).toEqual(['in', 'out']);
    sym = e.movePin(sym, 0, -48, 32);
    expect(e.symPins(sym)[0]).toMatchObject({ x: -48, y: 32, name: 'in' });
    sym = e.resizeBody(sym, { x1: -64, y1: -32, x2: 64, y2: 48 });
    expect(e.symBody(sym)).toEqual({ x1: -64, y1: -32, x2: 64, y2: 48 });
    // un puerto nuevo (vdd) y uno que se va (out): «in» queda donde estaba
    sym = e.syncPins(sym, [{ name: 'in', dir: 'In' }, { name: 'vdd', dir: 'In' }]);
    expect(e.symPins(sym).map((x) => [x.name, x.order])).toEqual([['in', 1], ['vdd', 2]]);
    expect(e.symPins(sym)[0]).toMatchObject({ x: -48, y: 32 });
    sym = e.setSymParams(sym, [['G', '2'], ['R', '{1k*G}']]);
    expect(e.symParams(sym)).toEqual([['G', '2'], ['R', '{1k*G}']]);
    expect(e.setSymParams(sym, [])).not.toMatch(/SpiceLine|WINDOW 39/);
  });
});
