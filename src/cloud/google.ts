// Inicio de sesión con Google (Google Identity Services, OAuth 2.0 "token client") y acceso a
// Drive con el scope mínimo `drive.file`. Todo ocurre en el navegador: no hay servidor ni secreto,
// sólo el Client ID público (VITE_GOOGLE_CLIENT_ID, en tiempo de build). Sin Client ID la
// integración queda apagada y la app funciona como siempre (guardado local y autoguardado).
//
// La sesión (#192, rehecho): una página sin servidor recibe tokens de 1 h, y pedir otro abre una
// ventanita de Google (con el permiso ya dado se cierra sola). Antes se pedía en cualquier click
// cuando faltaba poco, y salía la ventanita en medio del trabajo. Ahora:
//  - la ventanita sale sólo en un gesto de Drive del usuario (Guardar, Abrir, Reconectar, iniciar
//    sesión), nunca sola;
//  - lo que corre de fondo (guardado automático, sincronizar la librería y el progreso) usa
//    `driveBg`, que nunca abre ventanas: si el token venció, el estado pasa a «expired», la
//    interfaz ofrece reconectar y lo pendiente se sube al reconectar (`onConnected`);
//  - el token se guarda en localStorage y se comparte entre pestañas (otra pestaña no pide otro);
//  - el pedido tiene tiempo máximo y se puede cancelar: nada queda «cargando» para siempre.
import { useSyncExternalStore } from 'react';
import { DriveClient, DriveError, errorKind, type DriveUser } from './drive.ts';
import { t } from '../i18n/i18n.ts';

export const CLIENT_ID: string = import.meta.env?.VITE_GOOGLE_CLIENT_ID ?? '';
export const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_URL = 'https://accounts.google.com/gsi/client';
const USER_KEY = 'turbospice.google.user';
const TOKEN_KEY = 'turbospice.google.token';
/** Tiempo máximo para que Google conteste (la ventanita abierta y olvidada no cuelga la app) */
export const AUTH_TIMEOUT = 120_000;
const GIS_TIMEOUT = 20_000;
/** Margen: un token que vence en menos de esto ya no se usa */
const MARGIN = 60_000;
/** En un gesto de Drive (Guardar, Abrir) se renueva si falta menos de esto: así lo de fondo no se corta enseguida */
export const RENEW_BEFORE = 10 * 60_000;

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
  initTokenClient(o: { client_id: string; scope: string; callback(r: TokenResponse): void; error_callback?(e: { type?: string; message?: string }): void }): TokenClient;
  hasGrantedAllScopes(r: TokenResponse, ...scopes: string[]): boolean;
  revoke(token: string, done?: () => void): void;
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: Oauth2 } };
  }
}

export type Account = DriveUser;

/**
 * - signedOut: sin sesión
 * - connecting: esperando la ventana de Google
 * - connected: con token válido
 * - expired: con la cuenta recordada pero sin token válido (hay que reconectar, en un gesto)
 */
export type AuthStatus = 'signedOut' | 'connecting' | 'connected' | 'expired';

export interface GoogleState {
  /** hay Client ID configurado */
  enabled: boolean;
  /** cuenta con la que se inició sesión (se recuerda entre visitas) */
  account: Account | null;
  status: AuthStatus;
  /** el último error al conectar (para mostrarlo junto al botón) */
  error?: string;
  /** cuándo vence el token (ms) */
  expires?: number;
}

const storage = () => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};
function readJson<T>(key: string): T | null {
  try {
    const v = storage()?.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    if (v == null) storage()?.removeItem(key);
    else storage()?.setItem(key, JSON.stringify(v));
  } catch {
    // almacenamiento bloqueado: sólo dura esta pestaña
  }
}

interface Token {
  value: string;
  expires: number;
  /** cuenta del token (para no usar el de otra) */
  email?: string;
}
/** El token guardado sirve para esta cuenta */
const ownToken = (tk: Token | null, a: Account | null): Token | null => (tk && a && (!tk.email || !a.emailAddress || tk.email === a.emailAddress) ? tk : null);

/** ¿Sirve el token ahora? (`within`: además, que no venza antes de eso) */
export const tokenValid = (tk: { expires: number } | null, now = Date.now(), within = 0) => !!tk && tk.expires - MARGIN - within > now;

const initialAccount = CLIENT_ID ? readJson<Account>(USER_KEY) : null;
let token: Token | null = ownToken(readJson<Token>(TOKEN_KEY), initialAccount);

