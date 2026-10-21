// Nodos flotantes (sin camino de continua a tierra): entradas de E sin conectar, nodos entre
// capacitores en serie, nodos internos de subcircuitos que sólo ven capacitores o entradas.
// LTspice avisa ("WARNING: Node 2 is floating") y simula igual: medido con LTspice -b, el nodo
// queda con una conductancia de ~1e-12 S a tierra (gmin) y en el punto de operación vale
// prácticamente 0 (1e-6 V detrás de un capacitor de 1 µF desde 1 V; en LTspice el capacitor
// conduce C·1e-12 S en continua). ngspice, en cambio, falla con matriz singular o converge a
// cualquier cosa. LTspice no pone la conductancia en todos los nodos del grupo flotante sino en
// uno solo, el último creado (el que nombra el aviso): con fuentes adentro del grupo eso fija su
// nivel (V3 a b 5 entre dos capacitores → b ≈ 0, a ≈ 5). Se reproduce con una resistencia de
// 1 TΩ a tierra en ese nodo (un .options rshunt global empeora casos que hoy coinciden).
//
// El análisis se hace sobre el circuito aplanado (subcircuitos de la netlist y de los archivos
// incluidos); un nodo interno se nombra como lo aplana ngspice (x1.x2.nodo), que lo acepta
// desde el nivel superior.

export const FLOAT_R = '1e12';

interface Subckt {
  name: string;
  ports: string[];
  body: string[];
}

/** Une líneas de continuación ("+ …") */
function logicalLines(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (/^\s*\+/.test(line) && out.length) out[out.length - 1] += ' ' + line.replace(/^\s*\+/, '');
    else out.push(line);
  }
  return out;
}

