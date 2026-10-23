import { t } from '../i18n/i18n.ts';
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

/**
 * Tipo propio (no de ngspice) de los nodos digitales de XSPICE (#209), llevados al eje de
 * tiempo del transitorio: 0, 1 o 0.5 (desconocido o alta impedancia), en escalones.
 */
export const DIGITAL_TYPE = 2000;

export interface SimPlot {
  /** p.ej. "tran1", "ac1", "op1", "pz1" */
  name: string;
  vectors: SimVector[];
  /** texto informativo de un plot derivado (p.ej. la THD de una FFT) */
  info?: string;
}

export interface SimResult {
  plots: SimPlot[];
  log: string[];
  errors: string[];
  /** ngspice pidió salir (error fatal): hay que recrear el módulo */
  aborted: boolean;
  /**
   * Punto de operación (si se pidió con `bias`): tensiones de nodo, corrientes de rama y los
   * parámetros de dispositivo pedidos (`@q1[gm]`…), por nombre de vector en minúsculas.
   */
  bias?: Record<string, number>;
}

export interface SimulateOptions {
  /** Calcular además el punto de operación y leer estos parámetros de dispositivo */
  bias?: string[];
  /**
   * Análisis con el que se calcula (por defecto "op"). Para un .tran, un transitorio mínimo: su
   * primer punto es el estado en t = 0 (sin uic, el bias con las condiciones iniciales; con uic,
   * el estado inicial), que es lo que se anota en el esquemático.
   */
  biasCommand?: string;
}

export interface NgspiceOptions {
  onOutput?: (line: string) => void;
  /** porcentaje 0-100 y texto de estado, p.ej. "tran: 42.1%" */
  onStatus?: (status: string, percent: number) => void;
  locateFile?: (path: string) => string;
  /**
   * Instanciar el wasm a mano (hook de Emscripten): el Worker lo saca de Cache Storage (#191).
   * Llama a done(instance, module) y devuelve {}.
   */
  instantiateWasm?: (imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) => object;
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
  _ngSpice_AllEvtNodes(): number;
  _ngGet_Evt_NodeInfo(name: number): number;
}

export type NgspiceFactory = (opts: Record<string, unknown>) => Promise<unknown>;

export const OUT_OF_MEMORY =
  t('Out of memory: the simulation produces more data than the browser can hold. Lower the number of points (fewer points per decade in .ac, a larger maximum step in .tran).');
