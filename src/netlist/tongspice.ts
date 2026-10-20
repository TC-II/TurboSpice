// Netlist estilo LTspice → netlist para ngspice, con todo lo implícito de LTspice escrito
// de forma explícita:
//  - inductores: 1 mΩ en serie si no se indica Rser (medido en LTspice: 1 V sobre 1 H → 1000 A);
//  - Rser/Lser/Rpar/Cpar de L, C y V se expanden en elementos reales (ngspice no los tiene);
//  - .model implícitos (D, NPN, NMOS…) y nombres de elemento con "§";
//  - ".lib archivo" (sin sección) → ".include", y rutas resueltas contra la librería;
//  - ".tran tstop" → ".tran paso tstop" (ngspice exige el paso);
//  - ".step" → bucles en un bloque .control (step.ts).
import { controlHooks, isControlBlock, isNgspiceComment } from './directives.ts';
import { collectModels, replaceAko } from './ako.ts';
import { replaceIdealDiodes } from './idealdiode.ts';
import { stripLtspiceInfo } from '../library/cmp.ts';
import type { Element, LtNetlist } from './ltnetlist.ts';
import { formatSpiceNumber, parseSpiceNumber } from './spicenum.ts';
import { parseStep, stepPlan, type Step, type StepHooks, type StepRuns } from './step.ts';

/** Resistencia serie que LTspice agrega a todo inductor sin Rser */
export const LTSPICE_INDUCTOR_RSER = '1m';

export interface ModelResolver {
  /** Resuelve una ruta de .lib/.include/ModelFile a un archivo de la librería (ruta relativa) */
  resolve(path: string): string | undefined;
  /** ¿Algún archivo resuelto o directiva define este modelo/subcircuito? */
  defines?(name: string): boolean;
  /** Archivo de library/cmp que define este .model (se incluye solo, como la standard.bjt de LTspice) */
  cmpFile?(name: string): string | undefined;
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
  /** con .step: las corridas en orden de ejecución */
  steps?: StepRuns;
  /** líneas .meas (las evalúa TurboSpice sobre los resultados; en la netlist van comentadas) */
  measures: string[];
  /** gráficos x-y de un programa de bloques (puntos en el log: "TS-XY id x y") */
  xyPlots: { id: number; x: string; y: string }[];
  warnings: string[];
}

// Parámetros de L/C/V que ngspice no conoce y se expanden en elementos
const PARASITICS: Record<string, string[]> = {
  L: ['rser', 'rpar', 'cpar'],
  C: ['rser', 'lser', 'rpar', 'cpar'],
  V: ['rser', 'cpar'],
};

