import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';
import { Library } from '../../src/library/library.ts';
import { allItems, deleteItems, duplicateItems, extractItems, moveItems, pasteItems, setShapeStyle, transformItems } from '../../src/schematic/edit.ts';
import { hitTest, type ItemRef } from '../../src/schematic/geometry.ts';
import { shapeFromClicks } from '../../src/schematic/SchematicEditor.tsx';
import { arcAngles, shapeDist, shapeInBox } from '../../src/schematic/shapes.ts';

const lib = new Library(buildBundle());

const ASC = [
  'Version 4',
  'SHEET 1 880 680',
  'LINE Normal 0 0 64 0',
  'RECTANGLE Normal 96 -32 192 32 2',
  'CIRCLE Normal 224 -32 288 32',
  'ARC Normal 320 -32 384 32 384 0 352 -32 1',
  '',
].join('\r\n');

const shapeRefs = (n: number): ItemRef[] => Array.from({ length: n }, (_, index) => ({ kind: 'shape', index }));

describe('figuras de LTspice', () => {
  it('ida y vuelta: LINE, RECTANGLE, CIRCLE y ARC con estilo', () => {
    const doc = parseAsc(ASC);
    expect(doc.shapes.map((s) => s.kind)).toEqual(['LINE', 'RECTANGLE', 'CIRCLE', 'ARC']);
    expect(doc.shapes[1].style).toBe('2');
    expect(doc.shapes[3].coords).toEqual([320, -32, 384, 32, 384, 0, 352, -32]);
    expect(serializeAsc(doc)).toBe(ASC);
  });

  it('se eligen por su trazo, no por el interior', () => {
    const doc = parseAsc(ASC);
    expect(hitTest(doc, { x: 32, y: 1 }, lib, 4)).toEqual({ kind: 'shape', index: 0 });
    expect(hitTest(doc, { x: 96, y: 0 }, lib, 4)).toEqual({ kind: 'shape', index: 1 });
    expect(hitTest(doc, { x: 144, y: 0 }, lib, 4)).toBeNull();
    expect(hitTest(doc, { x: 288, y: 0 }, lib, 4)).toEqual({ kind: 'shape', index: 2 });
    expect(hitTest(doc, { x: 256, y: 0 }, lib, 4)).toBeNull();
    // el arco va antihorario del inicio (352,-32) arriba al fin (384,0) a la derecha: pasa por
    // la izquierda y abajo, no por el cuarto superior derecho
    expect(shapeDist(doc.shapes[3], { x: 320, y: 0 })).toBeLessThan(1);
    expect(shapeDist(doc.shapes[3], { x: 352, y: 32 })).toBeLessThan(1);
    expect(shapeDist(doc.shapes[3], { x: 352 + 22.6, y: -22.6 })).toBeGreaterThan(5);
  });

  it('el recuadro elige la figura que toca su trazo; un marco que lo rodea no', () => {
    const doc = parseAsc(ASC);
    expect(shapeInBox(doc.shapes[1], { x1: 90, y1: -10, x2: 100, y2: 10 })).toBe(true);
    expect(shapeInBox(doc.shapes[1], { x1: 120, y1: -10, x2: 160, y2: 10 })).toBe(false);
  });

  it('mover, duplicar, borrar y copiar/pegar', () => {
    const doc = parseAsc(ASC);
    const moved = moveItems(doc, [{ kind: 'shape', index: 3 }], 16, -16, true, lib);
    expect(moved.shapes[3].coords).toEqual([336, -48, 400, 16, 400, -16, 368, -48]);
    expect(moved.shapes[3].style).toBe('1');
    expect(moved.shapes[0]).toBe(doc.shapes[0]);
    const dup = duplicateItems(doc, [{ kind: 'shape', index: 0 }], 0, 32, lib);
    expect(dup.doc.shapes).toHaveLength(5);
    expect(dup.doc.shapes[4].coords).toEqual([0, 32, 64, 32]);
    expect(dup.refs).toEqual([{ kind: 'shape', index: 4 }]);
    expect(deleteItems(doc, [{ kind: 'shape', index: 1 }]).shapes.map((s) => s.kind)).toEqual(['LINE', 'CIRCLE', 'ARC']);
    expect(allItems(doc).filter((r) => r.kind === 'shape')).toHaveLength(4);
    const frag = extractItems(doc, [{ kind: 'shape', index: 2 }]);
    expect(frag.shapes).toEqual([doc.shapes[2]]);
    const pasted = pasteItems(doc, frag, { x: 0, y: 64 }, lib);
    expect(pasted.doc.shapes[4].coords).toEqual([0, 64, 64, 128]);
    expect(pasted.refs).toEqual([{ kind: 'shape', index: 4 }]);
  });

  it('rotar 4 veces o espejar 2 vuelve al lugar; el espejo conserva el arco antihorario', () => {
    const doc = parseAsc(ASC);
    const refs = shapeRefs(4);
    let r = doc;
    for (let i = 0; i < 4; i++) r = transformItems(r, refs, 'rotate', lib);
    expect(r.shapes).toEqual(doc.shapes);
    const m = transformItems(doc, [{ kind: 'shape', index: 3 }], 'mirror', lib);
    expect(transformItems(m, [{ kind: 'shape', index: 3 }], 'mirror', lib).shapes).toEqual(doc.shapes);
    // el arco espejado recorre el mismo largo (no su complemento)
    expect(arcAngles(m.shapes[3].coords).span).toBeCloseTo(arcAngles(doc.shapes[3].coords).span, 6);
    // y pasa por el espejo de un punto del original
    const c = 352;
    expect(shapeDist(m.shapes[3], { x: 2 * c - 320, y: 0 })).toBeLessThan(1);
  });

  it('estilo de línea: se pone y se quita', () => {
    const doc = parseAsc(ASC);
    const d = setShapeStyle(doc, [0, 1], '3');
    expect(d.shapes.slice(0, 2).map((s) => s.style)).toEqual(['3', '3']);
    const solid = setShapeStyle(d, [1], '');
    expect('style' in solid.shapes[1]).toBe(false);
    expect(serializeAsc(solid)).toContain('RECTANGLE Normal 96 -32 192 32\r\n');
  });

  it('herramienta: clicks necesarios para cada figura', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 64, y: 32 };
    expect(shapeFromClicks('LINE', [a])).toBe('more');
    expect(shapeFromClicks('LINE', [a, a])).toBe('invalid');
    expect(shapeFromClicks('RECTANGLE', [a, b], '1')).toEqual({ kind: 'RECTANGLE', coords: [0, 0, 64, 32], style: '1' });
    expect(shapeFromClicks('CIRCLE', [a, { x: 64, y: 0 }])).toBe('invalid');
    expect(shapeFromClicks('CIRCLE', [a, b])).toEqual({ kind: 'CIRCLE', coords: [0, 0, 64, 32] });
    expect(shapeFromClicks('ARC', [a, b])).toBe('more');
    expect(shapeFromClicks('ARC', [a, b, { x: 32, y: 16 }])).toBe('invalid');
    expect(shapeFromClicks('ARC', [a, b, { x: 64, y: 16 }])).toBe('more');
    // inicio a la derecha, fin arriba: en el archivo, primero el fin
    expect(shapeFromClicks('ARC', [a, b, { x: 64, y: 16 }, { x: 32, y: 0 }])).toEqual({ kind: 'ARC', coords: [0, 0, 64, 32, 32, 0, 64, 16] });
  });
});
