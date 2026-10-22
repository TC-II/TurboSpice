// Abrir/guardar .asc en la máquina del usuario. Usa la File System Access API cuando existe
// (Chrome/Edge: Ctrl+S guarda sobre el mismo archivo); si no, <input type=file> y descarga.
import { placeDataTexts } from '../asc/dataText.ts';
import { decode, encode, type AscEncoding } from '../asc/encoding.ts';
import type { AscDoc } from '../asc/model.ts';
import { parseAsc } from '../asc/parse.ts';
import { makeExplicit, type SymbolSource } from '../asc/resolve.ts';
import { serializeAsc } from '../asc/serialize.ts';
import { t } from '../i18n/i18n.ts';

// Tipos mínimos de la File System Access API (no están en lib.dom de TypeScript 5.7)
interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: BlobPart): Promise<void>; close(): Promise<void> }>;
}
type PickerOpts = { types?: { description: string; accept: Record<string, string[]> }[]; suggestedName?: string };
declare global {
  interface Window {
    showOpenFilePicker?: (o?: PickerOpts) => Promise<FileHandle[]>;
    showSaveFilePicker?: (o?: PickerOpts) => Promise<FileHandle>;
  }
}

const ASC_TYPE = { description: t('LTspice schematic'), accept: { 'application/octet-stream': ['.asc'] } };
const TURBO_TYPE = { description: t('TurboSpice project'), accept: { 'application/json': ['.turbo'] } };
const TYPES = [ASC_TYPE];

export interface OpenedFile {
  doc: AscDoc;
  name: string;
  encoding: AscEncoding;
  handle?: FileHandle;
}

export function readAsc(bytes: Uint8Array, name: string): Omit<OpenedFile, 'handle'> {
  const { text, encoding } = decode(bytes);
  return { doc: parseAsc(text), name, encoding };
}

/** Elegir uno o más .asc del equipo y leer sus bytes tal cual (para importarlos a Drive) */
export function pickAscFiles(): Promise<{ name: string; bytes: Uint8Array }[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.asc';
    input.multiple = true;
    input.onchange = async () => {
      const files = [...(input.files ?? [])].filter((f) => /\.asc$/i.test(f.name));
      resolve(await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
    };
    input.oncancel = () => resolve([]);
    input.click();
  });
}

export async function openFile(): Promise<OpenedFile | null> {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: TYPES });
      const file = await handle.getFile();
      return { ...readAsc(new Uint8Array(await file.arrayBuffer()), file.name), handle };
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return null;
      throw e;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.asc';
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? readAsc(new Uint8Array(await file.arrayBuffer()), file.name) : null);
    };
    input.click();
  });
}

/** Un archivo abierto tal cual (un .turbo o un .asc: lo decide quien lo lee) */
export interface PickedFile {
  name: string;
  bytes: Uint8Array;
  handle?: FileHandle;
}

/** Elegir un .turbo o un .asc del equipo */
export async function openProjectFile(): Promise<PickedFile | null> {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: [{ description: t('TurboSpice project or LTspice schematic'), accept: { 'application/octet-stream': ['.turbo', '.asc'] } }] });
      const file = await handle.getFile();
      return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), handle };
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return null;
      throw e;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.turbo,.asc';
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Bytes del .asc tal como se guardan: todo explícito, en la codificación original si se puede */
export function ascBytes(doc: AscDoc, lib: SymbolSource, encoding?: AscEncoding): { bytes: Uint8Array; missing: string[] } {
  const { doc: explicit, missing } = makeExplicit(doc, lib);
  // los comentarios con datos (;.study, ;.plot), debajo del dibujo: en LTspice se ven
  return { bytes: encode(serializeAsc(placeDataTexts(explicit)), encoding).bytes, missing };
}

/**
 * Guarda. Con `handle` escribe en el mismo archivo; sin él (o con saveAs) pide destino.
 * Devuelve el handle/nombre usados, o null si el usuario canceló.
 */
export async function saveFile(
  bytes: Uint8Array,
  name: string,
  handle?: FileHandle,
  saveAs = false,
): Promise<{ name: string; handle?: FileHandle } | null> {
  if (window.showSaveFilePicker) {
    try {
      const types = [/\.turbo$/i.test(name) ? TURBO_TYPE : ASC_TYPE];
      const h = !saveAs && handle ? handle : await window.showSaveFilePicker({ types, suggestedName: name });
      const w = await h.createWritable();
      await w.write(bytes as BlobPart);
      await w.close();
      return { name: h.name, handle: h };
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return null;
      throw e;
    }
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { name };
}
