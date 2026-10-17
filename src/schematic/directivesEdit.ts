// Ubicar y reemplazar en el esquemático el comando de análisis y el bloque .control.
import type { AscDoc, SchText } from '../asc/model.ts';
import { isControlBlock, isNgspiceComment } from '../netlist/directives.ts';
import { ANALYSIS_LINE } from '../sim/analyses.ts';

export interface FoundLine {
  text: number;
  line: number;
  value: string;
}

const lines = (t: SchText) => t.text.split('\\n');
/** ¿El texto se ejecuta? (directiva, o comentario que es directiva de ngspice) */
const active = (t: SchText) => t.kind === 'directive' || isNgspiceComment(t.text);

/** Primer comando de análisis activo del esquemático */
export function findAnalysis(doc: AscDoc): FoundLine | null {
  for (let i = 0; i < doc.texts.length; i++) {
    const t = doc.texts[i];
    if (!active(t) || isControlBlock(t.text)) continue;
    const ls = lines(t);
    const j = ls.findIndex((l) => ANALYSIS_LINE.test(l));
    if (j >= 0) return { text: i, line: j, value: ls[j].trim() };
  }
  return null;
}

/** Índice del texto con el bloque .control, o -1 */
export function findControl(doc: AscDoc): number {
  return doc.texts.findIndex((t) => active(t) && isControlBlock(t.text));
}

/**
 * Reemplaza el comando de análisis encontrado por `line`. Si el texto tenía sólo esa línea
 * se reemplaza entero (cambiando directiva ↔ comentario según `ngspiceOnly`); si tenía más
 * líneas y cambia el tipo, la línea se saca de ahí y se agrega un texto nuevo debajo.
 */
export function replaceAnalysis(doc: AscDoc, found: FoundLine, line: string, ngspiceOnly: boolean): AscDoc {
  const kind = ngspiceOnly ? 'comment' : 'directive';
  const t = doc.texts[found.text];
  const ls = lines(t);
  const texts = [...doc.texts];
  if (ls.length === 1) {
    texts[found.text] = { ...t, text: line, kind };
  } else if (t.kind === kind) {
    ls[found.line] = line;
    texts[found.text] = { ...t, text: ls.join('\\n') };
  } else {
    ls.splice(found.line, 1);
    texts[found.text] = { ...t, text: ls.join('\\n') };
    texts.push({ ...t, y: t.y + 32 * (ls.length + 1), text: line, kind });
  }
  return { ...doc, texts };
}
