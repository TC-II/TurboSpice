// Cambios entre dos versiones de un circuito (#153): qué componentes se agregaron, quitaron o
// modificaron (por InstName), qué cables cambiaron (por segmento) y un resumen de una línea,
// "+C3, −R2, R1 1k→2k2". Se usa en el historial de corridas: cada una contra la anterior.
import type { AscDoc, SymbolInst, Wire } from '../asc/model.ts';
import { isDataText, readData } from '../asc/dataText.ts';
import { t } from '../i18n/i18n.ts';

export type Mark = 'added' | 'changed';

export interface CircuitDiff {
  /** índice del componente en el documento nuevo → agregado o modificado */
  symbols: Map<number, Mark>;
  /** índice del cable en el documento nuevo → agregado */
  wires: Map<number, Mark>;
  /** índice de la etiqueta en el documento nuevo → agregada o renombrada */
  flags: Map<number, Mark>;
  /** índice del texto en el documento nuevo → agregado o modificado */
  texts: Map<number, Mark>;
  /** lo que estaba antes y ya no está (se dibuja como fantasma) */
  removed: { symbols: SymbolInst[]; wires: Wire[] };
  summary: string;
  /** no cambió nada visible */
  same: boolean;
}

const instOf = (s: SymbolInst, i: number) => (s.attrs.get('InstName') ?? `#${i}`).toLowerCase();
const wireKey = (w: Wire) => {
  const a = `${w.x1},${w.y1}`;
  const b = `${w.x2},${w.y2}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
};
const attrsKey = (s: SymbolInst) => [...s.attrs].filter(([k]) => k !== 'InstName').map(([k, v]) => `${k}=${v}`).sort().join('\n');

/** Multiconjunto: claves de `b` que no están en `a` (con sus índices) */
function extra<T>(a: T[], b: T[], key: (x: T) => string): number[] {
  const count = new Map<string, number>();
  for (const x of a) count.set(key(x), (count.get(key(x)) ?? 0) + 1);
  const out: number[] = [];
  b.forEach((x, i) => {
    const k = key(x);
    const n = count.get(k) ?? 0;
    if (n > 0) count.set(k, n - 1);
    else out.push(i);
  });
  return out;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function diffCircuits(prev: AscDoc, next: AscDoc): CircuitDiff {
  const symbols = new Map<number, Mark>();
  const parts: string[] = [];
  const before = new Map(prev.symbols.map((s, i) => [instOf(s, i), s]));
  const after = new Set(next.symbols.map(instOf));
  const added: string[] = [];
  const changed: string[] = [];
  next.symbols.forEach((s, i) => {
    const name = s.attrs.get('InstName') ?? s.type;
    const old = before.get(instOf(s, i));
    if (!old) {
      symbols.set(i, 'added');
      added.push(`+${name}`);
      return;
    }
    const v0 = old.attrs.get('Value');
    const v1 = s.attrs.get('Value');
    if (old.type !== s.type) changed.push(`${name} → ${s.type.split(/[\\/]/).pop()}`);
    else if (v0 !== v1 && v0 !== undefined && v1 !== undefined) changed.push(`${name} ${v0}→${v1}`);
    else if (attrsKey(old) !== attrsKey(s)) changed.push(t('{name} modified', { name }));
    else if (old.x !== s.x || old.y !== s.y || old.orient !== s.orient) changed.push(t('{name} moved', { name }));
    else return;
    symbols.set(i, 'changed');
  });
  const removedSyms = prev.symbols.filter((s, i) => !after.has(instOf(s, i)));
  parts.push(...added, ...removedSyms.map((s) => `−${s.attrs.get('InstName') ?? s.type}`), ...changed);

  const wiresAdded = extra(prev.wires, next.wires, wireKey);
  const wiresRemoved = extra(next.wires, prev.wires, wireKey).map((i) => prev.wires[i]);
  const wires = new Map<number, Mark>(wiresAdded.map((i) => [i, 'added']));
  if (wiresAdded.length) parts.push(`+${plural(wiresAdded.length, t('wire'), t('wires'))}`);
  if (wiresRemoved.length) parts.push(`−${plural(wiresRemoved.length, t('wire'), t('wires'))}`);

  const flagKey = (f: AscDoc['flags'][number]) => `${f.x},${f.y},${f.name}`;
  const flagsAdded = extra(prev.flags, next.flags, flagKey);
  const flagsRemoved = extra(next.flags, prev.flags, flagKey).length;
  const flags = new Map<number, Mark>(flagsAdded.map((i) => [i, 'added']));
  if (flagsAdded.length || flagsRemoved) parts.push(t('labels'));

  // directivas y comentarios visibles (los datos ";.plot", ";.study"… no cuentan)
  const shown = (d: AscDoc) => d.texts.filter((tt) => !isDataText(tt));
  const textKey = (tt: AscDoc['texts'][number]) => `${tt.kind}:${tt.text}`;
  const textsAdded = extra(shown(prev), shown(next), textKey);
  const textsRemoved = extra(shown(next), shown(prev), textKey).length;
  const nextShown = shown(next);
  const texts = new Map<number, Mark>(textsAdded.map((i) => [next.texts.indexOf(nextShown[i]), 'changed']));
  if (textsAdded.length || textsRemoved) parts.push(nextShown.some((tt, i) => textsAdded.includes(i) && tt.kind === 'directive') || textsRemoved ? t('directives') : t('texts'));

  // la esquina del PDK (;.pdk, elegida en la barra de simulación) sí cambia el circuito
  const cornerOf = (d: AscDoc) => (readData(d, 'pdk') as { corner?: string } | undefined)?.corner ?? 'tt';
  if (cornerOf(prev) !== cornerOf(next)) parts.push(t('corner {c}', { c: cornerOf(next) }));

  const same = !parts.length;
  return { symbols, wires, flags, texts, removed: { symbols: removedSyms, wires: wiresRemoved }, summary: same ? t('no changes') : parts.join(', '), same };
}
