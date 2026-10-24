// Módulos de tipo «Modelo»: un archivo de modelos del proyecto (texto de netlist con un .subckt o
// un .model) y su símbolo .asy, que lo usa por ModelFile. Es lo que en TCLib es un par .sub + .asy:
// el símbolo lleva Prefix, Value, SpiceModel, SpiceLine, los pines con su SpiceOrder y su dibujo.
// En el .turbo el archivo de modelos lleva "module": "model" (docs/turbo-formato.md).
import { makeSymbol, subcktPins } from '../library/makeSymbol.ts';
import { baseName } from '../asc/model.ts';
import type { Project, ProjectFile } from './turbo.ts';

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
  const re = new RegExp(`^SYMATTR ${k}( .*)?\\r?\\n?`, 'm');
  const v = value.trim();
  if (re.test(text)) return text.replace(re, v ? `SYMATTR ${k} ${v}\n` : '');
  if (!v) return text;
  const ls = text.split(/\r?\n/);
  // antes del primer PIN (como en los .asy de LTspice)
  const at = ls.findIndex((l) => l.startsWith('PIN '));
  ls.splice(at < 0 ? ls.length - (ls[ls.length - 1] === '' ? 1 : 0) : at, 0, `SYMATTR ${k} ${v}`);
  return ls.join('\n');
}

/** Atributos de un símbolo de modelo que se editan a mano */
export const MODEL_ATTRS = ['Prefix', 'InstName', 'Value', 'Value2', 'SpiceModel', 'ModelFile', 'SpiceLine', 'SpiceLine2', 'Description'] as const;

/** Símbolo generado para el texto del modelo */
export function modelModuleSymbol(name: string, text: string): string {
  const info = modelInfo(text);
  let asy = makeSymbol({ name: info.name || name, pins: info.pins, modelFile: modelFileName(name), description: name, spiceLine: info.params.map(([k, v]) => `${k}=${v}`).join(' ') || undefined });
  asy = setSymAttr(asy, 'Prefix', info.prefix);
  if (info.kind === 'model') {
    // los .model: Value es el nombre del modelo (D1 a k 1N4148)
    asy = setSymAttr(asy, 'Value', info.name);
  }
  return asy;
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
