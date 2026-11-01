import { t } from '../i18n/i18n.ts';
// Wrapper sobre la API compartida de ngspice (sharedspice.h) compilada a WebAssembly.
// Corre en un Web Worker (o en Node para tests). Sólo sintaxis TS "borrable" para
// que Node pueda importarlo directamente.

export interface NgspiceAssets {
  spinit: string;
  /** nombre de archivo (p.ej. "analog.cm") → binario del side module */
  codemodels: Record<string, Uint8Array>;
}

/**
 * Vectores que marcan el plot de resultados de un .stb: T (Tian) o R (GFT); con la sonda
 * diferencial, uno por modo (r_dm, r_cm, #333)
 */
export const isStbMain = (name: string) => /^[tr](_[dc]m)?$/.test(name);

export interface SimVector {
  name: string;
  /** cómo se muestra, si no es el nombre (los vectores de un .stb, en mayúsculas) */
  label?: string;
  /** tipo de ngspice: 1 time, 2 frequency, 3 voltage, 4 current, ... (ver SV_* en ngspice) */
  type: number;
  real: Float64Array;
  /** sólo en vectores complejos (AC, noise, S-param, pz) */
  imag?: Float64Array;
  /**
   * Nodos digitales: los instantes de cada cambio (`real` tiene el valor desde ese instante). No
   * se llevan a la grilla del transitorio: eso lo hace V(red) cuando se pide (#314)
   */
  x?: Float64Array;
}

/**
 * Tipo propio (no de ngspice) de los nodos digitales de XSPICE (#209), llevados al eje de
 * tiempo del transitorio, en escalones: 0, 1, 0.5 (desconocido, X) o NaN (alta impedancia, Z).
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
  /** El transitorio se cortó porque, al ritmo que iba, no entraba en memoria (`maxBytes`) */
  sizeStop?: SizeStop;
  /** Se simuló punto a punto (`.save none`): el módulo queda así para siempre y hay que recrearlo */
  reload?: boolean;
}

/** Lo que se midió al cortar un transitorio que no iba a entrar en memoria */
export interface SizeStop {
  /** porcentaje del tiempo simulado al cortar */
  percent: number;
  /** puntos guardados hasta ahí */
  points: number;
  /** puntos que habría guardado al final, a ese ritmo */
  projected: number;
  /** vectores que se guardan (con el tiempo) */
  vectors: number;
  /** se llenó la memoria de verdad (con `project: false`), no se proyectó */
  full?: boolean;
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
  /**
   * Nodos digitales (de eventos) que se leen, en minúsculas; sin esto, todos. Cada uno se copia con
   * un valor por punto del transitorio, así que pesan como una tensión (#314)
   */
  digital?: string[];
  /**
   * Bytes que pueden ocupar los resultados de un transitorio. Mientras simula se mide cuántos
   * puntos va guardando y, si al final no van a entrar, se corta antes de quedarse sin memoria
   * (`sizeStop`): ngspice elige el paso según el circuito y eso no se puede saber de antemano.
   */
  maxBytes?: number;
  /**
   * Cortar también si, al ritmo medido, no va a entrar (por defecto). Sin esto («seguir igual»)
   * sólo se corta cuando lo guardado llega a `maxBytes`. En los dos casos se devuelve lo simulado.
   */
  project?: boolean;
  /**
   * Recibir los puntos de un transitorio uno a uno (SendData) en vez de que ngspice los guarde
   * (por defecto, cuando se puede: ver `streamPlan`)
   */
  stream?: boolean;
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
  _ngSpice_CurPlot(): number;
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

/** Cada cuánto se mide el transitorio en curso (ms) */
const SIZE_CHECK_MS = 250;
/** Avance mínimo (en % del tiempo simulado) antes de decidir con el ritmo medido */
const SIZE_MIN_PERCENT = 0.5;

/** Se tira desde el callback de progreso para cortar el transitorio (desarma el stack de ngspice) */
class SizeStopSignal {
  readonly stop: SizeStop;
  readonly plots: SimPlot[];
  constructor(stop: SizeStop, plots: SimPlot[]) {
    this.stop = stop;
    this.plots = plots;
  }
}

/** Valores por página de un plot recibido punto a punto (4 MB) */
const PAGE = 1 << 19;
// vecvaluesall { int veccount; int vecindex; vecvalues **vecsa } y
// vecvalues { char *name; double creal; double cimag; int is_scale; int is_complex } (wasm32)
const VVA_VECSA = 8;
const VIA_TYPE = 12;
const VV_REAL = 8;
const VV_IMAG = 16;
const VV_SCALE = 24;
const VV_COMPLEX = 28;

/**
 * Un plot que llega punto a punto (SendData, con `.save none`): los vectores que se guardan, en
 * páginas de PAGE puntos. Así no hay copias al crecer (ngspice duplica sus vectores con realloc:
 * 1 GB de datos ocupaban 2 GB en el motor) y la memoria del motor no crece con la simulación.
 */
class Stream {
  names: string[] = [];
  /** por vector: su columna (y la de la parte imaginaria, o -1) */
  re: number[] = [];
  im: number[] = [];
  /** de dónde se lee cada columna en HEAPF64 (los punteros no cambian durante el análisis) */
  src = new Int32Array(0);
  /** puntos por página: cada página tiene los valores de todas las columnas, punto tras punto */
  rows = 1;
  pages: (Float64Array | null)[] = [];
  length = 0;
  ready = false;
  readonly plot: string;
  constructor(plot: string) {
    this.plot = plot;
  }

