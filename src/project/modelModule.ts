// Módulos de tipo «Modelo»: un archivo de modelos del proyecto (texto de netlist con un .subckt o
// un .model) y su símbolo .asy, que lo usa por ModelFile. Es lo que en TCLib es un par .sub + .asy:
// el símbolo lleva Prefix, Value, SpiceModel, SpiceLine, los pines con su SpiceOrder y su dibujo.
// En el .turbo el archivo de modelos lleva "module": "model" (docs/turbo-formato.md).
import { makeSymbol, subcktPins } from '../library/makeSymbol.ts';
import { baseName, WINDOW_ATTR } from '../asc/model.ts';
import type { Project, ProjectFile } from './turbo.ts';
import { addFreePin, formatParamList, parseParamList, symPins, symShapes, symWindows, windowShown } from './symbolEdit.ts';

const key = (n: string) => baseName(n).replace(/\.(lib|sub|mod|asy)$/i, '').toLowerCase();
export const modelFileName = (name: string) => `${name}.lib`;

export const isModelModule = (f: ProjectFile) => f.kind === 'model' && f.module === 'model';
export const modelModules = (p: Project): ProjectFile[] => p.files.filter(isModelModule);
export const modelModuleFile = (p: Project, name: string) => modelModules(p).find((f) => key(f.name) === key(name));
export const modelModuleName = (f: ProjectFile) => baseName(f.name).replace(/\.(lib|sub|mod)$/i, '');
const symFile = (p: Project, name: string) => p.files.find((f) => f.kind === 'symbol' && key(f.name) === key(name));
export const modelSymbolText = (p: Project, name: string) => symFile(p, name)?.text;

/** Pines y prefijo por omisión de cada tipo de .model (como los símbolos de LTspice) */
const MODEL_TYPES: Record<string, { prefix: string; pins: string[] }> = {
  D: { prefix: 'D', pins: ['A', 'K'] },
  NPN: { prefix: 'Q', pins: ['C', 'B', 'E'] },
  PNP: { prefix: 'Q', pins: ['C', 'B', 'E'] },
  LPNP: { prefix: 'Q', pins: ['C', 'B', 'E'] },
  NMOS: { prefix: 'MN', pins: ['D', 'G', 'S', 'B'] },
  PMOS: { prefix: 'MP', pins: ['D', 'G', 'S', 'B'] },
  VDMOS: { prefix: 'M', pins: ['D', 'G', 'S'] },
  NJF: { prefix: 'J', pins: ['D', 'G', 'S'] },
  PJF: { prefix: 'J', pins: ['D', 'G', 'S'] },
  NMF: { prefix: 'Z', pins: ['D', 'G', 'S'] },
  PMF: { prefix: 'Z', pins: ['D', 'G', 'S'] },
  SW: { prefix: 'S', pins: ['1', '2', 'C+', 'C-'] },
  CSW: { prefix: 'W', pins: ['1', '2'] },
  R: { prefix: 'R', pins: ['1', '2'] },
  C: { prefix: 'C', pins: ['1', '2'] },
  L: { prefix: 'L', pins: ['1', '2'] },
};

export interface ModelInfo {
  kind: 'subckt' | 'model' | 'none';
  /** nombre del primer .subckt o .model */
  name: string;
  /** tipo del .model (D, NPN…) */
  type?: string;
  prefix: string;
  pins: string[];
  /** parámetros del .subckt (params: x=1) */
  params: [string, string][];
}

