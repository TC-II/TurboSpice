import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { Library } from '../../src/library/library.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';
import { connectivity } from '../../src/netlist/connectivity.ts';
import { ltNetlist } from '../../src/netlist/ltnetlist.ts';
import { changedFiles, exportSubcktNetlist, runFilesOf, runSummary, subcktFilesFor, usedFiles } from '../../src/project/exchange.ts';
import { recordRun } from '../../src/project/project.ts';
import { t } from '../../src/i18n/i18n.ts';
import { extractSubckt } from '../../src/project/extract.ts';
import { adoptSymbol, assignPin, symPins } from '../../src/project/symbolEdit.ts';
import { addSubckt, storeSymbol, benchesUsing, childSubckts, placingCycle, removeSubckt, renameSubckt, storeSubckt, subcktFile, symbolOutdated, updateSymbol, usages } from '../../src/project/subckt.ts';
import { newProject, parseTurbo, serializeTurbo } from '../../src/project/turbo.ts';

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

describe('aviso al editar (#199)', () => {
  it('cuenta los testbenches que lo usan, también a través de otro subcircuito', () => {
    let p = withSub();
    expect(benchesUsing(p, 'BUF')).toBe(1);
    p = addSubckt(p, 'TOP', tb('BUF'));
    const v = p.variants[0];
    p = { ...p, variants: [{ ...v, sims: [...v.sims, { ...v.sims[0], id: 'b2', asc: tb('TOP') }] }] };
    expect(benchesUsing(p, 'BUF')).toBe(2);
    expect(benchesUsing(p, 'TOP')).toBe(1);
  });
});

