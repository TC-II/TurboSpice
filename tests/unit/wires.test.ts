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
  mergeCollinear,
  moveItems,
  moveVertex,
  removeVertex,
  sameConnections,
  splitWire,
} from '../../src/schematic/edit.ts';
import { junctionPoints } from '../../src/schematic/geometry.ts';

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
