// Subcircuitos del proyecto (#180): esquemáticos .asc con su símbolo BLOCK, comunes a todas las
// variantes (como los demás archivos del proyecto). El netlister los usa como bloques
// jerárquicos (Library.schematic), igual que LTspice con un X.asc junto a X.asy.
import { baseName, emptyDoc, type AscDoc } from '../asc/model.ts';
import { parseAsc } from '../asc/parse.ts';
import { serializeAsc } from '../asc/serialize.ts';
import { makeSymbol, schematicPorts } from '../library/makeSymbol.ts';
import { verilogPorts } from '../hdl/project.ts';
import { syncPins } from './symbolEdit.ts';
import { variantOf } from './project.ts';
import type { Project, ProjectFile } from './turbo.ts';

/** Nombre del subcircuito: el del archivo sin extensión (.asc, o .v de un módulo Verilog, #209) */
export const subName = (file: string) => file.replace(/\.(asc|s?v)$/i, '');
const key = (name: string) => subName(baseName(name)).toLowerCase();

/** Subcircuitos (esquemáticos) del proyecto */
export const subckts = (p: Project): ProjectFile[] => p.files.filter((f) => f.kind === 'schematic');

export const subcktFile = (p: Project, name: string): ProjectFile | undefined => subckts(p).find((f) => key(f.name) === key(name));

/** Módulos del proyecto: subcircuitos esquemáticos y módulos Verilog (#209) */
export const modules = (p: Project): ProjectFile[] => p.files.filter((f) => f.kind === 'schematic' || f.kind === 'verilog');
export const moduleFile = (p: Project, name: string): ProjectFile | undefined => modules(p).find((f) => key(f.name) === key(name));

/** ¿El símbolo de esta instancia es un módulo del proyecto (esquemático o Verilog)? */
export const isSubcktType = (p: Project, type: string) => !!moduleFile(p, type);

/** Puertos del subcircuito: sus etiquetas con IOPIN */
export const subcktPorts = (doc: AscDoc) => schematicPorts(doc.flags);

/** Símbolo generado (rectángulo con los puertos) */
export const subcktSymbol = (name: string, doc: AscDoc): ProjectFile => ({
  name: `${name}.asy`,
  kind: 'symbol',
  text: makeSymbol({ name, pins: subcktPorts(doc), block: true }),
});

/** Pines del símbolo .asy (en orden) */
function symbolPins(text: string): string[] {
  return [...text.matchAll(/^PINATTR PinName (.+)$/gm)].map((m) => m[1].trim());
}

/** ¿Los puertos del esquemático ya no coinciden con los pines de su símbolo? */
export function symbolOutdated(p: Project, name: string): boolean {
  const sch = moduleFile(p, name);
  const sym = p.files.find((f) => f.kind === 'symbol' && key(f.name) === key(name));
  // (un módulo Verilog tiene símbolo desde que se sintetiza, y la síntesis lo pone al día)
  if (sch?.kind === 'verilog') return !!sym && !!sch.synth?.pins.length && portsDiffer(verilogPorts(sch, sym.text).map((x) => x.name), symbolPins(sym.text));
  if (!sch || !sym) return !!sch;
  return portsDiffer(subcktPorts(parseAsc(sch.text)), symbolPins(sym.text));
}

const portsDiffer = (ports: string[], pins: string[]) => ports.length !== pins.length || ports.some((x) => !pins.some((y) => y.toLowerCase() === x.toLowerCase()));

const replaceFile = (files: ProjectFile[], f: ProjectFile) => {
  const i = files.findIndex((x) => x.kind === f.kind && x.name.toLowerCase() === f.name.toLowerCase());
  return i < 0 ? [...files, f] : files.map((x, k) => (k === i ? f : x));
};

/** Guarda el texto de un subcircuito (mismo proyecto si no cambió) */
export function storeSubckt(p: Project, name: string, asc: string): Project {
  const f = subcktFile(p, name);
  if (!f || f.text === asc) return p;
  return { ...p, modified: Date.now(), files: replaceFile(p.files, { ...f, text: asc }) };
}

