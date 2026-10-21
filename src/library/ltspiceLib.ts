// Librería de la instalación de LTspice del usuario (lib/sym, lib/sub, lib/cmp), importada a su
// navegador. Es de Analog Devices y no se puede redistribuir: no se publica ni sale de la máquina
// del usuario; sólo la usa su TurboSpice, como la usaría su LTspice.
//
// Son ~12.000 archivos (~100 MB): se guardan en IndexedDB con un índice (símbolo → archivo,
// .subckt/.model → archivo, nombre de archivo → archivo) que sí se carga entero, y cada
// esquemático trae sólo lo que le falta (prefetch) antes de dibujarse o simularse.
import type { AscDoc } from '../asc/model.ts';
import { baseName, symbolPath } from '../asc/model.ts';
import { decode } from '../asc/encoding.ts';
import type { Library } from './library.ts';

const DB = 'turbospice-ltspice';
const FILES = 'files';
const META = 'meta';

export interface LtspiceIndex {
  /** ruta relativa a lib/sym sin .asy (minúsculas) → clave */
  symPath: Record<string, string>;
  /** nombre base del símbolo (minúsculas) → clave (el primero que aparece) */
  sym: Record<string, string>;
  /** nombre de .subckt o .model (minúsculas) → clave del archivo que lo define */
  model: Record<string, string>;
  /** nombre de archivo de lib/sub y lib/cmp (minúsculas) → clave */
  file: Record<string, string>;
  /** cuándo se importó y cuántos archivos */
  time: number;
  count: { symbols: number; models: number };
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(FILES);
      req.result.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function request<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const r = fn(d.transaction(store, mode).objectStore(store));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

/** Parte de la ruta desde lib/: "sym/OpAmps/LT1001.asy", "sub/LTC.lib", "cmp/standard.bjt" */
export function libRelative(path: string): string | null {
  const parts = path.replace(/\\/g, '/').split('/');
  const i = parts.findIndex((p, k) => /^(sym|sub|cmp)$/i.test(p) && (k === 0 || /^lib$/i.test(parts[k - 1]) || k === 1));
  return i < 0 ? null : parts.slice(i).join('/');
}

/**
 * Importa la carpeta lib de LTspice elegida por el usuario (input con webkitdirectory: cada File
 * trae webkitRelativePath). Reemplaza una importación anterior.
 */
export async function importLtspiceLibrary(files: File[], onProgress?: (done: number, total: number) => void): Promise<LtspiceIndex> {
  const wanted = files
    .map((f) => ({ f, rel: libRelative((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name) }))
    .filter((x): x is { f: File; rel: string } => !!x.rel && /^(sym\/.*\.asy|(sub|cmp)\/[^/]+)$/i.test(x.rel));
  if (!wanted.length) throw new Error('No es la carpeta lib de LTspice: no tiene sym/, sub/ ni cmp/');
  const index: LtspiceIndex = { symPath: {}, sym: {}, model: {}, file: {}, time: Date.now(), count: { symbols: 0, models: 0 } };
  await removeLtspiceLibrary();
  const d = await db();
  const BATCH = 200;
  for (let i = 0; i < wanted.length; i += BATCH) {
    const batch = await Promise.all(
      wanted.slice(i, i + BATCH).map(async ({ f, rel }) => ({ rel, text: decode(new Uint8Array(await f.arrayBuffer())).text })),
    );
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(FILES, 'readwrite');
      for (const { rel, text } of batch) tx.objectStore(FILES).put(text, rel.toLowerCase());
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    for (const { rel, text } of batch) {
      const key = rel.toLowerCase();
      if (key.startsWith('sym/')) {
        const p = key.slice(4).replace(/\.asy$/, '');
        index.symPath[p] = key;
        index.sym[baseName(p)] ??= key;
        index.count.symbols++;
      } else {
        index.file[key.split('/').pop()!] ??= key;
        for (const m of text.matchAll(/^\s*\.(?:subckt|model)\s+(\S+)/gim)) index.model[m[1].toLowerCase()] ??= key;
        index.count.models++;
      }
    }
    onProgress?.(Math.min(i + BATCH, wanted.length), wanted.length);
  }
  await request(META, 'readwrite', (s) => s.put(index, 'index'));
  return index;
}

export async function removeLtspiceLibrary(): Promise<void> {
  await request(FILES, 'readwrite', (s) => s.clear()).catch(() => undefined);
  await request(META, 'readwrite', (s) => s.delete('index')).catch(() => undefined);
}

export const loadLtspiceIndex = (): Promise<LtspiceIndex | undefined> =>
  request<LtspiceIndex | undefined>(META, 'readonly', (s) => s.get('index') as IDBRequest<LtspiceIndex | undefined>).catch(() => undefined);

const readFile = (key: string) => request<string | undefined>(FILES, 'readonly', (s) => s.get(key) as IDBRequest<string | undefined>).catch(() => undefined);

const MODEL_FILE = /\.(lib|sub|mod|inc|cir|txt)$/i;

/**
 * Carga en la librería lo que este esquemático necesita y no está en la propia: sus símbolos, los
 * archivos de modelos de esos símbolos (ModelFile, o SpiceModel cuando es un archivo), los
 * .lib/.include de sus directivas y los archivos que definen los modelos que usa. Devuelve
 * cuántos archivos agregó (0: no hace falta redibujar).
 */
export async function prefetchLtspice(doc: AscDoc, lib: Library, index: LtspiceIndex): Promise<number> {
  let added = 0;
  const addModelFile = async (key: string | undefined) => {
    if (!key) return;
    const name = key.split('/').pop()!;
    if (lib.hasLtspiceModelFile(name)) return;
    const text = await readFile(key);
    if (text === undefined) return;
    lib.addLtspiceModelFile(name, text);
    added++;
  };
  const fileKey = (path: string) => index.file[path.replace(/\\/g, '/').split('/').pop()!.replace(/^"|"$/g, '').toLowerCase()];

  // símbolos que no están en la librería propia
  for (const s of doc.symbols) {
    if (lib.symbol(s.type)) continue;
    const p = symbolPath(s.type).toLowerCase();
    const key = index.symPath[p] ?? index.sym[baseName(p).toLowerCase()];
    if (!key) continue;
    const text = await readFile(key);
    if (text === undefined) continue;
    lib.addLtspiceSymbol(key.slice(4).replace(/\.asy$/, ''), text);
    added++;
    for (const a of ['ModelFile', 'SpiceModel']) {
      const v = new RegExp(`^SYMATTR ${a} (.+)$`, 'm').exec(text)?.[1]?.trim();
      if (v && (a === 'ModelFile' || MODEL_FILE.test(v)) && !lib.resolveModelFile(v)) await addModelFile(fileKey(v));
    }
  }

  // .lib/.include de las directivas que no resuelve la librería propia
  for (const t of doc.texts) {
    if (t.kind !== 'directive') continue;
    for (const m of t.text.matchAll(/(?:^|\\n)\s*\.(?:lib|include|inc)\s+("?)([^"\\]+?)\1(?:\s|\\n|$)/gi)) {
      if (!lib.resolveModelFile(m[2])) await addModelFile(fileKey(m[2]));
    }
  }

  // modelos y subcircuitos usados que nadie define: el archivo de LTspice que los define
  const used = new Set<string>();
  for (const s of doc.symbols) {
    const def = lib.symbol(s.type);
    if (!def) continue;
    const attr = (k: string) => s.attrs.get(k) ?? def.attrs.get(k);
    const prefix = (attr('Prefix') ?? '').toUpperCase();
    if (!/^[DQMJXZ]/.test(prefix)) continue;
    const sm = attr('SpiceModel');
    const model = prefix.startsWith('X') && sm && !MODEL_FILE.test(sm) ? sm : (attr('Value') ?? '').split(/\s/)[0];
    if (model) used.add(model.toLowerCase());
  }
  for (const m of used) if (!lib.definesModel(m)) await addModelFile(index.model[m]);
  return added;
}
