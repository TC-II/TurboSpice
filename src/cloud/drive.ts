import { t } from '../i18n/i18n.ts';
// Google Drive (API REST v3) con el scope `drive.file`: la app sólo ve los archivos que creó
// ella misma. Los proyectos (.turbo, JSON) viven en la carpeta «TurboSpice» del Drive del usuario y
// en las subcarpetas que el usuario arme adentro. Cada archivo trae su `version` (la revisión del
// contenido): así se detecta que otra pestaña u otra máquina lo cambió antes de pisarlo (#156). No
// es el campo `version` de Drive: ése sube solo ~1 s después de cada escritura (Drive procesa el
// archivo), y el segundo guardado veía un conflicto que no existía (#176). `headRevisionId`
// cambia sólo con el contenido.
//
// A prueba de fallas de red: cada llamada tiene un tiempo máximo, y las que fallan por algo
// pasajero (sin conexión, 429, 5xx, límite de pedidos) se reintentan con espera exponencial. Las
// creaciones usan ids generados de antemano (`generateIds`), así reintentarlas no duplica archivos.
// Los errores llegan como `DriveError`, con su tipo (`kind`) para que la interfaz decida qué hacer.
// No depende de React ni de Google Identity Services: recibe una función que da el token.

export const FOLDER_NAME = 'TurboSpice';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ASC_MIME = 'application/octet-stream';
const TURBO_MIME = 'application/json';
/** Marca (appProperties) de la carpeta raíz: así se la encuentra aunque el usuario la mueva o la renombre */
const ROOT_MARK = { key: 'turbospice', value: 'root' };
const FIELDS = 'id,name,modifiedTime,headRevisionId';
const ITEM_FIELDS = 'id,name,mimeType,parents,modifiedTime,createdTime,headRevisionId,size,trashed,explicitlyTrashed,webViewLink,appProperties';
/** Desde este tamaño se sube por partes (la subida multipart admite hasta 5 MB) */
export const RESUMABLE_MIN = 5 * 1024 * 1024;
const mimeOf = (name: string) => (/\.(turbo|json)$/i.test(name) ? TURBO_MIME : ASC_MIME);
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
/** Tiempo máximo de una llamada (las subidas suman según el tamaño) */
export const CALL_TIMEOUT = 30_000;
/** Intentos de una llamada que falla por algo pasajero */
export const ATTEMPTS = 4;

/** Proyectos y esquemáticos que se listan (los JSON de la app, como «My symbols and models», no) */
export const isProjectName = (name: string) => /\.(turbo|asc)$/i.test(name);

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
  /** revisión del contenido (`headRevisionId`): cambia sólo cuando cambia el contenido */
  version?: string;
}

/** Un archivo o carpeta de la librería (todo lo que cuelga de la carpeta TurboSpice) */
export interface DriveItem extends DriveFile {
  folder: boolean;
  /** carpeta que lo contiene */
  parent?: string;
  createdTime?: string;
  size?: number;
  /** en la papelera (por sí mismo o porque su carpeta lo está) */
  trashed?: boolean;
  /** mandado a la papelera por sí mismo (no por estar en una carpeta que se borró) */
  explicitlyTrashed?: boolean;
  webViewLink?: string;
}

/** Lo que devuelve la API, con la revisión del contenido como `version` */
interface ApiFile {
  id: string;
  name: string;
  mimeType?: string;
  parents?: string[];
  modifiedTime?: string;
  createdTime?: string;
  headRevisionId?: string;
  size?: string;
  trashed?: boolean;
  explicitlyTrashed?: boolean;
  webViewLink?: string;
  appProperties?: Record<string, string>;
}
const fromApi = ({ id, name, modifiedTime, headRevisionId }: ApiFile): DriveFile => ({
  id,
  name,
  ...(modifiedTime ? { modifiedTime } : {}),
  ...(headRevisionId ? { version: headRevisionId } : {}),
});
const itemOf = (f: ApiFile): DriveItem => ({
  ...fromApi(f),
  folder: f.mimeType === FOLDER_MIME,
  parent: f.parents?.[0],
  ...(f.createdTime ? { createdTime: f.createdTime } : {}),
  ...(f.size ? { size: Number(f.size) } : {}),
  ...(f.trashed ? { trashed: true } : {}),
  ...(f.explicitlyTrashed ? { explicitlyTrashed: true } : {}),
  ...(f.webViewLink ? { webViewLink: f.webViewLink } : {}),
});

