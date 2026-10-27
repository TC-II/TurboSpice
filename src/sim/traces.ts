// Trazas con nombres de LTspice (V(out), I(R1), Ic(Q1)) sobre los vectores de ngspice.
import { DIGITAL_TYPE, type SimPlot, type SimVector } from '../engine/ngspice.ts';
import type { Resolver, Wave } from '../waveform/expr.ts';
import { deviceVector, elementVector, netVector, type BuiltSimulation } from './schematicSim.ts';
import { blockInstances, hierDevice, scopeElement, scopeElementOf, scopeNet, type InstScope } from './context.ts';
import { deviceParams, deviceTraceName, parseDeviceVector } from './deviceParams.ts';
import { busRange, joinBits } from '../waveform/digital.ts';

/** Parámetro de dispositivo de ngspice para Ic, Ib, Id… */
const TERMINAL: Record<string, string> = { ic: 'ic', ib: 'ib', ie: 'ie', id: 'id', ig: 'ig', is: 'is' };

function findVector(plot: SimPlot, name: string): SimVector | undefined {
  const n = name.toLowerCase();
  return plot.vectors.find((v) => v.name.toLowerCase() === n);
}

/** Nodo digital de XSPICE (#209) por nombre */
function findDigital(plot: SimPlot, name: string): SimVector | undefined {
  const n = name.toLowerCase();
  return plot.vectors.find((v) => v.type === DIGITAL_TYPE && v.name.toLowerCase() === n);
}

const wave = (v: SimVector | undefined): Wave | null => (v ? { re: v.real, ...(v.imag ? { im: v.imag } : {}) } : null);

/**
 * Resolver de referencias V()/I() de una expresión sobre un plot. `runs`: las corridas de .step
 * del mismo análisis, para "V(out)@2".
 */
export function traceResolver(sim: BuiltSimulation | null, plot: SimPlot, runs: SimPlot[] = [plot]): Resolver {
  const here = resolverOn(sim, plot);
  const byRun = runs.map((p) => (p === plot ? here : resolverOn(sim, p)));
  return (fn, args, run) => (run === undefined ? here(fn, args) : (byRun[run - 1]?.(fn, args) ?? null));
}

function resolverOn(sim: BuiltSimulation | null, plot: SimPlot): Resolver {
  const node = (name: string): Wave | null => {
    if (name === '0') {
      const len = plot.vectors[0]?.real.length ?? 0;
      return { re: new Float64Array(len) };
    }
    // V(onoise)/V(inoise) de LTspice son los espectros de ruido de ngspice
    // (una red entre bloques Verilog que se simuló digital: su valor lógico, 0 o 1)
    return wave(findVector(plot, netVector(name)) ?? findVector(plot, name) ?? findVector(plot, `${name}_spectrum`) ?? findDigital(plot, netVector(name)));
  };
  const element = (name: string) => sim?.lt.elements.find((e) => e.name.toLowerCase() === name.toLowerCase() || e.name.replace(/§/g, '').toLowerCase() === name.toLowerCase());
  /** Nombre de ngspice de un dispositivo escrito en una traza ("Q1", "x_u1.q1") */
  const deviceNgName = (name: string): string | null => {
    const el = element(name);
    if (el && sim) return sim.ng.names.get(el.name)?.toLowerCase() ?? null;
    return name.includes('.') ? hierDevice(name) : name.toLowerCase();
  };
  return (fn, args) => {
    const f = fn.toLowerCase();
    // nodo digital (#209): Dig(q), con el mismo alcance de nombres que V(); Dig(x1.q[3:0]) es el bus
    // de los bits x1.q_3_d … x1.q_0_d
    if (f === 'dig') {
      const alias = (n: string) => sim?.digitalAliases?.get(n.toLowerCase());
      const one = (n: string) => findDigital(plot, netVector(n)) ?? findDigital(plot, n) ?? (alias(n) ? findDigital(plot, alias(n)!) : undefined);
      const bus = busRange(args[0]);
      if (!bus) return wave(one(args[0]));
      // (o los bits de un bus de nivel superior que se simuló digital: d[2] → d__2__)
      const bits = bus.bits.map((b) => one(`${bus.base}_${b}_d`) ?? one(`${bus.base}[${b}]`));
      return bits.every((b) => b) ? { re: joinBits(bits.map((b) => b!.real)) } : null;
    }
    if (f === 'v') {
      const a = node(args[0]);
      if (!a || args.length < 2) return a;
      const b = node(args[1]);
      if (!b) return null;
      const re = a.re.map((x, k) => x - b.re[k]);
      if (!a.im && !b.im) return { re };
      return { re, im: (a.im ?? new Float64Array(re.length)).map((x, k) => x - (b.im?.[k] ?? 0)) };
    }
    // parámetro de un dispositivo (#202): @Q1[gm] con el nombre del esquemático, @x_u1.q1[gm]
    // adentro de una instancia o el nombre de ngspice tal cual (@q.x_u1.q1[gm])
    if (f === '@') {
      const [name, param] = args;
      const devName = deviceNgName(name);
      return wave([devName, name.toLowerCase()].map((d) => d && findVector(plot, `@${d}[${param}]`)).find((x) => x) || undefined);
    }
    // adentro de una instancia (#199): I(x_u1.r1) → @r.x_u1.r1[i], Ic(x_u1.q1) → @q.x_u1.q1[ic]
    const dev = !element(args[0]) && args[0].includes('.') ? hierDevice(args[0]) : null;
    if (dev) {
      if (f === 'i') return wave([deviceVector(dev), `${dev}#branch`, `@${dev}[i]`].map((n) => n && findVector(plot, n)).find((x) => x) || undefined);
      const term = TERMINAL[f];
      return term ? wave(findVector(plot, `@${dev}[${term}]`)) : null;
    }
    // corrientes: I(V1) → v1#branch, I(R1) → @r1[i], Ic(Q1) → @q1[ic]…
    const el = element(args[0]);
    const ng = el && sim ? sim.ng.names.get(el.name)?.toLowerCase() : args[0].toLowerCase();
    if (f === 'i') {
      const vec = el && sim ? elementVector(sim, el.name) : null;
      return wave((vec ? findVector(plot, vec) : undefined) ?? findVector(plot, `${ng}#branch`) ?? findVector(plot, `@${ng}[i]`));
    }
    const term = TERMINAL[f];
    return term ? wave(findVector(plot, `@${ng}[${term}]`)) : null;
  };
}

