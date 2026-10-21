// Compuertas digitales de LTspice (dispositivos A: AND, OR, XOR, BUF) traducidas a ngspice.
//
// La línea de LTspice tiene siempre 8 nodos: "A1 in1 in2 in3 in4 in5 _Q Q com MODELO params".
// Medido con LTspice -b (ver docs/compatibilidad-ltspice.md):
//  - entradas y salidas se miden respecto de com; una entrada en el nodo 0 no participa (los
//    pines sueltos de un símbolo A van a 0 en la netlist);
//  - umbral Ref = (Vhigh+Vlow)/2, con Vhigh=1 y Vlow=0 por omisión; XOR: alto si exactamente una
//    entrada está en alto (no paridad);
//  - Td es un retardo inercial (un pulso más corto que Td no pasa);
//  - Trise/Tfall son rampas lineales (si falta uno vale el otro); Tau es un RC a la salida;
//    Rout en serie y Cout de la salida a com;
//  - _Q es el complemento de Q (Vhigh+Vlow−Q).
//
// En ngspice: una fuente B calcula la lógica normalizada (0…1) con entradas comparadas al
// umbral; el retardo es una línea de transmisión ideal más un nodo que sólo sigue a la entrada
// cuando x(t) = x(t−Td) (si no, retiene); las rampas son el code model XSPICE slew; las
// salidas, fuentes B entre Vlow y Vhigh referidas a com.

const GATES = new Set(['and', 'or', 'xor', 'buf']);

/** Parámetros "k=v" o "k v" (LTspice acepta los dos; v puede ser {expr}) de la línea A */
function params(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const t = text.replace(/\s*=\s*/g, ' ').match(/\{[^{}]*\}|[^\s{}]+/g) ?? [];
  for (let i = 0; i + 1 < t.length; i += 2) out.set(t[i].toLowerCase(), t[i + 1].replace(/^\{|\}$/g, ''));
  return out;
}

/**
 * Líneas ngspice equivalentes a la compuerta de LTspice, o undefined si el modelo no es una
 * compuerta combinacional (flip-flops, schmitt… quedan como están).
 */
export function translateDigital(name: string, nodes: string[], value: string, warnings: string[]): string[] | undefined {
  const m = /^\s*(\w+)\b(.*)$/s.exec(value);
  const model = m?.[1].toLowerCase() ?? '';
  if (!GATES.has(model) || nodes.length !== 8) return undefined;
  const p = params(m![2]);
  // tripdt/tripdv sólo controlan el paso de LTspice
  const known = new Set(['vhigh', 'vlow', 'ref', 'td', 'trise', 'tfall', 'tau', 'rout', 'cout', 'tripdt', 'tripdv']);
  const ignored = [...p.keys()].filter((k) => !known.has(k));
  if (ignored.length) warnings.push(`${name}: parámetros de la compuerta sin traducir: ${ignored.join(', ')}`);
  const num = (k: string, d: string) => `{${p.get(k) ?? d}}`;
  const vh = num('vhigh', '1'), vl = num('vlow', '0');
  const ref = p.has('ref') ? num('ref', '') : `(${vh}+${vl})/2`;
  const [i1, i2, i3, i4, i5, qb, q, com] = nodes;
  const n = `${name}__`;
  const lines: string[] = [];

  // entradas normalizadas: rampa de 0,1 mV alrededor del umbral (continua para Newton)
  const bit = (x: string) => `min(max((V(${x},${com})-${ref})*1e4+0.5,0),1)`;
  const ins = model === 'buf' ? [i1] : [i1, i2, i3, i4, i5].filter((x) => x !== '0');
  const b = ins.map(bit);
  const not = (x: string) => `(1-${x})`;
  let logic: string;
  if (!b.length) logic = model === 'and' ? '1' : '0';
  else if (model === 'buf' || model === 'and') logic = b.join('*');
  else if (model === 'or') logic = `1-${b.map(not).join('*')}`;
  else logic = b.map((x, i) => [x, ...b.filter((_, j) => j !== i).map(not)].join('*')).join('+');
  lines.push(`B_${n}x ${n}x 0 V=${logic}`);
  // en ngspice un nodo que sólo aparece en la expresión de una B no existe: cada entrada lleva
  // una resistencia de 1 TΩ a com (como gmin; ver floating.ts)
  [...new Set(ins)].filter((x) => x !== '0' && x !== com).forEach((x, k) => lines.push(`R_${n}i${k + 1} ${x} ${com} 1e12`));
  let y = `${n}x`;

  if (p.has('td') && p.get('td') !== '0') {
    lines.push(
      `T_${n}d ${y} 0 ${n}d 0 Z0=1 TD=${num('td', '0')}`,
      `R_${n}d ${n}d 0 1`,
      `C_${n}h ${n}h 0 {(${p.get('td')})/100}`,
      `B_${n}h 0 ${n}h I=(abs(V(${y})-V(${n}d))<0.5) ? (V(${y})-V(${n}h)) : 0`,
    );
    y = `${n}h`;
  }
  if (p.has('trise') || p.has('tfall')) {
    const tr = p.get('trise') ?? p.get('tfall')!, tf = p.get('tfall') ?? tr;
    lines.push(`A_${n}s ${y} ${n}s ${n}sm`, `.model ${n}sm slew(rise_slope={1/(${tr})} fall_slope={1/(${tf})})`);
    y = `${n}s`;
  }
  if (p.has('tau')) {
    lines.push(`R_${n}t ${y} ${n}t 1`, `C_${n}t ${n}t 0 ${num('tau', '0')}`);
    y = `${n}t`;
  }

  const out = (node: string, tag: string, expr: string) => {
    if (node === '0') return;
    if (p.has('rout')) {
      lines.push(`B_${n}${tag} ${n}${tag} ${com} V=${expr}`, `R_${n}${tag} ${n}${tag} ${node} ${num('rout', '0')}`);
      if (p.has('cout')) lines.push(`C_${n}${tag} ${node} ${com} ${num('cout', '0')}`);
    } else lines.push(`B_${n}${tag} ${node} ${com} V=${expr}`);
  };
  // recortada a [0, 1]: la línea T y el nodo de retención sobrepasan un poco con trap
  const v = y === `${n}x` ? `V(${y})` : `min(max(V(${y}),0),1)`;
  out(q, 'q', `${vl}+(${vh}-${vl})*${v}`);
  out(qb, 'qb', `${vh}-(${vh}-${vl})*${v}`);
  return lines;
}
