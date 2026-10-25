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
    return wave(findVector(plot, netVector(name)) ?? findVector(plot, name) ?? findVector(plot, `${name}_spectrum`));
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
      const one = (n: string) => findDigital(plot, netVector(n)) ?? findDigital(plot, n);
      const bus = busRange(args[0]);
      if (!bus) return wave(one(args[0]));
      const bits = bus.bits.map((b) => one(`${bus.base}_${b}_d`));
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
