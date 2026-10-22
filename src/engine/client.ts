// API del motor para la UI: promesas sobre el Worker de ngspice.
import { OUT_OF_MEMORY, OUT_OF_MEMORY_RE, type SimResult, type SimulateOptions } from './ngspice.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';
import { t } from '../i18n/i18n.ts';

export interface SimOutcome {
  result: SimResult;
  ms: number;
}

interface Pending {
  resolve: (v: SimOutcome | void) => void;
  reject: (e: Error) => void;
  /** es una simulación (si falla, el Worker se reemplaza) */
  sim: boolean;
}

type Req = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

/** "can't allocate…" (ngspice) o "Cannot enlarge memory" (Emscripten) → un mensaje claro */
const friendly = (msg: string) => (OUT_OF_MEMORY_RE.test(msg) ? OUT_OF_MEMORY : msg);

export class EngineClient {
  onOutput?: (line: string) => void;
  onStatus?: (status: string, percent: number) => void;

  private worker?: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private readyP!: Promise<void>;

  /**
   * @param autoStart levantar el Worker ya; si no, con start() o al primer uso (la app lo
   * arranca cuando llegó la librería: si no, los 2 MB del motor le compiten la red, #190)
   */
  constructor(autoStart = true) {
    if (autoStart) this.spawn();
  }

  /** Motor cargado (lo arranca si todavía no) */
  get ready(): Promise<void> {
    this.start();
    return this.readyP;
  }

  start(): void {
    if (!this.worker) this.spawn();
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
      if (msg.type === 'error') {
        p.reject(new Error(friendly(msg.message)));
        if (p.sim) this.restart();
      } else if (msg.type === 'result') {
        p.resolve({ result: msg.result, ms: msg.ms });
        // ngspice "cannot recover": se descarta el Worker entero (y su memoria) para la próxima
        if (msg.result.aborted) this.restart();
      } else p.resolve();
    };
    this.worker.onerror = (ev) => {
      const err = new Error(friendly(ev.message || t('Error in the engine Worker')));
      const sim = [...this.pending.values()].some((p) => p.sim);
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
      // (el Worker se cae, p. ej., si el navegador le niega memoria): uno nuevo para la próxima
      if (sim) this.restart();
    };
    this.readyP = this.request({ type: 'init' }) as Promise<void>;
  }

  private request(req: Req): Promise<SimOutcome | void> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, sim: req.type === 'simulate' });
      this.worker!.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  async simulate(netlist: string, files?: Record<string, string | Uint8Array>, opts?: SimulateOptions): Promise<SimOutcome> {
    await this.ready;
    return this.request({ type: 'simulate', netlist, files, opts }) as Promise<SimOutcome>;
  }

  /** Corta la simulación en curso: termina el Worker y levanta uno nuevo. */
  abort(): void {
    this.worker?.terminate();
    for (const p of this.pending.values()) p.reject(new Error(t('Simulation aborted')));
    this.pending.clear();
    this.spawn();
  }

  /** Worker nuevo (tras un error fatal de ngspice o una caída del Worker) */
  private restart(): void {
    this.worker?.terminate();
    this.spawn();
  }
}
