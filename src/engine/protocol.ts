import type { SimResult, SimulateOptions } from './ngspice.ts';

export type WorkerRequest =
  | { id: number; type: 'init' }
  | { id: number; type: 'simulate'; netlist: string; files?: Record<string, string | Uint8Array>; opts?: SimulateOptions };

export type WorkerResponse =
  | { id: number; type: 'ready' }
  | { id: number; type: 'result'; result: SimResult; ms: number }
  | { id: number; type: 'error'; message: string }
  | { type: 'status'; status: string; percent: number };
