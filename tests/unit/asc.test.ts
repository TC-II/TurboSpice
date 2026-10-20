import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { decode, detectEncoding, encode } from '../../src/asc/encoding.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { effectiveAttrs, effectiveWindows, makeExplicit } from '../../src/asc/resolve.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';
import { mirrorX, rotateCW, transformAlign, transformOffset } from '../../src/asc/transform.ts';
import { Library } from '../../src/library/library.ts';

const FIX = join(__dirname, '..', 'fixtures', 'asc');
const fixtures = readdirSync(FIX).filter((f) => f.endsWith('.asc'));
const read = (f: string) => decode(new Uint8Array(readFileSync(join(FIX, f)))).text;
const lines = (t: string) => t.split(/\r\n|\r|\n/).filter((l) => l.trim());
const lib = new Library(buildBundle());

describe('codificación', () => {
  it('detecta UTF-16LE con y sin BOM, y windows-1252', () => {
    expect(detectEncoding(new Uint8Array([0xff, 0xfe, 0x56, 0]))).toBe('utf-16le');
    expect(detectEncoding(new Uint8Array([0x56, 0, 0x65, 0]))).toBe('utf-16le');
    expect(detectEncoding(new Uint8Array([0x56, 0x65, 0x72, 0x73]))).toBe('windows-1252');
  });
  it('codifica µ y Ω: cp1252 cuando alcanza, si no UTF-16LE', () => {
    expect(encode('C 1µ').encoding).toBe('windows-1252');
    expect(encode('R 1kΩ').encoding).toBe('utf-16le');
    expect(decode(encode('R 1kΩ').bytes).text).toBe('R 1kΩ');
  });
});

describe('orientaciones', () => {
  it('rota en sentido horario con Y hacia abajo y espeja en X después', () => {
    expect(transformOffset(16, 96, 'R90')).toEqual({ x: -96, y: 16 });
    expect(transformOffset(16, 96, 'M0')).toEqual({ x: -16, y: 96 });
    expect(transformOffset(16, 96, 'M90')).toEqual({ x: 96, y: 16 });
  });
  it('transforma alineaciones según la tabla de la especificación', () => {
    expect(transformAlign('Left', 'R90')).toBe('VRight');
    expect(transformAlign('Top', 'M90')).toBe('VTop');
    expect(transformAlign('VBottom', 'M270')).toBe('Top');
    expect(transformAlign('Invisible', 'R90')).toBe('Invisible');
  });
  it('Ctrl+R rota y Ctrl+E espeja de forma consistente', () => {
    let o = 'R0' as const as Parameters<typeof rotateCW>[0];
    for (let i = 0; i < 4; i++) o = rotateCW(o);
    expect(o).toBe('R0');
    expect(rotateCW(mirrorX('R0'))).toBe('M270');
    // rotar el resultado visual: un punto local (1,0) en M0 va a (-1,0); rotado 90° horario → (0,-1)
    expect(transformOffset(1, 0, rotateCW('M0'))).toEqual({ x: 0, y: -1 });
  });
});

describe('ida y vuelta .asc', () => {
  it.each(fixtures)('%s: parse → serialize reproduce el archivo', (f) => {
    const text = read(f);
    expect(lines(serializeAsc(parseAsc(text)))).toEqual(lines(text));
  });

  it.each(fixtures)('%s: el guardado explícito conserva el modelo efectivo', (f) => {
    const doc = parseAsc(read(f));
    const { doc: explicit, missing } = makeExplicit(doc, lib);
    expect(missing).toEqual([]);
    const again = parseAsc(serializeAsc(explicit));
    doc.symbols.forEach((s, i) => {
      const def = lib.symbol(s.type)!;
      const t = again.symbols[i];
      expect(Object.fromEntries(effectiveAttrs(t, def))).toEqual(Object.fromEntries(effectiveAttrs(s, def)));
      expect(Object.fromEntries(effectiveWindows(t, def, lib.windowDefaults))).toEqual(
        Object.fromEntries(effectiveWindows(s, def, lib.windowDefaults)),
      );
      // todo explícito: cada instancia lleva sus WINDOW y su Value
      expect(t.attrs.has('Value')).toBe(def.attrs.has('Value') || s.attrs.has('Value'));
      for (const idx of def.windows.keys()) expect(t.windows.has(idx)).toBe(true);
    });
  });

  it('escribe explícito lo que LTspice deja implícito (ejemplo del usuario)', () => {
    const doc = parseAsc('Version 4\nSHEET 1 880 680\nSYMBOL res -96 96 R0\nSYMATTR InstName R1\nSYMBOL res 128 144 R90\nSYMATTR InstName R2\n');
    const out = lines(serializeAsc(makeExplicit(doc, lib).doc));
    expect(out).toEqual([
      'Version 4',
      'SHEET 1 880 680',
      'SYMBOL res -96 96 R0',
      'WINDOW 0 36 40 Left 2',
      'WINDOW 3 36 76 Left 2',
      'SYMATTR InstName R1',
      'SYMATTR Value R',
      'SYMATTR Prefix R',
      'SYMBOL res 128 144 R90',
      // posiciones óptimas de ASC-Parser (#74), no las de LTspice (0 56 / 32 56)
      'WINDOW 0 2 56 VBottom 2',
      'WINDOW 3 29 56 VTop 2',
      'SYMATTR InstName R2',
      'SYMATTR Value R',
      'SYMATTR Prefix R',
    ]);
  });

  it('preserva tipos con espacios escapados y SYMATTR vacíos', () => {
    const src = 'Version 4\nSHEET 1 880 680\nSYMBOL TCLib\\\\Special\\\\74HCU04\\ Not 16 32 R0\nSYMATTR InstName U1\nSYMATTR Value ""\n';
    const doc = parseAsc(src);
    expect(doc.symbols[0].type).toBe('TCLib\\\\Special\\\\74HCU04\\ Not');
    expect(doc.symbols[0].attrs.get('Value')).toBe('');
    expect(lines(serializeAsc(doc))).toEqual(lines(src));
  });
});
