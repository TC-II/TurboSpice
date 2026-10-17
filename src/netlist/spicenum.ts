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

/** Valor numérico de un literal SPICE, o NaN si no es un número (p.ej. una expresión) */
export function parseSpiceNumber(s: string): number {
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(.*)$/i.exec(s);
  if (!m) return NaN;
  const base = parseFloat(m[1]);
  const rest = m[2].trim();
  if (!rest) return base;
  for (const [re, mult] of SUFFIX) if (re.test(rest)) return base * mult;
  // unidades sueltas (1V, 2A, 3Hz) se ignoran como en SPICE
  return /^[a-z]+$/i.test(rest) ? base : NaN;
}

/** Formato compacto aceptado por SPICE */
export function formatSpiceNumber(x: number): string {
  return Number(x.toPrecision(12)).toString();
}