/** Terminales de los componentes de varios pines, en el orden de SpiceOrder (D G S B, C B E) */
const PIN_TERMINALS: [RegExp, string[]][] = [
  [/^M/, ['d', 'g', 's', 'b']],
  [/^Q/, ['c', 'b', 'e']],
  [/^J/, ['d', 'g', 's']],
];

/** Terminal de ese pin (SpiceOrder) de un transistor: 'c', 'b', 'e', 'd', 'g', 's'… */
export const pinTerminal = (prefix: string, pin: number): string | undefined => PIN_TERMINALS.find(([re]) => re.test(prefix.toUpperCase()))?.[1][pin - 1];

/** ¿Componente de varios pines? (la corriente se mide en cada pin, no en el cuerpo) */
export const multiPinPrefix = (prefix: string) => PIN_TERMINALS.some(([re]) => re.test(prefix.toUpperCase()));

/**
 * Expresión que mide la punta de prueba: V(red), I(elemento), o la corriente del pin de un
 * transistor (`pin` = SpiceOrder: Id/Ig/Is/Ib del MOS, Ic/Ib/Ie del BJT)
 */
export function probeExpr(sim: BuiltSimulation, target: { net?: string; symbol?: number; pin?: number }, scope?: InstScope): string | null {
  if (target.net && target.net !== '0') {
    if (!scope) return `V(${target.net})`;
    const n = scopeNet(scope, target.net);
    return n === '0' ? null : `V(${n})`;
  }
  if (target.symbol === undefined) return null;
  const found = scope ? scopeElementOf(scope, target.symbol) : sim.lt.elements.find((e) => e.sym === target.symbol);
  const el = found && scope ? { ...found, name: scopeElement(scope, found.name) ?? '' } : found;
  if (!el?.name) return null;
  const p = el.prefix.toUpperCase();
  if (target.pin !== undefined) {
    const term = PIN_TERMINALS.find(([re]) => re.test(p))?.[1][target.pin - 1];
    return term ? `I${term}(${el.name})` : null;
  }
  // transistores: la corriente del terminal principal, como LTspice
  if (p === 'QN' || p === 'QP') return `Ic(${el.name})`;
  if (p === 'MN' || p === 'MP' || p === 'JN' || p === 'JP' || p === 'D') return `Id(${el.name})`;
  return `I(${el.name})`;
}

/**
 * Nodo digital de la salida de un bloque Verilog (#209) que maneja la red `net`, como lo nombra
 * ngspice ("x1.d_2_d"). En el .subckt generado cada pin de salida (o inout) sale de su nodo digital
 * por un puente: `ab_<pin> [<nodo>] [<pin>] hdl_dac` (o hdl_out / hdl_io, con el pin primero).
 * Con la red en una entrada del bloque, o sin bloque Verilog, null.
 */
