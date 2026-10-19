// Librería de símbolos, skins y subcircuitos. Se construye con scripts/build-library.mjs
// en un único bundle JSON que la app descarga una vez.
import { parseAsc, parseAsy } from '../asc/parse.ts';
import { baseName, symbolPath, type AscDoc, type SymbolDef } from '../asc/model.ts';
import type { SymbolSource, WindowDefaults } from '../asc/resolve.ts';
import { parseCmp, type CmpKind, type CmpPart } from './cmp.ts';

export interface LibraryBundle {
  /** ruta relativa a library/sym sin extensión (p.ej. "TCLib/OA_param2") → texto .asy */
  symbols: Record<string, string>;
  /** nombre base → contenido SVG ya normalizado (sin <style>, colores en currentColor) */
  skins: Record<string, { viewBox: string; body: string }>;
  windowDefaults: WindowDefaults;
  /** ruta relativa a library/sub (p.ej. "TCLib/Black_Box.lib") → definiciones */
  subs: Record<string, { subckts: string[]; models: string[] }>;
  /** library/cmp: archivo (standard.bjt…) → texto; las listas de las que se elige un valor */
  cmp?: Record<string, string>;
}

/** Carpeta, dentro de los archivos de modelos, de los .model de library/cmp */
export const CMP_DIR = 'cmp/';

/** Prefijo de las rutas de archivos de modelos del usuario en el FS del motor */
export const USER_PREFIX = 'user/';
/** Carpeta con que se muestran los símbolos del usuario en el buscador */
export const USER_DIR = 'Mis símbolos';

/** Nombres de .subckt y .model definidos en un archivo de modelos */
export function scanModels(text: string): { subckts: string[]; models: string[] } {
  const subckts: string[] = [];
  const models: string[] = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    const m = /^\s*\.(subckt|model)\s+(\S+)/i.exec(line);
    if (m) (m[1].toLowerCase() === 'subckt' ? subckts : models).push(m[2]);
  }
  return { subckts, models };
}

export class Library implements SymbolSource {
  readonly windowDefaults: WindowDefaults;
  private byPath = new Map<string, string>();
  private byName = new Map<string, string>();
  private cache = new Map<string, SymbolDef>();
  private cmpCache = new Map<CmpKind, CmpPart[]>();
  /** Símbolos agregados por el usuario o importados de su LTspice (ganan a los del bundle) */
  private extra = new Map<string, string>();
  /** Archivos de modelos del usuario: nombre de archivo (minúsculas) → texto */
  private userModels = new Map<string, { name: string; text: string; subckts: string[]; models: string[] }>();
  /** Esquemáticos del usuario usados como bloques jerárquicos: nombre sin .asc (minúsculas) → texto */
  private userSchematics = new Map<string, { name: string; text: string }>();
  private schCache = new Map<string, AscDoc>();

  readonly bundle: LibraryBundle;

  constructor(bundle: LibraryBundle) {
    this.bundle = bundle;
    this.windowDefaults = bundle.windowDefaults;
    for (const path of Object.keys(bundle.symbols)) {
      this.byPath.set(path.toLowerCase(), path);
      const name = baseName(path).toLowerCase();
      if (!this.byName.has(name)) this.byName.set(name, path);
    }
  }

  /** Busca como LTspice: por ruta relativa a lib/sym y, si no, por nombre base (sin mayúsculas) */
  private resolvePath(type: string): string | undefined {
    const path = symbolPath(type).toLowerCase();
    return this.byPath.get(path) ?? this.byName.get(baseName(type).toLowerCase());
  }

  symbol(type: string): SymbolDef | undefined {
    const name = baseName(type).toLowerCase();
    const extra = this.extra.get(name);
    const path = extra ? `extra:${name}` : this.resolvePath(type);
    if (!path) return undefined;
    let def = this.cache.get(path);
    if (!def) {
      def = parseAsy(extra ?? this.bundle.symbols[path], baseName(type));
      this.cache.set(path, def);
    }
    return def;
  }

  addSymbol(name: string, asyText: string): void {
    this.extra.set(name.toLowerCase(), asyText);
    this.cache.delete(`extra:${name.toLowerCase()}`);
  }

  removeSymbol(name: string): void {
    this.extra.delete(name.toLowerCase());
    this.cache.delete(`extra:${name.toLowerCase()}`);
  }