/** Qué define el texto: el primer .subckt (con sus pines) o, si no hay, el primer .model */
export function modelInfo(text: string): ModelInfo {
  const sub = /^\s*\.subckt\s+(\S+)/im.exec(text);
  if (sub) {
    const name = sub[1];
    const line = /^\s*\.subckt\s+\S+(.*(?:\r?\n\s*\+.*)*)/im.exec(text)?.[1] ?? '';
    const params = [...line.replace(/\r?\n\s*\+/g, ' ').matchAll(/(\w+)\s*=\s*(\S+)/g)].map((m) => [m[1], m[2]] as [string, string]);
    return { kind: 'subckt', name, prefix: 'X', pins: subcktPins(text, name) ?? [], params };
  }
  const mod = /^\s*\.model\s+(\S+)\s+([A-Za-z]+)/im.exec(text);
  if (mod) {
    const type = mod[2].toUpperCase();
    const d = MODEL_TYPES[type] ?? { prefix: 'X', pins: [] };
    return { kind: 'model', name: mod[1], type, prefix: d.prefix, pins: d.pins, params: [] };
  }
  return { kind: 'none', name: '', prefix: 'X', pins: [], params: [] };
}

/** Atributo del símbolo (SYMATTR) */
export const symAttr = (text: string, k: string) => new RegExp(`^SYMATTR ${k} (.*)$`, 'm').exec(text)?.[1] ?? '';

/** Cambia (o agrega, o con '' saca) un SYMATTR, sin tocar el resto */
export function setSymAttr(text: string, k: string, value: string): string {
  // el nombre entero (Value no es Value2)
  const re = new RegExp(`^SYMATTR ${k}(?:[ \\t][^\\r\\n]*)?(?:\\r?\\n|$)`, 'm');
  const v = value.trim();
  if (re.test(text)) return text.replace(re, v ? `SYMATTR ${k} ${v}\n` : '');
  if (!v) return text;
  const ls = text.split(/\r?\n/);
  // antes del primer PIN (como en los .asy de LTspice)
  const at = ls.findIndex((l) => l.startsWith('PIN '));
  ls.splice(at < 0 ? ls.length - (ls[ls.length - 1] === '' ? 1 : 0) : at, 0, `SYMATTR ${k} ${v}`);
  return ls.join('\n');
}

/** Atributos de un símbolo de modelo que se editan a mano, en el orden en que arman la línea de la
 *  instancia (Prefix+nombre, nodos, SpiceModel, Value, Value2, SpiceLine, SpiceLine2), como en TCLib */
export const MODEL_ATTRS = ['InstName', 'Prefix', 'SpiceModel', 'Value', 'Value2', 'SpiceLine', 'SpiceLine2', 'ModelFile', 'Description'] as const;

/** Símbolo generado para el texto del modelo */
export function modelModuleSymbol(name: string, text: string): string {
  const info = modelInfo(text);
  const asy = makeSymbol({ name: info.name || name, pins: info.pins, modelFile: modelFileName(name), description: name });
  return setModelParams(setSymAttr(syncModelAttrs(asy, text), 'Prefix', info.prefix), info.params);
}

/** El .subckt/.model del netlist que usa el símbolo: el de SpiceModel si el netlist lo define; si
 *  no (se lo renombró en el texto), el primero */
function usedDef(sym: string, text: string) {
  const defs = [...text.matchAll(/^\s*\.(subckt|model)\s+(\S+)(?:\s+([A-Za-z]+))?/gim)].map((m) => ({ sub: m[1].toLowerCase() === 'subckt', name: m[2], type: m[3]?.toUpperCase() }));
  const cur = symAttr(sym, 'SpiceModel').toLowerCase();
  return defs.find((d) => d.name.toLowerCase() === cur) ?? defs[0];
}

/** El símbolo toma del netlist SpiceModel (el nombre del .subckt o .model; si el netlist define
 *  varios, queda el que ya tenía) y Prefix (X para un .subckt, la letra del dispositivo para un
 *  .model: D1 a k 1N4148). El resto (rótulos, parámetros) es del símbolo. Value no repite el nombre:
 *  si lo repetía se vacía (si no, la instancia lo escribiría dos veces) y su rótulo (WINDOW 3) pasa a
 *  mostrar SpiceModel (WINDOW 38) */
