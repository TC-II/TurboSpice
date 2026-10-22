// Conversión de una sola vez (#72): reemplaza los textos en español por t('English') y escribe
// src/i18n/es.ts con el español original. Recibe la tabla español → inglés (null: no se toca).
//   node scripts/i18n/codemod.mjs <scan.json> <unique.json> <traducciones.json>...
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const [scanFile, uniqueFile, ...trFiles] = process.argv.slice(2);
const scan = JSON.parse(readFileSync(scanFile, 'utf8'));
const unique = JSON.parse(readFileSync(uniqueFile, 'utf8'));
// tablas por índice de unique.json ({"12": "..."}) o por texto ({"texto en español": "..."})
const tables = trFiles.map((f) => JSON.parse(readFileSync(f, 'utf8')));
const toEn = new Map();
for (const tab of tables)
  for (const [k, v] of Object.entries(tab)) toEn.set(/^\d+$/.test(k) ? unique[Number(k)] : k, v);

const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
const es = new Map();
// lo que ya estaba traducido se conserva
{
  const esPath = join(ROOT, 'src/i18n/es.ts');
  const sf = ts.createSourceFile(esPath, readFileSync(esPath, 'utf8'), ts.ScriptTarget.Latest, true);
  const find = (n) => {
    if (ts.isPropertyAssignment(n) && ts.isStringLiteral(n.name) && ts.isStringLiteral(n.initializer)) es.set(n.name.text, n.initializer.text);
    ts.forEachChild(n, find);
  };
  find(sf);
}
const collisions = [];
const addEs = (en, sp) => {
  if (en === sp) return;
  if (es.has(en) && es.get(en) !== sp) collisions.push(`${en}  ←  «${es.get(en)}» / «${sp}»`);
  else es.set(en, sp);
};

const files = [...new Set(scan.filter((x) => x.kind !== 'regex').map((x) => x.file))];
// sólo las posiciones del inventario (el mismo texto puede ser un identificador en otro lado)
const at = new Set(scan.filter((x) => x.kind !== 'regex').map((x) => `${x.file}:${x.start}`));
let changed = 0;
const skipped = [];
for (const rel of files) {
  const path = join(ROOT, rel);
  const code = readFileSync(path, 'utf8');
  const sf = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  let node;
  const look = (text) => {
    const en = at.has(`${rel}:${node.getStart()}`) && toEn.has(text) ? toEn.get(text) : undefined;
    return en === text ? undefined : en;
  };
  const compared = (n) => ts.isBinaryExpression(n.parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken].includes(n.parent.operatorToken.kind);
  const visit = (n) => {
    node = n;
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !ts.isImportDeclaration(n.parent) && !ts.isLiteralTypeNode(n.parent) && !(ts.isPropertyAssignment(n.parent) && n.parent.name === n)) {
      const en = look(n.text);
      if (typeof en === 'string' && en && en !== '!') {
        if (compared(n)) skipped.push(`${rel}: comparación con «${n.text}»`);
        else {
          const call = `t(${quote(en)})`;
          edits.push([n.getStart(), n.getEnd(), ts.isJsxAttribute(n.parent) ? `{${call}}` : call]);
          addEs(en, n.text);
        }
      }
    } else if (ts.isTemplateExpression(n)) {
      const args = [];
      let text = n.head.text;
      n.templateSpans.forEach((s, i) => {
        const e = s.expression.getText();
        const name = /^[a-zA-Z_]\w*$/.test(e) ? e : /^[\w.]+$/.test(e) ? e.split('.').pop() : `p${i}`;
        const unique = args.some((a) => a.name === name) ? `${name}${i}` : name;
        args.push({ name: unique, expr: e });
        text += `{${unique}}${s.literal.text}`;
      });
      const en = look(text);
      if (typeof en === 'string' && en && en !== '!') {
        const params = args.map((a) => (a.name === a.expr ? a.name : `${/^\w+$/.test(a.name) ? a.name : quote(a.name)}: ${a.expr}`)).join(', ');
        edits.push([n.getStart(), n.getEnd(), `t(${quote(en)}, { ${params} })`]);
        addEs(en, text);
        return;
      }
    } else if (ts.isJsxText(n)) {
      const raw = n.getText();
      const text = raw.replace(/\s+/g, ' ').trim();
      const en = text ? look(text) : undefined;
      if (typeof en === 'string' && en && en !== '!') {
        if (/&\w+;/.test(raw)) skipped.push(`${rel}: entidad HTML en «${text}»`);
        const lead = /^\s+/.exec(raw)?.[0] ?? '';
        const trail = /\s+$/.exec(raw)?.[0] ?? '';
        const sp = (w) => (w && !w.includes('\n') ? "{' '}" : '');
        edits.push([n.getStart(), n.getEnd(), `${lead.includes('\n') ? lead : ''}${sp(lead)}{t(${quote(en)})}${sp(trail)}${trail.includes('\n') ? trail : ''}`]);
        addEs(en, text);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  edits.sort((a, b) => b[0] - a[0]);
  let out = code;
  for (const [s, e, r] of edits) out = out.slice(0, s) + r + out.slice(e);
  // import { t }
  if (!/import \{[^}]*\bt\b[^}]*\} from '[^']*i18n\/i18n\.ts'/.test(out)) {
    let imp = relative(dirname(path), join(ROOT, 'src/i18n/i18n.ts')).replace(/\\/g, '/');
    if (!imp.startsWith('.')) imp = `./${imp}`;
    const line = `import { t } from '${imp}';\n`;
    const m = [...out.matchAll(/^import [^;]*;\r?\n/gm)].pop();
    out = m ? out.slice(0, m.index + m[0].length) + line + out.slice(m.index + m[0].length) : line + out;
  }
  writeFileSync(path, out);
  changed++;
}

const entries = [...es].sort((a, b) => a[0].localeCompare(b[0]));
const body = entries.map(([en, sp]) => `  ${quote(en)}: ${quote(sp)},`).join('\n');
writeFileSync(
  join(ROOT, 'src/i18n/es.ts'),
  `// Traducción al español (#72): texto en inglés (el del código) → español. Un texto que falte acá\n// se muestra en inglés. Para agregar uno: escribirlo en inglés con t() y sumarlo acá.\nexport const es: Record<string, string> = {\n${body}\n};\n`,
);
console.log(`${changed} archivos cambiados, ${entries.length} traducciones`);
for (const s of skipped) console.log('SALTEADO', s);
for (const c of collisions) console.log('COLISIÓN', c);
