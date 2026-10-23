// Parámetros internos de salida de los dispositivos de ngspice (#202): @q1[gm], @m1[vdsat],
// @q.x_u1.q1[ic]… Se guardan con ".save all @dev[param]" y se grafican como cualquier traza.
// Tablas de docs/ngspice/md/27-model-and-device-parameters/ (los "Out" de cada instancia); el
// diodo y el JFET no están en el manual: los de ngspice-47 verificados con la simulación.
import { t } from '../i18n/i18n.ts';

export interface DeviceParam {
  /** nombre del parámetro en ngspice ("gm") */
  name: string;
  /** unidad para el eje ("S", "F", "V"…), "" si no se sabe */
  unit: string;
  /** descripción traducida */
  label: string;
}

const LABELS: Record<string, () => string> = {
  i: () => t('Current'),
  current: () => t('Current'),
  v: () => t('Voltage'),
  p: () => t('Power'),
  flux: () => t('Flux'),
  ic: () => t('Collector current'),
  ib: () => t('Base/bulk current'),
  ie: () => t('Emitter current'),
  id: () => t('Drain/diode current'),
  ig: () => t('Gate current'),
  is: () => t('Source current'),
  vbe: () => t('B-E voltage'),
  vbc: () => t('B-C voltage'),
  vgs: () => t('Gate-source voltage'),
  vds: () => t('Drain-source voltage'),
  vbs: () => t('Bulk-source voltage'),
  vd: () => t('Diode voltage'),
  vth: () => t('Threshold voltage (BSIM)'),
  vdsat: () => t('Saturation drain voltage'),
  gm: () => t('Small-signal transconductance'),
  gpi: () => t('Small-signal input conductance (pi)'),
  gmu: () => t('Small-signal conductance (mu)'),
  go: () => t('Small-signal output conductance'),
  gx: () => t('Base resistance conductance'),
  gds: () => t('Drain-source conductance'),
  gmbs: () => t('Bulk transconductance'),
  gd: () => t('Diode conductance'),
  cpi: () => t('B-E capacitance'),
  cmu: () => t('B-C capacitance'),
  cbx: () => t('Base to collector capacitance'),
  cgs: () => t('Gate-source capacitance'),
  cgd: () => t('Gate-drain capacitance'),
  cd: () => t('Diode capacitance'),
  qbe: () => t('B-E charge'),
  qbc: () => t('B-C charge'),
  charge: () => t('Diode charge'),
};

/** Parámetros de salida que se ofrecen por letra del dispositivo (la de ngspice) */
const BY_LETTER: Record<string, string[]> = {
  r: ['i', 'p'],
  c: ['i', 'p'],
  l: ['i', 'v', 'flux', 'p'],
  v: ['i', 'p'],
  i: ['current', 'v', 'p'],
  b: ['i', 'v', 'p'],
  e: ['i', 'v', 'p'],
  f: ['i', 'v', 'p'],
  g: ['i', 'v', 'p'],
  h: ['i', 'v', 'p'],
  d: ['id', 'vd', 'gd', 'cd', 'charge', 'p'],
  q: ['ic', 'ib', 'ie', 'vbe', 'vbc', 'gm', 'gpi', 'gmu', 'go', 'gx', 'cpi', 'cmu', 'cbx', 'qbe', 'qbc', 'p'],
  m: ['id', 'ig', 'is', 'ib', 'vgs', 'vds', 'vbs', 'gm', 'gds', 'gmbs', 'vdsat', 'vth', 'cgs', 'cgd', 'p'],
  j: ['id', 'ig', 'is', 'vgs', 'gm', 'gds', 'p'],
};

/** Unidad de un parámetro por su nombre: g… conductancias, c… capacidades, v… tensiones… */
export function paramUnit(param: string): string {
  const p = param.toLowerCase();
  if (p === 'p') return 'W';
  if (p === 'flux') return 'Wb';
  if (p === 'charge' || /^q(be|bc|bx|sub|g[sdb]|b[sd])$/.test(p)) return 'C';
  if (p === 'i' || p === 'current' || /^i[bcdegs]$/.test(p) || /^ib[sd]$/.test(p)) return 'A';
  if (/^v/.test(p) || p === 'von') return 'V';
  if (/^g/.test(p)) return 'S';
  if (/^c/.test(p)) return 'F';
  return '';
}

/** Parámetros de un dispositivo por su nombre de ngspice ("q1", "q.x_u1.q1") o prefijo LTspice ("QN") */
export function deviceParams(device: string): DeviceParam[] {
  const names = BY_LETTER[device[0]?.toLowerCase() ?? ''] ?? [];
  return names.map((name) => ({ name, unit: paramUnit(name), label: LABELS[name]?.() ?? name }));
}

/** "@q1[gm]" → { device: "q1", param: "gm" }; null si no es un parámetro de dispositivo */
export function parseDeviceVector(name: string): { device: string; param: string } | null {
  const m = /^@([^[\]\s]+)\[(\w+)\]$/.exec(name.trim());
  return m ? { device: m[1], param: m[2] } : null;
}

/**
 * Nombre de un dispositivo de ngspice como se escribe en una traza: los de adentro de una
 * instancia "q.x_u1.q1" → "x_u1.q1" (la inversa de hierDevice)
 */
export function traceDevice(device: string): string {
  const m = /^([a-z])\.(.+)$/i.exec(device);
  if (m && m[2].includes('.')) {
    const last = m[2].slice(m[2].lastIndexOf('.') + 1);
    if (last[0]?.toLowerCase() === m[1].toLowerCase()) return m[2];
  }
  return device;
}

/** Corrientes por terminal que tienen nombre de LTspice (Ic(Q1), Ib(Q1)…) */
const TERMINALS = new Set(['ic', 'ib', 'ie', 'id', 'ig', 'is']);

/**
 * Nombre de traza para un vector "@dev[param]": las corrientes como en LTspice (I(R1), Ic(Q1)) y
 * el resto con la sintaxis de ngspice (@Q1[gm]). `idIsI`: Id de un dispositivo se muestra I().
 */
export function deviceTraceName(device: string, param: string, idIsI = false): string {
  const name = traceDevice(device).toUpperCase();
  const p = param.toLowerCase();
  if (p === 'i' || p === 'current' || (idIsI && p === 'id')) return `I(${name})`;
  if (TERMINALS.has(p)) return `I${p.slice(1)}(${name})`;
  return `@${name}[${p}]`;
}

/** Referencias @dev[param] escritas en una expresión de traza */
export function deviceRefs(expr: string): { device: string; param: string }[] {
  return [...expr.matchAll(/@([A-Za-z_§$][\w.§$]*)\[(\w+)\]/g)].map((m) => ({ device: m[1], param: m[2] }));
}

/** Unidad de una traza que es sólo un parámetro de dispositivo ("@Q1[gm]" → "S"), o null */
export function deviceExprUnit(expr: string): string | null {
  const d = parseDeviceVector(expr);
  return d ? paramUnit(d.param) : null;
}