/** Separa en palabras sin cortar expresiones entre llaves o paréntesis; quita comentarios */
function tokens(line: string): string[] {
  const s = line.replace(/\s(;|\$\s).*$/, '').replace(/\s*=\s*/g, '=');
  const out: string[] = [];
  let cur = '';
  let depth = 0;
  for (const ch of s) {
    if (ch === '{' || ch === '(') depth++;
    if (ch === '}' || ch === ')') depth = Math.max(0, depth - 1);
    if (/[\s,]/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** Palabras posicionales (sin parámetros a=b ni "params:") */
const positional = (t: string[]) => {
  const out: string[] = [];
  for (const w of t) {
    if (/^params:/i.test(w)) break;
    if (!w.includes('=')) out.push(w);
  }
  return out;
};

const isGround = (n: string) => n === '0' || n.toLowerCase() === 'gnd';

/**
 * Para un elemento, sus nodos y los grupos que quedan unidos en continua.
 * Ante la duda se los une a todos (no detectar un flotante deja las cosas como estaban);
 * null = no se sabe cuáles son sus nodos.
 */
function dcGroups(t: string[], models: Set<string>, subckts: Map<string, Subckt>): { nodes: string[]; groups: string[][]; sub?: Subckt } | null {
  const letter = t[0][0].toLowerCase();
  const p = positional(t).slice(1);
  const two = p.slice(0, 2);
  switch (letter) {
    case 'r':
    case 'l':
    case 'v':
    case 'd':
    case 'h':
      return { nodes: two, groups: [two] };
    case 'c':
    case 'i':
    case 'f':
      return { nodes: two, groups: [] };
    case 'b': {
      const voltage = t.slice(3).some((w) => /^v=/i.test(w));
      return { nodes: two, groups: voltage ? [two] : [] };
    }
    case 'e':
    case 'g': {
      const kw = (p[2] ?? '').toLowerCase();
      if (/^(poly|value|table|laplace|freq|cur|vol)/.test(kw) || t.slice(3).some((w) => /^(value|table|laplace)=/i.test(w)))
        return { nodes: two, groups: letter === 'e' ? [two] : [] };
      const four = p.slice(0, 4);
      return { nodes: four, groups: letter === 'e' ? [two] : [] };
    }
    case 's':
    case 'w':
      return { nodes: letter === 's' ? p.slice(0, 4) : two, groups: [two] };
    case 'q':
    case 'j':
    case 'z': {
      const n = letter === 'q' && p.length > 4 && !models.has(p[3].toLowerCase()) ? 4 : 3;
      const nodes = p.slice(0, n);
      return { nodes, groups: [nodes] };
    }
    case 'm': {
      const n = p.length > 4 && !models.has(p[3].toLowerCase()) ? 4 : 3;
      const nodes = p.slice(0, n);
      return { nodes, groups: [[nodes[0], ...nodes.slice(2)]] };
    }
    case 'x': {
      const sub = subckts.get((p[p.length - 1] ?? '').toLowerCase());
      if (!sub) return null;
      return { nodes: p.slice(0, sub.ports.length), groups: [], sub };
    }
    case 'k':
      return { nodes: [], groups: [] };
    case 'a':
      return null;
    default:
      if (/^[a-z]$/.test(letter)) return null;
      return { nodes: [], groups: [] };
  }
}

class UnionFind {
  private parent = new Map<string, string>();
  find(k: string): string {
    if (!this.parent.has(k)) this.parent.set(k, k);
    let r = k;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    this.parent.set(k, r);
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

/** Elementos de nivel superior y definiciones .subckt de un texto */
function parseText(text: string, main: boolean, subckts: Map<string, Subckt>, models: Set<string>, globals: Set<string>): string[] {
  const lines = logicalLines(text);
  const top: string[] = [];
  const stack: Subckt[] = [];
  let control = false;
  for (const l of lines) {
    const s = l.trim();
    if (!s || s.startsWith('*')) continue;
    const low = s.toLowerCase();
    if (low.startsWith('.control')) control = true;
    if (low.startsWith('.endc')) control = false;
    if (control) continue;
    if (low.startsWith('.subckt')) {
      const t = tokens(s);
      const sub: Subckt = { name: t[1] ?? '', ports: positional(t).slice(2), body: [] };
      // el .subckt de la netlist principal tiene prioridad sobre el de una librería
      if (main || !subckts.has(sub.name.toLowerCase())) subckts.set(sub.name.toLowerCase(), sub);
      stack.push(sub);
    } else if (low.startsWith('.ends')) stack.pop();
    else if (low.startsWith('.model')) models.add((tokens(s)[1] ?? '').toLowerCase());
    else if (low.startsWith('.global')) for (const g of tokens(s).slice(1)) globals.add(g);
    else if (!s.startsWith('.')) (stack.length ? stack[stack.length - 1].body : top).push(s);
  }
  return top;
}

/**
 * Nodos sin camino de continua a tierra: uno por grupo flotante, el último creado, con el
 * nombre aplanado de ngspice (en minúsculas).
 */
export function floatingNodes(main: string, files: Record<string, string>): string[] {
  const subckts = new Map<string, Subckt>();
  const models = new Set<string>();
  const globals = new Set<string>();
  for (const text of Object.values(files)) parseText(text, false, subckts, models, globals);
  const top = parseText(main, true, subckts, models, globals);

  const uf = new UnionFind();
  /** nodo aplanado → orden de creación */
  const order = new Map<string, number>();
  const all = new Set<string>();
  const flat = (node: string, prefix: string, map: Map<string, string>) => {
    if (isGround(node)) return '0';
    if (globals.has(node)) return node.toLowerCase();
    const f = map.get(node.toLowerCase()) ?? prefix + node.toLowerCase();
    if (!order.has(f)) order.set(f, order.size);
    return f;
  };
  let budget = 200000;
  const expand = (lines: string[], prefix: string, map: Map<string, string>, depth: number) => {
    for (const line of lines) {
      if (--budget < 0 || depth > 50) return;
      const t = tokens(line);
      if (!t.length) continue;
      const g = dcGroups(t, models, subckts);
      if (!g) {
        // elemento desconocido (o .subckt que no está): sus nodos no se dan por flotantes
        for (const w of positional(t).slice(1)) uf.union('0', flat(w, prefix, map));
        continue;
      }
      const nodes = g.nodes.map((n) => flat(n, prefix, map));
      for (const n of nodes) all.add(n);
      for (const grp of g.groups) {
        const f = grp.map((n) => flat(n, prefix, map));
        for (const x of f) uf.union(f[0], x);
      }
      if (g.sub) {
        const inner = new Map<string, string>();
        g.sub.ports.forEach((port, i) => { if (nodes[i] !== undefined) inner.set(port.toLowerCase(), nodes[i]); });
        expand(g.sub.body, `${prefix}${t[0].toLowerCase()}.`, inner, depth + 1);
      }
    }
  };
  expand(top, '', new Map(), 0);
  if (budget < 0) return [];

  const ground = uf.find('0');
  const last = new Map<string, string>();
  for (const n of all) {
    if (n === '0') continue;
    const r = uf.find(n);
    if (r === ground) continue;
    const prev = last.get(r);
    if (prev === undefined || order.get(n)! > order.get(prev)!) last.set(r, n);
  }
  return [...last.values()];
}

/** Agrega a la netlist principal una resistencia de FLOAT_R a tierra en cada nodo flotante */
export function fixFloatingNodes(main: string, files: Record<string, string>): { text: string; floating: string[] } {
  const floating = floatingNodes(main, files);
  if (!floating.length) return { text: main, floating };
  const add = ['* nodos sin camino de continua a tierra (LTspice les pone gmin a uno por grupo)', ...floating.map((n, i) => `R__float${i + 1} ${n} 0 ${FLOAT_R}`)];
  const lines = main.split('\n');
  const end = lines.findIndex((l) => /^\s*\.end\s*$/i.test(l));
  lines.splice(end >= 0 ? end : lines.length, 0, ...add);
  return { text: lines.join('\n'), floating };
}
