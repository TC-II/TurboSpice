// Arma jobs.json: copia cada fuente a mirror/ (con sus archivos de modelos hermanos) y genera variantes
// con las simulaciones comentadas activadas.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, extname, join, relative } from 'node:path';

const SP = dirname(new URL(import.meta.url).pathname).replace(/^\/(\w:)/, '$1');
const MIR = join(SP, 'mirror');
const G = 'C:/_DATA/ITBA/Repositorios GitHub';
const REPOS = ['E3-Circuitos-Esquematicos', 'TC2-Circuitos-Esquematicos', 'TC2-Sim'];
const SIB = new Set(['.asy', '.lib', '.sub', '.inc', '.mod', '.cir', '.txt', '.bjt', '.dio', '.mos', '.jft', '.model', '.sp', '.spi', '.spice', '.asc']);

const jobs = [];
const walk = function* (d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.asc$/i.test(e.name) && !e.name.includes('__v')) yield p;
  }
};
for (const r of REPOS) for (const p of walk(join(MIR, r))) jobs.push({ group: r, src: join(G, r, relative(join(MIR, r), p)), path: p });

const sueltos = readFileSync(join(SP, 'sueltos-unicos.txt'), 'utf8').split('\n').filter(Boolean);
const dirs = new Map();
for (const f of sueltos) {
  const d = dirname(f);
  if (!dirs.has(d)) {
    const h = createHash('sha1').update(d).digest('hex').slice(0, 10);
    const md = join(MIR, '_s', h);
    mkdirSync(md, { recursive: true });
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      try {
        if (SIB.has(extname(e).toLowerCase()) && statSync(p).isFile() && statSync(p).size < 2e6) copyFileSync(p, join(md, e));
      } catch {}
    }
    dirs.set(d, md);
  }
  const group = f.includes('LargeCollection') ? 'sueltos-LargeCollection' : f.includes('Librería') ? 'sueltos-librerias' : 'sueltos';
  jobs.push({ group, src: f, path: join(dirs.get(d), basename(f)) });
}

// Variantes: cada TEXT comentado que es un análisis se activa y se comentan los análisis activos
const ANA = /^\.(tran|ac|dc|op|noise|tf)\b/i;
const variants = [];
for (const j of jobs) {
  if (j.group === 'sueltos-LargeCollection' || !existsSync(j.path)) continue;
  const buf = readFileSync(j.path);
  const utf16 = buf[1] === 0;
  const text = utf16 ? buf.toString('utf16le') : buf.toString('latin1');
  const lines = text.split(/\r?\n/);
  const textIdx = (pfx) => lines.map((l, i) => [l, i]).filter(([l]) => {
    const m = /^TEXT\s+\S+\s+\S+\s+\S+\s+\S+\s+([!;])(.*)$/.exec(l);
    return m && m[1] === pfx && m[2].split('\\n').every((x) => ANA.test(x.trim()) || x.trim() === '') && ANA.test(m[2].trim());
  }).map(([, i]) => i);
  const active = textIdx('!');
  const commented = textIdx(';');
  commented.forEach((ci, k) => {
    const out = [...lines];
    for (const a of active) out[a] = out[a].replace(/^(TEXT\s+\S+\s+\S+\s+\S+\s+\S+\s+)!/, '$1;');
    out[ci] = out[ci].replace(/^(TEXT\s+\S+\s+\S+\s+\S+\s+\S+\s+);/, '$1!');
    const p = j.path.replace(/\.asc$/i, `__v${k + 1}.asc`);
    const t = out.join('\r\n');
    writeFileSync(p, utf16 ? Buffer.from(t, 'utf16le') : Buffer.from(t, 'latin1'));
    variants.push({ group: j.group, src: j.src, variant: k + 1, directive: lines[ci].replace(/^TEXT\s+\S+\s+\S+\s+\S+\s+\S+\s+;/, ''), path: p });
  });
}
jobs.push(...variants);
jobs.forEach((j, i) => (j.id = i));
writeFileSync(join(SP, 'jobs.json'), JSON.stringify(jobs, null, 1));
const by = {};
for (const j of jobs) by[j.group + (j.variant ? ' (variantes)' : '')] = (by[j.group + (j.variant ? ' (variantes)' : '')] ?? 0) + 1;
console.log(by);
