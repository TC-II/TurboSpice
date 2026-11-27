// Símbolos de la biblioteca 74HC: sintetiza cada módulo de library/verilog/74HC con Yosys (de ahí
// salen el orden de los pines, como en verilogSymbol) y escribe su símbolo en library/sym/74HC, con
// la familia 74HC como interfaz eléctrica. Las compuertas y el 74 van de a una por símbolo, con su
// forma; los integrados MSI, como una caja con el número de patita de cada pin. Un pin activo en
// bajo (…_n) lleva el círculo de negado y su nombre sin el _n.
// Uso: node scripts/gen-74hc-symbols.ts (después de cambiar los pines de un módulo)
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runYosys } from '@yowasp/yosys';
import { synthesize } from '../src/hdl/yosys.ts';
import { verilogSymbol } from '../src/hdl/project.ts';
import { electricalLine, FAMILIES } from '../src/hdl/electrical.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'library', 'verilog', '74HC');
const OUT = join(ROOT, 'library', 'sym', '74HC');
const HC = FAMILIES.find((f) => f.name.startsWith('74HC '))!.values;

type Pt = [number, number];
interface Drawing {
  pins: Record<string, Pt>;
  shapes: string[];
  /** dónde va el nombre de la instancia */
  name: [number, number, string];
}

const line = (...pts: Pt[]) => pts.slice(1).map((p, i) => `LINE Normal ${pts[i][0]} ${pts[i][1]} ${p[0]} ${p[1]}`);
const text = (x: number, y: number, s: string, align = 'Center', size = 1) => `TEXT ${x} ${y} ${align} ${size} ${s}`;
const bubble = (x: number, y: number) => `CIRCLE Normal ${x - 4} ${y - 4} ${x + 4} ${y + 4}`;

// --- compuertas de 2 entradas (las formas de library/sym/Digital, centradas en y = 0) ---
const AND = [...line([-24, -32], [-24, 32]), ...line([-24, -32], [-12, -32]), ...line([-24, 32], [-12, 32]), 'ARC Normal -44 -32 20 32 -12 -32 -12 32'];
const OR = ['ARC Normal -96 -32 32 96 -32 -32 23 0', 'ARC Normal -96 -96 32 32 23 0 -32 32', 'ARC Normal -152 -64 -23 65 -32 -32 -32 32'];
function gate(body: 'and' | 'or' | 'xor', inverted: boolean): Drawing {
  const tip = body === 'and' ? 20 : 23;
  const x0 = body === 'xor' ? -48 : -32;
  // (las entradas llegan hasta la curva de atrás de la OR)
  const back = body === 'and' ? -24 : body === 'or' ? -25 : -33;
  const shapes = [
    ...(body === 'and' ? AND : OR),
    ...(body === 'xor' ? ['ARC Normal -160 -64 -31 65 -40 -32 -40 32'] : []),
    ...line([x0, -16], [back, -16]),
    ...line([x0, 16], [back, 16]),
    ...(inverted ? [bubble(tip + 4, 0), ...line([tip + 8, 0], [32, 0])] : line([tip, 0], [32, 0])),
  ];
  return { pins: { A: [x0, -16], B: [x0, 16], Y: [32, 0] }, shapes, name: [0, -40, 'Bottom'] };
}
const TRIANGLE = line([8, -24], [52, 0], [8, 24], [8, -24]);

