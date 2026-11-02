// El proyecto de ejemplo DSP (lo escribe scripts/make-dsp.ts, #366): filtros y bloques de la
// biblioteca library/verilog/DSP, todos en Q1.15 con un reloj de 1 MHz. Un workbench por diseño:
// - FIR: pasabajos de 8 taps (sinc con ventana de Hamming, fc = 100 kHz) en forma directa, con su
//   respuesta al impulso y un seno en la banda de paso y otro en la de rechazo.
// - IIR: el de primer orden (y += (x − y)/16, con un ×2⁻⁴) y un biquad Butterworth (fc = 50 kHz,
//   coeficientes en Q2.14), con su respuesta al escalón.
// - CIC: diezmador de 2 etapas por 8 (integradores a 1 MHz, peines a 125 kHz, aritmética que
//   envuelve) con su respuesta al escalón: la ganancia es 8² = 64.
// - NCO y mezclador: dos NCO y su producto (aparecen la suma y la diferencia de frecuencias).
// Los esquemáticos se dibujan acá, como un diagrama de bloques: la señal va de izquierda a derecha
// por cables, los taps bajan a la cadena de sumadores y las realimentaciones y el reloj van por
// etiquetas. Los símbolos son los dibujados de library/sym/DSP (scripts/gen-dsp-symbols.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runYosys } from '@yowasp/yosys';
import { compileIcarus, vvpForEngine, type IcarusLoader } from '../../src/hdl/icarus.ts';
import { applySynth, addVerilogModule, looksBehavioral, setHdlMode, vvpFileOf } from '../../src/hdl/project.ts';
import { cosimSubckt } from '../../src/hdl/synth.ts';
import { synthesize } from '../../src/hdl/yosys.ts';
import { newId, BENCHES, type Project, type Sim } from '../../src/project/turbo.ts';
import type { SimView } from '../../src/sim/simList.ts';

const LIB = 'library/verilog/DSP';
const SYM = 'library/sym/DSP';
const MODULES = ['dsp_clock', 'dsp_impulse', 'dsp_nco', 'dsp_delay', 'dsp_tap', 'dsp_add', 'dsp_sub', 'dsp_shift', 'dsp_downsample', 'dsp_mul'];

// Icarus en WebAssembly (engine/dist-engine/icarus), para los módulos de comportamiento (el reloj)
const ICARUS = join('engine', 'dist-engine', 'icarus');
const icarus: IcarusLoader = {
  program: async (name, print) => (await import(pathToFileURL(join(process.cwd(), ICARUS, `${name}.mjs`)).href)).default({ print, printErr: print }),
  file: async (name) => new Uint8Array(readFileSync(join(ICARUS, name))),
};

/** Agrega un módulo de la biblioteca al proyecto: su símbolo dibujado y su síntesis (o su .vvp, si es de comportamiento) */
async function withVerilog(p: Project, name: string): Promise<Project> {
  const text = readFileSync(`${LIB}/${name}.v`, 'utf8');
  // (el símbolo antes: la síntesis conserva un dibujo que no es el generado)
  const withSym = { ...p, files: [...p.files, { name: `${name}.asy`, kind: 'symbol' as const, text: readFileSync(`${SYM}/${name}.asy`, 'utf8') }] };
  if (looksBehavioral(text)) {
    const r = await compileIcarus(icarus, { [`${name}.v`]: text }, name);
    if (!r.vvp || !r.ports) throw new Error(`${name}.v: ${r.error}`);
    const block = cosimSubckt(name, r.ports, r.params ?? {}, vvpFileOf(name), `${name}.v`);
    return applySynth(setHdlMode(addVerilogModule(withSym, name, text), name, 'behavioral'), name, text, block, vvpForEngine(r.vvp));
  }
  const r = await synthesize(runYosys, { [`${name}.v`]: text }, `${name}.v`, name);
  if (r.error || !r.block) throw new Error(`${name}.v: ${r.error}`);
  return applySynth(addVerilogModule(withSym, name, text), name, text, r.block);
}

