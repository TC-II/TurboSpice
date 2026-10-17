// Compartir un circuito con un link: el .asc (explícito) comprimido con deflate y en
// base64url, dentro del hash (#c=…&n=nombre), así nunca llega a ningún servidor.

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

const zip = async (b: Uint8Array) => toBase64Url(await pipe(b, new CompressionStream('deflate-raw')));
const unzip = (s: string) => pipe(fromBase64Url(s), new DecompressionStream('deflate-raw'));

/** Hash (sin "#") para compartir el archivo y, opcionalmente, la vista de resultados (JSON) */
export async function shareHash(asc: Uint8Array, name: string, view?: unknown): Promise<string> {
  const v = view && Object.keys(view).length ? `&v=${await zip(new TextEncoder().encode(JSON.stringify(view)))}` : '';
  return `c=${await zip(asc)}${v}&n=${encodeURIComponent(name)}`;
}

/** Lee un hash generado por shareHash; null si no es un circuito compartido */
export async function readShareHash(hash: string): Promise<{ bytes: Uint8Array; name: string; view?: unknown } | null> {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const c = params.get('c');
  if (!c) return null;
  const bytes = await unzip(c);
  const v = params.get('v');
  let view: unknown;
  try {
    view = v ? JSON.parse(new TextDecoder().decode(await unzip(v))) : undefined;
  } catch {
    view = undefined; // una vista ilegible no impide abrir el circuito
  }
  return { bytes, name: params.get('n') || 'Compartido.asc', ...(view ? { view } : {}) };
}

/** Largo a partir del cual el link puede no funcionar en chats o mails */
export const LONG_LINK = 8000;