/** Regenera el símbolo con los puertos actuales */
export const updateSymbol = (p: Project, name: string): Project => {
  const v = moduleFile(p, name);
  if (v?.kind === 'verilog') {
    const sym = p.files.find((x) => x.kind === 'symbol' && key(x.name) === key(name));
    return sym ? { ...p, modified: Date.now(), files: replaceFile(p.files, { ...sym, text: syncPins(sym.text, verilogPorts(v, sym.text)) }) } : p;
  }
  const f = subcktFile(p, name);
  if (!f) return p;
  const doc = parseAsc(f.text);
  const sym = p.files.find((x) => x.kind === 'symbol' && key(x.name) === key(name));
  // con símbolo: se conservan su dibujo, la posición de los pines y los parámetros
  const ports = subcktPorts(doc).map((n) => ({ name: n, dir: doc.flags.find((fl) => fl.name === n)?.ioPin }));
  const next = sym ? { ...sym, text: syncPins(sym.text, ports) } : subcktSymbol(subName(f.name), doc);
  return { ...p, modified: Date.now(), files: replaceFile(p.files, next) };
};

/** Texto del símbolo de un subcircuito */
export const subcktSymbolText = (p: Project, name: string) => p.files.find((x) => x.kind === 'symbol' && key(x.name) === key(name))?.text;

/** Cambia el texto del símbolo de un subcircuito */
export function storeSymbol(p: Project, name: string, text: string): Project {
  const sym = p.files.find((x) => x.kind === 'symbol' && key(x.name) === key(name));
  if (!sym || sym.text === text) return p;
  return { ...p, modified: Date.now(), files: replaceFile(p.files, { ...sym, text }) };
}

/** Esquemático inicial: un puerto de entrada y uno de salida */
export function subcktTemplate(_name: string): string {
  const doc = emptyDoc();
  doc.flags.push({ x: -128, y: 0, name: 'in', ioPin: 'In' }, { x: 128, y: 0, name: 'out', ioPin: 'Out' });
  return serializeAsc(doc);
}

/** Agrega un subcircuito nuevo (esquemático + símbolo) */
export function addSubckt(p: Project, name: string, asc = subcktTemplate(name)): Project {
  const sch: ProjectFile = { name: `${name}.asc`, kind: 'schematic', text: asc };
  return { ...p, modified: Date.now(), files: replaceFile(replaceFile(p.files, sch), subcktSymbol(name, parseAsc(asc))) };
}

/** Renombra el subcircuito, su símbolo y todas sus instancias */
export function renameSubckt(p: Project, from: string, to: string): Project {
  const f = moduleFile(p, from);
  if (!f) return p;
  const retype = (asc: string) => {
    const doc = parseAsc(asc);
    let changed = false;
    for (const s of doc.symbols)
      if (key(s.type) === key(from)) {
        s.type = s.type.slice(0, s.type.length - baseName(s.type).length) + to;
        changed = true;
      }
    return changed ? serializeAsc(doc) : asc;
  };
  const files = p.files.map((x) => {
    // un módulo Verilog: el archivo y el módulo de adentro (se vuelve a sintetizar)
    if (x === f && f.kind === 'verilog') {
      const { synth: _, ...rest } = x;
      return { ...rest, name: `${to}.v`, text: x.text.replace(new RegExp(`^(\\s*module\\s+)${from}\\b`, 'm'), `$1${to}`) };
    }
    if (x === f) return { ...x, name: `${to}.asc`, text: retype(x.text) };
    if (x.kind === 'symbol' && key(x.name) === key(from))
      return {
        ...x,
        name: `${to}.asy`,
        text: x.text
          .replace(/(SYMATTR Description .*?)\b\S+$/m, `$1${to}`)
          .replace(/^SYMATTR Value .*$/m, (l) => (f.kind === 'verilog' ? `SYMATTR Value ${to}` : l))
          .replace(/^SYMATTR ModelFile .*$/m, (l) => (f.kind === 'verilog' ? `SYMATTR ModelFile ${to}.sub` : l)),
      };
    if (x.kind === 'schematic') return { ...x, text: retype(x.text) };
    return x;
  });
  const variants = p.variants.map((v) => ({
    ...v,
    base: retype(v.base),
    sims: v.sims.map((s) => ({ ...s, asc: retype(s.asc) })),
  }));
  return { ...p, modified: Date.now(), files, variants };
}