/** Separa "10m Rser=2 Cpar=1p" en valor principal y parámetros key=value */
function splitParams(value: string): { main: string; params: Map<string, string>; order: string[] } {
  const params = new Map<string, string>();
  const order: string[] = [];
  const main: string[] = [];
  // tokens respetando paréntesis y llaves: "SINE(0 1 1k)" o "{a*2}" son un solo token
  // LTspice acepta espacios alrededor del "=" ("K = 1"); no toca ==, >=, <=, !=
  const tokens = value.replace(/([A-Za-z_]\w*)\s*=\s*(?=[^=\s])/g, '$1=').match(/(?:[^\s({]+|\([^)]*\)|\{[^}]*\})+/g) ?? [];
  for (const t of tokens) {
    const m = /^([A-Za-z_]\w*)=(.+)$/.exec(t);
    if (m) {
      params.set(m[1].toLowerCase(), m[2]);
      order.push(m[1]);
    } else main.push(t);
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
  const kinds = PARASITICS[letter];
  if (!kinds) return [[name, ...nodes, value].filter(Boolean).join(' ')];
  const { main, params, order } = splitParams(value);
  if (letter === 'L' && !params.has('rser')) params.set('rser', LTSPICE_INDUCTOR_RSER);
  const p = (k: string) => {
    const v = params.get(k);
    return v !== undefined && parseSpiceNumber(v) !== 0 ? v : undefined;
  };
  const rest = order.filter((k) => !kinds.includes(k.toLowerCase())).map((k) => `${k}=${params.get(k.toLowerCase())}`);

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
    if (k.toLowerCase() === 'ipk' || k.toLowerCase() === 'rlshunt') warnings.push(`${name}: ${k} no se soporta en ngspice y se ignora`);
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

// Funciones de LTspice que el numparam de ngspice no conoce (en las fuentes B sí andan)
const LT_FUNCTIONS: Record<string, (a: string[]) => string | null> = {
  u: ([x, ...r]) => (r.length ? null : `((${x}) > 0 ? 1 : 0)`),
  uramp: ([x, ...r]) => (r.length ? null : `max((${x}), 0)`),
  buf: ([x, ...r]) => (r.length ? null : `((${x}) > 0.5 ? 1 : 0)`),
  inv: ([x, ...r]) => (r.length ? null : `((${x}) > 0.5 ? 0 : 1)`),
  // al entero más cercano, las mitades lejos del cero (nint de ngspice redondea al par)
  round: ([x, ...r]) => (r.length ? null : `(sgn(${x})*floor(abs(${x})+0.5))`),
  hypot: ([x, y, ...r]) => (y === undefined || r.length ? null : `sqrt(pow(${x},2)+pow(${y},2))`),
};
const LT_FUNCTION_RE = new RegExp(`\\b(${Object.keys(LT_FUNCTIONS).join('|')})\\s*\\(`, 'gi');

// Las fuentes B de ngspice ya tienen u() y uramp(); éstas no
const B_FUNCTION_RE = /\b(buf|inv|round|hypot)\s*\(/gi;

/** Reescribe en una expresión las llamadas a funciones de LTspice que ngspice no tiene */
function translateExpression(text: string, fnRe: RegExp = LT_FUNCTION_RE): string {
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
    const args = splitArgs(translateExpression(text.slice(start, k - 1), fnRe));
    const rep = LT_FUNCTIONS[m[1].toLowerCase()](args);
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
 * ".param K=(a) / (b) c=1": LTspice acepta espacios dentro de la expresión; numparam la corta en
 * el primer espacio (y en silencio da otro valor, p.ej. "K=1 + 2" → 1). Cada valor con espacios
 * va entre llaves.
 */
function fixParam(line: string): string {
  const m = /^(\.param\s+)(.*)$/i.exec(line);
  if (!m || !m[2].includes('=')) return line;
  const parts = m[2].split(/\s+(?=[A-Za-z_]\w*\s*=(?!=))/).map((p) => {
    const a = /^([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/.exec(p);
    if (!a || !/\s/.test(a[2]) || /^\{.*\}$/.test(a[2])) return p;
    return `${a[1]}={${a[2]}}`;
  });
  return m[1] + parts.join(' ');
}

/** ".tran tstop" o ".tran 0 tstop ..." → ".tran paso tstop ..." (ngspice exige paso > 0) */
function fixTran(line: string, warnings: string[]): string {
  const m = /^\.tran\s+(.*)$/i.exec(line.trim());
  if (!m) return line;
  const args = m[1].split(/\s+/);
  const flags = args.filter((a) => /^[a-z]/i.test(a) && !/^\{/.test(a));
  const nums = args.filter((a) => !flags.includes(a));
  const unsupported = flags.filter((f) => !/^uic$/i.test(f));
  if (unsupported.length) warnings.push(`.tran: opciones de LTspice ignoradas (${unsupported.join(', ')})`);
  if (nums.length === 1) nums.unshift('0');
  const tstop = parseSpiceNumber(nums[1]);
  if (parseSpiceNumber(nums[0]) === 0) {
    if (Number.isFinite(tstop)) nums[0] = formatSpiceNumber(tstop / 1000);
    // ".tran 0 {6/fz}": el paso también como expresión
    else if (/^\{.*\}$/.test(nums[1] ?? '')) nums[0] = `{(${nums[1].slice(1, -1)})/1000}`;
  }
  return ['.tran', ...nums, ...flags.filter((f) => /^uic$/i.test(f))].join(' ');
}

const DROP_DIRECTIVES = /^\.(backanno|wave|save\s+none|loadbias|savebias)\b/i;

/** Líneas de ngspice de los elementos de una netlist (con los parásitos expandidos) */
function convertElements(
  lt: LtNetlist,
  used: Set<string>,
  names: Map<string, string>,
  warnings: string[],
  subcktParams: Map<string, Map<string, string>>,
): string[] {
  const out: string[] = [];
  for (const e of lt.elements) {
    const name = ngspiceName(e, used);
    names.set(e.name, name);
    const letter = name[0].toUpperCase();
    // Valor por defecto del símbolo sin cambiar ("R", "C", "L"…): falta asignarlo.
    // (En D, Q, M y J el valor por defecto es un modelo implícito válido.)
    if (/^[RCLVIEFGHB]$/.test(letter) && (e.value === '' || e.value.toUpperCase() === letter)) {
      warnings.push(`${e.name} no tiene valor asignado`);
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
    const value = letter === 'B' ? translateExpression(e.value.replace(/([A-Za-z_]\w*)\s+\(/g, '$1('), B_FUNCTION_RE) : e.value;
    out.push(...expandElement(name, letter, e.nodes, sourceSyntax(letter, translateFunctions(translateRandom(value))), warnings));
  }

  return out;
}

export function toNgspice(lt: LtNetlist, title: string, models: ModelResolver): NgspiceNetlist {
  const warnings = [...lt.warnings];
  const names = new Map<string, string>();
  const used = new Set<string>();
  const includes: string[] = [];
  const subcktParams = new Map<string, Map<string, string>>();
  const out: string[] = [
    `* ${title}`,
    // Constante predefinida en las expresiones de LTspice que ngspice no tiene en .param
    '.param pi=3.141592653589793',
  ];

  const include = (path: string, section?: string): string | null => {
    const rel = models.resolve(path);
    if (!rel) {
      warnings.push(`No se encontró el archivo de modelos "${path}"`);
      return null;
    }
    if (!includes.includes(rel)) includes.push(rel);
    return section ? `.lib ${rel} ${section}` : `.include ${rel}`;
  };

  out.push(...convertElements(lt, used, names, warnings, subcktParams));
  const implicit = [...lt.implicitModels];
  for (const b of lt.blocks) for (const m of b.lt.implicitModels) if (!implicit.includes(m)) implicit.push(m);
  out.push(...implicit);

  const steps: Step[] = [];
  const measures: string[] = [];
  // .control con marcas de sección: se combina con los barridos en lugar de reemplazarlos
  const ctl = lt.texts.find((t) => isControlBlock(t.text));
  const hooks = ctl ? controlHooks(ctl.text.split('\\n').slice(1, -1)) : null;
  // .control generado por bloques: "run" corre cada análisis y recuerda su plot, y cada
  // "meas" se hace sobre el plot de su análisis (después de "run" el actual es el último)
  const xyPlots: NgspiceNetlist['xyPlots'] = [];
  const blocksCtl = ctl && ctl.text.split('\\n').some((l) => l.trim() === '* bloques') ? ctl : undefined;
  if (blocksCtl) {
    const analyses = lt.texts
      .filter((t) => (t.kind === 'directive' || isNgspiceComment(t.text)) && !isControlBlock(t.text))
      .flatMap((t) => t.text.split('\\n'))
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
          body.push(`${indent}${fixTran(a, warnings).slice(1)}`, `${indent}set ts_plot_${kind} = $curplot`);
        }
      } else if (/^meas\s+(\w+)/i.test(l)) {
        body.push(`${indent}setplot $ts_plot_${/^meas\s+(\w+)/i.exec(l)![1].toLowerCase()}`, raw);
      } else body.push(raw);
    }
    out.push('.control', ...body, '.endc');
  }
  for (const t of lt.texts) {
    if (hooks && t === ctl) continue;
    if (blocksCtl && t === blocksCtl) continue;
    // Comentarios que son directivas de ngspice (.control, .pz…): se ejecutan
    const comment = t.kind === 'comment' && !isNgspiceComment(t.text);
    for (const raw of t.text.split('\\n')) {
      if (comment) {
        out.push(`* ${raw}`);
        continue;
      }
      // en LTspice ";" empieza un comentario también a mitad de línea
      const line = raw.replace(/\s*;.*$/, '').trim();
      if (!line) continue;
      if (DROP_DIRECTIVES.test(line)) continue;
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
      // ".param x 20" (LTspice lo acepta sin "=") → ".param x=20"
      out.push(fixParam(translateFunctions(translateRandom(fixTran(line, warnings))).replace(/^(\.param\s+)([A-Za-z_]\w*)\s+(?!=)(\S.*)$/i, '$1$2=$3')));
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
      .filter((t) => t.kind === 'directive')
      .flatMap((t) => [...t.text.matchAll(/(?:^|\\n)\s*\.(?:model|subckt)\s+(\S+)/gi)].map((m) => m[1].toLowerCase())),
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
  }
  if (models.defines) {
    for (const e of lt.elements) {
      if (!/^[DQMJXZ]/i.test(e.prefix)) continue;
      const model = e.prefix.toUpperCase() === 'X' ? (e.attrs.get('SpiceModel') || e.value.split(' ')[0]) : e.value.split(/\s/)[0];
      const implicit = lt.implicitModels.some((m) => m.split(' ')[1].toLowerCase() === model.toLowerCase());
      if (model && !implicit && !local.has(model.toLowerCase()) && !models.defines(model)) {
        warnings.push(`${e.name}: no se encontró el modelo "${model}"`);
      }
    }
  }

  // Bloques jerárquicos: un .subckt por esquemático (sus .model/.param quedan locales)
  for (const b of lt.blocks) {
    out.push(`.subckt ${b.name} ${b.ports.join(' ')}`);
    out.push(...convertElements(b.lt, new Set(), new Map(), warnings, subcktParams));
    for (const t of b.lt.texts) {
      if (t.kind !== 'directive') continue;
      for (const raw of t.text.split('\\n')) {
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
  return { text: out.join('\n'), includes, names, warnings, subcktParams, steps: stepRuns, measures, xyPlots };
}

/** Parámetros declarados con .param en las directivas del esquemático (en minúsculas) */
function declaredParams(lt: LtNetlist): Set<string> {
  const out = new Set<string>();
  for (const t of lt.texts) {
    if (t.kind !== 'directive') continue;
    for (const line of t.text.split('\\n')) {
      const m = /^\s*\.param\s+(.*)$/i.exec(line);
      if (!m) continue;
      for (const p of m[1].matchAll(/([A-Za-z_]\w*)\s*=/g)) out.add(p[1].toLowerCase());
      const bare = /^([A-Za-z_]\w*)\s+[^=\s]/.exec(m[1]);
      if (bare) out.add(bare[1].toLowerCase());
    }
  }
  return out;
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
  if (!hooks && lt.texts.some((t) => isControlBlock(t.text))) {
    warnings.push('.step se ignora porque el esquemático tiene un bloque .control (el bloque decide qué simular)');
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
  const lines = text.split(/\r\n|\r|\n/).map((line) => {
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
  for (const rel of net.includes) files[rel] = stripLtspiceInfo(patchModelFile(readFile(rel), net.subcktParams));
  // ako: se resuelve con los modelos de todos los archivos y de la netlist
  const models = collectModels(net.text);
  for (const t of Object.values(files)) collectModels(t, models);
  const external = new Map();
  for (const rel of net.includes) {
    const a = replaceAko(files[rel], models);
    const r = replaceIdealDiodes(a.text);
    files[rel] = r.text;
    warnings.push(...a.warnings, ...r.warnings);
    for (const [k, v] of r.found) external.set(k, v);
  }
  const ako = replaceAko(stripLtspiceInfo(net.text), models);
  const main = replaceIdealDiodes(ako.text, external);
  warnings.push(...ako.warnings, ...main.warnings);
  return { netlist: main.text, files, warnings };
}
