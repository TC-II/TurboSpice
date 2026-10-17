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

/** Hash (sin "#") para compartir el archivo */
export async function shareHash(asc: Uint8Array, name: string): Promise<string> {
  const data = toBase64Url(await pipe(asc, new CompressionStream('deflate-raw')));
  return `c=${data}&n=${encodeURIComponent(name)}`;
}

/** Lee un hash generado por shareHash; null si no es un circuito compartido */
export async function readShareHash(hash: string): Promise<{ bytes: Uint8Array; name: string } | null> {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const c = params.get('c');
  if (!c) return null;
  const bytes = await pipe(fromBase64Url(c), new DecompressionStream('deflate-raw'));
  return { bytes, name: params.get('n') || 'Compartido.asc' };
}

/** Largo a partir del cual el link puede no funcionar en chats o mails */
export const LONG_LINK = 8000;
