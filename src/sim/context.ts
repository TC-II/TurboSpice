// Valores en contexto (#199): adentro de una instancia de un subcircuito del proyecto, los
// vectores de ngspice llevan el camino de la instancia. Las tensiones son "x_u1.red" y los
// dispositivos "r.x_u1.r1" (@r.x_u1.r1[i], v.x_u1.v1#branch…), como en
// docs/ngspice/md/02-circuit-description.md (subcircuitos).
import type { Block, Element } from '../netlist/ltnetlist.ts';
import { ngNodeName } from '../netlist/tongspice.ts';
import type { BuiltSimulation } from './schematicSim.ts';

export interface InstScope {
  /** prefijo de los vectores de la instancia ("x_u1.", "x_u1.x_u2.") */
  prefix: string;
  /** puerto del subcircuito (minúsculas) → red del nivel de arriba, ya con su prefijo */
  ports: Map<string, string>;
  /** el subcircuito tal como se simuló */
  block: Block;
  /** nombre LTspice → nombre ngspice de los elementos de adentro */
  names: Map<string, string>;
}

/** Ámbito de la instancia `prefix` del subcircuito `sub` en una simulación, o null si no se simuló */
export function instScope(sim: BuiltSimulation, sub: string, prefix: string, ports: Map<string, string>): InstScope | null {
  const block = sim.lt.blocks.find((b) => b.name.toLowerCase() === sub.toLowerCase());
  const names = sim.ng.blockNames?.get(sub.toLowerCase());
  if (!block || !names || !prefix) return null;
  return { prefix, ports, block, names };
}

/** Red de la instancia con su nombre en la netlist del testbench */
export function scopeNet(sc: InstScope, net: string): string {
  if (net === '0') return '0';
  return sc.ports.get(net.toLowerCase()) ?? `${sc.prefix}${ngNodeName(net)}`;
}

/** Nombre de un elemento de adentro tal como se escribe en una traza ("x_u1.r1") */
export function scopeElement(sc: InstScope, ltName: string): string | undefined {
  const ng = sc.names.get(ltName);
  return ng ? `${sc.prefix}${ng}`.toLowerCase() : undefined;
}

/** Nombre del dispositivo en los vectores de ngspice: "x_u1.r1" → "r.x_u1.r1" */
export function hierDevice(name: string): string | null {
  const i = name.lastIndexOf('.');
  if (i <= 0 || i === name.length - 1) return null;
  return `${name[i + 1]}.${name}`.toLowerCase();
}

/** El elemento del símbolo `sym` adentro del subcircuito */
export const scopeElementOf = (sc: InstScope, sym: number): Element | undefined => sc.block.lt.elements.find((e) => e.sym === sym);

/**
 * Instancias de los bloques jerárquicos en toda la jerarquía: prefijo de sus vectores y bloque.
 * Para pedir los parámetros de punto de operación de los dispositivos de adentro.
 */
export function blockInstances(sim: BuiltSimulation): { prefix: string; block: Block; names: Map<string, string> }[] {
  const out: { prefix: string; block: Block; names: Map<string, string> }[] = [];
  const walk = (elements: Element[], names: Map<string, string>, prefix: string, depth: number) => {
    if (depth > 20) return;
    for (const e of elements) {
      if (e.prefix.toUpperCase() !== 'X') continue;
      const sub = e.value.trim().split(/\s+/)[0]?.toLowerCase();
      const block = sim.lt.blocks.find((b) => b.name.toLowerCase() === sub);
      const inner = block && sim.ng.blockNames?.get(block.name.toLowerCase());
      const ng = names.get(e.name);
      if (!block || !inner || !ng) continue;
      const p = `${prefix}${ng.toLowerCase()}.`;
      out.push({ prefix: p, block, names: inner });
      walk(block.lt.elements, inner, p, depth + 1);
    }
  };
  walk(sim.lt.elements, sim.ng.names, '', 0);
  return out;
}