const statusOf = (a: Account | null): AuthStatus => (!a ? 'signedOut' : tokenValid(token) ? 'connected' : 'expired');
let state: GoogleState = { enabled: !!CLIENT_ID, account: initialAccount, status: statusOf(initialAccount), expires: token?.expires };
const listeners = new Set<() => void>();
function set(patch: Partial<GoogleState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export const googleState = () => state;

/** Estado de la cuenta para componentes de React */
export function useGoogle(): GoogleState {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}

// ── avisos: llegó un token (para subir lo pendiente) y cambió la cuenta ───
const connectedListeners = new Set<() => void>();
/** Avisa cada vez que hay un token nuevo (al reconectar, lo de fondo que quedó pendiente se reintenta) */
export function onConnected(l: () => void): () => void {
  connectedListeners.add(l);
  return () => connectedListeners.delete(l);
}

// ── vencimiento: el estado pasa a «expired» solo, sin esperar a que algo falle ───
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleExpiry() {
  clearTimeout(expiryTimer);
  if (!token || typeof window === 'undefined') return;
  const ms = token.expires - MARGIN - Date.now();
  if (ms <= 0) return;
  // (setTimeout no admite más de ~24 días)
  expiryTimer = setTimeout(() => state.account && set({ status: statusOf(state.account) }), Math.min(ms, 2 ** 31 - 1));
}

function setToken(tk: Token | null) {
  token = tk;
  writeJson(TOKEN_KEY, tk);
  scheduleExpiry();
}

// ── Google Identity Services ─────────────────────────────────────────────
let gis: Promise<Oauth2> | null = null;
function loadGis(): Promise<Oauth2> {
  gis ??= new Promise<Oauth2>((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve(window.google.accounts.oauth2);
    const s = document.createElement('script');
    s.src = GIS_URL;
    s.async = true;
    const timer = setTimeout(() => reject(new DriveError('offline', t('Could not load Google Identity Services (offline?)'))), GIS_TIMEOUT);
    s.onload = () => {
      clearTimeout(timer);
      if (window.google?.accounts?.oauth2) resolve(window.google.accounts.oauth2);
      else reject(new Error(t("Google Identity Services didn't load")));
    };
    s.onerror = () => {
      clearTimeout(timer);
      reject(new DriveError('offline', t('Could not load Google Identity Services (offline?)')));
    };
    document.head.appendChild(s);
  });
  gis.catch(() => (gis = null));
  return gis;
}

/** El pedido en curso: uno solo a la vez; el que llega mientras tanto espera el mismo */
let pending: { promise: Promise<string>; reject(e: Error): void } | null = null;
let client: { oauth2: Oauth2; tc: TokenClient } | null = null;
/** a quién entregarle la respuesta del pedido actual (GIS llama siempre al mismo callback) */
let deliver: { resolve(v: string): void; reject(e: Error): void } | null = null;

function onTokenResponse(oauth2: Oauth2, r: TokenResponse) {
  const d = deliver;
  if (r.error || !r.access_token) return d?.reject(new DriveError(r.error === 'access_denied' ? 'cancelled' : 'auth', r.error_description || r.error || t("Google didn't return a token")));
  if (!oauth2.hasGrantedAllScopes(r, SCOPE)) return d?.reject(new DriveError('auth', t('You need to allow access to Google Drive to save there')));
  // aunque el pedido ya se haya dado por perdido (tiempo máximo), un token que llega sirve
  setToken({ value: r.access_token, expires: Date.now() + Number(r.expires_in ?? 3600) * 1000, email: state.account?.emailAddress });
  if (state.account) set({ status: 'connected', error: undefined, expires: token!.expires });
  d?.resolve(r.access_token);
  connectedListeners.forEach((l) => l());
}

function tokenClient(oauth2: Oauth2) {
  if (client?.oauth2 === oauth2) return client.tc;
  const tc = oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (r) => onTokenResponse(oauth2, r),
    error_callback: (e) =>
      deliver?.reject(
        e.type === 'popup_closed'
          ? new DriveError('cancelled', t('The Google window was closed'))
          : e.type === 'popup_failed_to_open'
            ? new DriveError('auth', t('The browser blocked the Google window: allow pop-ups for this site and try again'))
            : new DriveError('auth', e.message || t('Google error')),
      ),
  });
  client = { oauth2, tc };
  return tc;
}

/** Pide un token a Google: abre la ventanita (sólo llamarla en un gesto del usuario) */
function requestToken(prompt: '' | 'select_account' | 'consent'): Promise<string> {
  if (pending) return pending.promise;
  let rejectOuter!: (e: Error) => void;
  const promise = new Promise<string>((resolve, reject) => {
    rejectOuter = reject;
    const timer = setTimeout(() => reject(new DriveError('timeout', t("Google didn't answer: check the Google window (it may be behind this one) and try again"))), AUTH_TIMEOUT);
    deliver = {
      resolve: (v) => (clearTimeout(timer), resolve(v)),
      reject: (e) => (clearTimeout(timer), reject(e)),
    };
    loadGis().then(
      (oauth2) => tokenClient(oauth2).requestAccessToken({ prompt, login_hint: state.account?.emailAddress }),
      (e: Error) => deliver?.reject(e),
    );
  }).finally(() => {
    pending = null;
    deliver = null;
    if (state.status === 'connecting') set({ status: statusOf(state.account) });
  });
  pending = { promise, reject: rejectOuter };
  set({ status: 'connecting', error: undefined });
  return promise;
}

