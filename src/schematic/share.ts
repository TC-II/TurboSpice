import { t } from '../i18n/i18n.ts';
import { hashText, isTurboText } from '../project/turbo.ts';
// Compartir un proyecto con un link: el .turbo (o, en links viejos, el .asc) comprimido con deflate y en
// base64url, dentro del hash (#c=…&z=1&n=nombre), así nunca llega a ningún servidor. z=1: deflate con
// el diccionario SHARE_DICT_1 (líneas típicas de un .asc), ~20% más corto; sin z, deflate solo.

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

const unzip = (s: string) => pipe(fromBase64Url(s), new DecompressionStream('deflate-raw'));

// el diccionario y fflate se cargan recién al compartir o al abrir un link
const dict1 = async () => {
  const [{ deflateSync, inflateSync }, { SHARE_DICT_1 }] = await Promise.all([import('fflate'), import('./shareDict.ts')]);
  return { deflateSync, inflateSync, dictionary: new TextEncoder().encode(SHARE_DICT_1) };
};

type Json = Record<string, unknown>;
const isObj = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const SHA = /^sha256:[0-9a-f]{64}$/;
const ID = /^[vsrg]_?[0-9a-z]{6,}$/; // los de newId
const ID_KEYS = new Set(['id', 'activeTestbench', 'activeSim', 'activeVariant', 'group']);

/**
 * Un .turbo sin lo que es azar puro y ningún compresor achica (~30% del link): los sha256 pasan
 * a "@0", "@1"… y los ids a "s0", "r1"…, sin las fechas del proyecto (al abrirse, son de ahora).
 * Las fechas de las corridas quedan: son parte de la historia.
 */
export function compactTurbo(text: string): string {
  const hashes = new Map<string, string>();
  const ids = new Map<string, string>();
  const walk = (x: unknown, key = ''): unknown => {
    if (typeof x === 'string') {
      if (SHA.test(x)) return hashes.get(x) ?? (hashes.set(x, `@${hashes.size}`), `@${hashes.size - 1}`);
      if (ID_KEYS.has(key) && ID.test(x)) return ids.get(x) ?? (ids.set(x, `${x[0]}${ids.size}`), `${x[0]}${ids.size - 1}`);
      return x;
    }
    if (Array.isArray(x)) return x.map((y) => walk(y, key));
    if (!isObj(x)) return x;
    const out: Json = {};
    for (const [k, v] of Object.entries(x)) {
      if (k === 'created' || k === 'modified') continue;
      out[SHA.test(k) ? (walk(k) as string) : k] = k === 'blobs' ? walk(v) : walk(v, k);
    }
    return out;
  };
  return JSON.stringify(walk(JSON.parse(text)));
}

/** Lo inverso de compactTurbo: cada "@n" vuelve a ser el sha256 de su texto */
export async function expandTurbo(text: string): Promise<string> {
  const raw = JSON.parse(text) as Json;
  const blobs = isObj(raw.blobs) ? raw.blobs : {};
  const real = new Map<string, string>();
  const out: Json = {};
  for (const [k, v] of Object.entries(blobs)) {
    const h = typeof v === 'string' ? await hashText(v) : k;
    real.set(k, h);
    out[h] = v;
  }
  raw.blobs = out;
  const fix = (x: unknown): unknown =>
    typeof x === 'string' ? (/^@\d+$/.test(x) ? (real.get(x) ?? x) : x) : Array.isArray(x) ? x.map(fix) : isObj(x) ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === 'blobs' ? v : fix(v)])) : x;
  return JSON.stringify(fix(raw));
}

/**
 * Hash en el formato original, sin diccionario (#c=<deflate-raw, base64url>&n=nombre): el que lee
 * ASC-Parser (Exportar a PDF, Pro), que no conoce z=1
 */
export async function plainHash(bytes: Uint8Array, name: string): Promise<string> {
  return `c=${toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')))}&n=${encodeURIComponent(name)}`;
}

/** Hash (sin "#") para compartir el archivo (la vista de resultados va dentro del .asc) */
export async function shareHash(bytes: Uint8Array, name: string): Promise<string> {
  const { deflateSync, dictionary } = await dict1();
  const text = new TextDecoder().decode(bytes);
  const turbo = isTurboText(text);
  const data = turbo ? new TextEncoder().encode(compactTurbo(text)) : bytes;
  return `c=${toBase64Url(deflateSync(data, { level: 9, dictionary }))}&z=1${turbo ? '&k=1' : ''}&n=${encodeURIComponent(name)}`;
}

/**
 * Lee un hash generado por shareHash; null si no es un circuito compartido. Los links viejos
 * traen además la vista de resultados aparte (&v=…).
 */
export async function readShareHash(hash: string): Promise<{ bytes: Uint8Array; name: string; view?: unknown } | null> {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const c = params.get('c');
  if (!c) return null;
  const z = params.get('z');
  if (z && z !== '1') throw new Error(`unknown link version (z=${z})`);
  let bytes = z ? await dict1().then(({ inflateSync, dictionary }) => inflateSync(fromBase64Url(c), { dictionary })) : await unzip(c);
  if (params.get('k') === '1') bytes = new TextEncoder().encode(await expandTurbo(new TextDecoder().decode(bytes)));
  const v = params.get('v');
  let view: unknown;
  try {
    view = v ? JSON.parse(new TextDecoder().decode(await unzip(v))) : undefined;
  } catch {
    view = undefined; // una vista ilegible no impide abrir el circuito
  }
  return { bytes, name: params.get('n') || t('Shared.asc'), ...(view ? { view } : {}) };
}

/** Largo a partir del cual el link puede no funcionar en chats o mails */
export const LONG_LINK = 8000;
