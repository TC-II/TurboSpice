// Cliente del Worker de Yosys (#209): una síntesis por vez, en orden.
import type { SynthResult } from './yosys.ts';
import type { YosysRequest, YosysResponse } from './yosysWorker.ts';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve(r: SynthResult): void; reject(e: Error): void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./yosysWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<YosysResponse>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if ('result' in e.data) p.resolve(e.data.result);
    else p.reject(new Error(e.data.failure));
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'Yosys'));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

type NoId<T> = T extends unknown ? Omit<T, 'id'> : never;
const request = (req: NoId<YosysRequest>): Promise<SynthResult> => {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...req, id } as YosysRequest);
  });
};

/** Sintetiza Verilog en el Worker (la primera vez baja Yosys) */
export const synthesizeVerilog = (files: Record<string, string>, source: string, top?: string, params?: Record<string, string>) =>
  request({ files, source, ...(top ? { top } : {}), ...(params ? { params } : {}) });

/** Compila el testbench de la tabla de verdad del módulo `top` (truthTable.ts) */
export const compileTruthTable = (files: Record<string, string>, top: string) => request({ kind: 'truthTable', files, top });

/** Compila un testbench con Icarus: el .vvp y la netlist que lo corre */
export const compileTestbench = (files: Record<string, string>, top: string) => request({ kind: 'testbench', files, top });

/** Compila Verilog de comportamiento con Icarus (la primera vez lo baja): .vvp y .subckt con d_cosim */
export const compileBehavioral = (files: Record<string, string>, source: string, top: string, vvpFile: string, params?: Record<string, string>) =>
  request({ kind: 'icarus', files, source, top, vvpFile, ...(params ? { params } : {}) });
