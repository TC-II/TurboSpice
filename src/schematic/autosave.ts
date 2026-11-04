// Autoguardado y archivos recientes, en IndexedDB (todo queda en la máquina del usuario).
// El documento se guarda tal cual (serializeAsc, sin hacer explícito) junto con el historial
// de deshacer; los handles de la File System Access API se pueden guardar en IndexedDB y
// permiten volver a guardar sobre el mismo archivo.
import type { AscEncoding } from '../asc/encoding.ts';
import type { SimList } from '../sim/simList.ts';
import type { PlotView } from '../waveform/view.ts';

// la versión dev (tc-ii.github.io/TurboSpice/dev/) comparte el origen con la estable: base propia
// para que su autoguardado y sus recientes no pisen los de la estable
const DB = import.meta.env.VITE_CHANNEL === 'dev' ? 'turbospice-dev' : 'turbospice';
const STORE = 'kv';
const SESSION = 'session';
const RECENT = 'recent';
export const MAX_RECENT = 10;

export interface Session {
  name: string;
  encoding?: AscEncoding;
  handle?: unknown;
  /** id en Google Drive */
  driveId?: string;
  /** historial serializado (.asc) */
  past: string[];
  present: string;
  future: string[];
  /** cantidad de pasos de `past` en el último guardado (para saber si hay cambios) */
  savedVersion: number;
  time: number;
  /** vista de resultados de versiones anteriores (ahora va dentro del documento) */
  view?: PlotView;
  /** lista de simulaciones, con la vista de cada una (#39) */
  sims?: SimList;
}

export interface RecentFile {
  name: string;
  /** copia del contenido: el .asc o, en un proyecto, el .turbo */
  asc: string;
  /** `asc` es un .turbo */
  turbo?: boolean;
  encoding?: AscEncoding;
  handle?: unknown;
  /** id en Google Drive */
  driveId?: string;
  time: number;
  /** trabajo sin guardar recuperado */
  unsaved?: boolean;
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      const d = req.result;
      // el navegador puede cerrar la conexión (borrado de datos, otra pestaña que actualiza la
      // base): la próxima operación abre una nueva en vez de fallar para siempre
      d.onclose = () => (dbPromise = null);
      d.onversionchange = () => (d.close(), (dbPromise = null));
      resolve(d);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

/** Fin de una transacción de escritura; sin espacio (QuotaExceededError) se aborta sin 'error' */
const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? new DOMException('aborted', 'AbortError'));
  });

async function get<T>(key: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
}

async function put(key: string, value: unknown): Promise<void> {
  const tx = (await db()).transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(value, key);
  return done(tx);
}

/** Errores de IndexedDB (modo privado, almacenamiento bloqueado): se ignoran */
const quiet = <T>(p: Promise<T>, fallback: T) => p.catch(() => fallback);

export const loadSession = () => quiet(get<Session>(SESSION), undefined);

export function saveSession(s: Session): Promise<void> {
  return quiet(
    put(SESSION, s).catch(() => put(SESSION, { ...s, handle: undefined })),
    undefined,
  );
}

export const loadRecent = async () => (await quiet(get<RecentFile[]>(RECENT), undefined)) ?? [];

