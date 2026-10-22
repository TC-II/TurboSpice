// Componentes de la librería (library/cmp/standard.*), como lib/cmp de LTspice: la lista de la
// que se elige el valor de un transistor, diodo, capacitor… En texto plano:
//   standard.bjt, .dio, .jft, .mos   una línea .model por componente (con los informativos de
//                                     LTspice: mfg=, Vceo=, Iave=…)
//   standard.cap, .ind, .res, .bead  "nombre clave=valor …" (en LTspice son binarios)

import { parseSpiceNumber } from '../netlist/spicenum.ts';
import { t } from '../i18n/i18n.ts';

export type CmpKind = 'bjt' | 'dio' | 'jft' | 'mos' | 'cap' | 'ind' | 'res' | 'bead';

export interface CmpPart {
  name: string;
  kind: CmpKind;
  /** tipo de .model (NPN, PNP, D, NJF, PJF, VDMOS…); '' en los pasivos */
  type: string;
  /** parámetros con la clave en minúsculas y el valor como está escrito */
  params: Map<string, string>;
  /** banderas sin valor (pchan) */
  flags: Set<string>;
}

/** Pasivos: listas grandes (standard.cap e .ind ~900 kB cada una) que la app baja aparte (#189) */
export const PASSIVE_KINDS: CmpKind[] = ['cap', 'ind', 'res', 'bead'];

export const CMP_FILES: Record<CmpKind, string> = {
  bjt: 'standard.bjt',
  dio: 'standard.dio',
  jft: 'standard.jft',
  mos: 'standard.mos',
  cap: 'standard.cap',
  ind: 'standard.ind',
  res: 'standard.res',
  bead: 'standard.bead',
};

/** Tipo de componentes de un archivo de library/cmp (por su nombre: standard.bjt → bjt) */
export const kindOfFile = (file: string): CmpKind | undefined =>
  (Object.entries(CMP_FILES) as [CmpKind, string][]).find(([, f]) => f.toLowerCase() === file.toLowerCase().split('/').pop())?.[0];

/** "a=1 b = 2 pchan" → parámetros y banderas */
function readParams(s: string): { params: Map<string, string>; flags: Set<string> } {
  const params = new Map<string, string>();
  const flags = new Set<string>();
  const tt = s.replace(/\s*=\s*/g, '=').split(/[\s,]+/).filter(Boolean);
  for (const tok of tt) {
    const i = tok.indexOf('=');
    if (i > 0) params.set(tok.slice(0, i).toLowerCase(), tok.slice(i + 1));
    else flags.add(tok.toLowerCase());
  }
  return { params, flags };
}