  /** El primer valor (real) del vector k */
  first(k: number): number {
    return this.pages[0]![this.re[k]];
  }

  /**
   * Todos los vectores, cada uno en su arreglo; las páginas se sueltan a medida que se copian
   * (el pico es lo guardado más una página)
   */
  takeAll(): { real: Float64Array; imag?: Float64Array }[] {
    const n = this.src.length;
    const cols = Array.from({ length: n }, () => new Float64Array(this.length));
    this.pages.forEach((pg, p) => {
      const r0 = p * this.rows;
      const rows = Math.min(this.rows, this.length - r0);
      for (let c = 0; c < n; c++) {
        const out = cols[c];
        for (let r = 0; r < rows; r++) out[r0 + r] = pg![r * n + c];
      }
      this.pages[p] = null;
    });
    return this.names.map((_, k) => (this.im[k] >= 0 ? { real: cols[this.re[k]], imag: cols[this.im[k]] } : { real: cols[this.re[k]] }));
  }
}

/**
 * ¿Se puede simular punto a punto? Sólo transitorios sin .control, .four ni .meas (ngspice usa sus
 * vectores después de correr, y con `.save none` quedan de un punto). Devuelve la netlist con
 * `.save none` y qué vectores guardar (null: todos; si no, los del .save con lista que arma
 * TurboSpice, que ya son nombres de vectores). null si no se puede.
 */
export function streamPlan(netlist: string): { netlist: string; keep: Set<string> | null } | null {
  if (/^\s*\.(control|four|meas|measure)\b/im.test(netlist) || !/\n\.end\s*$/i.test(netlist)) return null;
  const analyses = netlist.match(/^\s*\.(ac|dc|tran|op|noise|tf|sens|pz|disto|sp|pss)\b/gim) ?? [];
  if (!analyses.length || analyses.some((a) => !/tran$/i.test(a.trim()))) return null;
  let keep: Set<string> | null = new Set(['time']);
  for (const line of netlist.match(/^\s*\.save\b.*$/gim) ?? []) {
    for (const tok of line.trim().split(/\s+/).slice(1)) {
      const v = tok.toLowerCase();
      if (v === 'none') continue;
      if (v === 'all' || v === 'allv' || v === 'alli') keep = null;
      // v(x), i(v1)…: el nombre del vector no es el escrito
      else if (/[()]/.test(v)) return null;
      else keep?.add(v);
    }
  }
  if (keep && keep.size === 1) keep = null;
  return { netlist: netlist.replace(/\n\.end\s*$/i, '\n.save none\n.end\n'), keep };
}

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
    // lo que escriben por stdout/stderr las bibliotecas que carga ngspice (p. ej. el puente de
    // Icarus, #209) va al log de la simulación
    let self: Ngspice | null = null;
    const libOutput = (line: string) => self?.libLine(line);
    const m = (await factory({
      locateFile: opts.locateFile,
      ...(opts.instantiateWasm ? { instantiateWasm: opts.instantiateWasm } : {}),
      print: libOutput,
      printErr: libOutput,
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
    self = ng;
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
      const percent = pct ? parseFloat(pct[1]) : 0;
      this.opts.onStatus?.(s, percent);
      if (this.size && /^\s*tran\b/i.test(s)) this.checkSize(percent);
      return 0;
    }, 'iiii');
    const controlledExit = m.addFunction((status) => {
      this.aborted = true;
      this.errors.push(`ngspice exit (status ${status})`);
      return 0;
    }, 'iiiiii');
    const bgRunning = m.addFunction(() => 0, 'iiii');
    // un plot nuevo (op, tran…): con `.save none` sus puntos llegan uno a uno por sendData
    const sendInitData = m.addFunction((ptr) => {
      if (!this.streams) return 0;
      // vecinfoall { name ("Transient Analysis"), title, date, type ("tran1": el nombre del plot) … }
      this.stream = new Stream(m.UTF8ToString(m.getValue(ptr + VIA_TYPE, 'i32')));
      this.streams.set(this.stream.plot, this.stream);
      return 0;
    }, 'iiii');
    const sendData = m.addFunction((ptr) => {
      if (this.stream) this.addPoint(this.stream, ptr);
      return 0;
    }, 'iiiii');

    m._ngSpice_Init(sendChar, sendStat, controlledExit, sendData, sendInitData, bgRunning, 0);
    this.command(`cd ${WORK_DIR}`);
  }