export function verilogDigitalNode(sim: BuiltSimulation, net: string): string | null {
  const n = net.toLowerCase();
  for (const el of sim.lt.elements) {
    if (el.prefix.toUpperCase() !== 'X') continue;
    const k = el.nodes.findIndex((x) => x.toLowerCase() === n);
    if (k < 0) continue;
    const name = el.value.trim().split(/\s+/)[0];
    const sub = subcktOf(sim, name);
    const pin = sub?.pins[k];
    if (!sub || !pin) continue;
    const esc = pin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`^ab_${esc}\\s+\\[(\\S+)\\]\\s+\\[(\\S+)\\](?:\\s+null)?\\s+hdl_(dac|out|io)\\s*$`, 'im').exec(sub.body);
    const node = m && (m[1].toLowerCase() === pin.toLowerCase() ? m[2] : m[1]);
    const inst = sim.ng.names.get(el.name);
    if (node && inst) return `${inst.toLowerCase()}.${node.toLowerCase()}`;
  }
  return null;
}

/** Pines y cuerpo de un .subckt generado de un Verilog, buscado en los archivos de la simulación */
function subcktOf(sim: BuiltSimulation, name: string): { pins: string[]; body: string } | null {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\.subckt\\s+${esc}\\s+([^\\n]*)\\n([\\s\\S]*?)^\\.ends\\b`, 'im');
  for (const text of Object.values(sim.files ?? {})) {
    if (!/^\* Generated by TurboSpice from /m.test(text)) continue;
    const m = re.exec(text);
    if (m) return { pins: m[1].split(/\s+/).filter((p) => p && !p.includes('=')), body: m[2] };
  }
  return null;
}

/**
 * Lo que mide la punta de prueba en una red que sale de un bloque Verilog: su versión digital,
 * `Dig(x1.d_2_d)`; en un bus con todos sus bits del mismo puerto, el bus entero (`Dig(x1.d[2:0])`).
 * `bits`: las redes de lo que se clickeó (una sola, o los bits de un cable de bus). null si alguna
 * no sale de un bloque Verilog.
 */
export function digitalProbeExpr(sim: BuiltSimulation, bits: string[], bus?: string): string | null {
  // una red entre bloques que se simuló digital (digitalLinks.ts) es un nodo de eventos con su nombre
  const linked = (b: string) => sim.digitalNets?.has(netVector(b));
  if (bits.length && bits.every(linked)) {
    if (bits.length === 1) return `Dig(${bits[0]})`;
    return bus && busRange(bus) ? `Dig(${bus})` : null;
  }
  const nodes = bits.map((b) => verilogDigitalNode(sim, b));
  if (!nodes.length || nodes.some((x) => !x)) return null;
  if (nodes.length === 1) return `Dig(${nodes[0]})`;
  // d_2_d, d_1_d, d_0_d de la misma instancia → Dig(x1.d[2:0]) (busRange los vuelve a armar así)
  const parts = nodes.map((x) => /^(.+)_(\d+)_d$/.exec(x!));
  const [first] = parts;
  const idx = parts.map((p) => (p ? Number(p[2]) : NaN));
  const step = Math.sign(idx[idx.length - 1] - idx[0]);
  if (first && parts.every((p) => p?.[1] === first[1]) && step && idx.every((x, i) => x === idx[0] + i * step)) return `Dig(${first[1]}[${idx[0]}:${idx[idx.length - 1]}])`;
  return null;
}

/** Expresión con nombre de LTspice para un vector de ngspice ("out" → "V(out)") */
export function vectorExpr(v: SimVector): string {
  const br = /^(.*)#branch$/i.exec(v.name);
  if (br) return `I(${br[1].toUpperCase()})`;
  const dev = parseDeviceVector(v.name);
  if (dev) return deviceTraceName(dev.device, dev.param);
  if (v.type === DIGITAL_TYPE) return `Dig(${v.name})`;
  return v.type === 3 && !/[(@#]/.test(v.name) ? `V(${v.name})` : v.name;
}

/**
 * Parámetros de salida de cada dispositivo de la simulación, para elegirlos en la caja de trazas
 * (#202): nombre de traza ("@Q1[gm]", "@X_U1.Q1[gm]") → descripción con su unidad
 */
export function deviceParamTraces(sim: BuiltSimulation): Map<string, string> {
  const out = new Map<string, string>();
  const add = (name: string, letter: string) => {
    for (const p of deviceParams(letter)) {
      const tr = deviceTraceName(name, p.name);
      // las corrientes ya están como I(R1), Ic(Q1)… (savecurrents)
      if (!tr.startsWith('@')) continue;
      out.set(tr, `${name.toUpperCase()}: ${p.label}${p.unit ? ` (${p.unit})` : ''}`);
    }
  };
  for (const e of sim.lt.elements) add(e.name.replace(/§/g, ''), e.prefix);
  for (const b of blockInstances(sim)) {
    for (const e of b.block.lt.elements) {
      const ng = b.names.get(e.name);
      if (ng) add(`${b.prefix}${ng}`, e.prefix);
    }
  }
  return out;
}