/** Componentes de un archivo de library/cmp */
export function parseCmp(file: string, text: string): CmpPart[] {
  const kind = kindOfFile(file);
  if (!kind) return [];
  // líneas lógicas: las que empiezan con "+" continúan la anterior; "*" y ";" son comentarios
  const lines: string[] = [];
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const l = raw.replace(/;.*$/, '').trimEnd();
    if (!l.trim() || /^\s*\*/.test(l)) continue;
    if (/^\s*\+/.test(l) && lines.length) lines[lines.length - 1] += ' ' + l.replace(/^\s*\+/, '');
    else lines.push(l.trim());
  }
  const out: CmpPart[] = [];
  for (const l of lines) {
    if (/^\.model\b/i.test(l)) {
      const m = /^\.model\s+(\S+)\s+(?:ako:\S+\s+)?([A-Za-z]+)\s*\(?(.*?)\)?\s*$/is.exec(l);
      if (!m) continue;
      const { params, flags } = readParams(m[3]);
      out.push({ name: m[1], kind, type: m[2].toUpperCase(), params, flags });
    } else if (!/^\./.test(l)) {
      const [name, ...rest] = l.split(/\s+/);
      const { params, flags } = readParams(rest.join(' '));
      out.push({ name, kind, type: '', params, flags });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Qué lista corresponde a cada símbolo y qué columnas mostrar

export interface CmpColumn {
  /** clave del parámetro (minúsculas); 'type'/'mfg' también salen de params */
  key: string;
  label: string;
  unit?: string;
}

export const CMP_COLUMNS: Record<CmpKind, CmpColumn[]> = {
  bjt: [
    { key: '@type', label: t('Type') },
    { key: 'vceo', label: 'Vceo', unit: 'V' },
    { key: 'icrating', label: 'Ic', unit: 'A' },
    { key: 'bf', label: 'β (BF)' },
    { key: 'vaf', label: 'VAF', unit: 'V' },
    { key: 'cjc', label: 'Cjc', unit: 'F' },
    { key: 'tf', label: 'TF', unit: 's' },
    { key: 'mfg', label: t('Manufacturer') },
  ],
  dio: [
    { key: 'type', label: t('Type') },
    { key: 'vpk', label: 'Vpk', unit: 'V' },
    { key: 'iave', label: 'Iave', unit: 'A' },
    { key: 'bv', label: 'BV', unit: 'V' },
    { key: 'is', label: 'Is', unit: 'A' },
    { key: 'cjo', label: 'Cjo', unit: 'F' },
    { key: 'mfg', label: t('Manufacturer') },
  ],
  jft: [
    { key: '@type', label: t('Channel') },
    { key: 'vto', label: 'Vto', unit: 'V' },
    { key: 'beta', label: 'Beta', unit: 'A/V²' },
    { key: 'lambda', label: 'λ', unit: '1/V' },
    { key: 'cgs', label: 'Cgs', unit: 'F' },
    { key: 'cgd', label: 'Cgd', unit: 'F' },
    { key: 'mfg', label: t('Manufacturer') },
  ],
  mos: [
    { key: '@channel', label: t('Channel') },
    { key: 'vds', label: 'Vds', unit: 'V' },
    { key: 'ron', label: 'Ron', unit: 'Ω' },
    { key: 'qg', label: 'Qg', unit: 'C' },
    { key: 'vto', label: 'Vto', unit: 'V' },
    { key: 'cgs', label: 'Cgs', unit: 'F' },
    { key: 'mfg', label: t('Manufacturer') },
  ],
  cap: [
    { key: 'c', label: 'C', unit: 'F' },
    { key: 'v', label: 'V', unit: 'V' },
    { key: 'irms', label: 'Irms', unit: 'A' },
    { key: 'rser', label: 'Rser', unit: 'Ω' },
    { key: 'lser', label: 'Lser', unit: 'H' },
    { key: 'type', label: t('Type') },
    { key: 'mfg', label: t('Manufacturer') },
  ],
  ind: [
    { key: 'l', label: 'L', unit: 'H' },
    { key: 'ipk', label: 'Ipk', unit: 'A' },
    { key: 'rser', label: 'Rser', unit: 'Ω' },
    { key: 'rpar', label: 'Rpar', unit: 'Ω' },
    { key: 'cpar', label: 'Cpar', unit: 'F' },
    { key: 'mfg', label: t('Manufacturer') },
  ],
  res: [
    { key: 'r', label: 'R', unit: 'Ω' },
    { key: 'tol', label: t('Tolerance') },
    { key: 'p', label: t('Power'), unit: 'W' },
    { key: 'mfg', label: t('Manufacturer') },
  ],
  bead: [
    { key: 'z100m', label: 'Z @100 MHz', unit: 'Ω' },
    { key: 'idc', label: 'Idc', unit: 'A' },
    { key: 'rdc', label: 'Rdc', unit: 'Ω' },
    { key: 'l', label: 'L', unit: 'H' },
    { key: 'mfg', label: t('Manufacturer') },
  ],
};

/** Valor de una columna para mostrar */
/**
 * Orden de dos celdas de la tabla: por número si las dos lo son (con sufijos SPICE: 4.7k, 100n),
 * si no por texto (con los números de adentro en orden: BC547 < BC5470). Las vacías van al final
 * en cualquier sentido (`dir` 1 ascendente, -1 descendente).
 */
export function compareCells(a: string, b: string, dir: 1 | -1): number {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  const [x, y] = [parseSpiceNumber(a), parseSpiceNumber(b)];
  const c = !Number.isNaN(x) && !Number.isNaN(y) ? x - y : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  return c * dir;
}

export function cmpCell(p: CmpPart, key: string): string {
  if (key === '@type') return p.type;
  if (key === '@channel') return p.flags.has('pchan') ? 'P' : 'N';
  const v = p.params.get(key) ?? '';
  return key === 'mfg' ? v.replace(/_/g, ' ') : v;
}

/** Listas que corresponden a un símbolo (por su prefijo y su nombre), con su filtro */
export function cmpChoicesFor(prefix: string, symbol: string): { kind: CmpKind; label: string; accept(p: CmpPart): boolean }[] {
  const sym = symbol.toLowerCase().split(/[\\/]/).pop() ?? '';
  const pre = prefix.toUpperCase();
  const dioType = (p: CmpPart) => (p.params.get('type') ?? '').toLowerCase();
  switch (pre) {
    case 'QN':
    case 'QP':
      return [{ kind: 'bjt', label: t('Transistors'), accept: (p) => p.type === (pre === 'QN' ? 'NPN' : 'PNP') }];
    case 'D': {
      const want = sym === 'zener' ? 'zener' : sym === 'schottky' ? 'schottky' : sym === 'led' ? 'led' : sym === 'varactor' ? 'varactor' : '';
      return [{ kind: 'dio', label: t('Diodes'), accept: (p) => p.type === 'D' && (!want || dioType(p) === want) }];
    }
    case 'JN':
    case 'JP':
      return [{ kind: 'jft', label: 'JFET', accept: (p) => p.type === (pre === 'JN' ? 'NJF' : 'PJF') }];
    case 'MN':
    case 'MP':
      // VDMOS es de 3 terminales: los símbolos de 4 (nmos4, pmos4) no lo usan
      if (/4$/.test(sym)) return [];
      return [{ kind: 'mos', label: 'MOSFET', accept: (p) => p.type === 'VDMOS' && p.flags.has('pchan') === (pre === 'MP') }];
    case 'C':
      return [{ kind: 'cap', label: t('Capacitors'), accept: () => true }];
    case 'L':
      return [
        { kind: 'ind', label: t('Inductors'), accept: () => true },
        { kind: 'bead', label: 'Ferrites', accept: () => true },
      ];
    case 'R':
      return [{ kind: 'res', label: t('Resistors'), accept: () => true }];
    default:
      return [];
  }
}

/**
 * Atributos a escribir al elegir una pieza: los semiconductores usan el nombre del modelo como
 * valor; los pasivos, su valor principal y los parásitos en SpiceLine (como LTspice).
 */
export function cmpApply(p: CmpPart): { Value: string; SpiceLine: string | null } {
  const g = (k: string) => p.params.get(k);
  const line = (pairs: [string, string | undefined][]) => pairs.filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(' ') || null;
  switch (p.kind) {
    case 'cap':
      return { Value: g('c') ?? p.name, SpiceLine: line([['Rser', g('rser')], ['Lser', g('lser')], ['Rpar', g('rpar')], ['Cpar', g('cpar')]]) };
    case 'ind':
      return { Value: g('l') ?? p.name, SpiceLine: line([['Rser', g('rser')], ['Rpar', g('rpar')], ['Cpar', g('cpar')]]) };
    case 'bead':
      return { Value: g('l') ?? p.name, SpiceLine: line([['Rser', g('rdc')], ['Rpar', g('rpar')], ['Cpar', g('cpar')]]) };
    case 'res':
      return { Value: g('r') ?? p.name, SpiceLine: null };
    default:
      return { Value: p.name, SpiceLine: null };
  }
}

/** Parámetros que sólo informa LTspice (tabla de componentes) y que ngspice no acepta */
const LTSPICE_ONLY = /\b(iave|vpk|ipk|vceo|icrating|mfg|type)\s*=\s*[^\s,)]+/gi;

/** Saca de las líneas .model (y sus continuaciones "+") los parámetros que sólo usa LTspice */
export function stripLtspiceInfo(text: string): string {
  let inModel = false;
  return text
    .split(/(\r\n|\r|\n)/)
    .map((line) => {
      if (/^(\r\n|\r|\n)$/.test(line)) return line;
      if (/^\s*\.model\b/i.test(line)) inModel = true;
      else if (!/^\s*\+/.test(line)) inModel = false;
      return inModel ? line.replace(LTSPICE_ONLY, '').replace(/\s+\)/, ')') : line;
    })
    .join('');
}