  /** Nombres de los símbolos del usuario */
  userSymbols(): string[] {
    return [...this.extra.keys()];
  }

  /** Archivo de modelos del usuario (.lib, .sub, .mod…): se resuelve antes que los de la librería */
  addModelFile(name: string, text: string): void {
    this.userModels.set(name.toLowerCase(), { name, text, ...scanModels(text) });
  }

  removeModelFile(name: string): void {
    this.userModels.delete(name.toLowerCase());
  }

  /** Esquemático del usuario que hace de bloque jerárquico (X.asc para el símbolo X) */
  addSchematic(name: string, text: string): void {
    const key = name.replace(/\.asc$/i, '').toLowerCase();
    this.userSchematics.set(key, { name, text });
    this.schCache.delete(key);
  }

  removeSchematic(name: string): void {
    const key = name.replace(/\.asc$/i, '').toLowerCase();
    this.userSchematics.delete(key);
    this.schCache.delete(key);
  }

  schematic(name: string): AscDoc | undefined {
    const key = baseName(name).replace(/\.asc$/i, '').toLowerCase();
    const f = this.userSchematics.get(key);
    if (!f) return undefined;
    let doc = this.schCache.get(key);
    if (!doc) this.schCache.set(key, (doc = parseAsc(f.text)));
    return doc;
  }

  /** Archivos de modelos del usuario (para el diálogo y para crear símbolos de sus .subckt) */
  userModelFiles(): { name: string; text: string; subckts: string[]; models: string[] }[] {
    return [...this.userModels.values()];
  }

  /** Contenido de un archivo de modelos del usuario resuelto con resolveModelFile ("user/x.lib") */
  userFile(rel: string): string | undefined {
    return rel.startsWith(USER_PREFIX) ? this.userModels.get(rel.slice(USER_PREFIX.length).toLowerCase())?.text : undefined;
  }

  skin(type: string) {
    const name = baseName(type);
    return this.bundle.skins[name] ?? this.bundle.skins[name.toLowerCase()];
  }

  /**
   * Resuelve una ruta de .lib/.include/ModelFile (posiblemente absoluta de Windows, p.ej.
   * "C:\\...\\lib\\sub\\TCLib\\OA_param.lib") a un archivo de library/sub.
   */
  resolveModelFile(path: string): string | undefined {
    const norm = path.replace(/\\/g, '/').replace(/^"|"$/g, '');
    const lower = norm.toLowerCase();
    // los archivos del usuario ganan (como los que están junto al .asc en LTspice)
    const user = this.userModels.get(lower.split('/').pop()!);
    if (user) return USER_PREFIX + user.name.toLowerCase();
    const files = Object.keys(this.bundle.subs);
    const exact = files.find((f) => lower === f.toLowerCase() || lower.endsWith(`/${f.toLowerCase()}`));
    if (exact) return exact;
    const base = lower.split('/').pop();
    return files.find((f) => f.toLowerCase().split('/').pop() === base);
  }

  /** ¿Algún archivo de modelos de la librería define este .model/.subckt? */
  definesModel(name: string): boolean {
    const n = name.toLowerCase();
    return [...Object.values(this.bundle.subs), ...this.userModels.values()].some(
      (s) => s.subckts.some((x) => x.toLowerCase() === n) || s.models.some((x) => x.toLowerCase() === n),
    );
  }

  /** Componentes de library/cmp de un tipo (la lista de la que se elige el valor) */
  parts(kind: CmpKind): CmpPart[] {
    let p = this.cmpCache.get(kind);
    if (!p) {
      p = Object.entries(this.bundle.cmp ?? {}).flatMap(([file, text]) => parseCmp(file, text)).filter((x) => x.kind === kind);
      this.cmpCache.set(kind, p);
    }
    return p;
  }

  /** Archivo de library/cmp que define este .model (como la standard.bjt que incluye LTspice) */
  cmpFileDefining(name: string): string | undefined {
    const n = name.toLowerCase();
    return Object.entries(this.bundle.subs).find(([f, s]) => f.startsWith(CMP_DIR) && s.models.some((m) => m.toLowerCase() === n))?.[0];
  }

  /** Todas las rutas de símbolos, para el buscador (F2) */
  symbolPaths(): string[] {
    const user = [...this.extra.keys()].map((n) => `${USER_DIR}/${n}`);
    return [...user, ...Object.keys(this.bundle.symbols).sort((a, b) => a.localeCompare(b))];
  }
}
