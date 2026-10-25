// Arma el diccionario de deflate de los links de Compartir (src/schematic/shareDict.ts) a partir
// de una carpeta de .asc (los ejemplos de LTspice): las líneas que más bytes ahorran, escritas
// como van dentro de un .turbo (strings de JSON, con \r\n escapado),
// y el esqueleto del .turbo compactado (compactTurbo).
// OJO: un diccionario publicado no se cambia nunca (los links viejos dejarían de abrir); uno
// nuevo va con otra versión en share.ts.
//   node scripts/build-share-dict.mjs "%LOCALAPPDATA%/LTspice/examples"
import fs from 'node:fs';
import path from 'node:path';

const SIZE = 32 * 1024; // la ventana de deflate: lo que esté más lejos no se puede referenciar
const dir = process.argv[2];
if (!dir) throw new Error('falta la carpeta de .asc');

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.asc$/i.test(e.name)) files.push(p);
  }
})(dir);

const read = (f) => {
  const b = fs.readFileSync(f);
  return b[0] === 0xff && b[1] === 0xfe ? b.subarray(2).toString('utf16le') : b.toString('latin1');
};

// cada línea cuenta una vez por archivo: lo que importa es en cuántos circuitos aparece
const count = new Map();
for (const f of files) {
  for (const l of new Set(read(f).split(/\r?\n/))) if (l.length > 3) count.set(l, (count.get(l) ?? 0) + 1);
}
const esc = (l) => JSON.stringify(`${l}\r\n`).slice(1, -1);
const lines = [...count]
  .filter(([, c]) => c >= 3)
  .map(([l, c]) => [esc(l), c])
  .sort((a, b) => b[1] * b[0].length - a[1] * a[0].length);

// el esqueleto del .turbo va al final (lo más cercano es lo más barato de referenciar)
const skeleton = `{"format":"turbospice","version":2,"name":"","files":[],"activeTestbench":"s0","groups":[],"testbenches":[{"id":"s0","name":"","current":"@0","runs":[{"id":"r1","time":"2026-01-01T00:00:00.000Z","asc":"@1","summary":""}]},{"id":"s2","current":"@2","view":{},"runs":[]}],"blobs":{"@0":"Version 4\\r\\nSHEET 1 880 680\\r\\n`;
let dict = '';
for (const [l] of lines) {
  if (Buffer.byteLength(dict + l + skeleton) > SIZE) break;
  dict = l + dict; // las más valiosas quedan al final, más cerca
}
dict += skeleton;

const out = `// Generado por scripts/build-share-dict.mjs con ${files.length} .asc de ejemplo de LTspice. NO EDITAR:
// los links ya compartidos se descomprimen con este diccionario exacto.
export const SHARE_DICT_1 = ${JSON.stringify(dict)};\n`;
fs.writeFileSync(new URL('../src/schematic/shareDict.ts', import.meta.url), out);
console.log(`${files.length} archivos, diccionario de ${Buffer.byteLength(dict)} bytes`);
