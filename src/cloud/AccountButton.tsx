// Circulito de la cuenta de Google (arriba a la derecha): iniciar sesión, el estado de la sesión
// (conectada, vencida: reconectar, esperando la ventana de Google: cancelar), «Mis proyectos» y la
// carpeta en Drive, y cerrar sesión.
import { useEffect, useRef, useState } from 'react';
import { FOLDER_NAME, errorKind } from './drive.ts';
import { cancelConnect, driveBg, folderUrl, initial, reconnect, signIn, signOut, useGoogle, type Account } from './google.ts';
import { Icon } from '../ui/icons.tsx';
import { locale, t } from '../i18n/i18n.ts';

const BASE = import.meta.env.BASE_URL;

/** Pedido de abrir «Mis proyectos» (lo escucha el modo esquemático, que tiene los diálogos) */
export const OPEN_PROJECTS_EVENT = 'turbospice:open-projects';

function Avatar({ account }: { account: Account }) {
  const [broken, setBroken] = useState(false);
  return account.photoLink && !broken ? <img src={account.photoLink} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : <span>{initial(account)}</span>;
}

/** Hora (HH:MM) en que vence la sesión */
const until = (ms: number) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

/** No se muestra si no hay Client ID configurado */
export function AccountButton() {
  const g = useGoogle();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rootId, setRootId] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  // la carpeta TurboSpice, para el link (de fondo: sin ventanas)
  useEffect(() => {
    if (!open || g.status !== 'connected' || rootId) return;
    driveBg.folderId().then(setRootId, () => {});
  }, [open, g.status, rootId]);
  useEffect(() => setRootId(null), [g.account?.emailAddress]);

  if (!g.enabled) return null;
  const fail = (e: Error) => errorKind(e) !== 'cancelled' && setError(e.message);
  const login = () => {
    setError(null);
    signIn().then(() => setOpen(false), fail);
  };
  const again = () => {
    setError(null);
    reconnect().catch(fail);
  };
  const a = g.account;
  const connecting = g.status === 'connecting';
  const expired = !!a && g.status === 'expired';
  return (
    <div className="account" ref={box}>
      <button
        className={`account-btn${a ? ' signed-in' : ' google'}${expired ? ' expired' : ''}`}
        aria-label={a ? t('Google account: {displayName}', { displayName: a.displayName }) : t('Sign in with Google')}
        title={a ? `${a.displayName}${a.emailAddress ? ` (${a.emailAddress})` : ''}${expired ? ` · ${t('session expired')}` : ''}` : t('Sign in with Google')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {a ? (
          <Avatar account={a} />
        ) : (
          // botón oficial de Google sin cambios (ver public/google/README.md), según el tema
          <>
            <img className="g-light" src={`${BASE}google/signin-light.svg`} alt="" />
            <img className="g-dark" src={`${BASE}google/signin-dark.svg`} alt="" />
          </>
        )}
      </button>
      {expired && <span className="account-dot" aria-hidden="true" />}
      {open && (
        <div className="account-menu" role="menu">
          {a ? (
            <>
              <div className="account-who">
                <strong>{a.displayName}</strong>
                {a.emailAddress && <span>{a.emailAddress}</span>}
              </div>
              <div className={`account-session ${g.status}`} role="status">
                <span className="dot" aria-hidden="true" />
                {connecting ? (
                  <>
                    <span>{t('Waiting for the Google window…')}</span>
                    <button type="button" className="link" onClick={cancelConnect}>
                      {t('Cancel')}
                    </button>
                  </>
                ) : expired ? (
                  <>
                    <span>{t('Session expired')}</span>
                    <button type="button" className="link" onClick={again}>
                      {t('Reconnect')}
                    </button>
                  </>
                ) : (
                  <span>{g.expires ? t('Connected to Google Drive (until {time})', { time: until(g.expires) }) : t('Connected to Google Drive')}</span>
                )}
              </div>
              {expired && <p className="hint">{t('Google gives web pages 1-hour sessions. Your work is kept in this browser; reconnect and pending changes upload on their own.')}</p>}
              <button role="menuitem" onClick={() => (window.dispatchEvent(new Event(OPEN_PROJECTS_EVENT)), setOpen(false))}>
                <Icon name="folders" size={16} /> {t('My projects…')}
              </button>
              {rootId && (
                <a role="menuitem" className="menu-link" href={folderUrl(rootId)} target="_blank" rel="noreferrer noopener" onClick={() => setOpen(false)}>
                  <Icon name="external" size={16} /> {t('Open the «{folder}» folder in Google Drive', { folder: FOLDER_NAME })}
                </a>
              )}
              <button role="menuitem" onClick={() => (signOut(), setOpen(false))}>
                <Icon name="logout" size={16} /> {t('Sign out')}
              </button>
            </>
          ) : (
            <>
              <ul className="account-ticks">
                <li>
                  {t('This creates the folder')} <strong>{FOLDER_NAME}</strong> {t('in your Google Drive.')}
                </li>
                <li>
                  TurboSpice <strong>{t('can only see the files it creates itself')}</strong>.
                </li>
                <li>{t('Organize your projects in folders, from any computer.')}</li>
              </ul>
              {connecting ? (
                <button role="menuitem" onClick={cancelConnect}>
                  {t('Waiting for the Google window…')} · {t('Cancel')}
                </button>
              ) : (
                <button role="menuitem" className="primary" onClick={login}>
                  {t('Sign in with Google')}
                </button>
              )}
            </>
          )}
          {(error ?? g.error) && <p className="hint warn">{error ?? g.error}</p>}
        </div>
      )}
    </div>
  );
}
