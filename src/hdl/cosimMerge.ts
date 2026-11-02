// Los bloques de la biblioteca DSP en un solo módulo de Icarus (#366). Sintetizados, un
// multiplicador son ~1800 compuertas de XSPICE y un FIR, decenas de miles: cada flanco recorre
// todas. Acá las instancias de nivel superior que se pueden juntar (las de `mergeable`) se
// reemplazan por una sola, de un módulo Verilog generado que las instancia y las cablea como en el
// esquemático, y que corre como un d_cosim (Icarus): la aritmética es una cuenta por palabra.
// También respeta el límite de un bloque Icarus por simulación.
//
// - Un nodo que usa algo más de la netlist (otro elemento, una fuente, un .meas, el .control) es un
//   puerto: entrada si ningún bloque de adentro lo maneja, salida si sí. El resto son wire.
// - Las redes internas no existen para ngspice: las que piden las trazas (Dig() o V()) salen como
//   puertos, y `aliases` lleva sus nombres de antes ("x24.q_3_d", "x[3]") al nodo de eventos del
//   bloque nuevo ("xdsp.w_7_d"), como los de digitalLinks.
// - Un pin inout (tri-state) no se junta: su bloque queda como está.
import { ngNodeName } from '../netlist/tongspice.ts';
import { busRange } from '../waveform/digital.ts';
import { ELECTRICAL_NAMES } from './electrical.ts';
import { portsOf } from './project.ts';
import type { PinDir } from './synth.ts';

export interface MergeModule {
  /** nombre del módulo (como en la netlist y en el Verilog) */
  name: string;
  /** pines del .subckt sintetizado, un bit cada uno, en orden ("y_15" … "y_0") */
  pins: { name: string; dir: PinDir }[];
  /** parameter de Verilog y su valor por omisión */
  params: Record<string, string>;
}

export interface CosimMerge {
  /** la netlist sin las instancias juntadas; su línea X va donde dice MERGED_LINE */
  netlist: string;
  /** el módulo generado */
  verilog: string;
  /** nombre del módulo y del .subckt */
  top: string;
  /** puerto del módulo → nodo de la netlist */
  ports: Map<string, string>;
  /** los parámetros eléctricos de la línea X (los de la primera instancia) */
  electrical: string[];
  /** nombre de antes (minúsculas) → vector de eventos del bloque nuevo */
  aliases: Map<string, string>;
  /** las instancias que se juntaron */
  instances: string[];
}

export const MERGED_TOP = 'dsp_cosim';
export const MERGED_INST = 'xdsp';
export const MERGED_LINE = '* (dsp_cosim)';

/** Las palabras de una línea, sin cortar llaves ni paréntesis ({vcc/2}) */
const tokens = (line: string) => line.trim().match(/(?:\{[^{}]*\}|\([^()]*\)|[^\s{}()])+/g) ?? [];

interface Inst {
  line: number;
  name: string;
  mod: MergeModule;
  nodes: string[];
  params: Map<string, string>;
  electrical: string[];
}

/**
 * Junta las instancias de los módulos que pide `mergeable` (al menos dos). `traces`: las
 * expresiones que se van a graficar (sus redes internas salen como puertos). null si no hay nada
 * que juntar.
 */
