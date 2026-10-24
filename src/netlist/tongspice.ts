// Netlist estilo LTspice → netlist para ngspice, con todo lo implícito de LTspice escrito
// de forma explícita:
//  - inductores: 1 mΩ en serie si no se indica Rser (medido en LTspice: 1 V sobre 1 H → 1000 A);
//  - Rser/Lser/Rpar/Cpar de L, C y V se expanden en elementos reales (ngspice no los tiene);
//  - .model implícitos (D, NPN, NMOS…) y nombres de elemento con "§";
//  - ".lib archivo" (sin sección) → ".include", y rutas resueltas contra la librería;
//  - ".tran tstop" → ".tran paso tstop" (ngspice exige el paso);
//  - ".step" → bucles en un bloque .control (step.ts).
import { translateDigital } from './digital.ts';
import { fixFloatingNodes } from './floating.ts';
import { controlHooks, isControlBlock, isNgspiceComment } from './directives.ts';
import { collectModels, replaceAko } from './ako.ts';
import { replaceIdealDiodes } from './idealdiode.ts';
import { stripLtspiceInfo } from '../library/cmp.ts';
import type { Element, LtNetlist } from './ltnetlist.ts';
import { replaceLaplaceLines, translateLaplace } from './laplace.ts';
import { formatSpiceNumber, fromRkm, parseSpiceNumber } from './spicenum.ts';
import { parseStep, stepPlan, type Step, type StepHooks, type StepRuns } from './step.ts';
import { t } from '../i18n/i18n.ts';

/** Resistencia serie que LTspice agrega a todo inductor sin Rser */
export const LTSPICE_INDUCTOR_RSER = '1m';

export interface ModelResolver {
  /** Resuelve una ruta de .lib/.include/ModelFile a un archivo de la librería (ruta relativa) */
  resolve(path: string): string | undefined;
  /** ¿Algún archivo resuelto o directiva define este modelo/subcircuito? */
  defines?(name: string): boolean;
  /** Archivo de library/cmp que define este .model (se incluye solo, como la standard.bjt de LTspice) */
  cmpFile?(name: string): string | undefined;
  /** Archivo de la librería de LTspice del usuario que define este modelo/subcircuito (se incluye solo) */
  ltspiceFile?(name: string): string | undefined;
}

export interface NgspiceNetlist {
  text: string;
  /** archivos de la librería que hay que escribir en el FS del motor (rutas relativas) */
  includes: string[];
  /**
   * Parámetros que las instancias X pasan a cada subcircuito (nombre en minúsculas →
   * parámetro → valor de la primera instancia). Hay que aplicarlos con patchSubckts a los
   * archivos incluidos: LTspice acepta parámetros no declarados en el .subckt, ngspice no.
   */
  subcktParams: Map<string, Map<string, string>>;
  /** nombre del elemento en LTspice (InstName efectivo) → nombre en ngspice */
  names: Map<string, string>;
  /** lo mismo adentro de cada bloque jerárquico (nombre del bloque en minúsculas), #199 */
  blockNames: Map<string, Map<string, string>>;
  /** con .step: las corridas en orden de ejecución */
  steps?: StepRuns;
  /** líneas .meas (las evalúa TurboSpice sobre los resultados; en la netlist van comentadas) */
  measures: string[];
  /** gráficos x-y de un programa de bloques (puntos en el log: "TS-XY id x y") */
  xyPlots: { id: number; x: string; y: string }[];
  /** el .control lo generó un programa de bloques (tabla, listas e histogramas en el log) */
  blocks?: boolean;
  warnings: string[];
  /** elementos sin valor asignado (R, C, L, fuentes…): no se simula hasta asignarlo (#256) */
  missingValues: string[];
}

// Parámetros de L/C/V que ngspice no conoce y se expanden en elementos
const PARASITICS: Record<string, string[]> = {
  L: ['rser', 'rpar', 'cpar'],
  C: ['rser', 'lser', 'rpar', 'cpar'],
  V: ['rser', 'cpar'],
};

// Parámetros de la base de datos de componentes de LTspice (tolerancia, potencia, corriente
// máxima, fabricante…): informativos, ngspice no los conoce ("unknown parameter") y no cambian
// el resultado, así que se quitan. Los que ngspice entiende (temp, tc1, tc2, m, ic…) se dejan.
const DB_PARAMS: Record<string, string[]> = {
  R: ['tol', 'pwr', 'mfg', 'pn', 'type'],
  C: ['tol', 'v', 'irms', 'iripple', 'mfg', 'pn', 'type', 'rlshunt', 'mtbf', 'pppkg'],
  L: ['tol', 'ipk', 'irms', 'isat', 'mfg', 'pn', 'type', 'rlshunt'],
};

/** Separa "10m Rser=2 Cpar=1p" en valor principal y parámetros key=value */
function splitParams(value: string): { main: string; params: Map<string, string>; order: string[] } {
  const params = new Map<string, string>();
  const order: string[] = [];
  const main: string[] = [];
  // tokens respetando paréntesis y llaves: "SINE(0 1 1k)" o "{a*2}" son un solo token
  // LTspice acepta espacios alrededor del "=" ("K = 1"); no toca ==, >=, <=, !=
  const tokens = value.replace(/([A-Za-z_]\w*)\s*=\s*(?=[^=\s])/g, '$1=').match(/(?:[^\s({]+|\([^)]*\)|\{[^}]*\})+/g) ?? [];
  for (const tt of tokens) {
    const m = /^([A-Za-z_]\w*)=(.+)$/.exec(tt);
    if (m) {
      params.set(m[1].toLowerCase(), m[2]);
      order.push(m[1]);
    } else main.push(tt);
  }
  return { main: main.join(' '), params, order };
}

/**
 * Sintaxis de fuentes de LTspice que ngspice escribe distinto: el PWL repetido
 * ("PWL REPEAT FOREVER (t v …) ENDREPEAT") es "PWL(t v …) r=0" en ngspice.
 */
export function sourceSyntax(letter: string, value: string): string {
  if (letter !== 'V' && letter !== 'I') return value;
  return value.replace(/\bPWL\s+REPEAT\s+FOREVER\s*\(([^)]*)\)\s*ENDREPEAT\b/i, 'PWL($1) r=0');
}

function ngspiceName(e: Element, used: Set<string>): string {
  let n = e.name.replace(/§/g, '_');
  while (used.has(n.toLowerCase())) n += '_';
  used.add(n.toLowerCase());
  return n;
}

