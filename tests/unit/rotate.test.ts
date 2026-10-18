// Rotar/espejar (#37): el componente gira alrededor de un punto fijo, sin "viajar", y los
// pines siguen en la grilla. 4 rotaciones o 2 espejados son la identidad.
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { GRID, ORIENTS, type AscDoc, type Orient, type SymbolInst } from '../../src/asc/model.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { toWorld } from '../../src/asc/transform.ts';
import { Library } from '../../src/library/library.ts';
import { setWindow, transformItems, transformPivot } from '../../src/schematic/edit.ts';
import { pinPoints, placementOrigin, symbolPivot } from '../../src/schematic/geometry.ts';
import type { ItemRef } from '../../src/schematic/geometry.ts';

const bundle = buildBundle();
const lib = new Library(bundle);
const types = Object.keys(bundle.symbols).map((p) => p.replace(/\.asy$/i, ''));
const EMPTY = parseAsc('Version 4\nSHEET 1 880 680\n');
const ONE: ItemRef[] = [{ kind: 'symbol', index: 0 }];

/** Documento con un solo símbolo colocado como lo hace el editor (cursor en el centro) */
function placed(type: string, orient: Orient, at = { x: 160, y: -96 }): AscDoc {
  const o = placementOrigin(lib.symbol(type), orient, at);
  const inst: SymbolInst = { type, x: o.x, y: o.y, orient, windows: new Map(), attrs: new Map() };
  return { ...EMPTY, symbols: [inst] };
}
const pos = (d: AscDoc) => d.symbols.map((s) => ({ x: s.x, y: s.y, orient: s.orient }));
const pins = (d: AscDoc) => pinPoints(d.symbols[0], lib.symbol(d.symbols[0].type));
const repeat = (d: AscDoc, ops: ('rotate' | 'mirror')[], refs = ONE) => ops.reduce((acc, op) => transformItems(acc, refs, op, lib), d);
const onGrid = (type: string) => {
  const def = lib.symbol(type)!;
  return def.pins.every((p) => (p.x - def.pins[0].x) % GRID === 0 && (p.y - def.pins[0].y) % GRID === 0);
};

describe('rotar/espejar sin deriva', () => {
  it.each(['res', 'cap', 'npn', 'voltage', 'nmos', 'diode'])('%s: 4 rotaciones y 2 espejados vuelven exactamente al inicio', (type) => {
    for (const orient of ORIENTS) {
      const d = placed(type, orient);
      expect(pos(repeat(d, ['rotate', 'rotate', 'rotate', 'rotate']))).toEqual(pos(d));
      expect(pos(repeat(d, ['rotate', 'rotate']))).toEqual(pos(repeat(d, ['rotate', 'rotate', 'rotate', 'rotate', 'rotate', 'rotate'])));
      expect(pos(repeat(d, ['mirror', 'mirror']))).toEqual(pos(d));
      // combinados: espejar, girar una vuelta entera y volver a espejar
      expect(pos(repeat(d, ['mirror', 'rotate', 'rotate', 'rotate', 'rotate', 'mirror']))).toEqual(pos(d));
      expect(pos(repeat(d, ['rotate', 'mirror', 'rotate', 'mirror']))).toEqual(pos(d));
    }
  });

  it.each(types)('%s: el punto fijo no se mueve y los pines siguen en la grilla', (type) => {
    const def = lib.symbol(type);
    if (!def) return;
    let d = placed(type, 'R0');
    const p0 = transformPivot(d, ONE, lib);
    for (const op of ['rotate', 'rotate', 'mirror', 'rotate', 'mirror', 'rotate', 'rotate'] as const) {
      const before = pins(d);
      d = transformItems(d, ONE, op, lib);
      // el punto fijo del símbolo (en coordenadas locales) cae siempre en el mismo lugar
      const sp = symbolPivot(def);
      expect(toWorld(d.symbols[0], sp.x, sp.y)).toEqual(p0);
      // los pines son los de antes girados/espejados alrededor del punto fijo
      const tp = (p: { x: number; y: number }) =>
        op === 'rotate' ? { x: p0.x - (p.y - p0.y) + 0, y: p0.y + (p.x - p0.x) + 0 } : { x: 2 * p0.x - p.x + 0, y: p.y };
      const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
      expect(pins(d).map(key).sort()).toEqual(before.map(tp).map(key).sort());
      if (onGrid(type)) for (const p of pins(d)) expect(Math.abs(p.x % GRID) + Math.abs(p.y % GRID)).toBe(0);
    }
  });

  it('R (cantidad impar de tramos entre pines) y C (par): punto fijo determinista', () => {
    // res: pines (16,16)-(16,96), centro (16,56) a mitad de tramo → el punto de grilla de arriba
    expect(symbolPivot(lib.symbol('res')!)).toEqual({ x: 16, y: 48 });
    // cap: pines (16,0)-(16,64), centro (16,32) sobre la grilla
    expect(symbolPivot(lib.symbol('cap')!)).toEqual({ x: 16, y: 32 });
  });

  it('varios elementos (también con empate en el centro): 4 rotaciones y 2 espejados son la identidad', () => {
    const r = placed('res', 'R0');
    // un cable de un tramo: su centro cae a mitad de tramo (empate entre puntos de grilla)
    const docs: [AscDoc, ItemRef[]][] = [
      [{ ...r, wires: [{ x1: 16, y1: 0, x2: 32, y2: 0 }] }, [{ kind: 'wire', index: 0 }]],
      [{ ...r, wires: [{ x1: 400, y1: 400, x2: 448, y2: 400 }] }, [...ONE, { kind: 'wire', index: 0 }]],
      [{ ...r, flags: [{ x: 304, y: 48, name: 'out' }] }, [...ONE, { kind: 'flag', index: 0 }]],
    ];
    for (const [d, refs] of docs) {
      const r4 = repeat(d, ['rotate', 'rotate', 'rotate', 'rotate'], refs);
      expect(pos(r4)).toEqual(pos(d));
      expect(r4.wires).toEqual(d.wires);
      expect(r4.flags.map((f) => [f.x, f.y])).toEqual(d.flags.map((f) => [f.x, f.y]));
      const m2 = repeat(d, ['mirror', 'mirror'], refs);
      expect(pos(m2)).toEqual(pos(d));
      expect(m2.wires).toEqual(d.wires);
    }
  });

  it('los rótulos movidos y ocultos conservan su WINDOW al rotar una vuelta entera', () => {
    let d = setWindow(placed('res', 'R0'), 0, 3, { x: 40, y: 24, align: 'Left', size: 2 });
    d = setWindow(d, 0, 0, { x: 36, y: 40, align: 'Invisible', size: 2 });
    const r4 = repeat(d, ['rotate', 'rotate', 'rotate', 'rotate']);
    expect(r4.symbols[0].windows.get(3)).toEqual({ x: 40, y: 24, align: 'Left', size: 2 });
    expect(r4.symbols[0].windows.get(0)?.align).toBe('Invisible');
    expect(pos(r4)).toEqual(pos(d));
  });
});