  /** Una línea de stdout/stderr de una biblioteca (no de ngspice, que usa su callback) */
  private libLine(line: string): void {
    if (!line.trim()) return;
    this.log.push(line);
    if (/\berror\b|\bfail(ed)?\b|unable|abort/i.test(line)) this.errors.push(line);
    this.opts.onOutput?.(line);
  }

  command(cmd: string): number {
    const p = this.m.stringToNewUTF8(cmd);
    try {
      return this.m._ngSpice_Command(p);
    } finally {
      this.m._free(p);
    }
  }

  /**
   * Icarus Verilog (#209): libvvp, sus módulos VPI y el puente ivlng, donde los busca el d_cosim
   * de un bloque de comportamiento. libvvp no se puede inicializar dos veces: después de una
   * simulación con Icarus hace falta un motor nuevo.
   */
  writeLibs(files: Record<string, Uint8Array>): void {
    for (const [name, data] of Object.entries(files)) this.m.FS.writeFile(`${CM_DIR}/${name}`, data);
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
    this.digitalKeep = opts.digital ? new Set(opts.digital) : null;

    // Liberar resultados y circuitos anteriores
    this.command('destroy all');
    if (this.hasCircuit) this.command('remcirc');
    this.hasCircuit = true;

    // semilla fija: los Monte Carlo (mc, gauss, unif…) dan lo mismo en cada simulación, como al
    // arrancar ngspice (y como LTspice); si no, la secuencia sigue de la simulación anterior
    this.command('setseed 1');
    const control = /^\s*\.control\b/im.test(netlist);
    // punto a punto, sin que ngspice guarde nada (ver Stream)
    const plan = opts.stream !== false ? streamPlan(netlist) : null;
    this.streams = plan ? new Map() : null;
    this.stream = null;
    this.keep = plan?.keep ?? null;
    this.writeFiles({ 'circuit.cir': plan?.netlist ?? netlist });
    this.size = opts.maxBytes ? { max: opts.maxBytes, project: opts.project ?? true, last: 0, percent: 0, start: -1, points: 0 } : null;
    let sizeStop: SizeStop | undefined;
    let partial: SimPlot[] = [];
    try {
      // (un .control corre sus análisis al leer la netlist)
      this.command(`source ${WORK_DIR}/circuit.cir`);
      if (!this.aborted && !control) this.command('run');
    } catch (e) {
      if (!(e instanceof SizeStopSignal)) throw e;
      // ngspice quedó a mitad de un análisis: este módulo ya no sirve (el Worker crea otro)
      sizeStop = e.stop;
      partial = e.plots;
      this.aborted = true;
    } finally {
      this.size = null;
    }
    const plots = sizeStop ? partial : this.aborted ? [] : this.readPlots();
    const bias = opts.bias && !this.aborted && !control ? this.operatingPoint(opts.bias, opts.biasCommand) : undefined;
    this.streams = null;
    this.stream = null;

    return { plots, log: this.log, errors: this.errors, aborted: this.aborted, bias, ...(sizeStop ? { sizeStop } : {}), ...(plan ? { reload: true } : {}) };
  }

  /** Plots recibidos punto a punto en esta simulación (null: los guarda ngspice) */
  private streams: Map<string, Stream> | null = null;
  /** el plot que está llegando */
  private stream: Stream | null = null;
  /** vectores que se guardan de los que llegan (null: todos) */
  private keep: Set<string> | null = null;