// --- cajas: el 74 y los MSI ---
interface BoxPin {
  pin: string;
  /** número de patita (DIP) */
  n?: number;
  /** rótulo adentro de la caja (por omisión, el nombre sin _n y con el círculo; un rótulo propio, sin el círculo: Q̅) */
  label?: string;
  clock?: boolean;
}
/** Caja con las entradas a la izquierda y las salidas a la derecha, de a 32 */
function box(title: string, left: BoxPin[], right: BoxPin[]): Drawing {
  const rows = Math.max(left.length, right.length);
  const h = rows * 32;
  const top = -h / 2 - 16;
  const shapes = [`RECTANGLE Normal -64 ${top} 64 ${h / 2 + 16}`, text(0, top + 12, title, 'Center', 1)];
  const pins: Record<string, Pt> = {};
  const side = (list: BoxPin[], dir: -1 | 1) =>
    list.forEach((p, k) => {
      const y = -h / 2 + 16 + k * 32;
      const neg = /_n$/.test(p.pin) && !p.label;
      const label = p.label ?? p.pin.replace(/_n$/, '');
      pins[p.pin] = [dir * 96, y];
      shapes.push(...(neg ? [bubble(dir * 68, y), ...line([dir * 72, y], [dir * 96, y])] : line([dir * 64, y], [dir * 96, y])));
      if (p.clock) shapes.push(...line([-64, y - 6], [-56, y], [-64, y + 6]));
      shapes.push(text(dir * (p.clock ? 52 : 60), y, label, dir < 0 ? 'Left' : 'Right'));
      if (p.n !== undefined) shapes.push(text(dir * 84, y - 8, String(p.n), 'Center', 0));
    });
  side(left, -1);
  side(right, 1);
  return { pins, shapes, name: [0, top - 8, 'Bottom'] };
}
const pins = (spec: string): BoxPin[] =>
  spec.split(' ').map((s) => {
    const m = /^(\w+?)(?::(\d+))?(?:=(\S+))?(\^)?$/.exec(s)!;
    return { pin: m[1], ...(m[2] ? { n: Number(m[2]) } : {}), ...(m[3] ? { label: m[3] } : {}), ...(m[4] ? { clock: true } : {}) };
  });

const DRAW: Record<string, Drawing> = {
  hc00: gate('and', true),
  hc02: gate('or', true),
  hc08: gate('and', false),
  hc32: gate('or', false),
  hc86: gate('xor', false),
  hc04: { pins: { A: [0, 0], Y: [64, 0] }, shapes: [...TRIANGLE, ...line([0, 0], [8, 0]), bubble(56, 0), ...line([60, 0], [64, 0])], name: [24, -32, 'Bottom'] },
  // (OE_n abajo, con su círculo, hasta el borde del triángulo)
  hc125: {
    pins: { A: [0, 0], Y: [64, 0], OE_n: [32, 32] },
    shapes: [...TRIANGLE, ...line([0, 0], [8, 0]), ...line([52, 0], [64, 0]), bubble(32, 15), ...line([32, 19], [32, 32])],
    name: [24, -32, 'Bottom'],
  },
  hc74: box('74HC74', pins('D CLK^ PRE_n CLR_n'), pins('Q Q_n=Q̅')),
  hc138: box('74HC138', pins('A:1 B:2 C:3 G1:6 G2A_n:4 G2B_n:5'), pins('Y0_n:15 Y1_n:14 Y2_n:13 Y3_n:12 Y4_n:11 Y5_n:10 Y6_n:9 Y7_n:7')),
  hc151: box('74HC151', pins('D0:4 D1:3 D2:2 D3:1 D4:15 D5:14 D6:13 D7:12 A:11 B:10 C:9 G_n:7'), pins('Y:5 W:6')),
  hc157: box('74HC157', pins('A1:2=1A B1:3=1B A2:5=2A B2:6=2B A3:11=3A B3:10=3B A4:14=4A B4:13=4B S:1 G_n:15'), pins('Y1:4=1Y Y2:7=2Y Y3:9=3Y Y4:12=4Y')),
  hc161: box('74HC161', pins('A:3 B:4 C:5 D:6 ENP:7 ENT:10 LOAD_n:9 CLR_n:1 CLK:2^'), pins('QA:14 QB:13 QC:12 QD:11 RCO:15')),
  hc163: box('74HC163', pins('A:3 B:4 C:5 D:6 ENP:7 ENT:10 LOAD_n:9 CLR_n:1 CLK:2^'), pins('QA:14 QB:13 QC:12 QD:11 RCO:15')),
  hc595: box('74HC595', pins('SER:14 SRCLK:11^ SRCLR_n:10 RCLK:12^ OE_n:13'), pins("QA:15 QB:1 QC:2 QD:3 QE:4 QF:5 QG:6 QH:7 QHs:9=QH'")),
  hc4511: box('74HC4511', pins('A:7 B:1 C:2 D:6 LE:5 BI_n:4 LT_n:3'), pins('seg_a:13=a seg_b:12=b seg_c:11=c seg_d:10=d seg_e:9=e seg_f:15=f seg_g:14=g')),
};

