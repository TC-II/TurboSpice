// Fuentes independientes (V, I): leer y escribir su valor con la sintaxis de LTspice, para la
// ventana de configuración. LTspice reparte el valor en tres atributos:
//   Value      forma de onda o valor DC          "SINE(0 1 1k)", "5", "PULSE(…)"
//   Value2     pequeña señal                     "AC 1 45"
//   SpiceLine  parásitos (fuente de tensión)     "Rser=1 Cpar=1n"   ("load" en las de corriente)
// Al leer se juntan los tres (también se acepta "… AC 1" dentro de Value, como en archivos viejos);
// lo que no se reconoce devuelve null y la ventana lo muestra como texto, sin perderlo.
import { fromRkm, parseSpiceNumber } from '../netlist/spicenum.ts';

export type SourceKind = 'sine' | 'ac' | 'pulse' | 'dc' | 'exp' | 'sffm' | 'pwl';

export interface SourceSpec {
  kind: SourceKind;
  /** parámetros de la función en el orden de SPICE (sine, pulse, exp, sffm), como texto */
  args: string[];
  /** valor DC: el de la fuente si kind es 'dc'; si no, el de .op/.dc (opcional) */
  dc: string;
  /** puntos (tiempo, valor) de PWL */
  points: [string, string][];
  /** PWL REPEAT FOREVER (…) ENDREPEAT */
  repeat: boolean;
  acMag: string;
  acPhase: string;
  /** Rser, Cpar y otros key=valor o banderas ("load"), en orden */
  params: [string, string | null][];
}

/** Nombres de los parámetros de cada función, en el orden de SPICE */
export const ARG_NAMES: Record<'sine' | 'pulse' | 'exp' | 'sffm', string[]> = {
  sine: ['Voffset', 'Vamp', 'Freq', 'Td', 'Theta', 'Phi', 'Ncycles'],
  pulse: ['V1', 'V2', 'Tdelay', 'Trise', 'Tfall', 'Ton', 'Tperiod', 'Ncycles'],
  exp: ['V1', 'V2', 'Td1', 'Tau1', 'Td2', 'Tau2'],
  sffm: ['Voff', 'Vamp', 'Fcar', 'MDI', 'Fsig'],
};

const FUNC: Record<string, SourceKind> = { sine: 'sine', sin: 'sine', pulse: 'pulse', exp: 'exp', sffm: 'sffm', pwl: 'pwl' };

export const emptySource = (kind: SourceKind = 'dc'): SourceSpec => ({ kind, args: [], dc: '', points: [], repeat: false, acMag: '', acPhase: '', params: [] });