  /** Un punto de un plot que llega punto a punto (sendData) */
  private addPoint(st: Stream, ptr: number): void {
    const m = this.m;
    if (!st.ready) {
      st.ready = true;
      const n = m.getValue(ptr, 'i32');
      const vecsa = m.getValue(ptr + VVA_VECSA, 'i32');
      const src: number[] = [];
      for (let i = 0; i < n; i++) {
        const pv = m.getValue(vecsa + 4 * i, 'i32');
        const name = m.UTF8ToString(m.getValue(pv, 'i32'));
        if (this.keep && !m.getValue(pv + VV_SCALE, 'i32') && !this.keep.has(name.toLowerCase())) continue;
        st.names.push(name);
        st.re.push(src.push((pv + VV_REAL) >> 3) - 1);
        st.im.push(m.getValue(pv + VV_COMPLEX, 'i32') ? src.push((pv + VV_IMAG) >> 3) - 1 : -1);
      }
      st.src = Int32Array.from(src);
      st.rows = Math.max(1, Math.floor(PAGE / Math.max(1, src.length)));
    }
    const i = st.length;
    const row = i % st.rows;
    if (row === 0) st.pages.push(new Float64Array(st.rows * st.src.length));
    const page = st.pages[st.pages.length - 1]!;
    const h = m.HEAPF64;
    const src = st.src;
    const n = src.length;
    const base = row * n;
    for (let c = 0; c < n; c++) page[base + c] = h[src[c]];
    st.length = i + 1;
  }

  /** Los vectores de un plot que llegó punto a punto (el tipo, de ngspice: su vector de un punto) */
  private streamVectors(st: Stream): SimVector[] {
    const data = st.takeAll();
    return st.names.map((name, k) => {
      const p = this.m.stringToNewUTF8(`${st.plot}.${name}`);
      const vi = this.m._ngGet_Vec_Info(p);
      this.m._free(p);
      const type = vi ? this.m.getValue(vi + VI_TYPE, 'i32') : 0;
      return { name, type, ...data[k] };
    });
  }

  /** Medición del transitorio en curso (ver `maxBytes`); null si no se mide */
  private size: { max: number; project: boolean; last: number; percent: number; start: number; points: number } | null = null;

  /**
   * Cuántos puntos lleva el transitorio en curso y cuántos va a tener, al ritmo medido desde que
   * empezó a guardar (con tstart, antes no guarda nada). Si no van a entrar, lo corta y se queda
   * con lo simulado hasta ahí (los vectores siguen en la memoria de ngspice: se leen antes de cortar).
   */
  private checkSize(percent: number): void {
    const z = this.size!;
    // una corrida nueva (.step, .control con varios tran): se empieza a medir de nuevo
    if (percent < z.percent) z.start = -1;
    z.percent = percent;
    const now = Date.now();
    if (now - z.last < SIZE_CHECK_MS) return;
    z.last = now;
    const m = this.m;
    let points: number;
    let vectors: number;
    if (this.streams) {
      // punto a punto: lo que llegó y se guarda
      const st = this.stream;
      if (!st || !/^tran\d+$/i.test(st.plot)) return;
      points = st.length;
      vectors = st.names.length;
    } else {
      const plot = m.UTF8ToString(m._ngSpice_CurPlot());
      if (!/^tran\d+$/i.test(plot)) return;
      const p = m.stringToNewUTF8(plot);
      vectors = this.readStringArray(m._ngSpice_AllVecs(p)).length;
      m._free(p);
      const tp = m.stringToNewUTF8(`${plot}.time`);
      const vi = m._ngGet_Vec_Info(tp);
      m._free(tp);
      points = vi ? m.getValue(vi + VI_LENGTH, 'i32') : 0;
    }
    if (!points || !vectors) return;
    if (z.start < 0) {
      z.start = percent;
      z.points = points;
    }
    const done = percent - z.start;
    const bytes = (n: number) => n * vectors * 8;
    // lo que ya guardó no entra, o al ritmo medido no va a entrar
    const projected = done > 0 ? Math.round(points + ((100 - percent) * (points - z.points)) / done) : points;
    const full = bytes(points) > z.max;
    if (full || (z.project && done >= SIZE_MIN_PERCENT && bytes(projected) > z.max)) {
      throw new SizeStopSignal({ percent, points, projected: Math.max(points, projected), vectors, ...(full ? { full } : {}) }, this.partialPlots());
    }
  }

