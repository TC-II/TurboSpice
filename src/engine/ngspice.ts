// Wrapper sobre la API compartida de ngspice (sharedspice.h) compilada a WebAssembly.
// Corre en un Web Worker (o en Node para tests). Sólo sintaxis TS "borrable" para
// que Node pueda importarlo directamente.

export interface NgspiceAssets {
  spinit: string;
  /** nombre de archivo (p.ej. "analog.cm") → binario del side module */
  codemodels: Record<string, Uint8Array>;
}

export interface SimVector {
  name: string;
  /** tipo de ngspice: 1 time, 2 frequency, 3 voltage, 4 current, ... (ver SV_* en ngspice) */
  type: number;
  real: Float64Array;
  /** sólo en vectores complejos (AC, noise, S-param, pz) */
  imag?: Float64Array;
}

export interface SimPlot {
  /** p.ej. "tran1", "ac1", "op1", "pz1" */
  name: string;
  vectors: SimVector[];
}

export interface SimResult {
  plots: SimPlot[];
  log: string[];
  errors: string[];
  /** ngspice pidió salir (error fatal): hay que recrear el módulo */
  aborted: boolean;
}

export interface NgspiceOptions {
  onOutput?: (line: string) => void;
  /** porcentaje 0-100 y texto de estado, p.ej. "tran: 42.1%" */
  onStatus?: (status: string, percent: number) => void;
  locateFile?: (path: string) => string;
}

// Subconjunto del módulo de Emscripten que usamos
interface EmModule {
  FS: {
    mkdirTree(path: string): void;
    writeFile(path: string, data: string | Uint8Array): void;
  };
  addFunction(fn: (...args: number[]) => number, sig: string): number;
  UTF8ToString(ptr: number): string;
  stringToNewUTF8(s: string): number;
  getValue(ptr: number, type: string): number;
  HEAPF64: Float64Array;
  _malloc(n: number): number;
  _free(ptr: number): void;
  _ngSpice_Init(...cbs: number[]): number;
  _ngSpice_Command(cmd: number): number;
  _ngGet_Vec_Info(name: number): number;
  _ngSpice_AllPlots(): number;
  _ngSpice_AllVecs(plot: number): number;
}

export type NgspiceFactory = (opts: Record<string, unknown>) => Promise<unknown>;

const SPINIT_PATH = '/usr/local/share/ngspice/scripts/spinit';
const CM_DIR = '/usr/local/lib/ngspice';
const WORK_DIR = '/work';

// Offsets de struct vector_info en wasm32 (ver sharedspice.h)
const VI_TYPE = 4;
const VI_FLAGS = 8;
const VI_REAL = 12;
const VI_COMP = 16;
const VI_LENGTH = 20;
const VF_COMPLEX = 2;

export class Ngspice {
  private m: EmModule;
  private log: string[] = [];
  private errors: string[] = [];
  private aborted = false;
  private hasCircuit = false;
  private opts: NgspiceOptions;

  private constructor(m: EmModule, opts: NgspiceOptions) {
    this.m = m;
    this.opts = opts;
  }

  static async create(
    factory: NgspiceFactory,
    assets: NgspiceAssets,
    opts: NgspiceOptions = {},
  ): Promise<Ngspice> {
    const m = (await factory({
      locateFile: opts.locateFile,
      print: () => {},
      printErr: () => {},
    })) as EmModule;

    // spinit y code models tienen que estar en el FS antes de ngSpice_Init
    m.FS.mkdirTree(SPINIT_PATH.slice(0, SPINIT_PATH.lastIndexOf('/')));
    m.FS.writeFile(SPINIT_PATH, assets.spinit);
    m.FS.mkdirTree(CM_DIR);
    for (const [name, data] of Object.entries(assets.codemodels)) {
      m.FS.writeFile(`${CM_DIR}/${name}`, data);
    }
    m.FS.mkdirTree(WORK_DIR);
    // ngspice consulta la memoria disponible; wasm32 llega hasta 4 GB
    m.FS.mkdirTree('/proc');
    m.FS.writeFile('/proc/meminfo', 'MemTotal: 4194304 kB\nMemFree: 4194304 kB\n');

    const ng = new Ngspice(m, opts);
    ng.init();
    return ng;
  }

