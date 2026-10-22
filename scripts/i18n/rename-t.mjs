// Conversión de una sola vez (#72): las variables locales llamadas `t` tapan a la función t() de
// i18n. Se renombran a `tt` (con todas sus referencias) en los archivos que importan t.
//   node scripts/i18n/rename-t.mjs
import ts from 'typescript';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const list = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? list(join(d, f)) : /\.tsx?$/.test(f) ? [join(d, f)] : []));
const slash = (f) => f.split(String.fromCharCode(92)).join('/');
const files = list(join(ROOT, 'src')).map(slash);
const texts = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));
const versions = new Map(files.map((f) => [f, 0]));
const host = {
  getScriptFileNames: () => files,
  getScriptVersion: (f) => String(versions.get(f) ?? 0),
  getScriptSnapshot: (f) => (texts.has(f) ? ts.ScriptSnapshot.fromString(texts.get(f)) : ts.sys.fileExists(f) ? ts.ScriptSnapshot.fromString(ts.sys.readFile(f)) : undefined),
  getCurrentDirectory: () => ROOT,
  getCompilationSettings: () => ({ jsx: ts.JsxEmit.ReactJSX, allowImportingTsExtensions: true, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2022, noEmit: true }),
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
};
const ls = ts.createLanguageService(host);
let total = 0;
for (const f of files) {
  if (!/import \{ t \} from '[^']*i18n\/i18n\.ts'/.test(texts.get(f))) continue;
  // una declaración por vez: después de cada cambio se vuelven a calcular las posiciones
  for (;;) {
    const sf = ls.getProgram().getSourceFile(f);
    let decl;
    const find = (n) => {
      if (decl) return;
      if ((ts.isParameter(n) || ts.isVariableDeclaration(n) || ts.isBindingElement(n)) && ts.isIdentifier(n.name) && n.name.text === 't') decl = n.name;
      else ts.forEachChild(n, find);
    };
    find(sf);
    if (!decl) break;
    const locs = ls.findRenameLocations(f, decl.getStart(), false, false, { providePrefixAndSuffixTextForRename: true }) ?? [];
    const here = locs.filter((l) => slash(l.fileName) === f).sort((a, b) => b.textSpan.start - a.textSpan.start);
    if (!here.length) throw new Error(`no se pudo renombrar t en ${f}:${sf.getLineAndCharacterOfPosition(decl.getStart()).line + 1}`);
    let code = texts.get(f);
    for (const l of here) code = code.slice(0, l.textSpan.start) + (l.prefixText ?? '') + 'tt' + (l.suffixText ?? '') + code.slice(l.textSpan.start + l.textSpan.length);
    texts.set(f, code);
    versions.set(f, versions.get(f) + 1);
    total++;
  }
  writeFileSync(f, texts.get(f));
}
console.log(`${total} variables renombradas`);
