import { t } from '../i18n/i18n.ts';
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
//
// Flip-flops (medido con LTspice -b, 24.1.9):
//  - DFLOP: in1=D, in3=CLK, in4=PRE, in5=CLR; toma D en el flanco de subida de CLK; PRE y CLR
//    son asíncronos, activos en alto, y CLR gana si están los dos;
//  - SRFLOP: in1=S, in2=R, asíncronos; R gana si están los dos;
//  - el punto de operación respeta PRE/S y CLR/R; sin ellos Q arranca en Vlow.
// SCHMITT (in1, _Q, Q, com): sube cuando V(in) > Vt+Vh y baja cuando V(in) < Vt−Vh, con V(in)
// medida respecto de tierra (no de com); Vt vale Ref por omisión y Vh, 5 % de |Vt|. Es un SR
// con set = (in > Vt+Vh) y reset = (in < Vt−Vh).
// En ngspice: las entradas normalizadas pasan por un adc_bridge a un d_dff de XSPICE (el SR es un
// d_dff sin reloj que sólo usa set y reset) y un dac_bridge vuelve a 0…1; de ahí en adelante
// (Td, rampas, Tau, salidas) es igual que en las compuertas.

const GATES = new Set(['and', 'or', 'xor', 'buf']);
const FLOPS = new Set(['dflop', 'srflop', 'schmitt']);

/** Parámetros "k=v" o "k v" (LTspice acepta los dos; v puede ser {expr}) de la línea A */
function params(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const tt = text.replace(/\s*=\s*/g, ' ').match(/\{[^{}]*\}|[^\s{}]+/g) ?? [];
  for (let i = 0; i + 1 < tt.length; i += 2) out.set(tt[i].toLowerCase(), tt[i + 1].replace(/^\{|\}$/g, ''));
  return out;
}

/**
 * Líneas ngspice equivalentes a la compuerta de LTspice, o undefined si el modelo no es una
 * compuerta, un flip-flop ni un Schmitt (contadores… quedan como están).
 */
export function translateDigital(name: string, nodes: string[], value: string, warnings: string[]): string[] | undefined {
  const m = /^\s*(\w+)\b(.*)$/s.exec(value);
  const model = m?.[1].toLowerCase() ?? '';
  if ((!GATES.has(model) && !FLOPS.has(model)) || nodes.length !== 8) return undefined;
  const p = params(m![2]);
  // tripdt/tripdv sólo controlan el paso de LTspice
  const known = new Set(['vhigh', 'vlow', 'ref', ...(model === 'schmitt' ? ['vt', 'vh'] : []), 'td', 'trise', 'tfall', 'tau', 'rout', 'cout', 'tripdt', 'tripdv']);
  const ignored = [...p.keys()].filter((k) => !known.has(k));
  if (ignored.length) warnings.push(t('{name}: gate parameters not translated: {p1}', { name, p1: ignored.join(', ') }));
  const num = (k: string, d: string) => `{${p.get(k) ?? d}}`;
  const vh = num('vhigh', '1'), vl = num('vlow', '0');
  const ref = p.has('ref') ? num('ref', '') : `(${vh}+${vl})/2`;
  const [i1, i2, i3, i4, i5, qb, q, com] = nodes;
  const n = `${name}__`;
  const lines: string[] = [];

  // entradas normalizadas: rampa de 0,1 mV alrededor del umbral (continua para Newton)
  const bit = (x: string) => `min(max((V(${x},${com})-${ref})*1e4+0.5,0),1)`;
  const not = (x: string) => `(1-${x})`;
  // en ngspice un nodo que sólo aparece en la expresión de una B no existe: cada entrada lleva
  // una resistencia de 1 TΩ a com (como gmin; ver floating.ts)
  const anchor = (ins: string[]) =>
    [...new Set(ins)].filter((x) => x !== '0' && x !== com).forEach((x, k) => lines.push(`R_${n}i${k + 1} ${x} ${com} 1e12`));
  if (FLOPS.has(model)) {
    const dff = model === 'dflop';
    const set = dff ? i4 : i1, rst = dff ? i5 : i2;
    const on = (x: string) => (x === '0' ? '0' : bit(x));
    let sig: [string, string][];
    if (model === 'schmitt') {
      const vt = p.has('vt') ? num('vt', '') : ref;
      const vhy = p.has('vh') ? num('vh', '') : `0.05*abs(${vt})`;
      const cmp = (e: string) => `min(max((${e})*1e4+0.5,0),1)`;
      sig = [['fs', cmp(`V(${i1})-${vt}-${vhy}`)], ['fr', cmp(`${vt}-${vhy}-V(${i1})`)]];
    } else {
      // CLR/R tiene prioridad: el set efectivo es set·¬reset
      sig = [
        ['fs', `${on(set)}*${not(on(rst))}`],
        ['fr', on(rst)],
        ...(dff ? ([['fd', on(i1)], ['fc', on(i3)]] as [string, string][]) : []),
      ];
    }
    sig.forEach(([k, e]) => lines.push(`B_${n}${k} ${n}${k} 0 V=${e}`));
    anchor(dff ? [i1, i3, set, rst] : model === 'schmitt' ? [i1] : [set, rst]);
    const dig = (k: string) => `${n}${k}_d`;
    lines.push(
      `A_${n}adc [${sig.map(([k]) => `${n}${k}`).join(' ')}] [${sig.map(([k]) => dig(k)).join(' ')}] ${n}adcm`,
      `.model ${n}adcm adc_bridge(in_low=0.5 in_high=0.5 rise_delay=1e-12 fall_delay=1e-12)`,
      // SR: d_dff sin flancos (clk a un pulldown); data da igual
      dff
        ? `A_${n}ff ${dig('fd')} ${dig('fc')} ${dig('fs')} ${dig('fr')} ${dig('fq')} NULL ${n}ffm`
        : `A_${n}ff ${dig('fr')} ${dig('fz')} ${dig('fs')} ${dig('fr')} ${dig('fq')} NULL ${n}ffm`,
      `.model ${n}ffm d_dff(clk_delay=1e-12 set_delay=1e-12 reset_delay=1e-12 rise_delay=1e-12 fall_delay=1e-12)`,
      `A_${n}dac [${dig('fq')}] [${n}x] ${n}dacm`,
      `.model ${n}dacm dac_bridge(out_low=0 out_high=1 t_rise=1e-10 t_fall=1e-10)`,
    );
    if (!dff) lines.push(`A_${n}fz ${dig('fz')} ${n}fzm`, `.model ${n}fzm d_pulldown`);
  } else {
    const ins = model === 'buf' ? [i1] : [i1, i2, i3, i4, i5].filter((x) => x !== '0');
    const b = ins.map(bit);
    let logic: string;
    if (!b.length) logic = model === 'and' ? '1' : '0';
    else if (model === 'buf' || model === 'and') logic = b.join('*');
    else if (model === 'or') logic = `1-${b.map(not).join('*')}`;
    else logic = b.map((x, i) => [x, ...b.filter((_, j) => j !== i).map(not)].join('*')).join('+');
    lines.push(`B_${n}x ${n}x 0 V=${logic}`);
    anchor(ins);
  }
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
  const v = y === `${n}x` && !FLOPS.has(model) ? `V(${y})` : `min(max(V(${y}),0),1)`;
  out(q, 'q', `${vl}+(${vh}-${vl})*${v}`);
  out(qb, 'qb', `${vh}-(${vh}-${vl})*${v}`);
  return lines;
}
