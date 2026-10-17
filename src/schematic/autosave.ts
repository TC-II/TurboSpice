// Autoguardado y archivos recientes, en IndexedDB (todo queda en la máquina del usuario).
// El documento se guarda tal cual (serializeAsc, sin hacer explícito) junto con el historial
// de deshacer; los handles de la File System Access API se pueden guardar en IndexedDB y
// permiten volver a guardar sobre el mismo archivo.
import type { AscEncoding } from '../asc/encoding.ts';
import type { PlotView } from '../waveform/view.ts';

const DB = 'turbospice';
const STORE = 'kv';
const SESSION = 'session';
const RECENT = 'recent';
export const MAX_RECENT = 10;

export interface Session {
  name: string;
  encoding?: AscEncoding;
  handle?: unknown;
  /** historial serializado (.asc) */
  past: string[];
  present: string;
  future: string[];
  /** cantidad de pasos de `past` en el último guardado (para saber si hay cambios) */
  savedVersion: number;
  time: number;
  /** vista de resultados recordada */
  view?: PlotView;
}

export interface RecentFile {
  name: string;
  asc: string;
  encoding?: AscEncoding;
  handle?: unknown;
  time: number;
  /** trabajo sin guardar recuperado */
  unsaved?: boolean;
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function get<T>(key: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
}

async function put(key: string, value: unknown): Promise<void> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Errores de IndexedDB (modo privado, almacenamiento bloqueado): se ignoran */
const quiet = <T>(p: Promise<T>, fallback: T) => p.catch(() => fallback);

export const loadSession = () => quiet(get<Session>(SESSION), undefined);

export function saveSession(s: Session): Promise<void> {
  return quiet(put(SESSION, s).catch(() => put(SESSION, { ...s, handle: undefined })), undefined);
}

export const loadRecent = async () => (await quiet(get<RecentFile[]>(RECENT), undefined)) ?? [];

/** Agrega (o sube al principio) un archivo a recientes */
export async function addRecent(f: RecentFile): Promise<RecentFile[]> {
  const list = [f, ...(await loadRecent()).filter((r) => r.name !== f.name || !!r.unsaved !== !!f.unsaved)].slice(0, MAX_RECENT);
  await quiet(put(RECENT, list).catch(() => put(RECENT, list.map((r) => ({ ...r, handle: undefined })))), undefined);
  return list;
}

interface PermissionHandle {
  queryPermission?(o: { mode: string }): Promise<string>;
  requestPermission?(o: { mode: string }): Promise<string>;
  getFile(): Promise<File>;
}

/** Contenido actual del archivo en disco si el handle sigue siendo accesible */
export async function readHandle(handle: unknown): Promise<Uint8Array | null> {
  const h = handle as PermissionHandle | undefined;
  if (!h?.getFile) return null;
  try {
    let perm = (await h.queryPermission?.({ mode: 'read' })) ?? 'granted';
    if (perm !== 'granted') perm = (await h.requestPermission?.({ mode: 'read' })) ?? 'denied';
    if (perm !== 'granted') return null;
    return new Uint8Array(await (await h.getFile()).arrayBuffer());
  } catch {
    return null;
  }
}

/** Vista de resultados recordada para un archivo (por nombre) */
export const loadView = (name: string) => quiet(get<PlotView>(`view:${name}`), undefined);
export const saveView = (name: string, view: PlotView) => quiet(put(`view:${name}`, view), undefined);
