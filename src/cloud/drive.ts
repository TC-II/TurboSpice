// Google Drive (API REST v3) con el scope `drive.file`: la app sólo ve los archivos que creó
// ella misma. Los proyectos (.turbo, JSON) y los .asc se guardan en una carpeta "TurboSpice" en
// la raíz del Drive del usuario. Cada archivo trae su `version` (sube con cada cambio): así se
// detecta que otra pestaña u otra máquina lo cambió antes de pisarlo (#156).
// No depende de React ni de Google Identity Services: recibe una función que da el token.

export const FOLDER_NAME = 'TurboSpice';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ASC_MIME = 'application/octet-stream';
const TURBO_MIME = 'application/json';
const FIELDS = 'id,name,modifiedTime,version';
/** Desde este tamaño se sube por partes (la subida multipart admite hasta 5 MB) */
export const RESUMABLE_MIN = 5 * 1024 * 1024;
const mimeOf = (name: string) => (/\.turbo$/i.test(name) ? TURBO_MIME : ASC_MIME);
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
  /** número de versión de Drive (cambia con cada modificación) */
  version?: string;
}

export interface DriveUser {
  displayName: string;
  emailAddress?: string;
  photoLink?: string;
}

/** Token de acceso válido (puede pedir uno nuevo); `force` descarta el actual */
export type TokenSource = (force?: boolean) => Promise<string>;

/** Literal de cadena para las consultas `q` de Drive */
export const qString = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export class DriveClient {
  private folder: Promise<string> | null = null;

  constructor(
    private token: TokenSource,
    private fetchFn: typeof fetch = (...a) => fetch(...a),
  ) {}

  /** fetch autenticado; un 401 (token vencido o revocado) se reintenta una vez con token nuevo */
  private async call(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${await this.token(!retry)}`);
    const r = await this.fetchFn(url, { ...init, headers });
    if (r.status === 401 && retry) return this.call(url, init, false);
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try {
        msg = ((await r.json()) as { error?: { message?: string } }).error?.message ?? msg;
      } catch {
        // cuerpo no JSON
      }
      throw new Error(`Google Drive: ${msg}`);
    }
    return r;
  }

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    return (await this.call(url, init)).json() as Promise<T>;
  }

  /** Datos de la cuenta (nombre, mail, foto); `about` acepta el scope drive.file */
  user(): Promise<DriveUser> {
    return this.json<{ user: DriveUser }>(`${API}/about?fields=user(displayName,emailAddress,photoLink)`).then((r) => r.user);
  }

  /** Id de la carpeta TurboSpice (la crea si no existe) */
  folderId(): Promise<string> {
    this.folder ??= (async () => {
      const q = `name = ${qString(FOLDER_NAME)} and mimeType = '${FOLDER_MIME}' and 'root' in parents and trashed = false`;
      const r = await this.json<{ files: DriveFile[] }>(`${API}/files?${new URLSearchParams({ q, fields: 'files(id)', spaces: 'drive' })}`);
      if (r.files[0]) return r.files[0].id;
      const created = await this.json<DriveFile>(`${API}/files?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME, parents: ['root'] }),
      });
      return created.id;
    })();
    this.folder.catch(() => (this.folder = null));
    return this.folder;
  }

  /** Esquemáticos de la carpeta, el más reciente primero */
  async list(): Promise<DriveFile[]> {
    const q = `${qString(await this.folderId())} in parents and trashed = false and mimeType != '${FOLDER_MIME}'`;
    const params = new URLSearchParams({ q, fields: `files(${FIELDS})`, orderBy: 'modifiedTime desc', pageSize: '200', spaces: 'drive' });
    const r = await this.json<{ files: DriveFile[] }>(`${API}/files?${params}`);
    return r.files.filter((f) => /\.(turbo|asc)$/i.test(f.name));
  }

  /** Nombre, fecha y versión actuales de un archivo */
  meta(id: string): Promise<DriveFile> {
    return this.json<DriveFile>(`${API}/files/${encodeURIComponent(id)}?fields=${FIELDS}`);
  }

  async download(id: string): Promise<Uint8Array> {
    const r = await this.call(`${API}/files/${encodeURIComponent(id)}?alt=media`);
    return new Uint8Array(await r.arrayBuffer());
  }

  private patchMeta(id: string, meta: object): Promise<DriveFile> {
    return this.json<DriveFile>(`${API}/files/${encodeURIComponent(id)}?fields=${FIELDS}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meta),
    });
  }

  rename(id: string, name: string): Promise<DriveFile> {
    return this.patchMeta(id, { name });
  }

  /** Copia en la misma carpeta, con otro nombre */
  async copy(id: string, name: string): Promise<DriveFile> {
    return this.json<DriveFile>(`${API}/files/${encodeURIComponent(id)}/copy?fields=${FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [await this.folderId()] }),
    });
  }

  /** A la papelera de Drive (se puede recuperar desde ahí) */
  async trash(id: string): Promise<void> {
    await this.patchMeta(id, { trashed: true });
  }

  /** Crea el archivo en la carpeta (sin `id`) o reemplaza su contenido (con `id`) */
  async save(name: string, bytes: Uint8Array, id?: string): Promise<DriveFile> {
    const mime = mimeOf(name);
    const meta: Record<string, unknown> = { name, mimeType: mime };
    // los proyectos se marcan como de TurboSpice
    if (mime === TURBO_MIME) meta.appProperties = { turbospice: '1' };
    if (!id) meta.parents = [await this.folderId()];
    const target = `${UPLOAD}/files${id ? `/${encodeURIComponent(id)}` : ''}`;
    const method = id ? 'PATCH' : 'POST';
    if (bytes.length >= RESUMABLE_MIN) {
      // subida por partes: primero los metadatos (devuelve dónde subir), después el contenido
      const start = await this.call(`${target}?uploadType=resumable&fields=${FIELDS}`, {
        method,
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime },
        body: JSON.stringify(meta),
      });
      const at = start.headers.get('Location');
      if (!at) throw new Error('Google Drive: no devolvió dónde subir el archivo');
      return this.json<DriveFile>(at, { method: 'PUT', headers: { 'Content-Type': mime }, body: bytes as BlobPart });
    }
    const { body, contentType } = multipart(meta, bytes, undefined, mime);
    return this.json<DriveFile>(`${target}?uploadType=multipart&fields=${FIELDS}`, { method, headers: { 'Content-Type': contentType }, body: body as BlobPart });
  }

}

/** Nombre que no choca con los de la carpeta: «x.asc», «x (2).asc»… (.turbo se respeta; sin extensión, .asc) */
export function uniqueName(name: string, taken: string[]): string {
  const ext = /\.turbo$/i.test(name) ? '.turbo' : '.asc';
  const base = name.replace(/\.(asc|turbo)$/i, '');
  const used = new Set(taken.map((t) => t.toLowerCase()));
  let n = `${base}${ext}`;
  for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base} (${i})${ext}`;
  return n;
}

/** Cuerpo multipart/related (metadatos JSON + contenido) para las subidas de Drive */
export function multipart(meta: object, bytes: Uint8Array, boundary = `turbospice${Math.random().toString(36).slice(2)}`, mime = ASC_MIME) {
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}
