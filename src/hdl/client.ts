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

/** Sintetiza Verilog en el Worker (la primera vez baja Yosys) */
export function synthesizeVerilog(files: Record<string, string>, source: string, top?: string): Promise<SynthResult> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, files, source, top } satisfies YosysRequest);
  });
}
