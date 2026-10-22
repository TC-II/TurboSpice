// Edición de codos y tramos de cables (#27): el recorrido cambia, la netlist no.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { decode } from '../../src/asc/encoding.ts';
import type { AscDoc, Wire } from '../../src/asc/model.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { Library } from '../../src/library/library.ts';
import { ltNetlist, ltNetlistText } from '../../src/netlist/ltnetlist.ts';
import {
  addWire,
  dragSegment,
  dcSourcesAsCell,
  dragSegmentStraight,
  duplicateItems,
  mergeCollinear,
  moveItems,
  wiresOn,
  moveVertex,
  moveVertexStraight,
  pasteItems,
  placeSymbol,
  removeVertex,
  sameConnections,
  setSymbolType,
  splitWire,
  transformItems,
} from '../../src/schematic/edit.ts';
import { junctionPoints, pinPoints } from '../../src/schematic/geometry.ts';

const FIX = join(__dirname, '..', 'fixtures', 'asc');
const fixtures = readdirSync(FIX).filter((f) => f.endsWith('.asc'));
const lib = new Library(buildBundle());
const load = (f: string) => parseAsc(decode(new Uint8Array(readFileSync(join(FIX, f)))).text);
const net = (d: AscDoc) => ltNetlistText(ltNetlist(d, lib));
const asc = (body: string) => parseAsc(`Version 4\nSHEET 1 880 680\n${body}`);
const ws = (d: AscDoc) => d.wires.map((w) => [w.x1, w.y1, w.x2, w.y2]);
const ortho = (d: AscDoc) => d.wires.every((w) => w.x1 === w.x2 || w.y1 === w.y2);
const noZero = (d: AscDoc) => d.wires.every((w) => w.x1 !== w.x2 || w.y1 !== w.y2);
const isOrtho = (w: Wire) => (w.x1 === w.x2) !== (w.y1 === w.y2);

// R1 y R2 (pines en x+16, y+16 / y+96) unidos abajo por un cable en U
const U = asc(`WIRE 16 96 16 160
WIRE 16 160 176 160
WIRE 176 160 176 96
FLAG 16 16 a
FLAG 176 16 0
SYMBOL res 0 0 R0
SYMATTR InstName R1
SYMBOL res 160 0 R0
SYMATTR InstName R2
`);

describe('mergeCollinear', () => {
  it('fusiona tramos colineales contiguos y superpuestos, y quita los de largo 0', () => {
    const d = asc(`WIRE 0 0 64 0
WIRE 64 0 128 0
WIRE 96 0 160 0
WIRE 32 32 32 32
`);
    expect(ws(mergeCollinear(d, lib))).toEqual([[0, 0, 160, 0]]);
  });

  it('conserva los cortes donde hay un pin, una etiqueta o una T', () => {
    const d = asc(`WIRE -64 16 16 16
WIRE 16 16 96 16
WIRE 96 16 160 16
WIRE 160 16 224 16
WIRE 96 16 96 64
WIRE 160 16 160 -64
FLAG 224 16 x
SYMBOL res 0 0 R0
`);
    // corte en el pin de R1 (16,16) y en las T de (96,16) y (160,16)
    expect(mergeCollinear(d, lib)).toBe(d);
  });

  it('no cambia la netlist de ningún ejemplo (ni los nombres N001…)', () => {
    for (const f of fixtures) {
      const d = load(f);
      expect(net(mergeCollinear(d, lib)), f).toBe(net(d));
    }
  });

  it('dibujar un cable que continúa a otro lo une en uno solo', () => {
    const d = addWire(asc('WIRE 0 0 64 0\n'), { x: 64, y: 0 }, { x: 128, y: 0 }, lib);
    expect(ws(d)).toEqual([[0, 0, 128, 0]]);
  });
});

