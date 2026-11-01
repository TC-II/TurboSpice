// Nombres y valores con LaTeX (#328) en la netlist. En el esquemático "$R_2$" o "$V_{out}$" se
// dibujan como fórmula, pero para ngspice `$` abre un comentario de fin de línea y `{…}` es una
// expresión: "V1 $V_{out}$ 0 10" queda como "V1" solo y la simulación no arranca. A la netlist
// (y a los resultados, las trazas y las sondas, que usan el mismo nombre) va una versión simple:
// "$V_{out}$" → V_out, "$R_2$" → R_2, "$\omega_0$" → omega_0. Sin `$` no cambia nada.

/** LTspice duplica la barra al guardar el .asc (\cdot queda \\cdot): `\\` es una barra */
const unescape = (s: string) => s.replace(/\\\\/g, '\\');

/** Un nombre de red o de componente escrito con $…$, como identificador de SPICE */
export function spiceName(s: string): string {
  if (!s.includes('$')) return s;
  // (LTspice guarda la barra doble: \\omega)
  const out = unescape(s)
    .replace(/\\[,;:! ]/g, '')
    .replace(/\\([A-Za-z]+)/g, '$1')
    .replace(/[^A-Za-z0-9_.#+\-[\]:]/g, '');
  return out || s.replace(/\$/g, '');
}

/** Lo que LaTeX escribe en un valor y SPICE lee distinto (µ con \mu: si no, la m sería mili) */
const VALUE_TEX: [RegExp, string][] = [
  [/\\mu\s*/g, 'u'],
  [/\\(Omega|ohm)\b\s*/g, ''],
  [/\\[,;:! ]/g, ''],
  [/\\(cdot|times)\b\s*/g, '*'],
  [/\\(text|mathrm|mathit|mbox)\s*/g, ''],
];

/** Un valor escrito con $…$ ("$4.7\,\mu F$") como lo lee SPICE ("4.7uF"); sin `$`, igual */
export function spiceValue(s: string): string {
  if (!/\$[^$]+\$/.test(s)) return s;
  let v = unescape(s).replace(/\$([^$]+)\$/g, (_, tex: string) => {
    let x = tex;
    for (const [re, to] of VALUE_TEX) x = x.replace(re, to);
    return x.replace(/[{}]/g, '').replace(/\\([A-Za-z]+)/g, '$1').replace(/\s+/g, '');
  });
  v = v.replace(/Ω/g, '');
  return v;
}
