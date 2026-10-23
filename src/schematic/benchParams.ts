// Parámetros y variables de un testbench (#180): los .param de sus directivas (editables) y los
// que barre un .step (variables, se editan en el Estudio).
import type { AscDoc } from '../asc/model.ts';
import { formatParamList, parseParamList } from '../project/symbolEdit.ts';

const lines = (text: string) => text.split('\\n');
const isParam = (l: string) => /^\s*\.param\b/i.test(l);

/** .param del esquemático, en orden (el último valor gana, como en SPICE) */
export function benchParams(doc: AscDoc): [string, string][] {
  const out = new Map<string, [string, string]>();
  for (const tt of doc.texts) {
    if (tt.kind !== 'directive') continue;
    for (const l of lines(tt.text)) if (isParam(l)) for (const [k, v] of parseParamList(l.replace(/^\s*\.param\s*/i, ''))) out.set(k.toLowerCase(), [k, v]);
  }
  return [...out.values()];
}

/** Parámetros barridos con .step param (las «variables» del testbench) */
export function benchVariables(doc: AscDoc): { name: string; line: string }[] {
  const out: { name: string; line: string }[] = [];
  for (const tt of doc.texts) {
    if (tt.kind !== 'directive') continue;
    for (const l of lines(tt.text)) {
      const m = /^\s*\.step\s+(?:param\s+)?([A-Za-z_]\w*)\b/i.exec(l);
      if (m && !/^(oct|dec|lin|list|temp)$/i.test(m[1])) out.push({ name: m[1], line: l.trim() });
    }
  }
  return out;
}

/**
 * Reemplaza los .param: se quitan las líneas .param de todas las directivas y quedan en una sola
 * («.param a=1 b=2»), en el lugar de la primera (o abajo del circuito si no había)
 */
export function setBenchParams(doc: AscDoc, ps: [string, string][]): AscDoc {
  let at: { x: number; y: number } | null = null;
  const texts = doc.texts.flatMap((tt) => {
    if (tt.kind !== 'directive' || !lines(tt.text).some(isParam)) return [tt];
    at ??= { x: tt.x, y: tt.y };
    const rest = lines(tt.text).filter((l) => !isParam(l));
    return rest.some((l) => l.trim()) ? [{ ...tt, text: rest.join('\\n') }] : [];
  });
  if (ps.length) {
    const ys = [...doc.symbols.map((s) => s.y), ...doc.texts.map((x) => x.y), ...doc.wires.flatMap((w) => [w.y1, w.y2]), 0];
    const xs = [...doc.symbols.map((s) => s.x), ...doc.wires.flatMap((w) => [w.x1, w.x2]), 0];
    const pos = at ?? { x: Math.min(...xs), y: Math.max(...ys) + 64 };
    texts.push({ ...pos, align: 'Left', size: 2, kind: 'directive', text: `.param ${formatParamList(ps)}` });
  }
  return { ...doc, texts };
}
