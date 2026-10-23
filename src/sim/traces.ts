// Trazas con nombres de LTspice (V(out), I(R1), Ic(Q1)) sobre los vectores de ngspice.
import type { SimPlot, SimVector } from '../engine/ngspice.ts';
import type { Resolver, Wave } from '../waveform/expr.ts';
import { deviceVector, elementVector, netVector, type BuiltSimulation } from './schematicSim.ts';
import { hierDevice, scopeElement, scopeElementOf, scopeNet, type InstScope } from './context.ts';

/** Parámetro de dispositivo de ngspice para Ic, Ib, Id… */
const TERMINAL: Record<string, string> = { ic: 'ic', ib: 'ib', ie: 'ie', id: 'id', ig: 'ig', is: 'is' };

function findVector(plot: SimPlot, name: string): SimVector | undefined {
  const n = name.toLowerCase();
  return plot.vectors.find((v) => v.name.toLowerCase() === n);
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
  return (fn, args) => {
    const f = fn.toLowerCase();
    if (f === 'v') {
      const a = node(args[0]);
      if (!a || args.length < 2) return a;
      const b = node(args[1]);
      if (!b) return null;
      const re = a.re.map((x, k) => x - b.re[k]);
      if (!a.im && !b.im) return { re };
      return { re, im: (a.im ?? new Float64Array(re.length)).map((x, k) => x - (b.im?.[k] ?? 0)) };
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
  const dev = /^@([^[]+)\[(\w+)\]$/.exec(v.name);
  if (dev) return ['i', 'current'].includes(dev[2]) ? `I(${dev[1].toUpperCase()})` : `I${dev[2].slice(1)}(${dev[1].toUpperCase()})`;
  return v.type === 3 && !/[(@#]/.test(v.name) ? `V(${v.name})` : v.name;
}
