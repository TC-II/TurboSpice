// Inicio de sesión con Google (Google Identity Services, OAuth 2.0 "token client") y acceso a
// Drive con el scope mínimo `drive.file`. Todo ocurre en el navegador: no hay servidor ni secreto,
// sólo el Client ID público (VITE_GOOGLE_CLIENT_ID, en tiempo de build). Sin Client ID la
// integración queda apagada y la app funciona como siempre (guardado local y autoguardado).
import { useSyncExternalStore } from 'react';
import { DriveClient, type DriveUser } from './drive.ts';

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
    s.onload = () => (window.google?.accounts?.oauth2 ? resolve(window.google.accounts.oauth2) : reject(new Error('Google Identity Services no cargó')));
    s.onerror = () => reject(new Error('No se pudo cargar Google Identity Services (¿sin conexión?)'));
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
              if (r.error || !r.access_token) return reject(new Error(r.error_description || r.error || 'Google no devolvió un token'));
              if (!oauth2.hasGrantedAllScopes(r, SCOPE)) return reject(new Error('Hace falta permitir el acceso a Google Drive para guardar ahí'));
              token = { value: r.access_token, expires: Date.now() + Number(r.expires_in ?? 3600) * 1000 };
              writeJson('session', TOKEN_KEY, token);
              resolve(r.access_token);
            },
            error_callback: (e) =>
              reject(new Error(e.type === 'popup_closed' ? 'Se cerró la ventana de Google' : e.type === 'popup_failed_to_open' ? 'El navegador bloqueó la ventana de Google' : e.message || 'Error de Google')),
          });
          client.requestAccessToken({ prompt, login_hint: state.account?.emailAddress });
        }),
    )
    .finally(() => (pending = null));
  return pending;
}

/** Token válido para Drive; si venció pide otro (sin volver a preguntar si ya hay permiso) */
export async function getToken(force = false): Promise<string> {
  if (!CLIENT_ID) throw new Error('El inicio de sesión con Google no está configurado');
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
  const t = token?.value;
  token = null;
  writeJson('session', TOKEN_KEY, null);
  writeJson('local', USER_KEY, null);
  set({ account: null });
  if (t) window.google?.accounts?.oauth2?.revoke(t);
}

// ---------- Google Picker: elegir cualquier .asc del Drive ----------
// Con drive.file la app no ve los archivos que no creó; el Picker (la ventana de Google para elegir
// archivos) le da acceso sólo al que el usuario elige. Necesita una API key del mismo proyecto
// (VITE_GOOGLE_API_KEY, pública, restringida a la Picker API y a los dominios de la app) y el
// número de proyecto, que es el prefijo del Client ID.
export const API_KEY: string = import.meta.env?.VITE_GOOGLE_API_KEY ?? '';
const APP_ID = CLIENT_ID.split('-')[0];
/** se puede buscar en todo el Drive (hay Client ID y API key) */
export const pickerEnabled = !!CLIENT_ID && !!API_KEY;

interface PickerDoc {
  id: string;
  name: string;
  lastEditedUtc?: number;
}
interface PickerData {
  action: string;
  docs?: PickerDoc[];
}
interface PickerNs {
  Action: { PICKED: string; CANCEL: string };
  ViewId: { DOCS: string };
  DocsViewMode: { LIST: string };
  DocsView: new (viewId?: string) => PickerView;
  PickerBuilder: new () => PickerBuilder;
}
interface PickerView {
  setIncludeFolders(b: boolean): PickerView;
  setSelectFolderEnabled(b: boolean): PickerView;
  setMode(m: string): PickerView;
  setOwnedByMe(b: boolean): PickerView;
  setStarred(b: boolean): PickerView;
}
interface PickerBuilder {
  addView(v: PickerView): PickerBuilder;
  setOAuthToken(t: string): PickerBuilder;
  setDeveloperKey(k: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setLocale(l: string): PickerBuilder;
  setTitle(t: string): PickerBuilder;
  setCallback(cb: (d: PickerData) => void): PickerBuilder;
  build(): { setVisible(v: boolean): void };
}
declare global {
  interface Window {
    gapi?: { load(name: string, cb: () => void): void };
  }
}

let pickerNs: Promise<PickerNs> | null = null;
function loadPicker(): Promise<PickerNs> {
  pickerNs ??= new Promise<PickerNs>((resolve, reject) => {
    const ready = () => window.gapi!.load('picker', () => {
      const ns = (window as unknown as { google?: { picker?: PickerNs } }).google?.picker;
      if (ns) resolve(ns);
      else reject(new Error('El selector de Google Drive no cargó'));
    });
    if (window.gapi) return ready();
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.async = true;
    s.onload = ready;
    s.onerror = () => reject(new Error('No se pudo cargar el selector de Google Drive (¿sin conexión?)'));
    document.head.appendChild(s);
  });
  pickerNs.catch(() => (pickerNs = null));
  return pickerNs;
}

/** Abre el selector de Google con todo el Drive; devuelve el archivo elegido o null si se canceló */
export async function pickDriveFile(): Promise<{ id: string; name: string; modifiedTime?: string } | null> {
  if (!pickerEnabled) throw new Error('El selector de Google Drive no está configurado');
  const [t, ns] = await Promise.all([getToken(), loadPicker()]);
  return new Promise((resolve) => {
    const all = new ns.DocsView(ns.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false).setMode(ns.DocsViewMode.LIST);
    new ns.PickerBuilder()
      .addView(all)
      .setOAuthToken(t)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setLocale('es')
      .setTitle('Abrir un esquemático (.asc) de Google Drive')
      .setCallback((d) => {
        if (d.action === ns.Action.PICKED && d.docs?.[0]) {
          const f = d.docs[0];
          resolve({ id: f.id, name: f.name, modifiedTime: f.lastEditedUtc ? new Date(f.lastEditedUtc).toISOString() : undefined });
        } else if (d.action === ns.Action.CANCEL) resolve(null);
      })
      .build()
      .setVisible(true);
  });
}

/** Inicial para el circulito de la cuenta */
export const initial = (a: Pick<Account, 'displayName' | 'emailAddress'>) =>
  (a.displayName || a.emailAddress || '?').trim().charAt(0).toUpperCase() || '?';
