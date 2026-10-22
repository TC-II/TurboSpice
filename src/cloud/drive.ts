// Google Drive (API REST v3) con el scope `drive.file`: la app sólo ve los archivos que creó
// ella misma. Los .asc se guardan en una carpeta "TurboSpice" en la raíz del Drive del usuario.
// No depende de React ni de Google Identity Services: recibe una función que da el token.

export const FOLDER_NAME = 'TurboSpice';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ASC_MIME = 'application/octet-stream';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
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
    const params = new URLSearchParams({ q, fields: 'files(id,name,modifiedTime)', orderBy: 'modifiedTime desc', pageSize: '200', spaces: 'drive' });
    const r = await this.json<{ files: DriveFile[] }>(`${API}/files?${params}`);
    return r.files.filter((f) => /\.(turbo|asc)$/i.test(f.name));
  }

  async download(id: string): Promise<Uint8Array> {
    const r = await this.call(`${API}/files/${encodeURIComponent(id)}?alt=media`);
    return new Uint8Array(await r.arrayBuffer());
  }

  private patchMeta(id: string, meta: object): Promise<DriveFile> {
    return this.json<DriveFile>(`${API}/files/${encodeURIComponent(id)}?fields=id,name,modifiedTime`, {
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
    return this.json<DriveFile>(`${API}/files/${encodeURIComponent(id)}/copy?fields=id,name,modifiedTime`, {
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
    const meta: Record<string, unknown> = { name };
    if (!id) meta.parents = [await this.folderId()];
    const { body, contentType } = multipart(meta, bytes);
    const url = id
      ? `${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=multipart&fields=id,name,modifiedTime`
      : `${UPLOAD}/files?uploadType=multipart&fields=id,name,modifiedTime`;
    return this.json<DriveFile>(url, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': contentType }, body: body as BlobPart });
  }
}

/** Nombre .asc que no choca con los de la carpeta: «x.asc», «x (2).asc», «x (3).asc»… */
export function uniqueName(name: string, taken: string[]): string {
  const base = name.replace(/\.asc$/i, '');
  const used = new Set(taken.map((t) => t.toLowerCase()));
  let n = `${base}.asc`;
  for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base} (${i}).asc`;
  return n;
}

/** Cuerpo multipart/related (metadatos JSON + contenido) para las subidas de Drive */
export function multipart(meta: object, bytes: Uint8Array, boundary = `turbospice${Math.random().toString(36).slice(2)}`) {
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: ${ASC_MIME}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}
