// Worker de los bloques Verilog (#209): Yosys (síntesis) e Icarus Verilog (comportamiento). Los
// dos son pesados (~15 MB y ~1 MB comprimidos), así que se cargan recién cuando se usan, y no
// traban la interfaz mientras corren.
import { compileIcarus, vvpForEngine, type EmProgram, type IcarusLoader } from './icarus.ts';
import { cosimSubckt, HdlError } from './synth.ts';
import { synthesize, type RunYosys, type SynthResult } from './yosys.ts';

export type YosysRequest =
  | { id: number; kind?: 'yosys'; files: Record<string, string>; source: string; top?: string; params?: Record<string, string> }
  /** comportamiento: compilar con Icarus; `vvpFile` es el .vvp que nombra el .subckt */
  | { id: number; kind: 'icarus'; files: Record<string, string>; source: string; top: string; params?: Record<string, string>; vvpFile: string };
export type YosysResponse = { id: number; result: SynthResult } | { id: number; failure: string };

let run: Promise<RunYosys> | null = null;

// --- Icarus (engine/icarus/build.sh, copiado a public/engine/icarus) ------------------------------
const ICARUS_URL = new URL(`${import.meta.env.BASE_URL}engine/icarus/`, self.location.href).href;
// import() directo: el dev server de Vite le agrega ?import y rechaza los archivos de public/
const nativeImport = new Function('u', 'return import(u)') as (u: string) => Promise<{ default: (o: object) => Promise<EmProgram> }>;
const fileCache = new Map<string, Promise<Uint8Array>>();
const icarus: IcarusLoader = {
  program: async (name, print) => {
    const { default: factory } = await nativeImport(`${ICARUS_URL}${name}.mjs`);
    return factory({ print, printErr: print, locateFile: (p: string) => `${ICARUS_URL}${p}` });
  },
  file: (name) => {
    let f = fileCache.get(name);
    if (!f) {
      f = fetch(`${ICARUS_URL}${name}`).then(async (r) => {
        if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
        return new Uint8Array(await r.arrayBuffer());
      });
      fileCache.set(name, f);
      f.catch(() => fileCache.delete(name));
    }
    return f;
  },
};

self.onmessage = async (e: MessageEvent<YosysRequest>) => {
  const req = e.data;
  try {
    let result: SynthResult;
    if (req.kind === 'icarus') {
      const r = await compileIcarus(icarus, req.files, req.top, req.params);
      if (!r.vvp || !r.ports) result = { error: r.error ?? 'Icarus', log: r.log };
      else {
        try {
          result = { block: cosimSubckt(req.top, r.ports, r.params ?? {}, req.vvpFile, req.source), vvp: vvpForEngine(r.vvp), log: r.log };
        } catch (err) {
          if (!(err instanceof HdlError)) throw err;
          result = { error: err.message, log: r.log };
        }
      }
    } else {
      run ??= import('@yowasp/yosys').then((m) => m.runYosys as unknown as RunYosys);
      result = await synthesize(await run, req.files, req.source, req.top, req.params);
    }
    (self as unknown as Worker).postMessage({ id: req.id, result } satisfies YosysResponse);
  } catch (err) {
    if (req.kind !== 'icarus') run = null;
    (self as unknown as Worker).postMessage({ id: req.id, failure: String((err as Error)?.message ?? err) } satisfies YosysResponse);
  }
};
