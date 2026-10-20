// Expresiones de trazas al estilo LTspice: V(out), V(a,b), I(R1), Ic(Q1), V(out)/V(in),
// db(V(out)), d(V(c)), 2*I(L1)… Se evalúan punto a punto sobre vectores reales o complejos.
// Con .step, V(out)@2 es el vector de la segunda corrida (como en LTspice).

export interface Wave {
  re: Float64Array;
  /** sólo si es complejo (AC, ruido, S) */
  im?: Float64Array;
}

/**
 * Busca el vector de una referencia: V(a), V(a,b) ya resuelto como resta, I(x), Ic(x)…
 * `run`: número de corrida de .step (1, 2…) pedido con "@"; sin él, la que se grafica.
 */
export type Resolver = (fn: string, args: string[], run?: number) => Wave | null;

type Node =
  | { t: 'num'; v: number }
  | { t: 'ref'; fn: string; args: string[]; run?: number }
  | { t: 'var'; name: string; run?: number }
  | { t: 'call'; fn: string; args: Node[] }
  | { t: 'un'; op: string; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node };

const SUFFIX: Record<string, number> = { t: 1e12, g: 1e9, meg: 1e6, k: 1e3, m: 1e-3, u: 1e-6, µ: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 };

/** Funciones que reciben nombres de nodos/elementos y no expresiones */
const isRefFn = (fn: string) => /^(v|i[bcdegsx]?)$/i.test(fn);

export const FUNCTIONS = [
  'db', 'mag', 'abs', 'ph', 'phase', 're', 'real', 'im', 'imag', 'sqrt', 'exp', 'ln', 'log', 'log10',
  'sin', 'cos', 'tan', 'atan', 'sgn', 'd', 'integ', 'min', 'max', 'pow',
];

export class ExprError extends Error {}

