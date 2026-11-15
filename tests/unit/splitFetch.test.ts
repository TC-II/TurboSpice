import { describe, expect, it } from 'vitest';
import { splitFetch } from '../../src/hdl/splitFetch.ts';

// servidor de mentira: rutas → [cuerpo, content-type]; lo demás, la página de la app (como Cloudflare)
function server(files: Record<string, [string, string]>) {
  const asked: string[] = [];
  const f = (async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    const hit = files[url];
    if (hit) return new Response(hit[0], { headers: { 'content-type': hit[1] } });
    return new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } });
  }) as typeof fetch;
  return { f, asked };
}

describe('splitFetch', () => {
  it('un .wasm entero pasa tal cual, sin buscar partes', async () => {
    const { f, asked } = server({ 'https://x/a.wasm': ['ABC', 'application/wasm'] });
    const r = await splitFetch(f)('https://x/a.wasm');
    expect(await r.text()).toBe('ABC');
    expect(asked).toEqual(['https://x/a.wasm']);
  });

  it('si el .wasm no está, junta sus partes en orden y responde application/wasm', async () => {
    const { f } = server({
      'https://x/a.wasm.parts': ['3\n', 'text/plain'],
      'https://x/a.wasm.part0': ['AB', 'application/octet-stream'],
      'https://x/a.wasm.part1': ['CD', 'application/octet-stream'],
      'https://x/a.wasm.part2': ['E', 'application/octet-stream'],
    });
    const r = await splitFetch(f)('https://x/a.wasm');
    expect(await r.text()).toBe('ABCDE');
    expect(r.headers.get('content-type')).toBe('application/wasm');
  });

  it('sin índice de partes devuelve la respuesta original', async () => {
    const { f } = server({});
    const r = await splitFetch(f)('https://x/a.wasm');
    expect(r.headers.get('content-type')).toBe('text/html');
  });

  it('lo que no es .wasm no se toca', async () => {
    const { f, asked } = server({});
    await splitFetch(f)('https://x/a.tar');
    expect(asked).toEqual(['https://x/a.tar']);
  });
});