/** Agrega (o sube al principio) un archivo a recientes */
export async function addRecent(f: RecentFile): Promise<RecentFile[]> {
  const list = [f, ...(await loadRecent()).filter((r) => r.name !== f.name || !!r.unsaved !== !!f.unsaved)].slice(0, MAX_RECENT);
  await quiet(
    put(RECENT, list).catch(() =>
      put(
        RECENT,
        list.map((r) => ({ ...r, handle: undefined })),
      ),
    ),
    undefined,
  );
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

/** Vista de resultados recordada por nombre de archivo en versiones anteriores (para migrarla al .asc) */
export const loadView = (name: string) => quiet(get<PlotView>(`view:${name}`), undefined);

/** Archivos propios del usuario: símbolos (.asy), modelos (.lib…) y bloques (.asc) */
export interface UserFile {
  name: string;
  kind: 'symbol' | 'model' | 'schematic';
  text: string;
  time: number;
}

export const loadUserFiles = async () => (await quiet(get<UserFile[]>('userfiles'), undefined)) ?? [];

export async function saveUserFiles(files: UserFile[]): Promise<void> {
  await quiet(put('userfiles', files), undefined);
}

/** Proyecto en el que se está trabajando (#149): el .turbo entero, sin las pilas de deshacer */
export interface ProjectSession {
  name: string;
  handle?: unknown;
  /** id en Google Drive y su versión al abrirlo o guardarlo (#156) */
  driveId?: string;
  driveVersion?: string;
  turbo: string;
  /** hay cambios sin guardar en el archivo */
  dirty: boolean;
  time: number;
}

// --- una sesión por pestaña ---------------------------------------------------------------------
// Cada pestaña guarda su proyecto con su propia clave (project:<id>), para que dos pestañas
// abiertas no se pisen el autoguardado. El id vive en sessionStorage (sobrevive a recargar la
// pestaña) y la pestaña lo tiene tomado con un Web Lock mientras está abierta: así se sabe qué
// sesiones son de pestañas vivas y cuáles quedaron de pestañas cerradas (o de un cierre forzado).

/** Clave de las versiones anteriores, con una sola sesión para todas las pestañas */
const LEGACY_PROJECT = 'project';
const PROJECT_PREFIX = 'project:';
const TAB_KEY = `${DB}.tab`;
const tabLock = (id: string) => `${DB}:tab:${id}`;

interface Locks {
  request(name: string, opts: { ifAvailable?: boolean }, cb: (lock: unknown) => unknown): Promise<unknown>;
  request(name: string, cb: () => unknown): Promise<unknown>;
  query(): Promise<{ held?: { name?: string }[] }>;
}
const locks = (): Locks | undefined => (globalThis.navigator as { locks?: Locks } | undefined)?.locks;

/** Toma el lock de la pestaña `id` hasta que se cierre; false si lo tiene otra (una pestaña duplicada) */
function holdTab(id: string): Promise<boolean> {
  const l = locks();
  if (!l) return Promise.resolve(true);
  return new Promise((resolve) => {
    l.request(tabLock(id), { ifAvailable: true }, (lock) => {
      resolve(!!lock);
      // (una promesa que no termina: el lock queda tomado mientras viva la pestaña)
      return lock ? new Promise(() => {}) : undefined;
    }).catch(() => resolve(true));
  });
}

let tabIdP: Promise<string> | undefined;
/** Id de esta pestaña (el mismo al recargarla) */
function tabId(): Promise<string> {
  tabIdP ??= (async () => {
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(TAB_KEY);
    } catch {
      // sin sessionStorage: un id nuevo en cada carga
    }
    if (id && (await holdTab(id))) return id;
    id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    try {
      sessionStorage.setItem(TAB_KEY, id);
    } catch {
      // ídem
    }
    await holdTab(id);
    return id;
  })();
  return tabIdP;
}

/** Ids de las pestañas abiertas (null si el navegador no tiene Web Locks: se toman todas por cerradas) */
async function liveTabs(): Promise<Set<string> | null> {
  const l = locks();
  if (!l) return null;
  const prefix = tabLock('');
  const { held = [] } = await l.query();
  return new Set(
    held
      .map((h) => h.name ?? '')
      .filter((n) => n.startsWith(prefix))
      .map((n) => n.slice(prefix.length)),
  );
}

/** Qué hacer con las sesiones guardadas al abrir una pestaña (ver claimSession) */
export interface SessionClaim {
  /** clave de la sesión que restaura esta pestaña */
  take?: string;
  /** sesiones de pestañas cerradas que no se restauran, con trabajo sin guardar: van a recientes */
  toRecent: string[];
  /** claves a borrar (las de pestañas cerradas, que ya se restauraron o pasaron a recientes) */
  drop: string[];
  /** no hay qué restaurar, pero otra pestaña abierta tiene su proyecto */
  elsewhere: boolean;
}

