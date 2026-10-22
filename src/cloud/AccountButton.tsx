// Circulito de la cuenta de Google (arriba a la derecha) y diálogo para abrir desde Drive.
import { useEffect, useRef, useState } from 'react';
import { Modal } from '../schematic/dialogs.tsx';
import { pickAscFiles } from '../schematic/fileio.ts';
import type { DriveFile } from './drive.ts';
import { FOLDER_NAME, uniqueName } from './drive.ts';
import { drive, initial, signIn, signOut, useGoogle, type Account } from './google.ts';
import { locale, t } from '../i18n/i18n.ts';

const BASE = import.meta.env.BASE_URL;

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
        className={`account-btn${a ? ' signed-in' : ' google'}`}
        aria-label={a ? t('Google account: {displayName}', { displayName: a.displayName }) : t('Sign in with Google')}
        title={a ? `${a.displayName}${a.emailAddress ? ` (${a.emailAddress})` : ''}` : t('Sign in with Google')}
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
      {open && (
        <div className="account-menu" role="menu">
          {a ? (
            <>
              <div className="account-who">
                <strong>{a.displayName}</strong>
                {a.emailAddress && <span>{a.emailAddress}</span>}
              </div>
              <p className="hint">{t('Your simulations live in the «')}{FOLDER_NAME}{t('» folder of your Google Drive: Open (Ctrl+O) lists them and Save (Ctrl+S) saves them there.')}</p>
              <button role="menuitem" onClick={() => (signOut(), setOpen(false))}>{t('Sign out')}</button>
            </>
          ) : (
            <>
              <ul className="account-ticks">
                <li>{t('This creates the folder')}{' '}<strong>{FOLDER_NAME}</strong> {t('in your Google Drive.')}</li>
                <li>TurboSpice <strong>{t('can only see the files it creates itself')}</strong>.</li>
              </ul>
              <button role="menuitem" className="primary" onClick={login} disabled={g.busy}>
                {g.busy ? 'Conectando…' : t('Sign in with Google')}
              </button>
            </>
          )}
          {error && <p className="hint warn">{error}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Sube .asc del equipo a la carpeta TurboSpice (sin pisar: «x (2).asc» si el nombre ya está).
 * `taken`: nombres que ya hay en la carpeta (si no se pasa, se consulta).
 */
export async function importToDrive(picked: { name: string; bytes: Uint8Array }[], taken?: string[]): Promise<DriveFile[]> {
  const used = taken ? [...taken] : (await drive.list()).map((f) => f.name);
  const out: DriveFile[] = [];
  for (const p of picked) {
    const name = uniqueName(p.name, used);
    used.push(name);
    out.push(await drive.save(name, p.bytes));
  }
  return out;
}

/**
 * "Mis simulaciones": la carpeta TurboSpice del Drive como lugar de trabajo. Buscar, abrir,
 * renombrar, duplicar, mandar a la papelera e importar .asc del equipo (se suben a la carpeta).
 */
export function DriveDialog({ currentId, onOpen, onRenamed, onTrashed, onClose }: {
  /** archivo abierto ahora (se marca en la lista) */
  currentId?: string;
  onOpen(f: DriveFile): void;
  onRenamed?(f: DriveFile): void;
  onTrashed?(id: string): void;
  onClose(): void;
}) {
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const reload = () => drive.list().then(setFiles, (e: Error) => setError(e.message));
  useEffect(() => {
    reload();
  }, []);

  const run = async (what: string, f: () => Promise<unknown>) => {
    setBusy(what);
    setError(null);
    try {
      await f();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const names = (files ?? []).map((f) => f.name);
  const rename = (f: DriveFile) => {
    const ext = /\.turbo$/i.test(f.name) ? '.turbo' : '.asc';
    const n = window.prompt(t('New name'), f.name.replace(/\.(asc|turbo)$/i, ''))?.trim();
    if (!n) return;
    const name = `${n.replace(/\.(asc|turbo)$/i, '')}${ext}`;
    if (name === f.name) return;
    if (names.some((x) => x.toLowerCase() === name.toLowerCase())) return setError(t('There\'s already a «{name}» in the folder', { name }));
    run('Renombrando…', async () => onRenamed?.(await drive.rename(f.id, name)));
  };
  const duplicate = (f: DriveFile) => run('Duplicando…', () => drive.copy(f.id, uniqueName(f.name.replace(/(\.(asc|turbo))?$/i, t(' (copy)$1')), names)));
  const trash = (f: DriveFile) => {
    if (!window.confirm(t('Move «{name}» to the Google Drive trash?', { name: f.name }))) return;
    run('Borrando…', async () => (await drive.trash(f.id), onTrashed?.(f.id)));
  };
  const importLocal = async () => {
    const picked = await pickAscFiles();
    if (!picked.length) return;
    let saved: DriveFile[] = [];
    await run(picked.length > 1 ? t('Importing {length} files…', { length: picked.length }) : t('Importing…'), async () => {
      saved = await importToDrive(picked, names);
    });
    // uno solo: se abre directamente; varios: quedan en la lista
    if (saved.length === 1) onOpen(saved[0]);
  };

  const q = query.trim().toLowerCase();
  const shown = (files ?? []).filter((f) => !q || f.name.toLowerCase().includes(q));
  return (
    <Modal title={t('My simulations')} onClose={onClose} large>
      <div className="drive-browser">
        <p className="hint">{t('Folder «')}{FOLDER_NAME}{t('» folder of your Google Drive.')}</p>
        <input
          type="search"
          className="drive-search"
          placeholder={t('Search by name…')}
          value={query}
          autoFocus
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && shown.length === 1 && onOpen(shown[0])}
        />
        {error && <p className="hint warn">{error}</p>}
        {!files ? (
          !error && <p className="hint">{t('Loading…')}</p>
        ) : !files.length ? (
          <p className="hint">{t('No projects yet. Save with Ctrl+S or import an .asc from your computer.')}</p>
        ) : !shown.length ? (
          <p className="hint">{t('Nothing matches «')}{query}».</p>
        ) : (
          <ul className="drive-list">
            {shown.map((f) => (
              <li key={f.id} className={f.id === currentId ? 'current' : ''}>
                <button className="drive-open" onClick={() => onOpen(f)} title={t('Open')} disabled={!!busy}>
                  <span>{f.name}</span>
                  {f.modifiedTime && <span className="hint">{new Date(f.modifiedTime).toLocaleString(locale())}</span>}
                </button>
                <button className="drive-act" title={t('Rename')} aria-label={t('Rename {name}', { name: f.name })} onClick={() => rename(f)} disabled={!!busy}>✎</button>
                <button className="drive-act" title={t('Duplicate')} aria-label={t('Duplicate {name}', { name: f.name })} onClick={() => duplicate(f)} disabled={!!busy}>⧉</button>
                <button className="drive-act" title={t('Move to trash')} aria-label={t('Delete {name}', { name: f.name })} onClick={() => trash(f)} disabled={!!busy}>🗑</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="buttons">
        {busy && <span className="hint">{busy}</span>}
        <button type="button" onClick={importLocal} disabled={!!busy} title={t('Uploads one or more .asc files from your computer to the folder and opens the file (if it\'s just one)')}>
          {t('Import from computer…')}
        </button>
        <button type="button" onClick={onClose}>{t('Close')}</button>
      </div>
    </Modal>
  );
}
