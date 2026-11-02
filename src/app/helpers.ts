// Funciones sueltas del modo esquemático
import type { AscDoc } from '../asc/model.ts';
import { serializeAsc } from '../asc/serialize.ts';
import type { Library } from '../library/library.ts';
import type { UserFile } from '../schematic/autosave.ts';

// Serialización cacheada por documento (el autoguardado y el cambio de simulación la usan seguido)
const ascCache = new WeakMap<AscDoc, string>();
export const ascText = (d: AscDoc) => {
  let tt = ascCache.get(d);
  if (tt === undefined) ascCache.set(d, (tt = serializeAsc(d)));
  return tt;
};

export const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;

/** Registra un archivo del usuario en la librería (símbolo, modelos o bloque) */
export function registerUserFile(lib: Library, f: UserFile) {
  if (f.kind === 'symbol') lib.addSymbol(f.name.replace(/\.asy$/i, ''), f.text);
  else if (f.kind === 'model') lib.addModelFile(f.name, f.text);
  else lib.addSchematic(f.name, f.text);
}

export const userFileKind = (name: string): UserFile['kind'] | null =>
  /\.asy$/i.test(name) ? 'symbol' : /\.(lib|sub|mod|inc|cir|txt|lb)$/i.test(name) ? 'model' : /\.asc$/i.test(name) ? 'schematic' : null;

/**
 * Imagen pegada → data URL y tamaño en unidades del esquemático (1 px = 1 unidad, el lado mayor
 * a lo sumo 800). Las grandes se achican y pasan a JPEG para no inflar el archivo.
 */
export async function clipboardImage(blob: Blob): Promise<{ data: string; w: number; h: number }> {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL('image/png');
  const data = png.length > 600_000 ? canvas.toDataURL('image/jpeg', 0.85) : png;
  const s = Math.min(1, 800 / Math.max(bmp.width, bmp.height));
  return { data, w: Math.round(bmp.width * s), h: Math.round(bmp.height * s) };
}
