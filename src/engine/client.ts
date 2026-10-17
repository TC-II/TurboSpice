// API del motor para la UI: promesas sobre el Worker de ngspice.
import type { SimResult } from './ngspice.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

export interface SimOutcome {
  result: SimResult;
  ms: number;
}

interface Pending {
  resolve: (v: SimOutcome | void) => void;
  reject: (e: Error) => void;
}

type Req = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

export class EngineClient {
  onOutput?: (line: string) => void;
  onStatus?: (status: string, percent: number) => void;

  private worker!: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  ready!: Promise<void>;

  constructor() {
    this.spawn();
  }

  private spawn(): void {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      if (msg.type === 'output') return this.onOutput?.(msg.line);
      if (msg.type === 'status') return this.onStatus?.(msg.status, msg.percent);
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.type === 'error') p.reject(new Error(msg.message));
      else if (msg.type === 'result') p.resolve({ result: msg.result, ms: msg.ms });
      else p.resolve();
    };
    this.worker.onerror = (ev) => {
      const err = new Error(ev.message || 'Error en el Worker del motor');
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
    this.ready = this.request({ type: 'init' }) as Promise<void>;
  }

  private request(req: Req): Promise<SimOutcome | void> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  async simulate(netlist: string, files?: Record<string, string | Uint8Array>): Promise<SimOutcome> {
    await this.ready;
    return this.request({ type: 'simulate', netlist, files }) as Promise<SimOutcome>;
  }

  /** Corta la simulación en curso: termina el Worker y levanta uno nuevo. */
  abort(): void {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new Error('Simulación abortada'));
    this.pending.clear();
    this.spawn();
  }
}
