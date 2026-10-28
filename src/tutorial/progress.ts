// Progreso del tutorial (Academia): en este navegador (localStorage) y, con sesión de Google, en
// Drive (un JSON de nombre fijo en la carpeta TurboSpice, como «My symbols and models»), así no
// se repite en otra máquina. Al entrar se unen los dos; después cada cambio se sube (con un
// segundo de espera, para juntar los pasos seguidos en una sola subida).
import type { DriveClient } from '../cloud/drive.ts';

const KEY = 'turbospice.tutorial';
export const PROGRESS_NAME = 'Tutorial progress.json';
const FORMAT = 'turbospice-tutorial';

export interface ChapterProgress {
  /** pasos hechos alguna vez (dan XP una sola vez) */
  done: string[];
  /** mejor resultado */
  stars?: number;
}
export interface Progress {
  xp: number;
  ch: Record<string, ChapterProgress>;
  sound: boolean;
  /** cuántas veces se borró: al unir dos progresos de distinta época gana el más nuevo (si no,
   *  el de otra máquina devolvería lo borrado) */
  epoch?: number;
  /** dónde quedó la tarjeta (sólo en este navegador: depende de la pantalla) */
  pos?: { x: number; y: number };
}

export const emptyProgress = (): Progress => ({ xp: 0, ch: {}, sound: true });

/** Lee un progreso guardado; si no es válido, ninguno */
export function parseProgress(v: unknown): Progress | null {
  const p = v as Partial<Progress> | null;
  if (!p || typeof p.xp !== 'number' || !p.ch || typeof p.ch !== 'object') return null;
  const ch: Record<string, ChapterProgress> = {};
  for (const [id, c] of Object.entries(p.ch)) {
    if (!c || !Array.isArray(c.done)) continue;
    ch[id] = { done: c.done.filter((x): x is string => typeof x === 'string'), ...(typeof c.stars === 'number' ? { stars: c.stars } : {}) };
  }
  return { xp: p.xp, ch, sound: p.sound !== false, ...(typeof p.epoch === 'number' && p.epoch > 0 ? { epoch: p.epoch } : {}), ...(p.pos ? { pos: p.pos } : {}) };
}

export function loadProgress(): Progress {
  try {
    return parseProgress(JSON.parse(localStorage.getItem(KEY) ?? 'null')) ?? emptyProgress();
  } catch {
    // sin almacenamiento o dañado: se empieza de cero
    return emptyProgress();
  }
}

/** Avisa que el progreso cambió desde afuera (llegó el de Drive) */
export const PROGRESS_EVENT = 'turbospice-tutorial';

export function storeProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // sin almacenamiento: vale para esta sesión
  }
  schedulePush(p);
}

/** Unión: los pasos hechos en cualquiera de los dos, las mejores estrellas y el mayor XP. Del
 *  primero (el de este navegador) quedan el sonido y la posición de la tarjeta */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const ea = a.epoch ?? 0;
  const eb = b.epoch ?? 0;
  if (ea !== eb) {
    const w = ea > eb ? a : b;
    return { xp: w.xp, ch: w.ch, sound: a.sound, ...(w.epoch ? { epoch: w.epoch } : {}), ...(a.pos ? { pos: a.pos } : {}) };
  }
  const ch: Record<string, ChapterProgress> = {};
  for (const id of new Set([...Object.keys(a.ch), ...Object.keys(b.ch)])) {
    const x = a.ch[id];
    const y = b.ch[id];
    const stars = Math.max(x?.stars ?? 0, y?.stars ?? 0);
    ch[id] = { done: [...new Set([...(x?.done ?? []), ...(y?.done ?? [])])], ...(stars ? { stars } : {}) };
  }
  return { xp: Math.max(a.xp, b.xp), ch, sound: a.sound, ...(ea ? { epoch: ea } : {}), ...(a.pos ? { pos: a.pos } : {}) };
}

/** Lo que va a Drive (sin la posición de la tarjeta) */
export const progressText = (p: Progress) => JSON.stringify({ format: FORMAT, version: 1, xp: p.xp, ch: p.ch, sound: p.sound, ...(p.epoch ? { epoch: p.epoch } : {}) });

export async function pullProgress(drive: DriveClient): Promise<{ id?: string; progress: Progress | null }> {
  const f = (await drive.find(PROGRESS_NAME))[0];
  if (!f) return { progress: null };
  try {
    const j = JSON.parse(new TextDecoder().decode(await drive.download(f.id)));
    return { id: f.id, progress: j?.format === FORMAT ? parseProgress(j) : null };
  } catch {
    return { id: f.id, progress: null };
  }
}

export async function pushProgress(drive: DriveClient, p: Progress, id?: string): Promise<string> {
  const target = id ?? (await drive.find(PROGRESS_NAME))[0]?.id;
  return (await drive.save(PROGRESS_NAME, new TextEncoder().encode(progressText(p)), target)).id;
}

// ── sincronización con Drive (mientras haya sesión) ──────────────────────
let cloud: { drive: DriveClient; id?: string; sent: string; onError(e: Error): void } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function schedulePush(p: Progress) {
  if (!cloud) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const c = cloud;
    const text = progressText(p);
    if (!c || text === c.sent) return;
    c.sent = text;
    pushProgress(c.drive, p, c.id)
      .then((id) => (c.id = id))
      .catch((e: Error) => {
        c.sent = '';
        c.onError(e);
      });
  }, 1000);
}

/** Al entrar con Google: une el progreso de Drive con el de acá, lo guarda y sube el resultado si
 *  cambió. Desde entonces cada cambio se sube solo. Devuelve con qué cortar */
export function connectProgress(drive: DriveClient, onError: (e: Error) => void): () => void {
  let off = false;
  (async () => {
    const remote = await pullProgress(drive);
    if (off) return;
    const local = loadProgress();
    const merged = remote.progress ? mergeProgress(local, remote.progress) : local;
    cloud = { drive, id: remote.id, sent: remote.progress ? progressText(remote.progress) : '', onError };
    if (progressText(merged) !== progressText(local)) {
      storeProgress(merged);
      window.dispatchEvent(new Event(PROGRESS_EVENT));
    } else if (remote.progress || merged.xp || Object.keys(merged.ch).length || merged.epoch) schedulePush(merged);
    // (quien nunca abrió el tutorial no tiene archivo en Drive hasta que lo use)
  })().catch((e: Error) => !off && onError(e));
  return () => {
    off = true;
    cloud = null;
    clearTimeout(timer);
  };
}
