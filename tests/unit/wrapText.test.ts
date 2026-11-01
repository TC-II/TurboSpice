import { describe, expect, it } from 'vitest';
import { ascLines, textLines, unescapeAsc, wrapText } from '../../src/schematic/geometry.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';

describe('wrapText', () => {
  it('corta en espacios y respeta los saltos existentes', () => {
    expect(wrapText('hola mundo cruel', 10)).toBe('hola mundo\\ncruel');
    expect(wrapText('ab cd\\nef', 20)).toBe('ab cd\\nef');
  });
  it('parte las palabras más largas que la caja', () => {
    expect(wrapText('abcdefgh', 3)).toBe('abc\\ndef\\ngh');
  });
});

describe('TEXTBOX', () => {
  it('la caja fija de un comentario va y vuelve en el .asc', () => {
    const asc = 'Version 4\r\nSHEET 1 880 680\r\nTEXT 10 20 Left 2 ;hola mundo\r\nTEXTBOX 120 48\r\nTEXT 0 0 Left 2 ;sin caja\r\n';
    const doc = parseAsc(asc);
    expect(doc.texts[0].box).toEqual({ w: 120, h: 48 });
    expect(doc.texts[1].box).toBeUndefined();
    expect(serializeAsc(doc)).toBe(asc);
  });
});

describe('barras del .asc (LTspice las duplica al guardar)', () => {
  // (en el .asc: \\ es una barra y \n un salto de línea; en JS cada barra va doble)
  it('\\\\ es una barra y \\n separa líneas, de izquierda a derecha como ASC-Parser', () => {
    expect(ascLines('$\\frac{g_{m1}\\\\cdot A_0}{\\\\sqrt{h_{fe1}}}$')).toEqual(['$\\frac{g_{m1}\\cdot A_0}{\\sqrt{h_{fe1}}}$']);
    expect(ascLines('uno\\ndos')).toEqual(['uno', 'dos']);
    // \\\\n: una barra y una n, no un salto de línea
    expect(ascLines('$\\\\nu$')).toEqual(['$\\nu$']);
    expect(unescapeAsc('C:\\\\lib\\\\x')).toBe('C:\\lib\\x');
  });

  it('textLines dibuja el texto ya leído', () => {
    expect(textLines({ x: 0, y: 0, size: 2, align: 'Left', text: 'a\\\\cdot b\\nc' })).toEqual(['a\\cdot b', 'c']);
  });
});
