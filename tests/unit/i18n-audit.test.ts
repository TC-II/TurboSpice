// Auditoría de idioma (#161): que no se mezclen inglés y español en la interfaz. Recorre
// todo src/ con el parser de TypeScript y busca lo que hace que un texto no siga al idioma elegido:
// textos escritos directo en el código (sin t()), claves de t() sin traducción en es.ts y fechas o
// números formateados con el idioma del navegador en vez del de la interfaz (locale()).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { es } from '../../src/i18n/es.ts';

const SRC = join(__dirname, '../../src');
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f) && !/\.d\.ts$/.test(f)) files.push(p);
  }
};
walk(SRC);
const rel = (f: string) => relative(SRC, f).split('\\').join('/');
const parsed = files
  .filter((f) => rel(f) !== 'i18n/es.ts')
  .map((f) => ({ f: rel(f), sf: ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS) }));
const line = (sf: ts.SourceFile, n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
const each = (fn: (n: ts.Node, sf: ts.SourceFile, f: string) => void) => {
  for (const { f, sf } of parsed) {
    const v = (n: ts.Node) => (fn(n, sf, f), ts.forEachChild(n, v));
    v(sf);
  }
};
/** ¿el nodo es (parte de) el argumento de t(…)? */
const inT = (n: ts.Node) => {
  for (let p = n.parent; p; p = p.parent) if (ts.isCallExpression(p) && p.expression.getText() === 't') return true;
  return false;
};

// Vocabulario castellano: palabras de las traducciones que no aparecen en ningún texto en inglés
const words = (x: string) => x.toLowerCase().match(/\p{L}{4,}/gu) ?? [];
const enWords = new Set(Object.keys(es).flatMap(words));
const esWords = new Set(Object.values(es).flatMap(words).filter((w) => !enWords.has(w)));
const spanish = (x: string) => /[áéíóúñ¿¡]/i.test(x) || words(x).some((w) => esWords.has(w));

// Textos en castellano que no son de la interfaz: marcas del formato del .asc y del .control (se
// leen de vuelta, no se pueden traducir), comentarios de la netlist y nombres de archivos
const SPANISH_OK = [
  /^\* /, // comentarios de netlist / marcas de bloques
  /\.(asc|turbo|html|md)$/,
  /^\s*\/blob\/main\/docs\//,
  /^generation:/, // opciones de Icarus Verilog (-g…), no son de la interfaz
];
// Textos de la interfaz que son iguales en los dos idiomas (siglas, unidades, sintaxis de SPICE)
const SAME_IN_BOTH = new Set(['Turbo', 'Spice', 'TurboSpice', 'Netlist', 'ngspice', 'FFT', 'Log', 'Offset', 'Ton', 'Rser [Ω]', 'Rser', 'Ron', 'Roff', 'Cpar [F]', 'Cpar', 'Normal (tol = 3σ)', 'rad/s', 'A ⇄ B']);

describe('idioma de la interfaz: sin mezclar inglés y español', () => {
  it('cada t("…") tiene su traducción en es.ts', () => {
    const missing: string[] = [];
    each((n, sf, f) => {
      if (!ts.isCallExpression(n) || n.expression.getText() !== 't' || !n.arguments[0]) return;
      const a = n.arguments[0];
      if ((ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) && !(a.text in es)) missing.push(`${f}:${line(sf, n)} ${a.text}`);
    });
    expect(missing.join(String.fromCharCode(10))).toBe('');
  });

  it('no hay textos en castellano escritos directo en el código (van con t() en inglés)', () => {
    const found: string[] = [];
    each((n, sf, f) => {
      let text: string | null = null;
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) text = n.text;
      else if (ts.isTemplateExpression(n)) text = n.head.text + n.templateSpans.map((s) => ' ' + s.literal.text).join('');
      else if (ts.isJsxText(n)) text = n.text.trim();
      if (!text || !spanish(text) || inT(n) || SPANISH_OK.some((re) => re.test(text))) return;
      // claves de objetos, tipos literales, imports, atributos JSX que no se ven (type="radio"…)
      if (ts.isJsxAttribute(n.parent) && !['title', 'placeholder', 'aria-label', 'alt', 'label'].includes(n.parent.name.getText())) return;
      if ((ts.isPropertyAssignment(n.parent) && n.parent.name === n) || ts.isLiteralTypeNode(n.parent) || ts.isImportDeclaration(n.parent)) return;
      found.push(`${f}:${line(sf, n)} ${text.slice(0, 80)}`);
    });
    expect(found.join(String.fromCharCode(10))).toBe('');
  });

  it('los textos de la interfaz en JSX pasan por t()', () => {
    const found: string[] = [];
    const ATTRS = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label']);
    each((n, sf, f) => {
      let text: string | null = null;
      if (ts.isJsxText(n)) text = n.text.trim();
      else if (ts.isJsxAttribute(n) && ATTRS.has(n.name.getText()) && n.initializer && ts.isStringLiteral(n.initializer)) text = n.initializer.text;
      // con letras, que no sea una sigla, una extensión ni una directiva (.asc, .meas, V(out)…)
      if (!text || !/\p{L}{3,}/u.test(text) || /^[A-Z0-9_]+$/.test(text) || /^\.\w+$/.test(text) || SAME_IN_BOTH.has(text)) return;
      found.push(`${f}:${line(sf, n)} ${text.slice(0, 80)}`);
    });
    expect(found.join(String.fromCharCode(10))).toBe('');
  });

  it('fechas y números se formatean con el idioma de la interfaz, no el del navegador', () => {
    const found: string[] = [];
    each((n, sf, f) => {
      if (!ts.isCallExpression(n) || !/\.toLocale(Time|Date)?String$/.test(n.expression.getText())) return;
      const a = n.arguments[0];
      if (!a || a.getText() !== 'locale()') found.push(`${f}:${line(sf, n)} ${n.getText().slice(0, 80)}`);
    });
    expect(found.join(String.fromCharCode(10))).toBe('');
  });
});
