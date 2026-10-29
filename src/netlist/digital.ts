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
// medida respecto de tierra (no de com), o V(in1,in2) en los diferenciales (in2 = in−); Vt vale Ref por omisión y Vh, 5 % de |Vt|. Es un SR
// con set = (in > Vt+Vh) y reset = (in < Vt−Vh).
// En ngspice: las entradas normalizadas pasan por un adc_bridge a un d_dff de XSPICE (el SR es un
// d_dff sin reloj que sólo usa set y reset) y un dac_bridge vuelve a 0…1; de ahí en adelante
// (Td, rampas, Tau, salidas) es igual que en las compuertas.
//
// COUNTER (in1=CLK, _Q=Phi2, Q=Phi1, com; medido con LTspice -b, 24.1.10): con n = flancos de
// subida de CLK contados desde t=0, Phi1 está en alto si (n mod cycles) < round(duty·cycles);
// duty = 0,5 por omisión y cycles es obligatorio. En ngspice: d_fdiv de XSPICE.
// PHASEDET (in1=a, in2=b, Q, com): detector de fase/frecuencia tipo 3/4 con salida de
// corriente: Iout (100 µA) hacia Q mientras a adelanta, −Iout mientras b adelanta, en paralelo
// con Rout (10 GΩ); Vhigh/Vlow, si se dan, recortan la tensión de Q; el umbral es Ref = 0,5
// aunque cambien Vhigh/Vlow. En ngspice: dos d_dff
// (D=1, reloj a y b) que se borran cuando están los dos en alto.
// SAMPLEHOLD (in1=in+, in2=in−, in3=CLK, in4=S/H, Q=out, com): con CLK toma V(in+,in−) en el
// flanco de subida; con S/H sigue la entrada en alto y retiene en bajo (no se pueden usar los
// dos). Arranca en 0. En ngspice: un capacitor que sigue a la entrada mientras dura la ventana.
// MODULATOR (in1=FM, in2=AM, _Q=COS, Q=SIN, com): V(AM)·sin(2π∫f dt) (y cos en _Q), con f = space + V(FM)·(mark−space);
// mark es obligatorio (space = mark si falta). En ngspice: el integrador int de XSPICE.
// VARISTOR (in1, in2, Q=out, com): recorta |V(out)| a |V(in1,in2)| a través de rclamp (1 Ω).

