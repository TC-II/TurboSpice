// Circulito de la cuenta de Google (arriba a la derecha) y diálogo para abrir desde Drive.
import { useEffect, useRef, useState } from 'react';
import { Modal } from '../schematic/dialogs.tsx';
import { pickAscFiles } from '../schematic/fileio.ts';
import type { DriveFile } from './drive.ts';
import { FOLDER_NAME, uniqueName } from './drive.ts';
import { drive, initial, signIn, signOut, useGoogle, type Account } from './google.ts';

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
        aria-label={a ? `Cuenta de Google: ${a.displayName}` : 'Iniciar sesión con Google'}
        title={a ? `${a.displayName}${a.emailAddress ? ` (${a.emailAddress})` : ''}` : 'Iniciar sesión con Google'}
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
              <p className="hint">Tus simulaciones viven en la carpeta «{FOLDER_NAME}» de tu Google Drive: Abrir (Ctrl+O) las lista y Guardar (Ctrl+S) las guarda ahí.</p>
              <button role="menuitem" onClick={() => (signOut(), setOpen(false))}>Cerrar sesión</button>
            </>
          ) : (
            <>
              <ul className="account-ticks">
                <li>Se creará la carpeta <strong>{FOLDER_NAME}</strong> en tu Google Drive.</li>
                <li>TurboSpice <strong>sólo puede ver los archivos que crea él mismo</strong>.</li>
              </ul>
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
    const n = window.prompt('Nuevo nombre', f.name.replace(/\.asc$/i, ''))?.trim();
    if (!n) return;
    const name = /\.asc$/i.test(n) ? n : `${n}.asc`;
    if (name === f.name) return;
    if (names.some((x) => x.toLowerCase() === name.toLowerCase())) return setError(`Ya hay un «${name}» en la carpeta`);
    run('Renombrando…', async () => onRenamed?.(await drive.rename(f.id, name)));
  };
  const duplicate = (f: DriveFile) => run('Duplicando…', () => drive.copy(f.id, uniqueName(`${f.name.replace(/\.asc$/i, '')} (copia)`, names)));
  const trash = (f: DriveFile) => {
    if (!window.confirm(`¿Mandar «${f.name}» a la papelera de Google Drive?`)) return;
    run('Borrando…', async () => (await drive.trash(f.id), onTrashed?.(f.id)));
  };
  const importLocal = async () => {
    const picked = await pickAscFiles();
    if (!picked.length) return;
    let saved: DriveFile[] = [];
    await run(picked.length > 1 ? `Importando ${picked.length} archivos…` : 'Importando…', async () => {
      saved = await importToDrive(picked, names);
    });
    // uno solo: se abre directamente; varios: quedan en la lista
    if (saved.length === 1) onOpen(saved[0]);
  };

  const q = query.trim().toLowerCase();
  const shown = (files ?? []).filter((f) => !q || f.name.toLowerCase().includes(q));
  return (
    <Modal title="Mis simulaciones" onClose={onClose} large>
      <div className="drive-browser">
        <p className="hint">Carpeta «{FOLDER_NAME}» de tu Google Drive.</p>
        <input
          type="search"
          className="drive-search"
          placeholder="Buscar por nombre…"
          value={query}
          autoFocus
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && shown.length === 1 && onOpen(shown[0])}
        />
        {error && <p className="hint warn">{error}</p>}
        {!files ? (
          !error && <p className="hint">Cargando…</p>
        ) : !files.length ? (
          <p className="hint">Todavía no hay simulaciones. Guardá con Ctrl+S o importá un .asc de tu computadora.</p>
        ) : !shown.length ? (
          <p className="hint">Nada coincide con «{query}».</p>
        ) : (
          <ul className="drive-list">
            {shown.map((f) => (
              <li key={f.id} className={f.id === currentId ? 'current' : ''}>
                <button className="drive-open" onClick={() => onOpen(f)} title="Abrir" disabled={!!busy}>
                  <span>{f.name}</span>
                  {f.modifiedTime && <span className="hint">{new Date(f.modifiedTime).toLocaleString()}</span>}
                </button>
                <button className="drive-act" title="Renombrar" aria-label={`Renombrar ${f.name}`} onClick={() => rename(f)} disabled={!!busy}>✎</button>
                <button className="drive-act" title="Duplicar" aria-label={`Duplicar ${f.name}`} onClick={() => duplicate(f)} disabled={!!busy}>⧉</button>
                <button className="drive-act" title="Mandar a la papelera" aria-label={`Borrar ${f.name}`} onClick={() => trash(f)} disabled={!!busy}>🗑</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="buttons">
        {busy && <span className="hint">{busy}</span>}
        <button type="button" onClick={importLocal} disabled={!!busy} title="Sube uno o más .asc de tu computadora a la carpeta y abre el archivo (si es uno)">
          Importar desde la PC…
        </button>
        <button type="button" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  );
}
