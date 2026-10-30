// Genera library/sym/sky130/<dispositivo>.asy: los dispositivos más usados de sky130, con los
// gráficos de los símbolos base (nmos4, pmos4, res2, cap, diode, pnp4). Los MOS, resistencias,
// capacitores y BJT son subcircuitos (Prefix X, Value = el subcircuito, SpiceLine = sus
// parámetros: un SpiceModel sin ModelFile sería, como en LTspice, el archivo); los diodos,
// .model sueltos. Con .option scale=1u del PDK, W y L van en µm.
// Los modelos los agrega solos la simulación (src/library/pdk.ts).
// Uso: node scripts/gen-pdk-symbols.mjs
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SYM = join(dirname(fileURLToPath(import.meta.url)), '..', 'library', 'sym');
const OUT = join(SYM, 'sky130');

/** Los gráficos y pines de un símbolo base (sin sus SYMATTR). */
const base = (name) =>
  readFileSync(join(SYM, `${name}.asy`), 'utf8')
    .split('\n')
    .filter((l) => l && !/^(Version|SymbolType|SYMATTR)/.test(l));

const MOS = [
  ['nfet_01v8', 'nmos4', 'NMOS 1.8 V', 'W=1 L=0.15 nf=1'],
  ['nfet_01v8_lvt', 'nmos4', 'NMOS 1.8 V, low Vt', 'W=1 L=0.15 nf=1'],
  ['nfet_03v3_nvt', 'nmos4', 'NMOS 3.3 V, native', 'W=1 L=0.5 nf=1'],
  ['nfet_05v0_nvt', 'nmos4', 'NMOS 5 V, native', 'W=1 L=0.9 nf=1'],
  ['nfet_g5v0d10v5', 'nmos4', 'NMOS 5 V gate, 10.5 V drain', 'W=1 L=0.5 nf=1'],
  ['pfet_01v8', 'pmos4', 'PMOS 1.8 V', 'W=1 L=0.15 nf=1'],
  ['pfet_01v8_lvt', 'pmos4', 'PMOS 1.8 V, low Vt', 'W=1 L=0.35 nf=1'],
  ['pfet_01v8_hvt', 'pmos4', 'PMOS 1.8 V, high Vt', 'W=1 L=0.15 nf=1'],
  ['pfet_g5v0d10v5', 'pmos4', 'PMOS 5 V gate, 10.5 V drain', 'W=1 L=0.5 nf=1'],
];

// resistencia de 3 terminales: la de res2 y el cuerpo a la derecha
const res3 = [
  ...base('res2').map((l) => l.replace('PinName A', 'PinName R0').replace('PinName B', 'PinName R1')),
  'LINE Normal 32 32 48 32',
  'PIN 48 32 NONE 0',
  'PINATTR PinName B',
  'PINATTR SpiceOrder 3',
];
const RES = [
  ['res_high_po_0p35', 'Poly resistor, high sheet, 0.35 µm wide (~1 kΩ/□)', 'L=3.5'],
  ['res_high_po_0p69', 'Poly resistor, high sheet, 0.69 µm wide (~1 kΩ/□)', 'L=3.5'],
  ['res_xhigh_po_0p35', 'Poly resistor, extra high sheet, 0.35 µm wide (~2 kΩ/□)', 'L=3.5'],
];

const symbol = (lines, attrs) =>
  ['Version 4', 'SymbolType CELL', ...lines.filter((l) => !/^PIN/.test(l)), ...attrs.map(([k, v]) => `SYMATTR ${k} ${v}`), ...lines.filter((l) => /^PIN/.test(l))].join('\n') + '\n';

// los parámetros (SpiceLine, ventana 39) debajo del nombre
const params = (lines) => {
  const w = lines.find((l) => /^WINDOW 3 /.test(l));
  if (!w) return lines;
  const [, , x, y, ...rest] = w.split(' ');
  return [...lines, `WINDOW 39 ${x} ${Number(y) + 24} ${rest.join(' ')}`];
};
const sub = (name, desc, value) => [
  ['Prefix', 'X'],
  ['Value', `sky130_fd_pr__${name}`],
  ...(value ? [['SpiceLine', value]] : []),
  ['Description', `sky130 ${desc} (sky130_fd_pr__${name}). W and L in µm.`],
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const write = (name, text) => writeFileSync(join(OUT, `${name}.asy`), text);

for (const [name, sym, desc, value] of MOS) write(name, symbol(params(base(sym)), sub(name, desc, value)));
for (const [name, desc, value] of RES) write(name, symbol(params(res3), sub(name, desc, value)));
write('cap_mim_m3_1', symbol(params(base('cap')), sub('cap_mim_m3_1', 'MIM capacitor, metal 3 (~2 fF/µm²)', 'W=5 L=5')));
write('pnp_05v5_W0p68L0p68', symbol(base('pnp4'), sub('pnp_05v5_W0p68L0p68', 'vertical PNP, 0.68 × 0.68 µm emitter', '')));
write(
  'diode_pw2nd_05v5',
  symbol(params(base('diode')), [
    ['Prefix', 'D'],
    ['Value', 'sky130_fd_pr__diode_pw2nd_05v5'],
    ['SpiceLine', 'area=1 pj=4'],
    ['Description', 'sky130 P-well / N+ diode, 5.5 V (sky130_fd_pr__diode_pw2nd_05v5). Area in µm², perimeter (pj) in µm.'],
  ]),
);
console.log(`sky130: ${MOS.length + RES.length + 3} símbolos → library/sym/sky130`);
