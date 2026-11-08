// Genera library/sym/<pdk>/<dispositivo>.asy: los dispositivos más usados de sky130 y GF180MCU,
// con los gráficos de los símbolos base (nm_ic_4, pm_ic_4: los MOS de integrado, #367; res2, cap, diode, pnp, pnp4). Los MOS,
// resistencias, capacitores y BJT son subcircuitos (Prefix X, Value = el subcircuito, SpiceLine =
// sus parámetros: un SpiceModel sin ModelFile sería, como en LTspice, el archivo); los diodos,
// .model sueltos. En sky130 (.option scale=1u) W y L van en µm; en GF180, en metros (1u).
// Los modelos los agrega solos la simulación (src/library/pdk.ts).
// Uso: node scripts/gen-pdk-symbols.mjs
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SYM = join(dirname(fileURLToPath(import.meta.url)), '..', 'library', 'sym');

/**
 * Los gráficos y pines de un símbolo base (sin sus SYMATTR), con su skin SVG (SYMATTR Skin: el
 * dibujo de nm_ic_4, pm_ic_4…; las líneas del .asy son el respaldo sin skin).
 */
const base = (name) => {
  const lines = readFileSync(join(SYM, `${name}.asy`), 'utf8')
    .split('\n')
    .filter((l) => l && !/^(Version|SymbolType|SYMATTR)/.test(l));
  return Object.assign(lines, { skin: name });
};
/** Nombre de instancia por defecto según el símbolo base (como en xschem: XM1, XR1…) */
const INST = { nm_ic_4: 'XM1', pm_ic_4: 'XM1', res2: 'XR1', cap: 'XC1', npn4: 'XQ1', pnp: 'XQ1', pnp4: 'XQ1', diode: 'D1' };

// resistencia de 3 terminales: la de res2 y el cuerpo a la derecha
const res3 = Object.assign(
  [...base('res2').map((l) => l.replace('PinName A', 'PinName R0').replace('PinName B', 'PinName R1')), 'LINE Normal 32 32 48 32', 'PIN 48 32 NONE 0', 'PINATTR PinName B', 'PINATTR SpiceOrder 3'],
  { skin: undefined, inst: 'XR1' },
);

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
    const inst = lines.inst ?? INST[lines.skin];
    const attrs = [
      ['Prefix', prefix],
      ...(inst ? [['InstName', inst]] : []),
      ['Value', model],
      ...(line ? [['SpiceLine', line]] : []),
      ['Description', desc],
      ...(lines.skin ? [['Skin', lines.skin]] : []),
    ];
    writeFileSync(join(out, `${file}.asy`), symbol(line ? params([...lines]) : [...lines], attrs));
  }
  console.log(`${pdk}: ${symbols.length} símbolos → library/sym/${pdk}`);
}

// capacitor de 3 o 4 terminales (varactor, VPP): el de cap con el cuerpo (b) a la derecha y el
// blindaje (m4/m5) a la izquierda
const cap3 = Object.assign(
  [...base('cap').map((l) => l.replace('PinName A', 'PinName C0').replace('PinName B', 'PinName C1')), 'LINE Normal 36 32 48 32', 'PIN 48 32 NONE 0', 'PINATTR PinName B', 'PINATTR SpiceOrder 3'],
  { skin: undefined, inst: 'XC1' },
);
const cap4 = (shield) => Object.assign([...cap3, 'LINE Normal -16 32 -4 32', 'PIN -16 32 NONE 0', `PINATTR PinName ${shield}`, 'PINATTR SpiceOrder 4'], { skin: undefined, inst: 'XC1' });
// MOS aislado: el de nm_ic_4 con el sustrato (sub) aparte, a la derecha del cuerpo
const nmos5 = Object.assign([...base('nm_ic_4'), 'LINE Normal 80 48 96 48', 'LINE Normal 80 40 80 56', 'TEXT 84 64 Left 1 sub', 'PIN 96 48 NONE 0', 'PINATTR PinName SUB', 'PINATTR SpiceOrder 5'], {
  skin: undefined,
  inst: 'XM1',
});
// resistencia de 2 terminales como subcircuito (o .model r, con Prefix R)
const res2x = Object.assign([...base('res2')], { skin: undefined, inst: 'XR1' });
const res2r = Object.assign([...base('res2')], { skin: undefined, inst: 'R1' });

