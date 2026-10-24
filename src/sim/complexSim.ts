// Complex simulation (#241): el Studio o un bloque .control escrito a mano como tipo de simulación
// propio, al lado de Transient, AC, DC…
//
// Un testbench es Complex cuando tiene un bloque .control activo que decide qué se simula (uno
// común o un programa de bloques del Studio). Los .control con marcas de sección (antes/después
// de cada corrida) no cuentan: se combinan con el análisis y los barridos del testbench.
//
// Al pasar a un análisis simple el .control no se pierde: se guarda en un comentario con datos
// (";.ctloff …", asc/dataText.ts) que no se dibuja ni se ejecuta, y vuelve al elegir otra vez
// Complex simulation. El comando de análisis (".tran …") queda en el esquemático en los dos
// modos: es el que corre LTspice, que no entiende .control.
import { DATA_TAGS, isDataTextOf, readData, writeData } from '../asc/dataText.ts';
import type { AscDoc, SchText } from '../asc/model.ts';
import { controlHooks } from '../netlist/directives.ts';
import { findAnalysis, findControl } from '../schematic/directivesEdit.ts';

/** "Línea" de la simulación de un testbench Complex (en la lista y en las etiquetas) */
export const COMPLEX_LINE = '.control';

export const isComplexLine = (line: string) => line === COMPLEX_LINE;

/** Cuerpo de un bloque .control guardado en el texto (sin .control/.endc) */
const body = (tt: SchText) => tt.text.split('\\n').slice(1, -1);

/** ¿El .control decide qué se simula (no es un bloque con marcas de sección)? */
export const decidesSimulation = (tt: SchText) => !controlHooks(body(tt));

/** ¿El testbench es una Complex simulation? */
export function isComplex(doc: AscDoc): boolean {
  const i = findControl(doc);
  return i >= 0 && decidesSimulation(doc.texts[i]);
}

/** Comando de la simulación del testbench: COMPLEX_LINE, el de análisis, o '' si no hay */
export const simLine = (doc: AscDoc): string => (isComplex(doc) ? COMPLEX_LINE : (findAnalysis(doc)?.value ?? ''));

/** Texto del bloque .control activo, con sus saltos de línea ('' si no hay) */
export function controlText(doc: AscDoc): string {
  const i = findControl(doc);
  return i < 0 ? '' : doc.texts[i].text.split('\\n').join('\n');
}

/** ¿Hay un .control guardado (el testbench pasó a un análisis simple)? */
export const hasParkedControl = (doc: AscDoc) => doc.texts.some((tt) => isDataTextOf(tt, 'ctloff'));

const validText = (v: unknown): v is SchText => {
  const tt = v as SchText;
  return !!tt && typeof tt.text === 'string' && typeof tt.x === 'number' && typeof tt.y === 'number';
};

/**
 * Pasa el testbench a un análisis simple: el .control que decide la simulación sale del
 * esquemático y se guarda en el comentario con datos. Sin .control así, queda igual.
 */
export function parkControl(doc: AscDoc): AscDoc {
  if (!isComplex(doc)) return doc;
  const i = findControl(doc);
  const tt = doc.texts[i];
  return writeData({ ...doc, texts: doc.texts.filter((_, k) => k !== i) }, 'ctloff', tt);
}

/**
 * Vuelve a Complex simulation con el .control guardado (en su lugar de antes). Si no había
 * ninguno guardado (o ya es Complex), queda igual.
 */
export function unparkControl(doc: AscDoc): AscDoc {
  if (!hasParkedControl(doc)) return doc;
  const v = readData(doc, 'ctloff');
  const out = writeData(doc, 'ctloff', undefined);
  if (!validText(v) || isComplex(out)) return out;
  return { ...out, texts: [...out.texts, { ...v, align: v.align ?? 'Left', size: v.size ?? 2, kind: v.kind === 'directive' ? 'directive' : 'comment' }] };
}

/** Prefijo del comentario con el .control guardado (para documentación y tests) */
export const PARKED_TAG = DATA_TAGS.ctloff;