export interface DriveUser {
  displayName: string;
  emailAddress?: string;
  photoLink?: string;
}

// ── errores ──────────────────────────────────────────────────────────────

export type DriveErrorKind =
  /** sin token válido (venció o se revocó): hay que reconectar */
  | 'auth'
  /** sin conexión (o la red cortó el pedido) */
  | 'offline'
  | 'timeout'
  | 'notFound'
  /** sin permiso sobre ese archivo */
  | 'forbidden'
  /** demasiados pedidos: se reintenta más tarde */
  | 'rateLimit'
  /** el Drive del usuario está lleno */
  | 'storageQuota'
  | 'server'
  /** ya existe (p. ej. un id generado que ya se usó: la creación anterior sí llegó) */
  | 'conflict'
  /** el usuario cerró o canceló la ventana de Google */
  | 'cancelled'
  | 'other';

const RETRYABLE: DriveErrorKind[] = ['offline', 'timeout', 'rateLimit', 'server'];

export class DriveError extends Error {
  constructor(
    public kind: DriveErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'DriveError';
  }
  /** pasajero: se puede reintentar sin cambiar nada */
  get retryable() {
    return RETRYABLE.includes(this.kind);
  }
}

/** Tipo de error de cualquier cosa que se haya tirado (los que no son de Drive, «other») */
export const errorKind = (e: unknown): DriveErrorKind => (e instanceof DriveError ? e.kind : 'other');

/** Mensaje para el usuario de un error del servidor */
function friendly(kind: DriveErrorKind, detail: string): string {
  switch (kind) {
    case 'auth':
      return t('Your Google session expired: reconnect to keep using Drive');
    case 'offline':
      return t("Couldn't reach Google Drive (no connection?)");
    case 'timeout':
      return t('Google Drive took too long to answer');
    case 'notFound':
      return t("The file isn't in Google Drive anymore (deleted or moved to the trash?)");
    case 'forbidden':
      return t("TurboSpice doesn't have permission for that file: {detail}", { detail });
    case 'rateLimit':
      return t('Google Drive is receiving too many requests: try again in a moment');
    case 'storageQuota':
      return t('Your Google Drive is full');
    case 'server':
      return t('Google Drive is having trouble ({detail}): try again in a moment', { detail });
    default:
      return `Google Drive: ${detail}`;
  }
}

/** El error de una respuesta que no fue ok */
export async function errorOf(r: Response): Promise<DriveError> {
  let detail = `HTTP ${r.status}`;
  let reason = '';
  try {
    const j = (await r.json()) as { error?: { message?: string; errors?: { reason?: string }[] } };
    detail = j.error?.message ?? detail;
    reason = j.error?.errors?.[0]?.reason ?? '';
  } catch {
    // cuerpo no JSON
  }
  const kind: DriveErrorKind =
    r.status === 401
      ? 'auth'
      : r.status === 404
        ? 'notFound'
        : r.status === 409
          ? 'conflict'
          : r.status === 429 || /ratelimitexceeded/i.test(reason)
            ? 'rateLimit'
            : /storageQuotaExceeded|quotaExceeded/.test(reason)
              ? 'storageQuota'
              : r.status === 403
                ? 'forbidden'
                : r.status >= 500
                  ? 'server'
                  : 'other';
  return new DriveError(kind, friendly(kind, detail), r.status);
}

/** Espera antes del reintento `attempt` (0, 1, 2…): 0,5 s, 1 s, 2 s… con algo de azar */
export const backoff = (attempt: number, random = Math.random) => Math.min(8000, 500 * 2 ** attempt) * (0.75 + 0.5 * random());

