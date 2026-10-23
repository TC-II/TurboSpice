import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import { Library } from '../../src/library/library.ts';
import { hitTest, illegibleSizes, labelAt } from '../../src/schematic/geometry.ts';

const lib = new Library(buildBundle());

// R5 con pines en (16, 464) y (16, 544) y cables que llegan a cada pin (#196)
const doc = parseAsc(
  ['Version 4', 'SHEET 1 880 680', 'WIRE 16 432 16 464', 'WIRE 16 544 16 576', 'SYMBOL res 0 448 R0', 'SYMATTR InstName R5', ''].join('\r\n'),
);

describe('hitTest: prioridad entre cables y símbolos (#196)', () => {
  it('alejado (tolerancia grande), el cuerpo bajo el cursor le gana a un cable a 40 unidades', () => {
    expect(hitTest(doc, { x: 16, y: 504 }, lib, 47)).toEqual({ kind: 'symbol', index: 0 });
  });
  it('con zoom normal también', () => {
    expect(hitTest(doc, { x: 16, y: 504 }, lib, 6)).toEqual({ kind: 'symbol', index: 0 });
  });
  it('un cable pegado al cursor sigue ganando, aunque esté sobre el símbolo', () => {
    expect(hitTest(doc, { x: 16, y: 548 }, lib, 6)).toEqual({ kind: 'wire', index: 1 });
  });
  it('un rótulo que no se dibuja por ilegible (lod) no se agarra', () => {
    const near = { x: 40, y: 480 };
    const lod = illegibleSizes(0.126);
    expect(lod).toBeGreaterThan(2);
    expect(labelAt(doc, near, lib, 47, lod)).toBeNull();
  });
});
