// Librería de símbolos, skins y subcircuitos. Se construye con scripts/build-library.mjs
// en un único bundle JSON que la app descarga una vez.
import { parseAsc, parseAsy } from '../asc/parse.ts';
import { baseName, symbolPath, type AscDoc, type SymbolDef } from '../asc/model.ts';
import type { SymbolSource, WindowDefaults } from '../asc/resolve.ts';
import { kindOfFile, parseCmp, type CmpKind, type CmpPart } from './cmp.ts';
import { t } from '../i18n/i18n.ts';

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
export const USER_DIR = t('My symbols');
/** Prefijo de los archivos de modelos tomados de la librería de LTspice del usuario (ltspiceLib.ts) */
export const LTSPICE_PREFIX = 'ltspice/';
/** Archivos de modelos del proyecto abierto (#155): ganan a los del usuario y a la librería */
export const PROJECT_PREFIX = 'project/';
/** Carpeta del buscador (F2) con los símbolos del proyecto */
export const PROJECT_DIR = t('Project');

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
  /** type tal como viene del .asc → su símbolo (se pide miles de veces por render, #182) */
  private resolved = new Map<string, SymbolDef | undefined>();
  /** Sube cada vez que cambia qué símbolo resuelve un tipo (para cachés por documento, #183) */
  rev = 0;
  private cmpCache = new Map<CmpKind, CmpPart[]>();
  /** library/cmp: archivo → texto (los pasivos llegan después, addCmp) */
  private cmpFiles: Record<string, string>;
  /** Símbolos agregados por el usuario o importados de su LTspice (ganan a los del bundle) */
  private extra = new Map<string, string>();
  /** Archivos de modelos del usuario: nombre de archivo (minúsculas) → texto */
  private userModels = new Map<string, { name: string; text: string; subckts: string[]; models: string[] }>();
  // los del proyecto abierto (se reemplazan todos juntos al abrir otro, setProjectFiles)
  private projSymbols = new Map<string, string>();
  private projModels = new Map<string, { name: string; text: string; subckts: string[]; models: string[] }>();
  /** Esquemáticos del usuario usados como bloques jerárquicos: nombre sin .asc (minúsculas) → texto */
  private userSchematics = new Map<string, { name: string; text: string }>();
  /** Subcircuitos del proyecto (#180): ganan a los esquemáticos del usuario */
  private projSchematics = new Map<string, { name: string; text: string }>();
  private schCache = new Map<string, AscDoc>();
  /**
   * Librería de la instalación de LTspice del usuario (importada a su navegador, no se publica):
   * se consulta después de la propia y sólo tiene lo que pidieron los esquemáticos abiertos
   * (ver ltspiceLib.ts). Símbolos por ruta relativa a lib/sym y por nombre base; archivos de
   * modelos por nombre de archivo.
   */
  private ltSymbols = new Map<string, string>();
  private ltModels = new Map<string, { name: string; text: string; subckts: string[]; models: string[] }>();

  readonly bundle: LibraryBundle;

  constructor(bundle: LibraryBundle) {
    this.bundle = bundle;
    this.cmpFiles = { ...(bundle.cmp ?? {}) };
    // (un bundle viejo, de antes de #74, traía sólo la tabla de LTspice)
    const wd = bundle.windowDefaults as WindowDefaults | WindowDefaults['ltspice'];
    this.windowDefaults = 'ltspice' in wd && 'preferred' in wd ? (wd as WindowDefaults) : { ltspice: wd as WindowDefaults['ltspice'], preferred: {} };
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
    if (this.resolved.has(type)) return this.resolved.get(type);
    const def = this.lookup(type);
    this.resolved.set(type, def);
    return def;
  }

  private symbolsChanged(): void {
    this.resolved.clear();
    this.rev++;
  }

  private lookup(type: string): SymbolDef | undefined {
    const name = baseName(type).toLowerCase();
    const proj = this.projSymbols.get(name);
    const extra = proj ?? this.extra.get(name);
    const lt = extra || this.resolvePath(type) ? undefined : this.ltSymbol(type);
    const path = proj ? `project:${name}` : extra ? `extra:${name}` : lt ? `ltspice:${lt.key}` : this.resolvePath(type);
    if (!path) return undefined;
    let def = this.cache.get(path);
    if (!def) {
      def = parseAsy(extra ?? lt?.text ?? this.bundle.symbols[path], baseName(type));
      this.cache.set(path, def);
    }
    return def;
  }

  private ltSymbol(type: string): { key: string; text: string } | undefined {
    const path = symbolPath(type).toLowerCase();
    const name = baseName(type).toLowerCase();
    const key = this.ltSymbols.has(path) ? path : name;
    const text = this.ltSymbols.get(key);
    return text === undefined ? undefined : { key, text };
  }

  /** Símbolo de la librería de LTspice del usuario, por su ruta relativa a lib/sym (sin .asy) */
  addLtspiceSymbol(path: string, asyText: string): void {
    const p = path.toLowerCase();
    this.ltSymbols.set(p, asyText);
    if (!this.ltSymbols.has(baseName(p))) this.ltSymbols.set(baseName(p), asyText);
    this.symbolsChanged();
  }

  /** Archivo de modelos de la librería de LTspice del usuario */
  addLtspiceModelFile(name: string, text: string): void {
    this.ltModels.set(name.toLowerCase(), { name, text, ...scanModels(text) });
  }

  hasLtspiceModelFile(name: string): boolean {
    return this.ltModels.has(name.toLowerCase());
  }

  /** Archivo de la librería de LTspice ya cargado que define este .subckt/.model */
  ltspiceFileDefining(name: string): string | undefined {
    const n = name.toLowerCase();
    for (const m of this.ltModels.values()) if (m.subckts.some((x) => x.toLowerCase() === n) || m.models.some((x) => x.toLowerCase() === n)) return m.name;
    return undefined;
  }

  addSymbol(name: string, asyText: string): void {
    this.extra.set(name.toLowerCase(), asyText);
    this.cache.delete(`extra:${name.toLowerCase()}`);
    this.symbolsChanged();
  }

  removeSymbol(name: string): void {
    this.extra.delete(name.toLowerCase());
    this.cache.delete(`extra:${name.toLowerCase()}`);
    this.symbolsChanged();
  }

  /** Símbolos y modelos del proyecto abierto (reemplazan a los anteriores) */
  setProjectFiles(files: { name: string; kind: 'symbol' | 'model' | 'schematic'; text: string }[]): void {
    for (const k of this.projSymbols.keys()) this.cache.delete(`project:${k}`);
    this.projSymbols.clear();
    this.projModels.clear();
    this.projSchematics.clear();
    this.schCache.clear();
    this.symbolsChanged();
    for (const f of files) {
      if (f.kind === 'symbol') this.projSymbols.set(f.name.replace(/\.asy$/i, '').toLowerCase(), f.text);
      else if (f.kind === 'schematic') this.projSchematics.set(f.name.replace(/\.asc$/i, '').toLowerCase(), { name: f.name, text: f.text });
      else this.projModels.set(f.name.toLowerCase(), { name: f.name, text: f.text, ...scanModels(f.text) });
    }
  }

  /** Nombres de los símbolos del proyecto */
  projectSymbols(): string[] {
    return [...this.projSymbols.keys()];
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
    const f = this.projSchematics.get(key) ?? this.userSchematics.get(key);
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
    if (rel.startsWith(LTSPICE_PREFIX)) return this.ltModels.get(rel.slice(LTSPICE_PREFIX.length).toLowerCase())?.text;
    if (rel.startsWith(PROJECT_PREFIX)) return this.projModels.get(rel.slice(PROJECT_PREFIX.length).toLowerCase())?.text;
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
    // los del proyecto y los del usuario ganan (como los que están junto al .asc en LTspice)
    const proj = this.projModels.get(lower.split('/').pop()!);
    if (proj) return PROJECT_PREFIX + proj.name.toLowerCase();
    const user = this.userModels.get(lower.split('/').pop()!);
    if (user) return USER_PREFIX + user.name.toLowerCase();
    const files = Object.keys(this.bundle.subs);
    const exact = files.find((f) => lower === f.toLowerCase() || lower.endsWith(`/${f.toLowerCase()}`));
    if (exact) return exact;
    const base = lower.split('/').pop();
    const own = files.find((f) => f.toLowerCase().split('/').pop() === base);
    if (own) return own;
    // por último, la librería de LTspice del usuario
    const lt = this.ltModels.get(base!);
    return lt ? LTSPICE_PREFIX + lt.name.toLowerCase() : undefined;
  }

  /** ¿Algún archivo de modelos de la librería define este .model/.subckt? */
  definesModel(name: string, withLtspice = true): boolean {
    const n = name.toLowerCase();
    return [...Object.values(this.bundle.subs), ...this.projModels.values(), ...this.userModels.values(), ...(withLtspice ? this.ltModels.values() : [])].some(
      (s) => s.subckts.some((x) => x.toLowerCase() === n) || s.models.some((x) => x.toLowerCase() === n),
    );
  }

  /** Componentes de library/cmp de un tipo (la lista de la que se elige el valor) */
  parts(kind: CmpKind): CmpPart[] {
    let p = this.cmpCache.get(kind);
    if (!p) {
      // (sólo el archivo de ese tipo: standard.cap e .ind son grandes)
      p = Object.entries(this.cmpFiles).filter(([file]) => kindOfFile(file) === kind).flatMap(([file, text]) => parseCmp(file, text));
      this.cmpCache.set(kind, p);
    }
    return p;
  }

  /** Listas de library/cmp que llegan después del bundle (los pasivos, #189) */
  addCmp(files: Record<string, string>): void {
    Object.assign(this.cmpFiles, files);
    for (const f of Object.keys(files)) {
      const k = kindOfFile(f);
      if (k) this.cmpCache.delete(k);
    }
  }

  /** Archivo de library/cmp que define este .model (como la standard.bjt que incluye LTspice) */
  cmpFileDefining(name: string): string | undefined {
    const n = name.toLowerCase();
    return Object.entries(this.bundle.subs).find(([f, s]) => f.startsWith(CMP_DIR) && s.models.some((m) => m.toLowerCase() === n))?.[0];
  }

  /** Todas las rutas de símbolos, para el buscador (F2) */
  symbolPaths(): string[] {
    const proj = [...this.projSymbols.keys()].map((n) => `${PROJECT_DIR}/${n}`);
    const user = [...this.extra.keys()].map((n) => `${USER_DIR}/${n}`);
    return [...proj, ...user, ...Object.keys(this.bundle.symbols).sort((a, b) => a.localeCompare(b))];
  }
}
