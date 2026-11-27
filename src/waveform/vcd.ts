// Archivos VCD ($dumpvars de un testbench de Verilog) → señales digitales como las de los nodos de
// XSPICE (digital.ts): los instantes de cada cambio y el valor desde ahí; 0/1 o el número de un bus,
// X = 0,5 y Z = NaN (un bus es Z si todos sus bits lo son, y X si alguno es X o hay Z mezclados).
import { LOGIC_X, LOGIC_Z } from './digital.ts';

export interface VcdSignal {
  /** módulo (instancia) donde está: ["contador_tb", "dut"] */
  scope: string[];
  /** nombre de la señal ("q") */
  name: string;
  bits: number;
  /** instantes de cada cambio, en segundos */
  x: Float64Array;
  /** valor desde cada instante */
  y: Float64Array;
}

export interface Vcd {
  signals: VcdSignal[];
  /** el último instante del archivo, en segundos */
  end: number;
}

const UNITS: Record<string, number> = { s: 1, ms: 1e-3, us: 1e-6, ns: 1e-9, ps: 1e-12, fs: 1e-15 };

/** Valor de un bus ("b10x1" sin la b), extendido a `bits` como dice el formato */
export function vcdValue(v: string, bits: number): number {
  const s = v.toLowerCase();
  if (s.length < bits) {
    // (a la izquierda: 0, salvo que el primero sea x o z, que se repite)
    const pad = s[0] === 'x' || s[0] === 'z' ? s[0] : '0';
    return vcdValue(pad.repeat(bits - s.length) + s, bits);
  }
  if (/^z+$/.test(s)) return LOGIC_Z;
  if (/[xz]/.test(s)) return LOGIC_X;
  return s.length > 52 ? Number(BigInt(`0b${s}`)) : parseInt(s, 2);
}

/** Lee un VCD; las variables real (y los event) no se leen */
export function parseVcd(text: string): Vcd {
  const tokens = text.split(/\s+/);
  const scope: string[] = [];
  const vars = new Map<string, { bits: number; x: number[]; y: number[]; signals: VcdSignal[] }>();
  const signals: VcdSignal[] = [];
  let unit = 1e-9;
  let time = 0;
  let k = 0;
  const skipToEnd = () => {
    while (k < tokens.length && tokens[k] !== '$end') k++;
  };
  const set = (id: string, v: number) => {
    const d = vars.get(id);
    if (!d) return;
    const last = d.y.length - 1;
    if (last >= 0 && d.x[last] === time) d.y[last] = v;
    else if (last < 0 || !(d.y[last] === v || (Number.isNaN(v) && Number.isNaN(d.y[last])))) d.x.push(time), d.y.push(v);
  };
  for (; k < tokens.length; k++) {
    const tok = tokens[k];
    if (!tok) continue;
    switch (tok) {
      case '$timescale': {
        const m = /^(\d+)\s*([munpf]?s)$/.exec(`${tokens[k + 1]}${tokens[k + 2] === '$end' ? '' : tokens[k + 2]}`);
        if (m) unit = Number(m[1]) * UNITS[m[2]];
        skipToEnd();
        break;
      }
      case '$scope':
        scope.push(tokens[k + 2]);
        skipToEnd();
        break;
      case '$upscope':
        scope.pop();
        skipToEnd();
        break;
      case '$var': {
        const [type, size, id, name] = tokens.slice(k + 1, k + 5);
        skipToEnd();
        if (type === 'real' || type === 'event') break;
        const sig: VcdSignal = { scope: [...scope], name, bits: Number(size), x: new Float64Array(), y: new Float64Array() };
        signals.push(sig);
        const d = vars.get(id) ?? vars.set(id, { bits: sig.bits, x: [], y: [], signals: [] }).get(id)!;
        d.signals.push(sig);
        break;
      }
      case '$comment':
      case '$date':
      case '$version':
        skipToEnd();
        break;
      default: {
        const c = tok[0];
        if (c === '#') time = Number(tok.slice(1));
        else if (c === 'b' || c === 'B') set(tokens[++k], vcdValue(tok.slice(1), vars.get(tokens[k])?.bits ?? tok.length - 1));
        else if (c === 'r' || c === 'R') k++;
        else if ('01xzXZ'.includes(c)) set(tok.slice(1), vcdValue(c, 1));
      }
    }
  }
  for (const d of vars.values()) {
    const x = Float64Array.from(d.x, (t) => t * unit);
    const y = Float64Array.from(d.y);
    for (const s of d.signals) (s.x = x), (s.y = y);
  }
  return { signals, end: time * unit };
}
