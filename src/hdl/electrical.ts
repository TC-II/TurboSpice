import { t } from '../i18n/i18n.ts';
// Interfaz eléctrica de los bloques Verilog (#209): cómo se ven sus pines desde el circuito
// analógico. Son parámetros del .subckt (y del símbolo, así cada instancia puede cambiarlos) que
// usan los bidi_bridge de XSPICE de cada pin (ver synth.ts):
//  - entradas: 0 por debajo de vil, 1 por encima de vih (vil > vih da histéresis, como un Schmitt);
//  - salidas: vol / voh, corriente máxima iol / ioh (como un driver CMOS) y rampas tr / tf;
//  - tpd: retardo de cada compuerta, flip-flop y buffer tri-state.

export interface ElectricalParam {
  name: string;
  label: string;
  unit: string;
  /** valor por omisión (puede depender de vcc: «{vcc/2}») */
  value: string;
}

export const ELECTRICAL: ElectricalParam[] = [
  { name: 'vcc', label: t('Supply'), unit: 'V', value: '5' },
  { name: 'vil', label: t('Input low threshold (VIL)'), unit: 'V', value: '{vcc/2}' },
  { name: 'vih', label: t('Input high threshold (VIH)'), unit: 'V', value: '{vcc/2}' },
  { name: 'vol', label: t('Output low level (VOL)'), unit: 'V', value: '0' },
  { name: 'voh', label: t('Output high level (VOH)'), unit: 'V', value: '{vcc}' },
  { name: 'iol', label: t('Max. output current, low (IOL)'), unit: 'A', value: '20m' },
  { name: 'ioh', label: t('Max. output current, high (IOH)'), unit: 'A', value: '20m' },
  { name: 'tr', label: t('Output rise time'), unit: 's', value: '1n' },
  { name: 'tf', label: t('Output fall time'), unit: 's', value: '1n' },
  { name: 'tpd', label: t('Delay of each gate (tpd)'), unit: 's', value: '1n' },
];

export const ELECTRICAL_NAMES = new Set(ELECTRICAL.map((p) => p.name));

/** Familias lógicas típicas (valores de hoja de datos redondeados) */
export const FAMILIES: { name: string; values: Record<string, string> }[] = [
  { name: t('Ideal (thresholds at VCC/2)'), values: Object.fromEntries(ELECTRICAL.map((p) => [p.name, p.value])) },
  { name: '74HC (CMOS 5 V)', values: { vcc: '5', vil: '1.5', vih: '3.5', vol: '0', voh: '{vcc}', iol: '4m', ioh: '4m', tr: '6n', tf: '6n', tpd: '9n' } },
  { name: '74HCT (CMOS, TTL inputs)', values: { vcc: '5', vil: '0.8', vih: '2', vol: '0', voh: '{vcc}', iol: '4m', ioh: '4m', tr: '6n', tf: '6n', tpd: '12n' } },
  { name: '74LS (TTL)', values: { vcc: '5', vil: '0.8', vih: '2', vol: '0.35', voh: '3.4', iol: '8m', ioh: '0.4m', tr: '10n', tf: '6n', tpd: '10n' } },
  { name: 'LVCMOS 3.3 V', values: { vcc: '3.3', vil: '0.8', vih: '2', vol: '0', voh: '{vcc}', iol: '8m', ioh: '8m', tr: '2n', tf: '2n', tpd: '3n' } },
  { name: 'CD4000 (CMOS 10 V)', values: { vcc: '10', vil: '3', vih: '7', vol: '0', voh: '{vcc}', iol: '2m', ioh: '2m', tr: '50n', tf: '50n', tpd: '60n' } },
];

/** "vcc=5 vil={vcc/2} …" con los valores dados (los que faltan, por omisión) */
export const electricalLine = (values: Record<string, string> = {}) => ELECTRICAL.map((p) => `${p.name}=${values[p.name] ?? p.value}`).join(' ');

/** Parámetros "k=v" de un SpiceLine (los valores pueden ir entre llaves) */
export function parseParams(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of line.matchAll(/([A-Za-z_][\w$]*)\s*=\s*(\{[^{}]*\}|"[^"]*"|[^\s]+)/g)) out[m[1]] = m[2];
  return out;
}

export const paramsLine = (values: Record<string, string>) =>
  Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