/** Expande parásitos de L, C y V. Devuelve las líneas que reemplazan al elemento. */
function expandElement(name: string, letter: string, nodes: string[], value: string, warnings: string[]): string[] {
  // Resistencia de comportamiento "R= expr" (con espacios y V()): ngspice la acepta como r={expr},
  // sigue siendo una R y su corriente se mide igual (@r[i])
  const behavioral = letter === 'R' ? /^\s*r\s*=\s*(.+?)\s*$/i.exec(value) : null;
  if (behavioral) return [[name, ...nodes, `r={${behavioral[1].replace(/^\{(.*)\}$/, '$1').replace(/^'(.*)'$/, '$1')}}`].join(' ')];
  // Fuente B: tripdv/tripdt (control de paso de LTspice) no existen en ngspice y se quitan;
  // Rpar/Cpar van como elementos en paralelo. La expresión tiene espacios, así que no se usa
  // splitParams: estos parámetros van siempre después de la expresión.
  if (letter === 'B') {
    const extra: string[] = [];
    const rest = value.replace(/\s+(tripdv|tripdt|rpar|cpar)\s*=\s*(\{[^}]*\}|\S+)/gi, (_, k: string, v: string) => {
      const kind = k.toLowerCase();
      if (kind === 'rpar' || kind === 'cpar') extra.push(`${kind[0].toUpperCase()}__${name}_par ${nodes[0]} ${nodes[1]} ${v}`);
      return '';
    });
    return [[name, ...nodes, rest].join(' '), ...extra];
  }
  // "electrolytic" del tipo de capacitor de la base de datos de LTspice (a veces con una comilla)
  if (letter === 'C') value = value.replace(/(^|\s)electrolytic"?(?=\s|$)/i, '$1');
  const kinds = PARASITICS[letter];
  const dropped = DB_PARAMS[letter];
  if (!kinds && !dropped) return [[name, ...nodes, value].filter(Boolean).join(' ')];
  const { main, params, order } = splitParams(value);
  if (!kinds) {
    const keep = order.filter((k) => !dropped.includes(k.toLowerCase())).map((k) => `${k}=${params.get(k.toLowerCase())}`);
    return [[name, ...nodes, main, ...keep].filter(Boolean).join(' ')];
  }
  if (letter === 'L' && !params.has('rser')) params.set('rser', LTSPICE_INDUCTOR_RSER);
  const p = (k: string) => {
    const v = params.get(k);
    return v !== undefined && parseSpiceNumber(v) !== 0 ? v : undefined;
  };
  const rest = order.filter((k) => !kinds.includes(k.toLowerCase()) && !dropped?.includes(k.toLowerCase())).map((k) => `${k}=${params.get(k.toLowerCase())}`);

  const [a, b] = nodes;
  const lines: string[] = [];
  let inner = b;
  // serie: a ─ elemento ─ [Lser] ─ [Rser] ─ b
  const rser = p('rser');
  const lser = letter === 'C' ? p('lser') : undefined;
  if (rser || lser) {
    inner = `${name}__s`;
    let n = inner;
    if (lser) {
      const next = rser ? `${name}__l` : b;
      lines.push(`L__${name} ${n} ${next} ${lser}`);
      n = next;
    }
    if (rser) lines.push(`R__${name} ${n} ${b} ${rser}`);
  }
  lines.unshift([name, a, inner, main, ...rest].filter(Boolean).join(' '));
  // paralelo sobre todo el conjunto
  const rpar = p('rpar');
  const cpar = p('cpar');
  if (rpar) lines.push(`R__${name}_par ${a} ${b} ${rpar}`);
  if (cpar) lines.push(`C__${name}_par ${a} ${b} ${cpar}`);
  for (const k of order) {
    if (k.toLowerCase() === 'ipk' || k.toLowerCase() === 'rlshunt') warnings.push(t('{name}: {k} isn\'t supported by ngspice and is ignored', { name, k }));
  }
  return lines;
}

/**
 * Funciones aleatorias de LTspice → ngspice (se vuelven a sortear en cada corrida de .step):
 * mc(x, tol) → unif(x, tol) (uniforme en x·(1±tol)); flat(x) → aunif(0, x) (uniforme en ±x);
 * gauss(x) → agauss(0, x, 1) (normal con σ = x).
 */
export function translateRandom(text: string): string {
  if (!/\b(mc|flat|gauss)\s*\(/i.test(text)) return text;
  let out = '';
  let i = 0;
  const re = /\b(mc|flat|gauss)\s*\(/gi;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    // argumentos hasta el paréntesis que cierra
    let depth = 1;
    let k = m.index + m[0].length;
    const start = k;
    const commas: number[] = [];
    for (; k < text.length && depth; k++) {
      if (text[k] === '(') depth++;
      else if (text[k] === ')') depth--;
      else if (text[k] === ',' && depth === 1) commas.push(k);
    }
    if (depth) break;
    const args = text.slice(start, k - 1);
    const fn = m[1].toLowerCase();
    let rep: string | null = null;
    if (fn === 'mc' && commas.length === 1) rep = `unif(${args})`;
    else if (fn === 'flat' && !commas.length) rep = `aunif(0, ${args})`;
    else if (fn === 'gauss' && !commas.length) rep = `agauss(0, ${args}, 1)`;
    if (rep === null) continue;
    out += text.slice(i, m.index) + rep;
    i = k;
    re.lastIndex = k;
  }
  return out + text.slice(i);
}

/** Argumentos de una llamada: separados por las comas de primer nivel */
function splitArgs(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let k = 0; k < args.length; k++) {
    if (args[k] === '(') depth++;
    else if (args[k] === ')') depth--;
    else if (args[k] === ',' && !depth) {
      out.push(args.slice(start, k).trim());
      start = k + 1;
    }
  }
  out.push(args.slice(start).trim());
  return out;
}

/**
 * table(x, x1,y1, x2,y2…) de LTspice como cadena de ternarios: interpola lineal entre puntos y
 * mantiene el extremo fuera del rango. Para numparam (.func, .param, llaves), que no tiene table.
 */
function tableTernary([x, ...pts]: string[]): string | null {
  if (pts.length < 2 || pts.length % 2) return null;
  const xs = pts.filter((_, i) => i % 2 === 0);
  const ys = pts.filter((_, i) => i % 2 === 1);
  let out = `(${ys[ys.length - 1]})`;
  for (let i = xs.length - 2; i >= 0; i--) {
    const seg = `((${ys[i]})+((${ys[i + 1]})-(${ys[i]}))*((${x})-(${xs[i]}))/((${xs[i + 1]})-(${xs[i]})))`;
    out = `((${x}) <= (${xs[i + 1]}) ? ${seg} : ${out})`;
  }
  return `((${x}) <= (${xs[0]}) ? (${ys[0]}) : ${out})`;
}

// Funciones de LTspice que el numparam de ngspice no conoce (en las fuentes B sí andan)
const LT_FUNCTIONS: Record<string, (a: string[]) => string | null> = {
  u: ([x, ...r]) => (r.length ? null : `((${x}) > 0 ? 1 : 0)`),
  // if(x,y,z): y si x >= 0,5 (medido: 0,5 da y; 0,4999 da z); la de ngspice no la evalúa así
  if: ([c, a, b, ...r]) => (b === undefined || r.length ? null : `((${c}) >= 0.5 ? (${a}) : (${b}))`),
  uramp: ([x, ...r]) => (r.length ? null : `max((${x}), 0)`),
  table: tableTernary,
  tbl: tableTernary,
  buf: ([x, ...r]) => (r.length ? null : `((${x}) > 0.5 ? 1 : 0)`),
  inv: ([x, ...r]) => (r.length ? null : `((${x}) > 0.5 ? 0 : 1)`),
  // al entero más cercano, las mitades lejos del cero (nint de ngspice redondea al par)
  round: ([x, ...r]) => (r.length ? null : `(sgn(${x})*floor(abs(${x})+0.5))`),
  hypot: ([x, y, ...r]) => (y === undefined || r.length ? null : `sqrt(pow(${x},2)+pow(${y},2))`),
};
const LT_FUNCTION_RE = new RegExp(`\\b(${Object.keys(LT_FUNCTIONS).join('|')})\\s*\\(`, 'gi');

// pwl de la fuente B sólo admite puntos literales; con parámetros o expresiones, los ternarios
function bTable(a: string[]): string | null {
  if (a.length < 3 || a.length % 2 === 0) return null;
  return a.slice(1).every((p) => /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(p)) ? `pwl(${a.join(',')})` : tableTernary(a);
}

