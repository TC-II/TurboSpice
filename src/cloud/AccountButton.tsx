// Circulito de la cuenta de Google (arriba a la derecha) y diálogo para abrir desde Drive.
import { useEffect, useRef, useState } from 'react';
import { Modal } from '../schematic/dialogs.tsx';
import type { DriveFile } from './drive.ts';
import { FOLDER_NAME } from './drive.ts';
import { drive, initial, pickDriveFile, pickerEnabled, signIn, signOut, useGoogle, type Account } from './google.ts';

function Avatar({ account }: { account: Account }) {
  const [broken, setBroken] = useState(false);
  return account.photoLink && !broken ? (
    <img src={account.photoLink} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
  ) : (
    <span>{initial(account)}</span>
  );
}

/** No se muestra si no hay Client ID configurado */
export function AccountButton() {
  const g = useGoogle();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  if (!g.enabled) return null;
  const login = () => {
    setError(null);
    signIn().then(
      () => setOpen(false),
      (e: Error) => setError(e.message),
    );
  };
  const a = g.account;
  return (
    <div className="account" ref={box}>
      <button
        className={`account-btn${a ? ' signed-in' : ''}`}
        aria-label={a ? `Cuenta de Google: ${a.displayName}` : 'Iniciar sesión con Google'}
        title={a ? `${a.displayName}${a.emailAddress ? ` (${a.emailAddress})` : ''}` : 'Iniciar sesión con Google'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {a ? (
          <Avatar account={a} />
        ) : (
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M10 10a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M4 17c.8-3 3.2-4.6 6-4.6s5.2 1.6 6 4.6" />
          </svg>
        )}
      </button>
      {open && (
        <div className="account-menu" role="menu">
          {a ? (
            <>
              <div className="account-who">
                <strong>{a.displayName}</strong>
                {a.emailAddress && <span>{a.emailAddress}</span>}
              </div>
              <p className="hint">Al guardar, los esquemáticos van a la carpeta «{FOLDER_NAME}» de tu Google Drive.</p>
              <button role="menuitem" onClick={() => (signOut(), setOpen(false))}>Cerrar sesión</button>
            </>
          ) : (
            <>
              <p className="hint">Iniciá sesión para guardar y abrir tus esquemáticos en Google Drive (carpeta «{FOLDER_NAME}»). TurboSpice sólo ve los archivos que crea él mismo.</p>
              <button role="menuitem" className="primary" onClick={login} disabled={g.busy}>
                {g.busy ? 'Conectando…' : 'Iniciar sesión con Google'}
              </button>
            </>
          )}
          {error && <p className="hint warn">{error}</p>}
        </div>
      )}
    </div>
  );
}

export function DriveDialog({ onOpen, onClose, onError }: { onOpen(f: DriveFile): void; onClose(): void; onError?(msg: string): void }) {
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    drive.list().then(setFiles, (e: Error) => setError(e.message));
  }, []);
  return (
    <Modal title={`Abrir de Google Drive (carpeta «${FOLDER_NAME}»)`} onClose={onClose}>
      {error ? (
        <p className="hint warn">{error}</p>
      ) : !files ? (
        <p className="hint">Cargando…</p>
      ) : !files.length ? (
        <p className="hint">Todavía no hay esquemáticos guardados en Drive. Usá Archivo → Guardar con la sesión iniciada.</p>
      ) : (
        <ul className="drive-list">
          {files.map((f) => (
            <li key={f.id}>
              <button onClick={() => onOpen(f)}>
                <span>{f.name}</span>
                {f.modifiedTime && <span className="hint">{new Date(f.modifiedTime).toLocaleString()}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="buttons">
        {pickerEnabled && (
          <button
            type="button"
            title="Elegir cualquier .asc de tu Drive (también los que no guardó TurboSpice)"
            onClick={() => {
              onClose();
              pickDriveFile().then((f) => f && onOpen(f), (e: Error) => onError?.(e.message));
            }}
          >
            Buscar en todo mi Drive…
          </button>
        )}
        <button type="button" onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}
