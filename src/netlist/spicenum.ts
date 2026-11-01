// Números SPICE con sufijo: 1k, 4.7u, 10meg, 2.2mil, 1e-3, 1µ…

const SUFFIX: [RegExp, number][] = [
  [/^meg/i, 1e6],
  [/^mil/i, 25.4e-6],
  [/^t/i, 1e12],
  [/^g/i, 1e9],
  [/^k/i, 1e3],
  [/^m/i, 1e-3],
  [/^[uµμ]/i, 1e-6],
  [/^n/i, 1e-9],
  [/^p/i, 1e-12],
  [/^f/i, 1e-15],
];

/** Multiplicador SPICE del sufijo con que empiezan las letras `rest` (meg, k, u, mil…), o undefined */
export function spiceSuffix(rest: string): number | undefined {
  for (const [re, mult] of SUFFIX) if (re.test(rest)) return mult;
  return undefined;
}

/** Valor numérico de un literal SPICE, o NaN si no es un número (p.ej. una expresión) */
export function parseSpiceNumber(s: string): number {
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(.*)$/i.exec(s);
  if (!m) return NaN;
  const base = parseFloat(m[1]);
  const rest = m[2].trim();
  if (!rest) return base;
  const mult = spiceSuffix(rest);
  if (mult !== undefined) return base * mult;
  // unidades sueltas (1V, 2A, 3Hz) se ignoran como en SPICE
  return /^[a-z]+$/i.test(rest) ? base : NaN;
}

// --- prefijos SI ----------------------------------------------------------------------------
// Dos convenciones conviven a propósito: en SPICE «M» es mili y mega se escribe «Meg»; el visor
// muestra «M» para mega (como cualquier instrumento) y sus campos lo leen así (parseDisplayNumber).
// Lo que se escribe en un campo SPICE sale siempre con SPICE_PREFIXES.

/** Prefijo de cada potencia de 1000, de 10⁻¹⁵ (f) a 10¹² (T) */
export type SiPrefixes = readonly [string, string, string, string, string, string, string, string, string, string];
/** Para escribir valores SPICE: «u» y «Meg» */
export const SPICE_PREFIXES: SiPrefixes = ['f', 'p', 'n', 'u', 'm', '', 'k', 'Meg', 'G', 'T'];
/** Como muestra LTspice los valores (pasos de .step): «µ» y «Meg»; SPICE también los lee */
export const LTSPICE_PREFIXES: SiPrefixes = ['f', 'p', 'n', 'µ', 'm', '', 'k', 'Meg', 'G', 'T'];
/** Para mostrar en el visor: «µ» y «M» (mega) */
export const DISPLAY_PREFIXES: SiPrefixes = ['f', 'p', 'n', 'µ', 'm', '', 'k', 'M', 'G', 'T'];

/**
 * Número con prefijo SI y `digits` cifras significativas: 0.0047 → "4.7m". Si el redondeo llega a
 * 1000 (0.99997 → "1000m") pasa al prefijo siguiente. Fuera de f…T queda con más cifras ("0.05f").
 */
export function formatSi(x: number, digits: number, prefixes: SiPrefixes): string {
  if (x === 0 || !Number.isFinite(x)) return String(x);
  let e = Math.min(4, Math.max(-5, Math.floor(Math.log10(Math.abs(x)) / 3)));
  let m = parseFloat((x / 10 ** (3 * e)).toPrecision(digits));
  if (Math.abs(m) >= 1000 && e < 4) m = parseFloat((x / 10 ** (3 * ++e)).toPrecision(digits));
  return `${m}${prefixes[e + 5]}`;
}

const DISPLAY_SUFFIX: Record<string, number> = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3, '': 1, k: 1e3, K: 1e3, M: 1e6, meg: 1e6, MEG: 1e6, Meg: 1e6, G: 1e9, T: 1e12 };

/**
 * Valor escrito en un campo del visor, con la convención con que el visor los muestra: "1m" = 1e-3,
 * "10M" = 10e6 (y también "10meg"), "2.5µs", "100kHz", "1e-3". La unidad (s, Hz, V…) es opcional.
 * null si no se entiende.
 */
export function parseDisplayNumber(text: string): number | null {
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(meg|MEG|Meg|[fpnuµμmkKMGT]?)\s*(s|Hz|hz|S|V|A|dB|°)?\s*$/.exec(text);
  if (!m) return null;
  const v = parseFloat(m[1]) * DISPLAY_SUFFIX[m[2]];
  return Number.isFinite(v) ? v : null;
}

/** Formato compacto aceptado por SPICE */
export function formatSpiceNumber(x: number): string {
  return Number(x.toPrecision(12)).toString();
}

/** Notación RKM (4k7, 2u2, 4R7 = 4.7k, 2.2u, 4.7) → notación SPICE; null si no es RKM */
export function fromRkm(s: string): string | null {
  const m = /^(\d+)(meg|[tgkmunpfrµμ])(\d+)$/i.exec(s.trim());
  if (!m) return null;
  const unit = /^r$/i.test(m[2]) ? '' : m[2];
  return `${m[1]}.${m[3]}${unit}`;
}
