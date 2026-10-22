// Busca textos en español en el código (#72): literales, plantillas y texto de JSX que parecen
// lenguaje natural. Sirve para la conversión inicial a inglés y, después, como control: no debería
// quedar ninguno fuera de src/i18n/es.ts.
//   node scripts/i18n/scan.mjs [--json salida.json]
import ts from 'typescript';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SRC = join(ROOT, 'src');
const SKIP = [/[\\/]i18n[\\/]/, /vite-env\.d\.ts$/];

const ACCENT = /[áéíóúñ¿¡ÁÉÍÓÚÑü]/;
const STOP = /\b(de|la|el|los|las|que|con|para|sin|una|un|se|en|por|del|al|no|es|hay|más|este|esta|esto|lo|su|sus|como|ya|si|son|desde|hasta|cada|otro|otra|todos|todas|abrir|guardar|borrar|simular|nuevo|nueva|archivo|ver|elegir|agregar|quitar|cambiar)\b/i;
const UI_ATTRS = new Set(['title', 'label', 'aria-label', 'placeholder', 'alt', 'message', 'help', 'hint', 'description', 'action', 'text', 'empty', 'caption', 'header', 'name']);
const UI_PROPS = new Set(['label', 'title', 'help', 'hint', 'message', 'description', 'text', 'tip', 'tooltip', 'placeholder', 'caption', 'detail', 'summary', 'unitLabel', 'name']);
const UI_CALLS = new Set(['setMessage', 'confirm', 'prompt', 'alert', 'Error', 'push', 'warn', 'fail', 'setError', 'onError', 't']);

/** ¿Parece texto para una persona (en español)? */
export function spanish(s) {
  const text = s.trim();
  if (!/[a-záéíóúñ]/i.test(text)) return false;
  if (/^[\w.-]+$/.test(text) && !ACCENT.test(text)) return null; // una palabra: depende del contexto
  if (ACCENT.test(text)) return true;
  return STOP.test(text) && /\s/.test(text);
}

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(f) && !SKIP.some((r) => r.test(p)) ? [p] : [];
  });
}

const insideFunction = (n) => {
  for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p)) return true;
  return false;
};

/** Contexto de UI del nodo: atributo JSX, propiedad o llamada que muestra el texto */
function context(n) {
  let p = n.parent;
  while (p && (ts.isParenthesizedExpression(p) || ts.isConditionalExpression(p) || ts.isBinaryExpression(p) || ts.isJsxExpression(p))) p = p.parent;
  if (!p) return '';
  if (ts.isJsxAttribute(p)) return `attr:${p.name.getText()}`;
  if (ts.isPropertyAssignment(p) && p.initializer && p.name) return `prop:${p.name.getText()}`;
  if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.expression) {
    const callee = p.expression.getText().split('.').pop();
    return `call:${callee}`;
  }
  if (ts.isJsxElement(p) || ts.isJsxFragment(p)) return 'jsx';
  return p.kind === ts.SyntaxKind.ArrayLiteralExpression ? 'array' : ts.SyntaxKind[p.kind];
}

const uiContext = (c) =>
  c === 'jsx' || (c.startsWith('attr:') && UI_ATTRS.has(c.slice(5))) || (c.startsWith('prop:') && UI_PROPS.has(c.slice(5))) || (c.startsWith('call:') && UI_CALLS.has(c.slice(5)));

export function scan() {
  const out = [];
  for (const file of files(SRC)) {
    const code = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const add = (n, kind, text, extra = {}) => {
      const c = context(n);
      const sp = spanish(text);
      if (sp === false || (sp === null && !uiContext(c))) return;
      if (/^(import|export)/.test(ts.SyntaxKind[n.parent?.kind] ?? '') || ts.isImportDeclaration(n.parent) || ts.isExportDeclaration(n.parent)) return;
      if (ts.isLiteralTypeNode(n.parent)) return;
      // ya pasa por t(): es la clave en inglés
      if (ts.isCallExpression(n.parent) && n.parent.expression.getText() === 't' && n.parent.arguments[0] === n) return;
      if (ts.isPropertyAssignment(n.parent) && n.parent.name === n) return;
      if (c === 'attr:className' || c === 'attr:key' || c === 'attr:id' || c === 'attr:role') return;
      const { line } = sf.getLineAndCharacterOfPosition(n.getStart());
      out.push({ file: rel, line: line + 1, start: n.getStart(), end: n.getEnd(), kind, ctx: c, module: !insideFunction(n), text, ...extra });
    };
    const visit = (n) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) add(n, 'str', n.text);
      else if (ts.isTemplateExpression(n)) {
        const args = [];
        let text = n.head.text;
        n.templateSpans.forEach((s, i) => {
          const e = s.expression.getText();
          const name = /^[a-zA-Z_]\w*$/.test(e) ? e : /^[\w.]+$/.test(e) ? e.split('.').pop() : `p${i}`;
          const unique = args.some((a) => a.name === name) ? `${name}${i}` : name;
          args.push({ name: unique, expr: e });
          text += `{${unique}}${s.literal.text}`;
        });
        add(n, 'tpl', text, { args });
        return; // las expresiones de adentro se revisan aparte, a mano
      } else if (ts.isJsxText(n)) {
        const t = n.getText().replace(/\s+/g, ' ').trim();
        if (t) add(n, 'jsx', t);
      } else if (ts.isRegularExpressionLiteral(n) && ACCENT.test(n.text)) {
        const { line } = sf.getLineAndCharacterOfPosition(n.getStart());
        out.push({ file: rel, line: line + 1, kind: 'regex', ctx: context(n), text: n.text });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const found = scan();
  const i = process.argv.indexOf('--json');
  if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(found, null, 1));
  const byFile = new Map();
  for (const f of found) byFile.set(f.file, (byFile.get(f.file) ?? 0) + 1);
  for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(5), f);
  console.log(`${found.length} textos (${found.filter((f) => f.module).length} a nivel de módulo, ${found.filter((f) => f.kind === 'regex').length} regex)`);
}
