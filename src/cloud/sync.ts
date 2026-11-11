// Estado del proyecto abierto respecto de Google Drive: lo que muestra el indicador de la cápsula
// del proyecto. Puro (sin React), para probarlo solo.
import type { DriveErrorKind } from './drive.ts';
import type { AuthStatus } from './google.ts';

export type SyncKind =
  /** sin Client ID: no hay Drive */
  | 'disabled'
  /** sin sesión: el proyecto vive en este navegador (y en el equipo, si se exportó) */
  | 'signedOut'
  /** con sesión, pero el proyecto todavía no está en Drive */
  | 'notInDrive'
  | 'saving'
  /** en Drive y al día */
  | 'synced'
  /** con cambios que todavía no se subieron (se suben solos) */
  | 'pending'
  /** la sesión de Google venció: hay que reconectar para seguir subiendo */
  | 'auth'
  /** sin conexión: se reintenta solo */
  | 'offline'
  /** falló la última subida */
  | 'error'
  /** otro lo cambió en Drive: hay que elegir */
  | 'conflict';

export interface SyncInput {
  enabled: boolean;
  signedIn: boolean;
  auth: AuthStatus;
  inDrive: boolean;
  dirty: boolean;
  saving: boolean;
  conflict: boolean;
  /** la última subida falló (y todavía no hubo una que anduviera) */
  error?: { kind: DriveErrorKind; message: string } | null;
}

export function syncKind(s: SyncInput): SyncKind {
  if (!s.enabled) return 'disabled';
  if (!s.signedIn) return 'signedOut';
  if (!s.inDrive) return 'notInDrive';
  if (s.conflict) return 'conflict';
  if (s.saving) return 'saving';
  if (s.error?.kind === 'auth' || (s.dirty && s.auth === 'expired')) return 'auth';
  if (s.error && (s.error.kind === 'offline' || s.error.kind === 'timeout')) return 'offline';
  if (s.error) return 'error';
  return s.dirty ? 'pending' : 'synced';
}

/** Lo que necesita atención del usuario (el indicador se pinta de color) */
export const syncNeedsAttention = (k: SyncKind) => k === 'auth' || k === 'error' || k === 'conflict' || k === 'offline';

/** Cada cuánto se reintenta una subida automática que falló por algo pasajero (ms) */
export const RETRY_DELAYS = [15_000, 30_000, 60_000, 120_000, 300_000];
export const retryDelay = (failures: number) => RETRY_DELAYS[Math.min(failures, RETRY_DELAYS.length) - 1] ?? RETRY_DELAYS[0];

/** Con cambios sin subir, el guardado automático en Drive espera esto desde el primer cambio */
export const AUTOSAVE_DELAY = 30_000;