export function syncModelAttrs(sym: string, text: string): string {
  const def = usedDef(sym, text);
  if (!def) return sym;
  let s = sym;
  if (symAttr(s, 'SpiceModel') !== def.name) s = setSymAttr(s, 'SpiceModel', def.name);
  const prefix = def.sub ? 'X' : (MODEL_TYPES[def.type ?? '']?.prefix ?? 'X');
  if (symAttr(s, 'Prefix') !== prefix) s = setSymAttr(s, 'Prefix', prefix);
  const v = symAttr(s, 'Value');
  if (v && v.toLowerCase() === def.name.toLowerCase()) {
    s = setSymAttr(s, 'Value', '');
    if (!/^WINDOW 38 /m.test(s)) s = s.replace(/^WINDOW 3 /m, 'WINDOW 38 ');
  }
  return s;
}

/** Cambia los nodos de la línea .subckt (conserva el nombre y los params:) */
export function setSubcktPins(text: string, pins: string[], name?: string): string {
  const id = name ? name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s)' : '\\S+';
  const re = new RegExp(`^([ \\t]*\\.subckt[ \\t]+${id})([^\\r\\n]*(?:\\r?\\n[ \\t]*\\+[^\\r\\n]*)*)`, 'im');
  const m = re.exec(text);
  if (!m) return text;
  const toks = m[2].replace(/\r?\n[ \t]*\+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const at = toks.findIndex((x) => /^params:/i.test(x) || x.includes('='));
  const params = at < 0 ? [] : toks.slice(at);
  return text.replace(re, () => [m[1], ...pins, ...params].join(' '));
}

/** El .subckt `name` de un archivo de modelos (de su línea hasta su .ends) */
export function extractSubckt(text: string, name: string): string | undefined {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^[ \\t]*\\.subckt[ \\t]+${esc}\\s[\\s\\S]*?^[ \\t]*\\.ends\\b[^\\r\\n]*`, 'im').exec(text);
  return m?.[0];
}

/** El .model `name` de un archivo de modelos (con sus líneas de continuación) */
export function extractModel(text: string, name: string): string | undefined {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^[ \\t]*\\.model[ \\t]+${esc}[\\s(][^\\r\\n]*(?:\\r?\\n[ \\t]*\\+[^\\r\\n]*)*`, 'im').exec(text)?.[0];
}

/** Renombra el .model `from` a `to` */
export function renameModelIn(text: string, from: string, to: string): string {
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`^(\\s*\\.model\\s+)${esc}(?=[\\s(])`, 'im'), (_, a: string) => a + to);
}

/** Renombra el .subckt `from` (su línea y su .ends) a `to`; los de adentro quedan como están */
export function renameSubcktIn(text: string, from: string, to: string): string {
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text
    .replace(new RegExp(`^(\\s*\\.subckt\\s+)${esc}(?=\\s)`, 'im'), (_, a: string) => a + to)
    .replace(new RegExp(`^(\\s*\\.ends\\s+)${esc}\\s*$`, 'im'), (_, a: string) => a + to);
}

/** Netlist inicial */
export const modelTemplate = (name: string) => `* ${name}\n.subckt ${name} in out\nR1 in out 1k\n.ends ${name}\n`;

const replaceFile = (files: ProjectFile[], f: ProjectFile) => {
  const i = files.findIndex((x) => x.kind === f.kind && key(x.name) === key(f.name));
  return i < 0 ? [...files, f] : files.map((x, k) => (k === i ? f : x));
};

/** Agrega un módulo de modelo: archivo de modelos + símbolo */
export function addModelModule(p: Project, name: string, text = modelTemplate(name), asy?: string): Project {
  const lib: ProjectFile = { name: modelFileName(name), kind: 'model', text, module: 'model' };
  const sym: ProjectFile = { name: `${name}.asy`, kind: 'symbol', text: asy ?? modelModuleSymbol(name, text) };
  return { ...p, modified: Date.now(), files: replaceFile(replaceFile(p.files, lib), sym) };
}

export function storeModelText(p: Project, name: string, text: string): Project {
  const f = modelModuleFile(p, name);
  if (!f || f.text === text) return p;
  return { ...p, modified: Date.now(), files: p.files.map((x) => (x === f ? { ...f, text } : x)) };
}

