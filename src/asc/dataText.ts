// Datos de TurboSpice guardados dentro del .asc como comentarios (";.study …", ";.plot …"):
// un JSON en base64, en un texto chico (tamaño 0) que TurboSpice no dibuja ni deja
// seleccionar. LTspice lo muestra como un comentario más y lo ignora al simular.
import type { AscDoc, SchText } from './model.ts';

/**
 * Prefijos de los comentarios con datos (programa de bloques del Estudio, vista de ploteo de la
 * simulación activa y lista de simulaciones, #39)
 */
export const DATA_TAGS = { study: '.study ', plot: '.plot ', sims: '.sims ' } as const;
export type DataTag = keyof typeof DATA_TAGS;

export const isDataTextOf = (t: { kind: string; text: string }, tag: DataTag) => t.kind === 'comment' && t.text.startsWith(DATA_TAGS[tag]);
/** ¿Es un comentario con datos (no se dibuja ni se selecciona)? */
export const isDataText = (t: { kind: string; text: string }) => (Object.keys(DATA_TAGS) as DataTag[]).some((k) => isDataTextOf(t, k));

export function toBase64(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64: string): string {
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** JSON guardado en el documento con ese prefijo; undefined si no hay (o es ilegible) */
export function readData(doc: AscDoc, tag: DataTag): unknown {
  const t = doc.texts.find((x) => isDataTextOf(x, tag));
  if (!t) return undefined;
  try {
    return JSON.parse(fromBase64(t.text.slice(DATA_TAGS[tag].length).trim()));
  } catch {
    return undefined;
  }
}

/** Texto con el JSON (tamaño 0) */
export const dataText = (tag: DataTag, value: unknown, at: { x: number; y: number }): SchText => ({
  x: at.x,
  y: at.y,
  align: 'Left',
  size: 0,
  kind: 'comment',
  text: DATA_TAGS[tag] + toBase64(JSON.stringify(value)),
});

/** Ubicación para textos nuevos: debajo de los existentes (los de datos no cuentan) */
export function belowTexts(doc: AscDoc): { x: number; y: number } {
  const ys = doc.texts.filter((t) => !isDataText(t)).map((t) => t.y + t.text.split('\\n').length * 24);
  return { x: doc.texts[0]?.x ?? 0, y: ys.length ? Math.max(...ys) + 16 : 0 };
}

/**
 * Reemplaza (o agrega, o con `value` undefined saca) el comentario con datos. Si ya estaba,
 * queda en el mismo lugar y con la misma posición en la lista de textos.
 */
export function writeData(doc: AscDoc, tag: DataTag, value: unknown): AscDoc {
  const i = doc.texts.findIndex((x) => isDataTextOf(x, tag));
  if (value === undefined) return i < 0 ? doc : { ...doc, texts: doc.texts.filter((_, k) => k !== i) };
  if (i >= 0) {
    const texts = [...doc.texts];
    texts[i] = dataText(tag, value, texts[i]);
    return placeDataTexts({ ...doc, texts });
  }
  return placeDataTexts({ ...doc, texts: [...doc.texts, dataText(tag, value, { x: 0, y: 0 })] });
}

/**
 * Lleva los comentarios con datos debajo de todo el dibujo, con margen, para que en LTspice (que
 * los muestra como un comentario más) no queden encima del circuito. Uno debajo del otro.
 */
export function placeDataTexts(doc: AscDoc): AscDoc {
  if (!doc.texts.some(isDataText)) return doc;
  const xs: number[] = [];
  const ys: number[] = [];
  const pt = (x: number, y: number) => (xs.push(x), ys.push(y));
  for (const w of doc.wires) pt(w.x1, w.y1), pt(w.x2, w.y2);
  for (const f of doc.flags) pt(f.x, f.y + 32);
  // el cuerpo de un símbolo se extiende desde su origen (hasta ~128 unidades según la orientación)
  for (const s of doc.symbols) pt(s.x - 64, s.y + 144);
  for (const sh of doc.shapes) for (let i = 0; i + 1 < sh.coords.length; i += 2) pt(sh.coords[i], sh.coords[i + 1]);
  for (const t of doc.texts) if (!isDataText(t)) pt(t.x, t.y + t.text.split('\\n').length * 24 * Math.max(1, t.size / 2));
  const x = xs.length ? Math.min(...xs) : 0;
  let y = ys.length ? Math.max(...ys) + 160 : 0;
  let changed = false;
  const texts = doc.texts.map((t) => {
    if (!isDataText(t)) return t;
    const at = { x, y };
    y += 32;
    if (t.x === at.x && t.y === at.y) return t;
    changed = true;
    return { ...t, ...at };
  });
  return changed ? { ...doc, texts } : doc;
}

/** ¿Mismo circuito salvo los comentarios con datos? (cambiar la vista no invalida la simulación) */
export function sameExceptData(a: AscDoc, b: AscDoc): boolean {
  if (a === b) return true;
  if (a.symbols !== b.symbols || a.wires !== b.wires || a.flags !== b.flags || a.dataFlags !== b.dataFlags || a.shapes !== b.shapes) return false;
  const ta = a.texts.filter((t) => !isDataText(t));
  const tb = b.texts.filter((t) => !isDataText(t));
  return ta.length === tb.length && ta.every((t, i) => t === tb[i]);
}
