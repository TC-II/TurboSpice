import { describe, expect, it } from 'vitest';
import { decodeText, encode } from '../../src/asc/encoding.ts';

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
