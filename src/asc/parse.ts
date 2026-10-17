// Parser de .asc (esquemático) y .asy (símbolo) de LTspice.
import {
  emptyDoc,
  ORIENTS,
  type AscDoc,
  type Orient,
  type PinDef,
  type Shape,
  type ShapeKind,
  type SymbolDef,
  type SymbolInst,
  type TextWindow,
} from './model.ts';

const SHAPES = new Set<ShapeKind>(['LINE', 'RECTANGLE', 'CIRCLE', 'ARC']);

const splitLines = (text: string) => text.split(/\r\n|\r|\n/);

/** Separa los primeros `n` campos por espacios; el último elemento es el resto de la línea */
function fields(line: string, n: number): string[] {
  const out: string[] = [];
  let rest = line.replace(/^\s+/, '');
  for (let i = 0; i < n; i++) {
    const m = /^(\S+)\s?/.exec(rest);
    if (!m) break;
    out.push(m[1]);
    rest = rest.slice(m[0].length);
  }
  out.push(rest);
  return out;
}

const num = (s: string) => {
  const v = Number(s);
  if (!Number.isFinite(v)) throw new Error(`número inválido: ${s}`);
  return v;
};

function parseWindow(parts: string[]): [number, TextWindow] {
  // WINDOW idx x y align size
  return [num(parts[1]), { x: num(parts[2]), y: num(parts[3]), align: parts[4], size: parts[5] ? num(parts[5]) : 2 }];
}

function parseShape(kind: ShapeKind, line: string): Shape {
  // KIND Normal x1 y1 x2 y2 [... ARC: xs ys xe ye] [style]
  const toks = line.trim().split(/\s+/).slice(2);
  const n = kind === 'ARC' ? 8 : 4;
  const shape: Shape = { kind, coords: toks.slice(0, n).map(num) };
  if (toks.length > n) shape.style = toks.slice(n).join(' ');
  return shape;
}

/** Atributo SYMATTR: el valor es el resto de la línea; `""` literal = vacío explícito */
function attrValue(raw: string): string {
  return raw === '""' ? '' : raw;
}

export function parseAsc(text: string): AscDoc {
  const doc = emptyDoc();
  let sym: SymbolInst | null = null;

  for (const line of splitLines(text)) {
    if (!line.trim()) continue;
    const kw = line.trim().split(/\s/, 1)[0];
    if (kw !== 'WINDOW' && kw !== 'SYMATTR') sym = null;

    switch (kw) {
      case 'Version':
        doc.version = fields(line, 1)[1].trim();
        break;
      case 'SHEET': {
        const [, n, w, h] = line.trim().split(/\s+/);
        doc.sheet = { n: num(n), w: num(w), h: num(h) };
        break;
      }
      case 'WIRE': {
        const [, x1, y1, x2, y2] = line.trim().split(/\s+/);
        doc.wires.push({ x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2) });
        break;
      }
      case 'FLAG': {
        const [, x, y, name] = fields(line, 3);
        doc.flags.push({ x: num(x), y: num(y), name: name.trim() });
        break;
      }
      case 'IOPIN': {
        const [, x, y, dir] = fields(line, 3);
        const flag = doc.flags.findLast((f) => f.x === num(x) && f.y === num(y));
        if (flag) flag.ioPin = dir.trim();
        else doc.unknown.push(line);
        break;
      }
      case 'DATAFLAG': {
        const [, x, y, expr] = fields(line, 3);
        doc.dataFlags.push({ x: num(x), y: num(y), expr: attrValue(expr.trim()) });
        break;
      }
      case 'SYMBOL': {
        // El tipo puede tener espacios escapados ("74HCU04\\ Not"): x, y y orientación
        // se toman desde el final de la línea
        const parts = line.trim().split(/\s+/);
        const [x, y, orient] = parts.slice(-3);
        const type = line.trim().slice('SYMBOL'.length).trim().split(/\s+/).slice(0, -3).join(' ');
        if (!ORIENTS.includes(orient as Orient)) throw new Error(`orientación inválida: ${line}`);
        sym = { type, x: num(x), y: num(y), orient: orient as Orient, windows: new Map(), attrs: new Map() };
        doc.symbols.push(sym);
        break;
      }
      case 'WINDOW': {
        if (!sym) {
          doc.unknown.push(line);
          break;
        }
        const [idx, w] = parseWindow(line.trim().split(/\s+/));
        sym.windows.set(idx, w);
        break;
      }
      case 'SYMATTR': {
        if (!sym) {
          doc.unknown.push(line);
          break;
        }
        const [, key, value] = fields(line, 2);
        sym.attrs.set(key, attrValue(value));
        break;
      }
      case 'TEXT': {
        // TEXT x y align size ;comentario  |  !directiva
        const [, x, y, align, size, rest] = fields(line, 5);
        const kind = rest.startsWith('!') ? 'directive' : 'comment';
        doc.texts.push({ x: num(x), y: num(y), align, size: num(size), kind, text: rest.replace(/^[!;]/, '') });
        break;
      }
      default:
        if (SHAPES.has(kw as ShapeKind)) doc.shapes.push(parseShape(kw as ShapeKind, line));
        else doc.unknown.push(line);
    }
  }
  return doc;
}

export function parseAsy(text: string, name: string): SymbolDef {
  const def: SymbolDef = {
    name,
    version: '4',
    symbolType: 'CELL',
    shapes: [],
    texts: [],
    windows: new Map(),
    attrs: new Map(),
    pins: [],
  };
  let pin: PinDef | null = null;

  for (const line of splitLines(text)) {
    if (!line.trim()) continue;
    const kw = line.trim().split(/\s/, 1)[0];
    switch (kw) {
      case 'Version':
        def.version = fields(line, 1)[1].trim();
        break;
      case 'SymbolType':
        def.symbolType = fields(line, 1)[1].trim();
        break;
      case 'WINDOW': {
        const [idx, w] = parseWindow(line.trim().split(/\s+/));
        def.windows.set(idx, w);
        break;
      }
      case 'SYMATTR': {
        const [, key, value] = fields(line, 2);
        def.attrs.set(key, attrValue(value));
        break;
      }
      case 'TEXT': {
        // En .asy no hay prefijo ";": el texto empieza tras el tamaño
        const [, x, y, align, size, rest] = fields(line, 5);
        def.texts.push({ x: num(x), y: num(y), align, size: num(size), text: rest });
        break;
      }
      case 'PIN': {
        const [, x, y, align, offset] = line.trim().split(/\s+/);
        pin = { x: num(x), y: num(y), align, offset: num(offset ?? '0'), attrs: new Map() };
        def.pins.push(pin);
        break;
      }
      case 'PINATTR': {
        const [, key, value] = fields(line, 2);
        pin?.attrs.set(key, value);
        break;
      }
      default:
        if (SHAPES.has(kw as ShapeKind)) def.shapes.push(parseShape(kw as ShapeKind, line));
    }
  }
  return def;
}