export function storeModelSymbol(p: Project, name: string, text: string): Project {
  const s = symFile(p, name);
  if (!s || s.text === text) return p;
  return { ...p, modified: Date.now(), files: p.files.map((x) => (x === s ? { ...s, text } : x)) };
}

export const removeModelModule = (p: Project, name: string): Project => ({
  ...p,
  modified: Date.now(),
  files: p.files.filter((f) => !((isModelModule(f) || f.kind === 'symbol') && key(f.name) === key(name))),
});

/** Cambia un PINATTR (PinName, SpiceOrder) del pin `index` (en el orden del archivo) */
export function setPinAttr(text: string, index: number, attr: 'PinName' | 'SpiceOrder', value: string): string {
  const ls = text.split(/\r?\n/);
  const pinLines = ls.map((l, i) => (/^PIN\s/.test(l) ? i : -1)).filter((i) => i >= 0);
  const at = pinLines[index];
  if (at === undefined) return text;
  let k = at + 1;
  for (; k < ls.length && ls[k].startsWith('PINATTR'); k++)
    if (ls[k].startsWith(`PINATTR ${attr} `) || ls[k] === `PINATTR ${attr}`) {
      ls[k] = `PINATTR ${attr} ${value}`;
      return ls.join('\n');
    }
  ls.splice(k, 0, `PINATTR ${attr} ${value}`);
  return ls.join('\n');
}

/** Renombra el archivo, el símbolo (con su ModelFile) y las instancias (su tipo) */
export function renameModelModule(p: Project, from: string, to: string, retype: (asc: string) => string): Project {
  const f = modelModuleFile(p, from);
  if (!f) return p;
  const files = p.files.map((x) => {
    if (x === f) return { ...x, name: modelFileName(to) };
    if (x.kind === 'symbol' && key(x.name) === key(from)) {
      const mf = symAttr(x.text, 'ModelFile');
      return { ...x, name: `${to}.asy`, text: mf && key(mf) === key(from) ? setSymAttr(x.text, 'ModelFile', modelFileName(to)) : x.text };
    }
    if (x.kind === 'schematic') return { ...x, text: retype(x.text) };
    return x;
  });
  const variants = p.variants.map((v) => ({ ...v, base: retype(v.base), sims: v.sims.map((s) => ({ ...s, asc: retype(s.asc) })) }));
  return { ...p, modified: Date.now(), files, variants };
}

/** El dibujo y los pines de un .asy existente como símbolo del modelo, conservando sus atributos
 *  (Prefix, SpiceModel, Value…) y su SymbolType */
export function adoptModelSymbol(asy: string, current: string, name: string): string {
  // el .asy entero: dibujo, pines (con sus nombres y SpiceOrder), rótulos, Prefix y parámetros.
  // Sólo SpiceModel (el enlace con el netlist) y ModelFile (el archivo de este módulo) son del modelo;
  // un BLOCK (el símbolo de un subcircuito del proyecto) pasa a CELL: acá no hay esquemático abajo
  let text = asy.replace(/^SymbolType BLOCK\b/im, 'SymbolType CELL');
  text = setSymAttr(text, 'SpiceModel', symAttr(current, 'SpiceModel'));
  return setSymAttr(text, 'ModelFile', modelFileName(name));
}

/** ¿Los pines del símbolo no se corresponden con los nodos del .subckt? El enlace es el SpiceOrder
 *  (el pin de orden n va al n-ésimo nodo), no el nombre: como en TCLib, In+ / In- / OUT van a
 *  1 2 5. Faltar pines se permite (esos nodos quedan sin conectar); sobran si su orden pasa la
 *  cantidad de nodos o se repite */
export function pinsMismatch(sym: string, nodes: string[]): boolean {
  if (!nodes.length) return false;
  const orders = symPins(sym).map((p) => p.order);
  return orders.some((o) => o < 1 || o > nodes.length) || new Set(orders).size !== orders.length;
}

/** Un pin por nodo del .subckt: agrega (a la izquierda del dibujo, sin tocarlo) los de los nodos sin
 *  pin y saca los que sobran; los que ya están quedan como están */
