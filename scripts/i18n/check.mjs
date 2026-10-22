// Control de traducciones (#72):
//  1. textos del código (literales, plantillas, JSX) que siguen en español: los que tienen
//     tildes/¿¡ o palabras del vocabulario español de es.ts que no aparecen en inglés;
//  2. textos de t('…') que no tienen traducción en es.ts (se ven en inglés con el idioma ES).
//   node scripts/i18n/check.mjs            (sale con 1 si hay texto en español fuera de es.ts)
import ts from 'typescript';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SRC = join(ROOT, 'src');
// textos que son datos, no interfaz: netlists de ejemplo, marcadores que se buscan en el texto,
// nombres de archivo y códigos de error de Google
const ALLOW = [
  /^\* /, // comentarios de netlist (marcadores de directives.ts, floating.ts, idealdiode.ts…)
  /\.asc$/,
  /^popup_/,
  /^(radio|sin)$/, // type="radio", la función sin()
  /^(prueba\.turbo|privacidad\.html)$/,
  /compatibilidad-ltspice\.md$/,
  /^\(sin\(\(/, // expresión de ruido para B-sources
  /^\(dentro del bloque$|^: se ignora\)$/, // comentario de netlist
];

const list = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? list(join(d, f)) : /\.tsx?$/.test(f) ? [join(d, f)] : []));
const parse = (f) => ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

// es.ts: inglés → español
const es = new Map();
{
  const visit = (n) => {
    if (ts.isPropertyAssignment(n) && ts.isStringLiteral(n.name) && ts.isStringLiteral(n.initializer)) es.set(n.name.text, n.initializer.text);
    ts.forEachChild(n, visit);
  };
  visit(parse(join(SRC, 'i18n/es.ts')));
}
const words = (s) => s.toLowerCase().match(/[a-záéíóúñü]{3,}/g) ?? [];
const english = new Set([...es.keys()].flatMap(words));
const vocab = new Set([...es.values()].flatMap(words).filter((w) => !english.has(w)));

const spanish = (s) => {
  if (ALLOW.some((r) => r.test(s.trim()))) return false;
  if (/[áéíóúñ¿¡]/i.test(s)) return true;
  return words(s).some((w) => vocab.has(w));
};

const found = [];
// con --json: posiciones para scripts/i18n/codemod.mjs (las plantillas, enteras y con sus parámetros)
const spots = [];
const tplText = (n) => {
  const names = [];
  let text = n.head.text;
  n.templateSpans.forEach((s, i) => {
    const e = s.expression.getText();
    const name = /^[a-zA-Z_]\w*$/.test(e) ? e : /^[\w.]+$/.test(e) ? e.split('.').pop() : `p${i}`;
    const unique = names.includes(name) ? `${name}${i}` : name;
    names.push(unique);
    text += `{${unique}}${s.literal.text}`;
  });
  return text;
};
const missing = new Map();
for (const file of list(SRC)) {
  if (/[\\/]i18n[\\/]/.test(file)) continue;
  const sf = parse(file);
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const at = (n) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const visit = (n) => {
    const isKey = !!n.parent && ts.isCallExpression(n.parent) && n.parent.expression.getText() === 't' && n.parent.arguments[0] === n;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (isKey) {
        if (!es.has(n.text) && /[a-z]{2}/i.test(n.text)) missing.set(n.text, at(n));
      } else if (!ts.isImportDeclaration(n.parent) && !ts.isLiteralTypeNode(n.parent) && spanish(n.text)) {
        found.push(`${at(n)}  ${JSON.stringify(n.text)}`);
        spots.push({ file: rel, start: n.getStart(), kind: 'str', text: n.text });
      }
    } else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      if (spanish(n.text)) {
        found.push(`${at(n)}  \`…${n.text}…\``);
        const tpl = ts.isTemplateHead(n) ? n.parent : n.parent.parent;
        if (!spots.some((x) => x.file === rel && x.start === tpl.getStart())) spots.push({ file: rel, start: tpl.getStart(), kind: 'tpl', text: tplText(tpl) });
      }
    } else if (ts.isJsxText(n)) {
      const text = n.getText().replace(/\s+/g, ' ').trim();
      if (text && spanish(text)) {
        found.push(`${at(n)}  <${text}>`);
        spots.push({ file: rel, start: n.getStart(), kind: 'jsx', text });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
if (found.length) {
  console.log(`Texto en español fuera de es.ts (${found.length}):`);
  for (const f of found) console.log(`  ${f}`);
}
if (missing.size) {
  console.log(`\nSin traducción al español (${missing.size}, se ven en inglés):`);
  for (const [k, w] of missing) console.log(`  ${w}  ${JSON.stringify(k)}`);
}
if (!found.length && !missing.size) console.log('Todo traducido.');
const j = process.argv.indexOf('--json');
if (j > 0) writeFileSync(process.argv[j + 1], JSON.stringify(spots, null, 1));
process.exit(found.length ? 1 : 0);
