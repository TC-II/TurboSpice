// Lector de .raw de LTspice (binario o ASCII). Devuelve { plotname, flags, vars:[{name,type}], x:Float64Array, data:[{re,im}], steps:[índices de inicio] }
import { readFileSync } from 'node:fs';

export function readRaw(path) {
  const buf = readFileSync(path);
  // encabezado UTF-16LE
  const utf16 = buf[1] === 0;
  const dec = utf16 ? buf.toString('utf16le') : buf.toString('latin1');
  const mark = dec.search(/\n(Binary|Values):\s*\n/);
  if (mark < 0) throw new Error('raw sin datos');
  const hdrText = dec.slice(0, mark);
  const isBin = /\nBinary:/.test(dec.slice(mark, mark + 12));
  const hdr = {};
  const lines = hdrText.split(/\r?\n/);
  let vi = lines.findIndex((l) => l.startsWith('Variables:'));
  for (const l of lines.slice(0, vi)) {
    const k = l.indexOf(':');
    if (k > 0) hdr[l.slice(0, k).trim()] = l.slice(k + 1).trim();
  }
  const nv = parseInt(hdr['No. Variables']);
  const np = parseInt(hdr['No. Points']);
  const flags = (hdr.Flags ?? '').toLowerCase();
  const complex = flags.includes('complex');
  const dbl = flags.includes('double');
  const vars = [];
  for (let i = 1; i <= nv; i++) {
    const p = lines[vi + i].trim().split(/\s+/);
    vars.push({ name: p[1], type: p[2] });
  }
  const data = vars.map(() => ({ re: new Float64Array(np), im: complex ? new Float64Array(np) : null }));
  if (isBin) {
    const headerChars = mark + dec.slice(mark).indexOf('Binary:') + 'Binary:\n'.length;
    let off = utf16 ? headerChars * 2 : headerChars;
    if (buf[off] === 0x0a) off += utf16 ? 2 : 1; // por si quedó el salto
    for (let p = 0; p < np; p++) {
      for (let v = 0; v < nv; v++) {
        if (complex) {
          data[v].re[p] = buf.readDoubleLE(off); data[v].im[p] = buf.readDoubleLE(off + 8); off += 16;
        } else if (v === 0 || dbl) {
          data[v].re[p] = buf.readDoubleLE(off); off += 8;
        } else {
          data[v].re[p] = buf.readFloatLE(off); off += 4;
        }
      }
    }
  } else {
    const toks = dec.slice(mark).split(/\n/).slice(2).join(' ').trim().split(/\s+/);
    let t = 0;
    for (let p = 0; p < np; p++) {
      t++; // índice
      for (let v = 0; v < nv; v++) {
        const [a, b] = toks[t++].split(',').map(Number);
        data[v].re[p] = a; if (complex) data[v].im[p] = b;
      }
    }
  }
  // .tran con tstart: el tiempo está corrido (encabezado Offset)
  const off = Number(hdr.Offset ?? 0) || 0;
  if (!complex && vars[0]?.name === 'time') for (let p = 0; p < np; p++) data[0].re[p] = Math.abs(data[0].re[p]) + off;
  // pasos (.step): el eje x vuelve al principio
  // pasos (.step o barridos anidados): el eje x vuelve atrás
  const steps = [0];
  const x = data[0].re;
  for (let p = 1; p < np; p++) if (x[p] < x[p - 1]) steps.push(p);
  return { plotname: hdr.Plotname, flags, vars, data, np, steps };
}