/**
 * Elige la sesión de una pestaña que se abre. `sessions`: clave → sesión guardada; `live`: ids de
 * las otras pestañas abiertas (null = no se sabe). Al recargar, la propia; si no, la más reciente
 * de las que dejaron pestañas cerradas. Nunca la de otra pestaña abierta (cada una sigue con la
 * suya; ésta empieza con un proyecto nuevo).
 */
export function claimSession(own: string, sessions: Map<string, Pick<ProjectSession, 'dirty' | 'time'>>, live: Set<string> | null): SessionClaim {
  if (sessions.has(own)) return { take: own, toRecent: [], drop: [], elsewhere: false };
  const orphans = [...sessions].filter(([k]) => k === LEGACY_PROJECT || (k.startsWith(PROJECT_PREFIX) && !live?.has(k.slice(PROJECT_PREFIX.length)))).sort(([, a], [, b]) => b.time - a.time);
  const [first, ...rest] = orphans;
  return {
    take: first?.[0],
    toRecent: rest.filter(([, s]) => s.dirty).map(([k]) => k),
    drop: orphans.map(([k]) => k),
    elsewhere: !first && sessions.size > 0,
  };
}

async function allKeys(): Promise<string[]> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction(STORE).objectStore(STORE).getAllKeys();
    r.onsuccess = () => resolve(r.result.map(String));
    r.onerror = () => reject(r.error);
  });
}

/** De a una pestaña por vez: dos que se abren juntas no restauran la misma sesión */
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const l = locks();
  return l ? (l.request(`${DB}:claim`, fn) as Promise<T>) : fn();
}

/**
 * Proyecto que restaura esta pestaña (ver claimSession). La sesión que toma pasa a ser la suya, y
 * las demás de pestañas cerradas se borran (las que tenían cambios sin guardar quedan en recientes).
 */
export async function loadProjectSession(): Promise<{ session?: ProjectSession; elsewhere: boolean }> {
  const id = await tabId();
  const own = PROJECT_PREFIX + id;
  return quiet(
    exclusive(async () => {
      const keys = (await allKeys()).filter((k) => k === LEGACY_PROJECT || k.startsWith(PROJECT_PREFIX));
      const sessions = new Map<string, ProjectSession>();
      for (const k of keys) {
        const s = await get<ProjectSession>(k);
        if (s) sessions.set(k, s);
      }
      const live = await liveTabs();
      live?.delete(id);
      const claim = claimSession(own, sessions, live);
      for (const k of claim.toRecent) {
        const s = sessions.get(k)!;
        await addRecent({ name: s.name, asc: s.turbo, turbo: true, time: s.time, unsaved: true });
      }
      const taken = claim.take ? sessions.get(claim.take) : undefined;
      if (taken && claim.take !== own) await put(own, taken).catch(() => put(own, { ...taken, handle: undefined }));
      for (const k of claim.drop) if (k !== own) await del(k);
      return { session: taken, elsewhere: claim.elsewhere };
    }),
    { session: undefined, elsewhere: false },
  );
}

export async function saveProjectSession(s: ProjectSession): Promise<void> {
  const key = PROJECT_PREFIX + (await tabId());
  return quiet(
    put(key, s).catch(() => put(key, { ...s, handle: undefined })),
    undefined,
  );
}

/**
 * Resultados de la última corrida de cada simulación (no van en el .turbo, pueden pesar MB).
 * `asc` es el circuito simulado: si ya no es el de la simulación, no sirven.
 */
export interface CachedResult<T> {
  asc: string;
  result: T;
  time: number;
}

export const loadResult = <T>(simId: string) => quiet(get<CachedResult<T>>(`res:${simId}`), undefined);
export const saveResult = <T>(simId: string, r: CachedResult<T>) => quiet(put(`res:${simId}`, r), undefined);
export const dropResult = (simId: string) => quiet(del(`res:${simId}`), undefined);

async function del(key: string): Promise<void> {
  const tx = (await db()).transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(key);
  return done(tx);
}
