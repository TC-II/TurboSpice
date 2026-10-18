// Modelo de datos de esquemáticos (.asc) y símbolos (.asy) de LTspice.
// Replica el formato de archivo: coordenadas en unidades de LTspice (grilla de 16),
// orientaciones R/M y ventanas de texto. Ver docs/asc-format.md.

export type Orient = 'R0' | 'R90' | 'R180' | 'R270' | 'M0' | 'M90' | 'M180' | 'M270';
export const ORIENTS: readonly Orient[] = ['R0', 'R90', 'R180', 'R270', 'M0', 'M90', 'M180', 'M270'];

/** Grilla de LTspice: los puntos de conexión caen en múltiplos de 16 */
export const GRID = 16;

/** Índices de WINDOW → atributo que muestran */
export const WINDOW_ATTR: Record<number, string> = {
  0: 'InstName',
  3: 'Value',
  38: 'SpiceModel',
  39: 'SpiceLine',
  40: 'SpiceLine2',
  123: 'Value2',
};

export interface Point {
  x: number;
  y: number;
}

export interface TextWindow {
  x: number;
  y: number;
  /** Left, Right, Center, Top, Bottom, VLeft…VBottom, o Invisible */
  align: string;
  size: number;
}

export interface Wire {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Flag {
  x: number;
  y: number;
  /** "0" = tierra */
  name: string;
  /** Línea IOPIN asociada (puerto de jerarquía): In, Out, BiDir */
  ioPin?: string;
}

export type FlagDir = 'top' | 'bottom' | 'left' | 'right';

export interface DataFlag {
  x: number;
  y: number;
  expr: string;
}

export interface SymbolInst {
  /** Como figura en el archivo, p.ej. "res" o "TCLib\\OA_param2" */
  type: string;
  x: number;
  y: number;
  orient: Orient;
  windows: Map<number, TextWindow>;
  /** SYMATTR en orden de aparición. Un valor vacío ("") es explícito y gana al .asy */
  attrs: Map<string, string>;
}

export interface SchText {
  x: number;
  y: number;
  align: string;
  size: number;
  /** "!" directiva SPICE, ";" comentario */
  kind: 'directive' | 'comment';
  /** Contenido; los saltos de línea se guardan como "\n" literal en el archivo */
  text: string;
}

export type ShapeKind = 'LINE' | 'RECTANGLE' | 'CIRCLE' | 'ARC';

export interface Shape {
  kind: ShapeKind;
  /** LINE/RECTANGLE/CIRCLE: x1 y1 x2 y2. ARC: x1 y1 x2 y2 xs ys xe ye */
  coords: number[];
  /** Estilo de línea opcional (1 = guiones, 2 = puntos, …) */
  style?: string;
}

export interface AscDoc {
  version: string;
  sheet: { n: number; w: number; h: number };
  wires: Wire[];
  flags: Flag[];
  dataFlags: DataFlag[];
  symbols: SymbolInst[];
  texts: SchText[];
  shapes: Shape[];
  /** Líneas no reconocidas (p.ej. BUSTAP), preservadas para no perderlas al guardar */
  unknown: string[];
}

export interface PinDef {
  x: number;
  y: number;
  align: string;
  /** Offset del rótulo tal como está en el archivo (LTspice lo guarda al doble) */
  offset: number;
  attrs: Map<string, string>;
}

export interface SymText {
  x: number;
  y: number;
  align: string;
  size: number;
  text: string;
}

export interface SymbolDef {
  /** Nombre base (sin ruta ni extensión), p.ej. "OA_param2" */
  name: string;
  version: string;
  symbolType: string;
  shapes: Shape[];
  texts: SymText[];
  windows: Map<number, TextWindow>;
  attrs: Map<string, string>;
  pins: PinDef[];
}

export function emptyDoc(): AscDoc {
  return {
    version: '4',
    sheet: { n: 1, w: 880, h: 680 },
    wires: [],
    flags: [],
    dataFlags: [],
    symbols: [],
    texts: [],
    shapes: [],
    unknown: [],
  };
}

/**
 * Nombre base de un tipo de símbolo: "TCLib\\\\OA_param2" → "OA_param2".
 * En el archivo las rutas usan "\\\\" y los espacios se escapan como "\\ ".
 */
export function baseName(type: string): string {
  return symbolPath(type).split('/').pop()!.replace(/\.asy$/i, '');
}

/** Ruta del símbolo normalizada con "/": "TCLib\\\\Special\\\\74HCU04\\ Not" → "TCLib/Special/74HCU04 Not" */
export function symbolPath(type: string): string {
  return type
    .replace(/\\ /g, ' ')
    .split(/\\+|\//)
    .filter(Boolean)
    .join('/');
}
