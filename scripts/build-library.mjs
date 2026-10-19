// Construye el bundle de la librería (símbolos .asy, skins SVG, subcircuitos, tabla de
// rótulos por orientación) que la app descarga de una vez.
// Uso: node scripts/build-library.mjs [salida]   (por defecto public/library/bundle.json)
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from '../src/asc/encoding.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(ROOT, 'library');

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const readText = (p) => decode(new Uint8Array(readFileSync(p))).text;
const rel = (base, p) => relative(base, p).split('\\').join('/');

/**
 * Normaliza un SVG del skin para insertarlo en línea: las reglas de <style> por clase pasan
 * a atributos style de cada elemento (las clases .st0/.st1 de distintos SVG chocarían), el
 * negro pasa a currentColor y el blanco de relleno al color de fondo del esquemático.
 */
export function normalizeSkin(svg) {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 0 0';
  const rules = new Map();
  for (const [, selectors, body] of svg.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const decls = body.trim().replace(/\s+/g, ' ');
    for (const sel of selectors.split(',')) {
      const m = /\.([\w-]+)\s*$/.exec(sel.trim());
      if (m) rules.set(m[1], (rules.get(m[1]) ?? '') + decls);
    }
  }
  let body = svg
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<defs>[\s\S]*?<\/defs>/g, '')
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/\sclass="([^"]+)"/g, (_, cls) => {
      const style = cls.split(/\s+/).map((c) => rules.get(c) ?? '').join('');
      return style ? ` style="${style}"` : '';
    })
    .replace(/\sid="[^"]*"/g, '');
  body = body
    .replace(/#000(000)?\b/gi, 'currentColor')
    .replace(/(fill:\s*)#fff(fff)?\b/gi, '$1var(--sch-bg)')
    .replace(/\s+/g, ' ')
    .trim();
  return { viewBox, body };
}

export { scanModels } from '../src/library/library.ts';
import { scanModels } from '../src/library/library.ts';

export function buildBundle() {
  const symbols = {};
  for (const p of walk(join(LIB, 'sym'))) {
    if (p.toLowerCase().endsWith('.asy')) symbols[rel(join(LIB, 'sym'), p).replace(/\.asy$/i, '')] = readText(p);
  }
  const skins = {};
  for (const p of walk(join(LIB, 'skins', 'default'))) {
    if (p.toLowerCase().endsWith('.svg')) skins[rel(join(LIB, 'skins', 'default'), p).replace(/\.svg$/i, '')] = normalizeSkin(readText(p));
  }
  const subs = {};
  for (const p of walk(join(LIB, 'sub'))) {
    if (/\.(lib|sub|mod|cir|txt)$/i.test(p)) subs[rel(join(LIB, 'sub'), p)] = scanModels(readText(p));
  }
  // library/cmp: las listas de componentes; los .model (semiconductores) se incluyen al simular
  // como cualquier archivo de modelos, en la carpeta cmp/
  const cmp = {};
  for (const p of walk(join(LIB, 'cmp'))) {
    const name = rel(join(LIB, 'cmp'), p);
    cmp[name] = readText(p);
    if (/\.(bjt|dio|jft|mos)$/i.test(name)) subs[`cmp/${name}`] = scanModels(cmp[name]);
  }
  const windowDefaults = JSON.parse(readFileSync(join(LIB, 'window-defaults.json'), 'utf8'));
  return { symbols, skins, windowDefaults, subs, cmp };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ?? join(ROOT, 'public', 'library', 'bundle.json');
  const bundle = buildBundle();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(bundle));
  // Los archivos de modelos se sirven completos: la simulación descarga los que usa
  const subOut = join(dirname(out), 'sub');
  rmSync(subOut, { recursive: true, force: true });
  cpSync(join(LIB, 'sub'), subOut, { recursive: true });
  cpSync(join(LIB, 'cmp'), join(subOut, 'cmp'), { recursive: true });
  console.log(
    `librería: ${Object.keys(bundle.symbols).length} símbolos, ${Object.keys(bundle.skins).length} skins, ` +
      `${Object.keys(bundle.subs).length} archivos de modelos → ${relative(ROOT, out)}`,
  );
}