/** Mensajes de ngspice o de Emscripten cuando se queda sin memoria */
export const OUT_OF_MEMORY_RE = /can't allocate|not enough memory|out of memory|cannot enlarge memory|\bOOM\b/i;

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
  /** descartar la salida de ngspice (consultas que avisan por error, como "no event nodes found") */
  private muted = false;
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
      ...(opts.instantiateWasm ? { instantiateWasm: opts.instantiateWasm } : {}),
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
      if (this.muted) return 0;
      // el progreso de cada punto de AC ("Reference value : 5.2e+03"): ya llega por sendStat
      if (/^\s*Reference value\s*:/.test(line)) return 0;
      if (OUT_OF_MEMORY_RE.test(line) && !this.errors.includes(OUT_OF_MEMORY)) this.errors.unshift(OUT_OF_MEMORY);
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
  simulate(netlist: string, opts: SimulateOptions = {}): SimResult {
    this.log = [];
    this.errors = [];
    this.aborted = false;

    // Liberar resultados y circuitos anteriores
    this.command('destroy all');
    if (this.hasCircuit) this.command('remcirc');
    this.hasCircuit = true;

    // semilla fija: los Monte Carlo (mc, gauss, unif…) dan lo mismo en cada simulación, como al
    // arrancar ngspice (y como LTspice); si no, la secuencia sigue de la simulación anterior
    this.command('setseed 1');
    this.writeFiles({ 'circuit.cir': netlist });
    this.command(`source ${WORK_DIR}/circuit.cir`);
    const control = /^\s*\.control\b/im.test(netlist);
    if (!this.aborted && !control) {
      this.command('run');
    }
    const plots = this.aborted ? [] : this.readPlots();
    const bias = opts.bias && !this.aborted && !control ? this.operatingPoint(opts.bias, opts.biasCommand) : undefined;

    return { plots, log: this.log, errors: this.errors, aborted: this.aborted, bias };
  }

  /**
   * Punto de operación con un "op" extra (después de los análisis, el estado del circuito es
   * el del final del último). Sus errores van al log pero no cuentan como errores de la
   * simulación pedida; el plot que genera no se devuelve entre los resultados.
   */
  private operatingPoint(params: string[], cmd = 'op'): Record<string, number> | undefined {
    const errors = this.errors.length;
    this.command(cmd);
    if (this.errors.length > errors || this.aborted) {
      this.errors.length = errors;
      return undefined;
    }
    const out: Record<string, number> = {};
    const plot = this.readStringArray(this.m._ngSpice_AllPlots())[0];
    const p = this.m.stringToNewUTF8(plot);
    const names = this.readStringArray(this.m._ngSpice_AllVecs(p));
    this.m._free(p);
    // (en un transitorio, el primer punto: t = 0)
    for (const n of names) {
      const v = this.readVector(`${plot}.${n}`, n);
      if (v?.real.length) out[n.toLowerCase()] = v.real[0];
    }
    for (const n of params) {
      const v = this.readVector(n, n);
      if (v?.real.length) out[n.toLowerCase()] = v.real[0];
    }
    // parámetros que el modelo no tiene: no son errores de la simulación
    this.errors.length = errors;
    return out;
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
    // los nodos digitales son del último análisis que corrió: si es un transitorio, van con él
    const last = plots.at(-1);
    if (last && /^tran\d+$/i.test(last.name)) last.vectors.push(...this.readEventNodes(last));
    return plots;
  }

  /**
   * Nodos de eventos digitales de XSPICE (ngGet_Evt_NodeInfo) muestreados en los tiempos del
   * transitorio: cada punto toma el último valor con tiempo ≤ t. Los eventos caen en puntos del
   * transitorio (XSPICE pone un breakpoint en cada uno), así que los flancos quedan exactos.
   * Los nodos no digitales (real, int de xtraevt) no se leen.
   */
  private readEventNodes(plot: SimPlot): SimVector[] {
    const m = this.m;
    const time = plot.vectors.find((v) => v.name === 'time')?.real;
    if (!time) return [];
    const out: SimVector[] = [];
    // sin nodos de eventos ngspice escribe "Error: no event nodes found."
    this.muted = true;
    const names = this.readStringArray(m._ngSpice_AllEvtNodes());
    this.muted = false;
    for (const name of names) {
      const p = m.stringToNewUTF8(name);
      const info = m._ngGet_Evt_NodeInfo(p);
      m._free(p);
      if (!info) continue;
      // evt_shared_data { pevt_data *evt_dect; int num_steps } y
      // evt_data { int dcop; double step; char *node_value } (wasm32: step en +8, valor en +16)
      const data = m.getValue(info, 'i32');
      const n = m.getValue(info + 4, 'i32');
      const steps = new Float64Array(n);
      const levels = new Float64Array(n);
      let digital = n > 0;
      for (let i = 0; i < n && digital; i++) {
        const e = m.getValue(data + 4 * i, 'i32');
        steps[i] = m.getValue(e + 8, 'double');
        // "0s", "1r", "Uz"…: nivel y fuerza; con fuerza z (alta impedancia) el nivel no vale
        const v = m.UTF8ToString(m.getValue(e + 16, 'i32'));
        if (!/^[01U][srzu]$/.test(v)) digital = false;
        levels[i] = v[1] === 'z' || v[0] === 'U' ? 0.5 : v[0] === '1' ? 1 : 0;
      }
      if (!digital) continue;
      const real = new Float64Array(time.length);
      for (let k = 0, j = 0; k < time.length; k++) {
        while (j + 1 < n && steps[j + 1] <= time[k]) j++;
        real[k] = levels[j];
      }
      out.push({ name, type: DIGITAL_TYPE, real });
    }
    return out;
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
