// .asc → netlist con la misma forma que genera LTspice (LTspice -netlist), que es la
// referencia para validar. La traducción a ngspice está en tongspice.ts.
import { baseName, type AscDoc, type SymbolDef } from '../asc/model.ts';
import { effectiveAttrs, type SymbolSource } from '../asc/resolve.ts';
import { connectivity, type Connectivity } from './connectivity.ts';
import { t } from '../i18n/i18n.ts';

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
  /** nombre NC_xx de cada pin suelto ("sym:pin") */
  ncNames: Map<string, string>;
  /** bloques jerárquicos usados (símbolo BLOCK + su .asc), incluidos los anidados */
  blocks: Block[];
  warnings: string[];
}

export interface Block {
  /** nombre del subcircuito (= nombre del símbolo) */
  name: string;
  /** puertos en el orden de SpiceOrder del símbolo */
  ports: string[];
  /** parámetros con su valor por defecto ("G=1 R=1k"): el SpiceLine del símbolo (#180) */
  params?: string;
  lt: LtNetlist;
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

export function ltNetlist(doc: AscDoc, lib: SymbolSource, parents: string[] = []): LtNetlist {
  const warnings: string[] = [];
  const blocks: Block[] = [];
  const addBlock = (name: string, def: SymbolDef) => {
    if (blocks.some((b) => b.name.toLowerCase() === name.toLowerCase())) return;
    if (parents.some((p) => p.toLowerCase() === name.toLowerCase())) {
      warnings.push(t('Block {name} contains itself', { name }));
      return;
    }
    const sub = lib.schematic?.(name);
    if (!sub) {
      warnings.push(t('Missing schematic {name}.asc for block {name1}', { name, name1: name }));
      return;
    }
    const lt = ltNetlist(sub, lib, [...parents, name]);
    // puertos: nombres de los pines del símbolo, escritos como la etiqueta del .asc
    const ports = [...def.pins]
      .sort((a, b) => Number(a.attrs.get('SpiceOrder') ?? 0) - Number(b.attrs.get('SpiceOrder') ?? 0))
      .map((p) => {
        const pin = p.attrs.get('PinName') ?? '';
        return sub.flags.find((f) => f.name.toLowerCase() === pin.toLowerCase())?.name ?? pin;
      });
    warnings.push(...lt.warnings.map((w) => `${name}: ${w}`));
    for (const b of lt.blocks) if (!blocks.some((x) => x.name.toLowerCase() === b.name.toLowerCase())) blocks.push(b);
    const params = (def.attrs.get('SpiceLine') ?? '').trim();
    blocks.push({ name, ports, ...(/^[A-Za-z_]\w*\s*=/.test(params) ? { params } : {}), lt });
  };
  const conn = connectivity(doc, (tt) => lib.symbol(tt));
  let ncCounter = 0;
  const nc = (kind: 'NC' | 'MP') => `${kind}_${String(++ncCounter).padStart(2, '0')}`;

  // Etiquetas que no dan nombre a su red (otra etiqueta ganó): LTspice reescribe V(etiqueta) en
  // los valores de los elementos con el nombre de la red (no en las directivas)
  const aliases = new Map<string, string>();
  for (const n of conn.nets) for (const l of n.labels) if (l !== n.name) aliases.set(l.toLowerCase(), n.name);
  const renameV = (v: string) =>
    aliases.size
      ? v.replace(/\bV\(\s*([^,()\s]+)\s*(?:,\s*([^,()\s]+)\s*)?\)/gi, (m, a: string, b?: string) => {
          const na = aliases.get(a.toLowerCase());
          const nb = b && aliases.get(b.toLowerCase());
          if (!na && !nb) return m;
          return `V(${na ?? a}${b ? `,${nb ?? b}` : ''})`;
        })
      : v;

  const elements: Element[] = [];
  const families = new Set<string>();
  const modelFiles: string[] = [];
  const ncNames = new Map<string, string>();

  doc.symbols.forEach((s, si) => {
    const def = lib.symbol(s.type);
    if (!def) {
      warnings.push(t('Symbol not found: {p0}', { p0: baseName(s.type) }));
      return;
    }
    const attrs = effectiveAttrs(s, def);
    // Bloque jerárquico sin Prefix: LTspice lo instancia igual, como X§<InstName> (aunque
    // InstName empiece con X)
    const blockNoPrefix = def.symbolType.toUpperCase() === 'BLOCK' && !attrs.get('Prefix');
    const prefix = blockNoPrefix ? 'X' : (attrs.get('Prefix') ?? '');
    // Símbolos sin prefijo o sin pines (decorativos, flechas, puntos) no generan línea
    if (!prefix || !def.pins.length) return;
    const instName = attrs.get('InstName') ?? '';

    // Nodos por SpiceOrder; órdenes faltantes → MP_xx
    const byOrder = new Map<number, { node: string; name: string; key: string }>();
    def.pins.forEach((p, pi) => {
      const net = conn.pinNet.get(`${si}:${pi}`);
      const order = Number(p.attrs.get('SpiceOrder') ?? pi + 1);
      byOrder.set(order, { node: net?.name || '', name: p.attrs.get('PinName') ?? '', key: `${si}:${pi}` });
    });
    const maxOrder = Math.max(0, ...byOrder.keys());
    const nodes: string[] = [];
    const pinNames: string[] = [];
    // dispositivos A (compuertas digitales): los pines sueltos y los que faltan van a 0, sin
    // gastar números NC_xx
    const digital = prefix.toUpperCase() === 'A';
    for (let o = 1; o <= maxOrder; o++) {
      const p = byOrder.get(o);
      if (p && !p.node) {
        if (digital) p.node = '0';
        else ncNames.set(p.key, (p.node = nc('NC')));
      }
      nodes.push(p ? p.node : digital ? '0' : nc('MP'));
      pinNames.push(p?.name ?? '');
    }
    // Nodos implícitos: sustrato del BJT a tierra, bulk del MOSFET de 3 pines a la fuente
    const P = prefix.toUpperCase();
    if ((P === 'QN' || P === 'QP') && nodes.length === 3) {
      nodes.push('0');
      pinNames.push('');
    } else if ((P === 'MN' || P === 'MP') && nodes.length === 3) {
      // si la fuente está suelta, el bulk es otro nodo suelto (el nombre de la fuente ya es
      // NC_xx y LTspice usa uno nuevo)
      const src = byOrder.get(3);
      nodes.push(src && !ncNames.has(src.key) ? src.node : nc('NC'));
      pinNames.push('');
    }
    if (FAMILIES[P]) families.add(P);

    // Subcircuito sin ModelFile: el SpiceModel es el archivo (.lib) y el nombre es Value2 o, si
    // no hay, Value (p.ej. CD4046B, o los amp. op. de LTspice con SpiceModel LTC.lib)
    const libModel = P === 'X' && !attrs.get('ModelFile') ? attrs.get('SpiceModel') : undefined;
    const keys = libModel ? [attrs.get('Value2') ? 'Value2' : 'Value', 'SpiceLine', 'SpiceLine2'] : ['SpiceModel', 'Value', 'Value2', 'SpiceLine', 'SpiceLine2'];
    let value = keys
      .map((k) => attrs.get(k) ?? '')
      .filter((v) => v !== '')
      .join(' ')
      // LTspice escribe el prefijo micro como "u" en la netlist
      .replace(/[µμ]/g, 'u');
    value = renameV(value);
    // Bloque jerárquico: el subcircuito es el .asc con el nombre del símbolo
    if (def.symbolType.toUpperCase() === 'BLOCK') {
      const name = baseName(s.type);
      // con parámetros (SpiceLine) LTspice escribe "X§U1 a b nombre params: G=1"
      if (!value) value = name;
      else if (/^[^\s=]+=/.test(value)) value = `${name} params: ${value}`;
      addBlock(name, def);
    }

    const modelFile = attrs.get('ModelFile') || libModel;
    if (modelFile && !modelFiles.includes(modelFile)) modelFiles.push(modelFile);

    elements.push({ sym: si, name: blockNoPrefix ? `X§${instName}` : elementName(prefix, instName), prefix, nodes, pinNames, value, attrs });
  });

  const implicitModels: string[] = [];
  const standardLibs: string[] = [];
  for (const f of Object.keys(FAMILIES)) {
    if (!families.has(f)) continue;
    for (const m of FAMILIES[f].models) if (!implicitModels.includes(m)) implicitModels.push(m);
    if (!standardLibs.includes(FAMILIES[f].lib)) standardLibs.push(FAMILIES[f].lib);
  }

  const texts: Directive[] = doc.texts.map((tt) => ({ kind: tt.kind, text: tt.text }));
  return { elements, implicitModels, standardLibs, texts, modelFiles, conn, ncNames, blocks, warnings };
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
  for (const tt of n.texts) {
    const lines = tt.text.split('\\n');
    if (tt.kind === 'directive') out.push(...lines);
    else out.push(...lines.map((l) => `* ${l}`));
  }
  // LTspice lista los ModelFile en orden alfabético
  for (const f of [...n.modelFiles].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))) out.push(`.lib ${f}`);
  if (n.blocks.length) {
    out.push('', '* block symbol definitions');
    for (const b of n.blocks) {
      out.push(`.subckt ${b.name} ${b.ports.join(' ')}${b.params ? ` params: ${b.params}` : ''}`);
      out.push(...ltNetlistText({ ...b.lt, blocks: [] }).split('\n').filter((l) => !/^\.(backanno|end)$/.test(l)));
      out.push(`.ends ${b.name}`, '');
    }
  }
  out.push('.backanno', '.end');
  return out.join('\n');
}

/** Símbolo que nombra un aviso «Symbol not found: X» (en el idioma que sea), o null */
export function missingSymbolIn(warning: string): string | null {
  const [pre, post] = t('Symbol not found: {p0}').split('{p0}');
  return warning.startsWith(pre) && warning.endsWith(post) && warning.length > pre.length + post.length ? warning.slice(pre.length, warning.length - post.length) : null;
}
