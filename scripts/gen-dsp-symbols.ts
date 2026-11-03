// Símbolos de la biblioteca DSP (#366): sintetiza cada módulo de library/verilog/DSP con Yosys
// (de ahí salen el orden de los pines y los parameter, como en verilogSymbol) y escribe su símbolo
// dibujado en library/sym/DSP: el dibujo de los diagramas de bloques (Σ en un círculo, el tap como
// triángulo, z⁻¹ en una caja con el reloj abajo…), sin los nombres de los pines. El buscador los
// muestra como cualquier símbolo; al elegir uno, el .v se copia al proyecto y se sintetiza ahí (un
// símbolo que no es el generado conserva su dibujo).
// Uso: node scripts/gen-dsp-symbols.ts (después de cambiar los pines o parameter de un módulo)
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runYosys } from '@yowasp/yosys';
import { synthesize } from '../src/hdl/yosys.ts';
import { verilogSymbol } from '../src/hdl/project.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'library', 'verilog', 'DSP');
const OUT = join(ROOT, 'library', 'sym', 'DSP');

type Pt = [number, number];
interface Drawing {
  /** pin → posición (sin el rango del bus) */
  pins: Record<string, Pt>;
  shapes: string[];
  /** dónde va el nombre de la instancia */
  name?: [number, number, string];
}

const line = (...pts: Pt[]) => pts.slice(1).map((p, i) => `LINE Normal ${pts[i][0]} ${pts[i][1]} ${p[0]} ${p[1]}`);
const text = (x: number, y: number, s: string, size = 2) => `TEXT ${x} ${y} Center ${size} ${s}`;
const box = (x1: number, y1: number, x2: number, y2: number) => `RECTANGLE Normal ${x1} ${y1} ${x2} ${y2}`;
/** El triangulito del reloj sobre el borde de abajo de una caja (en y) */
const clockMark = (y: number) => line([-8, y], [0, y - 10], [8, y]);

/** Nodo circular (Σ, ×): entradas a la izquierda y arriba (los taps bajan a la cadena de sumas), salida a la derecha */
const node = (glyph: string, signs?: [string, string]): Drawing => ({
  pins: { a: [-64, 0], b: [0, -64], y: [64, 0] },
  shapes: [
    'CIRCLE Normal -24 -24 24 24',
    ...line([-64, 0], [-24, 0]),
    ...line([0, -64], [0, -24]),
    ...line([24, 0], [64, 0]),
    text(0, 0, glyph, 3),
    ...(signs ? [text(-38, -12, signs[0], 1), text(14, -40, signs[1], 1)] : []),
  ],
  name: [-28, 32, 'Right'],
});

/** Ganancia: triángulo hacia la derecha, con un rótulo adentro */
const gain = (label: string): Drawing => ({
  pins: { x: [-64, 0], y: [64, 0] },
  shapes: [...line([-32, -32], [-32, 32], [32, 0], [-32, -32]), ...line([-64, 0], [-32, 0]), ...line([32, 0], [64, 0]), ...(label ? [text(-12, 0, label, 1)] : [])],
  name: [0, -40, 'Bottom'],
});

/** Caja con el reloj abajo y la salida a la derecha (y una entrada a la izquierda si `input`) */
const clocked = (label: string, input?: string, extra: Partial<Drawing['pins']> = {}): Drawing => ({
  pins: { clk: [0, 64], ...(input ? { [input]: [-64, 0] as Pt } : {}), ...extra },
  shapes: [box(-32, -32, 32, 32), ...clockMark(32), ...line([0, 32], [0, 64]), ...(input ? line([-64, 0], [-32, 0]) : []), text(0, -4, label, 3)],
  name: [0, -40, 'Bottom'],
});

/**
 * Caja genérica: entradas a la izquierda, salidas a la derecha y los de control (clk, rst, en, sel…)
 * abajo, cada pin con su nombre adentro (salvo que sea sólo x → y). `label`: el rótulo del medio;
 * `bubble`: un círculo de negación en la salida (NOT).
 */
