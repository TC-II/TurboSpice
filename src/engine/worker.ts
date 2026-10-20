/// <reference lib="webworker" />
// Web Worker que aloja ngspice. La simulación es sincrónica dentro del Worker;
// para abortar, el cliente termina el Worker y crea otro.
import { Ngspice, type NgspiceFactory } from './ngspice.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

declare const self: DedicatedWorkerGlobalScope;

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/`;

let ng: Promise<Ngspice> | null = null;

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(msg, transfer);

async function load(): Promise<Ngspice> {
  const { default: factory } = (await import(/* @vite-ignore */ `${ENGINE_URL}ngspice.mjs`)) as {
    default: NgspiceFactory;
  };
  const manifest = (await (await fetch(`${ENGINE_URL}manifest.json`)).json()) as { codemodels: string[] };
  const [spinit, ...cms] = await Promise.all([
    fetch(`${ENGINE_URL}spinit`).then((r) => r.text()),
    ...manifest.codemodels.map((f) => fetch(`${ENGINE_URL}${f}`).then((r) => r.arrayBuffer())),
  ]);
  const codemodels = Object.fromEntries(manifest.codemodels.map((f, i) => [f, new Uint8Array(cms[i])]));

  // Coalescer el progreso: ngspice manda muchos updates por segundo
  let lastStatus = 0;
  return Ngspice.create(
    factory,
    { spinit, codemodels },
    {
      locateFile: (path) => `${ENGINE_URL}${path}`,
      onOutput: (line) => post({ type: 'output', line }),
      onStatus: (status, percent) => {
        const now = performance.now();
        if (now - lastStatus > 100) {
          lastStatus = now;
          post({ type: 'status', status, percent });
        }
      },
    },
  );
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    ng ??= load();
    const engine = await ng;
    if (req.type === 'init') {
      post({ id: req.id, type: 'ready' });
      return;
    }
    if (req.files) engine.writeFiles(req.files);
    const t0 = performance.now();
    const result = engine.simulate(req.netlist, req.opts);
    const ms = performance.now() - t0;
    // Tras un error fatal ngspice queda en estado indefinido: instancia nueva para la próxima
    if (result.aborted) ng = null;
    const transfer = result.plots.flatMap((p) =>
      p.vectors.flatMap((v) => (v.imag ? [v.real.buffer, v.imag.buffer] : [v.real.buffer])),
    );
    post({ id: req.id, type: 'result', result, ms }, transfer);
  } catch (e) {
    // (p. ej. un abort de Emscripten sin memoria): el módulo quedó inutilizable
    ng = null;
    post({ id: req.id, type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
