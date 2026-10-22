// «My symbols and models» en Drive: un solo JSON de nombre fijo en la carpeta TurboSpice, el mismo
// para todos los proyectos y todas las máquinas. El navegador guarda una copia (IndexedDB) para
// trabajar sin sesión; al entrar con Google se unen las dos.
import type { UserFile } from '../schematic/autosave.ts';
import type { DriveClient, DriveFile } from './drive.ts';

export const USER_LIBRARY_NAME = 'My symbols and models.json';
const FORMAT = 'turbospice-userfiles';

interface UserLibraryJson {
  format: typeof FORMAT;
  version: 1;
  files: UserFile[];
}

export const userLibraryText = (files: UserFile[]) => JSON.stringify({ format: FORMAT, version: 1, files } satisfies UserLibraryJson);

/** Lee el JSON; si no es de TurboSpice o está roto, ninguno */
export function parseUserLibrary(text: string): UserFile[] | null {
  try {
    const j = JSON.parse(text) as Partial<UserLibraryJson>;
    if (j.format !== FORMAT || !Array.isArray(j.files)) return null;
    return j.files.filter((f) => typeof f?.name === 'string' && typeof f.text === 'string' && ['symbol', 'model', 'schematic'].includes(f.kind));
  } catch {
    return null;
  }
}

/** Unión por nombre (sin distinguir mayúsculas): si está en los dos, gana el más nuevo */
export function mergeUserFiles(a: UserFile[], b: UserFile[]): UserFile[] {
  const out = new Map<string, UserFile>();
  for (const f of [...a, ...b]) {
    const k = f.name.toLowerCase();
    const prev = out.get(k);
    if (!prev || (f.time ?? 0) > (prev.time ?? 0)) out.set(k, f);
  }
  return [...out.values()];
}

/** El archivo en Drive (o ninguno si todavía no se creó) */
async function find(drive: DriveClient): Promise<DriveFile | undefined> {
  return (await drive.find(USER_LIBRARY_NAME))[0];
}

export async function pullUserLibrary(drive: DriveClient): Promise<{ id?: string; files: UserFile[] | null }> {
  const f = await find(drive);
  if (!f) return { files: null };
  return { id: f.id, files: parseUserLibrary(new TextDecoder().decode(await drive.download(f.id))) };
}

export async function pushUserLibrary(drive: DriveClient, files: UserFile[], id?: string): Promise<string> {
  const target = id ?? (await find(drive))?.id;
  return (await drive.save(USER_LIBRARY_NAME, new TextEncoder().encode(userLibraryText(files)), target)).id;
}
