// Transferencias de Laplace de LTspice en fuentes E, G y B ("E1 o 0 i 0 Laplace=1/(1+s/w0)",
// "B1 o 0 V=V(a)-V(b) Laplace=…") → equivalente de ngspice:
//  - la expresión en s se lleva a cociente de polinomios N(s)/D(s), con los coeficientes como
//    expresiones de numparam (los parámetros quedan entre llaves y se resuelven en ngspice, así
//    también andan .step y los parámetros de subcircuito);
//  - N/D = Q(s) + R(s)/D(s): la parte propia R/D es un code model XSPICE s_xfer (que no acepta
//    numerador de mayor grado) y cada s^k de Q(s) una cadena de derivadores (C de 1 F cuya corriente
//    se mide con una V de 0 V y vuelve a tensión con una H);
//  - la salida es el elemento original (mismo nombre, para que I(E1) siga andando) controlado por
//    la tensión resultante.
// Lo que no es racional en s (exp(-s*T), sqrt(s), abs(s), potencias no enteras) no tiene
// traducción: se avisa y la línea queda como está.
import { parseSpiceNumber } from './spicenum.ts';
import { t } from '../i18n/i18n.ts';

type Coef = number | string;
type Poly = Coef[]; // coeficientes en potencias ascendentes de s
interface Rat {
  n: Poly;
  d: Poly;
}

const isNum = (c: Coef): c is number => typeof c === 'number';
const txt = (c: Coef) => (isNum(c) ? String(c) : c);
const wrap = (c: Coef) => (isNum(c) ? (c < 0 ? `(${c})` : String(c)) : `(${c})`);

function mulC(a: Coef, b: Coef): Coef {
  if (isNum(a) && isNum(b)) return a * b;
  if (a === 0 || b === 0) return 0;
  if (a === 1) return b;
  if (b === 1) return a;
  return `${wrap(a)}*${wrap(b)}`;
}
function addC(a: Coef, b: Coef): Coef {
  if (isNum(a) && isNum(b)) return a + b;
  if (a === 0) return b;
  if (b === 0) return a;
  return `${txt(a)}+${wrap(b)}`;
}
const negC = (a: Coef): Coef => (isNum(a) ? -a : `-${wrap(a)}`);
function divC(a: Coef, b: Coef): Coef {
  if (isNum(a) && isNum(b)) return a / b;
  if (a === 0) return 0;
  if (b === 1) return a;
  return `${wrap(a)}/${wrap(b)}`;
}

function trim(p: Poly): Poly {
  const r = [...p];
  while (r.length > 1 && r[r.length - 1] === 0) r.pop();
  return r.length ? r : [0];
}
function addP(a: Poly, b: Poly): Poly {
  const r: Poly = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) r.push(addC(a[i] ?? 0, b[i] ?? 0));
  return trim(r);
}
function mulP(a: Poly, b: Poly): Poly {
  const r: Poly = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] = addC(r[i + j], mulC(a[i], b[j]));
  return trim(r);
}
const scaleP = (a: Poly, c: Coef) => trim(a.map((x) => mulC(x, c)));
const sameP = (a: Poly, b: Poly) => a.length === b.length && a.every((x, i) => x === b[i]);

const constR = (c: Coef): Rat => ({ n: [c], d: [1] });
// denominador constante: pasa al numerador (s/w0 → [0, 1/w0] / 1), así los grados no crecen de más
const norm = (a: Rat): Rat => (a.d.length === 1 && a.d[0] !== 1 ? { n: trim(a.n.map((x) => divC(x, a.d[0]))), d: [1] } : a);
function addR(a: Rat, b: Rat): Rat {
  if (sameP(a.d, b.d)) return { n: addP(a.n, b.n), d: a.d };
  return norm({ n: addP(mulP(a.n, b.d), mulP(b.n, a.d)), d: mulP(a.d, b.d) });
}
const negR = (a: Rat): Rat => ({ n: scaleP(a.n, -1), d: a.d });
const mulR = (a: Rat, b: Rat): Rat => norm({ n: mulP(a.n, b.n), d: mulP(a.d, b.d) });
const invR = (a: Rat): Rat => norm({ n: a.d, d: a.n });
/** constante (sin s): su texto, para usarla como coeficiente o como exponente */
const constOf = (a: Rat): Coef | null => (a.n.length === 1 && a.d.length === 1 ? divC(a.n[0], a.d[0]) : null);

class Unsupported extends Error {}

