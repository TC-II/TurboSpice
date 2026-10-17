// Netlist estilo LTspice → netlist para ngspice, con todo lo implícito de LTspice escrito
// de forma explícita:
//  - inductores: 1 mΩ en serie si no se indica Rser (medido en LTspice: 1 V sobre 1 H → 1000 A);
//  - Rser/Lser/Rpar/Cpar de L, C y V se expanden en elementos reales (ngspice no los tiene);
//  - .model implícitos (D, NPN, NMOS…) y nombres de elemento con "§";
//  - ".lib archivo" (sin sección) → ".include", y rutas resueltas contra la librería;
//  - ".tran tstop" → ".tran paso tstop" (ngspice exige el paso).
import { isNgspiceComment } from './directives.ts';
import { replaceIdealDiodes } from './idealdiode.ts';
import type { Element, LtNetlist } from './ltnetlist.ts';
import { formatSpiceNumber, parseSpiceNumber } from './spicenum.ts';

/** Resistencia serie que LTspice agrega a todo inductor sin Rser */
export const LTSPICE_INDUCTOR_RSER = '1m';

export interface ModelResolver {
  /** Resuelve una ruta de .lib/.include/ModelFile a un archivo de la librería (ruta relativa) */
  resolve(path: string): string | undefined;
  /** ¿Algún archivo resuelto o directiva define este modelo/subcircuito? */
  defines?(name: string): boolean;
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
  const tokens = value.match(/(?:[^\s({]+|\([^)]*\)|\{[^}]*\})+/g) ?? [];
  for (const t of tokens) {
    const m = /^([A-Za-z_]\w*)=(.+)$/.exec(t);
    if (m) {
      params.set(m[1].toLowerCase(), m[2]);
      order.push(m[1]);
    } else main.push(t);
  }
  return { main: main.join(' '), params, order };
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
  if (parseSpiceNumber(nums[0]) === 0 && Number.isFinite(tstop)) nums[0] = formatSpiceNumber(tstop / 1000);
  return ['.tran', ...nums, ...flags.filter((f) => /^uic$/i.test(f))].join(' ');
}

const DROP_DIRECTIVES = /^\.(backanno|wave|save\s+none|loadbias|savebias)\b/i;

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
    out.push(...expandElement(name, letter, e.nodes, e.value, warnings));
  }

  out.push(...lt.implicitModels);

  for (const t of lt.texts) {
    // Comentarios que son directivas de ngspice (.control, .pz…): se ejecutan
    const comment = t.kind === 'comment' && !isNgspiceComment(t.text);
    for (const raw of t.text.split('\\n')) {
      if (comment) {
        out.push(`* ${raw}`);
        continue;
      }
      const line = raw.trim();
      if (!line) continue;
      if (DROP_DIRECTIVES.test(line)) continue;
      if (/^\.step\b/i.test(line)) {
        // Hasta soportar .step: se simula el primer valor del barrido
        warnings.push('.step todavía no está soportado: se simula sólo el primer valor');
        out.push(`* ${line}`);
        const p = /^\.step\s+(?:(?:lin|oct|dec)\s+)?param\s+(\S+)\s+(?:list\s+)?(\S+)/i.exec(line);
        if (p) out.push(`.param ${p[1]}=${p[2]}`);
        continue;
      }
      const lib = /^\.(lib|include|inc)\s+("?)([^"]+)\2(?:\s+(\S+))?\s*$/i.exec(line);
      if (lib) {
        const isLib = lib[1].toLowerCase() === 'lib';
        const r = include(lib[3].trim(), isLib ? lib[4] : undefined);
        out.push(r ?? `* ${line}`);
        continue;
      }
      out.push(fixTran(line, warnings));
    }
  }

  for (const f of lt.modelFiles) {
    const r = include(f);
    if (r) out.push(r);
  }

  // Modelos referenciados que no aparecen definidos en ningún lado
  const local = new Set(
    lt.texts
      .filter((t) => t.kind === 'directive')
      .flatMap((t) => [...t.text.matchAll(/(?:^|\\n)\s*\.(?:model|subckt)\s+(\S+)/gi)].map((m) => m[1].toLowerCase())),
  );
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

  out.push('.end');
  return { text: out.join('\n'), includes, names, warnings, subcktParams };
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
 * Último paso antes de simular: adapta los archivos de modelos incluidos (patchModelFile) y
 * reemplaza los diodos ideales de LTspice, tanto en esos archivos como en la netlist.
 */
export function prepareSimulation(net: NgspiceNetlist, readFile: (rel: string) => string): PreparedSimulation {
  const warnings = [...net.warnings];
  const files: Record<string, string> = {};
  const external = new Map();
  for (const rel of net.includes) {
    const r = replaceIdealDiodes(patchModelFile(readFile(rel), net.subcktParams));
    files[rel] = r.text;
    warnings.push(...r.warnings);
    for (const [k, v] of r.found) external.set(k, v);
  }
  const main = replaceIdealDiodes(net.text, external);
  warnings.push(...main.warnings);
  return { netlist: main.text, files, warnings };
}