  /**
   * Lo simulado del transitorio en curso, al cortarlo: los plots tal como están, con todos los
   * vectores del último del largo del más corto (ngspice agrega un punto vector por vector)
   */
  private partialPlots(): SimPlot[] {
    const plots = this.readPlots();
    const last = plots.at(-1);
    if (last && /^tran\d+$/i.test(last.name)) {
      const analog = last.vectors.filter((v) => !v.x);
      const n = Math.min(...analog.map((v) => v.real.length));
      for (const v of analog) if (v.real.length > n) v.real = v.real.slice(0, n);
    }
    return plots;
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
    // punto a punto: el primer punto que llegó de cada vector
    const st = this.streams?.get(plot);
    if (st) {
      if (st.length) st.names.forEach((n, k) => (out[n.toLowerCase()] = st.first(k)));
      // los parámetros de dispositivo que no llegaron como vectores se le piden al dispositivo
      for (const n of params) {
        if (out[n.toLowerCase()] !== undefined) continue;
        const v = this.readVector(n, n);
        if (v?.real.length) out[n.toLowerCase()] = v.real[0];
      }
      this.errors.length = errors;
      return out;
    }
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
      const st = this.streams?.get(plot);
      let vectors: SimVector[];
      if (st) vectors = this.streamVectors(st);
      else {
        const p = this.m.stringToNewUTF8(plot);
        const names = this.readStringArray(this.m._ngSpice_AllVecs(p));
        this.m._free(p);
        vectors = names.map((n) => this.readVector(`${plot}.${n}`, n)).filter((v): v is SimVector => v !== null);
      }
      // el plot de resultados de un .stb (setplot new lo llama "unknownN"): "stbN"
      const stb = /^unknown\d+$/i.test(plot) && vectors.some((v) => isStbMain(v.name));
      // sus vectores se muestran en mayúsculas, como la notación de los modelos (R, T, G, GINF…)
      if (stb) for (const v of vectors) if (v.name !== 'frequency') v.label = v.name.toUpperCase();
      plots.push({ name: stb ? `stb${plots.filter((p) => /^stb\d+$/.test(p.name)).length + 1}` : plot, vectors });
    }
    // los nodos digitales son del último análisis que corrió: si es un transitorio, van con él
    const last = plots.at(-1);
    if (last && /^tran\d+$/i.test(last.name)) last.vectors.push(...this.readEventNodes(last));
    return plots;
  }

  /**
   * Nodos de eventos digitales de XSPICE (ngGet_Evt_NodeInfo): sólo sus cambios, con el instante
   * de cada uno (`x`); no se muestrean en los tiempos del transitorio (pesarían como una tensión,
   * #314). Los eventos caen en puntos del transitorio (XSPICE pone un breakpoint en cada uno).
   * Los nodos no digitales (real, int de xtraevt) no se leen.
   */
  private digitalKeep: Set<string> | null = null;

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
      if (this.digitalKeep && !this.digitalKeep.has(name.toLowerCase())) continue;
      // los nodos internos sin nombre de un bloque Verilog (x1.n12, ver hdl/synth.ts): nunca
      else if (!this.digitalKeep && /\.n\d+$/i.test(name)) continue;
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
        // "0s", "1r", "Uz"…: nivel y fuerza; con fuerza z (alta impedancia) el nivel no vale:
        // Z = NaN; nivel U (desconocido) = X = 0.5 (como LOGIC_X y LOGIC_Z de waveform/digital.ts)
        const v = m.UTF8ToString(m.getValue(e + 16, 'i32'));
        if (!/^[01U][srzu]$/.test(v)) digital = false;
        levels[i] = v[1] === 'z' ? NaN : v[0] === 'U' ? 0.5 : v[0] === '1' ? 1 : 0;
      }
      if (!digital) continue;
      // sólo los cambios (#314): un evento que repite el valor anterior no aporta
      const keep: number[] = [];
      for (let i = 0; i < n; i++) {
        const prev = keep.length ? levels[keep[keep.length - 1]] : undefined;
        if (prev === undefined || !(prev === levels[i] || (Number.isNaN(prev) && Number.isNaN(levels[i])))) keep.push(i);
        // el último valor en un mismo instante gana (el .op y luego el primer paso)
        else if (steps[i] === steps[keep[keep.length - 1]]) keep[keep.length - 1] = i;
      }
      const x = Float64Array.from(keep, (i) => Math.max(steps[i], time[0]));
      out.push({ name, type: DIGITAL_TYPE, real: Float64Array.from(keep, (i) => levels[i]), x });
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