// ---- parser de la expresión en s ----
type Tok = { t: 'num'; v: number; s: string } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?[a-z]*/i.exec(src.slice(i));
    if (num) {
      const v = parseSpiceNumber(num[0]);
      if (!Number.isFinite(v)) throw new Unsupported(t('number "{p0}"', { p0: num[0] }));
      out.push({ t: 'num', v, s: num[0] });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_]\w*/.exec(src.slice(i));
    if (id) {
      out.push({ t: 'id', v: id[0] });
      i += id[0].length;
      continue;
    }
    if (src.startsWith('**', i)) {
      out.push({ t: 'op', v: '^' });
      i += 2;
      continue;
    }
    if ('+-*/^(){},'.includes(c)) {
      out.push({ t: 'op', v: c === '{' ? '(' : c === '}' ? ')' : c });
      i++;
      continue;
    }
    throw new Unsupported(t('character "{c}"', { c }));
  }
  return out;
}

function parseRational(src: string): Rat {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === 'op' && peek().v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new Unsupported(t('expected "{v}"', { v }));
    p++;
  };
  // texto de una subexpresión constante, tal cual (para funciones de constantes como sqrt(2*pi))
  const textBetween = (a: number, b: number) => toks.slice(a, b).map((tt) => (tt.t === 'num' ? tt.s : tt.v)).join('');

  function sum(): Rat {
    let r = term();
    while (isOp('+') || isOp('-')) {
      const op = toks[p++].v;
      const b = term();
      r = addR(r, op === '+' ? b : negR(b));
    }
    return r;
  }
  function term(): Rat {
    let r = unary();
    while (isOp('*') || isOp('/')) {
      const op = toks[p++].v;
      const b = unary();
      r = op === '*' ? mulR(r, b) : mulR(r, invR(b));
    }
    return r;
  }
  function unary(): Rat {
    if (isOp('-')) {
      p++;
      return negR(unary());
    }
    if (isOp('+')) {
      p++;
      return unary();
    }
    return power();
  }
  function power(): Rat {
    const base = atom();
    if (!isOp('^')) return base;
    p++;
    const e = unary();
    const k = constOf(e);
    if (k === null) throw new Unsupported(t('exponent with s'));
    const c = constOf(base);
    if (c !== null) return constR(isNum(c) && isNum(k) ? c ** k : `${wrap(c)}**${wrap(k)}`);
    if (!isNum(k) || !Number.isInteger(k)) throw new Unsupported(t('non-integer power of s'));
    let r = constR(1);
    for (let i = 0; i < Math.abs(k); i++) r = mulR(r, base);
    return k < 0 ? invR(r) : r;
  }
  function atom(): Rat {
    const tt = peek();
    if (!tt) throw new Unsupported(t('incomplete expression'));
    if (tt.t === 'num') {
      p++;
      return constR(tt.v);
    }
    if (tt.t === 'op' && tt.v === '(') {
      p++;
      const r = sum();
      expect(')');
      return r;
    }
    if (tt.t === 'id') {
      p++;
      if (tt.v.toLowerCase() === 's') return { n: [0, 1], d: [1] };
      if (!isOp('(')) return constR(tt.v);
      // función: sólo de constantes (sqrt(2*pi)); de s no es racional
      const start = p;
      p++;
      let depth = 1;
      while (p < toks.length && depth) {
        const u = toks[p++];
        if (u.t === 'op' && u.v === '(') depth++;
        if (u.t === 'op' && u.v === ')') depth--;
        if (u.t === 'id' && u.v.toLowerCase() === 's') throw new Unsupported(t('{v}() of s', { v: tt.v }));
      }
      if (depth) throw new Unsupported(t('unclosed parenthesis'));
      const args = textBetween(start, p);
      if (/^\(\s*-\s*1\s*\)$/.test(args) && tt.v.toLowerCase() === 'sqrt') throw new Unsupported('sqrt(-1)');
      return constR(`${tt.v}${args}`);
    }
    throw new Unsupported(t('unexpected "{v}"', { v: tt.v }));
  }

  const r = sum();
  if (p < toks.length) throw new Unsupported(t('unexpected "{v}"', { v: String((toks[p] as { v: unknown }).v) }));
  // factores s comunes (KVCO/s*s): se cancelan
  let n = trim(r.n);
  let d = trim(r.d);
  while (n.length > 1 && d.length > 1 && n[0] === 0 && d[0] === 0) {
    n = n.slice(1);
    d = d.slice(1);
  }
  if (d.length === 1 && d[0] === 0) throw new Unsupported('denominador nulo');
  return { n, d };
}

