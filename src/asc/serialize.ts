// Serializa un AscDoc al formato .asc de LTspice. Escribe exactamente lo que hay en el
// modelo; para el guardado "todo explícito" primero se pasa por makeExplicit (resolve.ts).
import type { AscDoc, Shape, ShapeKind, TextWindow } from './model.ts';

// Orden en que LTspice escribe los gráficos del esquemático
const SHAPE_ORDER: ShapeKind[] = ['IMAGE', 'LINE', 'RECTANGLE', 'CIRCLE', 'ARC', 'PATH'];

const attrOut = (v: string) => (v === '' ? '""' : v);

export function windowLine(idx: number, w: TextWindow): string {
  return `WINDOW ${idx} ${w.x} ${w.y} ${w.align} ${w.size}`;
}

export function shapeLine(s: Shape): string {
  if (s.kind === 'IMAGE') return ['IMAGE', 'Normal', ...s.coords, s.data ?? ''].join(' ');
  const count = s.kind === 'PATH' ? [s.coords.length / 2] : [];
  return [s.kind, 'Normal', ...count, ...s.coords, ...(s.style ? [s.style] : [])].join(' ');
}

export function serializeAsc(doc: AscDoc): string {
  const out: string[] = [`Version ${doc.version}`, `SHEET ${doc.sheet.n} ${doc.sheet.w} ${doc.sheet.h}`];
  for (const w of doc.wires) out.push(`WIRE ${w.x1} ${w.y1} ${w.x2} ${w.y2}`);
  for (const f of doc.flags) {
    out.push(`FLAG ${f.x} ${f.y} ${f.name}`);
    if (f.ioPin) out.push(`IOPIN ${f.x} ${f.y} ${f.ioPin}`);
  }
  for (const d of doc.dataFlags) out.push(`DATAFLAG ${d.x} ${d.y} ${attrOut(d.expr)}`);
  for (const s of doc.symbols) {
    out.push(`SYMBOL ${s.type} ${s.x} ${s.y} ${s.orient}`);
    for (const [idx, w] of s.windows) out.push(windowLine(idx, w));
    for (const [k, v] of s.attrs) out.push(`SYMATTR ${k} ${attrOut(v)}`);
  }
  for (const t of doc.texts) {
    out.push(`TEXT ${t.x} ${t.y} ${t.align} ${t.size} ${t.kind === 'directive' ? '!' : ';'}${t.text}`);
    if (t.box) out.push(`TEXTBOX ${t.box.w} ${t.box.h}`);
  }
  const shapes = [...doc.shapes].sort((a, b) => SHAPE_ORDER.indexOf(a.kind) - SHAPE_ORDER.indexOf(b.kind));
  for (const s of shapes) out.push(shapeLine(s));
  out.push(...doc.unknown);
  return out.join('\r\n') + '\r\n';
}
