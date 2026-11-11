// Lo que comparten los diálogos de Drive: importar del equipo, fechas relativas y nombres.
import { dateTime, t } from '../i18n/i18n.ts';
import { isProjectName, uniqueName, type DriveClient, type DriveFile, type DriveItem } from './drive.ts';

/**
 * Sube .asc/.turbo del equipo a una carpeta (la raíz si no se dice), sin pisar: «x (2).asc» si el
 * nombre ya está. `taken`: nombres que ya hay en esa carpeta (si no se pasa, se consulta).
 */
export async function importToDrive(client: DriveClient, picked: { name: string; bytes: Uint8Array }[], parent?: string, taken?: string[]): Promise<DriveFile[]> {
  const used = taken ? [...taken] : (await client.list(parent)).map((f) => f.name);
  const out: DriveFile[] = [];
  for (const p of picked) {
    const name = uniqueName(p.name, used);
    used.push(name);
    out.push(await client.save(name, p.bytes, undefined, parent));
  }
  return out;
}

/** «recién», «hace 5 min», «hace 3 h», «ayer»… y, de más atrás, la fecha */
export function ago(time: number | string | undefined, now = Date.now()): string {
  if (time === undefined) return '';
  const ms = now - new Date(time).getTime();
  if (!Number.isFinite(ms)) return '';
  const min = Math.round(ms / 60_000);
  if (min < 1) return t('just now');
  if (min < 60) return t('{n} min ago', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('{n} h ago', { n: h });
  if (h < 48) return t('yesterday');
  return dateTime(time);
}

/** Extensión de un proyecto o esquemático («.turbo», «.asc»), o vacío */
export const extOf = (name: string) => /\.(turbo|asc)$/i.exec(name)?.[0] ?? '';
/** El nombre sin la extensión */
export const baseName = (name: string) => name.replace(/\.(turbo|asc)$/i, '');

/** Lo que se lista: carpetas y proyectos (no los JSON de la app) */
export const shownItem = (f: DriveItem) => f.folder || isProjectName(f.name);

/** Hijos visibles de una carpeta (sin la papelera): carpetas primero por nombre, después los proyectos */
export function children(items: DriveItem[], parent: string, sort: 'recent' | 'name'): DriveItem[] {
  const here = items.filter((f) => f.parent === parent && !f.trashed && shownItem(f));
  const byName = (a: DriveItem, b: DriveItem) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  const byDate = (a: DriveItem, b: DriveItem) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? '') || byName(a, b);
  return [...here.filter((f) => f.folder).sort(byName), ...here.filter((f) => !f.folder).sort(sort === 'name' ? byName : byDate)];
}

/** Cuántos proyectos hay dentro de una carpeta (en cualquier nivel) */
export function countInside(items: DriveItem[], folder: string): number {
  let n = 0;
  const walk = (id: string, depth: number) => {
    if (depth > 64) return;
    for (const f of items) {
      if (f.parent !== id || f.trashed) continue;
      if (f.folder) walk(f.id, depth + 1);
      else if (isProjectName(f.name)) n++;
    }
  };
  walk(folder, 0);
  return n;
}