// (como las de library/sym/Digital, en inglés)
const DESC: Record<string, string> = {
  hc00: '74HC00: 2-input NAND gate (one of four)',
  hc02: '74HC02: 2-input NOR gate (one of four)',
  hc04: '74HC04: inverter (one of six)',
  hc08: '74HC08: 2-input AND gate (one of four)',
  hc32: '74HC32: 2-input OR gate (one of four)',
  hc86: '74HC86: 2-input XOR gate (one of four)',
  hc125: '74HC125: 3-state buffer, output enable active low (one of four)',
  hc74: '74HC74: positive-edge D flip-flop with asynchronous preset and clear, active low (one of two)',
  hc138: '74HC138: 3-to-8 decoder, active-low outputs',
  hc151: '74HC151: 8-to-1 multiplexer with complementary outputs',
  hc157: '74HC157: quad 2-to-1 multiplexer',
  hc161: '74HC161: 4-bit binary counter, synchronous load, asynchronous clear',
  hc163: '74HC163: 4-bit binary counter, synchronous load and clear',
  hc595: '74HC595: 8-bit shift register with output latch and 3-state outputs',
  hc4511: '74HC4511: BCD to 7-segment latch/decoder/driver (common cathode)',
};

/** El símbolo dibujado: el orden de los pines del generado, la familia 74HC y la geometría de DRAW */
function drawn(name: string, generated: string, description: string): string {
  const d = DRAW[name];
  if (!d) throw new Error(`${name}: falta su dibujo en DRAW`);
  const attrs = generated
    .split('\n')
    .filter((l) => /^SYMATTR /.test(l))
    .map((l) => (/^SYMATTR SpiceLine /.test(l) ? `SYMATTR SpiceLine ${electricalLine(HC)} hdl=auto` : /^SYMATTR Description /.test(l) ? `SYMATTR Description ${description}` : l));
  const order = [...generated.matchAll(/^PINATTR PinName (\S+)\nPINATTR SpiceOrder (\d+)/gm)].map((m) => ({ name: m[1], order: m[2] }));
  const [nx, ny, nAlign] = d.name;
  const out = ['Version 4', 'SymbolType CELL', ...d.shapes, `WINDOW 0 ${nx} ${ny} ${nAlign} 2`, 'WINDOW 3 0 0 Invisible 2', ...attrs];
  // (los pines del .subckt van en minúsculas, como los nodos de ngspice)
  const at0 = new Map(Object.entries(d.pins).map(([k, v]) => [k.toLowerCase(), v]));
  for (const p of order) {
    const at = at0.get(p.name.toLowerCase());
    if (!at) throw new Error(`${name}: el pin ${p.name} no está en el dibujo`);
    out.push(`PIN ${at[0]} ${at[1]} NONE 0`, `PINATTR PinName ${p.name}`, `PINATTR SpiceOrder ${p.order}`);
  }
  if (order.length !== Object.keys(d.pins).length) throw new Error(`${name}: el dibujo tiene pines que el módulo no tiene`);
  return out.join('\n') + '\n';
}

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(SRC).filter((x) => x.endsWith('.v'))) {
  const name = f.replace(/\.v$/, '');
  const code = readFileSync(join(SRC, f), 'utf8');
  const r = await synthesize(runYosys, { [f]: code }, f, name);
  if (!r.block) throw new Error(`${f}: ${r.error}`);
  writeFileSync(join(OUT, `${name}.asy`), drawn(name, verilogSymbol(name, r.block), DESC[name] ?? name));
  console.log(`${name}: ${r.block.pins.length} pines`);
}