/** N/D → cociente polinomial Q y resto R (R/D propia) */
function divide(n: Poly, d: Poly): { q: Poly; r: Poly } {
  const r = [...n];
  const m = d.length - 1;
  const q: Poly = new Array(Math.max(1, n.length - m)).fill(0);
  for (let k = n.length - 1; k >= m; k--) {
    const c = divC(r[k], d[m]);
    q[k - m] = c;
    for (let j = 0; j <= m; j++) r[k - m + j] = addC(r[k - m + j], negC(mulC(c, d[j])));
    r[k] = 0;
  }
  return { q: trim(q), r: trim(r.slice(0, Math.max(1, m))) };
}

// coeficiente como valor de ngspice: número o expresión entre llaves
const val = (c: Coef) => (isNum(c) ? String(c) : `{${c}}`);

/**
 * Con coeficientes numéricos de órdenes de magnitud muy distintos (1/(1+1e-7*s)**6 da 1e-42)
 * s_xfer no integra bien: se escala s = ωd·s' (denormalized_freq de s_xfer) con ωd la media
 * geométrica de los polos, y se normaliza por el mayor coeficiente del denominador.
 */
function scaled(n: Poly, d: Poly): string | null {
  if (![...n, ...d].every(isNum)) return null;
  const nz = d.map((c, i) => [c as number, i]).filter(([c]) => c !== 0);
  if (nz.length < 2) return null;
  const [lo, hi] = [nz[0], nz[nz.length - 1]];
  const wd = Math.abs(lo[0] / hi[0]) ** (1 / (hi[1] - lo[1]));
  if (!Number.isFinite(wd) || wd <= 0 || (wd > 1e-3 && wd < 1e3)) return null;
  const sc = (p: Poly) => p.map((c, k) => (c as number) * wd ** k);
  const ds = sc(d);
  const m = Math.max(...ds.map(Math.abs));
  const fmt = (p: number[]) => p.map((c) => String(c / m)).reverse().join(' ');
  return `num_coeff=[${fmt(sc(n))}] den_coeff=[${fmt(ds)}] denormalized_freq=${wd}`;
}

// ---- forma de la línea ----

/** "(a (b) c)" desde la posición del paréntesis que abre → índice después del que cierra */
function closing(s: string, i: number): number {
  const open = s[i];
  const close = open === '(' ? ')' : '}';
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === open) depth++;
    else if (s[j] === close && --depth === 0) return j + 1;
  }
  return -1;
}

interface LaplaceValue {
  /** expresión de entrada explícita ("V=V(a)-V(b)", "Laplace {V(in)} {…}"); undefined = nodos de control */
  input?: string;
  /** "V" o "I" en las fuentes B */
  kind?: 'V' | 'I';
  expr: string;
  /** ganancia escrita antes ("E1 o 0 i 0 1 Laplace=…", Value y Value2 del símbolo) */
  gain?: string;
}

export function splitLaplace(value: string): LaplaceValue | null {
  // parámetros de la transformada numérica de LTspice: sin sentido en s_xfer
  let v = value.replace(/\s+(mtol|window|nfft|cache)\s*=\s*\S+/gi, '').trim();
  const res: LaplaceValue = { expr: '' };
  const io = /^([VI])\s*=\s*/i.exec(v);
  const lap = /\blaplace\b\s*/i.exec(v);
  if (!lap) return null;
  if (io) {
    res.kind = io[1].toUpperCase() as 'V' | 'I';
    res.input = v.slice(io[0].length, lap.index).trim();
  } else if (lap.index !== 0) {
    const g = v.slice(0, lap.index).trim();
    if (/\s/.test(g)) return null;
    res.gain = g.replace(/^\{(.*)\}$/, '$1');
  }
  v = v.slice(lap.index + lap[0].length);
  // "Laplace {V(in)} = {H}" / "Laplace {V(in)} {H}": la entrada va entre llaves antes de H
  if (!io && v.startsWith('{')) {
    const e = closing(v, 0);
    const rest = e > 0 ? v.slice(e).trim() : '';
    if (e > 0 && rest !== '') {
      res.input = v.slice(1, e - 1).trim();
      v = rest;
    }
  }
  if (v.startsWith('=')) v = v.slice(1).trim();
  else if (v.startsWith('(')) {
    const e = closing(v, 0);
    if (e > 0 && v.slice(e).trim() === '') v = v.slice(1, e - 1);
  }
  res.expr = v.trim();
  if (res.input?.startsWith('{') && closing(res.input, 0) === res.input.length) res.input = res.input.slice(1, -1).trim();
  return res.expr ? res : null;
}

