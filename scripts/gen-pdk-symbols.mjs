// Genera library/sym/<pdk>/<dispositivo>.asy: los dispositivos más usados de sky130 y GF180MCU,
// con los gráficos de los símbolos base (nmos4, pmos4, res2, cap, diode, pnp, pnp4). Los MOS,
// resistencias, capacitores y BJT son subcircuitos (Prefix X, Value = el subcircuito, SpiceLine =
// sus parámetros: un SpiceModel sin ModelFile sería, como en LTspice, el archivo); los diodos,
// .model sueltos. En sky130 (.option scale=1u) W y L van en µm; en GF180, en metros (1u).
// Los modelos los agrega solos la simulación (src/library/pdk.ts).
// Uso: node scripts/gen-pdk-symbols.mjs
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SYM = join(dirname(fileURLToPath(import.meta.url)), '..', 'library', 'sym');

/** Los gráficos y pines de un símbolo base (sin sus SYMATTR). */
const base = (name) =>
  readFileSync(join(SYM, `${name}.asy`), 'utf8')
    .split('\n')
    .filter((l) => l && !/^(Version|SymbolType|SYMATTR)/.test(l));

// resistencia de 3 terminales: la de res2 y el cuerpo a la derecha
const res3 = [
  ...base('res2').map((l) => l.replace('PinName A', 'PinName R0').replace('PinName B', 'PinName R1')),
  'LINE Normal 32 32 48 32',
  'PIN 48 32 NONE 0',
  'PINATTR PinName B',
  'PINATTR SpiceOrder 3',
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

/** Un PDK: [archivo, gráficos, Prefix, Value (el modelo), SpiceLine, descripción] por símbolo */
function writePdk(pdk, symbols) {
  const out = join(SYM, pdk);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const [file, lines, prefix, model, line, desc] of symbols) {
    const attrs = [['Prefix', prefix], ['Value', model], ...(line ? [['SpiceLine', line]] : []), ['Description', desc]];
    writeFileSync(join(out, `${file}.asy`), symbol(line ? params(lines) : lines, attrs));
  }
  console.log(`${pdk}: ${symbols.length} símbolos → library/sym/${pdk}`);
}

// --- sky130
{
  const sub = (name, sym, desc, value) => [name, sym, 'X', `sky130_fd_pr__${name}`, value, `sky130 ${desc} (sky130_fd_pr__${name}). W and L in µm.`];
  const mos = (name, sym, desc, value) => sub(name, base(sym), desc, value);
  writePdk('sky130', [
    mos('nfet_01v8', 'nmos4', 'NMOS 1.8 V', 'W=1 L=0.15 nf=1'),
    mos('nfet_01v8_lvt', 'nmos4', 'NMOS 1.8 V, low Vt', 'W=1 L=0.15 nf=1'),
    mos('nfet_03v3_nvt', 'nmos4', 'NMOS 3.3 V, native', 'W=1 L=0.5 nf=1'),
    mos('nfet_05v0_nvt', 'nmos4', 'NMOS 5 V, native', 'W=1 L=0.9 nf=1'),
    mos('nfet_g5v0d10v5', 'nmos4', 'NMOS 5 V gate, 10.5 V drain', 'W=1 L=0.5 nf=1'),
    mos('pfet_01v8', 'pmos4', 'PMOS 1.8 V', 'W=1 L=0.15 nf=1'),
    mos('pfet_01v8_lvt', 'pmos4', 'PMOS 1.8 V, low Vt', 'W=1 L=0.35 nf=1'),
    mos('pfet_01v8_hvt', 'pmos4', 'PMOS 1.8 V, high Vt', 'W=1 L=0.15 nf=1'),
    mos('pfet_g5v0d10v5', 'pmos4', 'PMOS 5 V gate, 10.5 V drain', 'W=1 L=0.5 nf=1'),
    sub('res_high_po_0p35', res3, 'Poly resistor, high sheet, 0.35 µm wide (~1 kΩ/□)', 'L=3.5'),
    sub('res_high_po_0p69', res3, 'Poly resistor, high sheet, 0.69 µm wide (~1 kΩ/□)', 'L=3.5'),
    sub('res_xhigh_po_0p35', res3, 'Poly resistor, extra high sheet, 0.35 µm wide (~2 kΩ/□)', 'L=3.5'),
    sub('cap_mim_m3_1', base('cap'), 'MIM capacitor, metal 3 (~2 fF/µm²)', 'W=5 L=5'),
    sub('pnp_05v5_W0p68L0p68', base('pnp4'), 'vertical PNP, 0.68 × 0.68 µm emitter', ''),
    ['diode_pw2nd_05v5', base('diode'), 'D', 'sky130_fd_pr__diode_pw2nd_05v5', 'area=1 pj=4', 'sky130 P-well / N+ diode, 5.5 V (sky130_fd_pr__diode_pw2nd_05v5). Area in µm², perimeter (pj) in µm.'],
  ]);
}

// --- GF180MCU (los nombres de globalfoundries-pdk-libs-gf180mcu_fd_pr)
{
  const sub = (name, sym, desc, value) => [name, sym, 'X', name, value, `GF180MCU ${desc} (${name}).`];
  const mos = (name, sym, desc, value) => sub(name, base(sym), desc, value);
  const res = (name, desc) => sub(name, res3, `${desc}; r_width and r_length in meters`, 'r_width=1u r_length=10u');
  writePdk('gf180', [
    mos('nmos_3p3', 'nmos4', 'NMOS 3.3 V; W and L in meters', 'W=1u L=0.28u nf=1'),
    mos('pmos_3p3', 'pmos4', 'PMOS 3.3 V; W and L in meters', 'W=1u L=0.28u nf=1'),
    mos('nmos_6p0', 'nmos4', 'NMOS 6 V; W and L in meters', 'W=1u L=0.7u nf=1'),
    mos('pmos_6p0', 'pmos4', 'PMOS 6 V; W and L in meters', 'W=1u L=0.5u nf=1'),
    mos('nmos_6p0_nat', 'nmos4', 'NMOS 6 V, native; W and L in meters', 'W=1u L=1.8u nf=1'),
    res('ppolyf_u', 'unsalicided P+ poly resistor (~350 Ω/□)'),
    res('ppolyf_u_1k', 'high-resistance poly resistor (~1 kΩ/□)'),
    res('ppolyf_u_3k', 'high-resistance poly resistor (~3 kΩ/□)'),
    res('nplus_u', 'unsalicided N+ diffusion resistor'),
    sub('mim_2p0fF', base('cap'), 'MIM capacitor (2 fF/µm²); c_width and c_length in meters', 'c_width=5u c_length=5u'),
    sub('vnpn_10x10', base('npn4'), 'vertical NPN, 10 × 10 µm emitter', ''),
    sub('vpnp_10x10', base('pnp'), 'vertical PNP, 10 × 10 µm emitter', ''),
    ['np_3p3', base('diode'), 'D', 'np_3p3', 'area=1p pj=4u', 'GF180MCU N+ / P-well diode, 3.3 V (np_3p3). Area in m², perimeter (pj) in meters.'],
  ]);
}