describe('codos y tramos', () => {
  it('partir un cable y arrastrar el codo cambia el recorrido sin cambiar la netlist', () => {
    const s = splitWire(U, 1, { x: 96, y: 160 });
    expect(s.wires).toHaveLength(4);
    expect(net(s)).toBe(net(U));
    const m = moveVertex(s, { x: 96, y: 160 }, { x: 96, y: 224 }, lib);
    expect(ortho(m)).toBe(true);
    expect(ws(m)).not.toEqual(ws(U));
    expect(net(m)).toBe(net(U));
    // quitar el codo vuelve al cable original
    expect(ws(removeVertex(s, { x: 96, y: 160 }, lib))).toEqual(ws(U));
  });

  it('mover un codo en L agrega los codos necesarios', () => {
    const d = asc('WIRE 0 0 128 0\nWIRE 128 0 128 128\nFLAG 0 0 a\nFLAG 128 128 b\n');
    const m = moveVertex(d, { x: 128, y: 0 }, { x: 64, y: 64 }, lib);
    expect(ortho(m)).toBe(true);
    expect(sameConnections(d, m, lib)).toBe(true);
    expect(ws(m)).toEqual([
      [0, 0, 64, 0],
      [64, 0, 64, 64],
      [64, 64, 128, 64],
      [128, 64, 128, 128],
    ]);
  });

  it('no quita un codo entre tramos que no están alineados', () => {
    expect(removeVertex(U, { x: 16, y: 160 }, lib)).toBe(U);
  });

  it('arrastrar el tramo de abajo estira los verticales', () => {
    const d = dragSegment(U, 1, 48, 64, lib);
    expect(ws(d)).toEqual([
      [16, 96, 16, 224],
      [16, 224, 176, 224],
      [176, 224, 176, 96],
    ]);
    expect(net(d)).toBe(net(U));
  });

  it('arrastrar un tramo que sale de un pin agrega el cable al pin', () => {
    const d = dragSegment(U, 0, 32, 0, lib);
    expect(ortho(d)).toBe(true);
    expect(d.wires).toContainEqual({ x1: 16, y1: 96, x2: 48, y2: 96 });
    expect(net(d)).toBe(net(U));
  });

  it('arrastrar un tramo de una T mantiene la unión', () => {
    const d = asc('WIRE 0 0 64 0\nWIRE 64 0 128 0\nWIRE 64 0 64 64\nFLAG 0 0 a\nFLAG 128 0 b\nFLAG 64 64 c\n');
    const m = dragSegment(d, 0, 0, -32, lib);
    expect(sameConnections(d, m, lib)).toBe(true);
  });

  it('en los ejemplos, partir y arrastrar tramos no cambia la netlist si no cambia la conectividad', () => {
    for (const f of fixtures) {
      const d = load(f);
      const ref = net(d);
      d.wires.forEach((w, i) => {
        if (!isOrtho(w)) return;
        const mid = { x: Math.round((w.x1 + w.x2) / 32) * 16, y: Math.round((w.y1 + w.y2) / 32) * 16 };
        const s = splitWire(d, i, mid);
        expect(net(s), `${f} #${i}`).toBe(ref);
        const v = moveVertex(d, { x: w.x1, y: w.y1 }, { x: w.x1 + 16, y: w.y1 - 32 }, lib);
        if (sameConnections(d, v, lib)) expect(net(v), `${f} codo #${i}`).toBe(ref);
        for (const k of [16, -16, 48]) {
          const m = dragSegment(d, i, k, k, lib);
          expect(ortho(m) || !d.wires.every(isOrtho)).toBe(true);
          if (sameConnections(d, m, lib)) expect(net(m), `${f} #${i} ${k}`).toBe(ref);
        }
      });
    }
  });
});