/** Lo que pide `Retry-After` (en ms), si lo dice y es razonable */
function retryAfter(r: Response): number | undefined {
  const v = r.headers.get('Retry-After');
  if (!v) return undefined;
  const s = Number(v);
  return Number.isFinite(s) && s >= 0 && s <= 60 ? s * 1000 : undefined;
}

// ── cliente ──────────────────────────────────────────────────────────────

/** Token de acceso válido (puede pedir uno nuevo); `force` descarta el actual */
export type TokenSource = (force?: boolean) => Promise<string>;

/** Literal de cadena para las consultas `q` de Drive */
export const qString = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export interface DriveOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** tiempo máximo de una llamada (los tests lo acortan) */
  timeout?: number;
}

interface CallOptions {
  /** se puede repetir sin efectos de más (por defecto, sí) */
  idempotent?: boolean;
  timeout?: number;
}

/** Lo que comparten el cliente interactivo y el de fondo (la carpeta raíz, los ids generados, la última lista) */
class Shared {
  root: Promise<string> | null = null;
  ids: string[] = [];
  /** la última librería que se leyó (para mostrar dónde está un archivo sin pedirlo de nuevo) */
  library: DriveItem[] | null = null;
  reset() {
    this.root = null;
    this.ids = [];
    this.library = null;
  }
}

export class DriveClient {
  private fetchFn: typeof fetch;
  private sleep: (ms: number) => Promise<void>;
  private random: () => number;
  private timeout: number;

  constructor(
    private token: TokenSource,
    options: DriveOptions | typeof fetch = {},
    private shared = new Shared(),
  ) {
    const o: DriveOptions = typeof options === 'function' ? { fetch: options } : options;
    this.fetchFn = o.fetch ?? ((...a) => fetch(...a));
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = o.random ?? Math.random;
    this.timeout = o.timeout ?? CALL_TIMEOUT;
  }

  /** Otro cliente sobre el mismo Drive, con otra fuente de tokens (el de fondo no abre ventanas) */
  withToken(token: TokenSource): DriveClient {
    return new DriveClient(token, { fetch: this.fetchFn, sleep: this.sleep, random: this.random, timeout: this.timeout }, this.shared);
  }

  /** Olvida la carpeta y lo leído (otra cuenta) */
  reset() {
    this.shared.reset();
  }

  /** La última librería leída (o null) */
  get cachedLibrary(): DriveItem[] | null {
    return this.shared.library;
  }

  /**
   * fetch autenticado, con tiempo máximo y reintentos de lo pasajero. Un 401 (token vencido o
   * revocado) se reintenta una vez con token nuevo. Lo que no es idempotente sólo se reintenta si
   * el servidor dijo que no lo procesó (límite de pedidos).
   */
  private async call(url: string, init: RequestInit = {}, o: CallOptions = {}): Promise<Response> {
    const idempotent = o.idempotent ?? true;
    let forceToken = false;
    for (let attempt = 0; ; attempt++) {
      // el token, fuera del tiempo máximo: puede abrir la ventana de Google
      const token = await this.token(forceToken);
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), o.timeout ?? this.timeout);
      let r: Response;
      try {
        r = await this.fetchFn(url, { ...init, headers, signal: ctrl.signal });
      } catch {
        const err = ctrl.signal.aborted ? new DriveError('timeout', friendly('timeout', '')) : new DriveError('offline', friendly('offline', ''));
        if (attempt + 1 < ATTEMPTS && (idempotent || err.kind === 'offline')) {
          await this.sleep(backoff(attempt, this.random));
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
      if (r.ok) return r;
      if (r.status === 401 && !forceToken) {
        forceToken = true;
        attempt--;
        continue;
      }
      const err = await errorOf(r);
      if (err.retryable && attempt + 1 < ATTEMPTS && (idempotent || err.kind === 'rateLimit')) {
        await this.sleep(retryAfter(r) ?? backoff(attempt, this.random));
        continue;
      }
      throw err;
    }
  }

  private async json<T>(url: string, init?: RequestInit, o?: CallOptions): Promise<T> {
    return (await this.call(url, init, o)).json() as Promise<T>;
  }

