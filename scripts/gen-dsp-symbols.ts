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

const DRAW: Record<string, Drawing> = {
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