/** Saca el subcircuito y su símbolo (las instancias quedan sin símbolo) */
export const removeSubckt = (p: Project, name: string): Project => ({
  ...p,
  modified: Date.now(),
  files: p.files.filter((f) => !((f.kind === 'schematic' || f.kind === 'verilog' || f.kind === 'symbol') && key(f.name) === key(name))),
});

export interface Usage {
  /** dónde: una simulación de una variante, la base de una variante o otro subcircuito */
  where: { kind: 'sim'; variant: string; sim: string; label: string } | { kind: 'base'; variant: string; label: string } | { kind: 'subckt'; name: string; label: string };
  inst: string;
}

const instName = (attrs: Map<string, string>) => attrs.get('InstName') ?? '?';

/** Instancias del subcircuito en todo el proyecto */
export function usages(p: Project, name: string, simLabel: (asc: string, name?: string) => string): Usage[] {
  const out: Usage[] = [];
  const scan = (asc: string, where: Usage['where']) => {
    for (const s of parseAsc(asc).symbols) if (key(s.type) === key(name)) out.push({ where, inst: instName(s.attrs) });
  };
  for (const v of p.variants) {
    if (!v.sims.length) scan(v.base, { kind: 'base', variant: v.id, label: v.name });
    for (const s of v.sims) scan(s.asc, { kind: 'sim', variant: v.id, sim: s.id, label: simLabel(s.asc, s.name) });
  }
  for (const f of subckts(p)) if (key(f.name) !== key(name)) scan(f.text, { kind: 'subckt', name: subName(f.name), label: subName(f.name) });
  return out;
}

/** Subcircuitos que se usan dentro de un circuito (para el árbol) */
export function childSubckts(p: Project, asc: string): string[] {
  const names = new Set(modules(p).map((f) => key(f.name)));
  const out: string[] = [];
  for (const s of parseAsc(asc).symbols) {
    const k = key(s.type);
    if (names.has(k) && !out.some((x) => x.toLowerCase() === k)) out.push(subName(moduleFile(p, k)!.name));
  }
  return out;
}

/**
 * Ciclos (#199): ¿colocar `types` adentro del subcircuito `host` haría que se contenga a sí
 * mismo, directa o indirectamente? Devuelve el subcircuito que lo causa, o null
 */
export function placingCycle(p: Project, host: string, types: string[]): string | null {
  const h = host.toLowerCase();
  const seen = new Set<string>();
  const reaches = (name: string): boolean => {
    const k = key(name);
    if (k === h) return true;
    if (seen.has(k)) return false;
    seen.add(k);
    const f = subcktFile(p, k);
    return !!f && childSubckts(p, f.text).some(reaches);
  };
  for (const tt of types) {
    const f = subcktFile(p, key(tt));
    if (f && reaches(subName(f.name))) return subName(f.name);
  }
  return null;
}

/** Testbenches que usan el subcircuito, directamente o a través de otros subcircuitos (#199) */
export function benchesUsing(p: Project, name: string): number {
  const inside = new Set([key(name)]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of subckts(p)) {
      const k = key(f.name);
      if (!inside.has(k) && parseAsc(f.text).symbols.some((s) => inside.has(key(s.type)))) inside.add(k), (grew = true);
    }
  }
  const uses = (asc: string) => parseAsc(asc).symbols.some((s) => inside.has(key(s.type)));
  let n = 0;
  for (const v of p.variants) {
    if (!v.sims.length) n += uses(v.base) ? 1 : 0;
    for (const s of v.sims) n += uses(s.asc) ? 1 : 0;
  }
  return n;
}

/** Variante activa (para la raíz del árbol) */
export const testbenchName = (p: Project) => variantOf(p).name;

/** Nombre válido y libre para un subcircuito nuevo */
export function freeSubcktName(p: Project, base = 'SUB'): string {
  const taken = new Set(p.files.map((f) => key(f.name)));
  for (let i = 1; ; i++) if (!taken.has(`${base}${i}`.toLowerCase())) return `${base}${i}`;
}

export const validSubcktName = (s: string) => /^[A-Za-z_][\w-]*$/.test(s);