// --- sky130
{
  const sub = (name, sym, desc, value) => [name, sym, 'X', `sky130_fd_pr__${name}`, value, `sky130 ${desc} (sky130_fd_pr__${name}). W and L in µm.`];
  const fixed = (name, sym, desc) => [name, sym, 'X', `sky130_fd_pr__${name}`, '', `sky130 ${desc} (sky130_fd_pr__${name}).`];
  const mos = (name, sym, desc, value) => sub(name, base(sym), desc, value);
  const diode = (name, desc) => [`diode_${name}`, base('diode'), 'D', `sky130_fd_pr__diode_${name}`, 'area=1 pj=4', `sky130 ${desc} (sky130_fd_pr__diode_${name}). Area in µm², perimeter (pj) in µm.`];
  const poly = (kind, wide, sheet) => sub(`res_${kind}_po_${wide}`, res3, `Poly resistor, ${kind === 'high' ? 'high' : 'extra high'} sheet, ${wide.replace('p', '.')} µm wide (~${sheet}/□)`, 'L=3.5');
  // VPP (metal-metal, de dedos): celdas de tamaño fijo; el valor, medido en tt
  const vpp = (name, c, shield) => fixed(`cap_vpp_${name}`, shield ? cap4(shield) : cap3, `VPP metal finger capacitor, fixed cell (≈${c} in tt)`);
  writePdk('sky130', [
    mos('nfet_01v8', 'nm_ic_4', 'NMOS 1.8 V', 'W=1 L=0.15 nf=1'),
    mos('nfet_01v8_lvt', 'nm_ic_4', 'NMOS 1.8 V, low Vt', 'W=1 L=0.15 nf=1'),
    mos('nfet_03v3_nvt', 'nm_ic_4', 'NMOS 3.3 V, native', 'W=1 L=0.5 nf=1'),
    mos('nfet_05v0_nvt', 'nm_ic_4', 'NMOS 5 V, native', 'W=1 L=0.9 nf=1'),
    mos('nfet_g5v0d10v5', 'nm_ic_4', 'NMOS 5 V gate, 10.5 V drain', 'W=1 L=0.5 nf=1'),
    mos('nfet_g5v0d16v0', 'nm_ic_4', 'NMOS 5 V gate, 16 V drain (extended drain)', 'W=5 L=0.7'),
    mos('nfet_20v0', 'nm_ic_4', 'NMOS 20 V (LDMOS)', 'W=30 L=0.5'),
    mos('nfet_20v0_nvt', 'nm_ic_4', 'NMOS 20 V (LDMOS), native', 'W=30 L=1'),
    mos('nfet_20v0_zvt', 'nm_ic_4', 'NMOS 20 V (LDMOS), zero Vt', 'W=30 L=1.5'),
    sub('nfet_20v0_iso', nmos5, 'NMOS 20 V (LDMOS) isolated from the substrate (sub)', 'W=30 L=0.5'),
    sub('nfet_20v0_reverse_iso', nmos5, 'NMOS 20 V (LDMOS), reverse, isolated from the substrate (sub)', 'W=30 L=0.5'),
    mos('esd_nfet_01v8', 'nm_ic_4', 'NMOS 1.8 V for ESD', 'W=20.35 L=0.165 nf=1'),
    mos('esd_nfet_g5v0d10v5', 'nm_ic_4', 'NMOS 5 V gate, 10.5 V drain, for ESD', 'W=17.5 L=0.55 nf=1'),
    mos('special_nfet_latch', 'nm_ic_4', 'NMOS of the SRAM cell, latch', 'W=0.21 L=0.15'),
    mos('special_nfet_pass', 'nm_ic_4', 'NMOS of the SRAM cell, pass gate', 'W=0.14 L=0.15'),
    mos('special_nfet_pass_lvt', 'nm_ic_4', 'NMOS of the SRAM cell, pass gate, low Vt; only W=0.3 L=0.15', 'W=0.3 L=0.15'),
    mos('special_nfet_pass_flash', 'nm_ic_4', 'NMOS of the flash cell, pass gate; only L=0.15 with W=0.35 or 0.45', 'W=0.45 L=0.15'),
    mos('pfet_01v8', 'pm_ic_4', 'PMOS 1.8 V', 'W=1 L=0.15 nf=1'),
    mos('pfet_01v8_lvt', 'pm_ic_4', 'PMOS 1.8 V, low Vt', 'W=1 L=0.35 nf=1'),
    mos('pfet_01v8_mvt', 'pm_ic_4', 'PMOS 1.8 V, medium Vt; only L=0.15 with W=0.84 or 1.68', 'W=0.84 L=0.15 nf=1'),
    mos('pfet_01v8_hvt', 'pm_ic_4', 'PMOS 1.8 V, high Vt', 'W=1 L=0.15 nf=1'),
    mos('pfet_g5v0d10v5', 'pm_ic_4', 'PMOS 5 V gate, 10.5 V drain', 'W=1 L=0.5 nf=1'),
    mos('pfet_g5v0d16v0', 'pm_ic_4', 'PMOS 5 V gate, 16 V drain (extended drain)', 'W=5 L=0.66'),
    mos('pfet_20v0', 'pm_ic_4', 'PMOS 20 V (LDMOS)', 'W=30 L=0.5'),
    mos('esd_pfet_g5v0d10v5', 'pm_ic_4', 'PMOS 5 V gate, 10.5 V drain, for ESD', 'W=14.5 L=0.55 nf=1'),
    mos('special_pfet_latch', 'pm_ic_4', 'PMOS of the SRAM cell, latch', 'W=0.14 L=0.15'),
    poly('high', '0p35', '350 Ω'),
    poly('high', '0p69', '350 Ω'),
    poly('high', '1p41', '350 Ω'),
    poly('high', '2p85', '350 Ω'),
    poly('high', '5p73', '350 Ω'),
    sub('res_high_po', res3, 'Poly resistor, high sheet, any width (~350 Ω/□)', 'W=0.35 L=3.5'),
    poly('xhigh', '0p35', '2 kΩ'),
    poly('xhigh', '0p69', '2 kΩ'),
    poly('xhigh', '1p41', '2 kΩ'),
    poly('xhigh', '2p85', '2 kΩ'),
    poly('xhigh', '5p73', '2 kΩ'),
    sub('res_xhigh_po', res3, 'Poly resistor, extra high sheet, any width (~2 kΩ/□)', 'W=0.35 L=3.5'),
    sub('res_iso_pw', res3, 'Isolated P-well resistor (~3.8 kΩ/□)', 'W=2.65 L=26.5'),
    sub('res_generic_po', res2x, 'Poly resistor, salicided (~50 Ω/□)', 'W=1 L=10'),
    sub('res_generic_nd', res3, 'N+ diffusion resistor (~120 Ω/□)', 'W=1 L=10'),
    sub('res_generic_nd__hv', res3, 'N+ diffusion resistor, high voltage (~110 Ω/□)', 'W=1 L=10'),
    sub('res_generic_pd', res3, 'P+ diffusion resistor (~75 Ω/□)', 'W=1 L=10'),
    sub('res_generic_pd__hv', res3, 'P+ diffusion resistor, high voltage (~125 Ω/□)', 'W=1 L=10'),
    ...[
      ['nw', 'N-well resistor (~1.7 kΩ/□)'],
      ['l1', 'local interconnect (li1) resistor (~12 Ω/□)'],
      ['m1', 'metal 1 resistor (~0.13 Ω/□)'],
      ['m2', 'metal 2 resistor (~0.13 Ω/□)'],
      ['m3', 'metal 3 resistor (~0.048 Ω/□)'],
      ['m4', 'metal 4 resistor (~0.048 Ω/□)'],
      ['m5', 'metal 5 resistor (~0.031 Ω/□)'],
      ['r1', 'redistribution layer resistor (~0.005 Ω/□)'],
    ].map(([n, d]) => [`res_generic_${n}`, res2r, 'R', `sky130_fd_pr__res_generic_${n}`, 'W=1 L=10', `sky130 ${d} (sky130_fd_pr__res_generic_${n}). W and L in µm.`]),
    sub('cap_mim_m3_1', base('cap'), 'MIM capacitor, metal 3 (~2 fF/µm²)', 'W=5 L=5'),
    sub('cap_mim_m3_2', base('cap'), 'MIM capacitor, metal 4 (~2 fF/µm²)', 'W=5 L=5'),
    sub('cap_var_lvt', cap3, 'MOS varactor, low Vt (C0 gate, C1 N-well, B substrate)', 'W=5 L=0.5 VM=1'),
    sub('cap_var_hvt', cap3, 'MOS varactor, high Vt (C0 gate, C1 N-well, B substrate)', 'W=5 L=0.5 VM=1'),
    vpp('02p7x06p1_m1m2m3m4_shieldl1_fingercap', '13 fF'),
    vpp('02p7x11p1_m1m2m3m4_shieldl1_fingercap', '25 fF'),
    vpp('02p7x21p1_m1m2m3m4_shieldl1_fingercap', '48 fF'),
    vpp('02p7x41p1_m1m2m3m4_shieldl1_fingercap', '96 fF'),
    vpp('02p9x06p1_m1m2m3m4_shieldl1_fingercap2', '14 fF'),
    vpp('04p4x04p6_m1m2_noshield_o1nhv', '18 fF'),
    vpp('04p4x04p6_m1m2_noshield_o1phv', '18 fF'),
    vpp('04p4x04p6_m1m2m3_shieldl1', '13 fF'),
    vpp('04p4x04p6_m1m2m3_shieldl1m5_floatm4', '13 fF', 'M5'),
    vpp('05p9x05p9_m1m2m3m4_shieldl1_wafflecap', '30 fF'),
    vpp('06p8x06p1_l1m1m2m3_shieldpom4', '42 fF', 'M4'),
    vpp('06p8x06p1_m1m2m3_shieldl1m4', '32 fF', 'M4'),
    vpp('08p6x07p8_l1m1m2_noshield_o1', '49 fF'),
    vpp('08p6x07p8_m1m2m3_shieldl1', '47 fF'),
    vpp('08p6x07p8_m1m2m3_shieldl1m5_floatm4', '47 fF', 'M5'),
    vpp('11p3x11p3_m1m2m3m4_shieldl1_wafflecap', '116 fF'),
    vpp('11p3x11p8_l1m1m2m3m4_shieldm5_nhv', '337 fF', 'M5'),
    vpp('11p5x11p7_l1m1m2m3_shieldm4', '130 fF', 'M4'),
    vpp('11p5x11p7_l1m1m2m3_shieldpom4', '145 fF', 'M4'),
    vpp('11p5x11p7_l1m1m2m3m4_shieldm5', '147 fF', 'M5'),
    vpp('11p5x11p7_l1m1m2m3m4_shieldpom5', '162 fF', 'M5'),
    vpp('11p5x11p7_l1m1m2m3m4_shieldpom5_x', '159 fF', 'M5'),
    vpp('11p5x11p7_m1m2m3_shieldl1', '104 fF'),
    vpp('11p5x11p7_m1m2m3_shieldl1m5_floatm4', '108 fF', 'M5'),
    vpp('11p5x11p7_m1m2m3m4_shieldl1m5', '129 fF', 'M5'),
    vpp('11p5x11p7_m1m2m3m4_shieldm5', '117 fF', 'M5'),
    vpp('11p5x11p7_m1m4_noshield', '115 fF'),
    vpp('44p7x23p1_pol1m1m2m3m4m5_noshield', '1.5 pF'),
    fixed('npn_05v5_W1p00L1p00', base('npn4'), 'vertical NPN 5.5 V, 1 × 1 µm emitter (S: substrate)'),
    fixed('npn_05v5_W1p00L2p00', base('npn4'), 'vertical NPN 5.5 V, 1 × 2 µm emitter (S: substrate)'),
    fixed('npn_11v0_W1p00L1p00', base('npn4'), 'vertical NPN 11 V, 1 × 1 µm emitter (S: substrate)'),
    fixed('pnp_05v5_W0p68L0p68', base('pnp'), 'vertical PNP, 0.68 × 0.68 µm emitter'),
    fixed('pnp_05v5_W3p40L3p40', base('pnp'), 'vertical PNP, 3.4 × 3.4 µm emitter'),
    diode('pw2nd_05v5', 'P-well / N+ diode, 5.5 V'),
    diode('pw2nd_05v5_lvt', 'P-well / N+ diode, 5.5 V, low Vt implant'),
    diode('pw2nd_05v5_nvt', 'P-well / N+ diode, 5.5 V, native'),
    diode('pw2nd_11v0', 'P-well / N+ diode, 11 V'),
    diode('pd2nw_05v5', 'P+ / N-well diode, 5.5 V'),
    diode('pd2nw_05v5_lvt', 'P+ / N-well diode, 5.5 V, low Vt implant'),
    diode('pd2nw_05v5_hvt', 'P+ / N-well diode, 5.5 V, high Vt implant'),
    diode('pd2nw_11v0', 'P+ / N-well diode, 11 V'),
  ]);
}