describe('Ctrl+arrastre: en línea recta', () => {
  it('mover un codo lleva los dos cables en recta hasta el nuevo punto, sin codos', () => {
    const d = moveVertexStraight(U, { x: 16, y: 160 }, { x: 64, y: 208 }, lib);
    expect(ws(d)).toEqual([
      [16, 96, 64, 208],
      [64, 208, 176, 160],
      [176, 160, 176, 96],
    ]);
    expect(net(d)).toBe(net(U));
  });

  it('arrastrar un tramo en diagonal estira los vecinos en recta', () => {
    const d = dragSegmentStraight(U, 1, 48, 64, lib);
    expect(ws(d)).toEqual([
      [16, 96, 64, 224],
      [64, 224, 224, 224],
      [224, 224, 176, 96],
    ]);
    expect(net(d)).toBe(net(U));
  });

  it('arrastrar un tramo que sale de un pin agrega un cable recto al pin', () => {
    const d = dragSegmentStraight(U, 0, 32, 16, lib);
    expect(d.wires).toContainEqual({ x1: 16, y1: 96, x2: 48, y2: 112 });
    expect(net(d)).toBe(net(U));
  });
});

describe('mover componentes conserva las uniones', () => {
  it('en los ejemplos, mover cada componente (estirando) no cambia la netlist', () => {
    let checked = 0;
    let total = 0;
    for (const f of fixtures) {
      const d = load(f);
      const ref = net(d);
      d.symbols.forEach((_, i) => {
        for (const [dx, dy] of [[32, 0], [0, -48], [64, 32]]) {
          total++;
          const m = moveItems(d, [{ kind: 'symbol', index: i }], dx, dy, true, lib);
          expect(noZero(m)).toBe(true);
          // (si el componente cae sobre otro cable se conecta, como en LTspice)
          if (!sameConnections(d, m, lib)) continue;
          checked++;
          expect(net(m), `${f} ${d.symbols[i].type} ${dx},${dy}`).toBe(ref);
        }
      });
    }
    expect(checked).toBeGreaterThan(total * 0.7);
  });

  it('un componente con un cable en su extremo lo estira en L', () => {
    const d = moveItems(U, [{ kind: 'symbol', index: 1 }], 32, 32, true, lib);
    expect(ortho(d)).toBe(true);
    expect(net(d)).toBe(net(U));
  });

  it('un cable que queda de largo 0 se elimina y no deja nodo', () => {
    const d = asc('WIRE 16 96 16 112\nWIRE 16 112 96 112\nFLAG 96 112 out\nSYMBOL res 0 0 R0\nSYMATTR InstName R1\n');
    const m = moveItems(d, [{ kind: 'symbol', index: 0 }], 0, 16, true, lib);
    expect(noZero(m)).toBe(true);
    expect(ws(m)).toEqual([[16, 112, 96, 112]]);
    expect(junctionPoints(m, lib)).toEqual([]);
    expect(net(m)).toBe(net(d));
  });

  it('arrastrar un componente con sus cables hasta un codo no los traslada enteros', () => {
    const d = asc(`WIRE 16 -32 16 16
WIRE 16 -32 96 -32
WIRE 16 96 16 144
WIRE 16 144 96 144
SYMBOL res 0 0 R0
`);
    const all = [{ kind: 'symbol', index: 0 }, { kind: 'wire', index: 0 }, { kind: 'wire', index: 2 }] as const;
    const solo = moveItems(d, [{ kind: 'symbol', index: 0 }], 0, 16, true, lib);
    const m = moveItems(d, [...all], 0, 16, true, lib);
    expect(ws(m).sort()).toEqual(ws(solo).sort());
    expect(net(m)).toBe(net(d));
  });

  it('arrastrar de costado un componente con sus cables hasta una T los traslada enteros', () => {
    const d = asc(`WIRE -64 -32 16 -32
WIRE 16 -32 96 -32
WIRE 16 -32 16 16
WIRE -64 144 16 144
WIRE 16 144 96 144
WIRE 16 96 16 144
SYMBOL res 0 0 R0
`);
    const m = moveItems(d, [{ kind: 'symbol', index: 0 }, { kind: 'wire', index: 2 }, { kind: 'wire', index: 5 }], 32, 0, true, lib);
    expect(ws(m)).toContainEqual([48, -32, 48, 16]);
    expect(ws(m)).toContainEqual([48, 96, 48, 144]);
    expect(ortho(m)).toBe(true);
    expect(net(m)).toBe(net(d));
  });

  it('después de arrastrar a lo largo, la selección sigue a los cables estirados', () => {
    const d = asc(`WIRE -64 -32 16 -32
WIRE 16 -32 96 -32
WIRE 16 -32 16 16
WIRE -64 144 16 144
WIRE 16 144 96 144
WIRE 16 96 16 144
SYMBOL res 0 0 R0
`);
    const out: Wire[] = [];
    const up = moveItems(d, [{ kind: 'symbol', index: 0 }, { kind: 'wire', index: 2 }, { kind: 'wire', index: 5 }], 0, -16, true, lib, out);
    const sel = wiresOn(up, out).map((index) => ({ kind: 'wire' as const, index }));
    expect(sel.map((r) => ws(up)[r.index]).sort()).toEqual([[16, -32, 16, 0], [16, 80, 16, 144]]);
    const m = moveItems(up, [{ kind: 'symbol', index: 0 }, ...sel], -32, 0, true, lib);
    expect(ws(m)).toContainEqual([-16, -32, -16, 0]);
    expect(ws(m)).toContainEqual([-16, 80, -16, 144]);
    expect(net(m)).toBe(net(d));
  });

  it('arrastrar en diagonal un componente con sus cables hasta una T desliza la T', () => {
    const d = asc(`WIRE -64 -32 16 -32
WIRE 16 -32 96 -32
WIRE 16 -32 16 16
WIRE -64 144 16 144
WIRE 16 144 96 144
WIRE 16 96 16 144
SYMBOL res 0 0 R0
`);
    const out: Wire[] = [];
    const m = moveItems(d, [{ kind: 'symbol', index: 0 }, { kind: 'wire', index: 2 }, { kind: 'wire', index: 5 }], -32, 16, true, lib, out);
    expect(ws(m)).toContainEqual([-16, -32, -16, 32]);
    expect(ws(m)).toContainEqual([-16, 112, -16, 144]);
    expect(ortho(m)).toBe(true);
    expect(net(m)).toBe(net(d));
    expect(wiresOn(m, out).map((i) => ws(m)[i]).sort()).toEqual([[-16, -32, -16, 32], [-16, 112, -16, 144]]);
  });

  it('Ctrl+mover (sin estirar) no deja nodos', () => {
    const d = asc('WIRE 16 96 16 160\nWIRE 16 160 96 160\nSYMBOL res 0 0 R0\n');
    const m = moveItems(d, [{ kind: 'symbol', index: 0 }], 64, 0, false, lib);
    expect(junctionPoints(m, lib)).toEqual([]);
  });

  it('mover un componente y su cable mantiene la unión con el pin que no se mueve', () => {
    const d = asc(`WIRE 176 96 336 96
FLAG 176 16 a
FLAG 336 16 b
SYMBOL res 160 0 R0
SYMATTR InstName R2
SYMBOL res 320 0 R0
SYMATTR InstName R3
`);
    const refs = [
      { kind: 'symbol' as const, index: 1 },
      { kind: 'wire' as const, index: 0 },
      { kind: 'flag' as const, index: 1 },
    ];
    const down = moveItems(d, refs, 0, 64, true, lib);
    expect(net(down)).toBe(net(d));
    expect(ortho(down)).toBe(true);
    // en la dirección del cable, el puente se fusiona con él
    const right = moveItems(d, refs, 64, 0, true, lib);
    expect(net(right)).toBe(net(d));
    expect(ws(right)).toEqual([[176, 96, 400, 96]]);
  });

  it('un pin en T sobre un cable sigue unido al moverlo', () => {
    const d = asc('WIRE -64 96 96 96\nFLAG -64 96 a\nFLAG 16 16 b\nSYMBOL res 0 0 R0\nSYMATTR InstName R1\n');
    const m = moveItems(d, [{ kind: 'symbol', index: 0 }], 0, -32, true, lib);
    expect(net(m)).toBe(net(d));
    // y un cable que llega en T al medio de un cable movido, también
    const t = asc('WIRE 0 0 128 0\nWIRE 64 0 64 64\nFLAG 0 0 a\nFLAG 64 64 b\n');
    const mt = moveItems(t, [{ kind: 'wire', index: 0 }, { kind: 'flag', index: 0 }], 0, -32, true, lib);
    expect(sameConnections(t, mt, lib)).toBe(true);
  });
});

