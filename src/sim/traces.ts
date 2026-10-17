// Trazas con nombres de LTspice (V(out), I(R1), Ic(Q1)) sobre los vectores de ngspice.
import type { SimPlot, SimVector } from '../engine/ngspice.ts';
import type { Resolver, Wave } from '../waveform/expr.ts';
import { elementVector, netVector, type BuiltSimulation } from './schematicSim.ts';

/** Parámetro de dispositivo de ngspice para Ic, Ib, Id… */
const TERMINAL: Record<string, string> = { ic: 'ic', ib: 'ib', ie: 'ie', id: 'id', ig: 'ig', is: 'is' };

function findVector(plot: SimPlot, name: string): SimVector | undefined {
  const n = name.toLowerCase();
  return plot.vectors.find((v) => v.name.toLowerCase() === n);
}

const wave = (v: SimVector | undefined): Wave | null => (v ? { re: v.real, ...(v.imag ? { im: v.imag } : {}) } : null);

/** Resolver de referencias V()/I() de una expresión sobre un plot */
export function traceResolver(sim: BuiltSimulation | null, plot: SimPlot): Resolver {
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
    // corrientes: I(V1) → v1#branch, I(R1) → @r1[i], Ic(Q1) → @q1[ic]…
    const el = element(args[0]);
    const ng = el && sim ? sim.ng.names.get(el.name)?.toLowerCase() : args[0].toLowerCase();
    if (f === 'i') {
      const vec = el && sim ? elementVector(sim, el.name) : null;
      return wave((vec ? findVector(plot, vec) : undefined) ?? findVector(plot, `${ng}#branch`) ?? findVector(plot, `@${ng}[i]`));
    }
    const term = TERMINAL[f.slice(1)];
    return term ? wave(findVector(plot, `@${ng}[${term}]`)) : null;
  };
}

/** Expresión que mide la punta de prueba: V(red) o I(elemento) */
export function probeExpr(sim: BuiltSimulation, target: { net?: string; symbol?: number }): string | null {
  if (target.net && target.net !== '0') return `V(${target.net})`;
  if (target.symbol === undefined) return null;
  const el = sim.lt.elements.find((e) => e.sym === target.symbol);
  if (!el) return null;
  const p = el.prefix.toUpperCase();
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