function blk(label: string, ins: string[], outs: string[], bottom: string[] = [], opts: { bubble?: boolean; top?: string[] } = {}): Drawing {
  const rows = Math.max(ins.length, outs.length, 1);
  const h = 32 * rows + 32;
  const ys = (n: number) => Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * 32);
  const xs = (n: number) => Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * 32);
  const named = !(ins.length <= 1 && outs.length === 1 && ins[0] !== 'trig' && bottom.length === 0) || (ins.length === 1 && bottom.length > 0);
  // (con los nombres de los pines adentro, más ancha: que no se toquen con el rótulo ni con el borde)
  const w = named || bottom.length > 2 ? 64 : 48;
  const pins: Record<string, Pt> = {};
  const shapes = [box(-w, -h / 2, w, h / 2)];
  ins.forEach((p, k) => {
    pins[p] = [-w - 16, ys(ins.length)[k]];
    shapes.push(...line([-w - 16, ys(ins.length)[k]], [-w, ys(ins.length)[k]]));
    if (named) shapes.push(`TEXT ${-w + 6} ${ys(ins.length)[k]} Left 1 ${p}`);
  });
  outs.forEach((p, k) => {
    const y = ys(outs.length)[k];
    const edge = opts.bubble ? w + 12 : w;
    pins[p] = [w + 16, y];
    if (opts.bubble) shapes.push(`CIRCLE Normal ${w} ${y - 6} ${w + 12} ${y + 6}`);
    shapes.push(...line([edge, y], [w + 16, y]));
    if (named) shapes.push(`TEXT ${w - 6} ${y} Right 1 ${p === 'prbs' ? 'bit' : p}`);
  });
  bottom.forEach((p, k) => {
    const x = xs(bottom.length)[k];
    pins[p] = [x, h / 2 + 32];
    shapes.push(...line([x, h / 2], [x, h / 2 + 32]));
    if (p === 'clk') shapes.push(...line([x - 8, h / 2], [x, h / 2 - 10], [x + 8, h / 2]));
    else shapes.push(`TEXT ${x} ${h / 2 - 10} Center 1 ${p}`);
  });
  (opts.top ?? []).forEach((p) => {
    pins[p] = [0, -h / 2 - 32];
    shapes.push(...line([0, -h / 2], [0, -h / 2 - 32]), `TEXT 0 ${-h / 2 + 10} Center 1 ${p}`);
  });
  // el rótulo: al medio si los pines no tienen nombre; si no, arriba
  shapes.push(text(0, named && rows > 1 ? -h / 2 + 14 : named ? -h / 2 + 12 : 0, label, named ? 2 : 3));
  return { pins, shapes, name: opts.top?.length ? [w + 8, -h / 2 - 8, 'Left'] : [0, -h / 2 - 8, 'Bottom'] };
}

/** Multiplexor: trapecio (más alto del lado de las entradas) con sel abajo */
function mux(ins: string[], outs: string[], sel: string, label: string): Drawing {
  const n = Math.max(ins.length, outs.length);
  const h = 32 * n + 32;
  const ys = (m: number) => Array.from({ length: m }, (_, k) => (k - (m - 1) / 2) * 32);
  const wide = ins.length >= outs.length;
  const [l, r] = wide ? [h / 2, h / 2 - 16] : [h / 2 - 16, h / 2];
  const pins: Record<string, Pt> = { [sel]: [0, h / 2 + 24] };
  const shapes = [...line([-32, -l], [32, -r], [32, r], [-32, l], [-32, -l]), ...line([0, h / 2 - 8], [0, h / 2 + 24]), `TEXT 8 ${h / 2 + 12} Left 1 ${sel}`, text(0, 0, label, 1)];
  ins.forEach((p, k) => {
    pins[p] = [-64, ys(ins.length)[k]];
    shapes.push(...line([-64, ys(ins.length)[k]], [-32, ys(ins.length)[k]]));
    if (ins.length > 1) shapes.push(`TEXT -26 ${ys(ins.length)[k]} Left 0 ${k}`);
  });
  outs.forEach((p, k) => {
    pins[p] = [64, ys(outs.length)[k]];
    shapes.push(...line([32, ys(outs.length)[k]], [64, ys(outs.length)[k]]));
    if (outs.length > 1) shapes.push(`TEXT 26 ${ys(outs.length)[k]} Right 0 ${k}`);
  });
  return { pins, shapes, name: [0, -h / 2 - 8, 'Bottom'] };
}

