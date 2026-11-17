import { describe, expect, it } from 'vitest';
import { decode, decodeText, encode } from '../../src/asc/encoding.ts';

describe('decode (.asc): las cuatro codificaciones con µ', () => {
  const src = 'Version 4\nTEXT 0 0 Left 2 !.param c=10µ\n';
  const le = (s: string) => Uint8Array.from([...s].flatMap((c) => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8]));
  it('UTF-16LE con BOM', () => {
    const r = decode(Uint8Array.from([0xff, 0xfe, ...le(src)]));
    expect(r.text).toBe(src);
    expect(r.encoding).toBe('utf-16le');
  });
  it('UTF-8 con BOM: sin el BOM en la primera línea', () => {
    const r = decode(Uint8Array.from([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(src)]));
    expect(r.text).toBe(src);
  });
  it('UTF-8 sin BOM con µ', () => {
    expect(decode(new TextEncoder().encode(src)).text).toBe(src);
  });
  it('windows-1252 con µ (byte 0xB5)', () => {
    const bytes = Uint8Array.from([...src].map((c) => c.charCodeAt(0)));
    expect(bytes.includes(0xb5)).toBe(true);
    const r = decode(bytes);
    expect(r.text).toBe(src);
    expect(r.encoding).toBe('windows-1252');
  });
  it('ida y vuelta de un UTF-8: se guarda y se vuelve a leer igual', () => {
    const r = decode(new TextEncoder().encode(src));
    expect(decode(encode(r.text, r.encoding).bytes).text).toBe(src);
  });
});

describe('decodeText (modelos y símbolos traídos de afuera)', () => {
  const text = '* Diodo «rápido» — ñandú\n.model D1 D(Is=1e-14)\n';
  it('UTF-8 con acentos se lee como UTF-8', () => {
    expect(decodeText(new TextEncoder().encode(text))).toBe(text);
  });
  it('windows-1252 (como los de LTspice) se lee como windows-1252', () => {
    const { bytes, encoding } = encode(text, 'windows-1252');
    expect(encoding).toBe('windows-1252');
    expect(decodeText(bytes)).toBe(text);
  });
  it('UTF-16LE de LTspice, con y sin BOM', () => {
    const le = (s: string) => Uint8Array.from([...s].flatMap((c) => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8]));
    expect(decodeText(le('.model D1 D\n'))).toBe('.model D1 D\n');
    expect(decodeText(Uint8Array.from([0xff, 0xfe, ...le('.model ñ D\n')]))).toBe('.model ñ D\n');
  });
  it('ASCII puro, igual por cualquier camino', () => {
    expect(decodeText(new TextEncoder().encode('.model D1 D\n'))).toBe('.model D1 D\n');
  });
});