const GATES = new Set(['and', 'or', 'xor', 'buf']);
const FLOPS = new Set(['dflop', 'srflop', 'schmitt', 'counter']);
const SPECIAL = new Set(['phasedet', 'samplehold', 'modulator', 'varistor']);

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
  if ((!GATES.has(model) && !FLOPS.has(model) && !SPECIAL.has(model)) || nodes.length !== 8) return undefined;
  const p = params(m![2]);
  if (model === 'counter' && (!p.has('cycles') || /\b[VI]\s*\(/i.test(p.get('cycles')!))) {
    warnings.push(t('{name}: COUNTER with a non-constant cycles is not translated', { name }));
    return undefined;
  }
  // tripdt/tripdv sólo controlan el paso de LTspice
  const extra: Record<string, string[]> = { schmitt: ['vt', 'vh'], counter: ['cycles', 'duty'], phasedet: ['iout'], modulator: ['mark', 'space'], varistor: ['rclamp'] };
  const known = new Set(['vhigh', 'vlow', 'ref', ...(extra[model] ?? []), 'td', 'trise', 'tfall', 'tau', 'rout', 'cout', 'tripdt', 'tripdv']);
  const ignored = [...p.keys()].filter((k) => !known.has(k));
  if (ignored.length) warnings.push(t('{name}: gate parameters not translated: {p1}', { name, p1: ignored.join(', ') }));
  const num = (k: string, d: string) => `{${p.get(k) ?? d}}`;
  const vh = num('vhigh', '1'), vl = num('vlow', '0');
  // PHASEDET: umbral 0,5 por omisión aunque cambien Vhigh/Vlow (medido)
  const ref = p.has('ref') ? num('ref', '') : model === 'phasedet' ? '0.5' : `(${vh}+${vl})/2`;
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
  const adc = () => lines.push(`.model ${n}adcm adc_bridge(in_low=0.5 in_high=0.5 rise_delay=1e-12 fall_delay=1e-12)`);
  const dac = () => lines.push(`.model ${n}dacm dac_bridge(out_low=0 out_high=1 t_rise=1e-10 t_fall=1e-10)`);
  if (model === 'phasedet') {
    lines.push(`B_${n}a ${n}a 0 V=${bit(i1)}`, `B_${n}b ${n}b 0 V=${bit(i2)}`);
    anchor([i1, i2]);
    lines.push(
      `A_${n}adc [${n}a ${n}b] [${n}a_d ${n}b_d] ${n}adcm`,
      `A_${n}one ${n}one ${n}onem`,
      `.model ${n}onem d_pullup`,
      `A_${n}zero ${n}zero ${n}zerom`,
      `.model ${n}zerom d_pulldown`,
      `A_${n}up ${n}one ${n}a_d ${n}zero ${n}clr ${n}up NULL ${n}ffm`,
      `A_${n}dn ${n}one ${n}b_d ${n}zero ${n}clr ${n}dn NULL ${n}ffm`,
      `A_${n}and [${n}up ${n}dn] ${n}clr ${n}andm`,
      `.model ${n}andm d_and(rise_delay=1e-11 fall_delay=1e-12)`,
      `.model ${n}ffm d_dff(clk_delay=1e-12 set_delay=1e-12 reset_delay=1e-12 rise_delay=1e-12 fall_delay=1e-12)`,
      `A_${n}dac [${n}up ${n}dn] [${n}u ${n}d] ${n}dacm`,
    );
    adc();
    dac();
    if (q === '0') return lines;
    const vq = `V(${q},${com})`;
    // recorte suave (1 mV) contra Vhigh/Vlow, sólo si se dan
    const up = p.has('vhigh') ? `*min(max((${vh}-${vq})*1e3,0),1)` : '';
    const dn = p.has('vlow') ? `*min(max((${vq}-${vl})*1e3,0),1)` : '';
    lines.push(
      `B_${n}q ${com} ${q} I=${num('iout', '100u')}*(V(${n}u)${up}-V(${n}d)${dn})`,
      `R_${n}q ${q} ${com} ${num('rout', '1e10')}`,
    );
    if (p.has('cout')) lines.push(`C_${n}q ${q} ${com} ${num('cout', '0')}`);
    return lines;
  }
  if (model === 'modulator') {
    if (!p.has('mark')) {
      warnings.push(t('{name}: MODULATOR without mark is not translated', { name }));
      return undefined;
    }
    const mark = num('mark', '0'), space = p.has('space') ? num('space', '0') : mark;
    const fm = i1 === '0' ? '0' : `V(${i1})`, am = i2 === '0' ? '0' : `V(${i2})`;
    anchor([i1, i2]);
    lines.push(
      `B_${n}f ${n}f 0 V=${space}+(${mark}-${space})*${fm}`,
      `A_${n}int ${n}f ${n}ph ${n}intm`,
      `.model ${n}intm int(gain=1 out_ic=0 out_lower_limit=-1e30 out_upper_limit=1e30)`,
    );
    if (q !== '0') lines.push(`B_${n}q ${q} ${com} V=${am}*sin(2*pi*V(${n}ph))`);
    // modulate2: COS en _Q
    if (qb !== '0') lines.push(`B_${n}qb ${qb} ${com} V=${am}*cos(2*pi*V(${n}ph))`);
    return lines;
  }
  if (model === 'varistor') {
    if (q === '0') return lines;
    const vc = `abs(V(${i1},${i2}))`, v = `V(${q},${com})`, r = num('rclamp', '1');
    anchor([i1, i2]);
    lines.push(`B_${n}q ${q} ${com} I=(${v}>${vc}) ? (${v}-${vc})/${r} : (${v}<-${vc}) ? (${v}+${vc})/${r} : 0`);
    return lines;
  }
  if (model === 'samplehold') {
    const vin = i2 === '0' ? `V(${i1})` : `V(${i1},${i2})`;
    anchor([i1, i2, i3, i4]);
    if (i3 !== '0' && i4 !== '0') warnings.push(t('{name}: SAMPLEHOLD with both CLK and S/H connected', { name }));
    let track: string;
    if (i3 !== '0') {
      // ventana de 1 ns en cada flanco de subida de CLK
      lines.push(
        `B_${n}c ${n}c 0 V=${bit(i3)}`,
        `A_${n}adc [${n}c] [${n}c_d] ${n}adcm`,
        `A_${n}inv ${n}c_d ${n}cn_d ${n}invm`,
        `.model ${n}invm d_inverter(rise_delay=1e-9 fall_delay=1e-9)`,
        `A_${n}and [${n}c_d ${n}cn_d] ${n}w_d ${n}andm`,
        `.model ${n}andm d_and(rise_delay=1e-12 fall_delay=1e-12)`,
        `A_${n}dac [${n}w_d] [${n}w] ${n}dacm`,
      );
      adc();
      dac();
      track = `V(${n}w)`;
    } else track = i4 === '0' ? '0' : bit(i4);
    lines.push(
      `C_${n}h ${n}h 0 1n`,
      `R_${n}h ${n}h 0 1e12`,
      `B_${n}h 0 ${n}h I=10*${track}*(${vin}-V(${n}h))`,
    );
    if (q !== '0') lines.push(`B_${n}q ${q} ${com} V=V(${n}h)`);
    return lines;
  }
  if (model === 'counter') {
    // d_fdiv toma enteros: si son números se calculan acá
    const c = Number(p.get('cycles')), d = Number(p.get('duty') ?? '0.5');
    const cyc = Number.isFinite(c) ? String(Math.round(c)) : num('cycles', '2');
    const hi = Number.isFinite(c) && Number.isFinite(d) ? String(Math.round(d * c)) : `{round(${p.get('duty') ?? '0.5'}*${p.get('cycles')})}`;
    lines.push(
      `B_${n}c ${n}c 0 V=${bit(i1)}`,
      `A_${n}adc [${n}c] [${n}c_d] ${n}adcm`,
      `A_${n}div ${n}c_d ${n}fq_d ${n}divm`,
      `.model ${n}divm d_fdiv(div_factor=${cyc} high_cycles=${hi} i_count=1 rise_delay=1e-12 fall_delay=1e-12)`,
      `A_${n}dac [${n}fq_d] [${n}x] ${n}dacm`,
    );
    anchor([i1]);
    adc();
    dac();
  } else if (FLOPS.has(model)) {
    const dff = model === 'dflop';
    const set = dff ? i4 : i1, rst = dff ? i5 : i2;
    const on = (x: string) => (x === '0' ? '0' : bit(x));
    let sig: [string, string][];
    if (model === 'schmitt') {
      const vt = p.has('vt') ? num('vt', '') : ref;
      const vhy = p.has('vh') ? num('vh', '') : `0.05*abs(${vt})`;
      const cmp = (e: string) => `min(max((${e})*1e4+0.5,0),1)`;
      // diferencial (diffschmitt…): in- = in2
      const vin = i2 === '0' ? `V(${i1})` : `V(${i1},${i2})`;
      sig = [['fs', cmp(`${vin}-${vt}-${vhy}`)], ['fr', cmp(`${vt}-${vhy}-${vin}`)]];
    } else {
      // CLR/R tiene prioridad: el set efectivo es set·¬reset
      sig = [
        ['fs', `${on(set)}*${not(on(rst))}`],
        ['fr', on(rst)],
        ...(dff ? ([['fd', on(i1)], ['fc', on(i3)]] as [string, string][]) : []),
      ];
    }
    sig.forEach(([k, e]) => lines.push(`B_${n}${k} ${n}${k} 0 V=${e}`));
    anchor(dff ? [i1, i3, set, rst] : model === 'schmitt' ? [i1, i2] : [set, rst]);
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
