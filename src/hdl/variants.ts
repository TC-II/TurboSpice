// parameter de Verilog por instancia (#209): un parameter cambia el circuito sintetizado (el ancho
// de un bus, cuántos flip-flops…), así que no puede ser un parámetro del .subckt. Las instancias
// con otro valor usan otra síntesis del módulo (Yosys con chparam) con su propio nombre; acá se
// cambian sus líneas X en la netlist y se juntan las síntesis que hacen falta.
import { t } from '../i18n/i18n.ts';

export interface VariantModule {
  /** nombre del módulo (en minúsculas, como en la netlist) */
  name: string;
  /** parameter de Verilog y su valor por omisión */
  params: Record<string, string>;
}

export interface VariantNeed {
  module: string;
  /** los parameter que cambian (nombre como en el Verilog) */
  params: Record<string, string>;
  /** nombre del .subckt de esta variante */
  name: string;
}

const variantName = (module: string, params: Record<string, string>) =>
  `${module}__${Object.entries(params)
    .map(([k, v]) => `${k}${v}`)
    .join('_')
    .toLowerCase()
    .replace(/-/g, 'm')
    .replace(/[^a-z0-9_]/g, '')}`;

/**
 * Cambia el modelo de las líneas X con algún parameter distinto del de por omisión por el de su
 * variante. Sólo valen números enteros: una expresión o un parámetro del circuito no se puede
 * conocer antes de sintetizar (se avisa y queda el valor por omisión).
 */
export function applyVariants(netlist: string, modules: VariantModule[]): { netlist: string; needs: VariantNeed[]; warnings: string[] } {
  const byName = new Map(modules.filter((m) => Object.keys(m.params).length).map((m) => [m.name.toLowerCase(), m]));
  const needs = new Map<string, VariantNeed>();
  const warnings: string[] = [];
  if (!byName.size) return { netlist, needs: [], warnings };
  const lines = netlist.split('\n').map((line) => {
    if (!/^\s*x/i.test(line)) return line;
    const tokens = line.trim().split(/\s+/);
    const at = tokens.findIndex((tok, i) => i > 0 && byName.has(tok.toLowerCase()) && (i === tokens.length - 1 || /=|^params:$/i.test(tokens[i + 1])));
    if (at < 0) return line;
    const mod = byName.get(tokens[at].toLowerCase())!;
    const given = new Map<string, string>();
    for (const m of tokens
      .slice(at + 1)
      .join(' ')
      .matchAll(/([A-Za-z_][\w$]*)\s*=\s*(\{[^{}]*\}|\S+)/g))
      given.set(m[1].toLowerCase(), m[2]);
    const changed: Record<string, string> = {};
    for (const [p, def] of Object.entries(mod.params)) {
      const v = given.get(p.toLowerCase());
      if (v === undefined) continue;
      if (!/^-?\d+$/.test(v)) {
        warnings.push(t('{inst}: the parameter {p} of {module} must be an integer ({v}): the default value is used', { inst: tokens[0], p, module: mod.name, v }));
        continue;
      }
      if (Number(v) !== Number(def)) changed[p] = v;
    }
    if (!Object.keys(changed).length) return line;
    const name = variantName(mod.name, changed);
    needs.set(name, { module: mod.name, params: changed, name });
    tokens[at] = name;
    return tokens.join(' ');
  });
  return { netlist: lines.join('\n'), needs: [...needs.values()], warnings };
}

/** El .subckt de una variante: el sintetizado con chparam, con el nombre de la variante */
export const renameSubckt = (subckt: string, from: string, to: string) =>
  subckt.replace(new RegExp(`^(\\s*\\.subckt\\s+)${from}\\b`, 'im'), `$1${to}`).replace(new RegExp(`^(\\s*\\.ends\\s+)${from}\\b`, 'im'), `$1${to}`);

/** Agrega los .subckt de las variantes a la netlist (antes de .end) */
export function withSubckts(netlist: string, subckts: string[]): string {
  if (!subckts.length) return netlist;
  const i = netlist.search(/^\s*\.end\s*$/im);
  const add = subckts.map((x) => x.replace(/\n*$/, '\n')).join('');
  return i < 0 ? `${netlist}\n${add}` : `${netlist.slice(0, i)}${add}${netlist.slice(i)}`;
}