  private async file(url: string, init?: RequestInit, o?: CallOptions): Promise<DriveFile> {
    return fromApi(await this.json<ApiFile>(url, init, o));
  }

  /** Todas las páginas de una consulta */
  private async query(q: string, fields: string, orderBy?: string): Promise<ApiFile[]> {
    const out: ApiFile[] = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({ q, fields: `nextPageToken,files(${fields})`, pageSize: '1000', spaces: 'drive', ...(orderBy ? { orderBy } : {}), ...(pageToken ? { pageToken } : {}) });
      const r = await this.json<{ files: ApiFile[]; nextPageToken?: string }>(`${API}/files?${params}`);
      out.push(...r.files);
      pageToken = r.nextPageToken ?? '';
    } while (pageToken);
    return out;
  }

  /** Un id para crear un archivo; reintentar la creación con el mismo id no lo duplica */
  private async newId(): Promise<string> {
    if (!this.shared.ids.length) {
      const r = await this.json<{ ids: string[] }>(`${API}/files/generateIds?${new URLSearchParams({ count: '10', space: 'drive', type: 'files' })}`);
      this.shared.ids.push(...r.ids);
    }
    return this.shared.ids.shift()!;
  }

  /** Datos de la cuenta (nombre, mail, foto); `about` acepta el scope drive.file */
  user(): Promise<DriveUser> {
    return this.json<{ user: DriveUser }>(`${API}/about?fields=user(displayName,emailAddress,photoLink)`).then((r) => r.user);
  }

  /**
   * Id de la carpeta TurboSpice (la crea si no existe). Se la busca por su marca (aunque el usuario
   * la haya movido o renombrado) o, las de antes de la marca, por nombre en la raíz. Si hay varias
   * (dos pestañas que la crearon a la vez), la marcada más vieja: siempre la misma.
   */
  folderId(): Promise<string> {
    this.shared.root ??= (async () => {
      const q = `mimeType = '${FOLDER_MIME}' and trashed = false and (appProperties has { key='${ROOT_MARK.key}' and value='${ROOT_MARK.value}' } or (name = ${qString(FOLDER_NAME)} and 'root' in parents))`;
      const found = await this.query(q, 'id,createdTime,appProperties', 'createdTime');
      const marked = found.filter((f) => f.appProperties?.[ROOT_MARK.key] === ROOT_MARK.value);
      const pick = marked[0] ?? found[0];
      if (pick) {
        // las de antes de la marca: se marca (si falla, se vuelve a encontrar por nombre)
        if (!marked.length) this.patchMeta(pick.id, { appProperties: { [ROOT_MARK.key]: ROOT_MARK.value } }).catch(() => {});
        return pick.id;
      }
      const id = await this.newId();
      try {
        await this.json(`${API}/files?fields=id`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, name: FOLDER_NAME, mimeType: FOLDER_MIME, parents: ['root'], appProperties: { [ROOT_MARK.key]: ROOT_MARK.value } }),
        });
      } catch (e) {
        // un reintento de la creación que ya había llegado
        if (errorKind(e) !== 'conflict') throw e;
      }
      return id;
    })();
    this.shared.root.catch(() => (this.shared.root = null));
    return this.shared.root;
  }

  /**
   * Todo lo que cuelga de la carpeta TurboSpice (subcarpetas, proyectos y los de la papelera), en una
   * sola consulta paginada: con `drive.file` Drive devuelve sólo lo que creó la app.
   */
  async library(): Promise<{ root: string; items: DriveItem[] }> {
    const root = await this.folderId();
    // (con y sin papelera: lo de la papelera se muestra aparte, para recuperarlo)
    const all = (await this.query('trashed = false or trashed = true', ITEM_FIELDS)).map(itemOf);
    const byId = new Map(all.map((f) => [f.id, f]));
    // ¿cuelga de la raíz? (memo; un ciclo raro corta)
    const under = new Map<string, boolean>();
    const inside = (f: DriveItem, depth = 0): boolean => {
      if (!f.parent || depth > 64) return false;
      if (f.parent === root) return true;
      const memo = under.get(f.id);
      if (memo !== undefined) return memo;
      const p = byId.get(f.parent);
      const r = !!p && inside(p, depth + 1);
      under.set(f.id, r);
      return r;
    };
    const items = all.filter((f) => f.id !== root && inside(f));
    this.shared.library = items;
    return { root, items };
  }

  /** Archivos (no carpetas) de una carpeta (la raíz si no se dice), el más reciente primero */
  async list(parent?: string): Promise<DriveFile[]> {
    const q = `${qString(parent ?? (await this.folderId()))} in parents and trashed = false and mimeType != '${FOLDER_MIME}'`;
    return (await this.query(q, FIELDS, 'modifiedTime desc')).map(fromApi).filter((f) => isProjectName(f.name));
  }

  /** Archivos de la carpeta raíz con este nombre exacto (el más reciente primero) */
  async find(name: string): Promise<DriveFile[]> {
    const q = `${qString(await this.folderId())} in parents and trashed = false and name = ${qString(name)}`;
    return (await this.query(q, FIELDS, 'modifiedTime desc')).map(fromApi);
  }

  /** Nombre, fecha, versión y carpeta actuales de un archivo */
  async meta(id: string): Promise<DriveItem> {
    return itemOf(await this.json<ApiFile>(`${API}/files/${encodeURIComponent(id)}?fields=${ITEM_FIELDS}`));
  }

  async download(id: string): Promise<Uint8Array> {
    const r = await this.call(`${API}/files/${encodeURIComponent(id)}?alt=media`, {}, { timeout: this.timeout * 4 });
    return new Uint8Array(await r.arrayBuffer());
  }

  private patchMeta(id: string, meta: object, params: Record<string, string> = {}): Promise<DriveFile> {
    return this.file(`${API}/files/${encodeURIComponent(id)}?${new URLSearchParams({ fields: FIELDS, ...params })}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meta),
    });
  }

  rename(id: string, name: string): Promise<DriveFile> {
    return this.patchMeta(id, { name });
  }

  /** Lo pasa de la carpeta `from` a `to` */
  move(id: string, to: string, from: string): Promise<DriveFile> {
    return this.patchMeta(id, {}, { addParents: to, removeParents: from });
  }

  /** Carpeta nueva dentro de `parent` (la raíz si no se dice) */
  async createFolder(name: string, parent?: string): Promise<DriveItem> {
    const id = await this.newId();
    const body = JSON.stringify({ id, name, mimeType: FOLDER_MIME, parents: [parent ?? (await this.folderId())], appProperties: { turbospice: 'folder' } });
    try {
      return itemOf(await this.json<ApiFile>(`${API}/files?fields=${ITEM_FIELDS}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }));
    } catch (e) {
      if (errorKind(e) === 'conflict') return this.meta(id);
      throw e;
    }
  }

  /** Copia con otro nombre, en `parent` (la raíz si no se dice) */
  async copy(id: string, name: string, parent?: string): Promise<DriveFile> {
    const newId = await this.newId();
    try {
      return await this.file(`${API}/files/${encodeURIComponent(id)}/copy?fields=${FIELDS}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newId, name, parents: [parent ?? (await this.folderId())] }),
      });
    } catch (e) {
      if (errorKind(e) === 'conflict') return this.meta(newId);
      throw e;
    }
  }

  /** A la papelera de Drive (se puede recuperar desde ahí) */
  async trash(id: string): Promise<void> {
    await this.patchMeta(id, { trashed: true });
  }

  /** Lo saca de la papelera */
  async restore(id: string): Promise<void> {
    await this.patchMeta(id, { trashed: false });
  }

  /**
   * Crea el archivo (sin `id`, en `parent` o en la raíz) o reemplaza su contenido (con `id`, sin
   * moverlo). La creación usa un id generado: si se reintenta, no queda duplicado.
   */
  async save(name: string, bytes: Uint8Array, id?: string, parent?: string): Promise<DriveFile> {
    const mime = mimeOf(name);
    const meta: Record<string, unknown> = { name, mimeType: mime };
    // los proyectos se marcan como de TurboSpice
    if (/\.turbo$/i.test(name)) meta.appProperties = { turbospice: '1' };
    const creating = !id;
    if (creating) {
      meta.id = await this.newId();
      meta.parents = [parent ?? (await this.folderId())];
    }
    const target = `${UPLOAD}/files${id ? `/${encodeURIComponent(id)}` : ''}`;
    const method = id ? 'PATCH' : 'POST';
    // las subidas tienen más tiempo: 30 s más 1 s por cada 100 kB
    const timeout = this.timeout + Math.round(bytes.length / 100_000) * 1000;
    try {
      if (bytes.length >= RESUMABLE_MIN) {
        // subida por partes: primero los metadatos (devuelve dónde subir), después el contenido
        const start = await this.call(`${target}?uploadType=resumable&fields=${FIELDS}`, {
          method,
          headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime },
          body: JSON.stringify(meta),
        });
        const at = start.headers.get('Location');
        if (!at) throw new DriveError('other', t("Google Drive: didn't say where to upload the file"));
        return await this.file(at, { method: 'PUT', headers: { 'Content-Type': mime }, body: bytes as BlobPart }, { timeout });
      }
      const { body, contentType } = multipart(meta, bytes, undefined, mime);
      return await this.file(`${target}?uploadType=multipart&fields=${FIELDS}`, { method, headers: { 'Content-Type': contentType }, body: body as BlobPart }, { timeout });
    } catch (e) {
      // la creación ya había llegado en un intento anterior: se reemplaza su contenido
      if (creating && errorKind(e) === 'conflict') return this.save(name, bytes, meta.id as string);
      throw e;
    }
  }
}

/** Nombre que no choca con los de la carpeta: «x.asc», «x (2).asc»… (.turbo se respeta; sin extensión, .asc) */
export function uniqueName(name: string, taken: string[]): string {
  const ext = /\.turbo$/i.test(name) ? '.turbo' : '.asc';
  const base = name.replace(/\.(asc|turbo)$/i, '');
  const used = new Set(taken.map((tt) => tt.toLowerCase()));
  let n = `${base}${ext}`;
  for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base} (${i})${ext}`;
  return n;
}

/** Nombre de carpeta que no choca con las de al lado: «Nueva carpeta», «Nueva carpeta (2)»… */
export function uniqueFolderName(name: string, taken: string[]): string {
  const used = new Set(taken.map((tt) => tt.toLowerCase()));
  let n = name;
  for (let i = 2; used.has(n.toLowerCase()); i++) n = `${name} (${i})`;
  return n;
}

/** Cuerpo multipart/related (metadatos JSON + contenido) para las subidas de Drive */
export function multipart(meta: object, bytes: Uint8Array, boundary = `turbospice${Math.random().toString(36).slice(2)}`, mime = ASC_MIME) {
  const enc = new TextEncoder();
  const head = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` + `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`);
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

// ── árbol de la librería (puro, para la interfaz) ───────────────────────

/** Carpetas desde la raíz hasta `id` (sin la raíz; vacío si `id` es la raíz) */
export function folderPath(items: DriveItem[], id: string | undefined, root: string): DriveItem[] {
  const byId = new Map(items.map((f) => [f.id, f]));
  const out: DriveItem[] = [];
  for (let cur = id, n = 0; cur && cur !== root && n < 64; n++) {
    const f = byId.get(cur);
    if (!f) break;
    out.unshift(f);
    cur = f.parent;
  }
  return out;
}

/** ¿`id` está dentro de `ancestor` (o es él)? (para no mover una carpeta adentro de sí misma) */
export function isWithin(items: DriveItem[], id: string, ancestor: string): boolean {
  const byId = new Map(items.map((f) => [f.id, f]));
  for (let cur: string | undefined = id, n = 0; cur && n < 64; n++) {
    if (cur === ancestor) return true;
    cur = byId.get(cur)?.parent;
  }
  return false;
}