describe('un cable no atraviesa componentes (#45)', () => {
  // R1 vertical: pines en (16,16) y (16,96)
  const R = asc('SYMBOL res 0 0 R0\nSYMATTR InstName R1\nFLAG 16 -64 a\nFLAG 16 176 b\n');
  const series = asc('WIRE 16 -64 16 16\nWIRE 16 96 16 176\nSYMBOL res 0 0 R0\nSYMATTR InstName R1\nFLAG 16 -64 a\nFLAG 16 176 b\n');

  it('dibujar un cable a través de una resistencia deja dos cables, sin nodos, con R en serie', () => {
    const d = addWire(R, { x: 16, y: -64 }, { x: 16, y: 176 }, lib);
    expect(ws(d)).toEqual([[16, -64, 16, 16], [16, 96, 16, 176]]);
    expect(junctionPoints(d, lib)).toEqual([]);
    expect(net(d)).toBe(net(series));
    expect(net(d)).toMatch(/^R1 a b /m);
  });

  it('también horizontal, con el componente rotado, y en el sentido inverso', () => {
    const h = asc('SYMBOL res 0 0 R90\nSYMATTR InstName R1\n');
    const [p, q] = pinPoints(h.symbols[0], lib.symbol('res')).sort((a, b) => a.x - b.x);
    expect(p.y).toBe(q.y);
    const d = addWire(h, { x: q.x + 64, y: p.y }, { x: p.x - 64, y: p.y }, lib);
    expect(ws(d)).toEqual([[q.x + 64, p.y, q.x, p.y], [p.x, p.y, p.x - 64, p.y]]);
  });

  it('un transistor: el cable que pasa por colector y emisor se corta, la base queda', () => {
    // npn: C (64,0), B (0,48), E (64,96)
    const q = asc('SYMBOL npn 0 0 R0\nSYMATTR InstName Q1\n');
    expect(ws(addWire(q, { x: 64, y: -64 }, { x: 64, y: 160 }, lib))).toEqual([[64, -64, 64, 0], [64, 96, 64, 160]]);
    // pasar sólo por la base (T) no corta nada
    expect(ws(addWire(q, { x: 0, y: 48 }, { x: -64, y: 48 }, lib))).toEqual([[0, 48, -64, 48]]);
  });

  it('terminar en un pin o pasar por un solo pin (T) se conserva como antes', () => {
    expect(ws(addWire(R, { x: 16, y: -64 }, { x: 16, y: 16 }, lib))).toEqual([[16, -64, 16, 16]]);
    expect(ws(addWire(R, { x: -64, y: 96 }, { x: 96, y: 96 }, lib))).toEqual([[-64, 96, 96, 96]]);
  });

  it('si algo llega entre los dos pines no se corta (no rompe uniones)', () => {
    const f = asc('SYMBOL res 0 0 R0\nFLAG 16 48 x\n');
    expect(ws(addWire(f, { x: 16, y: -64 }, { x: 16, y: 176 }, lib))).toEqual([[16, -64, 16, 176]]);
  });

  it('un corto que ya estaba en el archivo no se toca al dibujar otro cable', () => {
    const short = asc('WIRE 16 -64 16 176\nSYMBOL res 0 0 R0\n');
    expect(ws(addWire(short, { x: 200, y: 0 }, { x: 300, y: 0 }, lib))).toEqual([[16, -64, 16, 176], [200, 0, 300, 0]]);
  });

  it('mover un componente sobre un cable lo deja en serie (estirando o no)', () => {
    const d = asc('WIRE 16 -64 16 176\nSYMBOL res -96 0 R0\nSYMATTR InstName R1\nFLAG 16 -64 a\nFLAG 16 176 b\n');
    for (const drag of [true, false]) {
      const m = moveItems(d, [{ kind: 'symbol', index: 0 }], 96, 0, drag, lib);
      expect(ws(m), `drag ${drag}`).toEqual([[16, -64, 16, 16], [16, 96, 16, 176]]);
      expect(net(m)).toMatch(/^R1 a b /m);
    }
  });

  it('mover un cable sobre un componente también lo parte', () => {
    const d = asc('WIRE 112 -64 112 176\nSYMBOL res 0 0 R0\n');
    expect(ws(moveItems(d, [{ kind: 'wire', index: 0 }], -96, 0, false, lib))).toEqual([[16, -64, 16, 16], [16, 96, 16, 176]]);
  });

  // #50: colocar, pegar, duplicar o rotar un componente sobre un cable tampoco lo deja en corto
  const wire2 = asc('WIRE 16 -64 16 176\nFLAG 16 -64 a\nFLAG 16 176 b\nWIRE 200 0 300 0\n');
  const cutWires = [[16, -64, 16, 16], [16, 96, 16, 176], [200, 0, 300, 0]];

  it('colocar un componente sobre un cable lo parte en sus pines', () => {
    const d = placeSymbol(wire2, 'res', { x: 0, y: 0 }, 'R0', lib);
    expect(ws(d)).toEqual(cutWires);
    expect(net(d)).toMatch(/^R1 a b /m);
    // sobre un cable que sólo toca un pin (T) no se corta nada
    const t = placeSymbol(asc('WIRE -64 96 96 96\n'), 'res', { x: 0, y: 0 }, 'R0', lib);
    expect(ws(t)).toEqual([[-64, 96, 96, 96]]);
  });

  it('pegar un componente sobre un cable lo parte; las referencias siguen a los cables pegados', () => {
    const frag = asc('SYMBOL res 0 0 R0\nSYMATTR InstName R1\nWIRE 400 0 400 64\n');
    const r = pasteItems(wire2, frag, { x: 0, y: 0 }, lib);
    expect(ws(r.doc)).toEqual([...cutWires, [400, 0, 400, 64]]);
    expect(r.refs).toEqual([{ kind: 'symbol', index: 0 }, { kind: 'wire', index: 3 }]);
    expect(net(r.doc)).toMatch(/^R1 a b /m);
  });

  it('pegar un cable que atraviesa un componente lo parte en tramos seleccionados', () => {
    const d = asc('SYMBOL res 0 0 R0\n');
    const r = pasteItems(d, asc('WIRE 16 -64 16 176\n'), { x: 16, y: -64 }, lib);
    expect(ws(r.doc)).toEqual([[16, -64, 16, 16], [16, 96, 16, 176]]);
    expect(r.refs).toEqual([{ kind: 'wire', index: 0 }, { kind: 'wire', index: 1 }]);
  });

  it('duplicar un componente que cae sobre un cable lo parte', () => {
    const d = { ...wire2, symbols: asc('SYMBOL res -32 -32 R0\nSYMATTR InstName R1\n').symbols };
    const r = duplicateItems(d, [{ kind: 'symbol', index: 0 }], 32, 32, lib);
    expect(ws(r.doc)).toEqual(cutWires);
    expect(net(r.doc)).toMatch(/^R2 a b /m);
  });

  it('rotar un componente sobre un cable lo parte', () => {
    const one = [{ kind: 'symbol' as const, index: 0 }];
    const [p, q] = pinPoints(transformItems(asc('SYMBOL res 0 0 R0\n'), one, 'rotate', lib).symbols[0], lib.symbol('res'));
    const [l, r] = p.x < q.x ? [p, q] : [q, p];
    expect(l.y).toBe(r.y);
    const d = asc(
      `SYMBOL res 0 0 R0\nSYMATTR InstName R1\nWIRE ${l.x - 64} ${l.y} ${r.x + 64} ${r.y}\nFLAG ${l.x - 64} ${l.y} a\nFLAG ${r.x + 64} ${r.y} b\n`,
    );
    const m = transformItems(d, one, 'rotate', lib);
    expect(ws(m)).toEqual([[l.x - 64, l.y, l.x, l.y], [r.x, r.y, r.x + 64, r.y]]);
    expect(net(m)).toMatch(/^R1 (a b|b a) /m);
  });
});

