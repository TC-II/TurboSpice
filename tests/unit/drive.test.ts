import { describe, expect, it } from 'vitest';
import { DriveClient, multipart, qString, RESUMABLE_MIN, uniqueName } from '../../src/cloud/drive.ts';

type Call = { url: string; method: string; auth: string | null; body?: unknown; contentType: string | null };

/** fetch falso: responde según una lista de manejadores y registra las llamadas */
function fakeFetch(handlers: ((c: Call) => Response | undefined)[]) {
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

  it('crea la carpeta TurboSpice una sola vez y guarda adentro', async () => {
    const { fn, calls } = fakeFetch([
      (c) => (c.method === 'GET' && q(c).includes("name = 'TurboSpice'") ? json({ files: [] }) : undefined),
      (c) => (c.method === 'POST' && !c.url.includes('/upload/') ? json({ id: 'F1' }) : undefined),
      (c) => (c.method === 'POST' && c.url.includes('/upload/') ? json({ id: 'A1', name: 'x.asc' }) : undefined),
    ]);
    const d = new DriveClient(async () => 'tok', fn);
    expect(await d.save('x.asc', new Uint8Array([1]))).toEqual({ id: 'A1', name: 'x.asc' });
    await d.save('y.asc', new Uint8Array([2]));
    expect(calls.filter((c) => c.method === 'POST' && !c.url.includes('/upload/'))).toHaveLength(1);
    const folder = calls.find((c) => c.method === 'POST' && !c.url.includes('/upload/'))!;
    expect(JSON.parse(folder.body as string)).toEqual({ name: 'TurboSpice', mimeType: 'application/vnd.google-apps.folder', parents: ['root'] });
    const upload = calls.find((c) => c.url.includes('/upload/'))!;
    expect(upload.auth).toBe('Bearer tok');
    expect(new TextDecoder().decode(upload.body as Uint8Array)).toContain('"parents":["F1"]');
  });

  it('reemplaza el contenido de un archivo existente sin moverlo', async () => {
    const { fn, calls } = fakeFetch([(c) => (c.method === 'PATCH' ? json({ id: 'A1', name: 'x.asc' }) : undefined)]);
    await new DriveClient(async () => 'tok', fn).save('x.asc', new Uint8Array([1]), 'A1');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/upload/drive/v3/files/A1?uploadType=multipart');
    expect(new TextDecoder().decode(calls[0].body as Uint8Array)).not.toContain('parents');
  });

  it('lista sólo los .asc de la carpeta', async () => {
    const { fn, calls } = fakeFetch([
      (c) => (q(c).includes("name = 'TurboSpice'") ? json({ files: [{ id: 'F1' }] }) : undefined),
      (c) => (q(c).includes("'F1' in parents") ? json({ files: [{ id: '1', name: 'a.asc' }, { id: '2', name: 'notas.txt' }] }) : undefined),
    ]);
    expect(await new DriveClient(async () => 'tok', fn).list()).toEqual([{ id: '1', name: 'a.asc' }]);
    expect(new URL(calls[1].url).searchParams.get('orderBy')).toBe('modifiedTime desc');
  });

  it('con un 401 pide un token nuevo y reintenta', async () => {
    const forced: boolean[] = [];
    const { fn, calls } = fakeFetch([(c) => (c.auth === 'Bearer viejo' ? json({}, 401) : json({ user: { displayName: 'Ana' } }))]);
    const d = new DriveClient(async (force) => (forced.push(!!force), force ? 'nuevo' : 'viejo'), fn);
    expect(await d.user()).toEqual({ displayName: 'Ana' });
    expect(forced).toEqual([false, true]);
    expect(calls.map((c) => c.auth)).toEqual(['Bearer viejo', 'Bearer nuevo']);
  });

  it('los errores de la API llegan con su mensaje', async () => {
    const { fn } = fakeFetch([() => json({ error: { message: 'Quota exceeded' } }, 403)]);
    await expect(new DriveClient(async () => 'tok', fn).download('X')).rejects.toThrow('Google Drive: Quota exceeded');
  });

  it('renombra, duplica en la carpeta y manda a la papelera', async () => {
    const { fn, calls } = fakeFetch([
      (c) => (c.method === 'GET' && q(c).includes("name = 'TurboSpice'") ? json({ files: [{ id: 'F1' }] }) : undefined),
      (c) => (c.method === 'PATCH' ? json({ id: 'A1', name: 'b.asc' }) : undefined),
      (c) => (c.method === 'POST' && c.url.includes('/copy') ? json({ id: 'A2', name: 'a (copia).asc' }) : undefined),
    ]);
    const d = new DriveClient(async () => 'tok', fn);
    expect(await d.rename('A1', 'b.asc')).toEqual({ id: 'A1', name: 'b.asc' });
    expect(JSON.parse(calls.at(-1)!.body as string)).toEqual({ name: 'b.asc' });
    expect((await d.copy('A1', 'a (copia).asc')).id).toBe('A2');
    expect(calls.at(-1)!.url).toContain('/files/A1/copy');
    expect(JSON.parse(calls.at(-1)!.body as string)).toEqual({ name: 'a (copia).asc', parents: ['F1'] });
    await d.trash('A1');
    expect(calls.at(-1)!.method).toBe('PATCH');
    expect(JSON.parse(calls.at(-1)!.body as string)).toEqual({ trashed: true });
  });

  it('nombres que no pisan los de la carpeta', () => {
    expect(uniqueName('a.asc', [])).toBe('a.asc');
    expect(uniqueName('a', ['A.asc'])).toBe('a (2).asc');
    expect(uniqueName('a.asc', ['a.asc', 'a (2).asc'])).toBe('a (3).asc');
  });

  it('un .turbo va como JSON marcado de TurboSpice, y se pide su versión (#156)', async () => {
    const { fn, calls } = fakeFetch([
      (c) => (c.method === 'PATCH' ? json({ id: 'A1', name: 'p.turbo', headRevisionId: 'r7' }) : undefined),
      (c) => (c.method === 'GET' && c.url.includes('/files/A1?') ? json({ id: 'A1', name: 'p.turbo', headRevisionId: 'r8' }) : undefined),
    ]);
    const d = new DriveClient(async () => 'tok', fn);
    expect((await d.save('p.turbo', new TextEncoder().encode('{}'), 'A1')).version).toBe('r7');
    const body = new TextDecoder().decode(calls[0].body as Uint8Array);
    expect(body).toContain('"mimeType":"application/json","appProperties":{"turbospice":"1"}');
    expect(body).toMatch(/Content-Type: application\/json\s+\{\}/);
    // la revisión del contenido, no `version` de Drive (que sube sola después de escribir, #176)
    expect(calls[0].url).toContain('fields=id,name,modifiedTime,headRevisionId');
    expect((await d.meta('A1')).version).toBe('r8');
  });

  it('desde 5 MB sube por partes', async () => {
    const { fn, calls } = fakeFetch([
      (c) => (c.url.includes('uploadType=resumable') ? new Response('', { status: 200, headers: { Location: 'https://upload.example/s1' } }) : undefined),
      (c) => (c.method === 'PUT' && c.url === 'https://upload.example/s1' ? json({ id: 'A1', name: 'p.turbo', version: '2' }) : undefined),
    ]);
    const r = await new DriveClient(async () => 'tok', fn).save('p.turbo', new Uint8Array(RESUMABLE_MIN), 'A1');
    expect(r.version).toBe('2');
    expect(calls.map((c) => c.method)).toEqual(['PATCH', 'PUT']);
    expect(JSON.parse(calls[0].body as string).name).toBe('p.turbo');
    expect((calls[1].body as Uint8Array).length).toBe(RESUMABLE_MIN);
  });

  it('nombres únicos que respetan .turbo', () => {
    expect(uniqueName('p.turbo', ['p.turbo'])).toBe('p (2).turbo');
  });
});
