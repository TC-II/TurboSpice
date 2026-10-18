// Ubicar y reemplazar en el esquemático el comando de análisis y el bloque .control.
import type { AscDoc, SchText } from '../asc/model.ts';
import { isControlBlock, isNgspiceComment } from '../netlist/directives.ts';
import { isDataText } from '../asc/dataText.ts';
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

/** Saca el comando de análisis (y su texto, si no tenía otras líneas) */
export function removeAnalysis(doc: AscDoc): AscDoc {
  const found = findAnalysis(doc);
  if (!found) return doc;
  const t = doc.texts[found.text];
  const ls = lines(t);
  if (ls.length === 1) return { ...doc, texts: doc.texts.filter((_, i) => i !== found.text) };
  ls.splice(found.line, 1);
  return { ...doc, texts: doc.texts.map((x, i) => (i === found.text ? { ...t, text: ls.join('\\n') } : x)) };
}

/**
 * Pone `line` como comando de análisis del esquemático: reemplaza el que haya o, si no hay
 * ninguno, agrega un texto debajo de los demás. Los análisis de ngspice van como comentario.
 */
export function setAnalysisLine(doc: AscDoc, line: string): AscDoc {
  const found = findAnalysis(doc);
  if (found?.value === line) return doc;
  const ngspiceOnly = isNgspiceComment(line);
  if (found) return replaceAnalysis(doc, found, line, ngspiceOnly);
  // en un lugar fijo: debajo de todo lo dibujado (circuito y textos), alineado a la izquierda
  const shown = doc.texts.filter((t) => !isDataText(t));
  const bottoms = [
    ...shown.map((t) => t.y + lines(t).length * 24),
    ...doc.wires.flatMap((w) => [w.y1, w.y2]),
    ...doc.flags.map((f) => f.y + 32),
    ...doc.symbols.map((s) => s.y + 112),
  ];
  const lefts = [...shown.map((t) => t.x), ...doc.wires.flatMap((w) => [w.x1, w.x2]), ...doc.symbols.map((s) => s.x)];
  const y = bottoms.length ? Math.max(...bottoms) + 32 : 0;
  const x = shown[0]?.x ?? (lefts.length ? Math.min(...lefts) : 0);
  const text: SchText = { x, y, align: 'Left', size: 2, kind: ngspiceOnly ? 'comment' : 'directive', text: line };
  return { ...doc, texts: [...doc.texts, text] };
}