export function mergeCosim(netlist: string, modules: MergeModule[], mergeable: (module: string) => boolean, traces: string[] = []): CosimMerge | null {
  const byName = new Map(modules.map((m) => [m.name.toLowerCase(), m]));
  const lines = netlist.split('\n');
  const insts: Inst[] = [];
  let depth = 0;
  let control = false;
  lines.forEach((l, i) => {
    const s = l.trim().toLowerCase();
    if (s.startsWith('.control')) control = true;
    if (s.startsWith('.endc')) control = false;
    if (s.startsWith('.subckt')) depth++;
    if (s.startsWith('.ends')) depth--;
    if (depth || control || !/^x/i.test(s)) return;
    const tt = tokens(l);
    const at = tt.findIndex((tok, k) => k > 0 && byName.has(tok.toLowerCase()) && (k === tt.length - 1 || /=|^params:$/i.test(tt[k + 1])));
    if (at < 0) return;
    const mod = byName.get(tt[at].toLowerCase())!;
    if (!mergeable(mod.name) || mod.pins.some((p) => p.dir === 'inout') || at - 1 !== mod.pins.length) return;
    const params = new Map<string, string>();
    const electrical: string[] = [];
    for (const kv of tt.slice(at + 1)) {
      const m = /^([A-Za-z_][\w$]*)=(.+)$/.exec(kv);
      if (!m) continue;
      if (ELECTRICAL_NAMES.has(m[1].toLowerCase())) electrical.push(kv);
      else params.set(m[1].toLowerCase(), m[2]);
    }
    insts.push({ line: i, name: tt[0]!.toLowerCase(), mod, nodes: tt.slice(1, at), params, electrical });
  });
  if (insts.length < 2) return null;

  // dónde más aparece cada nodo (fuera de los .subckt, de las instancias juntadas y de las R de gmin)
  const merged = new Set(insts.map((x) => x.line));
  const outside = new Set<string>();
  depth = 0;
  lines.forEach((l, i) => {
    const s = l.trim().toLowerCase();
    if (s.startsWith('.subckt')) depth++;
    if (s.startsWith('.ends')) depth--;
    if (depth || merged.has(i) || s.startsWith('*') || /^r__float\d+\s/.test(s)) return;
    for (const w of s.split(/[\s(),=]+/)) if (w) outside.add(w);
  });

  // las redes que nombran las trazas: V(x), Dig(x[3:0]), Dig(x24.q[3:0]) → nodos de la netlist
  const pinNode = new Map<string, string>();
  for (const x of insts) x.mod.pins.forEach((p, k) => pinNode.set(`${x.name}.${p.name}_d`.toLowerCase(), x.nodes[k].toLowerCase()));
  const traced = new Set<string>();
  const names = new Map<string, string[]>(); // nodo → nombres con que lo piden las trazas
  const want = (name: string) => {
    const n = name.toLowerCase();
    const node = pinNode.get(n) ?? ngNodeName(name).toLowerCase();
    traced.add(node);
    names.set(node, [...(names.get(node) ?? []), n]);
  };
  for (const tr of traces)
    for (const m of tr.matchAll(/\b(?:dig|v)\(([^(),]+)\)/gi)) {
      const bus = busRange(m[1]);
      if (!bus) want(m[1].trim());
      else for (const b of bus.bits) want(/\.[^.]*$/.test(bus.base) && bus.base.includes('.') ? `${bus.base}_${b}_d` : `${bus.base}[${b}]`);
    }

  // cada nodo: un wire (o un puerto) del módulo
  const wire = new Map<string, string>();
  const original = new Map<string, string>();
  const driven = new Set<string>();
  for (const x of insts)
    x.mod.pins.forEach((p, k) => {
      const n = x.nodes[k].toLowerCase();
      if (!wire.has(n)) wire.set(n, `w_${wire.size}`);
      original.set(n, x.nodes[k]);
      if (p.dir === 'out') driven.add(n);
    });
  const inputs: string[] = [];
  const outputs: string[] = [];
  for (const n of wire.keys()) {
    if (n === '0') continue;
    if (driven.has(n)) {
      if (outside.has(n) || traced.has(n)) outputs.push(n);
    } else inputs.push(n);
  }

  // el módulo: cada instancia con sus parameter y sus puertos (un bus, sus bits del más alto al más bajo)
  const ref = (n: string) => (n === '0' ? "1'b0" : wire.get(n)!);
  const body = insts.map((x) => {
    const over = Object.keys(x.mod.params)
      .filter((p) => x.params.has(p.toLowerCase()) && /^-?\d+$/.test(x.params.get(p.toLowerCase())!) && Number(x.params.get(p.toLowerCase())) !== Number(x.mod.params[p]))
      .map((p) => `.${p}(${x.params.get(p.toLowerCase())})`);
    let k = 0;
    const conns = portsOf(x.mod.pins).map((port) => {
      const bits = x.nodes.slice(k, k + port.bits).map((n) => ref(n.toLowerCase()));
      k += port.bits;
      return `.${port.name.replace(/\[.*$/, '')}(${bits.length > 1 ? `{${bits.join(', ')}}` : bits[0]})`;
    });
    return `  ${x.mod.name} ${over.length ? `#(${over.join(', ')}) ` : ''}${x.name.replace(/[^\w$]/g, '_')} (${conns.join(', ')});`;
  });
  const isPort = new Set([...inputs, ...outputs]);
  const wires = [...wire.keys()].filter((n) => n !== '0' && !isPort.has(n)).map((n) => wire.get(n)!);
  const decl = [...inputs.map((n) => `input ${wire.get(n)}`), ...outputs.map((n) => `output ${wire.get(n)}`)];
  const verilog = [
    `// Generated by TurboSpice: ${insts.length} DSP blocks in one Icarus module (${insts.map((x) => x.name).join(' ')})`,
    // (sin timescale, vvp cuenta en segundos y los flancos de un reloj de MHz caen en el mismo tick;
    // el archivo va primero, así que vale también para los módulos de la biblioteca)
    '`timescale 1ns/1ps',
    `module ${MERGED_TOP} (${decl.join(', ')});`,
    ...(wires.length ? [`  wire ${wires.join(', ')};`] : []),
    ...body,
    'endmodule',
    '',
  ].join('\n');

  const ports = new Map([...inputs, ...outputs].map((n) => [wire.get(n)!, original.get(n)!]));
  // los nombres de antes de las salidas → su nodo de eventos en el bloque nuevo
  const aliases = new Map<string, string>();
  for (const n of outputs) {
    const ev = `${MERGED_INST}.${wire.get(n)}_d`;
    aliases.set(n, ev);
    const bit = /^(.+)__(\d+)__$/.exec(n);
    if (bit) aliases.set(`${bit[1]}[${bit[2]}]`, ev);
    for (const name of names.get(n) ?? []) aliases.set(name, ev);
  }
  for (const [pin, n] of pinNode) if (outputs.includes(n)) aliases.set(pin, `${MERGED_INST}.${wire.get(n)}_d`);

  // la netlist: la línea X nueva donde estaba la primera, sin las otras ni las R de gmin de los nodos que ya no están
  const gone = new Set([...wire.keys()].filter((n) => !isPort.has(n) && n !== '0'));
  const out = lines.flatMap((l, i) => {
    if (i === insts[0].line) return [MERGED_LINE];
    if (merged.has(i)) return [];
    const r = /^\s*r__float\d+\s+(\S+)/i.exec(l);
    return r && gone.has(r[1].toLowerCase()) ? [] : [l];
  });
  return { netlist: out.join('\n'), verilog, top: MERGED_TOP, ports, electrical: insts[0].electrical, aliases, instances: insts.map((x) => x.name) };
}

/** La línea X del bloque nuevo, con los nodos en el orden de los pines de su .subckt */
export function mergedLine(m: CosimMerge, pins: { name: string }[]): string {
  return `${MERGED_INST} ${pins.map((p) => m.ports.get(p.name) ?? '0').join(' ')} ${m.top} ${m.electrical.join(' ')}`.trim();
}
