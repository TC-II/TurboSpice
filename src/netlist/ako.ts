import { t } from '../i18n/i18n.ts';
// Modelos "a kind of" de LTspice: `.model TIP32Cm ako:TIP32C (Bf=20)` hereda los parámetros
// de TIP32C y cambia Bf. ngspice no lo tiene: se reemplaza por un .model completo.

export interface ModelDef {
  type: string;
  /** parámetros en orden; las claves en minúsculas para comparar */
  params: [string, string][];
}

/** Une las líneas de continuación ("+ …") a la anterior, conservando el índice de origen */
function logicalLines(text: string): { line: string; from: number; to: number }[] {
  const raw = text.split(/\r\n|\r|\n/);
  const out: { line: string; from: number; to: number }[] = [];
  raw.forEach((l, i) => {
    if (/^\s*\+/.test(l) && out.length) {
      const last = out[out.length - 1];
      last.line += ' ' + l.replace(/^\s*\+/, '');
      last.to = i;
    } else out.push({ line: l, from: i, to: i });
  });
  return out;
}

const PARAM = /([A-Za-z_][\w.]*)\s*=\s*(\{[^}]*\}|'[^']*'|[^\s,()=]+)/g;

function parseParams(s: string): [string, string][] {
  return [...s.matchAll(PARAM)].map((m) => [m[1], m[2]]);
}

const MODEL = /^\s*\.model\s+(\S+)\s+(.*)$/i;
/** "ako:BASE [TIPO] [(]params[)]" → base, tipo (si está) y parámetros */
function parseAko(s: string): { base: string; type?: string; params: [string, string][] } | null {
  const m = /^ako:\s*([^\s(]+)\s*(.*)$/i.exec(s);
  if (!m) return null;
  // el tipo es una palabra que no es "clave=" (".model X ako:Y BF=10" no tiene tipo)
  const tt = /^([A-Za-z]\w*)(?=\s*\(|\s*$|\s+[^=\s])/.exec(m[2]);
  return { base: m[1], type: tt?.[1], params: parseParams(tt ? m[2].slice(tt[0].length) : m[2]) };
}

/** Modelos definidos en un texto (sin los ako:) */
export function collectModels(text: string, into = new Map<string, ModelDef>()): Map<string, ModelDef> {
  for (const { line } of logicalLines(text)) {
    const m = MODEL.exec(line);
    if (!m || /^ako:/i.test(m[2].trim())) continue;
    const tt = /^([A-Za-z]\w*)\s*(.*)$/.exec(m[2].trim());
    if (!tt) continue;
    if (!into.has(m[1].toLowerCase())) into.set(m[1].toLowerCase(), { type: tt[1], params: parseParams(tt[2]) });
  }
  return into;
}

/** Combina parámetros: los de `over` reemplazan a los de `base` con la misma clave */
function merge(base: [string, string][], over: [string, string][]): [string, string][] {
  const keys = new Set(over.map(([k]) => k.toLowerCase()));
  return [...base.filter(([k]) => !keys.has(k.toLowerCase())), ...over];
}

/**
 * Reemplaza los .model ako: de `text` por modelos completos usando `known` (modelos de la
 * netlist y de los archivos incluidos). Los que no se pueden resolver se comentan y avisan.
 */
export function replaceAko(text: string, known: Map<string, ModelDef>): { text: string; warnings: string[]; defined: Map<string, ModelDef> } {
  const warnings: string[] = [];
  const defined = new Map<string, ModelDef>();
  const lines = logicalLines(text);
  if (!lines.some((l) => /^\s*\.model\s+\S+\s+ako:/i.test(l.line))) return { text, warnings, defined };
  // ako locales (pueden encadenarse entre sí)
  const local = new Map<string, { base: string; type?: string; params: [string, string][] }>();
  for (const { line } of lines) {
    const m = MODEL.exec(line);
    const a = m && parseAko(m[2].trim());
    if (m && a) local.set(m[1].toLowerCase(), a);
  }
  const resolve = (name: string, seen: Set<string>): ModelDef | null => {
    const k = name.toLowerCase();
    if (known.has(k)) return known.get(k)!;
    const a = local.get(k);
    if (!a || seen.has(k)) return null;
    seen.add(k);
    const base = resolve(a.base, seen);
    return base ? { type: a.type ?? base.type, params: merge(base.params, a.params) } : null;
  };
  const out: string[] = [];
  const raw = text.split(/\r\n|\r|\n/);
  for (const l of lines) {
    const m = MODEL.exec(l.line);
    const a = m && parseAko(m[2].trim());
    if (!m || !a) {
      out.push(...raw.slice(l.from, l.to + 1));
      continue;
    }
    const def = resolve(m[1], new Set());
    if (def) {
      defined.set(m[1].toLowerCase(), def);
      out.push(`* ${l.line.trim()}`, `.model ${m[1]} ${def.type}(${def.params.map(([k, v]) => `${k}=${v}`).join(' ')})`);
    } else {
      warnings.push(t('{p0}: base model {base} not found (ako:)', { p0: m[1], base: a.base }));
      out.push(`* ${l.line.trim()}`);
    }
  }
  return { text: out.join('\n'), warnings, defined };
}
