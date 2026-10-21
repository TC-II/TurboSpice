// Rearma el espejo del corpus (mirror/) en otra carpeta a partir de las fuentes originales, con los
// mismos id de jobs.json: copia cada .asc con sus archivos hermanos (símbolos y modelos) y vuelve a
// generar las variantes (simulaciones comentadas activadas) con la misma regla que prepare.mjs.
// Sirve cuando el espejo vivía en %TEMP% y se limpió.
//
// Uso: node rebuild-mirror.mjs <jobs.json> <carpeta-del-espejo-nuevo>
//      escribe <jobs.json> con las rutas nuevas (el original queda como jobs.old.json)
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

const [jobsFile, out] = process.argv.slice(2);
const SIB = new Set(['.asy', '.lib', '.sub', '.inc', '.mod', '.cir', '.txt', '.bjt', '.dio', '.mos', '.jft', '.model', '.sp', '.spi', '.spice', '.asc']);
const ANA = /^\.(tran|ac|dc|op|noise|tf)\b/i;
const jobs = JSON.parse(readFileSync(jobsFile, 'utf8'));
// raíz del espejo viejo: lo que tienen en común todas las rutas
const old = jobs.map((j) => j.path).reduce((a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(0, i); });
const oldBase = old.slice(0, old.lastIndexOf('mirror') + 'mirror'.length);
const remap = (p) => join(out, p.slice(oldBase.length));

const copiedDirs = new Set();
let ok = 0, missing = 0;
for (const j of jobs.filter((x) => !x.variant)) {
  j.path = remap(j.path);
  const srcDir = dirname(j.src), dstDir = dirname(j.path);
  mkdirSync(dstDir, { recursive: true });
  if (!copiedDirs.has(srcDir + '>' + dstDir)) {
    copiedDirs.add(srcDir + '>' + dstDir);
    try {
      for (const e of readdirSync(srcDir)) {
        const p = join(srcDir, e);
        try { if (SIB.has(extname(e).toLowerCase()) && statSync(p).isFile() && statSync(p).size < 2e6) copyFileSync(p, join(dstDir, e)); } catch {}
      }
    } catch {}
  }
  // el .asc ya pudo copiarse como hermano (y quedar de sólo lectura, como el original)
  const dst = join(dstDir, basename(j.path));
  if (!existsSync(j.src)) missing++;
  else { try { copyFileSync(j.src, dst); } catch (e) { if (!existsSync(dst)) throw e; } ok++; }
}

// variantes: la k-ésima activa el k-ésimo análisis comentado y comenta los activos
const base = new Map(jobs.filter((x) => !x.variant).map((j) => [j.src, j]));
for (const v of jobs.filter((x) => x.variant)) {
  const j = base.get(v.src);
  v.path = j.path.replace(/\.asc$/i, `__v${v.variant}.asc`);
  if (!existsSync(j.path)) continue;
  const buf = readFileSync(j.path), utf16 = buf[1] === 0;
  const lines = (utf16 ? buf.toString('utf16le') : buf.toString('latin1')).split(/\r?\n/);
  const textIdx = (pfx) => lines.map((l, i) => [l, i]).filter(([l]) => {
    const m = /^TEXT\s+\S+\s+\S+\s+\S+\s+\S+\s+([!;])(.*)$/.exec(l);
    return m && m[1] === pfx && m[2].split('\\n').every((x) => ANA.test(x.trim()) || x.trim() === '') && ANA.test(m[2].trim());
  }).map(([, i]) => i);
  const ci = textIdx(';')[v.variant - 1];
  if (ci === undefined) continue;
  const o = [...lines];
  for (const a of textIdx('!')) o[a] = o[a].replace(/^(TEXT\s+\S+\s+\S+\s+\S+\s+\S+\s+)!/, '$1;');
  o[ci] = o[ci].replace(/^(TEXT\s+\S+\s+\S+\s+\S+\s+\S+\s+);/, '$1!');
  const t = o.join('\r\n');
  writeFileSync(v.path, utf16 ? Buffer.from(t, 'utf16le') : Buffer.from(t, 'latin1'));
}

writeFileSync(jobsFile.replace(/\.json$/, '.old.json'), readFileSync(jobsFile));
writeFileSync(jobsFile, JSON.stringify(jobs, null, 1));
console.log(`espejo en ${out}: ${ok} .asc copiados, ${missing} fuentes que ya no existen, ${jobs.filter((x) => x.variant).length} variantes`);
