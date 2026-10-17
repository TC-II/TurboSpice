// Codificación de archivos de LTspice: windows-1252 o UTF-16LE (con o sin BOM).

export type AscEncoding = 'windows-1252' | 'utf-16le';

export function detectEncoding(bytes: Uint8Array): AscEncoding {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  // LTspice también escribe UTF-16LE sin BOM: texto ASCII con un byte nulo cada dos
  if (bytes.length >= 4 && bytes[0] !== 0 && bytes[1] === 0 && bytes[3] === 0) return 'utf-16le';
  return 'windows-1252';
}

export function decode(bytes: Uint8Array): { text: string; encoding: AscEncoding } {
  const encoding = detectEncoding(bytes);
  // TextDecoder descarta el BOM por defecto
  return { text: new TextDecoder(encoding).decode(bytes), encoding };
}

// windows-1252: 0x80–0x9F difieren de latin-1
const CP1252_HIGH = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';
const CP1252_REVERSE = new Map([...CP1252_HIGH].map((ch, i) => [ch, 0x80 + i]));

function cp1252Byte(ch: string): number | undefined {
  const c = ch.charCodeAt(0);
  if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) return c;
  return CP1252_REVERSE.get(ch);
}

export function canEncodeCp1252(text: string): boolean {
  for (const ch of text) if (cp1252Byte(ch) === undefined) return false;
  return true;
}

/**
 * Codifica como LTspice: windows-1252 si alcanza; si no, UTF-16LE sin BOM.
 * `prefer` permite conservar la codificación del archivo original.
 */
export function encode(text: string, prefer?: AscEncoding): { bytes: Uint8Array; encoding: AscEncoding } {
  if (prefer !== 'utf-16le' && canEncodeCp1252(text)) {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = cp1252Byte(text[i])!;
    return { bytes, encoding: 'windows-1252' };
  }
  const bytes = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    bytes[2 * i] = c & 0xff;
    bytes[2 * i + 1] = c >> 8;
  }
  return { bytes, encoding: 'utf-16le' };
}
