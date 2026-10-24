import { describe, expect, it } from 'vitest';
import { parseAsc } from '../../src/asc/parse.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';

describe('imagen de fondo y trazos a mano alzada', () => {
  const asc = 'Version 4\r\nSHEET 1 880 680\r\nIMAGE Normal 0 0 200 100 data:image/png;base64,iVBORw0KGgo=\r\nPATH Normal 3 10 10 20 15 30 12 1\r\n';

  it('se leen como figuras', () => {
    const doc = parseAsc(asc);
    expect(doc.shapes).toEqual([
      { kind: 'IMAGE', coords: [0, 0, 200, 100], data: 'data:image/png;base64,iVBORw0KGgo=' },
      { kind: 'PATH', coords: [10, 10, 20, 15, 30, 12], style: '1' },
    ]);
    expect(doc.unknown).toEqual([]);
  });

  it('ida y vuelta sin cambios', () => {
    expect(serializeAsc(parseAsc(asc))).toBe(asc);
  });
});
