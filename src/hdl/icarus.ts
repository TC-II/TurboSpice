// Verilog de comportamiento (#209): Icarus Verilog en WebAssembly (engine/icarus/build.sh) compila
// el .v a .vvp como lo haría el driver iverilog (ivlpp y después ivl con su configuración), y el
// bloque se simula con libvvp dentro de ngspice por el code model d_cosim (ver synth.ts,
// cosimSubckt). Acá: compilar, y leer del .vvp los puertos y los parameter del módulo.
import type { PinDir } from './synth.ts';

/** Un programa de Emscripten con FS y callMain (ivlpp, ivl) */
export interface EmProgram {
  FS: {
    mkdirTree(path: string): void;
    writeFile(path: string, data: string | Uint8Array): void;
    readFile(path: string, opts: { encoding: 'utf8' }): string;
    analyzePath(path: string): { exists: boolean };
  };
  callMain(args: string[]): number;
}

export interface IcarusLoader {
  /** una instancia nueva del programa (cada una corre una sola vez); `print` recibe su salida */
  program(name: 'ivlpp' | 'ivl', print: (line: string) => void): Promise<EmProgram>;
  /** vvp.tgt y los .vpi del sistema */
  file(name: string): Promise<Uint8Array>;
}

export interface IcarusPort {
  name: string;
  dir: PinDir;
  bits: number;
}

export interface IcarusResult {
  vvp?: string;
  ports?: IcarusPort[];
  params?: Record<string, string>;
  error?: string;
  log: string;
}

const VPI = ['system', 'v2005_math', 'va_math', 'v2009'];

/** Configuración de ivl como la escribe el driver iverilog (-g2005, como por omisión) */
const iconfig = (top: string, defparams: Record<string, string>) =>
  [
    'basedir:/ivl',
    ...VPI.filter((m) => m !== 'v2009').map((m) => `module:/ivl/${m}.vpi`),
    `root:${top}`,
    ...Object.entries(defparams).map(([k, v]) => `defparam:${top}.${k}=${v}`),
    'generation:2005',
    'generation:no-specify',
    'generation:no-interconnect',
    'generation:assertions',
    'generation:xtypes',
    'generation:io-range-error',
    'generation:no-strict-ca-eval',
    'generation:no-strict-expr-width',
    'generation:shared-loop-index',
    'generation:no-allow-real-arg-to-bits',
    'generation:no-verilog-ams',
    'generation:strict-net-var-declaration',
    'generation:strict-parameter-declaration',
    'generation:icarus-misc',
    'warnings:nu',
    'ignore_missing_modules:false',
    'out:/design.vvp',
    'iwidth:32',
    'widthcap:65536',
    '',
  ].join('\n');

/** Compila los Verilog (nombre → texto) con `top` como módulo de más arriba */
export async function compileIcarus(load: IcarusLoader, files: Record<string, string>, top: string, defparams: Record<string, string> = {}): Promise<IcarusResult> {
  const lines: string[] = [];
  const print = (l: string) => lines.push(l);
  const names = Object.keys(files).map((n) => n.replace(/[^\w.-]/g, '_'));
  // 1. preprocesador: todos los archivos juntos
  const pp = await load.program('ivlpp', print);
  pp.FS.mkdirTree('/src');
  Object.values(files).forEach((text, i) => pp.FS.writeFile(`/src/${names[i]}`, text));
  pp.FS.writeFile('/flags', 'D:__ICARUS__=1\nrelative include:false\n');
  pp.FS.writeFile('/files', names.map((n) => `/src/${n}`).join('\n') + '\n');
  pp.FS.writeFile('/pdefs', '__ICARUS__:0:1:1\n');
  let rc = 1;
  try {
    rc = pp.callMain(['-L', '-o', '/design.pp', '-F/flags', '-f/files', '-p/pdefs']);
  } catch (e) {
    rc = (e as { status?: number }).status ?? 1;
  }
  if (rc !== 0 || !pp.FS.analyzePath('/design.pp').exists) return { error: firstError(lines) ?? 'ivlpp', log: clean(lines) };
  const pre = pp.FS.readFile('/design.pp', { encoding: 'utf8' });
  // 2. ivl con el target vvp
  const ivl = await load.program('ivl', print);
  ivl.FS.mkdirTree('/ivl');
  for (const m of VPI) ivl.FS.writeFile(`/ivl/${m}.vpi`, await load.file(`${m}.vpi`));
  ivl.FS.writeFile('/ivl/vvp.tgt', await load.file('vvp.tgt'));
  ivl.FS.writeFile('/ivl/vvp.conf', 'functor:cprop\nfunctor:nodangle\nflag:DLL=vvp.tgt\nflag:VVP_EXECUTABLE=vvp\n');
  ivl.FS.writeFile('/design.pp', pre);
  ivl.FS.writeFile('/iconfig', iconfig(top, defparams));
  try {
    rc = ivl.callMain(['-C/iconfig', '-C/ivl/vvp.conf', '/design.pp']);
  } catch (e) {
    rc = (e as { status?: number }).status ?? 1;
  }
  if (rc !== 0 || !ivl.FS.analyzePath('/design.vvp').exists) return { error: firstError(lines) ?? 'ivl', log: clean(lines) };
  const vvp = ivl.FS.readFile('/design.vvp', { encoding: 'utf8' });
  const info = parseVvp(vvp, top);
  if (!info.ports.length) return { error: `${top}: no ports`, log: clean(lines) };
  return { vvp, ...info, log: clean(lines) };
}

/** Las líneas de ivl/ivlpp sin los avisos de versión */
const clean = (lines: string[]) => lines.filter((l) => l.trim()).join('\n');
/** El primer error ("design.v:3: syntax error"), con el nombre de archivo original */
const firstError = (lines: string[]) => lines.find((l) => /error|unable|unknown|not found/i.test(l))?.replace(/^\/src\//, '');

/** Puertos y parameter del módulo de más arriba, de un .vvp */
export function parseVvp(vvp: string, top: string): { ports: IcarusPort[]; params: Record<string, string> } {
  const ports: IcarusPort[] = [];
  const params: Record<string, string> = {};
  let inTop = false;
  for (const line of vvp.split('\n')) {
    const scope = /^\S+ \.scope module, "([^"]*)" "([^"]*)"[^,;]*(,\s*\S+)?;/.exec(line);
    if (scope) {
      // el de más arriba: sin scope padre
      inTop = !scope[3] && (scope[1] === top || scope[2] === top);
      continue;
    }
    if (/^\S+ \.scope /.test(line)) {
      inTop = false;
      continue;
    }
    if (!inTop) continue;
    const port = /^\s*\.port_info \d+ \/(INPUT|OUTPUT|INOUT) (\d+) "([^"]+)";/.exec(line);
    if (port) ports.push({ name: port[3], dir: port[1] === 'INPUT' ? 'in' : port[1] === 'OUTPUT' ? 'out' : 'inout', bits: Number(port[2]) });
    const param = /^\S+ \.param\/[a-z]+ "([^"]+)" \d+ [^,]*, \+?C4<([01]+)>/.exec(line);
    if (param) {
      const n = parseInt(param[2], 2);
      params[param[1]] = String(param[2].length === 32 && param[2][0] === '1' ? n - 2 ** 32 : n);
    }
  }
  return { ports, params };
}

/** El .vvp para el motor: los módulos VPI van por la ruta donde los escribe ngspice.ts */
export const vvpForEngine = (vvp: string) => vvp.replace(/^:vpi_module ".*?([^/"]+?)(\.vpi)?";/gm, ':vpi_module "/usr/local/lib/ngspice/$1.vpi";');
