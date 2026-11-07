import { describe, expect, it } from 'vitest';
import { eraseCircle, parsePenStyle, penStyleString, simplify, strokeCoords } from '../../src/schematic/pen.ts';
import { lineDash } from '../../src/schematic/shapes.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';

describe('lápiz', () => {
  it('lee y escribe el estilo de un PATH', () => {
    const p = parsePenStyle('1 w3 ce03131 s');
    expect(p).toEqual({ dash: '1', width: 3, color: 'e03131', smooth: true });
    expect(penStyleString(p)).toBe('1 w3 ce03131 s');
    expect(lineDash('1 w3 s')).toBe('10 5');
    expect(lineDash('w3')).toBeUndefined();
  });

  it('simplifica y guarda con un decimal', () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ x: i * 0.333, y: 0.01 * i }));
    expect(simplify(pts, 0.5)).toHaveLength(2);
    expect(
      strokeCoords(
        [
          { x: 1.234, y: 5.678 },
          { x: 10.05, y: 2 },
        ],
        0.5,
      ),
    ).toEqual([1.2, 5.7, 10.1, 2]);
  });

  it('el PATH con decimales y estilo va y vuelve del .asc', () => {
    const doc = parseAsc('Version 4\nSHEET 1 880 680\nPATH Normal 3 0.5 1.5 10 20.3 30 4 w3 c1c7ed6 s\n');
    expect(doc.shapes[0]).toEqual({ kind: 'PATH', coords: [0.5, 1.5, 10, 20.3, 30, 4], style: 'w3 c1c7ed6 s' });
    expect(serializeAsc(doc)).toContain('PATH Normal 3 0.5 1.5 10 20.3 30 4 w3 c1c7ed6 s');
  });

  it('la goma parte el trazo en dos', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const out = eraseCircle(line, { x: 50, y: 0 }, 10)!;
    expect(out).toEqual([
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
      ],
      [
        { x: 60, y: 0 },
        { x: 100, y: 0 },
      ],
    ]);
    expect(eraseCircle(line, { x: 50, y: 30 }, 10)).toBeNull();
    expect(eraseCircle(line, { x: 0, y: 0 }, 200)).toEqual([]);
  });
});
