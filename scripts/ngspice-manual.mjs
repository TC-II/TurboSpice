// Convierte el manual de ngspice (PDF) en Markdown partido por capítulo/sección + un índice,
// para buscar sin leer las 750 páginas. Requiere pdftotext (poppler).
//   node scripts/ngspice-manual.mjs [docs/ngspice/ngspice-47-manual.pdf]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const pdf = process.argv[2] ?? 'docs/ngspice/ngspice-47-manual.pdf';
const outDir = join(dirname(pdf), 'md');
const SPLIT_LINES = 1200; // capítulos más largos se parten por sección N.M

const raw = execFileSync('pdftotext', ['-layout', pdf, '-'], { maxBuffer: 64 << 20 }).toString('utf8');

// --- limpieza de páginas: encabezado ("36   CHAPTER 1. INTRO" / "1.1. ALGO   37") y número al pie
const HEADER = /^\s*(\d+\s{3,}(CHAPTER|PART)\b.*|[0-9A-Z][0-9A-Z .,'’()/&:_\-+*<>=]*\s{3,}\d+)\s*$/;
const lines = [];
for (const page of raw.split('\f')) {
  const ls = page.split('\n');
  if (ls.length && HEADER.test(ls[0])) ls.shift();
  while (ls.length && !ls[ls.length - 1].trim()) ls.pop();
  if (ls.length && /^\s*\d+\s*$/.test(ls[ls.length - 1])) ls.pop();
  lines.push(...ls);
}

// --- capítulos ("Chapter N" + título en la siguiente línea no vacía)
const chapters = [];
for (let i = 0; i < lines.length; i++) {
  const m = /^\s*Chapter\s+(\d+)\s*$/.exec(lines[i]);
  if (!m) continue;
  let j = i + 1;
  while (j < lines.length && !lines[j].trim()) j++;
  chapters.push({ n: Number(m[1]), title: lines[j].trim(), start: i, body: j + 1 });
}
for (let k = 0; k < chapters.length; k++) chapters[k].end = k + 1 < chapters.length ? chapters[k + 1].start : lines.length;

const slug = (s) =>
  s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 48).replace(/-$/, '');
const cmp = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? -1) !== (b[i] ?? -1)) return (a[i] ?? -1) - (b[i] ?? -1);
  return 0;
};

/** Cuerpo de un capítulo en Markdown: títulos N.M… como #, partes de línea unidas por guion, sin líneas en blanco de más */
function convert(ch) {
  const out = [];
  let last = [ch.n];
  for (let i = ch.body; i < ch.end; i++) {
    const line = lines[i].replace(/\s+$/, '');
    const h = /^(\d+(?:\.\d+){1,4})\s{2,}(\S.{0,100})$/.exec(line);
    if (h) {
      const num = h[1].split('.').map(Number);
      if (num[0] === ch.n && cmp(num, last) > 0) {
        last = num;
        let title = h[2].trim();
        // títulos que siguen en la línea siguiente ("…to a file (or to" / "console)")
        if (/\($|\bto$|\band$|\bof$|,$/.test(title) && lines[i + 1]?.trim() && lines[i + 1].trim().length < 60) title += ' ' + lines[++i].trim();
        out.push('', `${'#'.repeat(Math.min(num.length, 6))} ${h[1]} ${title}`, '');
        continue;
      }
    }
    const prev = out[out.length - 1];
    // "param-\neters": une palabras partidas en prosa de ancho completo
    if (prev && /[a-z]-$/.test(prev) && prev.length > 70 && /^[a-z]/.test(line)) {
      out[out.length - 1] = prev.slice(0, -1) + line.replace(/^(\S+)\s?/, '$1\n').split('\n')[0];
      const rest = line.replace(/^\S+\s?/, '');
      if (rest) out.push(rest);
      continue;
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const pad = (n) => String(n).padStart(2, '0');
const index = [];
const SRC = `Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano.`;

for (const ch of chapters) {
  const md = convert(ch);
  const head = `# ${ch.n} ${ch.title}`;
  const sections = md.split('\n').filter((l) => /^#{2,3} /.test(l));
  const entry = { ch, files: [] };
  if (md.split('\n').length <= SPLIT_LINES) {
    const file = join(outDir, `${pad(ch.n)}-${slug(ch.title)}.md`);
    writeFileSync(file, `${head}\n\n<!-- ${SRC} -->\n\n${md}\n`);
    entry.files.push({ file, title: ch.title, sections });
  } else {
    // partir por secciones de nivel 2 (## N.M)
    const dir = join(outDir, `${pad(ch.n)}-${slug(ch.title)}`);
    mkdirSync(dir);
    const parts = md.split(/\n(?=## )/);
    let intro = parts[0].startsWith('## ') ? '' : parts.shift();
    for (const part of parts) {
      const t = /^## (\S+) (.*)/.exec(part);
      const sub = t[1].split('.')[1];
      const file = join(dir, `${pad(ch.n)}.${pad(Number(sub))}-${slug(t[2])}.md`);
      const body = intro ? `${intro}\n\n${part}` : part;
      intro = '';
      writeFileSync(file, `${head}\n\n<!-- ${SRC} -->\n\n${body}\n`);
      entry.files.push({ file, title: `${t[1]} ${t[2]}`, sections: part.split('\n').filter((l) => /^#{2,3} /.test(l)) });
    }
  }
  index.push(entry);
}

// --- índice: archivos y secciones hasta N.M.K
const idx = [
  '# Manual de ngspice-47 — índice',
  '',
  `<!-- ${SRC} -->`,
  '',
  'Un archivo por capítulo; los capítulos largos, una carpeta con un archivo por sección N.M.',
  'Para ubicar un título dentro de un archivo: `grep -n "^#" <archivo>`. Para buscar en todo: `grep -rn "<texto>" docs/ngspice/md`.',
  '',
];
for (const { ch, files } of index) {
  idx.push(`## ${ch.n} ${ch.title}`, '');
  for (const f of files) {
    const rel = relative(outDir, f.file);
    if (files.length > 1) idx.push(`- [${f.title}](${rel})`);
    else idx.push(`- [${rel}](${rel})`);
    for (const s of f.sections) {
      const m = /^(#+) (.*)/.exec(s);
      if (files.length > 1 && m[1].length === 2) continue; // ya es el título del archivo
      idx.push(`${'  '.repeat(m[1].length - (files.length > 1 ? 2 : 1))}- ${m[2]}`);
    }
  }
  idx.push('');
}
writeFileSync(join(outDir, 'INDEX.md'), idx.join('\n'));
console.log(`${chapters.length} capítulos → ${index.reduce((n, e) => n + e.files.length, 0)} archivos en ${outDir}`);
