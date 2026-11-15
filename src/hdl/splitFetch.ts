// Archivos partidos: el espejo de Cloudflare Pages no acepta archivos de más de 25 MiB, así que el
// deploy (.github/workflows/deploy.yml) parte los grandes (el wasm de Yosys, ~68 MB) en
// «<archivo>.part0», «.part1»… y deja en «<archivo>.parts» cuántas partes son. En GitHub Pages el
// archivo está entero y esto no hace nada.

type Fetch = typeof fetch;

/** El tipo de contenido que corresponde al archivo (compileStreaming exige application/wasm). */
function contentType(url: string): string {
  return /\.wasm(\?|$)/.test(url) ? 'application/wasm' : 'application/octet-stream';
}

/**
 * Envuelve `fetch`: si un .wasm no llega como tal (404, o la página de la app que Cloudflare sirve
 * en lugar de un 404), busca sus partes y las junta.
 */
export function splitFetch(base: Fetch): Fetch {
  return async (input, init) => {
    const res = await base(input, init);
    const url = input instanceof Request ? input.url : String(input);
    if (!/\.wasm(\?|$)/.test(url)) return res;
    if (res.ok && (res.headers.get('content-type') ?? '').includes('wasm')) return res;
    const clean = url.replace(/\?.*$/, '');
    const index = await base(`${clean}.parts`);
    const count = index.ok ? Number((await index.text()).trim()) : NaN;
    if (!Number.isInteger(count) || count < 1 || count > 64) return res;
    const parts = await Promise.all(
      Array.from({ length: count }, async (_, i) => {
        const r = await base(`${clean}.part${i}`);
        if (!r.ok) throw new Error(`${clean}.part${i}: HTTP ${r.status}`);
        return r.arrayBuffer();
      }),
    );
    return new Response(new Blob(parts), { headers: { 'content-type': contentType(url) } });
  };
}