/** Pin por pin de las cajas: [rótulo, entradas, salidas, abajo] */
const BOXES: Record<string, [string, string[], string[], string[]?]> = {
  dsp_abs: ['|x|', ['x'], ['y']],
  dsp_requant: ['Q', ['x'], ['y']],
  dsp_sum4: ['Σ', ['a', 'b', 'c', 'd'], ['y']],
  dsp_minmax: ['min max', ['a', 'b'], ['mn', 'mx']],
  dsp_cmp: ['a : b', ['a', 'b'], ['lt', 'eq', 'gt']],
  dsp_mac: ['MAC', ['a', 'b'], ['acc'], ['clk', 'clr']],
  dsp_integrator: ['∫', ['x'], ['y'], ['clk', 'clr']],
  dsp_diff: ['1−z⁻¹', ['x'], ['y'], ['clk']],
  dsp_popcount: ['#1', ['x'], ['n']],
  dsp_clz: ['CLZ', ['x'], ['n']],
  dsp_and: ['&', ['a', 'b'], ['y']],
  dsp_or: ['≥1', ['a', 'b'], ['y']],
  dsp_xor: ['=1', ['a', 'b'], ['y']],
  dsp_mask: ['& M', ['x'], ['y']],
  dsp_rotate: ['↻K', ['x'], ['y']],
  dsp_bitrev: ['rev', ['x'], ['y']],
  dsp_bin2gray: ['B→G', ['x'], ['y']],
  dsp_gray2bin: ['G→B', ['x'], ['y']],
  dsp_parity: ['P', ['x'], ['p']],
  dsp_decoder: ['DEC', ['sel'], ['y'], ['en']],
  dsp_prienc: ['PRI', ['x'], ['idx', 'valid']],
  dsp_split: ['split', ['x'], ['hi', 'lo']],
  dsp_join: ['join', ['hi', 'lo'], ['y']],
  dsp_counter: ['CTR', [], ['q', 'tc'], ['clk', 'rst', 'en', 'down']],
  dsp_lfsr: ['LFSR', [], ['q', 'prbs'], ['clk']],
  dsp_shiftreg: ['SIPO', ['d'], ['q'], ['clk']],
  dsp_piso: ['PISO', ['x'], ['q'], ['clk', 'load']],
  dsp_edge: ['EDGE', ['d'], ['rise', 'fall'], ['clk']],
  dsp_sync: ['SYNC', ['d'], ['q'], ['clk']],
  dsp_pwm: ['PWM', ['duty'], ['q'], ['clk']],
  dsp_debounce: ['DEB', ['d'], ['q'], ['clk']],
  dsp_oneshot: ['1-shot', ['trig'], ['q'], ['clk']],
  dsp_ram: ['RAM', ['addr', 'd'], ['q'], ['clk', 'we']],
  dsp_movavg: ['AVG', ['x'], ['y'], ['clk']],
  dsp_envelope: ['ENV', ['x'], ['y'], ['clk']],
  dsp_sqrt: ['√x', ['x'], ['y']],
  dsp_cordic: ['CORDIC', ['phase'], ['cos', 'sin']],
  dsp_magphase: ['|z| ∠z', ['x', 'y'], ['mag', 'phase']],
  dsp_cmul: ['× I/Q', ['ar', 'ai', 'br', 'bi'], ['yr', 'yi']],
  dsp_sdm: ['ΣΔ', ['x'], ['q'], ['clk']],
  dsp_fir8: ['FIR', ['x'], ['y'], ['clk']],
  dsp_biquad: ['biquad', ['x'], ['y'], ['clk']],
  dsp_cic: ['CIC ↓R', ['x'], ['y', 'valid'], ['clk']],
  dsp_fifo: ['FIFO', ['d'], ['q', 'empty', 'full'], ['clk', 'wr', 'rd']],
  dsp_ramp: ['ramp', [], ['y'], ['clk']],
};