  private init(): void {
    const m = this.m;
    const sendChar = m.addFunction((ptr) => {
      const raw = m.UTF8ToString(ptr);
      // ngspice antepone "stdout " / "stderr "; por stderr también llegan avisos
      // ("Note: ...", "Warning: ..."), así que los errores se reconocen por el texto.
      const line = raw.replace(/^std(out|err) /, '');
      this.log.push(line);
      if (/\berror\b|\bfatal\b/i.test(line)) this.errors.push(line);
      this.opts.onOutput?.(line);
      return 0;
    }, 'iiii');
    const sendStat = m.addFunction((ptr) => {
      const s = m.UTF8ToString(ptr);
      const pct = /([\d.]+)%/.exec(s);
      this.opts.onStatus?.(s, pct ? parseFloat(pct[1]) : 0);
      return 0;
    }, 'iiii');
    const controlledExit = m.addFunction((status) => {
      this.aborted = true;
      this.errors.push(`ngspice exit (status ${status})`);
      return 0;
    }, 'iiiiii');
    const bgRunning = m.addFunction(() => 0, 'iiii');

    m._ngSpice_Init(sendChar, sendStat, controlledExit, 0, 0, bgRunning, 0);
    this.command(`cd ${WORK_DIR}`);
  }

  command(cmd: string): number {
    const p = this.m.stringToNewUTF8(cmd);
    try {
      return this.m._ngSpice_Command(p);
    } finally {
      this.m._free(p);
    }
  }

  /** Escribe archivos auxiliares (modelos, .include, PWL) en /work */
  writeFiles(files: Record<string, string | Uint8Array>): void {
    for (const [path, data] of Object.entries(files)) {
      const full = path.startsWith('/') ? path : `${WORK_DIR}/${path}`;
      const dir = full.slice(0, full.lastIndexOf('/'));
      if (dir) this.m.FS.mkdirTree(dir);
      this.m.FS.writeFile(full, data);
    }
  }

  /**
   * Simula una netlist completa. Si trae bloque .control, éste decide qué correr;
   * si no, se ejecutan los análisis de la netlist con "run".
   */
  simulate(netlist: string): SimResult {
    this.log = [];
    this.errors = [];
    this.aborted = false;

    // Liberar resultados y circuitos anteriores
    this.command('destroy all');
    if (this.hasCircuit) this.command('remcirc');
    this.hasCircuit = true;

    this.writeFiles({ 'circuit.cir': netlist });
    this.command(`source ${WORK_DIR}/circuit.cir`);
    if (!this.aborted && !/^\s*\.control\b/im.test(netlist)) {
      this.command('run');
    }

    return {
      plots: this.aborted ? [] : this.readPlots(),
      log: this.log,
      errors: this.errors,
      aborted: this.aborted,
    };
  }

  private readStringArray(ptr: number): string[] {
    const out: string[] = [];
    if (!ptr) return out;
    for (let i = 0; ; i++) {
      const s = this.m.getValue(ptr + 4 * i, 'i32');
      if (!s) break;
      out.push(this.m.UTF8ToString(s));
    }
    return out;
  }

  private readPlots(): SimPlot[] {
    const plots: SimPlot[] = [];
    // ngSpice_AllPlots devuelve el más reciente primero; los queremos en orden de ejecución
    for (const plot of this.readStringArray(this.m._ngSpice_AllPlots()).reverse()) {
      if (plot === 'const') continue;
      const p = this.m.stringToNewUTF8(plot);
      const names = this.readStringArray(this.m._ngSpice_AllVecs(p));
      this.m._free(p);
      const vectors = names
        .map((n) => this.readVector(`${plot}.${n}`, n))
        .filter((v): v is SimVector => v !== null);
      plots.push({ name: plot, vectors });
    }
    return plots;
  }

  private readVector(fullName: string, name: string): SimVector | null {
    const m = this.m;
    const p = m.stringToNewUTF8(fullName);
    const vi = m._ngGet_Vec_Info(p);
    m._free(p);
    if (!vi) return null;
    const type = m.getValue(vi + VI_TYPE, 'i32');
    const flags = m.getValue(vi + VI_FLAGS, 'i16');
    const len = m.getValue(vi + VI_LENGTH, 'i32');
    if (flags & VF_COMPLEX) {
      const base = m.getValue(vi + VI_COMP, 'i32') / 8;
      const real = new Float64Array(len);
      const imag = new Float64Array(len);
      for (let i = 0; i < len; i++) {
        real[i] = m.HEAPF64[base + 2 * i];
        imag[i] = m.HEAPF64[base + 2 * i + 1];
      }
      return { name, type, real, imag };
    }
    const base = m.getValue(vi + VI_REAL, 'i32') / 8;
    return { name, type, real: m.HEAPF64.slice(base, base + len) };
  }
}