// --- esquemáticos --------------------------------------------------------------------------------

type Pt = [number, number];
/** Pines de un símbolo de la biblioteca: nombre sin el rango → posición relativa y el rango */
const pinsOf = (type: string) =>
  new Map(
    [...readFileSync(`${SYM}/${type}.asy`, 'utf8').matchAll(/^PIN (-?\d+) (-?\d+) \w+ \d+\nPINATTR PinName (\S+)/gm)].map((m) => [
      m[3].replace(/\[.*$/, ''),
      { x: +m[1], y: +m[2], range: /\[.*$/.exec(m[3])?.[0] ?? '' },
    ]),
  );
const spiceLineOf = (type: string) => /^SYMATTR SpiceLine (.*)$/m.exec(readFileSync(`${SYM}/${type}.asy`, 'utf8'))![1];

/** Bus de 16 bits */
const bus = (n: string) => `${n}[15:0]`;

class Sheet {
  private lines: string[] = [];
  private n = 0;
  /** La instancia del último bloque (la salida de cada diseño se grafica desde su pin) */
  last = '';
  /**
   * Un bloque en (x, y); R90 lo gira un cuarto de vuelta (el tap, apuntando hacia abajo).
   * Devuelve el nombre de la instancia y dónde quedó cada pin.
   */
  block(type: string, x: number, y: number, params: Record<string, number> = {}, rot: 'R0' | 'R90' = 'R0') {
    const inst = `X${++this.n}`;
    this.lines.push(`SYMBOL ${type} ${x} ${y} ${rot}`);
    // (los taps, girados, sin el nombre: al costado va su coeficiente)
    if (rot === 'R90') this.lines.push('WINDOW 0 0 0 Invisible 2');
    this.lines.push(`SYMATTR InstName ${inst}`);
    this.last = inst.toLowerCase();
    if (Object.keys(params).length) {
      let line = spiceLineOf(type);
      for (const [k, v] of Object.entries(params)) line = line.replace(new RegExp(`\\b${k}=\\S+`), `${k}=${v}`);
      this.lines.push(`SYMATTR SpiceLine ${line}`);
    }
    const pins: Record<string, Pt> = {};
    for (const [name, p] of pinsOf(type)) pins[name] = rot === 'R90' ? [x - p.y, y + p.x] : [x + p.x, y + p.y];
    return { inst: inst.toLowerCase(), pins };
  }
  /** Cable por los puntos (horizontales y verticales) */
  wire(...pts: Pt[]) {
    for (let i = 1; i < pts.length; i++) this.lines.push(`WIRE ${pts[i - 1][0]} ${pts[i - 1][1]} ${pts[i][0]} ${pts[i][1]}`);
  }
  flag(at: Pt, name: string) {
    this.lines.push(`FLAG ${at[0]} ${at[1]} ${name}`);
  }
  /** Una etiqueta en la punta de un cable corto que sale del pin hacia `dir` */
  stub(at: Pt, dir: Pt, name: string, len = 32) {
    const end: Pt = [at[0] + dir[0] * len, at[1] + dir[1] * len];
    this.wire(at, end);
    this.flag(end, name);
  }
  /**
   * El reloj de 1 MHz: el bloque dsp_clock, que corre adentro del módulo único de Icarus (sin fuente
   * de pulsos ni puentes a lo analógico); su salida, la etiqueta clk
   */
  clock(x: number, y: number) {
    // (no es la salida del diseño: el último bloque sigue siendo el de antes)
    const keep = this.last;
    const c = this.block('dsp_clock', x, y + 48);
    this.last = keep;
    this.stub(c.pins.clk, [1, 0], 'clk');
    this.text(x - 40, y + 112, ';1 MHz clock');
  }
  text(x: number, y: number, s: string, size = 2) {
    this.lines.push(`TEXT ${x} ${y} Left ${size} ${s}`);
  }
  /** El .asc y la instancia cuya salida y es la del diseño */
  done(w: number, h: number, out = this.last) {
    return { asc: ['Version 4', `SHEET 1 ${w} ${h}`, ...this.lines].join('\n') + '\n', out };
  }
}

/** Entero de un coeficiente con F bits fraccionarios */
const q = (c: number, f = 15) => Math.round(c * 2 ** f);
const fmt = (c: number) => (Math.abs(c) < 0.1 ? c.toFixed(4) : c.toFixed(3));

/** Pasabajos FIR de N taps: sinc con ventana de Hamming, ganancia 1 en continua */
function firCoefs(n: number, fc: number): number[] {
  const h = Array.from({ length: n }, (_, k) => {
    const m = k - (n - 1) / 2;
    const sinc = m === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * m) / (Math.PI * m);
    return sinc * (0.54 - 0.46 * Math.cos((2 * Math.PI * k) / (n - 1)));
  });
  const s = h.reduce((a, b) => a + b, 0);
  return h.map((c) => c / s);
}

/** Biquad pasabajos Butterworth (transformación bilineal): b0 b1 b2 a1 a2 */
function biquadLp(fc: number) {
  const k = Math.tan(Math.PI * fc);
  const norm = 1 / (1 + Math.SQRT2 * k + k * k);
  const b0 = k * k * norm;
  return { b0, b1: 2 * b0, b2: b0, a1: 2 * (k * k - 1) * norm, a2: (1 - Math.SQRT2 * k + k * k) * norm };
}

/** Fuente de la señal x: impulso, escalón o seno (NCO) de f Hz */
type Source = { kind: 'impulse' | 'step'; value: number } | { kind: 'sine'; f: number };
/** La fuente en (x, y) con su reloj; devuelve el pin de salida */
function source(s: Sheet, src: Source, x: number, y: number): Pt {
  const b = src.kind === 'sine' ? s.block('dsp_nco', x, y, { FREQ: Math.round((src.f / 1e6) * 65536) }) : s.block('dsp_impulse', x, y, { VALUE: src.value, STEP: src.kind === 'step' ? 1 : 0 });
  s.stub(b.pins.clk, [0, 1], 'clk');
  const what = src.kind === 'sine' ? `${src.f / 1e3} kHz` : src.kind === 'step' ? `step ${fmt(src.value / 32768)}` : `impulse ${fmt(src.value / 32768)}`;
  s.text(x - 40, y - 80, `;${what}`);
  // la etiqueta de la señal, sobre el cable que sale (lejos del bloque)
  return b.pins.y;
}

/** Un retardo z⁻¹ en (x, y) con su reloj por etiqueta */
function delay(s: Sheet, x: number, y: number, clk = 'clk') {
  const d = s.block('dsp_delay', x, y);
  s.stub(d.pins.clk, [0, 1], clk);
  return d.pins;
}

/**
 * Realimentación por un z⁻¹: desde `node` (sobre la línea de la señal, y = 0) sube a y = −288, va a
 * la izquierda hasta pasar el retardo y entra por su d; la salida q baja a la entrada b de `into`.
 * El retardo va arriba y a la izquierda de `into` (sin cruzar cables). Devuelve el pin q.
 */
function feedback(s: Sheet, node: Pt, into: Pt): Pt {
  const d = delay(s, into[0] - 128, -192);
  const left = d.d[0] - 32;
  s.wire(node, [node[0], -288], [left, -288], [left, d.d[1]], d.d);
  s.wire(d.q, [into[0], d.q[1]], into);
  return d.q;
}

/**
 * El registro de salida: un z⁻¹ más al final, para que la salida cambie toda junta con el reloj (la
 * de un sumador tiene las carreras de sus compuertas). Se grafica su q; queda como el último bloque.
 */
function output(s: Sheet, from: Pt) {
  const r = delay(s, from[0] + 160, from[1]);
  s.wire(from, r.d);
  const end: Pt = [r.q[0] + 96, r.q[1]];
  s.wire(r.q, end);
  s.flag(end, bus('y'));
  s.text(from[0] + 104, from[1] - 72, ';output register');
}

/** Separación entre columnas de la forma directa (un z⁻¹ entre cada par) */
const COL = 288;

/**
 * Forma directa: la línea de retardos arriba (y = 0), un tap por columna hacia abajo y la cadena de
 * sumadores (y = 352). `inputs[k]` es la señal de la columna k: la de la izquierda entra por un
 * cable; las que dicen `{ flag }` arrancan una línea de retardos nueva desde una etiqueta (la
 * realimentación de un IIR). Devuelve el pin de salida del último sumador.
 */
function directForm(s: Sheet, x0: Pt, taps: { coef: number; f?: number; label: string; restart?: string }[]): Pt {
  const top = 0;
  const sumY = 352;
  let prev: Pt = x0;
  let acc: Pt | undefined;
  // (una línea que arranca de una etiqueta va más separada: el rótulo no queda pegado a la columna anterior)
  let extra = 0;
  taps.forEach((tp, k) => {
    if (tp.restart) extra += COL / 2;
    const cx = 160 + COL * k + extra;
    if (k > 0) {
      // un retardo entre la columna anterior y esta (o una línea nueva desde una etiqueta)
      const d = delay(s, cx - COL / 2, top);
      if (tp.restart) s.stub(d.d, [-1, 0], bus(tp.restart));
      else s.wire(prev, d.d);
      prev = d.q;
    }
    s.wire(prev, [cx, top]);
    prev = [cx, top];
    const t = s.block('dsp_tap', cx, 160, { COEF: tp.coef, ...(tp.f ? { F: tp.f } : {}) }, 'R90');
    s.wire([cx, top], t.pins.x);
    s.text(cx + 48, 168, `;${tp.label}`);
    if (!acc) {
      // el primer tap baja hasta la altura de la cadena y entra al primer sumador por izquierda
      s.wire(t.pins.y, [cx, sumY]);
      acc = [cx, sumY];
      return;
    }
    const a = s.block('dsp_add', cx, sumY);
    s.wire(acc, a.pins.a);
    s.wire(t.pins.y, a.pins.b);
    acc = a.pins.y;
  });
  return acc!;
}

export const FIR = firCoefs(8, 0.1);
function fir(src: Source, stop = '100u') {
  const s = new Sheet();
  const x = source(s, src, -96, 0);
  s.flag([x[0] + 64, x[1]], bus('x'));
  const y = directForm(
    s,
    x,
    FIR.map((c, k) => ({ coef: q(c), label: `h${k} = ${fmt(c)}` })),
  );
  output(s, y);
  s.clock(-96, 528);
  s.text(-136, -176, ';FIR low-pass, 8 taps, direct form: Hamming-windowed sinc, fc = 100 kHz at fs = 1 MHz. Data and coefficients in Q1.15', 3);
  s.text(-136, 704, `!.tran 0 ${stop}`);
  return s.done(2600, 800);
}

function iir1() {
  const s = new Sheet();
  const x = source(s, { kind: 'step', value: 16384 }, -96, 0);
  s.flag([x[0] + 64, x[1]], bus('x'));
  // e = x − y[n−1] → ×2⁻⁴ → y = y[n−1] + e/16
  const sub = s.block('dsp_sub', 160, 0);
  s.wire(x, sub.pins.a);
  const sh = s.block('dsp_shift', 416, 0, { K: -4 });
  s.wire(sub.pins.y, sh.pins.x);
  s.text(376, 64, ';× 1/16');
  const add = s.block('dsp_add', 736, 0);
  s.wire(sh.pins.y, add.pins.a);
  const node: Pt = [add.pins.y[0] + 96, 0];
  s.wire(add.pins.y, node);
  // y[n−1]: a la entrada b del sumador por cable y a la del restador por etiqueta
  const q1 = feedback(s, node, add.pins.b);
  s.flag([q1[0] + 32, q1[1]], bus('y1'));
  s.stub(sub.pins.b, [0, -1], bus('y1'));
  // (el registro de salida al final: es el último bloque, el que se grafica)
  output(s, node);
  s.clock(-96, 240);
  s.text(-136, -416, ';First-order IIR low-pass: y[n] = y[n−1] + (x[n] − y[n−1]) / 16, a time constant of about 16 samples (16 µs)', 3);
  s.text(-136, 416, '!.tran 0 120u');
  return s.done(1400, 500);
}

export const BIQUAD = biquadLp(0.05);
function biquad(src: Source) {
  const s = new Sheet();
  const x = source(s, src, -96, 0);
  s.flag([x[0] + 64, x[1]], bus('x'));
  // forma directa I: b0 b1 b2 sobre x[n], x[n−1], x[n−2]; −a1 −a2 sobre y[n−1], y[n−2] (en Q2.14)
  const c = BIQUAD;
  const f = 14;
  const y = directForm(s, x, [
    { coef: q(c.b0, f), f, label: `b0 = ${fmt(c.b0)}` },
    { coef: q(c.b1, f), f, label: `b1 = ${fmt(c.b1)}` },
    { coef: q(c.b2, f), f, label: `b2 = ${fmt(c.b2)}` },
    { coef: q(-c.a1, f), f, label: `−a1 = ${fmt(-c.a1)}`, restart: 'yn' },
    { coef: q(-c.a2, f), f, label: `−a2 = ${fmt(-c.a2)}` },
  ]);
  // y[n] (antes del registro de salida) es lo que vuelve por y[n−1], y[n−2]
  s.flag([y[0] + 32, y[1]], bus('yn'));
  output(s, y);
  s.clock(-96, 528);
  s.text(-136, -176, ';Biquad Butterworth low-pass, direct form I: fc = 50 kHz at fs = 1 MHz. Coefficients in Q2.14 (F = 14), the feedback ones with their sign changed', 3);
  s.text(-136, 704, '!.tran 0 60u');
  return s.done(2100, 800);
}

function cic() {
  const s = new Sheet();
  const wrap = { SAT: 0 };
  const x = source(s, { kind: 'step', value: 256 }, -96, 0);
  s.flag([x[0] + 64, x[1]], bus('x'));
  let prev = x;
  // dos integradores a 1 MHz: y = x + y[n−1], el retardo arriba de cada sumador
  for (const [k, cx] of [160, 640].entries()) {
    const a = s.block('dsp_add', cx, 0, wrap);
    s.wire(prev, a.pins.a);
    const node: Pt = [cx + 160, 0];
    s.wire(a.pins.y, node);
    feedback(s, node, a.pins.b);
    s.text(cx - 40, 96, `;integrator ${k + 1}`);
    prev = node;
  }
  // ↓8: la muestra y su reloj (125 kHz) para los peines
  const ds = s.block('dsp_downsample', 1088, 0, { M: 8 });
  s.wire(prev, ds.pins.x);
  s.stub(ds.pins.clk, [0, 1], 'clk');
  s.stub(ds.pins.clko, [0, -1], 'clkd');
  s.text(1128, 96, ';↓8');
  prev = ds.pins.y;
  // dos peines a 125 kHz: y = x − x[n−1]
  for (const [k, cx] of [1408, 1792].entries()) {
    const node: Pt = [cx - 160, 0];
    s.wire(prev, node);
    const sub = s.block('dsp_sub', cx, 0, wrap);
    s.wire(node, sub.pins.a);
    const d = delay(s, cx - 64, -192, 'clkd');
    s.wire(node, [node[0], d.d[1]], d.d);
    s.wire(d.q, [sub.pins.b[0], d.q[1]], sub.pins.b);
    s.text(cx - 40, 96, `;comb ${k + 1}`);
    prev = sub.pins.y;
  }
  output(s, prev);
  s.clock(-96, 240);
  s.text(-136, -416, ';CIC decimator, N = 2, R = 8: integrators at 1 MHz, combs at 125 kHz, wrap-around arithmetic (SAT = 0). DC gain R^N = 64: a step of 256 settles at 16384', 3);
  s.text(-136, 416, '!.tran 0 60u');
  return s.done(2300, 500);
}

function mixer() {
  const s = new Sheet();
  const a = source(s, { kind: 'sine', f: 50e3 }, -96, 0);
  s.flag([a[0] + 64, a[1]], bus('a'));
  const b = source(s, { kind: 'sine', f: 60e3 }, 160, -256);
  s.flag([b[0] + 64, b[1]], bus('b'));
  const m = s.block('dsp_mul', 352, 0);
  s.wire(a, m.pins.a);
  s.wire(b, [m.pins.b[0], b[1]], m.pins.b);
  output(s, m.pins.y);
  s.clock(-96, 240);
  s.text(-136, -432, ';Two NCOs (50 kHz and 60 kHz) and their product: 10 kHz and 110 kHz, since sin a · sin b = [cos(a − b) − cos(a + b)] / 2', 3);
  s.text(-136, 416, '!.tran 0 200u');
  return s.done(1100, 500);
}

// --- proyecto ------------------------------------------------------------------------------------

/**
 * Las trazas: arriba, como un analizador lógico, las redes entre bloques (`x`, que son digitales) y
 * la salida del registro del final, en decimal con signo; abajo, las mismas como el número real
 * que representan en Q1.15 (signed(…, 16) / 32768).
 */
const view = (nets: string[], out: string, split = false): SimView => {
  const colors = ['#2f9e44', '#1c7ed6', '#e03131', '#f08c00'];
  const buses = [...nets.map((n) => `Dig(${bus(n)})`), `Dig(${out}.${bus('q')})`];
  const color = (i: number) => colors[i % colors.length];
  const real = (b: string, i: number) => ({ expr: `signed(${b}, 16)/32768`, color: color(i) });
  // split: las entradas en un panel y la salida en otro (el mezclador: si no, no se ve el batido)
  const analog = split ? [{ traces: buses.slice(0, -1).map(real) }, { traces: [real(buses.at(-1)!, buses.length - 1)] }] : [{ traces: buses.map(real) }];
  return {
    panes: [...analog, { traces: buses.map((expr, i) => ({ expr, color: color(i), radix: 'sdec' })), digital: true }],
    active: 0,
    plot: 'tran1',
  } as SimView;
};

export async function build(): Promise<Project> {
  const now = Date.parse('2026-11-02T12:00:00-03:00');
  let p: Project = { name: 'DSP', created: now, modified: now, files: [], activeVariant: BENCHES, variants: [], groups: [] };
  for (const m of MODULES) p = await withVerilog(p, m);
  const groups = ['FIR', 'IIR', 'CIC', 'NCO and mixer'].map((name) => ({ id: newId('g'), name }));
  const bench = (g: number, name: string, d: { asc: string; out: string }, nets = ['x'], split = false): Sim => ({
    id: newId('s'),
    name,
    asc: d.asc,
    view: view(nets, d.out, split),
    runs: [],
    group: groups[g].id,
  });
  const sims = [
    bench(0, 'Impulse response', fir({ kind: 'impulse', value: 32767 }, '12u')),
    bench(0, 'Sine 20 kHz (passband)', fir({ kind: 'sine', f: 20e3 })),
    bench(0, 'Sine 300 kHz (stopband)', fir({ kind: 'sine', f: 300e3 }, '30u')),
    bench(1, 'First order: step', iir1()),
    bench(1, 'Biquad: step', biquad({ kind: 'step', value: 16384 })),
    bench(2, 'Step response', cic()),
    bench(3, 'Mixer 50 kHz × 60 kHz', mixer(), ['a', 'b'], true),
  ];
  return { ...p, modified: now, groups, variants: [{ id: BENCHES, name: 'DSP', base: sims[0].asc, activeSim: sims[0].id, sims }] };
}
