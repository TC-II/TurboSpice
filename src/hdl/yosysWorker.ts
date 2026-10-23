// Worker de Yosys (#209): el wasm pesa ~15 MB comprimido, así que se carga recién cuando se
// sintetiza el primer archivo Verilog y no traba la interfaz mientras corre.
import { synthesize, type RunYosys, type SynthResult } from './yosys.ts';

export type YosysRequest = { id: number; files: Record<string, string>; source: string; top?: string };
export type YosysResponse = { id: number; result: SynthResult } | { id: number; failure: string };

let run: Promise<RunYosys> | null = null;

self.onmessage = async (e: MessageEvent<YosysRequest>) => {
  const { id, files, source, top } = e.data;
  try {
    run ??= import('@yowasp/yosys').then((m) => m.runYosys as unknown as RunYosys);
    const result = await synthesize(await run, files, source, top);
    (self as unknown as Worker).postMessage({ id, result } satisfies YosysResponse);
  } catch (err) {
    run = null;
    (self as unknown as Worker).postMessage({ id, failure: String((err as Error)?.message ?? err) } satisfies YosysResponse);
  }
};
