import { describe, expect, it } from 'vitest';
import { parseAsc } from '../../src/asc/parse.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';
import { setText } from '../../src/schematic/edit.ts';
import { TEXT_ALIGNS, fontSize, inlineEditable, nearestFontIndex } from '../../src/schematic/geometry.ts';

describe('comentarios escritos en el lugar', () => {
  it('tamaño y justificación del TEXT vuelven iguales al guardar', () => {
    const src = 'Version 4\nSHEET 1 880 680\nTEXT 100 200 Left 2 ;hola\\nmundo\n';
    const doc = parseAsc(src);
    expect(serializeAsc(doc).replace(/\r\n/g, '\n')).toBe(src);
    for (const align of TEXT_ALIGNS) {
      const d = setText(doc, 0, { align, size: 5 });
      expect(serializeAsc(parseAsc(serializeAsc(d)))).toContain(`TEXT 100 200 ${align} 5 ;hola\\nmundo`);
    }
  });
  it('sólo los comentarios comunes se editan en el lugar', () => {
    const base = { x: 0, y: 0, align: 'Left', size: 2 };
    expect(inlineEditable({ ...base, kind: 'comment', text: 'nota' })).toBe(true);
    expect(inlineEditable({ ...base, kind: 'directive', text: '.tran 1m' })).toBe(false);
    expect(inlineEditable({ ...base, kind: 'comment', text: '.control\\nrun\\n.endc' })).toBe(false);
  });
  it('el tamaño más cercano a una altura de letra', () => {
    for (let i = 0; i < 8; i++) expect(nearestFontIndex(fontSize(i))).toBe(i);
    expect(nearestFontIndex(0)).toBe(0);
    expect(nearestFontIndex(1000)).toBe(7);
  });
});
