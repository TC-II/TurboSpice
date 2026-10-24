// Señales digitales en el visor (#209): nodos de XSPICE y buses. Van en paneles propios
// (Pane.digital), con un carril por traza: no comparten ejes con las analógicas.
//
// Trazas: Dig(x1.q_0_d) es un bit (0, 1; 0,5 = desconocido o alta impedancia) y Dig(x1.q[3:0]) un
// bus armado con los bits x1.q_3_d … x1.q_0_d (los nodos de un puerto o reg q[3:0] de un bloque
// Verilog). Un bus vale el número que forman sus bits (NaN si alguno no está en 0 ni en 1) y se
// muestra en el radix de la traza.

export type Radix = 'hex' | 'dec' | 'sdec' | 'oct' | 'bin';
export const RADIXES: Radix[] = ['hex', 'dec', 'sdec', 'oct', 'bin'];

/** ¿Es una traza digital? (Dig(…)) */
export const isDigitalExpr = (e: string) => /^\s*Dig\([^)]*\)\s*$/i.test(e);

/** Bus "x1.q[3:0]" → base y bits (del más significativo al menos); null si es un solo bit */
export function busRange(arg: string): { base: string; bits: number[] } | null {
  const m = /^(.*)\[(\d+):(\d+)\]$/.exec(arg.trim());
  if (!m) return null;
  const hi = Number(m[2]);
  const lo = Number(m[3]);
  const n = Math.abs(hi - lo) + 1;
  if (n > 64) return null;
  return { base: m[1], bits: Array.from({ length: n }, (_, i) => (hi >= lo ? hi - i : hi + i)) };
}

/** Ancho en bits de una traza digital (1 para un bit) */
export function digitalWidth(expr: string): number {
  const m = /^\s*Dig\(([^)]*)\)\s*$/i.exec(expr);
  return (m && busRange(m[1])?.bits.length) || 1;
}

/** Junta los bits (del más significativo al menos) en un número por punto; NaN si alguno es X o Z */
export function joinBits(bits: Float64Array[]): Float64Array {
  const len = bits[0]?.length ?? 0;
  const out = new Float64Array(len);
  for (let k = 0; k < len; k++) {
    let v = 0;
    for (const b of bits) {
      const x = b[k];
      if (x !== 0 && x !== 1) {
        v = NaN;
        break;
      }
      v = v * 2 + x;
    }
    out[k] = v;
  }
  return out;
}

/** Valor de un bus en el radix: "0x3A", "58", "-6", "0o72", "0b111010"; "X" si no se conoce */
export function formatRadix(v: number, bits: number, radix: Radix = 'hex'): string {
  if (!Number.isFinite(v)) return 'X';
  if (bits === 1) return String(v);
  const digits = (base: number) => Math.ceil(bits / Math.log2(base));
  switch (radix) {
    case 'hex':
      return `0x${v.toString(16).toUpperCase().padStart(digits(16), '0')}`;
    case 'oct':
      return `0o${v.toString(8).padStart(digits(8), '0')}`;
    case 'bin':
      return `0b${v.toString(2).padStart(bits, '0')}`;
    case 'sdec':
      return String(v >= 2 ** (bits - 1) ? v - 2 ** bits : v);
    default:
      return String(v);
  }
}

export const radixLabel: Record<Radix, string> = { hex: 'Hex', dec: 'Dec', sdec: '±Dec', oct: 'Oct', bin: 'Bin' };

/**
 * Buses que se pueden armar con los nodos digitales de una simulación: los nodos "base_N_d"
 * (bits de un puerto o un reg de un bloque Verilog) con más de un bit, como "Dig(base[hi:lo])"
 */
export function busNames(nodes: string[]): string[] {
  const groups = new Map<string, number[]>();
  for (const n of nodes) {
    const m = /^(.*)_(\d+)_d$/i.exec(n);
    if (!m) continue;
    const g = groups.get(m[1]) ?? [];
    g.push(Number(m[2]));
    groups.set(m[1], g);
  }
  const out: string[] = [];
  for (const [base, bits] of groups) {
    if (bits.length < 2) continue;
    out.push(`Dig(${base}[${Math.max(...bits)}:${Math.min(...bits)}])`);
  }
  return out;
}
