import { describe, expect, it } from 'vitest';
import { retryDelay, RETRY_DELAYS, syncKind, syncNeedsAttention, type SyncInput } from '../../src/cloud/sync.ts';
import { backgroundToken, tokenValid } from '../../src/cloud/google.ts';
import { ago, children, countInside } from '../../src/cloud/projects.ts';
import type { DriveItem } from '../../src/cloud/drive.ts';

const base: SyncInput = { enabled: true, signedIn: true, auth: 'connected', inDrive: true, dirty: false, saving: false, conflict: false, error: null };

describe('estado del proyecto en Drive', () => {
  it('sin Drive, sin sesión, todavía no subido', () => {
    expect(syncKind({ ...base, enabled: false })).toBe('disabled');
    expect(syncKind({ ...base, signedIn: false })).toBe('signedOut');
    expect(syncKind({ ...base, inDrive: false })).toBe('notInDrive');
  });
  it('al día, con cambios, subiendo', () => {
    expect(syncKind(base)).toBe('synced');
    expect(syncKind({ ...base, dirty: true })).toBe('pending');
    expect(syncKind({ ...base, dirty: true, saving: true })).toBe('saving');
  });
  it('la sesión vencida importa sólo si hay algo por subir', () => {
    expect(syncKind({ ...base, auth: 'expired' })).toBe('synced');
    expect(syncKind({ ...base, auth: 'expired', dirty: true })).toBe('auth');
    expect(syncKind({ ...base, error: { kind: 'auth', message: '' } })).toBe('auth');
  });
  it('sin conexión, error, conflicto (el conflicto manda)', () => {
    expect(syncKind({ ...base, dirty: true, error: { kind: 'offline', message: '' } })).toBe('offline');
    expect(syncKind({ ...base, dirty: true, error: { kind: 'timeout', message: '' } })).toBe('offline');
    expect(syncKind({ ...base, dirty: true, error: { kind: 'forbidden', message: '' } })).toBe('error');
    expect(syncKind({ ...base, dirty: true, conflict: true, error: { kind: 'offline', message: '' } })).toBe('conflict');
  });
  it('qué pide atención', () => {
    expect(['synced', 'pending', 'saving', 'notInDrive'].map((k) => syncNeedsAttention(k as never))).toEqual([false, false, false, false]);
    expect(['auth', 'offline', 'error', 'conflict'].map((k) => syncNeedsAttention(k as never))).toEqual([true, true, true, true]);
  });
  it('los reintentos esperan cada vez más, hasta un tope', () => {
    expect(retryDelay(1)).toBe(RETRY_DELAYS[0]);
    expect(retryDelay(2)).toBeGreaterThan(retryDelay(1));
    expect(retryDelay(99)).toBe(RETRY_DELAYS.at(-1));
  });
});

describe('sesión de Google', () => {
  const now = 1_000_000_000;
  it('un token sirve con más de un minuto por delante', () => {
    expect(tokenValid({ expires: now + 50 * 60_000 }, now)).toBe(true);
    expect(tokenValid({ expires: now + 30_000 }, now)).toBe(false);
    expect(tokenValid(null, now)).toBe(false);
    // «¿dura al menos 10 min más?»
    expect(tokenValid({ expires: now + 5 * 60_000 }, now, 10 * 60_000)).toBe(false);
  });
  it('el de fondo nunca abre la ventana de Google: sin token válido, error de sesión', async () => {
    await expect(backgroundToken()).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('librería de proyectos', () => {
  const F = (id: string, name: string, parent: string, extra: Partial<DriveItem> = {}): DriveItem => ({ id, name, parent, folder: false, ...extra });
  const items = [
    F('a', 'Filtros', 'R', { folder: true }),
    F('b', 'Amplis', 'R', { folder: true }),
    F('p1', 'RC.turbo', 'R', { modifiedTime: '2026-01-01' }),
    F('p2', 'LC.turbo', 'R', { modifiedTime: '2026-02-01' }),
    F('p3', 'x.json', 'R'),
    F('p4', 'Viejo.turbo', 'R', { trashed: true }),
    F('p5', 'Pasabajos.turbo', 'a'),
    F('c', 'Sub', 'a', { folder: true }),
    F('p6', 'Notch.asc', 'c'),
  ];
  it('carpetas primero (por nombre), después los proyectos; sin JSON ni papelera', () => {
    expect(children(items, 'R', 'recent').map((f) => f.id)).toEqual(['b', 'a', 'p2', 'p1']);
    expect(children(items, 'R', 'name').map((f) => f.id)).toEqual(['b', 'a', 'p2', 'p1']);
  });
  it('cuenta los proyectos de una carpeta a cualquier profundidad', () => {
    expect(countInside(items, 'a')).toBe(2);
    expect(countInside(items, 'b')).toBe(0);
  });
  it('fechas relativas', () => {
    const t0 = Date.parse('2026-05-01T12:00:00Z');
    expect(ago(t0 - 10_000, t0)).toBe('recién');
    expect(ago(t0 - 5 * 60_000, t0)).toBe('hace 5 min');
    expect(ago(t0 - 3 * 3600_000, t0)).toBe('hace 3 h');
    expect(ago(t0 - 30 * 3600_000, t0)).toBe('ayer');
    expect(ago(undefined)).toBe('');
  });
});
