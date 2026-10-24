/// <reference lib="webworker" />
// Web Worker que aloja ngspice. La simulación es sincrónica dentro del Worker;
// para abortar, el cliente termina el Worker y crea otro.
import { Ngspice, type NgspiceFactory } from './ngspice.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

declare const self: DedicatedWorkerGlobalScope;

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/`;

let ng: Promise<Ngspice> | null = null;

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(msg, transfer);

interface Manifest {
  codemodels: string[];
  /** Icarus Verilog (#209): los archivos de engine/icarus/ (compilador y simulador) */
  icarus?: string[];
  /** archivo → hash de su contenido (copy-engine.mjs) */
  hashes?: Record<string, string>;
}

const CACHE = 'turbospice-engine';

/**
 * Un archivo del motor. GitHub Pages cambia el ETag de todo en cada deploy (y vuelve a mandar el
 * motor entero, ~2,4 MB): con el hash del manifest se guarda en Cache Storage y sólo se baja si
 * cambió (#191). Sin hash o sin Cache Storage, de la red como siempre.
 */
async function engineFile(file: string, hash: string | undefined): Promise<Response> {
  const url = `${ENGINE_URL}${file}`;
  if (!hash || typeof caches === 'undefined') return fetch(url);
  try {
    const cache = await caches.open(CACHE);
    const key = `${url}?v=${hash}`;
    const hit = await cache.match(key);
    if (hit) return hit;
    const res = await fetch(url);
    if (!res.ok) return res;
    await cache.put(key, res.clone());
    // las versiones viejas de este archivo ya no sirven
    for (const req of await cache.keys()) if (req.url.split('?')[0] === new URL(url, self.location.href).href && req.url !== new URL(key, self.location.href).href) await cache.delete(req);
    return res;
  } catch {
    return fetch(url);
  }
}

let manifest: Manifest | null = null;

/** Lo que carga ngspice para un bloque Verilog de comportamiento (d_cosim con Icarus, #209) */
const ICARUS_RUNTIME = ['libvvp.so', 'ivlng.so', 'ivlng.vpi', 'system.vpi', 'v2005_math.vpi', 'va_math.vpi', 'v2009.vpi'];
let icarusRuntime: Promise<Record<string, Uint8Array>> | null = null;
const loadIcarus = () =>
  (icarusRuntime ??= Promise.all(
    ICARUS_RUNTIME.map(async (f) => {
      const r = await engineFile(`icarus/${f}`, manifest?.hashes?.[`icarus/${f}`]);
      if (!r.ok) throw new Error(`icarus/${f}: HTTP ${r.status}`);
      return [f, new Uint8Array(await r.arrayBuffer())] as const;
    }),
  ).then(Object.fromEntries));

async function load(): Promise<Ngspice> {
  // el manifest se revalida siempre: dice qué versión de cada archivo va
  manifest = (await (await fetch(`${ENGINE_URL}manifest.json`, { cache: 'no-cache' })).json()) as Manifest;
  const hash = (f: string) => manifest?.hashes?.[f];
  // (con el hash en la URL el .mjs siempre corresponde al .wasm de la caché)
  const v = hash('ngspice.mjs');
  // import() directo: el dev server de Vite le agrega ?import y rechaza los archivos de public/
  const nativeImport = new Function('u', 'return import(u)') as (u: string) => Promise<unknown>;
  const { default: factory } = (await nativeImport(new URL(`${ENGINE_URL}ngspice.mjs${v ? `?v=${v}` : ''}`, self.location.href).href)) as {
    default: NgspiceFactory;
  };
  const [spinit, ...cms] = await Promise.all([
    fetch(`${ENGINE_URL}spinit`).then((r) => r.text()),
    ...manifest.codemodels.map((f) => engineFile(f, hash(f)).then((r) => r.arrayBuffer())),
  ]);
  const codemodels = Object.fromEntries(manifest.codemodels.map((f, i) => [f, new Uint8Array(cms[i])]));

  // el wasm desde la caché, compilado mientras llega (instantiateStreaming); si eso falla, de la red
  let wasmFailed!: (e: unknown) => void;
  const failed = new Promise<never>((_, reject) => (wasmFailed = reject));
  const instantiateWasm = (imports: WebAssembly.Imports, done: (i: WebAssembly.Instance, m: WebAssembly.Module) => void) => {
    engineFile('ngspice.wasm', hash('ngspice.wasm'))
      .then((r) => WebAssembly.instantiateStreaming(r, imports))
      .catch(async () => WebAssembly.instantiate(await (await fetch(`${ENGINE_URL}ngspice.wasm`)).arrayBuffer(), imports))
      .then((r) => done(r.instance, r.module), wasmFailed);
    return {};
  };

  // Coalescer el progreso: ngspice manda muchos updates por segundo
  let lastStatus = 0;
  const created = Ngspice.create(
    factory,
    { spinit, codemodels },
    {
      locateFile: (path) => `${ENGINE_URL}${path}`,
      ...(hash('ngspice.wasm') ? { instantiateWasm } : {}),
      // (la salida llega entera en result.log: una línea por mensaje inundaba el hilo principal)
      onStatus: (status, percent) => {
        const now = performance.now();
        if (now - lastStatus > 100) {
          lastStatus = now;
          post({ type: 'status', status, percent });
        }
      },
    },
  );
  return Promise.race([created, failed]);
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
    // un bloque de comportamiento (Icarus por d_cosim): libvvp se inicializa una sola vez, así que
    // después de esta simulación hace falta un motor nuevo
    // (el d_cosim está en el .subckt del módulo: en la netlist o en un archivo de modelos)
    const icarus = [req.netlist, ...Object.values(req.files ?? {})].some((x) => typeof x === 'string' && /ivlng\.so/i.test(x));
    if (icarus) engine.writeLibs(await loadIcarus());
    const t0 = performance.now();
    // (con Icarus, sin el «op» extra del punto de operación: sería otra inicialización de libvvp)
    const result = engine.simulate(req.netlist, icarus ? { ...req.opts, bias: undefined } : req.opts);
    const ms = performance.now() - t0;
    // Tras un error fatal ngspice queda en estado indefinido: instancia nueva para la próxima
    if (result.aborted || icarus) ng = null;
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