// Las fuentes B de ngspice ya tienen u() y uramp(); éstas no. Además el logaritmo o la raíz de
// un negativo abortan la simulación en ngspice; LTspice los acota (log → muy negativo, sqrt → 0)
// y eso pasa en las iteraciones de Newton aunque el resultado final sea válido.
const B_FUNCTIONS: Record<string, (a: string[]) => string | null> = {
  ...LT_FUNCTIONS,
  log: ([x, ...r]) => (r.length ? null : `log(max(${x},1e-100))`),
  ln: ([x, ...r]) => (r.length ? null : `ln(max(${x},1e-100))`),
  log10: ([x, ...r]) => (r.length ? null : `log10(max(${x},1e-100))`),
  sqrt: ([x, ...r]) => (r.length ? null : `sqrt(max(${x},0))`),
  // table(x, x1,y1, x2,y2…) de LTspice es la pwl(x, …) de la fuente B de ngspice (interpola
  // lineal y fuera del rango mantiene el extremo)
  table: bTable,
  tbl: bTable,
  // rand(x): escalonada en [0,1), cambia en cada entero de x; random(x) pasa por los mismos
  // valores en los enteros e interpola suave; white(x) es random(x)-0.5. ngspice no tiene nada
  // parecido en la fuente B: hash pseudoaleatorio de floor(x) (otra semilla que LTspice)
  rand: ([x, ...r]) => (r.length ? null : hashRand(`floor(${x})`)),
  random: ([x, ...r]) => (r.length ? null : smoothRand(x)),
  white: ([x, ...r]) => (r.length ? null : `(${smoothRand(x)}-0.5)`),
};
const B_FUNCTION_RE = /\b(u|if|buf|inv|round|hypot|log|ln|log10|sqrt|table|tbl|rand|random|white)\s*\(/gi;

function hashRand(n: string): string {
  const s = `(sin((${n})*12.9898+78.233)*43758.5453)`;
  return `(${s}-floor(${s}))`;
}
function smoothRand(x: string): string {
  const f = `((${x})-floor(${x}))`;
  return `(${hashRand(`floor(${x})`)}+(${hashRand(`floor(${x})+1`)}-${hashRand(`floor(${x})`)})*${f}*${f}*(3-2*${f}))`;
}

/**
 * Funciones con estado de las fuentes B de LTspice, que necesitan elementos auxiliares:
 *  - idt(x[,ic[,reset]]) / sdt: C de 1 F cargado con corriente x; en el punto de operación y
 *    mientras reset > 0.5 la corriente lleva el nodo a ic;
 *  - idtmod(x[,ic[,m[,o]]]): la misma integral, a la salida o + mod(·, m);
 *  - delay(x,t[,tmax]): con t constante una línea de transmisión ideal adaptada (exacta); con t
 *    variable el code model XSPICE delay (cuantiza al paso del .tran).
 * Devuelve la expresión con cada llamada cambiada por V(nodo auxiliar).
 */
export function expandStateFunctions(name: string, expr: string, lines: string[], warnings: string[]): string {
  const re = /\b(idt|sdt|idtmod|delay)\s*\(/gi;
  if (!new RegExp(re.source, 'i').test(expr)) return expr;
  let out = '';
  let i = 0;
  for (let m = re.exec(expr); m; m = re.exec(expr)) {
    let depth = 1;
    let k = m.index + m[0].length;
    const start = k;
    for (; k < expr.length && depth; k++) {
      if (expr[k] === '(') depth++;
      else if (expr[k] === ')') depth--;
    }
    if (depth) break;
    const args = splitArgs(expandStateFunctions(name, expr.slice(start, k - 1), lines, warnings));
    const fn = m[1].toLowerCase();
    const n = `${name}__${fn}${lines.length}`;
    let rep: string | null = null;
    if (fn !== 'delay' && args[0] && args.length <= (fn === 'idtmod' ? 4 : 3)) {
      const [x, ic = '0', third] = args;
      const hold = fn !== 'idtmod' && third ? `(time > 0) && !((${third}) > 0.5)` : 'time > 0';
      lines.push(`C__${n} ${n} 0 1`, `B__${n} 0 ${n} I=(${hold}) ? (${x}) : 1e6*((${ic})-V(${n}))`);
      if (fn === 'idtmod') {
        const [, , mod = '1', off = '0'] = args;
        rep = `((${off})+V(${n})-(${mod})*floor(V(${n})/(${mod})))`;
      } else rep = `V(${n})`;
    } else if (fn === 'delay' && (args.length === 2 || args.length === 3)) {
      const [x, tt, tmax] = args;
      lines.push(`B__${n} ${n}_in 0 V=${x}`);
      if (!/\b[vi]\s*\(|\btime\b/i.test(tt)) {
        lines.push(`T__${n} ${n}_in 0 ${n} 0 Z0=1 TD={${tt.replace(/[{}]/g, '')}}`, `R__${n} ${n} 0 1`);
      } else {
        // el control del code model es la fracción de delmax (delmin = 0); ngspice recorta delmax
        // al final de la simulación (si fuera mayor, la fracción dejaría de ser t/delmax), así que
        // delmax = min(tmax, tstop); prepareSimulation define dly_tstop con el tstop del .tran
        const dmax = `min(${tmax ? tmax.replace(/[{}]/g, '') : '1e30'},dly_tstop)`;
        lines.push(
          `B__${n}_t ${n}_t 0 V=(${tt})/(${dmax})`,
          `A__${n} ${n}_in ${n} ${n}_t ${n}_m`,
          `.model ${n}_m delay(delmin=0 delmax={${dmax}} has_delay_cnt=true)`,
        );
        warnings.push(t('{name}: delay() with a variable delay is resolved at the .tran step', { name }));
      }
      rep = `V(${n})`;
    }
    if (rep === null) continue;
    out += expr.slice(i, m.index) + rep;
    i = k;
    re.lastIndex = k;
  }
  return out + expr.slice(i);
}

/**
 * Fuente B escrita como línea de netlist (directiva del esquemático o archivo de modelos): las
 * funciones de LTspice que ngspice no tiene (round, table, idt, rand…); los elementos auxiliares
 * de idt/delay van justo después. undefined si la línea no es una B o no hay nada que traducir.
 */
function translateBLine(line: string, warnings: string[]): string | undefined {
  const b = /^(\s*(B\S*)\s+\S+\s+\S+\s+)(\S.*)$/i.exec(line);
  if (!b || !(/\b(idt|sdt|idtmod|delay)\s*\(/i.test(b[3]) || new RegExp(B_FUNCTION_RE.source, 'i').test(b[3]))) return undefined;
  const aux: string[] = [];
  const value = translateExpression(expandStateFunctions(b[2], b[3].replace(/([A-Za-z_]\w*)\s+\(/g, '$1('), aux, warnings), B_FUNCTION_RE, B_FUNCTIONS);
  return [b[1] + value, ...aux].join('\n');
}

/** Reescribe en una expresión las llamadas a funciones de LTspice que ngspice no tiene */
function translateExpression(text: string, fnRe: RegExp = LT_FUNCTION_RE, fns = LT_FUNCTIONS): string {
  let out = '';
  let i = 0;
  const re = new RegExp(fnRe.source, 'gi');
  for (let m = re.exec(text); m; m = re.exec(text)) {
    let depth = 1;
    let k = m.index + m[0].length;
    const start = k;
    for (; k < text.length && depth; k++) {
      if (text[k] === '(') depth++;
      else if (text[k] === ')') depth--;
    }
    if (depth) break;
    // los argumentos pueden tener a su vez llamadas a traducir
    const args = splitArgs(translateExpression(text.slice(start, k - 1), fnRe, fns));
    const rep = fns[m[1].toLowerCase()](args);
    if (rep === null) continue;
    out += text.slice(i, m.index) + rep;
    i = k;
    re.lastIndex = k;
  }
  return out + text.slice(i);
}

/**
 * Funciones deterministas de LTspice que el numparam de ngspice no conoce: u(x) → ((x) > 0 ? 1 : 0),
 * uramp(x) → max((x), 0), buf, inv, round y hypot. Sólo se traducen en las expresiones que evalúa
 * numparam: las líneas .param/.func enteras y, en el resto, lo que está entre llaves (en una fuente
 * B, "V=u(x)" sin llaves lo evalúa la fuente, que sí conoce u()).
 */
export function translateFunctions(text: string): string {
  if (!new RegExp(LT_FUNCTION_RE.source, 'i').test(text)) return text;
  if (/^\s*\.(param|func)\b/i.test(text)) {
    // ".func u(x)=…" define la función: el nombre no se toca
    const head = /^\s*\.func\s+\w+\s*\([^)]*\)/i.exec(text)?.[0] ?? '';
    return head + translateExpression(text.slice(head.length));
  }
  return text.replace(/\{[^{}]*\}/g, (e) => translateExpression(e));
}

/**
 * "2*{a}" o "Freq=1/{2*pi*f}": LTspice acepta llaves en parte del valor; numparam no. Cada token
 * con llaves que no lo envuelven entero (y paréntesis balanceados, para no romper "PULSE(…)")
 * va entero entre llaves.
 */
function fixBraces(value: string): string {
  if (!value.includes('{')) return value;
  const count = (tt: string, c: string) => tt.split(c).length - 1;
  return value.replace(/\S+/g, (tok) => {
    const kv = /^([A-Za-z_]\w*=)(.*)$/.exec(tok);
    const [k, v] = kv ? [kv[1], kv[2]] : ['', tok];
    if (!v.includes('{') || /^\{[^{}]*\}$/.test(v) || count(v, '{') !== count(v, '}') || count(v, '(') !== count(v, ')')) return tok;
    return `${k}{${v.replace(/[{}]/g, '')}}`;
  });
}

/**
 * ".param K=(a) / (b) c=1": LTspice acepta espacios dentro de la expresión; numparam la corta en
 * el primer espacio (y en silencio da otro valor, p.ej. "K=1 + 2" → 1). Cada valor con espacios
 * va entre llaves; también los que tienen llaves sueltas adentro, y la notación RKM (1k94) pasa
 * a 1.94k.
 */
function fixParam(line: string): string {
  const m = /^(\.param\s+)(.*)$/i.exec(line);
  if (!m || !m[2].includes('=')) return line;
  const parts = m[2].split(/\s+(?=[A-Za-z_]\w*\s*=(?!=))/).map((p) => {
    const a = /^([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/.exec(p);
    if (!a) return p;
    // "R=1K94": la notación RKM numparam no la entiende
    const rkm = fromRkm(a[2]);
    if (rkm) return `${a[1]}=${rkm}`;
    // "ton=(1/(2*{f}))": llaves sueltas dentro de la expresión
    let v = a[2];
    if (!/^\{[^{}]*\}$/.test(v) && /[{}]/.test(v)) v = `{${v.replace(/[{}]/g, '')}}`;
    if (v === a[2] && (!/\s/.test(v) || /^\{.*\}$/.test(v))) return p;
    return /^\{.*\}$/.test(v) ? `${a[1]}=${v}` : `${a[1]}={${v}}`;
  });
  return m[1] + parts.join(' ');
}

/**
 * Período y retardo de las fuentes SINE V e I de la netlist (las de frecuencia con parámetros
 * no se pueden evaluar y no cuentan)
 */
function sinePeriods(lt: LtNetlist): { period: number; delay: number }[] {
  const out: { period: number; delay: number }[] = [];
  for (const e of [...lt.elements, ...lt.blocks.flatMap((b) => b.lt.elements)]) {
    if (!/^[VI]$/i.test(e.prefix)) continue;
    const m = /\bSIN(?:E)?\s*\(([^)]*)\)/i.exec(e.value);
    if (!m) continue;
    const a = m[1].trim().split(/[\s,]+/).map(parseSpiceNumber);
    const f = a[2];
    if (f > 0 && Number.isFinite(f)) out.push({ period: 1 / f, delay: Number.isFinite(a[3]) ? a[3] : 0 });
  }
  return out;
}

/**
 * Paso máximo de LTspice (medido con LTspice -b): nunca más de tstop/1024 y, con fuentes SINE,
 * nunca más de T/8.7 (con .tran 0.003 3 y una SINE de 1 kHz da ~48.000 puntos). ngspice usa
 * min(paso, tstop/50) y sin elementos reactivos submuestrea la senoide; se pone ese tmax en el
 * .tran salvo que el usuario haya pedido uno menor (#101).
 */
function ltspiceTmax(tstop: number, sines: { period: number; delay: number }[]): number {
  let h = tstop / 1024;
  for (const s of sines) if (s.delay < tstop) h = Math.min(h, s.period / 8.7);
  return h;
}

/** ".tran tstop" o ".tran 0 tstop ..." → ".tran paso tstop ..." (ngspice exige paso > 0) */
function fixTran(line: string, warnings: string[], sines: { period: number; delay: number }[] = []): string {
  const m = /^\.tran\s+(.*)$/i.exec(line.trim());
  if (!m) return line;
  const args = m[1].split(/\s+/);
  const flags = args.filter((a) => /^[a-z]/i.test(a) && !/^\{/.test(a));
  const nums = args.filter((a) => !flags.includes(a));
  // startup se emula en las fuentes (ver startupRamp)
  const unsupported = flags.filter((f) => !/^(uic|startup)$/i.test(f));
  if (unsupported.length) warnings.push(t('.tran: LTspice options ignored ({p0})', { p0: unsupported.join(', ') }));
  if (nums.length === 1) nums.unshift('0');
  const tstop = parseSpiceNumber(nums[1]);
  if (parseSpiceNumber(nums[0]) === 0) {
    if (Number.isFinite(tstop)) nums[0] = formatSpiceNumber(tstop / 1000);
    // ".tran 0 {6/fz}": el paso también como expresión
    else if (/^\{.*\}$/.test(nums[1] ?? '')) nums[0] = `{(${nums[1].slice(1, -1)})/1000}`;
  }
  if (Number.isFinite(tstop) && tstop > 0 && sines.length) {
    const h = ltspiceTmax(tstop, sines);
    const user = nums.length > 3 ? parseSpiceNumber(nums[3]) : Infinity;
    // un tmax con parámetros se deja como está
    if (!Number.isNaN(user) && h < user) {
      while (nums.length < 3) nums.push('0');
      nums[3] = formatSpiceNumber(h);
    }
  }
  return ['.tran', ...nums, ...flags.filter((f) => /^uic$/i.test(f))].join(' ');
}

const DROP_DIRECTIVES = /^\.(backanno|wave|save\s+none|loadbias|savebias)\b/i;

/** Líneas de ngspice de los elementos de una netlist (con los parásitos expandidos) */
/**
 * "C1 b 0 1u IC=1": LTspice usa la condición inicial del capacitor aunque el .tran no tenga uic
 * (es una restricción del punto de operación); ngspice sólo con uic. Con un terminal a tierra
 * equivale a ".ic V(b)=1". Con los dos terminales flotantes no hay equivalente directo en .ic.
 */
function capacitorIcs(lt: LtNetlist, names: Map<string, string>, hold: boolean): string[] {
  const out: string[] = [];
  const done = new Set<string>();
  for (const e of lt.elements) {
    if (e.prefix.toUpperCase() !== 'C' || e.nodes.length !== 2) continue;
    const ic = splitParams(e.value).params.get('ic');
    if (ic === undefined) continue;
    const [a, b] = e.nodes;
    const v = icValue(ic).replace(/^\{(.*)\}$/, '$1');
    if (a !== '0' && b !== '0' && a !== b) {
      if (hold) out.push(`B__${names.get(e.name) ?? e.name}_ic ${a} ${b} I=${holdAtOp(`V(${a},${b})-(${icValue(ic)})`)}`);
      continue;
    }
    const [node, val] = b === '0' ? [a, icValue(ic)] : a === '0' ? [b, `{-(${v})}`] : [];
    if (!node || node === '0' || done.has(node)) continue;
    done.add(node);
    out.push(`.ic V(${node})=${val}`);
  }
  return out;
}

/**
 * Con un .tran sin uic, LTspice toma el IC= de los capacitores y el de los inductores (o .ic
 * I(L)) como restricción del punto de operación: el capacitor hace de fuente de tensión y el
 * inductor de fuente de corriente de ese valor (también con IC=0); después el transitorio sigue
 * libre (medido con LTspice -b). Los capacitores flotantes y los inductores se emulan con una
 * fuente B que sólo actúa en el punto de operación (time=0) y se anula para t>0: en paralelo
 * con el capacitor una conductancia grande hacia V=IC, en serie con el inductor una tensión que
 * lleva su corriente a IC. Los capacitores a tierra usan .ic, que hace lo mismo.
 */
const holdAtOp = (err: string) => `(time > 0) ? 0 : 1e6*(${err})`;

/**
 * Inductores nombrados en un acoplamiento K: con K LTspice no fuerza su corriente inicial de
 * una forma simple (en un flyback con .ic I(L2)=0.3m arranca con 27 µA), así que no se emulan.
 */
function coupledInductors(lt: LtNetlist): Set<string> {
  const out = new Set<string>();
  for (const tt of lt.texts) {
    if (tt.kind !== 'directive') continue;
    for (const l of tt.text.split(/\\n|\n/)) {
      const k = /^\s*K\S*\s+(.*)$/i.exec(l.replace(/\s*;.*$/, ''));
      if (k) for (const n of k[1].trim().split(/\s+/).slice(0, -1)) out.add(n.toLowerCase().replace(/^l§/, ''));
    }
  }
  return out;
}

/** "IC=Vinic" (un parámetro sin llaves): numparam sólo lo reemplaza entre llaves */
const icValue = (ic: string) => (/^[A-Za-z_]\w*$/.test(ic) ? `{${ic}}` : ic);

function tranHoldsIc(lt: LtNetlist): boolean {
  const tran = lt.texts
    .filter((tt) => tt.kind === 'directive')
    .flatMap((tt) => tt.text.split(/\\n|\n/))
    .map((l) => l.replace(/\s*;.*$/, '').trim())
    .filter((l) => /^\.tran\b/i.test(l));
  return tran.length > 0 && !tran.some((l) => /\suic\b/i.test(l));
}

/**
 * ".ic I(L1)=0 V(a)=1": LTspice acepta corrientes de inductor; el .ic de ngspice sólo tensiones
 * de nodo (".ic syntax error"). Las I(Lx) pasan a IC= del inductor (ngspice sólo lo usa con uic)
 * y en el .ic quedan las V(…). Devuelve las corrientes por nombre (minúsculas) y el .ic restante.
 */
function splitIc(line: string, currents: Map<string, string>): string | null {
  if (!/^\.ic\b/i.test(line)) return line;
  const rest: string[] = [];
  for (const tt of line.slice(3).trim().match(/(?:[^\s=]+\s*=\s*)?\S+/g) ?? []) {
    const m = /^I\(([^)]+)\)\s*=\s*(\S+)$/i.exec(tt);
    if (m) currents.set(m[1].toLowerCase(), m[2]);
    else rest.push(tt);
  }
  return rest.length ? `.ic ${rest.join(' ')}` : null;
}

/**
 * ".tran … startup": LTspice hace el punto de operación con las fuentes V e I de valor DC puro
 * en 0 y las lleva a su valor con una rampa lineal de 20 µs (fija, aunque el .tran sea más
 * corto). Las fuentes con forma (SINE, PULSE, PWL…) y las de adentro de subcircuitos no cambian.
 * En ngspice: "V1 a 0 5" → "V1 a 0 DC 5 PWL(0 0 20u 5)" (el .op de .tran usa el PWL en t=0).
 */
export function startupRamp(value: string): string {
  const { main, params, order } = splitParams(value);
  const m = /^(?:DC\s+)?([^\s(){}]+|\{[^{}]*\})((?:\s+AC\b.*)?)$/i.exec(main.trim());
  if (!m || !/^[-+.\d{]/.test(m[1])) return value;
  const rest = order.map((k) => `${k}=${params.get(k.toLowerCase())}`);
  return [`DC ${m[1]}${m[2]} PWL(0 0 20u ${m[1]})`, ...rest].join(' ');
}

function hasStartup(lt: LtNetlist): boolean {
  return lt.texts.some((tt) => tt.kind === 'directive' && tt.text.split('\n').some((l) => /^\s*\.tran\b[^;]*\sstartup\b/i.test(l)));
}

function convertElements(
  lt: LtNetlist,
  used: Set<string>,
  names: Map<string, string>,
  warnings: string[],
  subcktParams: Map<string, Map<string, string>>,
  inductorIcs = new Map<string, string>(),
  startup = false,
  holdIc = false,
  coupled = new Set<string>(),
  missingValues: string[] = [],
): string[] {
  const out: string[] = [];
  const extra: string[] = [];
  for (const e of lt.elements) {
    const name = ngspiceName(e, used);
    names.set(e.name, name);
    // "I1 a b TBL(v1 i1 v2 i2 …)": la corriente es la tabla de la tensión de la propia fuente
    // (medido con LTspice: I = f(V(a,b))); en ngspice una fuente B
    const tbl = /^I/i.test(name) && e.nodes.length === 2 ? /^\s*tbl\s*\((.*)\)\s*$/i.exec(e.value) : null;
    const pts = tbl?.[1].match(/\{[^{}]*\}|[^\s,{}]+/g)?.map((p) => p.replace(/[{}]/g, ''));
    if (pts) {
      const f = bTable([`V(${e.nodes[0]},${e.nodes[1]})`, ...pts]);
      if (f) {
        names.set(e.name, `B_${name}`);
        out.push(`B_${name} ${e.nodes[0]} ${e.nodes[1]} I=${f}`);
        continue;
      }
    }
    const letter = name[0].toUpperCase();
    // compuertas digitales de LTspice (ver digital.ts)
    const gate = letter === 'A' ? translateDigital(name, e.nodes, e.value, warnings) : undefined;
    if (gate) {
      out.push(...gate);
      continue;
    }
    // Valor por defecto del símbolo sin cambiar ("R", "C", "L"…): falta asignarlo.
    // (En D, Q, M y J el valor por defecto es un modelo implícito válido.)
    if (/^[RCLVIEFGHB]$/.test(letter) && (e.value === '' || e.value.toUpperCase() === letter)) {
      warnings.push(t('{name} has no value assigned', { name: e.name }));
      missingValues.push(e.name);
    }
    if (letter === 'X') {
      const { main, params, order } = splitParams(e.value);
      const sub = main.split(/\s+/)[0]?.toLowerCase();
      if (sub && order.length) {
        const known = subcktParams.get(sub) ?? subcktParams.set(sub, new Map()).get(sub)!;
        for (const k of order) if (!known.has(k.toLowerCase())) known.set(k.toLowerCase(), params.get(k.toLowerCase())!);
      }
    }
    // Fuentes B: LTspice acepta "LIMIT (x, …)" con espacio antes del paréntesis y funciones
    // que la fuente B de ngspice no conoce (round, buf…) también fuera de llaves; ngspice no
    // (idt, delay… con elementos auxiliares: ver expandStateFunctions)
    let value = fixBraces(e.value);
    if (letter === 'B') {
      const aux: string[] = [];
      value = expandStateFunctions(name, e.value.replace(/([A-Za-z_]\w*)\s+\(/g, '$1('), aux, warnings);
      value = translateExpression(value, B_FUNCTION_RE, B_FUNCTIONS);
      extra.push(...aux);
    }
    // corriente inicial de .ic I(L1)=… (se busca por nombre o por InstName sin el prefijo L§)
    const icur = letter === 'L' ? (inductorIcs.get(e.name.toLowerCase()) ?? inductorIcs.get(e.name.toLowerCase().replace(/^l§/, ''))) : undefined;
    if (icur !== undefined && !splitParams(value).params.has('ic')) value += ` ic=${icur}`;
    if (startup && (letter === 'V' || letter === 'I')) value = startupRamp(value);
    // corriente inicial del inductor como restricción del punto de operación (ver holdAtOp):
    // la fuente B va en serie con L sola, adentro de Rpar (LTspice fuerza el flujo L·IC)
    const lic = letter === 'L' && holdIc && e.nodes.length === 2 && !coupled.has(e.name.toLowerCase().replace(/^l§/, '')) ? splitParams(value).params.get('ic') : undefined;
    const fixed = sourceSyntax(letter, translateFunctions(translateRandom(value)));
    // Laplace=… de E, G y B (ver laplace.ts); en E y G sin fixBraces, que corta la expresión
    const lap = translateLaplace(name, letter, e.nodes, letter === 'B' ? fixed : translateFunctions(translateRandom(e.value)), warnings);
    const lines = lap ?? expandElement(name, letter, e.nodes, fixed, warnings);
    if (lic !== undefined) {
      const [n, a, b, ...rest] = lines[0].split(' ');
      lines[0] = [n, a, `${name}__ic`, ...rest].join(' ');
      extra.push(`B__${name}_ic ${name}__ic ${b} V=${holdAtOp(`(${icValue(lic)})-I(${name})`)}`);
    }
    out.push(...lines);
  }

  return [...out, ...extra];
}

/**
 * En las fuentes B de ngspice temp y temper son variables: un nodo con ese nombre rompe V(temp)
 * ("no such function 'v'" o malloc enorme). LTspice lo acepta; en ngspice el nodo se llama temp_.
 */
export const ngNodeName = (net: string): string => (/^(temp|temper)$/i.test(net) ? `${net}_` : net);

function renameReservedNodes(lt: LtNetlist): LtNetlist {
  const used = lt.elements.some((e) => e.nodes.some((n) => ngNodeName(n) !== n));
  if (!used) return lt;
  const expr = (tt: string) =>
    tt.replace(/\b([vV])\(\s*([^()]*?)\s*\)/g, (m, f: string, a: string) => {
      const args = a.split(',').map((x) => ngNodeName(x.trim()));
      return args.join(',') === a.replace(/\s+/g, '') ? m : `${f}(${args.join(',')})`;
    });
  return {
    ...lt,
    elements: lt.elements.map((e) => ({ ...e, nodes: e.nodes.map(ngNodeName), value: expr(e.value) })),
    texts: lt.texts.map((tt) => ({ ...tt, text: expr(tt.text) })),
  };
}

export function toNgspice(ltOrig: LtNetlist, title: string, models: ModelResolver): NgspiceNetlist {
  const lt = renameReservedNodes(ltOrig);
  const warnings = [...lt.warnings];
  const names = new Map<string, string>();
  const used = new Set<string>();
  const includes: string[] = [];
  const subcktParams = new Map<string, Map<string, string>>();
  const blockNames = new Map<string, Map<string, string>>();
  const missingValues: string[] = [];
  const out: string[] = [
    `* ${title}`,
    // Constante predefinida en las expresiones de LTspice que ngspice no tiene en .param
    '.param pi=3.141592653589793',
  ];

  const include = (path: string, section?: string): string | null => {
    const rel = models.resolve(path);
    if (!rel) {
      warnings.push(t('Model file "{path}" not found', { path }));
      return null;
    }
    if (!includes.includes(rel)) includes.push(rel);
    return section ? `.lib ${rel} ${section}` : `.include ${rel}`;
  };

  // corrientes de inductor de los .ic (ver splitIc); el texto restante se vuelve a procesar abajo
  const inductorIcs = new Map<string, string>();
  for (const tt of lt.texts) {
    if (tt.kind === 'directive') for (const l of tt.text.split('\n')) splitIc(l.replace(/\s*;.*$/, '').trim(), inductorIcs);
  }
  const holdIc = tranHoldsIc(lt);
  for (const [l, v] of inductorIcs) if (!holdIc && parseSpiceNumber(v) !== 0) warnings.push(t('.ic I({l})={v}: ngspice uses the inductor\'s initial current only with .tran uic', { l, v }));
  out.push(...convertElements(lt, used, names, warnings, subcktParams, inductorIcs, hasStartup(lt), holdIc, coupledInductors(lt), missingValues));
  out.push(...capacitorIcs(lt, names, holdIc));
  const implicit = [...lt.implicitModels];
  for (const b of lt.blocks) for (const m of b.lt.implicitModels) if (!implicit.includes(m)) implicit.push(m);
  out.push(...implicit);

  const sines = sinePeriods(lt);
  const steps: Step[] = [];
  const measures: string[] = [];
  // .control con marcas de sección: se combina con los barridos en lugar de reemplazarlos
  const ctl = lt.texts.find((tt) => isControlBlock(tt.text));
  const hooks = ctl ? controlHooks(ctl.text.split('\\n').slice(1, -1)) : null;
  // .control generado por bloques: "run" corre cada análisis y recuerda su plot, y cada
  // "meas" se hace sobre el plot de su análisis (después de "run" el actual es el último)
  const xyPlots: NgspiceNetlist['xyPlots'] = [];
  const blocksCtl = ctl && ctl.text.split('\\n').some((l) => l.trim() === '* bloques') ? ctl : undefined;
  if (blocksCtl) {
    const analyses = lt.texts
      .filter((tt) => (tt.kind === 'directive' || isNgspiceComment(tt.text)) && !isControlBlock(tt.text))
      .flatMap((tt) => tt.text.split('\\n'))
      .map((l) => l.trim())
      .filter((l) => /^\.(tran|ac|dc|noise|op|tf)\b/i.test(l));
    const body: string[] = [];
    for (const raw of blocksCtl.text.split('\\n').slice(1, -1)) {
      const indent = /^\s*/.exec(raw)![0];
      const l = raw.trim();
      const g = /^\*\s*grafico\s+(\d+)\s+(\S+)\s+(\S+)/i.exec(l);
      if (g) xyPlots.push({ id: Number(g[1]), x: g[2], y: g[3] });
      if (l === 'run') {
        for (const a of analyses) {
          const kind = /^\.(\w+)/.exec(a)![1].toLowerCase();
          body.push(`${indent}${fixTran(a, warnings, sines).slice(1)}`, `${indent}set ts_plot_${kind} = $curplot`);
        }
      } else if (/^meas\s+(\w+)/i.test(l)) {
        body.push(`${indent}setplot $ts_plot_${/^meas\s+(\w+)/i.exec(l)![1].toLowerCase()}`, raw);
      } else body.push(raw);
    }
    out.push('.control', ...body, '.endc');
  }
  if (ctl && !hooks) warnings.push(...controlRunWarnings(ctl.text.split('\\n').slice(1, -1), !!blocksCtl));
  // #241 Complex simulation: un .control común sin "run" reemplaza al análisis del testbench (que
  // queda en el .asc para LTspice): no se emiten los dos. Con "run", el análisis es lo que corre.
  const replacesAnalysis = !!ctl && !hooks && !blocksCtl && !controlUsesRun(ctl.text.split('\\n').slice(1, -1));
  for (const tt of lt.texts) {
    if (hooks && tt === ctl) continue;
    if (blocksCtl && tt === blocksCtl) continue;
    // Comentarios que son directivas de ngspice (.control, .pz…): se ejecutan
    const comment = tt.kind === 'comment' && !isNgspiceComment(tt.text);
    // "+ …" continúa la línea anterior (p.ej. un .meas en dos renglones): se une antes de
    // procesarla, si no la continuación queda suelta cuando la directiva se comenta
    const joined: string[] = [];
    for (const l of tt.text.split('\\n')) {
      if (/^\s*\+/.test(l) && joined.length) joined[joined.length - 1] += ` ${l.trim().slice(1).trim()}`;
      else joined.push(l);
    }
    for (const raw of joined) {
      if (comment) {
        out.push(`* ${raw}`);
        continue;
      }
      // en LTspice ";" empieza un comentario también a mitad de línea
      let line = raw.replace(/\s*;.*$/, '').trim();
      if (!line) continue;
      if (!comment) {
        const ic = splitIc(line, new Map());
        if (ic === null) {
          out.push(`* ${line}`);
          continue;
        }
        line = ic;
      }
      if (DROP_DIRECTIVES.test(line)) continue;
      if (replacesAnalysis && TESTBENCH_ANALYSIS.test(line)) {
        out.push(`* ${line}`);
        continue;
      }
      if (/^\.meas(ure)?\b/i.test(line)) {
        measures.push(line);
        out.push(`* ${line}`);
        continue;
      }
      if (/^\.step\b/i.test(line)) {
        out.push(`* ${line}`);
        const st = parseStep(line);
        if (typeof st === 'string') warnings.push(`${line}: ${st}`);
        else steps.push(st);
        continue;
      }
      const lib = /^\.(lib|include|inc)\s+("?)([^"]+)\2(?:\s+(\S+))?\s*$/i.exec(line);
      if (lib) {
        const isLib = lib[1].toLowerCase() === 'lib';
        const r = include(lib[3].trim(), isLib ? lib[4] : undefined);
        out.push(r ?? `* ${line}`);
        continue;
      }
      // Acoplamiento "K1 N2 N1 1": LTspice busca cada inductor por nombre o por InstName sin
      // prefijo (L§N2); se usan los nombres de ngspice
      const k = /^(K\S*)\s+(.*)$/i.exec(line);
      if (k) {
        const ng = (tt: string) => names.get(tt) ?? names.get(`L§${tt}`) ?? [...names].find(([a]) => a.toLowerCase() === tt.toLowerCase() || a.toLowerCase() === `l§${tt.toLowerCase()}`)?.[1] ?? tt;
        const toks = k[2].split(/\s+/);
        out.push([k[1], ...toks.map((tt, i) => (i < toks.length - 1 ? ng(tt) : tt))].join(' '));
        continue;
      }
      // fuente B escrita a mano (p.ej. "Bvco a 0 V=TABLE(…)")
      const bline = translateBLine(line, warnings);
      if (bline) {
        out.push(bline);
        continue;
      }
      // ".param x 20" (LTspice lo acepta sin "=") → ".param x=20"
      out.push(fixParam(translateFunctions(translateRandom(fixTran(line, warnings, sines))).replace(/^(\.param\s+)([A-Za-z_]\w*)\s+(?!=)(\S.*)$/i, '$1$2=$3')));
    }
  }

  for (const f of lt.modelFiles) {
    const r = include(f);
    if (r) out.push(r);
  }

  const stepRuns = steps.length ? addSteps(steps, lt, names, out, warnings, hooks ?? undefined) : undefined;
  if (hooks && !steps.length) out.push('.control', ...hooks.before, 'run', ...hooks.after, ...hooks.final, '.endc');

  // Modelos referenciados que no aparecen definidos en ningún lado
  const local = new Set(
    lt.texts
      .filter((tt) => tt.kind === 'directive')
      .flatMap((tt) => [...tt.text.matchAll(/(?:^|\\n)\s*\.(?:model|subckt)\s+(\S+)/gi)].map((m) => m[1].toLowerCase())),
  );
  // Los de library/cmp (la lista de la que se eligen) se incluyen solos, salvo que el
  // esquemático los defina: como LTspice con su standard.bjt, .dio, .jft y .mos
  if (models.cmpFile) {
    for (const e of [...lt.elements, ...lt.blocks.flatMap((b) => b.lt.elements)]) {
      if (!/^[DQMJ]/i.test(e.prefix)) continue;
      const model = e.value.split(/\s/)[0];
      const rel = model && !local.has(model.toLowerCase()) ? models.cmpFile(model) : undefined;
      if (rel && !includes.includes(rel)) out.push(include(rel)!);
    }
    // ".model Dz ako: 1N750 (bv=4.3)": el modelo base también puede estar en library/cmp
    for (const tt of lt.texts) {
      for (const m of tt.text.split('\\n').join('\n').matchAll(/^\s*\.model\s+\S+\s+ako:\s*([^\s(]+)/gim)) {
        const rel = !local.has(m[1].toLowerCase()) ? models.cmpFile(m[1]) : undefined;
        if (rel && !includes.includes(rel)) out.push(include(rel)!);
      }
    }
  }
  if (models.defines) {
    for (const e of lt.elements) {
      if (!/^[DQMJXZ]/i.test(e.prefix)) continue;
      // SpiceModel puede ser el archivo (LTC.lib, como en los símbolos de ADI): el modelo es Value
      const sm = e.attrs.get('SpiceModel');
      const model = e.prefix.toUpperCase() === 'X' && sm && !/\.(lib|sub|mod|inc|cir|txt)$/i.test(sm) ? sm : e.value.split(/\s/)[0];
      const implicit = lt.implicitModels.some((m) => m.split(' ')[1].toLowerCase() === model.toLowerCase());
      // los bloques jerárquicos se escriben como .subckt más abajo
      const block = lt.blocks.some((b) => b.name.toLowerCase() === model.toLowerCase());
      if (!model || implicit || block || local.has(model.toLowerCase())) continue;
      // definido sólo en la librería de LTspice del usuario: se incluye solo, como hace LTspice
      const ltFile = models.ltspiceFile?.(model);
      if (ltFile) {
        const r = include(ltFile);
        if (r && !out.includes(r)) out.push(r);
      } else if (!models.defines(model)) warnings.push(t('{name}: model "{model}" not found', { name: e.name, model }));
    }
  }

  // Bloques jerárquicos: un .subckt por esquemático (sus .model/.param quedan locales)
  for (const b of lt.blocks) {
    out.push(`.subckt ${b.name} ${b.ports.join(' ')}${b.params ? ` params: ${b.params}` : ''}`);
    const inner = new Map<string, string>();
    blockNames.set(b.name.toLowerCase(), inner);
    out.push(...convertElements(b.lt, new Set(), inner, warnings, subcktParams, undefined, false, false, undefined, missingValues));
    for (const tt of b.lt.texts) {
      if (tt.kind !== 'directive') continue;
      for (const raw of tt.text.split('\\n')) {
        const line = raw.trim();
        if (/^\.(model|param|func|subckt|ends|include|inc|lib)\b/i.test(line) || /^[+]/.test(line)) {
          const lib = /^\.(lib|include|inc)\s+("?)([^"]+)\2(?:\s+(\S+))?\s*$/i.exec(line);
          out.push(lib ? (include(lib[3].trim(), lib[1].toLowerCase() === 'lib' ? lib[4] : undefined) ?? `* ${line}`) : translateFunctions(line));
        } else if (/^\./.test(line)) out.push(`* ${line} (dentro del bloque ${b.name}: se ignora)`);
      }
    }
    for (const f of b.lt.modelFiles) {
      const r = include(f);
      if (r) out.push(r);
    }
    out.push(`.ends ${b.name}`);
  }

  out.push('.end');
  return { text: out.join('\n'), includes, names, blockNames, warnings, missingValues, subcktParams, steps: stepRuns, measures, xyPlots, ...(blocksCtl ? { blocks: true } : {}) };
}

/** Parámetros declarados con .param en las directivas del esquemático (en minúsculas) */
function declaredParams(lt: LtNetlist): Set<string> {
  const out = new Set<string>();
  for (const tt of lt.texts) {
    if (tt.kind !== 'directive') continue;
    for (const line of tt.text.split('\\n')) {
      const m = /^\s*\.param\s+(.*)$/i.exec(line);
      if (!m) continue;
      for (const p of m[1].matchAll(/([A-Za-z_]\w*)\s*=/g)) out.add(p[1].toLowerCase());
      const bare = /^([A-Za-z_]\w*)\s+[^=\s]/.exec(m[1]);
      if (bare) out.add(bare[1].toLowerCase());
    }
  }
  return out;
}

// Comando de análisis del testbench (fuera del .control)
const TESTBENCH_ANALYSIS = /^\.(tran|ac|dc|noise|op|tf|sens|pz|disto|sp|pss)\b/i;

/** ¿El cuerpo del .control usa "run" (corre los análisis del testbench)? */
export const controlUsesRun = (lines: string[]) => lines.some((raw) => /^run$/i.test(raw.replace(/;.*$/, '').trim().split(/\s+/)[0] ?? ''));

// Comandos de análisis de ngspice (13.5): en un .control corren ese análisis, no el del testbench
const ANALYSIS_COMMANDS = /^(tran|ac|dc|op|noise|tf|pz|sens|disto|pss|sp)$/i;

/**
 * #197: un .control escrito a mano (sin secciones) decide qué se simula, y puede no ser la
 * configuración de simulación del testbench; un programa de bloques sin "Simular" no simula
 * nada. Se avisa en Problemas.
 */
export function controlRunWarnings(lines: string[], blocks: boolean): string[] {
  let run = false;
  const own: string[] = [];
  for (const raw of lines) {
    const l = raw.replace(/;.*$/, '').trim();
    if (!l || l.startsWith('*')) continue;
    const cmd = l.split(/\s+/)[0];
    if (/^run$/i.test(cmd)) run = true;
    else if (ANALYSIS_COMMANDS.test(cmd) && !own.includes(cmd.toLowerCase())) own.push(cmd.toLowerCase());
  }
  if (blocks) return run || own.length ? [] : [t('The blocks program has no Simulate block: nothing is simulated')];
  const p0 = own.join(', ');
  if (own.length && run) return [t('The .control block runs the simulation configuration and also its own analysis ({p0})', { p0 })];
  // sin "run" es una Complex simulation (#241): su análisis reemplaza al del testbench
  if (own.length) return [];
  if (!run) return [t('The .control block has no "run" or analysis command: nothing is simulated')];
  return [];
}

/** .step → bloque .control (o, si ya hay uno del usuario, sólo el primer valor). Devuelve las corridas. */
function addSteps(steps: Step[], lt: LtNetlist, names: Map<string, string>, out: string[], warnings: string[], hooks?: StepHooks): StepRuns | undefined {
  const declared = declaredParams(lt);
  // alterparam necesita que el parámetro exista: se declara con el primer valor
  for (const s of steps) {
    if (s.target.kind === 'param' && !declared.has(s.target.name.toLowerCase())) {
      out.push(`.param ${s.target.name}=${formatSpiceNumber(s.values[0])}`);
      declared.add(s.target.name.toLowerCase());
    }
  }
  if (!hooks && lt.texts.some((tt) => isControlBlock(tt.text))) {
    warnings.push(t('.step is ignored because the schematic has a .control block (the block decides what to simulate)'));
    return undefined;
  }
  const byName = new Map([...names].map(([k, v]) => [k.toLowerCase(), v]));
  const plan = stepPlan(steps, (n) => byName.get(n.toLowerCase()), hooks);
  if (typeof plan === 'string') {
    warnings.push(`.step: ${plan}`);
    return undefined;
  }
  out.push(...plan.control);
  return { names: plan.names, runs: plan.runs };
}

/**
 * Adapta un archivo de modelos escrito para LTspice a ngspice:
 *  - `.end nombre` cerrando un .subckt → `.ends` (LTspice lo tolera);
 *  - `.param nombre valor` sin "=" → `.param nombre=valor`;
 *  - agrega a los encabezados .subckt los parámetros que las instancias pasan y el archivo
 *    no declara (`.subckt OA_Ideal 1 2 3 4 5` → `... params: avol=1Meg gbwp=10Meg`).
 */
export function patchModelFile(text: string, subcktParams: Map<string, Map<string, string>>): string {
  let depth = 0;
  // las fuentes B con líneas "+" de continuación se unen en una sola
  const all: string[] = [];
  let inB = false;
  for (const l of text.split(/\r\n|\r|\n/)) {
    if (inB && /^\s*\+/.test(l)) all[all.length - 1] += ` ${l.trim().slice(1).trim()}`;
    else {
      all.push(l);
      inB = /^\s*B\S*\s/i.test(l);
    }
  }
  const lines = all.map((line) => {
    // fuentes B: funciones de LTspice que ngspice no tiene (idt, rand, table…); los elementos
    // auxiliares van justo después, en el mismo .subckt
    const bline = translateBLine(line, []);
    if (bline) return bline;
    if (/^\s*\.subckt\b/i.test(line)) depth++;
    else if (/^\s*\.ends\b/i.test(line)) depth = Math.max(0, depth - 1);
    else if (depth > 0 && /^\s*\.end\b/i.test(line)) {
      depth--;
      return line.replace(/\.end\b/i, '.ends');
    }
    return line.replace(/^(\s*\.param\s+)([A-Za-z_]\w*)\s+(?!=)(\S.*)$/i, '$1$2=$3');
  });
  return patchSubckts(lines.join('\n'), subcktParams);
}

function patchSubckts(text: string, subcktParams: Map<string, Map<string, string>>): string {
  if (!subcktParams.size) return text;
  return text.replace(/^([ \t]*\.subckt[ \t]+(\S+)[^\r\n]*)/gim, (header: string, _h: string, name: string) => {
    const wanted = subcktParams.get(name.toLowerCase());
    if (!wanted) return header;
    const declared = new Set(
      [...header.matchAll(/(\w+)\s*=/g)].map((m) => m[1].toLowerCase()),
    );
    const missing = [...wanted].filter(([k]) => !declared.has(k));
    if (!missing.length) return header;
    const list = missing.map(([k, v]) => `${k}=${v}`).join(' ');
    return /\bparams:/i.test(header) ? `${header} ${list}` : `${header} params: ${list}`;
  });
}

export interface PreparedSimulation {
  netlist: string;
  /** archivos a escribir en el FS del motor (ruta relativa → contenido) */
  files: Record<string, string>;
  warnings: string[];
}

/**
 * Último paso antes de simular: adapta los archivos de modelos incluidos (patchModelFile),
 * resuelve los modelos ako: y reemplaza los diodos ideales de LTspice, tanto en esos archivos
 * como en la netlist.
 */
export function prepareSimulation(net: NgspiceNetlist, readFile: (rel: string) => string): PreparedSimulation {
  const warnings = [...net.warnings];
  const files: Record<string, string> = {};
  // (los informativos de LTspice en los .model, como Iave o Vpk, hacen fallar a ngspice)
  // Laplace= en E/G/B de los archivos y de los .subckt escritos como directiva (ver laplace.ts)
  for (const rel of net.includes) files[rel] = replaceLaplaceLines(stripLtspiceInfo(patchModelFile(readFile(rel), net.subcktParams)), warnings);
  // ako: se resuelve con los modelos de todos los archivos y de la netlist
  const models = collectModels(net.text);
  for (const tt of Object.values(files)) collectModels(tt, models);
  const external = new Map();
  for (const rel of net.includes) {
    const a = replaceAko(files[rel], models);
    const r = replaceIdealDiodes(a.text);
    files[rel] = r.text;
    warnings.push(...a.warnings, ...r.warnings);
    for (const [k, v] of r.found) external.set(k, v);
  }
  const lapWarnings: string[] = [];
  const ako = replaceAko(replaceLaplaceLines(stripLtspiceInfo(net.text), lapWarnings), models);
  for (const w of lapWarnings) if (!warnings.includes(w)) warnings.push(w);
  const main = replaceIdealDiodes(ako.text, external);
  warnings.push(...ako.warnings, ...main.warnings);
  // delay() con retardo variable usa dly_tstop (ver expandStateFunctions): el tstop del .tran
  let text = main.text;
  if (/dly_tstop/.test(text) || Object.values(files).some((f) => /dly_tstop/.test(f))) {
    const tstop = /^\.tran\s+\S+\s+(\S+)/im.exec(text)?.[1];
    text = text.replace(/^(\s*\.end\s*)$/im, `.param dly_tstop=${tstop ?? '1'}\n$1`);
  }
  // nodos sin camino de continua a tierra: como LTspice (ver floating.ts)
  return { netlist: fixFloatingNodes(text, files).text, files, warnings };
}