// --- GF180MCU (los nombres de open_pdks, como en xschem)
{
  const sub = (name, sym, desc, value) => [name, sym, 'X', name, value, `GF180MCU ${desc} (${name}).`];
  const mos = (name, sym, desc, value) => sub(name, base(sym), desc, value);
  const res = (name, desc) => sub(name, res3, `${desc}; r_width and r_length in meters`, 'r_width=1u r_length=10u');
  writePdk('gf180', [
    mos('nfet_03v3', 'nm_ic_4', 'NMOS 3.3 V; W and L in meters', 'W=1u L=0.28u nf=1'),
    mos('pfet_03v3', 'pm_ic_4', 'PMOS 3.3 V; W and L in meters', 'W=1u L=0.28u nf=1'),
    mos('nfet_06v0', 'nm_ic_4', 'NMOS 6 V; W and L in meters', 'W=1u L=0.7u nf=1'),
    mos('pfet_06v0', 'pm_ic_4', 'PMOS 6 V; W and L in meters', 'W=1u L=0.55u nf=1'),
    mos('nfet_06v0_nvt', 'nm_ic_4', 'NMOS 6 V, native; W and L in meters', 'W=1u L=1.8u nf=1'),
    res('ppolyf_u', 'unsalicided P+ poly resistor (~350 Ω/□)'),
    res('ppolyf_u_1k', 'high-resistance poly resistor (~1 kΩ/□)'),
    res('ppolyf_u_3k', 'high-resistance poly resistor (~3 kΩ/□)'),
    res('nplus_u', 'unsalicided N+ diffusion resistor'),
    sub('cap_mim_2f0_m4m5_noshield', base('cap'), 'MIM capacitor between metal 4 and 5 (2 fF/µm²); c_width and c_length in meters', 'c_width=5u c_length=5u'),
    sub('npn_10p00x10p00', base('npn4'), 'vertical NPN, 10 × 10 µm emitter', ''),
    sub('pnp_10p00x10p00', base('pnp'), 'vertical PNP, 10 × 10 µm emitter', ''),
    ['diode_nd2ps_03v3', base('diode'), 'D', 'diode_nd2ps_03v3', 'area=1p pj=4u', 'GF180MCU N+ / P-substrate diode, 3.3 V (diode_nd2ps_03v3). Area in m², perimeter (pj) in meters.'],
  ]);
}