export function updateModelPins(sym: string, nodes: string[], grid: number): string {
  let s = sym;
  const seen = new Set<number>();
  // sacar los de orden fuera de rango o repetido (de atrás para adelante)
  const drop = symPins(s).flatMap((p, i) => {
    const bad = p.order < 1 || p.order > nodes.length || seen.has(p.order);
    seen.add(p.order);
    return bad ? [i] : [];
  });
  for (const i of drop.reverse()) s = removePinKeepOrder(s, i);
  nodes.forEach((n, k) => {
    if (symPins(s).some((p) => p.order === k + 1)) return;
    s = addFreePin(s, n, grid);
    s = setPinAttr(s, symPins(s).length - 1, 'SpiceOrder', String(k + 1));
  });
  return s;
}

/** Saca el pin `index` sin renumerar los SpiceOrder de los otros */
function removePinKeepOrder(sym: string, index: number): string {
  const p = symPins(sym)[index];
  if (!p) return sym;
  const ls = sym.split(/\r?\n/);
  let end = p.line + 1;
  while (end < ls.length && ls[end].startsWith('PINATTR')) end++;
  ls.splice(p.line, end - p.line);
  return ls.join('\n');
}

/** Número de WINDOW (rótulo visible en el esquemático) de cada atributo, como en LTspice */
export const ATTR_WINDOW: Record<string, number> = Object.fromEntries(Object.entries(WINDOW_ATTR).map(([n, k]) => [k, Number(n)]));

/** ¿El atributo se ve en el esquemático? (tiene su WINDOW y no está oculta; sin WINDOW no se
 *  dibuja, como InstName en DIF) */
export function attrVisible(sym: string, k: string): boolean {
  const w = symWindows(sym).find((x) => x.n === ATTR_WINDOW[k]);
  return !!w && windowShown(w);
}

/** Muestra u oculta el rótulo de un atributo. Oculto es «Invisible» (como LTspice), en su lugar y con
 *  su tamaño, así al volver a mostrarlo no pierde la posición; la alineación no queda en el archivo:
 *  vuelve con `align` (la que tenía, si se la recordó) o Left. Si no tenía rótulo, se agrega a la
 *  derecha del dibujo, debajo de los otros */
export function setAttrVisible(sym: string, k: string, on: boolean, align = 'Left'): string {
  const n = ATTR_WINDOW[k];
  if (n === undefined || attrVisible(sym, k) === on) return sym;
  const ls = sym.split(/\r?\n/);
  const i = ls.findIndex((l) => l.startsWith(`WINDOW ${n} `));
  if (i >= 0) {
    const w = symWindows(ls[i])[0];
    ls[i] = `WINDOW ${n} ${w.x} ${w.y} ${on ? align : 'Invisible'} ${w.size}`;
    return ls.join('\n');
  }
  const xs = [...symShapes(sym).flatMap((s) => [s.coords[0], s.coords[2]]), ...symPins(sym).map((p) => p.x)];
  const ys = [...symShapes(sym).flatMap((s) => [s.coords[1], s.coords[3]]), ...symPins(sym).map((p) => p.y)];
  const wins = ls.filter((l) => l.startsWith('WINDOW ')).length;
  const x = (xs.length ? Math.max(...xs) : 0) + 8;
  const y = (ys.length ? Math.min(...ys) : 0) + 16 * wins;
  const last = ls.reduce((a, l, j) => (l.startsWith('WINDOW ') ? j : a), ls.findIndex((l) => l.startsWith('SymbolType ')));
  ls.splice(last + 1, 0, `WINDOW ${n} ${x} ${y} Left 2`);
  return ls.join('\n');
}

/** Dónde van los parámetros de un modelo, en orden (como OA_Ideal de TCLib: Value Avol=1Meg,
 *  Value2 GBWP=10Meg); del cuarto en adelante, todos juntos en SpiceLine2 */
export const PARAM_SLOTS = ['Value', 'Value2', 'SpiceLine', 'SpiceLine2'] as const;

