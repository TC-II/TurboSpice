// Librería de símbolos, skins y subcircuitos. Se construye con scripts/build-library.mjs
// en un único bundle JSON que la app descarga una vez.
import { parseAsy } from '../asc/parse.ts';
import { baseName, symbolPath, type SymbolDef } from '../asc/model.ts';
import type { SymbolSource, WindowDefaults } from '../asc/resolve.ts';

export interface LibraryBundle {
  /** ruta relativa a library/sym sin extensión (p.ej. "TCLib/OA_param2") → texto .asy */
  symbols: Record<string, string>;
  /** nombre base → contenido SVG ya normalizado (sin <style>, colores en currentColor) */
  skins: Record<string, { viewBox: string; body: string }>;
  windowDefaults: WindowDefaults;
  /** ruta relativa a library/sub (p.ej. "TCLib/Black_Box.lib") → definiciones */
  subs: Record<string, { subckts: string[]; models: string[] }>;
}

export class Library implements SymbolSource {
  readonly windowDefaults: WindowDefaults;
  private byPath = new Map<string, string>();
  private byName = new Map<string, string>();
  private cache = new Map<string, SymbolDef>();
  /** Símbolos agregados por el usuario o importados de su LTspice (ganan a los del bundle) */
  private extra = new Map<string, string>();

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
    const files = Object.keys(this.bundle.subs);
    const lower = norm.toLowerCase();
    const exact = files.find((f) => lower === f.toLowerCase() || lower.endsWith(`/${f.toLowerCase()}`));
    if (exact) return exact;
    const base = lower.split('/').pop();
    return files.find((f) => f.toLowerCase().split('/').pop() === base);
  }

  /** ¿Algún archivo de modelos de la librería define este .model/.subckt? */
  definesModel(name: string): boolean {
    const n = name.toLowerCase();
    return Object.values(this.bundle.subs).some(
      (s) => s.subckts.some((x) => x.toLowerCase() === n) || s.models.some((x) => x.toLowerCase() === n),
    );
  }

  /** Todas las rutas de símbolos, para el buscador (F2) */
  symbolPaths(): string[] {
    return Object.keys(this.bundle.symbols).sort((a, b) => a.localeCompare(b));
  }
}
