// Valores efectivos de una instancia de símbolo (lo que LTspice muestra y usa) y
// conversión de un documento a "todo explícito" para guardarlo.
import { baseName, type AscDoc, type Orient, type SymbolDef, type SymbolInst, type TextWindow } from './model.ts';

/** { símbolo en minúsculas: { orientación: { idx: [x, y, align, size] } } } (coordenadas del símbolo) */
export type WindowTable = Record<string, Record<string, Record<string, [number, number, string, number]>>>;

/** Posiciones por defecto de los rótulos */
export interface WindowDefaults {
  /** las que pone LTspice al rotar (R90/R180/R270, derivadas de su corpus) */
  ltspice: WindowTable;
  /**
   * las óptimas de ASC-Parser (engine/component_defaults.js, #74), en R0…R270: ganan a las de
   * LTspice en los símbolos que tienen (M* usa la fila de su R*, y el espejo hace el resto)
   */
  preferred: WindowTable;
}

export interface SymbolSource {
  symbol(type: string): SymbolDef | undefined;
  windowDefaults: WindowDefaults;
  /** Esquemático de un bloque jerárquico (mismo nombre que su símbolo BLOCK), si existe */
  schematic?(name: string): AscDoc | undefined;
}

/** Atributos que afectan la netlist: siempre se escriben explícitos, en este orden */
export const NETLIST_ATTRS = [
  'InstName',
  'Value',
  'Value2',
  'SpiceModel',
  'SpiceLine',
  'SpiceLine2',
  'Prefix',
  'ModelFile',
  'Def_Sub',
] as const;

const win = ([x, y, align, size]: [number, number, string, number]): TextWindow => ({ x, y, align, size });

/**
 * Posiciones de rótulos que LTspice usa para un símbolo recién orientado (sin WINDOW en el
 * .asc). En R0/M0 son las del .asy; al rotar, LTspice usa posiciones propias por símbolo
 * (tabla derivada del corpus). Para R180 sin dato, LTspice intercambia las ventanas 0 y 3.
 */
export function ltspiceWindows(def: SymbolDef, orient: Orient, table: WindowDefaults): Map<number, TextWindow> {
  const out = new Map<number, TextWindow>();
  for (const [i, w] of def.windows) out.set(i, { ...w });
  if (orient === 'R0' || orient === 'M0') return out;

  const t = table.ltspice[def.name.toLowerCase()]?.[`R${orient.slice(1)}`];
  if (!t) return out;
  for (const [i, w] of Object.entries(t)) out.set(Number(i), win(w));

  const w0 = def.windows.get(0);
  const w3 = def.windows.get(3);
  if (orient.endsWith('180') && w0 && w3) {
    if (!t[0] && t[3]) out.set(0, { ...w0, x: w3.x, y: w3.y });
    if (!t[3] && t[0]) out.set(3, { ...w3, x: w0.x, y: w0.y });
  }
  return out;
}

/** Fila de posiciones óptimas (ASC-Parser) de un símbolo para una orientación, si tiene */
function preferredRow(def: SymbolDef, orient: Orient, table: WindowDefaults) {
  const t = table.preferred[def.name.toLowerCase()];
  return t && (t[orient] ?? t[`R${orient.slice(1)}`] ?? t.R0);
}

/**
 * Posiciones por defecto de los rótulos en TurboSpice: las óptimas de ASC-Parser para los
 * símbolos que las tienen (#74); las de LTspice para el resto (y para los índices que la tabla
 * no nombra).
 */
export function defaultWindows(def: SymbolDef, orient: Orient, table: WindowDefaults): Map<number, TextWindow> {
  const out = ltspiceWindows(def, orient, table);
  const row = preferredRow(def, orient, table);
  if (row) for (const [i, w] of Object.entries(row)) out.set(Number(i), win(w));
  return out;
}

/**
 * Una WINDOW del .asc que es la que LTspice pone sola (archivo guardado por LTspice, sin mover
 * el rótulo): no cuenta como movida a mano, así que va la posición óptima. Devuelve la ventana
 * que corresponde, o null si la WINDOW es propia (movida, otro tamaño…) y se respeta.
 */
export function ltspiceDefaultAs(w: TextWindow, lt: TextWindow | undefined, pref: TextWindow | undefined): TextWindow | null {
  if (!lt || !pref || w.x !== lt.x || w.y !== lt.y || w.size !== lt.size) return null;
  if (w.align === lt.align) return { ...pref };
  // oculto en su lugar de siempre: sigue oculto
  if (w.align === 'Invisible') return { ...pref, align: 'Invisible' };
  return null;
}

/** Ventanas efectivas: las del .asc ganan; el resto, las por defecto para la orientación */
export function effectiveWindows(inst: SymbolInst, def: SymbolDef | undefined, table: WindowDefaults) {
  const out = def ? defaultWindows(def, inst.orient, table) : new Map<number, TextWindow>();
  const lt = def && preferredRow(def, inst.orient, table) ? ltspiceWindows(def, inst.orient, table) : undefined;
  for (const [i, w] of inst.windows) out.set(i, (lt && ltspiceDefaultAs(w, lt.get(i), out.get(i))) || { ...w });
  return out;
}

/** Atributos efectivos: los del .asc ganan (aunque estén vacíos); el resto, los del .asy */
export function effectiveAttrs(inst: SymbolInst, def: SymbolDef | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (def) for (const [k, v] of def.attrs) if (k !== 'Description') out.set(k, v);
  for (const [k, v] of inst.attrs) out.set(k, v);
  return out;
}

function explicitSymbol(inst: SymbolInst, def: SymbolDef, table: WindowDefaults): SymbolInst {
  const eff = effectiveWindows(inst, def, table);
  // Primero las ventanas que ya tenía la instancia (en su orden), después las demás por índice
  const order = [...inst.windows.keys(), ...[...eff.keys()].filter((i) => !inst.windows.has(i)).sort((a, b) => a - b)];
  const windows = new Map(order.map((i) => [i, eff.get(i)!]));

  const attrsEff = effectiveAttrs(inst, def);
  const attrs = new Map<string, string>();
  for (const k of NETLIST_ATTRS) if (attrsEff.has(k)) attrs.set(k, attrsEff.get(k)!);
  for (const [k, v] of inst.attrs) if (!attrs.has(k)) attrs.set(k, v);
  return { ...inst, windows, attrs };
}

export interface ExplicitResult {
  doc: AscDoc;
  /** Tipos de símbolo que no se encontraron en la librería (quedan como estaban) */
  missing: string[];
}

/**
 * Copia del documento con todo lo que LTspice deja implícito escrito en cada instancia:
 * WINDOW de todos los rótulos con su posición efectiva y SYMATTR de los atributos que
 * afectan la netlist con su valor efectivo.
 */
export function makeExplicit(doc: AscDoc, lib: SymbolSource): ExplicitResult {
  const missing = new Set<string>();
  const symbols = doc.symbols.map((s) => {
    const def = lib.symbol(s.type);
    if (!def) {
      missing.add(baseName(s.type));
      return s;
    }
    return explicitSymbol(s, def, lib.windowDefaults);
  });
  return { doc: { ...doc, symbols }, missing: [...missing] };
}