/** Tokens respetando paréntesis y llaves: "SINE(0 1 1k)" y "{a*2}" son uno solo */
function tokenize(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let depth = 0;
  for (const ch of s) {
    if (ch === '(' || ch === '{') depth++;
    if (ch === ')' || ch === '}') depth = Math.max(0, depth - 1);
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  // "SINE (0 1 1k)": el nombre y los paréntesis separados
  return out.reduce<string[]>((acc, t) => {
    const prev = acc[acc.length - 1];
    if (t.startsWith('(') && prev && /^[a-z]+$/i.test(prev) && FUNC[prev.toLowerCase()]) acc[acc.length - 1] = prev + t;
    else acc.push(t);
    return acc;
  }, []);
}

const splitArgs = (inner: string) => tokenize(inner.replace(/,/g, ' '));
const isKeyword = (t: string) => /^(ac|dc)$/i.test(t) || /=/.test(t) || /^[a-z]+\(/i.test(t);

/** Lee el valor de una fuente; null si tiene algo que la ventana no sabe editar */
export function parseSource(attrs: { Value?: string; Value2?: string; SpiceLine?: string }): SourceSpec | null {
  const clean = (v?: string) => (v === undefined || v.trim() === '""' ? '' : v.trim());
  const text = [clean(attrs.Value), clean(attrs.Value2), clean(attrs.SpiceLine)].filter(Boolean).join(' ');
  const spec = emptySource();
  let func: SourceKind | null = null;
  let sawDc = false;
  let sawAc = false;
  const t = tokenize(text);
  for (let i = 0; i < t.length; i++) {
    const tok = t[i];
    const low = tok.toLowerCase();
    if (low === 'dc') {
      if (i + 1 >= t.length || sawDc) return null;
      spec.dc = t[++i];
      sawDc = true;
    } else if (low === 'ac') {
      if (i + 1 >= t.length || sawAc) return null;
      spec.acMag = t[++i];
      if (i + 1 < t.length && !isKeyword(t[i + 1])) spec.acPhase = t[++i];
      sawAc = true;
    } else if (/^(rser|cpar)=/i.test(tok)) {
      // los únicos que la ventana edita; otros (wavefile=, chan=…) quedan para el modo texto
      const [k, ...v] = tok.split('=');
      spec.params.push([k, v.join('=')]);
    } else if (/^[a-z]+\(.*\)$/is.test(tok) && FUNC[tok.slice(0, tok.indexOf('(')).toLowerCase()]) {
      if (func) return null;
      func = FUNC[tok.slice(0, tok.indexOf('(')).toLowerCase()];
      const inner = tok.slice(tok.indexOf('(') + 1, -1);
      if (func === 'pwl') {
        const p = pwlPoints(splitArgs(inner));
        if (!p) return null;
        spec.points = p;
      } else spec.args = splitArgs(inner);
    } else if (low === 'pwl') {
      if (func) return null;
      func = 'pwl';
      // "PWL REPEAT FOREVER (t v …) ENDREPEAT" o "PWL t v t v …"
      if (t[i + 1]?.toLowerCase() === 'repeat' && t[i + 2]?.toLowerCase() === 'forever' && /^\(.*\)$/s.test(t[i + 3] ?? '') && t[i + 4]?.toLowerCase() === 'endrepeat') {
        const p = pwlPoints(splitArgs(t[i + 3].slice(1, -1)));
        if (!p) return null;
        spec.points = p;
        spec.repeat = true;
        i += 4;
      } else {
        const nums: string[] = [];
        while (i + 1 < t.length && !isKeyword(t[i + 1]) && !/^[a-z]+$/i.test(t[i + 1])) nums.push(t[++i]);
        const p = pwlPoints(nums);
        if (!p) return null;
        spec.points = p;
      }
    } else if (/^load$/i.test(tok)) {
      // bandera de las fuentes de corriente de LTspice
      spec.params.push([tok, null]);
    } else if (!sawDc && !func && !sawAc && looksLikeValue(tok)) {
      // valor suelto antes de la forma de onda: el DC (como "5" o "{Vcc}")
      spec.dc = tok;
      sawDc = true;
    } else return null;
  }
  spec.kind = func ?? (sawDc || !sawAc ? 'dc' : 'ac');
  return spec;
}

/** número con sufijo, expresión {…} o parámetro: lo que SPICE acepta como valor */
const looksLikeValue = (t: string) => /^[-+]?(\d|\.\d)/.test(t) || /^\{.*\}$/s.test(t);

function pwlPoints(nums: string[]): [string, string][] | null {
  if (nums.length % 2) return null;
  if (nums.some((n) => !looksLikeValue(n))) return null;
  const out: [string, string][] = [];
  for (let i = 0; i < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

/** Saca los parámetros vacíos del final y completa con 0 los vacíos del medio */
function argList(args: string[]): string {
  // Array.from recorre también los huecos (args puede venir disperso o con undefined desde la
  // ventana): con .map se saltaban y el join dejaba "", corriendo los parámetros posicionales
  const a = Array.from(args, (x) => (x ?? '').trim());
  while (a.length && !a[a.length - 1]) a.pop();
  return a.map((x) => x || '0').join(' ');
}

/** Atributos a escribir (null = se borra), con la sintaxis de LTspice */
export function writeSource(spec: SourceSpec): { Value: string; Value2: string | null; SpiceLine: string | null } {
  const ac = spec.acMag.trim() ? `AC ${spec.acMag.trim()}${spec.acPhase.trim() ? ` ${spec.acPhase.trim()}` : ''}` : '';
  let wave = '';
  switch (spec.kind) {
    case 'dc':
      wave = spec.dc.trim();
      break;
    case 'ac':
      wave = `AC ${spec.acMag.trim() || '1'}${spec.acPhase.trim() ? ` ${spec.acPhase.trim()}` : ''}`;
      break;
    case 'pwl': {
      const pts = spec.points.filter(([a, b]) => a.trim() && b.trim()).map(([a, b]) => `${a.trim()} ${b.trim()}`).join(' ');
      wave = spec.repeat ? `PWL REPEAT FOREVER (${pts}) ENDREPEAT` : `PWL(${pts})`;
      break;
    }
    default:
      wave = `${spec.kind.toUpperCase()}(${argList(spec.args)})`;
  }
  if (spec.kind !== 'dc' && spec.kind !== 'ac' && spec.dc.trim()) wave = `DC ${spec.dc.trim()} ${wave}`;
  const line = spec.params
    .filter(([, v]) => v === null || v.trim() !== '')
    .map(([k, v]) => (v === null ? k : `${k}=${v.trim()}`))
    .join(' ');
  return { Value: wave, Value2: spec.kind !== 'ac' && ac ? ac : null, SpiceLine: line || null };
}

// ---------------------------------------------------------------------------------------------
// Números con sufijo de SPICE (para la vista previa y los campos vinculados)

/** "4k7" → 4700, "10u" → 1e-5, "1Meg" → 1e6; NaN si no es un número (p. ej. una expresión) */
export function spiceNumber(s: string): number {
  const t = (s ?? '').trim().replace(/[µμ]/g, 'u');
  return parseSpiceNumber(fromRkm(t) ?? t);
}

/** 0.0047 → "4.7m"; 3 cifras significativas (o `digits`, si hace falta más precisión) */
export function engNumber(x: number, digits = 3): string {
  if (!isFinite(x)) return '';
  if (Math.abs(x) < 1e-18) return '0';
  const steps: [number, string][] = [[1e-15, 'f'], [1e-12, 'p'], [1e-9, 'n'], [1e-6, 'u'], [1e-3, 'm'], [1, ''], [1e3, 'k'], [1e6, 'Meg'], [1e9, 'G']];
  let s = steps[0];
  for (const q of steps) if (Math.abs(x) >= q[0] * 0.9995) s = q;
  return `${Number((x / s[0]).toPrecision(digits))}${s[1]}`;
}

/** "1M" en una fuente es casi siempre un error: en SPICE es mili, no mega */
export const looksLikeMegaTypo = (s: string) => /^\s*[\d.]+M\s*$/.test(s);

// ---------------------------------------------------------------------------------------------
// Pulso: Ton, período (o frecuencia) y ciclo útil están vinculados. El ciclo útil se mide a mitad
// de las rampas: (Trise/2 + Ton + Tfall/2) / Período. Los dos últimos que se escribieron quedan
// fijos y el tercero se calcula.

export type PulseLinked = 'ton' | 'per' | 'duty';

/** Qué dos valores quedan fijos al editar cada campo del pulso; el tercero se recalcula.
 *  Frecuencia y DC mantienen el DC (se ajusta Ton); Ton y período mantienen Ton (se ajusta el DC). */
export function pulseFixedAfter(edited: 'ton' | 'per' | 'frq' | 'duty'): [PulseLinked, PulseLinked] {
  return edited === 'frq' || edited === 'duty' ? ['duty', 'per'] : ['ton', 'per'];
}

export function pulseDuty(ton: number, per: number, tr: number, tf: number): number {
  return (tr / 2 + ton + tf / 2) / per;
}

/** Recalcula el que no está entre los dos fijos; devuelve los tres (período en segundos) */
export function solvePulse(
  fixed: [PulseLinked, PulseLinked],
  v: { ton: number; per: number; duty: number; tr: number; tf: number },
): { ton: number; per: number; duty: number } {
  const ramps = (v.tr + v.tf) / 2;
  const has = (k: PulseLinked) => fixed.includes(k);
  if (has('per') && has('duty')) return { ton: v.duty * v.per - ramps, per: v.per, duty: v.duty };
  if (has('ton') && has('duty')) return { ton: v.ton, per: (v.ton + ramps) / v.duty, duty: v.duty };
  return { ton: v.ton, per: v.per, duty: (v.ton + ramps) / v.per };
}

// ---------------------------------------------------------------------------------------------
// Valor de la forma de onda en el tiempo (vista previa, en JS)

export function waveAt(spec: SourceSpec, t: number): number {
  const a = Array.from(spec.args, (s) => spiceNumber(s ?? '')).map((x) => (isFinite(x) ? x : 0));
  switch (spec.kind) {
    case 'dc': {
      const v = spiceNumber(spec.dc);
      return isFinite(v) ? v : 0;
    }
    case 'ac':
      return 0;
    case 'sine': {
      const [vo, va, f, td, th, phi] = a;
      const ph = ((phi ?? 0) * Math.PI) / 180;
      if (t < (td ?? 0)) return vo + va * Math.sin(ph);
      const x = t - (td ?? 0);
      return vo + va * Math.exp(-(th ?? 0) * x) * Math.sin(2 * Math.PI * (f ?? 0) * x + ph);
    }
    case 'pulse': {
      const [v1, v2, td, tr, tf, ton, per, n] = a;
      let x = t - (td ?? 0);
      if (x < 0) return v1;
      if (per > 0) {
        if (n > 0 && x >= n * per) return v1;
        x %= per;
      }
      if (x < tr) return v1 + ((v2 - v1) * x) / (tr || 1);
      x -= tr;
      if (x < ton) return v2;
      x -= ton;
      if (x < tf) return v2 + ((v1 - v2) * x) / (tf || 1);
      return v1;
    }
    case 'exp': {
      const [v1, v2, td1, tau1, td2, tau2] = a;
      let y = v1;
      if (t > td1) y += (v2 - v1) * (1 - Math.exp(-(t - td1) / (tau1 || 1e-30)));
      if (t > td2) y += (v1 - v2) * (1 - Math.exp(-(t - td2) / (tau2 || 1e-30)));
      return y;
    }
    case 'sffm': {
      const [vo, va, fc, mdi, fs] = a;
      return vo + va * Math.sin(2 * Math.PI * fc * t + mdi * Math.sin(2 * Math.PI * fs * t));
    }
    case 'pwl': {
      const p = spec.points.map(([x, y]) => [spiceNumber(x), spiceNumber(y)]).filter(([x, y]) => isFinite(x) && isFinite(y));
      if (!p.length) return 0;
      if (t <= p[0][0]) return p[0][1];
      for (let i = 1; i < p.length; i++) {
        if (t <= p[i][0]) return p[i - 1][1] + ((p[i][1] - p[i - 1][1]) * (t - p[i - 1][0])) / (p[i][0] - p[i - 1][0] || 1);
      }
      return p[p.length - 1][1];
    }
  }
}