const DRAW: Record<string, Drawing> = {
  ...Object.fromEntries(Object.entries(BOXES).map(([k, [label, ins, outs, bottom]]) => [k, blk(label, ins, outs, bottom)])),
  dsp_not: blk('1', ['x'], ['y'], [], { bubble: true }),
  // una onda cuadrada
  dsp_clock: {
    pins: { clk: [64, 0] },
    shapes: [box(-32, -24, 32, 24), ...line([32, 0], [64, 0]), ...line([-20, 8], [-10, 8], [-10, -8], [0, -8], [0, 8], [10, 8], [10, -8], [20, -8])],
    name: [0, -32, 'Bottom'],
  },
  dsp_div: node('÷'),
  dsp_mux2: mux(['a', 'b'], ['y'], 'sel', ''),
  dsp_mux4: mux(['a', 'b', 'c', 'd'], ['y'], 'sel', ''),
  dsp_demux2: mux(['x'], ['a', 'b'], 'sel', ''),
  dsp_upsample: (() => {
    const d = clocked('↑L', 'x', { y: [64, 0], clko: [0, -64] });
    return { ...d, shapes: [...d.shapes, ...line([32, 0], [64, 0]), ...line([0, -32], [0, -64])], name: [40, -40, 'Left'] };
  })(),
  dsp_add: node('Σ', ['+', '+']),
  dsp_sub: node('Σ', ['+', '−']),
  dsp_mul: node('×'),
  dsp_tap: gain('h'),
  dsp_shift: gain('2ᴷ'),
  dsp_neg: gain('−1'),
  dsp_const: { pins: { y: [64, 0] }, shapes: [box(-32, -24, 32, 24), ...line([32, 0], [64, 0]), text(0, 0, 'C', 3)], name: [0, -32, 'Bottom'] },
  dsp_delay: (() => {
    const d = clocked('z⁻¹', 'd', { q: [64, 0] });
    return { ...d, shapes: [...d.shapes, ...line([32, 0], [64, 0])] };
  })(),
  dsp_impulse: (() => {
    // un impulso dibujado: el eje y una barra con su punta
    const d = clocked('', undefined, { y: [64, 0] });
    return { ...d, shapes: [...d.shapes, ...line([32, 0], [64, 0]), ...line([-20, 12], [20, 12]), ...line([-6, 12], [-6, -18]), 'CIRCLE Normal -10 -22 -2 -14', text(10, -6, 'δ', 2)] };
  })(),
  dsp_nco: (() => {
    const d = clocked('NCO', undefined, { y: [64, 0] });
    // una onda chiquita abajo del rótulo
    const wave: Pt[] = Array.from({ length: 9 }, (_, k) => [-16 + 4 * k, 14 + Math.round(-6 * Math.sin((k * Math.PI) / 4))]);
    return { ...d, shapes: [...d.shapes.map((s) => s.replace(/^TEXT 0 -4 /, 'TEXT 0 -10 ')), ...line([32, 0], [64, 0]), ...line(...wave)] };
  })(),
  dsp_downsample: (() => {
    const d = clocked('↓M', 'x', { y: [64, 0], clko: [0, -64] });
    return { ...d, shapes: [...d.shapes, ...line([32, 0], [64, 0]), ...line([0, -32], [0, -64])], name: [40, -40, 'Left'] };
  })(),
  dsp_clkdiv: { pins: { clk: [-64, 0], clko: [64, 0] }, shapes: [box(-32, -24, 32, 24), ...line([-64, 0], [-32, 0]), ...line([32, 0], [64, 0]), text(0, 0, '÷N', 3)], name: [0, -32, 'Bottom'] },
};