describe('ciclos al colocar (#199)', () => {
  it('no se puede colocar un subcircuito adentro de sí mismo, directa ni indirectamente', () => {
    let p = withSub();
    p = addSubckt(p, 'TOP', tb('BUF'));
    p = addSubckt(p, 'OTHER');
    expect(placingCycle(p, 'BUF', ['BUF'])).toBe('BUF');
    expect(placingCycle(p, 'buf', ['res', 'TOP'])).toBe('TOP');
    expect(placingCycle(p, 'TOP', ['BUF', 'OTHER', 'res'])).toBeNull();
    expect(placingCycle(p, 'OTHER', ['TOP'])).toBeNull();
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

describe('exportar un subcircuito como .sub (#199)', () => {
  it('su .subckt y los de adentro, sin «§»', () => {
    let p = withSub();
    p = addSubckt(p, 'TOP', tb('BUF').replace('FLAG -128 0 a', 'FLAG -128 0 a\nIOPIN -128 0 In'));
    lib.setProjectFiles(p.files);
    const r = exportSubcktNetlist(p, 'top', lib)!;
    lib.setProjectFiles([]);
    expect(r.name).toBe('TOP.sub');
    const lines = r.text.split('\n');
    expect(lines).toContain('.subckt BUF in out');
    expect(lines).toContain('.ends BUF');
    expect(lines).toContain('.subckt TOP a');
    expect(lines).toContain('.ends TOP');
    expect(lines.indexOf('.subckt BUF in out')).toBeLessThan(lines.indexOf('.subckt TOP a'));
    expect(r.text).not.toMatch(/§|\.backanno|^\.end$/m);
    expect(r.text).toMatch(/^XU1 \S+ \S+ BUF$/m);
    expect(r.text).not.toMatch(/^\.op/m);
    expect(exportSubcktNetlist(p, 'nope', lib)).toBeNull();
  });
});

describe('historial de corridas con la versión de cada subcircuito (#199)', () => {
  it('cada corrida guarda los subcircuitos que usó y el resumen dice cuál cambió', async () => {
    let p = withSub();
    const sim = p.variants[0].sims[0];
    const f1 = runFilesOf(p, sim.asc)!;
    expect(Object.keys(f1).sort()).toEqual(['BUF.asc', 'BUF.asy']);
    p = recordRun(p, sim.id, sim.asc, 1, undefined, f1).project;
    // mismo circuito y mismos subcircuitos: la misma corrida
    p = recordRun(p, sim.id, sim.asc, 2, undefined, runFilesOf(p, sim.asc)).project;
    expect(p.variants[0].sims[0].runs).toHaveLength(1);
    // cambia BUF (otro valor de R1): corrida nueva, con «cambió BUF»
    p = storeSubckt(p, 'BUF', BUF.replace('SYMATTR Value 1k', 'SYMATTR Value 2k'));
    const f2 = runFilesOf(p, sim.asc);
    const sum = runSummary(t('no changes'), f1, f2);
    expect(sum).toBe(t('{name} changed', { name: 'BUF' }));
    p = recordRun(p, sim.id, sim.asc, 3, sum, f2).project;
    const runs = p.variants[0].sims[0].runs;
    expect(runs).toHaveLength(2);
    expect(runs[1].summary).toBe(sum);
    // se guardan y se leen del .turbo
    const back = (await parseTurbo(await serializeTurbo(p))).project.variants[0].sims[0].runs;
    expect(back.map((r) => r.files?.['BUF.asc'])).toEqual(runs.map((r) => r.files?.['BUF.asc']));
    expect(changedFiles(back[0].files, back[1].files)).toEqual(['BUF']);
  });
});

describe('copiar a Mis símbolos y modelos (#199)', () => {
  it('el subcircuito con su símbolo y los que usa adentro', () => {
    let p = withSub();
    p = addSubckt(p, 'TOP', tb('BUF'));
    expect(subcktFilesFor(p, 'top').map((f) => f.name).sort()).toEqual(['BUF.asc', 'BUF.asy', 'TOP.asc', 'TOP.asy']);
    expect(subcktFilesFor(p, 'nope')).toEqual([]);
  });
});

describe('un .asy existente como símbolo del subcircuito (#199)', () => {
  const ports = [{ name: 'inp' }, { name: 'inn' }, { name: 'out', dir: 'Out' }];
  const asy = lib.symbolText('OpAmps/opamp2')!;

  it('toma el dibujo y los pines, como BLOCK, y asigna los puertos', () => {
    const text = adoptSymbol(asy, ports, [['G', '10']]);
    expect(text).toMatch(/^SymbolType BLOCK$/m);
    expect(text).not.toMatch(/^SYMATTR (Prefix|Value) /m);
    expect(text).toMatch(/^SYMATTR SpiceLine G=10$/m);
    expect(text).toContain('LINE Normal -32 32 32 64');
    const pins = symPins(text);
    // OUT por nombre; inp, inn a In+ e In- por orden; V+ y V- sobran y se quitan
    expect(pins.map((p) => [p.name, p.x, p.y])).toEqual([
      ['inp', -32, 80],
      ['inn', -32, 48],
      ['out', 32, 64],
    ]);
    expect(pins.find((p) => p.name === 'out')!.order).toBe(3);
  });

  it('cambiar el puerto de un pin intercambia con el que lo tenía', () => {
    const text = assignPin(adoptSymbol(asy, ports), 0, 'inn', ports);
    expect(symPins(text).map((p) => [p.name, p.y])).toEqual([
      ['inn', 80],
      ['inp', 48],
      ['out', 64],
    ]);
    expect(symPins(text).find((p) => p.name === 'inp')!.order).toBe(1);
  });

  it('el netlister lo usa como bloque', () => {
    let p = withSub();
    p = storeSymbol(p, 'BUF', adoptSymbol(asy, [{ name: 'in' }, { name: 'out' }]));
    lib.setProjectFiles(p.files);
    const lt = ltNetlist(parseAsc(tb()), lib);
    lib.setProjectFiles([]);
    expect(lt.blocks.map((b) => [b.name, b.ports])).toEqual([['BUF', ['in', 'out']]]);
    expect(lt.elements[0].value).toBe('BUF');
  });
});