export function parseExpr(src: string): Node {
  let i = 0;
  const peek = () => src[i];
  const ws = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };
  const expect = (c: string) => {
    ws();
    if (src[i] !== c) throw new ExprError(`se esperaba "${c}" en la posición ${i + 1}`);
    i++;
  };

  function primary(): Node {
    ws();
    const c = peek();
    if (c === '(') {
      i++;
      const n = expr();
      expect(')');
      return n;
    }
    if (c === '-' || c === '+') {
      i++;
      return { t: 'un', op: c, a: power() };
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?(meg|[tgkmuµnpf])?[a-z]*/i.exec(src.slice(i));
    if (num) {
      i += num[0].length;
      return { t: 'num', v: parseFloat(num[1] + (num[2] ?? '')) * (num[3] ? SUFFIX[num[3].toLowerCase()] : 1) };
    }
    const id = /^[A-Za-z_][\w.#@:[\]§$]*/.exec(src.slice(i));
    if (!id) throw new ExprError(`expresión inválida en la posición ${i + 1}`);
    const name = id[0];
    i += name.length;
    ws();
    if (peek() !== '(') {
      // "out@2": el nodo out en la corrida 2
      const at = /^(.+)@(\d+)$/.exec(name);
      return at ? { t: 'var', name: at[1], run: Number(at[2]) } : { t: 'var', name };
    }
    i++;
    if (isRefFn(name)) {
      const close = src.indexOf(')', i);
      if (close < 0) throw new ExprError('falta ")"');
      const args = src
        .slice(i, close)
        .split(',')
        .map((a) => a.trim());
      i = close + 1;
      if (!args[0]) throw new ExprError(`${name}() necesita un argumento`);
      // "V(out)@2": en la corrida 2
      const at = /^\s*@(\d+)/.exec(src.slice(i));
      if (at) i += at[0].length;
      return at ? { t: 'ref', fn: name, args, run: Number(at[1]) } : { t: 'ref', fn: name, args };
    }
    const args: Node[] = [];
    ws();
    if (peek() !== ')') {
      args.push(expr());
      ws();
      while (peek() === ',') {
        i++;
        args.push(expr());
        ws();
      }
    }
    expect(')');
    if (!FUNCTIONS.includes(name.toLowerCase())) throw new ExprError(`función desconocida: ${name}`);
    return { t: 'call', fn: name.toLowerCase(), args };
  }
  function power(): Node {
    const a = primary();
    ws();
    if (src.startsWith('**', i) || peek() === '^') {
      i += peek() === '^' ? 1 : 2;
      return { t: 'bin', op: '^', a, b: power() };
    }
    return a;
  }
  function term(): Node {
    let a = power();
    for (;;) {
      ws();
      const c = peek();
      if ((c === '*' && src[i + 1] !== '*') || c === '/') {
        i++;
        a = { t: 'bin', op: c, a, b: power() };
      } else return a;
    }
  }
  function expr(): Node {
    let a = term();
    for (;;) {
      ws();
      const c = peek();
      if (c === '+' || c === '-') {
        i++;
        a = { t: 'bin', op: c, a, b: term() };
      } else return a;
    }
  }
  const n = expr();
  ws();
  if (i < src.length) throw new ExprError(`sobra "${src.slice(i)}"`);
  return n;
}

/** Referencias V()/I() que usa una expresión (para avisar si alguna no existe) */
export function references(n: Node): { fn: string; args: string[] }[] {
  switch (n.t) {
    case 'ref':
      return [{ fn: n.fn, args: n.args }];
    case 'call':
      return n.args.flatMap(references);
    case 'un':
      return references(n.a);
    case 'bin':
      return [...references(n.a), ...references(n.b)];
    default:
      return [];
  }
}

// --- evaluación sobre arreglos complejos ---------------------------------------------

type C = { re: Float64Array; im: Float64Array | null };

const fill = (len: number, v: number) => new Float64Array(len).fill(v);

function map1(a: C, f: (re: number, im: number) => [number, number], real = false): C {
  const len = a.re.length;
  const re = new Float64Array(len);
  const im = a.im && !real ? new Float64Array(len) : null;
  for (let k = 0; k < len; k++) {
    const [r, j] = f(a.re[k], a.im ? a.im[k] : 0);
    re[k] = r;
    if (im) im[k] = j;
  }
  return { re, im };
}

function map2(a: C, b: C, f: (ar: number, ai: number, br: number, bi: number) => [number, number]): C {
  const len = Math.max(a.re.length, b.re.length);
  const at = (x: Float64Array, k: number) => (x.length === 1 ? x[0] : x[k]);
  const complex = !!(a.im || b.im);
  const re = new Float64Array(len);
  const im = complex ? new Float64Array(len) : null;
  for (let k = 0; k < len; k++) {
    const [r, j] = f(at(a.re, k), a.im ? at(a.im, k) : 0, at(b.re, k), b.im ? at(b.im, k) : 0);
    re[k] = r;
    if (im) im[k] = j;
  }
  return { re, im };
}

const cmul = (ar: number, ai: number, br: number, bi: number): [number, number] => [ar * br - ai * bi, ar * bi + ai * br];
const cdiv = (ar: number, ai: number, br: number, bi: number): [number, number] => {
  const d = br * br + bi * bi;
  return [(ar * br + ai * bi) / d, (ai * br - ar * bi) / d];
};
const cpow = (ar: number, ai: number, br: number, bi: number): [number, number] => {
  if (!ai && !bi && (ar >= 0 || Number.isInteger(br))) return [ar ** br, 0];
  const r = Math.hypot(ar, ai);
  if (r === 0) return [0, 0];
  const th = Math.atan2(ai, ar);
  const lr = Math.log(r);
  const mr = Math.exp(br * lr - bi * th);
  const ang = bi * lr + br * th;
  return [mr * Math.cos(ang), mr * Math.sin(ang)];
};

/** Fase desenrollada en grados (como la muestra LTspice) */
export function unwrapDeg(re: Float64Array, im: Float64Array): Float64Array {
  const out = new Float64Array(re.length);
  let offset = 0;
  let prev = NaN;
  for (let k = 0; k < re.length; k++) {
    const p = (Math.atan2(im[k], re[k]) * 180) / Math.PI;
    if (Number.isFinite(prev)) {
      const d = p + offset - prev;
      if (d > 180) offset -= 360;
      else if (d < -180) offset += 360;
    }
    out[k] = p + offset;
    prev = out[k];
  }
  return out;
}

export interface EvalContext {
  resolve: Resolver;
  /** eje X (tiempo, frecuencia, barrido) */
  scale: Float64Array;
  /** nombre del eje X: se puede usar en la expresión (time, frequency) */
  scaleName: string;
  /** variables con valor (resultados de .meas, parámetros barridos); ganan a los nodos */
  vars?: Record<string, number>;
}

export function evaluate(n: Node, ctx: EvalContext): Wave {
  const r = ev(n, ctx);
  return r.im ? { re: r.re, im: r.im } : { re: r.re };
}

function ev(n: Node, ctx: EvalContext): C {
  const len = ctx.scale.length;
  switch (n.t) {
    case 'num':
      return { re: fill(1, n.v), im: null };
    case 'var': {
      const v = n.name.toLowerCase();
      if (v === ctx.scaleName.toLowerCase() || v === 'time' || v === 'frequency' || v === 'x') return { re: ctx.scale, im: null };
      if (ctx.vars && v in ctx.vars) return { re: fill(1, ctx.vars[v]), im: null };
      if (v === 'pi') return { re: fill(1, Math.PI), im: null };
      if (v === 'e') return { re: fill(1, Math.E), im: null };
      if (v === 'j') return { re: fill(1, 0), im: fill(1, 1) };
      // un nombre suelto es un nodo, como en LTspice ("out" = V(out))
      const w = ctx.resolve('V', [n.name], n.run);
      if (!w) throw new ExprError(`no existe ${n.name}${n.run ? `@${n.run}` : ''}`);
      return { re: w.re, im: w.im ?? null };
    }
    case 'ref': {
      const w = ctx.resolve(n.fn, n.args, n.run);
      if (!w) throw new ExprError(`no existe ${n.fn}(${n.args.join(',')})${n.run ? `@${n.run}` : ''}`);
      return { re: w.re, im: w.im ?? null };
    }
    case 'un': {
      const a = ev(n.a, ctx);
      return n.op === '-' ? map1(a, (r, j) => [-r, -j]) : a;
    }
    case 'bin': {
      const a = ev(n.a, ctx);
      const b = ev(n.b, ctx);
      switch (n.op) {
        case '+':
          return map2(a, b, (ar, ai, br, bi) => [ar + br, ai + bi]);
        case '-':
          return map2(a, b, (ar, ai, br, bi) => [ar - br, ai - bi]);
        case '*':
          return map2(a, b, cmul);
        case '/':
          return map2(a, b, cdiv);
        default:
          return map2(a, b, cpow);
      }
    }
    case 'call': {
      const args = n.args.map((x) => ev(x, ctx));
      const a = args[0];
      if (!a) throw new ExprError(`${n.fn}() necesita un argumento`);
      switch (n.fn) {
        case 'db':
          return map1(a, (r, j) => [20 * Math.log10(Math.hypot(r, j)), 0], true);
        case 'mag':
        case 'abs':
          return map1(a, (r, j) => [Math.hypot(r, j), 0], true);
        case 'ph':
        case 'phase':
          return a.im ? { re: unwrapDeg(a.re, a.im), im: null } : map1(a, (r) => [r < 0 ? 180 : 0, 0], true);
        case 're':
        case 'real':
          return map1(a, (r) => [r, 0], true);
        case 'im':
        case 'imag':
          return map1(a, (_r, j) => [j, 0], true);
        case 'sqrt':
          return map1(a, (r, j) => cpow(r, j, 0.5, 0));
        case 'exp':
          return map1(a, (r, j) => [Math.exp(r) * Math.cos(j), Math.exp(r) * Math.sin(j)]);
        case 'ln':
        case 'log':
          return map1(a, (r, j) => [Math.log(Math.hypot(r, j)), Math.atan2(j, r)]);
        case 'log10':
          return map1(a, (r, j) => [Math.log10(Math.hypot(r, j)), Math.atan2(j, r) / Math.LN10]);
        case 'sin':
          return map1(a, (r) => [Math.sin(r), 0], true);
        case 'cos':
          return map1(a, (r) => [Math.cos(r), 0], true);
        case 'tan':
          return map1(a, (r) => [Math.tan(r), 0], true);
        case 'atan':
          return map1(a, (r) => [Math.atan(r), 0], true);
        case 'sgn':
          return map1(a, (r) => [Math.sign(r), 0], true);
        case 'pow':
          if (!args[1]) throw new ExprError('pow(x, y) necesita dos argumentos');
          return map2(a, args[1], cpow);
        case 'min':
        case 'max': {
          if (!args[1]) throw new ExprError(`${n.fn}(a, b) necesita dos argumentos`);
          const f = n.fn === 'min' ? Math.min : Math.max;
          return map2(a, args[1], (ar, _ai, br) => [f(ar, br), 0]);
        }
        case 'd':
          return derivative(a, ctx.scale, len);
        default:
          return integral(a, ctx.scale, len);
      }
    }
  }
}

const expand = (x: Float64Array, len: number) => (x.length === len ? x : fill(len, x[0]));

/** Derivada respecto del eje X (diferencias centradas) */
function derivative(a: C, x: Float64Array, len: number): C {
  const out = (y: Float64Array) => {
    const v = expand(y, len);
    const d = new Float64Array(len);
    for (let k = 0; k < len; k++) {
      const k0 = Math.max(0, k - 1);
      const k1 = Math.min(len - 1, k + 1);
      d[k] = x[k1] === x[k0] ? 0 : (v[k1] - v[k0]) / (x[k1] - x[k0]);
    }
    return d;
  };
  return { re: out(a.re), im: a.im ? out(a.im) : null };
}

/** Integral acumulada respecto del eje X (trapecios) */
function integral(a: C, x: Float64Array, len: number): C {
  const out = (y: Float64Array) => {
    const v = expand(y, len);
    const s = new Float64Array(len);
    for (let k = 1; k < len; k++) s[k] = s[k - 1] + ((v[k] + v[k - 1]) / 2) * (x[k] - x[k - 1]);
    return s;
  };
  return { re: out(a.re), im: a.im ? out(a.im) : null };
}

/** Evalúa una expresión y la lleva al largo del eje X (las constantes se repiten) */
export function evalTrace(src: string, ctx: EvalContext): Wave {
  const w = evaluate(parseExpr(src), ctx);
  const len = ctx.scale.length;
  return { re: expand(w.re, len), ...(w.im ? { im: expand(w.im, len) } : {}) };
}

/** Normaliza el texto de una traza para compararlo ("v(OUT)" ≡ "V(out)") */
export const traceKey = (s: string) => s.replace(/\s+/g, '').toLowerCase();
