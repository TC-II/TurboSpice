import { t } from '../i18n/i18n.ts';
import { electricalLine, ELECTRICAL_NAMES } from './electrical.ts';
// Verilog sintetizable → subcircuito de ngspice con primitivas digitales de XSPICE (#209).
//
// Yosys (en WebAssembly, ver yosys.ts) sintetiza el módulo a compuertas sueltas, flip-flops y
// buffers tri-state con yosysScript; acá se traduce su netlist JSON a un .subckt:
//  - cada bit de un puerto es un pin analógico del subcircuito ("q_3" para q[3]) unido a su nodo
//    digital interno por un bidi_bridge: de entrada (umbrales vil/vih), de salida (niveles
//    vol/voh, corriente máxima iol/ioh, rampas tr/tf; con Z no maneja) o en los dos sentidos
//    (inout). La interfaz eléctrica son parámetros del .subckt, ver electrical.ts;
//  - $_AND_, $_OR_… → d_and, d_or… con retardo tpd; $_DFF_* → d_dff; $_DLATCH_* → d_dlatch, con
//    el valor inicial ("initial" o reg q = 1) como ic; $_TBUF_ → d_tristate;
//  - las constantes salen de un d_pullup / d_pulldown (y Z, de un d_tristate deshabilitado).
// Los parameter de Verilog del módulo de más arriba también son parámetros del .subckt (sin
// efecto): con otro valor, la instancia usa otra síntesis del módulo (ver variants.ts).

/** Script de Yosys: compuertas de dos entradas, buffers tri-state y los flip-flops que tiene XSPICE */
export function yosysScript(files: string[], top?: string, params: Record<string, string> = {}): string {
  const ff = ['$_DFF_P_', '$_DFF_PP0_', '$_DFF_PP1_', '$_DFFSR_PPP_', '$_DLATCH_P_', '$_DLATCH_PP0_', '$_DLATCH_PP1_', '$_DLATCHSR_PPP_'];
  const chparam = Object.entries(params)
    .map(([k, v]) => ` -chparam ${k} ${v}`)
    .join('');
  return [
    `read_verilog -sv ${files.map((f) => `"${f}"`).join(' ')}`,
    `hierarchy -check ${top ? `-top ${top}` : '-auto-top'}${chparam}`,
    // (proc y tribuf antes de synth: si no, los «? : 1'bz» se pierden y no queda el tri-state)
    'proc',
    'tribuf',
    'synth -flatten',
    `dfflegalize ${ff.map((c) => `-cell ${c} 01`).join(' ')}`,
    'abc -g AND,NAND,OR,NOR,XOR,XNOR',
    'setundef -undriven -zero',
    'opt_clean -purge',
    'write_json out.json',
  ].join('; ');
}

type Bit = number | '0' | '1' | 'x' | 'z';

interface YosysCell {
  type: string;
  connections: Record<string, Bit[]>;
}

interface YosysModule {
  attributes?: Record<string, string>;
  parameter_default_values?: Record<string, string>;
  ports: Record<string, { direction: 'input' | 'output' | 'inout'; bits: Bit[] }>;
  cells: Record<string, YosysCell>;
  netnames: Record<string, { bits: Bit[]; hide_name: number; attributes?: Record<string, string> }>;
}

export interface YosysJson {
  modules: Record<string, YosysModule>;
}

export type PinDir = 'in' | 'out' | 'inout';

export interface HdlBlock {
  /** nombre del módulo (y del .subckt) */
  name: string;
  /** pines del subcircuito en orden: entradas, inout y salidas */
  pins: { name: string; dir: PinDir }[];
  /** texto del .subckt */
  subckt: string;
  /** parameter de Verilog del módulo con su valor por omisión ("8", "3", "\"abc\"") */
  params: Record<string, string>;
  warnings: string[];
}

export class HdlError extends Error {}

