import { describe, expect, it } from 'vitest';
import { jpegPdf } from '../../src/schematic/pdf.ts';

describe('jpegPdf', () => {
  it('arma un PDF de una página con la imagen y una tabla xref coherente', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const pdf = jpegPdf(jpeg, 300, 200);
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Width 300 /Height 200');
    expect(text).toContain('/Filter /DCTDecode /Length 7');
    // apaisada: más ancha que alta
    expect(text).toContain('/MediaBox [0 0 841.89 595.28]');
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe('xref');
    // cada entrada de la xref apunta a su objeto
    const offs = [...text.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offs.length).toBe(5);
    offs.forEach((o, i) => expect(text.slice(o, o + 7)).toBe(`${i + 1} 0 obj`));
  });
});