describe('cambio de símbolo (fuente V ↔ Cell, #120)', () => {
  it('el primer pin queda, el otro se mueve y los cables lo siguen; volver al V recupera el origen', () => {
    const d = asc('SYMBOL voltage 0 0 R0\nSYMATTR InstName V1\nWIRE 0 16 0 -32\nWIRE 0 96 0 128\n');
    const m = setSymbolType(d, 0, 'cell', lib);
    expect(m.symbols[0]).toMatchObject({ type: 'cell', x: 0, y: 16 });
    expect(pinPoints(m.symbols[0], lib.symbol('cell'))).toEqual([
      { x: 0, y: 16 },
      { x: 0, y: 80 },
    ]);
    expect(ortho(m)).toBe(true);
    expect(sameConnections(d, m, lib)).toBe(true);
    expect(setSymbolType(m, 0, 'voltage', lib).symbols[0]).toMatchObject({ type: 'voltage', x: 0, y: 0 });
  });

  it('al abrir, la V con valor DC pasa a cell (cables incluidos); la de forma de onda y la vacía no', () => {
    const d = asc(
      'SYMBOL voltage 0 0 R0\nSYMATTR InstName V1\nSYMATTR Value 5\nWIRE 0 16 0 -32\nWIRE 0 96 0 128\n' +
        'SYMBOL voltage 200 0 R0\nSYMATTR InstName V2\nSYMATTR Value SINE(0 1 1k)\n' +
        'SYMBOL voltage 400 0 R0\nSYMATTR InstName V3\nSYMATTR Value ""\n',
    );
    const m = dcSourcesAsCell(d, lib);
    expect(m.symbols.map((s) => s.type)).toEqual(['cell', 'voltage', 'voltage']);
    expect(m.symbols[0]).toMatchObject({ x: 0, y: 16 });
    expect(sameConnections(d, m, lib)).toBe(true);
    expect(dcSourcesAsCell(m, lib)).toBe(m);
  });
});

describe('puntos de unión', () => {
  it('T de un pin sobre el medio de un cable sí; pin contra el extremo, no', () => {
    const t = asc('WIRE -64 96 96 96\nSYMBOL res 0 0 R0\n');
    expect(junctionPoints(t, lib)).toEqual([{ x: 16, y: 96 }]);
    const e = asc('WIRE 16 96 96 96\nSYMBOL res 0 0 R0\n');
    expect(junctionPoints(e, lib)).toEqual([]);
  });

  it('tres extremos o una T de cables sí; un cruce, no', () => {
    expect(junctionPoints(asc('WIRE 0 0 64 0\nWIRE 64 0 128 0\nWIRE 64 0 64 64\n'), lib)).toEqual([{ x: 64, y: 0 }]);
    expect(junctionPoints(asc('WIRE 0 0 128 0\nWIRE 64 0 64 64\n'), lib)).toEqual([{ x: 64, y: 0 }]);
    expect(junctionPoints(asc('WIRE 0 0 128 0\nWIRE 64 -64 64 64\n'), lib)).toEqual([]);
  });
});