const GATES: Record<string, string> = {
  $_NOT_: 'd_inverter',
  $_BUF_: 'd_buffer',
  $_AND_: 'd_and',
  $_NAND_: 'd_nand',
  $_OR_: 'd_or',
  $_NOR_: 'd_nor',
  $_XOR_: 'd_xor',
  $_XNOR_: 'd_xnor',
};

/** Identificador de Verilog (también \escapado) → nombre de nodo válido en ngspice */
const ident = (s: string) => s.replace(/^\\/, '').toLowerCase().replace(/[^a-z0-9_]/g, '_');

/** Módulo de más arriba: el que tiene el atributo top (hierarchy) o el único que hay */
function topModule(json: YosysJson): [string, YosysModule] {
  const mods = Object.entries(json.modules);
  const top = mods.find(([, m]) => m.attributes?.top) ?? (mods.length === 1 ? mods[0] : undefined);
  if (!top) throw new HdlError(t('No top module found'));
  return top;
}

/** Valor de un parameter como lo escribe Yosys: bits ("00000011" → 3; 32 bits con signo) o un texto */
function paramValue(v: string): string {
  if (!/^[01]+$/.test(v)) return JSON.stringify(v);
  const n = parseInt(v, 2);
  return String(v.length === 32 && v[0] === '1' ? n - 2 ** 32 : n);
}