/** El símbolo dibujado: los atributos y el orden de los pines del generado, la geometría de DRAW */
function drawn(name: string, generated: string): string {
  const d = DRAW[name];
  if (!d) throw new Error(`${name}: falta su dibujo en DRAW`);
  const attrs = generated.split('\n').filter((l) => /^SYMATTR /.test(l));
  const pins = [...generated.matchAll(/^PINATTR PinName (\S+)\nPINATTR SpiceOrder (\d+)/gm)].map((m) => ({ name: m[1], order: m[2] }));
  const [nx, ny, nAlign] = d.name ?? [0, -40, 'Bottom'];
  const out = ['Version 4', 'SymbolType CELL', ...d.shapes, `WINDOW 0 ${nx} ${ny} ${nAlign} 2`, 'WINDOW 3 0 0 Invisible 2', ...attrs];
  for (const p of pins) {
    const at = d.pins[p.name.replace(/\[.*$/, '')];
    if (!at) throw new Error(`${name}: el pin ${p.name} no está en el dibujo`);
    out.push(`PIN ${at[0]} ${at[1]} NONE 0`, `PINATTR PinName ${p.name}`, `PINATTR SpiceOrder ${p.order}`);
  }
  if (pins.length !== Object.keys(d.pins).length) throw new Error(`${name}: el dibujo tiene pines que el módulo no tiene`);
  return out.join('\n') + '\n';
}

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(SRC).filter((x) => x.endsWith('.v'))) {
  const name = f.replace(/\.v$/, '');
  const r = await synthesize(runYosys, { [f]: readFileSync(join(SRC, f), 'utf8') }, f, name);
  if (!r.block) throw new Error(`${f}: ${r.error}`);
  writeFileSync(join(OUT, `${name}.asy`), drawn(name, verilogSymbol(name, r.block)));
  console.log(`${name}: ${r.block.pins.length} pines`);
}

// El ADC y el DAC ideales no son Verilog: su .subckt está en library/sub/DSP (fuentes B)
const ANALOG: { name: string; label: string; ins: string[]; outs: string[]; desc: string }[] = [
  { name: 'dsp_adc', label: 'ADC', ins: ['vin'], outs: ['d[15:0]'], desc: 'Ideal 16-bit ADC: vin (−vref … +vref) → a Q1.15 word' },
  { name: 'dsp_dac', label: 'DAC', ins: ['d[15:0]'], outs: ['vout'], desc: 'Ideal 16-bit DAC: a Q1.15 word → vout = vref · word / 32768' },
];
for (const a of ANALOG) {
  const d = blk(
    a.label,
    a.ins.map((p) => p.replace(/\[.*$/, '')),
    a.outs.map((p) => p.replace(/\[.*$/, '')),
  );
  const [nx, ny, nAlign] = d.name ?? [0, -40, 'Bottom'];
  const out = ['Version 4', 'SymbolType CELL', ...d.shapes, `WINDOW 0 ${nx} ${ny} ${nAlign} 2`, 'WINDOW 3 0 0 Invisible 2'];
  out.push('SYMATTR SpiceLine vref=1 vcc=5', 'SYMATTR Prefix X', `SYMATTR Value ${a.name}`, `SYMATTR ModelFile DSP/${a.name}.sub`, `SYMATTR Description ${a.desc}`);
  [...a.ins, ...a.outs].forEach((p, k) => {
    const at = d.pins[p.replace(/\[.*$/, '')];
    out.push(`PIN ${at[0]} ${at[1]} NONE 0`, `PINATTR PinName ${p}`, `PINATTR SpiceOrder ${k + 1}`);
  });
  writeFileSync(join(OUT, `${a.name}.asy`), out.join('\n') + '\n');
  console.log(`${a.name}: ${a.ins.length + a.outs.length} pines`);
}