/** Parámetros del símbolo de un modelo (de Value, Value2, SpiceLine y SpiceLine2) */
export const modelParams = (sym: string): [string, string][] => PARAM_SLOTS.flatMap((k) => parseParamList(symAttr(sym, k)));

/** Reparte los parámetros en Value, Value2, SpiceLine y SpiceLine2; los que tienen y no tenían
 *  rótulo lo ganan (visible) */
export function setModelParams(sym: string, ps: [string, string][]): string {
  let s = sym;
  PARAM_SLOTS.forEach((k, i) => {
    const part = i < 3 ? ps.slice(i, i + 1) : ps.slice(3);
    s = setSymAttr(s, k, formatParamList(part));
    if (part.length && !symWindows(s).some((w) => w.n === ATTR_WINDOW[k])) s = setAttrVisible(s, k, true);
  });
  return s;
}

/** Parámetros con su valor por defecto de la línea del .subckt `name` (params: G=1 R=1k) */
export function subcktParams(text: string, name: string): [string, string][] {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^[ \\t]*\\.subckt[ \\t]+${esc}\\b([^\\r\\n]*(?:\\r?\\n[ \\t]*\\+[^\\r\\n]*)*)`, 'im').exec(text);
  return m ? parseParamList(m[1].replace(/\r?\n[ \t]*\+/g, ' ')) : [];
}

/** Tamaño de letra (índice 0–7 de LTspice: 0 = 8 pt, 1 = 13, 2 = 20 —el normal—, 3 = 26…) del
 *  rótulo de un atributo */
export const attrSize = (sym: string, k: string) => symWindows(sym).find((w) => w.n === ATTR_WINDOW[k])?.size;

export function setAttrSize(sym: string, k: string, size: number): string {
  const n = ATTR_WINDOW[k];
  return sym
    .split(/\r?\n/)
    .map((l) => {
      if (!l.startsWith(`WINDOW ${n} `)) return l;
      const w = symWindows(l)[0];
      return `WINDOW ${n} ${w.x} ${w.y} ${w.align} ${size}`;
    })
    .join('\n');
}

/** Cuántos nodos tiene un elemento según su letra (después vienen valores, que pueden ser números
 *  iguales a un nodo: «RF1 N002 N001 1» es 1 Ω, no el nodo 1) */
const NODE_COUNT: Record<string, number> = { R: 2, C: 2, L: 2, D: 2, V: 2, I: 2, B: 2, F: 2, H: 2, W: 2, E: 4, G: 4, S: 4, T: 4, M: 4, J: 3, Q: 3, Z: 3 };

/** Los nodos de una línea de elemento: [desde, hasta) en sus palabras (la 0 es el nombre). Para un
 *  X, todas hasta el nombre del subcircuito (la última que no es parámetro) */
function nodeSpan(words: string[]): [number, number] {
  const letter = words[0]?.[0]?.toUpperCase() ?? '';
  if (letter === 'X') {
    const end = words.findIndex((w, i) => i > 0 && (/^params:/i.test(w) || w.includes('=')));
    return [1, (end < 0 ? words.length : end) - 1];
  }
  const n = NODE_COUNT[letter] ?? 0;
  return [1, Math.min(1 + n, words.length)];
}

/** Renombra un nodo dentro del .subckt `name`: en su línea y en los nodos de cada elemento (no en
 *  nombres ni valores) */
export function renameNodeIn(text: string, name: string, from: string, to: string): string {
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`^[ \\t]*\\.subckt[ \\t]+${esc(name)}\\s[\\s\\S]*?^[ \\t]*\\.ends\\b[^\\r\\n]*`, 'im');
  const swap = (line: string, from0: number, to0: number) => {
    // palabras con sus espacios (para no tocar el formato)
    const parts = line.split(/(\s+)/);
    let w = -1;
    return parts
      .map((p) => {
        if (!p || /^\s+$/.test(p)) return p;
        w++;
        return w >= from0 && w < to0 && p === from ? to : p;
      })
      .join('');
  };
  return text.replace(block, (b) => {
    const [head, ...rest] = b.split('\n');
    // en la línea .subckt: después del nombre, hasta los parámetros
    const hw = head.trim().split(/\s+/);
    const pend = hw.findIndex((x, i) => i > 1 && (/^params:/i.test(x) || x.includes('=')));
    const h = swap(head, 2, pend < 0 ? hw.length : pend);
    return [
      h,
      ...rest.map((l) => {
        if (/^\s*[.*+;]/.test(l) || !l.trim()) return l;
        const [a, z] = nodeSpan(l.trim().split(/\s+/));
        return swap(l, a, z);
      }),
    ].join('\n');
  });
}

/** El netlist después de un cambio de pines del símbolo (`before` → `after`), con el .subckt `name`:
 *  un pin nuevo después del último nodo suma su nodo; uno que se saca (y corre los SpiceOrder de los
 *  siguientes) saca el suyo; uno renombrado renombra el nodo de su posición (sólo en los lugares que
 *  son nodos: no toca valores), salvo que el nombre nuevo ya sea otro nodo de la línea */
export function subcktAfterPins(text: string, name: string, before: string, after: string): string {
  const nodes = subcktPins(text, name);
  if (!nodes) return text;
  const a = symPins(before);
  const b = symPins(after);
  if (b.length > a.length) {
    const added = b.filter((p) => p.order > nodes.length).sort((x, y) => x.order - y.order);
    return added.length ? setSubcktPins(text, [...nodes, ...added.map((p) => p.name)], name) : text;
  }
  if (b.length < a.length) {
    const gone = a.find((p) => !b.some((q) => q.name === p.name && q.x === p.x && q.y === p.y));
    if (!gone || gone.order < 1 || gone.order > nodes.length) return text;
    return setSubcktPins(text, nodes.filter((_, i) => i !== gone.order - 1), name);
  }
  let out = text;
  const now = [...nodes];
  a.forEach((p, i) => {
    const q = b[i];
    const node = now[p.order - 1];
    if (!q || q.name === p.name || q.order !== p.order || node === undefined) return;
    const to = q.name.replace(/\s/g, '');
    if (!to || now.includes(to)) return;
    out = renameNodeIn(out, name, node, to);
    now[p.order - 1] = to;
  });
  return out;
}

/** El .subckt `name` con los pines de un símbolo (por SpiceOrder): el nodo de cada posición pasa a
 *  llamarse como su pin (en la línea y en el cuerpo, así el circuito sigue igual); las posiciones que
 *  faltan se agregan (las sin pin, nK) y las que no tienen pin quedan como estaban */
export function subcktForPins(text: string, name: string, sym: string): string {
  const nodes = name ? subcktPins(text, name) : null;
  if (!nodes) return text;
  const pins = symPins(sym);
  const max = Math.max(nodes.length, ...pins.map((p) => p.order));
  let out = text;
  const now = [...nodes];
  for (let k = 1; k <= max; k++) {
    const pin = pins.find((p) => p.order === k)?.name.replace(/\s/g, '');
    const old = now[k - 1];
    if (old === undefined) now.push(pin && !now.includes(pin) ? pin : `n${k}`);
    // renombrar sólo si el nombre nuevo no es ya otro nodo de la línea
    else if (pin && pin !== old && !now.includes(pin)) {
      out = renameNodeIn(out, name, old, pin);
      now[k - 1] = pin;
    }
  }
  return now.length > nodes.length ? setSubcktPins(out, now, name) : out;
}

/** «Update pins in .lib»: el .subckt `name` con los pines del símbolo (subcktForPins) y sin los nodos
 *  después del último pin (ningún pin va ahí; adentro quedan como nodos internos) */
export function libForPins(text: string, name: string, sym: string): string {
  const out = subcktForPins(text, name, sym);
  const nodes = subcktPins(out, name);
  const max = Math.max(0, ...symPins(sym).map((p) => p.order));
  return nodes && max && nodes.length > max ? setSubcktPins(out, nodes.slice(0, max), name) : out;
}