export function yosysToSubckt(json: YosysJson, source: string): HdlBlock {
  const [modName, mod] = topModule(json);
  const name = ident(modName);
  const warnings: string[] = [];
  const pins: { name: string; dir: PinDir; bit: Bit }[] = [];
  /** bit → nodo digital */
  const node = new Map<number, string>();
  const used = new Set<string>();
  const unique = (base: string) => {
    let n = base;
    for (let i = 2; used.has(n); i++) n = `${base}_${i}`;
    used.add(n);
    return n;
  };

  // puertos: un pin por bit, del más significativo al menos (como d_cosim); entradas, inout y salidas
  const DIR: Record<string, PinDir> = { input: 'in', inout: 'inout', output: 'out' };
  for (const dir of ['input', 'inout', 'output'] as const) {
    for (const [pname, port] of Object.entries(mod.ports)) {
      if (port.direction !== dir) continue;
      const base = ident(pname);
      // Yosys da los bits del menos significativo al más
      const bits = [...port.bits].reverse();
      bits.forEach((bit, k) => {
        const pin = unique(bits.length > 1 ? `${base}_${bits.length - 1 - k}` : base);
        pins.push({ name: pin, dir: DIR[dir], bit });
        if (typeof bit === 'number' && !node.has(bit)) node.set(bit, unique(`${pin}_d`));
      });
    }
  }
  if (!pins.some((p) => p.dir !== 'in')) throw new HdlError(t('Module {name} has no outputs', { name: modName }));

  // nombres de los cables con nombre (reg q…) para los nodos internos: se ven como Dig(x1.q_3_d)
  for (const [wname, w] of Object.entries(mod.netnames)) {
    if (w.hide_name) continue;
    const base = ident(wname);
    w.bits.forEach((bit, i) => {
      if (typeof bit === 'number' && !node.has(bit)) node.set(bit, unique(w.bits.length > 1 ? `${base}_${i}_d` : `${base}_d`));
    });
  }
  // valores iniciales (atributo init de los cables: "1010", el bit 0 a la derecha)
  const init = new Map<number, string>();
  for (const w of Object.values(mod.netnames)) {
    const v = w.attributes?.init;
    if (!v || !/^[01xz]+$/i.test(v)) continue;
    w.bits.forEach((bit, i) => {
      const c = v[v.length - 1 - i];
      if (typeof bit === 'number' && (c === '0' || c === '1')) init.set(bit, c);
    });
  }

  const consts = new Set<'hi' | 'lo' | 'z'>();
  const nodeOf = (bit: Bit): string => {
    if (typeof bit !== 'number') {
      const c = bit === '1' ? 'hi' : bit === 'z' ? 'z' : 'lo';
      consts.add(c);
      if (c === 'z') consts.add('lo');
      return `hdl_${c}`;
    }
    let n = node.get(bit);
    if (!n) node.set(bit, (n = unique(`n${bit}`)));
    return n;
  };
  const one = (c: YosysCell, pin: string) => {
    const b = c.connections[pin];
    if (!b || b.length !== 1) throw new HdlError(t('Cell {type}: pin {pin} not found', { type: c.type, pin }));
    return nodeOf(b[0]);
  };

  const lines: string[] = [];
  /** nodos que maneja un buffer tri-state (pueden quedar en Z) */
  const tbufOut = new Set<string>();
  let k = 0;
  for (const c of Object.values(mod.cells)) {
    k++;
    const gate = GATES[c.type];
    if (gate) {
      const ins = c.type === '$_NOT_' || c.type === '$_BUF_' ? one(c, 'A') : `[${one(c, 'A')} ${one(c, 'B')}]`;
      lines.push(`ag${k} ${ins} ${one(c, 'Y')} hdl_${gate.slice(2)}`);
      continue;
    }
    if (c.type === '$_TBUF_') {
      lines.push(`at${k} ${one(c, 'A')} ${one(c, 'E')} ${one(c, 'Y')} hdl_tbuf`);
      tbufOut.add(one(c, 'Y'));
      continue;
    }
    // flip-flops y latches: $_DFF_P_ (C D Q), $_DFF_PP0_ (C D R Q: reset a 0), $_DFF_PP1_ (a 1),
    // $_DFFSR_PPP_ (C S R D Q) y los $_DLATCH_* con E en lugar de C
    const m = /^\$_(DFF|DLATCH)(SR)?_P(P([01])|PP)?_$/.exec(c.type);
    if (!m) throw new HdlError(t('Unsupported cell {type}', { type: c.type }));
    const has = (p: string) => (c.connections[p] ? one(c, p) : 'null');
    const r = m[2] ? has('R') : m[4] === '0' ? has('R') : 'null';
    const s = m[2] ? has('S') : m[4] === '1' ? has('R') : 'null';
    const q = c.connections.Q[0];
    const ic = typeof q === 'number' ? (init.get(q) ?? '0') : '0';
    if (m[1] === 'DFF') lines.push(`af${k} ${one(c, 'D')} ${one(c, 'C')} ${s} ${r} ${one(c, 'Q')} null hdl_dff${ic}`);
    // (d_dlatch no acepta null en la salida negada)
    else lines.push(`al${k} ${one(c, 'D')} ${one(c, 'E')} ${s} ${r} ${one(c, 'Q')} ${unique(`nq${k}`)} hdl_dlatch${ic}`);
  }

  // cada pin con su nodo digital (las salidas pueden salir de una constante). El puerto digital de
  // un bidi_bridge es bidireccional: si dos comparten un nodo (una salida que lee un inout, o un
  // nodo que también usa la lógica) se pelean. Cada salida tiene entonces su propio nodo, detrás de
  // un d_buffer; menos las que sólo maneja un buffer tri-state, que tienen que ver la Z
  const inoutNodes = new Set(pins.filter((p) => p.dir === 'inout').map((p) => nodeOf(p.bit)));
  const bridges = pins.flatMap(({ name: pin, dir, bit }) => {
    if (dir === 'out' && bit === 'x') warnings.push(t('Output {pin} is undefined: it will be at 0', { pin }));
    const n = nodeOf(bit);
    // (una fuga de 1 GΩ: una salida sin carga, o en Z, no deja la matriz singular en el punto de operación)
    const leak = `rleak_${pin} ${pin} 0 1g`;
    if (dir === 'in') return [`ab_${pin} [${pin}] [${n}] null hdl_in`];
    if (dir === 'inout') return [`ab_${pin} [${pin}] [${n}] null hdl_io`, leak];
    if (tbufOut.has(n) && !inoutNodes.has(n) && pins.filter((p) => p.dir === 'out' && nodeOf(p.bit) === n).length === 1) return [`ab_${pin} [${pin}] [${n}] null hdl_out`, leak];
    const own = unique(`${pin}_o`);
    return [`aob_${pin} ${n} ${own} hdl_obuf`, `ab_${pin} [${pin}] [${own}] null hdl_out`, leak];
  });
  if (consts.has('hi')) lines.push('ahi hdl_hi hdl_pullup');
  if (consts.has('lo')) lines.push('alo hdl_lo hdl_pulldown');
  if (consts.has('z')) lines.push('az hdl_lo hdl_lo hdl_z hdl_tbuf');

  // sólo los modelos que se usan
  const all = [
    // (el bidi_bridge de entrada no agrega retardo: el de cada compuerta ya es tpd. En un inout,
    // lo que lee del pin entra con fuerza resistiva: si el buffer tri-state del módulo maneja, gana él)
    '.model hdl_in bidi_bridge(direction=1 in_low={vil} in_high={vih} rise_delay=1e-12 fall_delay=1e-12)',
    '.model hdl_out bidi_bridge(direction=0 out_low={vol} out_high={voh} drive_low={iol} drive_high={ioh} t_rise={tr} t_fall={tf})',
    '.model hdl_io bidi_bridge(direction=2 strength=1 in_low={vil} in_high={vih} out_low={vol} out_high={voh} drive_low={iol} drive_high={ioh} t_rise={tr} t_fall={tf} rise_delay=1e-12 fall_delay=1e-12)',
    '.model hdl_tbuf d_tristate(delay={tpd})',
    '.model hdl_obuf d_buffer(rise_delay=1e-12 fall_delay=1e-12)',
    ...Object.values(GATES).map((g) => `.model hdl_${g.slice(2)} ${g}(rise_delay={tpd} fall_delay={tpd})`),
    ...['0', '1'].map((ic) => `.model hdl_dff${ic} d_dff(clk_delay={tpd} set_delay={tpd} reset_delay={tpd} ic=${ic})`),
    ...['0', '1'].map((ic) => `.model hdl_dlatch${ic} d_dlatch(data_delay={tpd} enable_delay={tpd} set_delay={tpd} reset_delay={tpd} ic=${ic})`),
    '.model hdl_pullup d_pullup',
    '.model hdl_pulldown d_pulldown',
  ];
  const body = [...bridges, ...lines];
  const usedModels = new Set(body.map((l) => l.split(/\s+/).pop()));
  const models = all.filter((m) => usedModels.has(m.split(/\s+/)[1]));

  const params: Record<string, string> = {};
  for (const [p, v] of Object.entries(mod.parameter_default_values ?? {})) params[p] = paramValue(v);
  // (los parameter también van al .subckt, sin efecto, para que la línea X los pueda llevar)
  const vparams = Object.entries(params)
    .filter(([p]) => !ELECTRICAL_NAMES.has(p.toLowerCase()) && /^-?\d+$/.test(params[p]))
    .map(([p, v]) => `${p.toLowerCase()}=${v}`);
  const subckt = [
    // (sin traducir: marca de qué Verilog salió)
    `* Generated by TurboSpice from ${source} (Yosys): edit the Verilog, not this file`,
    `.subckt ${name} ${pins.map((p) => p.name).join(' ')} ${[electricalLine(), ...vparams].join(' ')}`,
    ...body,
    ...models,
    `.ends ${name}`,
    '',
  ].join('\n');
  return { name, pins: pins.map(({ name: n, dir }) => ({ name: n, dir })), subckt, params, warnings };
}

