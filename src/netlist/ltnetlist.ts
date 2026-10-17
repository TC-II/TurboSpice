// .asc → netlist con la misma forma que genera LTspice (LTspice -netlist), que es la
// referencia para validar. La traducción a ngspice está en tongspice.ts.
import { baseName, type AscDoc } from '../asc/model.ts';
import { effectiveAttrs, type SymbolSource } from '../asc/resolve.ts';
import { connectivity, type Connectivity } from './connectivity.ts';

export interface Element {
  /** índice en doc.symbols */
  sym: number;
  /** nombre como lo escribe LTspice (p.ej. "R1", "X§U1") */
  name: string;
  prefix: string;
  /** nodos en orden de SpiceOrder (incluye los agregados: sustrato del BJT, bulk del MOS) */
  nodes: string[];
  /** nombre de pin para cada nodo ("" en los agregados) */
  pinNames: string[];
  /** resto de la línea: modelo/valor/parámetros */
  value: string;
  attrs: Map<string, string>;
}

export interface Directive {
  kind: 'directive' | 'comment';
  text: string;
}

export interface LtNetlist {
  elements: Element[];
  /** .model implícitos que agrega LTspice (.model D D, .model NPN NPN, …) */
  implicitModels: string[];
  /** .lib de la librería estándar de LTspice que agrega según los dispositivos */
  standardLibs: string[];
  texts: Directive[];
  /** .lib de los ModelFile de los símbolos usados */
  modelFiles: string[];
  conn: Connectivity;
  warnings: string[];
}

// Familias con modelo implícito: LTspice agrega estos .model y su librería estándar
const FAMILIES: Record<string, { models: string[]; lib: string }> = {
  D: { models: ['.model D D'], lib: 'standard.dio' },
  QN: { models: ['.model NPN NPN', '.model PNP PNP'], lib: 'standard.bjt' },
  QP: { models: ['.model NPN NPN', '.model PNP PNP'], lib: 'standard.bjt' },
  MN: { models: ['.model NMOS NMOS', '.model PMOS PMOS'], lib: 'standard.mos' },
  MP: { models: ['.model NMOS NMOS', '.model PMOS PMOS'], lib: 'standard.mos' },
  JN: { models: ['.model NJF NJF', '.model PJF PJF'], lib: 'standard.jft' },
  JP: { models: ['.model NJF NJF', '.model PJF PJF'], lib: 'standard.jft' },
};

/** Nombre del elemento: si InstName no empieza con la letra del prefijo, LTspice usa "P§InstName" */
export function elementName(prefix: string, instName: string): string {
  const letter = prefix[0] ?? 'X';
  return instName[0]?.toUpperCase() === letter.toUpperCase() ? instName : `${letter}§${instName}`;
}

export function ltNetlist(doc: AscDoc, lib: SymbolSource): LtNetlist {
  const warnings: string[] = [];
  const conn = connectivity(doc, (t) => lib.symbol(t));
  let ncCounter = 0;
  const nc = (kind: 'NC' | 'MP') => `${kind}_${String(++ncCounter).padStart(2, '0')}`;

  const elements: Element[] = [];
  const families = new Set<string>();
  const modelFiles: string[] = [];

  doc.symbols.forEach((s, si) => {
    const def = lib.symbol(s.type);
    if (!def) {
      warnings.push(`Símbolo no encontrado: ${baseName(s.type)}`);
      return;
    }
    const attrs = effectiveAttrs(s, def);
    const prefix = attrs.get('Prefix') ?? '';
    // Símbolos sin prefijo (decorativos, flechas) no generan línea
    if (!prefix) return;
    const instName = attrs.get('InstName') ?? '';

    // Nodos por SpiceOrder; órdenes faltantes → MP_xx
    const byOrder = new Map<number, { node: string; name: string }>();
    def.pins.forEach((p, pi) => {
      const net = conn.pinNet.get(`${si}:${pi}`);
      const order = Number(p.attrs.get('SpiceOrder') ?? pi + 1);
      byOrder.set(order, { node: net?.name || '', name: p.attrs.get('PinName') ?? '' });
    });
    const maxOrder = Math.max(0, ...byOrder.keys());
    const nodes: string[] = [];
    const pinNames: string[] = [];
    for (let o = 1; o <= maxOrder; o++) {
      const p = byOrder.get(o);
      nodes.push(p ? p.node || nc('NC') : nc('MP'));
      pinNames.push(p?.name ?? '');
    }
    // Nodos implícitos: sustrato del BJT a tierra, bulk del MOSFET de 3 pines a la fuente
    const P = prefix.toUpperCase();
    if ((P === 'QN' || P === 'QP') && nodes.length === 3) {
      nodes.push('0');
      pinNames.push('');
    } else if ((P === 'MN' || P === 'MP') && nodes.length === 3) {
      // si la fuente está suelta, el bulk es otro nodo suelto
      nodes.push(byOrder.get(3)?.node || nc('NC'));
      pinNames.push('');
    }
    if (FAMILIES[P]) families.add(P);

    const value = ['SpiceModel', 'Value', 'Value2', 'SpiceLine', 'SpiceLine2']
      .map((k) => attrs.get(k) ?? '')
      .filter((v) => v !== '')
      .join(' ')
      // LTspice escribe el prefijo micro como "u" en la netlist
      .replace(/[µμ]/g, 'u');

    const modelFile = attrs.get('ModelFile');
    if (modelFile && !modelFiles.includes(modelFile)) modelFiles.push(modelFile);

    elements.push({ sym: si, name: elementName(prefix, instName), prefix, nodes, pinNames, value, attrs });
  });

  const implicitModels: string[] = [];
  const standardLibs: string[] = [];
  for (const f of Object.keys(FAMILIES)) {
    if (!families.has(f)) continue;
    for (const m of FAMILIES[f].models) if (!implicitModels.includes(m)) implicitModels.push(m);
    if (!standardLibs.includes(FAMILIES[f].lib)) standardLibs.push(FAMILIES[f].lib);
  }

  const texts: Directive[] = doc.texts.map((t) => ({ kind: t.kind, text: t.text }));
  return { elements, implicitModels, standardLibs, texts, modelFiles, conn, warnings };
}

/** Texto de la netlist con el formato de LTspice -netlist (sin la línea de título) */
export function ltNetlistText(n: LtNetlist): string {
  const out: string[] = [];
  for (const e of n.elements) {
    let line = [e.name, ...e.nodes, e.value].filter((x) => x !== '').join(' ');
    if (e.prefix.toUpperCase() === 'X') line += ` ;§pnba ${e.pinNames.join(')')}`;
    out.push(line);
  }
  // LTspice intercala cada familia de .model con su .lib estándar
  const libFor = (m: string) => Object.values(FAMILIES).find((f) => f.models.includes(m))!.lib;
  const done = new Set<string>();
  for (const m of n.implicitModels) {
    out.push(m);
    const lib = libFor(m);
    const family = Object.values(FAMILIES).find((f) => f.lib === lib)!;
    if (!done.has(lib) && family.models.every((x) => out.includes(x))) {
      out.push(`.lib ${lib}`);
      done.add(lib);
    }
  }
  for (const t of n.texts) {
    const lines = t.text.split('\\n');
    if (t.kind === 'directive') out.push(...lines);
    else out.push(...lines.map((l) => `* ${l}`));
  }
  // LTspice lista los ModelFile en orden alfabético
  for (const f of [...n.modelFiles].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))) out.push(`.lib ${f}`);
  out.push('.backanno', '.end');
  return out.join('\n');
}
