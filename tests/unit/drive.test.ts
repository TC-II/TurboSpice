import { describe, expect, it } from 'vitest';
import { ATTEMPTS, DriveClient, DriveError, backoff, folderPath, isWithin, multipart, qString, RESUMABLE_MIN, uniqueFolderName, uniqueName, type DriveItem } from '../../src/cloud/drive.ts';

type Call = { url: string; method: string; auth: string | null; body?: unknown; contentType: string | null };

/** fetch falso: responde según una lista de manejadores y registra las llamadas */
function fakeFetch(handlers: ((c: Call) => Response | Promise<Response> | undefined)[]) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    const c: Call = { url: String(input), method: init?.method ?? 'GET', auth: h.get('Authorization'), body: init?.body, contentType: h.get('Content-Type') };
    calls.push(c);
    for (const handler of handlers) {
      const r = handler(c);
      if (r) return r;
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  return { fn, calls };
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
const q = (c: Call) => new URL(c.url).searchParams.get('q') ?? '';
const isRootQuery = (c: Call) => c.method === 'GET' && q(c).includes("name = 'TurboSpice'");
const ids = (c: Call) => (c.url.includes('/generateIds') ? json({ ids: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10'] }) : undefined);
const root =
  (id = 'F1') =>
  (c: Call) =>
    isRootQuery(c) ? json({ files: [{ id, appProperties: { turbospice: 'root' } }] }) : undefined;
/** cliente sin esperas reales entre reintentos */
const client = (fn: typeof fetch, token = async () => 'tok', extra: { sleeps?: number[]; timeout?: number } = {}) =>
  new DriveClient(token, { fetch: fn, sleep: async (ms) => void extra.sleeps?.push(ms), random: () => 0.5, timeout: extra.timeout });

describe('Google Drive', () => {
  it('escapa los literales de las consultas', () => {
    expect(qString("Juan's \\ x")).toBe("'Juan\\'s \\\\ x'");
  });

  it('arma el cuerpo multipart con metadatos y contenido binario', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x56, 0x00]);
    const { body, contentType } = multipart({ name: 'a.asc' }, bytes, 'B');
    expect(contentType).toBe('multipart/related; boundary=B');
    const text = new TextDecoder('latin1').decode(body);
    expect(text.startsWith('--B\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{"name":"a.asc"}\r\n--B\r\n')).toBe(true);
    expect(text.endsWith('\r\n--B--\r\n')).toBe(true);
    // los bytes van tal cual (UTF-16 con BOM no se toca)
    const at = body.indexOf(0xff);
    expect([...body.slice(at, at + 4)]).toEqual([...bytes]);
  });

  it('crea la carpeta TurboSpice (marcada) una sola vez, con un id generado, y guarda adentro', async () => {
    const { fn, calls } = fakeFetch([
      (c) => (isRootQuery(c) ? json({ files: [] }) : undefined),
      ids,
      (c) => (c.method === 'POST' && !c.url.includes('/upload/') ? json({ id: 'G2' }) : undefined),
      (c) => (c.method === 'POST' && c.url.includes('/upload/') ? json({ id: 'G1', name: 'x.asc' }) : undefined),
    ]);
    const d = client(fn);
    expect(await d.save('x.asc', new Uint8Array([1]))).toEqual({ id: 'G1', name: 'x.asc' });
    await d.save('y.asc', new Uint8Array([2]));
    const folders = calls.filter((c) => c.method === 'POST' && !c.url.includes('/upload/'));
    expect(folders).toHaveLength(1);
    expect(JSON.parse(folders[0].body as string)).toEqual({ id: 'G2', name: 'TurboSpice', mimeType: 'application/vnd.google-apps.folder', parents: ['root'], appProperties: { turbospice: 'root' } });
    // los ids se piden de a 10, una vez
    expect(calls.filter((c) => c.url.includes('/generateIds'))).toHaveLength(1);
    const upload = calls.find((c) => c.url.includes('/upload/'))!;
    expect(upload.auth).toBe('Bearer tok');
    const meta = new TextDecoder().decode(upload.body as Uint8Array);
    expect(meta).toContain('"parents":["G2"]');
    expect(meta).toContain('"id":"G1"');
  });

  it('encuentra la carpeta aunque la hayan movido (por su marca), y prefiere la marcada a una vieja sin marcar', async () => {
    const { fn, calls } = fakeFetch([
      (c) =>
        isRootQuery(c)
          ? json({
              files: [
                { id: 'OLD', createdTime: '2020-01-01' },
                { id: 'MARKED', createdTime: '2024-01-01', appProperties: { turbospice: 'root' } },
              ],
            })
          : undefined,
    ]);
    expect(await client(fn).folderId()).toBe('MARKED');
    expect(q(calls[0])).toContain("appProperties has { key='turbospice' and value='root' }");
    expect(new URL(calls[0].url).searchParams.get('orderBy')).toBe('createdTime');
    // y no toca nada
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  it('la carpeta de antes de la marca: la usa (la más vieja, si hay dos) y la marca', async () => {
    const { fn, calls } = fakeFetch([
      (c) => (isRootQuery(c) ? json({ files: [{ id: 'A' }, { id: 'B' }] }) : undefined),
      (c) => (c.method === 'PATCH' ? json({ id: 'A', name: 'TurboSpice' }) : undefined),
    ]);
    expect(await client(fn).folderId()).toBe('A');
    await new Promise((r) => setTimeout(r));
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.url).toContain('/files/A?');
    expect(JSON.parse(patch.body as string)).toEqual({ appProperties: { turbospice: 'root' } });
  });

  it('reemplaza el contenido de un archivo existente sin moverlo', async () => {
    const { fn, calls } = fakeFetch([(c) => (c.method === 'PATCH' ? json({ id: 'A1', name: 'x.asc' }) : undefined)]);
    await client(fn).save('x.asc', new Uint8Array([1]), 'A1');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/upload/drive/v3/files/A1?uploadType=multipart');
    expect(new TextDecoder().decode(calls[0].body as Uint8Array)).not.toContain('parents');
  });

  it('crea en la carpeta que se le dice', async () => {
    const { fn, calls } = fakeFetch([ids, (c) => (c.method === 'POST' ? json({ id: 'G1', name: 'p.turbo' }) : undefined)]);
    await client(fn).save('p.turbo', new Uint8Array([1]), undefined, 'SUB');
    expect(new TextDecoder().decode(calls.at(-1)!.body as Uint8Array)).toContain('"parents":["SUB"]');
    // (sin buscar la raíz)
    expect(calls.some(isRootQuery)).toBe(false);
  });

  it('lista sólo los proyectos de la carpeta, con todas las páginas', async () => {
    const { fn, calls } = fakeFetch([
      root(),
      (c) =>
        q(c).includes("'F1' in parents")
          ? new URL(c.url).searchParams.get('pageToken') === 'p2'
            ? json({ files: [{ id: '3', name: 'b.turbo' }] })
            : json({
                files: [
                  { id: '1', name: 'a.asc' },
                  { id: '2', name: 'notas.txt' },
                ],
                nextPageToken: 'p2',
              })
          : undefined,
    ]);
    expect(await client(fn).list()).toEqual([
      { id: '1', name: 'a.asc' },
      { id: '3', name: 'b.turbo' },
    ]);
    expect(new URL(calls[1].url).searchParams.get('orderBy')).toBe('modifiedTime desc');
  });

  it('con un 401 pide un token nuevo y reintenta', async () => {
    const forced: boolean[] = [];
    const { fn, calls } = fakeFetch([(c) => (c.auth === 'Bearer viejo' ? json({}, 401) : json({ user: { displayName: 'Ana' } }))]);
    const d = client(fn, async (force?: boolean) => (forced.push(!!force), force ? 'nuevo' : 'viejo'));
    expect(await d.user()).toEqual({ displayName: 'Ana' });
    expect(forced).toEqual([false, true]);
    expect(calls.map((c) => c.auth)).toEqual(['Bearer viejo', 'Bearer nuevo']);
  });

  it('un 401 que sigue con el token nuevo es un error de sesión', async () => {
    const { fn } = fakeFetch([() => json({}, 401)]);
    await expect(client(fn).user()).rejects.toMatchObject({ kind: 'auth' });
  });

  it('lo pasajero (5xx, 429, límite de pedidos, sin conexión) se reintenta con espera creciente', async () => {
    let n = 0;
    const sleeps: number[] = [];
    const { fn, calls } = fakeFetch([
      () => {
        n++;
        if (n === 1) return json({ error: { message: 'boom' } }, 503);
        if (n === 2) return json({ error: { message: 'slow', errors: [{ reason: 'userRateLimitExceeded' }] } }, 403);
        if (n === 3) return Promise.reject(new TypeError('Failed to fetch'));
        return json({ user: { displayName: 'Ana' } });
      },
    ]);
    expect(await client(fn, undefined, { sleeps }).user()).toEqual({ displayName: 'Ana' });
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([backoff(0, () => 0.5), backoff(1, () => 0.5), backoff(2, () => 0.5)]);
    expect(sleeps[0]).toBeLessThan(sleeps[1]);
  });

  it('respeta Retry-After', async () => {
    let n = 0;
    const sleeps: number[] = [];
    const { fn } = fakeFetch([() => (n++ ? json({ user: { displayName: 'Ana' } }) : new Response('{}', { status: 429, headers: { 'Retry-After': '3' } }))]);
    await client(fn, undefined, { sleeps }).user();
    expect(sleeps).toEqual([3000]);
  });

  it('después de los intentos, el error llega con su tipo', async () => {
    const { fn, calls } = fakeFetch([() => json({ error: { message: 'down' } }, 500)]);
    const e = await client(fn)
      .download('X')
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(DriveError);
    expect(e).toMatchObject({ kind: 'server', status: 500, retryable: true });
    expect(calls).toHaveLength(ATTEMPTS);
  });

  it('sin conexión: «offline», después de reintentar', async () => {
    const { fn, calls } = fakeFetch([() => Promise.reject(new TypeError('Failed to fetch'))]);
    await expect(client(fn).download('X')).rejects.toMatchObject({ kind: 'offline' });
    expect(calls).toHaveLength(ATTEMPTS);
  });

  it('una llamada que no contesta se corta (tiempo máximo)', async () => {
    const hang = (async (_: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as typeof fetch;
    await expect(client(hang, undefined, { timeout: 5 }).download('X')).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('lo que no es pasajero no se reintenta: sin permiso, no existe, Drive lleno', async () => {
    for (const [status, body, kind] of [
      [403, { error: { message: 'no', errors: [{ reason: 'insufficientFilePermissions' }] } }, 'forbidden'],
      [404, { error: { message: 'File not found' } }, 'notFound'],
      [403, { error: { message: 'full', errors: [{ reason: 'storageQuotaExceeded' }] } }, 'storageQuota'],
    ] as const) {
      const { fn, calls } = fakeFetch([() => json(body, status)]);
      await expect(client(fn).download('X')).rejects.toMatchObject({ kind });
      expect(calls).toHaveLength(1);
    }
  });

  it('una creación que se reintenta y ya había llegado (409 con el id generado) no duplica: reemplaza ése', async () => {
    const { fn, calls } = fakeFetch([
      ids,
      (c) => (c.method === 'POST' ? json({ error: { message: 'A file already exists with the provided ID.' } }, 409) : undefined),
      (c) => (c.method === 'PATCH' && c.url.includes('/files/G1?') ? json({ id: 'G1', name: 'p.turbo' }) : undefined),
    ]);
    expect((await client(fn).save('p.turbo', new Uint8Array([1]), undefined, 'SUB')).id).toBe('G1');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('renombra, mueve, duplica en una carpeta, manda a la papelera y la recupera', async () => {
    const { fn, calls } = fakeFetch([
      root(),
      ids,
      (c) => (c.method === 'PATCH' ? json({ id: 'A1', name: 'b.asc' }) : undefined),
      (c) => (c.method === 'POST' && c.url.includes('/copy') ? json({ id: 'G1', name: 'a (copia).asc' }) : undefined),
    ]);
    const d = client(fn);
    expect(await d.rename('A1', 'b.asc')).toEqual({ id: 'A1', name: 'b.asc' });
    expect(JSON.parse(calls.at(-1)!.body as string)).toEqual({ name: 'b.asc' });
    await d.move('A1', 'TO', 'FROM');
    const mv = new URL(calls.at(-1)!.url);
    expect([mv.searchParams.get('addParents'), mv.searchParams.get('removeParents')]).toEqual(['TO', 'FROM']);
    expect((await d.copy('A1', 'a (copia).asc', 'SUB')).id).toBe('G1');
    expect(calls.at(-1)!.url).toContain('/files/A1/copy');
    expect(JSON.parse(calls.at(-1)!.body as string)).toEqual({ id: 'G1', name: 'a (copia).asc', parents: ['SUB'] });
    await d.trash('A1');
    expect(JSON.parse(calls.at(-1)!.body as string)).toEqual({ trashed: true });
    await d.restore('A1');
    expect(JSON.parse(calls.at(-1)!.body as string)).toEqual({ trashed: false });
  });

  it('carpeta nueva, marcada y con id generado', async () => {
    const { fn, calls } = fakeFetch([root(), ids, (c) => (c.method === 'POST' ? json({ id: 'G1', name: 'Filtros', mimeType: 'application/vnd.google-apps.folder', parents: ['F1'] }) : undefined)]);
    const f = await client(fn).createFolder('Filtros');
    expect(f).toMatchObject({ id: 'G1', name: 'Filtros', folder: true, parent: 'F1' });
    expect(JSON.parse(calls.at(-1)!.body as string)).toEqual({ id: 'G1', name: 'Filtros', mimeType: 'application/vnd.google-apps.folder', parents: ['F1'], appProperties: { turbospice: 'folder' } });
  });

  it('la librería: todo lo que cuelga de la carpeta, a cualquier profundidad, con lo de la papelera marcado', async () => {
    const FOLDER = 'application/vnd.google-apps.folder';
    const { fn, calls } = fakeFetch([
      root('R'),
      (c) =>
        c.url.includes('/files?') && !isRootQuery(c)
          ? json({
              files: [
                { id: 'R', name: 'TurboSpice', mimeType: FOLDER, parents: ['root'] },
                { id: 'A', name: 'Filtros', mimeType: FOLDER, parents: ['R'] },
                { id: 'B', name: 'Activos', mimeType: FOLDER, parents: ['A'] },
                { id: 'p1', name: 'RC.turbo', parents: ['B'], headRevisionId: 'r1' },
                { id: 'p2', name: 'Viejo.turbo', parents: ['R'], trashed: true, explicitlyTrashed: true },
                { id: 'x', name: 'ajeno.turbo', parents: ['OTRA'] },
              ],
            })
          : undefined,
    ]);
    const { root: r, items } = await client(fn).library();
    expect(r).toBe('R');
    expect(items.map((f) => f.id).sort()).toEqual(['A', 'B', 'p1', 'p2']);
    expect(items.find((f) => f.id === 'p1')).toMatchObject({ parent: 'B', version: 'r1', folder: false });
    expect(items.find((f) => f.id === 'p2')).toMatchObject({ trashed: true, explicitlyTrashed: true });
    expect(q(calls.at(-1)!)).toBe('trashed = false or trashed = true');
    expect(folderPath(items, 'B', 'R').map((f) => f.name)).toEqual(['Filtros', 'Activos']);
  });

  it('nombres que no pisan los de la carpeta', () => {
    expect(uniqueName('a.asc', [])).toBe('a.asc');
    expect(uniqueName('a', ['A.asc'])).toBe('a (2).asc');
    expect(uniqueName('a.asc', ['a.asc', 'a (2).asc'])).toBe('a (3).asc');
    expect(uniqueName('p.turbo', ['p.turbo'])).toBe('p (2).turbo');
    expect(uniqueFolderName('Nueva carpeta', ['nueva carpeta', 'Nueva carpeta (2)'])).toBe('Nueva carpeta (3)');
  });

  it('isWithin: una carpeta no se puede mover adentro de sí misma', () => {
    const items = [
      { id: 'A', name: 'A', folder: true, parent: 'R' },
      { id: 'B', name: 'B', folder: true, parent: 'A' },
    ] as DriveItem[];
    expect(isWithin(items, 'B', 'A')).toBe(true);
    expect(isWithin(items, 'A', 'A')).toBe(true);
    expect(isWithin(items, 'A', 'B')).toBe(false);
  });

  it('un .turbo va como JSON marcado de TurboSpice, y se pide su versión (#156)', async () => {
    const { fn, calls } = fakeFetch([
      (c) => (c.method === 'PATCH' ? json({ id: 'A1', name: 'p.turbo', headRevisionId: 'r7' }) : undefined),
      (c) => (c.method === 'GET' && c.url.includes('/files/A1?') ? json({ id: 'A1', name: 'p.turbo', headRevisionId: 'r8', parents: ['F1'] }) : undefined),
    ]);
    const d = client(fn);
    expect((await d.save('p.turbo', new TextEncoder().encode('{}'), 'A1')).version).toBe('r7');
    const body = new TextDecoder().decode(calls[0].body as Uint8Array);
    expect(body).toContain('"mimeType":"application/json","appProperties":{"turbospice":"1"}');
    expect(body).toMatch(/Content-Type: application\/json\s+\{\}/);
    // la revisión del contenido, no `version` de Drive (que sube sola después de escribir, #176)
    expect(calls[0].url).toContain('fields=id,name,modifiedTime,headRevisionId');
    expect(await d.meta('A1')).toMatchObject({ version: 'r8', parent: 'F1' });
  });

  it('desde 5 MB sube por partes', async () => {
    const { fn, calls } = fakeFetch([
      (c) => (c.url.includes('uploadType=resumable') ? new Response('', { status: 200, headers: { Location: 'https://upload.example/s1' } }) : undefined),
      (c) => (c.method === 'PUT' && c.url === 'https://upload.example/s1' ? json({ id: 'A1', name: 'p.turbo', headRevisionId: '2' }) : undefined),
    ]);
    const r = await client(fn).save('p.turbo', new Uint8Array(RESUMABLE_MIN), 'A1');
    expect(r.version).toBe('2');
    expect(calls.map((c) => c.method)).toEqual(['PATCH', 'PUT']);
    expect(JSON.parse(calls[0].body as string).name).toBe('p.turbo');
    expect((calls[1].body as Uint8Array).length).toBe(RESUMABLE_MIN);
  });

  it('el cliente de fondo comparte la carpeta con el interactivo', async () => {
    const { fn, calls } = fakeFetch([root()]);
    const d = client(fn);
    const bg = d.withToken(async () => 'bg');
    expect(await d.folderId()).toBe('F1');
    expect(await bg.folderId()).toBe('F1');
    expect(calls.filter(isRootQuery)).toHaveLength(1);
  });
});