/**
 * Bloque de comportamiento (#209): el .vvp de Icarus corre dentro de ngspice en un d_cosim (con el
 * puente ivlng y libvvp que escribe ngspice.ts en /usr/local/lib/ngspice). Los pines y su interfaz
 * eléctrica son los mismos que en un bloque sintetizado; d_cosim toma los bits de entrada, salida
 * e inout en ese orden, cada puerto del bit más significativo al menos.
 */
export function cosimSubckt(
  module: string,
  ports: { name: string; dir: PinDir; bits: number }[],
  params: Record<string, string>,
  vvpFile: string,
  source: string,
): HdlBlock {
  const name = ident(module);
  const used = new Set<string>();
  const unique = (base: string) => {
    let n = base;
    for (let i = 2; used.has(n); i++) n = `${base}_${i}`;
    used.add(n);
    return n;
  };
  const pins: { name: string; dir: PinDir; node: string }[] = [];
  for (const dir of ['in', 'inout', 'out'] as const) {
    for (const p of ports.filter((x) => x.dir === dir)) {
      const base = ident(p.name);
      for (let k = p.bits - 1; k >= 0; k--) {
        const pin = unique(p.bits > 1 ? `${base}_${k}` : base);
        pins.push({ name: pin, dir, node: unique(`${pin}_d`) });
      }
    }
  }
  if (!pins.some((p) => p.dir !== 'in')) throw new HdlError(t('Module {name} has no outputs', { name: module }));
  const group = (dir: PinDir) => {
    const list = pins.filter((p) => p.dir === dir).map((p) => p.node);
    return list.length ? `[${list.join(' ')}]` : 'null';
  };
  const lines = pins.flatMap(({ name: pin, dir, node }) => {
    const leak = `rleak_${pin} ${pin} 0 1g`;
    if (dir === 'in') return [`ab_${pin} [${pin}] [${node}] null hdl_in`];
    return [`ab_${pin} [${pin}] [${node}] null ${dir === 'out' ? 'hdl_out' : 'hdl_io'}`, leak];
  });
  lines.push(`acosim ${group('in')} ${group('out')} ${group('inout')} hdl_cosim`);
  const lib = '/usr/local/lib/ngspice';
  const models = [
    '.model hdl_in bidi_bridge(direction=1 in_low={vil} in_high={vih} rise_delay=1e-12 fall_delay=1e-12)',
    ...(pins.some((p) => p.dir === 'out') ? ['.model hdl_out bidi_bridge(direction=0 out_low={vol} out_high={voh} drive_low={iol} drive_high={ioh} t_rise={tr} t_fall={tf})'] : []),
    ...(pins.some((p) => p.dir === 'inout')
      ? ['.model hdl_io bidi_bridge(direction=2 strength=1 in_low={vil} in_high={vih} out_low={vol} out_high={voh} drive_low={iol} drive_high={ioh} t_rise={tr} t_fall={tf} rise_delay=1e-12 fall_delay=1e-12)']
      : []),
    // (ngspice pasa a minúsculas los textos de los parámetros: las rutas van en minúsculas)
    `.model hdl_cosim d_cosim(simulation="${lib}/ivlng.so" sim_args=["${vvpFile.toLowerCase()}"] lib_args=["${lib}/libvvp.so" "${lib}/ivlng"] delay={tpd})`,
  ];
  const vparams = Object.entries(params)
    .filter(([p, v]) => !ELECTRICAL_NAMES.has(p.toLowerCase()) && /^-?\d+$/.test(v))
    .map(([p, v]) => `${p.toLowerCase()}=${v}`);
  const subckt = [
    `* Generated by TurboSpice from ${source} (Icarus Verilog): edit the Verilog, not this file`,
    `.subckt ${name} ${pins.map((p) => p.name).join(' ')} ${[electricalLine(), ...vparams].join(' ')}`,
    ...lines,
    ...models,
    `.ends ${name}`,
    '',
  ].join('\n');
  return { name, pins: pins.map(({ name: n, dir }) => ({ name: n, dir })), subckt, params, warnings: [] };
}
