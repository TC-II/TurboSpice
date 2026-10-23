import { t } from '../i18n/i18n.ts';
import { HdlError, yosysScript, yosysToSubckt, type HdlBlock, type YosysJson } from './synth.ts';
// Corre Yosys (YoWASP, WebAssembly) sobre archivos Verilog y traduce el resultado (#209).
// `run` es runYosys de @yowasp/yosys: en el navegador se carga en su propio Worker
// (yosysWorker.ts), en Node se importa directo (tests).

type Tree = { [name: string]: Tree | string | Uint8Array };
export type RunYosys = (args: string[], files: Tree, opts: { stdout(b: Uint8Array | null): void; stderr(b: Uint8Array | null): void }) => Promise<Tree> | Tree | undefined;

/** Sin los colores de terminal de Yosys */
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

export interface SynthResult {
  block?: HdlBlock;
  /** error de Yosys o de la traducción */
  error?: string;
  /** salida de Yosys (avisos) */
  log: string;
}

/**
 * Sintetiza `files` (nombre → texto Verilog; todos los módulos que usa el de más arriba) y lo
 * traduce a un .subckt. `source`: nombre del archivo principal (para el comentario del .subckt).
 */
export async function synthesize(run: RunYosys, files: Record<string, string>, source: string, top?: string): Promise<SynthResult> {
  let log = '';
  const dec = new TextDecoder();
  const sink = (b: Uint8Array | null) => {
    if (b) log += dec.decode(b, { stream: true });
  };
  // los nombres de archivo van entre comillas en el script de Yosys
  const names = Object.keys(files).map((n) => n.replace(/["\\]/g, '_'));
  const tree: Tree = Object.fromEntries(Object.values(files).map((text, i) => [names[i], text]));
  let out: Tree | undefined;
  try {
    out = (await run(['-q', '-p', yosysScript(names, top)], tree, { stdout: sink, stderr: sink })) ?? undefined;
  } catch {
    // Exit: Yosys terminó con error; el motivo quedó en la salida ("fa.v:3: ERROR: …")
    log = plain(log);
    const msg = /^(.*?)ERROR:\s*(.*)$/m.exec(log);
    return { error: msg ? `${msg[1].trim()} ${msg[2].trim()}`.trim() : t('Yosys failed'), log };
  }
  log = plain(log);
  const json = out?.['out.json'];
  if (typeof json !== 'string' && !(json instanceof Uint8Array)) return { error: t('Yosys failed'), log };
  try {
    const block = yosysToSubckt(JSON.parse(typeof json === 'string' ? json : dec.decode(json)) as YosysJson, source);
    return { block, log };
  } catch (e) {
    if (e instanceof HdlError) return { error: e.message, log };
    throw e;
  }
}
