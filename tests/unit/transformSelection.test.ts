// Rotar/espejar devuelve la selección remapeada: partir y fundir cables cambia sus índices
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import type { AscDoc } from '../../src/asc/model.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { Library } from '../../src/library/library.ts';
import { transformSelection } from '../../src/schematic/edit.ts';
import { pinPoints, type ItemRef } from '../../src/schematic/geometry.ts';

const lib = new Library(buildBundle());
const asc = (body: string) => parseAsc(`Version 4\nSHEET 1 880 680\n${body}`);
const seg = (d: AscDoc, r: ItemRef) => {
  const w = d.wires[r.index];
  return [`${w.x1},${w.y1}`, `${w.x2},${w.y2}`].sort().join('>');
};
const wireSegs = (d: AscDoc, refs: ItemRef[]) => refs.filter((r) => r.kind === 'wire').map((r) => seg(d, r));

/** res con un cable suelto elegido a su lado */
const base = 'SYMBOL res 0 0 R0\nSYMATTR InstName R1\nWIRE 48 128 48 192\n';
const SEL: ItemRef[] = [
  { kind: 'symbol', index: 0 },
  { kind: 'wire', index: 0 },
];

describe('transformSelection', () => {
  it('sin cables que partir, la selección queda igual', () => {
    const r = transformSelection(asc(base), SEL, 'rotate', lib);
    expect(r.refs).toEqual(SEL);
  });

  it('un cable no elegido que el componente girado parte no corre la selección de cables', () => {
    const d0 = asc(base);
    const turned = transformSelection(d0, SEL, 'rotate', lib).doc;
    const [p, q] = pinPoints(turned.symbols[0], lib.symbol('res'));
    expect(p.y).toBe(q.y);
    const [l, r] = p.x < q.x ? [p, q] : [q, p];
    // cable que pasa por los dos pines del componente girado: va primero, el elegido queda segundo
    const d = asc(`WIRE ${l.x - 64} ${l.y} ${r.x + 64} ${r.y}\n${base}`);
    const sel: ItemRef[] = [
      { kind: 'symbol', index: 0 },
      { kind: 'wire', index: 1 },
    ];
    const out = transformSelection(d, sel, 'rotate', lib);
    expect(out.doc.wires.length).toBeGreaterThan(d.wires.length);
    // el elegido sigue siendo el cable corto girado, no un tramo del que lo cruza
    expect(wireSegs(out.doc, out.refs)).toEqual(wireSegs(turned, SEL));
    // (con la selección vieja, el índice 1 sería un tramo del cable que cruza)
    expect(wireSegs(out.doc, [{ kind: 'wire', index: 1 }])).not.toEqual(wireSegs(turned, SEL));
  });

  it('4 giros devuelven la selección y el cable al origen', () => {
    const turned = transformSelection(asc(base), SEL, 'rotate', lib).doc;
    const [p, q] = pinPoints(turned.symbols[0], lib.symbol('res'));
    const [l, r] = p.x < q.x ? [p, q] : [q, p];
    const d = asc(`WIRE ${l.x - 64} ${l.y} ${r.x + 64} ${r.y}\n${base}`);
    let cur = {
      doc: d,
      refs: [
        { kind: 'symbol', index: 0 },
        { kind: 'wire', index: 1 },
      ] as ItemRef[],
    };
    const start = wireSegs(cur.doc, cur.refs);
    for (let i = 0; i < 4; i++) cur = transformSelection(cur.doc, cur.refs, 'rotate', lib);
    expect(wireSegs(cur.doc, cur.refs)).toEqual(start);
    expect(cur.doc.symbols[0]).toMatchObject({ x: 0, y: 0, orient: 'R0' });
  });
});