/** Corta la espera de la ventana de Google */
export function cancelConnect() {
  pending?.reject(new DriveError('cancelled', t('Cancelled')));
}

const notConfigured = () => new DriveError('auth', t("Google sign-in isn't configured"));

/** Token para lo que pidió el usuario: si venció, abre la ventana de Google (en un gesto) */
export async function getToken(force = false): Promise<string> {
  if (!CLIENT_ID) throw notConfigured();
  if (!force && tokenValid(token)) return token!.value;
  return requestToken('');
}

/** Token para lo de fondo: nunca abre ventanas; si no hay uno válido, pide reconectar */
export async function backgroundToken(force = false): Promise<string> {
  if (!CLIENT_ID) throw notConfigured();
  if (!force && tokenValid(token)) return token!.value;
  // (un 401 con un token que parecía válido: se revocó o venció antes)
  if (force) setToken(null);
  if (state.account && state.status !== 'connecting') set({ status: 'expired', expires: undefined });
  throw new DriveError('auth', t('Your Google session expired: reconnect to keep using Drive'));
}

/** Drive para lo que pide el usuario (puede abrir la ventana de Google) */
export const drive = new DriveClient(getToken);
/** Drive para lo de fondo (nunca abre ventanas) */
export const driveBg = drive.withToken(backgroundToken);

/**
 * En un gesto de Drive (Guardar, Abrir, el menú de la cuenta): si el token vence pronto, se
 * renueva ahora, mientras hay gesto (la ventanita se cierra sola). No espera ni avisa si falla.
 */
export function renewInGesture(): void {
  if (!CLIENT_ID || !state.account || pending || tokenValid(token, Date.now(), RENEW_BEFORE)) return;
  requestToken('').catch(() => {});
}

/** Reconectar a pedido del usuario (botón «Reconectar») */
export async function reconnect(): Promise<void> {
  if (!CLIENT_ID) throw notConfigured();
  try {
    await requestToken('');
    await checkAccount();
  } catch (e) {
    if (errorKind(e) !== 'cancelled') set({ error: (e as Error).message });
    throw e;
  }
}

/** Después de reconectar: si Google dio el token de otra cuenta, pasa a ésa (y se olvida lo de la otra) */
async function checkAccount() {
  const prev = state.account;
  const user = await drive.user();
  const account: Account = { displayName: user.displayName, emailAddress: user.emailAddress, photoLink: user.photoLink };
  if (prev?.emailAddress && account.emailAddress && prev.emailAddress !== account.emailAddress) drive.reset();
  if (token) setToken({ ...token, email: account.emailAddress });
  writeJson(USER_KEY, account);
  set({ account, status: 'connected', expires: token?.expires });
}

export async function signIn(): Promise<void> {
  if (!CLIENT_ID) throw notConfigured();
  try {
    await requestToken('select_account');
    await checkAccount();
  } catch (e) {
    if (errorKind(e) !== 'cancelled') set({ error: (e as Error).message });
    throw e;
  }
}

export function signOut(): void {
  const tt = token?.value;
  cancelConnect();
  setToken(null);
  writeJson(USER_KEY, null);
  drive.reset();
  set({ account: null, status: 'signedOut', error: undefined, expires: undefined });
  if (tt) window.google?.accounts?.oauth2?.revoke(tt);
}

if (typeof window !== 'undefined' && CLIENT_ID) {
  scheduleExpiry();
  // con la sesión iniciada, GIS se carga de antemano: así la ventanita sale dentro del gesto
  if (state.account) loadGis().catch(() => {});
  // otra pestaña renovó el token, inició o cerró la sesión
  window.addEventListener('storage', (e) => {
    if (e.key === TOKEN_KEY) {
      const before = token?.value;
      token = ownToken(readJson<Token>(TOKEN_KEY), state.account);
      scheduleExpiry();
      if (state.account && state.status !== 'connecting') set({ status: statusOf(state.account), expires: token?.expires });
      if (token && token.value !== before && tokenValid(token)) connectedListeners.forEach((l) => l());
    } else if (e.key === USER_KEY) {
      const account = readJson<Account>(USER_KEY);
      if (account?.emailAddress !== state.account?.emailAddress) drive.reset();
      set({ account, status: statusOf(account) });
    }
  });
}

/** Inicial para el circulito de la cuenta */
export const initial = (a: Pick<Account, 'displayName' | 'emailAddress'>) => (a.displayName || a.emailAddress || '?').trim().charAt(0).toUpperCase() || '?';

/** Link a una carpeta en la web de Drive */
export const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
