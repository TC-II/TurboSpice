// Inicio de sesión con Google (Google Identity Services, OAuth 2.0 "token client") y acceso a
// Drive con el scope mínimo `drive.file`. Todo ocurre en el navegador: no hay servidor ni secreto,
// sólo el Client ID público (VITE_GOOGLE_CLIENT_ID, en tiempo de build). Sin Client ID la
// integración queda apagada y la app funciona como siempre (guardado local y autoguardado).
import { useSyncExternalStore } from 'react';
import { DriveClient, type DriveUser } from './drive.ts';
import { t } from '../i18n/i18n.ts';

export const CLIENT_ID: string = import.meta.env?.VITE_GOOGLE_CLIENT_ID ?? '';
export const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_URL = 'https://accounts.google.com/gsi/client';
const USER_KEY = 'turbospice.google.user';
const TOKEN_KEY = 'turbospice.google.token';

// Tipos mínimos de google.accounts.oauth2
interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(o?: { prompt?: string; login_hint?: string }): void;
}
interface Oauth2 {
  initTokenClient(o: {
    client_id: string;
    scope: string;
    callback(r: TokenResponse): void;
    error_callback?(e: { type?: string; message?: string }): void;
  }): TokenClient;
  hasGrantedAllScopes(r: TokenResponse, ...scopes: string[]): boolean;
  revoke(token: string, done?: () => void): void;
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: Oauth2 } };
  }
}

export type Account = DriveUser;

export interface GoogleState {
  /** hay Client ID configurado */
  enabled: boolean;
  /** cuenta con la que se inició sesión (se recuerda entre visitas; el token no) */
  account: Account | null;
  busy: boolean;
}

const storage = (s: 'local' | 'session') => {
  try {
    return s === 'local' ? localStorage : sessionStorage;
  } catch {
    return null;
  }
};
function readJson<T>(s: 'local' | 'session', key: string): T | null {
  try {
    const v = storage(s)?.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(s: 'local' | 'session', key: string, v: unknown) {
  try {
    if (v == null) storage(s)?.removeItem(key);
    else storage(s)?.setItem(key, JSON.stringify(v));
  } catch {
    // almacenamiento bloqueado: sólo dura esta pestaña
  }
}

let state: GoogleState = { enabled: !!CLIENT_ID, account: CLIENT_ID ? readJson<Account>('local', USER_KEY) : null, busy: false };
const listeners = new Set<() => void>();
function set(patch: Partial<GoogleState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** Estado de la cuenta para componentes de React */
export function useGoogle(): GoogleState {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}

// El token vive en sessionStorage (se pierde al cerrar el navegador) y dura ~1 h
let token = readJson<{ value: string; expires: number }>('session', TOKEN_KEY);
const tokenValid = () => !!token && token.expires - 60_000 > Date.now();

let gis: Promise<Oauth2> | null = null;
function loadGis(): Promise<Oauth2> {
  gis ??= new Promise<Oauth2>((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve(window.google.accounts.oauth2);
    const s = document.createElement('script');
    s.src = GIS_URL;
    s.async = true;
    s.onload = () => (window.google?.accounts?.oauth2 ? resolve(window.google.accounts.oauth2) : reject(new Error(t('Google Identity Services didn\'t load'))));
    s.onerror = () => reject(new Error(t('Could not load Google Identity Services (offline?)')));
    document.head.appendChild(s);
  });
  gis.catch(() => (gis = null));
  return gis;
}

let pending: Promise<string> | null = null;
/** Pide un token a Google (abre una ventanita si hace falta elegir cuenta o dar permiso) */
function requestToken(prompt: string): Promise<string> {
  pending ??= loadGis()
    .then(
      (oauth2) =>
        new Promise<string>((resolve, reject) => {
          const client = oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPE,
            callback: (r) => {
              if (r.error || !r.access_token) return reject(new Error(r.error_description || r.error || t('Google didn\'t return a token')));
              if (!oauth2.hasGrantedAllScopes(r, SCOPE)) return reject(new Error(t('You need to allow access to Google Drive to save there')));
              token = { value: r.access_token, expires: Date.now() + Number(r.expires_in ?? 3600) * 1000 };
              writeJson('session', TOKEN_KEY, token);
              resolve(r.access_token);
            },
            error_callback: (e) =>
              reject(new Error(e.type === 'popup_closed' ? t('The Google window was closed') : e.type === 'popup_failed_to_open' ? t('The browser blocked the Google window') : e.message || t('Google error'))),
          });
          client.requestAccessToken({ prompt, login_hint: state.account?.emailAddress });
        }),
    )
    .finally(() => (pending = null));
  return pending;
}

/** Token válido para Drive; si venció pide otro (sin volver a preguntar si ya hay permiso) */
export async function getToken(force = false): Promise<string> {
  if (!CLIENT_ID) throw new Error(t('Google sign-in isn\'t configured'));
  if (!force && tokenValid()) return token!.value;
  return requestToken('');
}

export const drive = new DriveClient(getToken);

export async function signIn(): Promise<void> {
  set({ busy: true });
  try {
    await requestToken('select_account');
    const user = await drive.user();
    const account: Account = { displayName: user.displayName, emailAddress: user.emailAddress, photoLink: user.photoLink };
    writeJson('local', USER_KEY, account);
    set({ account });
  } finally {
    set({ busy: false });
  }
}

export function signOut(): void {
  const tt = token?.value;
  token = null;
  writeJson('session', TOKEN_KEY, null);
  writeJson('local', USER_KEY, null);
  set({ account: null });
  if (tt) window.google?.accounts?.oauth2?.revoke(tt);
}

/** Inicial para el circulito de la cuenta */
export const initial = (a: Pick<Account, 'displayName' | 'emailAddress'>) =>
  (a.displayName || a.emailAddress || '?').trim().charAt(0).toUpperCase() || '?';