/**
 * Traduce una E, G o B con Laplace. null si la línea no tiene Laplace; si la transferencia no se
 * puede traducir, también null y un aviso.
 */
export function translateLaplace(name: string, letter: string, nodes: string[], value: string, warnings: string[]): string[] | null {
  if (!/laplace/i.test(value) || !'EGB'.includes(letter)) return null;
  const lv = splitLaplace(value);
  if (!lv || (letter === 'B' && !lv.input) || (letter !== 'B' && !lv.input && nodes.length < 4)) {
    warnings.push(t('{name}: the "Laplace" form in "{value}" isn\'t recognized', { name, value }));
    return null;
  }
  let rat: Rat;
  try {
    rat = parseRational(lv.gain ? `(${lv.gain})*(${lv.expr})` : lv.expr);
  } catch (e) {
    if (!(e instanceof Unsupported)) throw e;
    warnings.push(t('{name}: the transfer Laplace={expr} isn\'t a ratio of polynomials in s ({message}); ngspice can\'t simulate it', { name, expr: lv.expr, message: e.message }));
    return null;
  }
  const [op, on, ip, inn] = nodes;
  const out = (y: string) =>
    letter === 'B' ? `${name} ${op} ${on} ${lv.kind}=V(${y})` : `${name} ${op} ${on} ${y} 0 1`;
  const lines: string[] = [];
  const nin = `${name}__in`;
  // con numerador de grado ≤ al denominador s_xfer lo toma directo
  const { q, r } = rat.n.length <= rat.d.length ? { q: [0] as Poly, r: rat.n } : divide(rat.n, rat.d);
  const proper = !(r.length === 1 && r[0] === 0);
  // ganancia constante en una E/G: el elemento solo
  if (rat.n.length === 1 && rat.d.length === 1 && !lv.input) return [`${name} ${op} ${on} ${ip} ${inn} ${val(divC(rat.n[0], rat.d[0]))}`];
  lines.push(lv.input ? `B__${name}_in ${nin} 0 V=${lv.input}` : `E__${name}_in ${nin} 0 ${ip} ${inn} 1`);
  const terms: string[] = [];
  if (proper) {
    const nr = `${name}__r`;
    // s_xfer: coeficientes en potencias descendentes
    // s_xfer: coeficientes en potencias descendentes
    const coeffs = (p: Poly) => [...p].reverse().map(val).join(' ');
    lines.push(`A__${name} ${nin} ${nr} ${name}__lap`);
    lines.push(`.model ${name}__lap s_xfer(${scaled(r, rat.d) ?? `num_coeff=[${coeffs(r)}] den_coeff=[${coeffs(rat.d)}]`})`);
    terms.push(`V(${nr})`);
  }
  let prev = nin;
  q.forEach((c, k) => {
    if (k > 0) {
      const dk = `${name}__d${k}`;
      lines.push(`V__${name}_d${k} ${dk}c 0 0`, `C__${name}_d${k} ${prev} ${dk}c 1`, `H__${name}_d${k} ${dk} 0 V__${name}_d${k} 1`);
      prev = dk;
    }
    if (c !== 0) terms.push(c === 1 ? `V(${prev})` : `${isNum(c) ? wrap(c) : `{${c}}`}*V(${prev})`);
  });
  if (terms.length === 1 && proper) lines.push(out(`${name}__r`));
  else {
    lines.push(`B__${name}_y ${name}__y 0 V=${terms.join('+') || '0'}`);
    lines.push(out(`${name}__y`));
  }
  return lines;
}

/** Lo mismo en las líneas de un archivo de modelos o de un .subckt escrito como directiva */
export function replaceLaplaceLines(text: string, warnings: string[]): string {
  if (!/laplace/i.test(text)) return text;
  return text.replace(/^[ \t]*([EGB]\S*)[ \t]+([^\r\n]*laplace[^\r\n]*)$/gim, (line: string, name: string, rest: string) => {
    const toks = rest.trim().split(/\s+/);
    const n = name[0].toUpperCase() === 'B' ? 2 : 4;
    const lines = translateLaplace(name, name[0].toUpperCase(), toks.slice(0, n), toks.slice(n).join(' '), warnings);
    return lines ? lines.join('\n') : line;
  });
}
