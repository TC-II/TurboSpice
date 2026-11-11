// Indicador del proyecto en Google Drive, junto a la cápsula del proyecto: una nube que dice si está
// al día, subiendo, con cambios por subir, sin conexión o con la sesión vencida. Al tocarla, un
// panel con dónde está (TurboSpice › carpeta › archivo), cuándo se guardó y qué hacer.
import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../ui/icons.tsx';
import { t } from '../i18n/i18n.ts';
import { FOLDER_NAME, folderPath } from './drive.ts';
import { driveBg, folderUrl, signIn, useGoogle } from './google.ts';
import { ago } from './projects.ts';
import { syncNeedsAttention, type SyncKind } from './sync.ts';

interface Sync {
  kind: SyncKind;
  savedAt?: number;
  error?: { message: string } | null;
}

const ICON: Record<SyncKind, IconName> = {
  disabled: 'cloud',
  signedOut: 'cloudOff',
  notInDrive: 'cloudUp',
  saving: 'cloudUp',
  synced: 'cloudOk',
  pending: 'cloud',
  auth: 'cloudWarn',
  offline: 'cloudOff',
  error: 'cloudWarn',
  conflict: 'cloudWarn',
};

/** Una línea: lo que pasa con el proyecto en Drive */
export function syncLabel(kind: SyncKind, savedAt?: number): string {
  switch (kind) {
    case 'signedOut':
      return t('Only in this browser');
    case 'notInDrive':
      return t('Not in Google Drive yet');
    case 'saving':
      return t('Saving to Google Drive…');
    case 'synced':
      return savedAt ? t('Saved to Google Drive {when}', { when: ago(savedAt) }) : t('Saved to Google Drive');
    case 'pending':
      return t('Unsaved changes: they upload on their own');
    case 'auth':
      return t('Google session expired: reconnect to upload the changes');
    case 'offline':
      return t('No connection: it will retry on its own');
    case 'error':
      return t("Couldn't save to Google Drive");
    case 'conflict':
      return t('Changed in Google Drive from elsewhere');
    default:
      return '';
  }
}

export function CloudStatus({
  sync,
  driveId,
  fileName,
  onSaveNow,
  onReconnect,
  onOpenProjects,
  onMove,
}: {
  sync: Sync;
  driveId?: string;
  fileName: string;
  onSaveNow(): void;
  onReconnect(): void;
  onOpenProjects(): void;
  onMove(): void;
}) {
  const g = useGoogle();
  const [open, setOpen] = useState(false);
  const [where, setWhere] = useState<{ path: string[]; folder?: string; link?: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // el reloj del «hace 3 min»
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);

  // dónde está: de fondo (sin ventanas de Google); si no se puede, no se muestra
  useEffect(() => {
    if (!open || !driveId || g.status !== 'connected') return;
    let off = false;
    (async () => {
      const m = await driveBg.meta(driveId);
      const root = await driveBg.folderId();
      const items = driveBg.cachedLibrary ?? (await driveBg.library()).items;
      const path = folderPath(items, m.parent, root).map((f) => f.name);
      if (!off) setWhere({ path: [FOLDER_NAME, ...path], folder: m.parent, link: m.webViewLink });
    })().catch(() => !off && setWhere(null));
    return () => {
      off = true;
    };
  }, [open, driveId, g.status]);

  if (sync.kind === 'disabled') return null;
  const attention = syncNeedsAttention(sync.kind);
  const label = syncLabel(sync.kind, sync.savedAt);
  return (
    <div className="cloud-status" ref={box}>
      <button
        type="button"
        className={`cloud-btn ${sync.kind}${attention ? ' attention' : ''}`}
        aria-label={t('Google Drive: {status}', { status: label })}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name={ICON[sync.kind]} size={18} />
        {sync.kind === 'saving' && <span className="cloud-spin" aria-hidden="true" />}
      </button>
      {open && (
        <div className="cloud-pop" role="dialog" aria-label={t('Project in Google Drive')}>
          <div className={`cloud-head ${sync.kind}`}>
            <Icon name={ICON[sync.kind]} size={20} />
            <strong>{label}</strong>
          </div>
          {sync.kind === 'signedOut' ? (
            <>
              <p className="hint">{t('Sign in with Google to keep your projects in your Drive, organized in folders and available on any computer.')}</p>
              <button
                type="button"
                className="primary"
                onClick={() =>
                  void signIn().then(
                    () => setOpen(false),
                    () => {},
                  )
                }
                disabled={g.status === 'connecting'}
              >
                {g.status === 'connecting' ? t('Connecting…') : t('Sign in with Google')}
              </button>
            </>
          ) : sync.kind === 'notInDrive' ? (
            <>
              <p className="hint">{t('This project is only in this browser. Save it to keep it in your Google Drive.')}</p>
              <button type="button" className="primary" onClick={() => (onSaveNow(), setOpen(false))}>
                {t('Save to Google Drive')}
              </button>
            </>
          ) : (
            <>
              <dl className="cloud-facts">
                <dt>{t('File')}</dt>
                <dd>{fileName}</dd>
                <dt>{t('Folder')}</dt>
                <dd>
                  {where ? (
                    <a href={where.folder ? folderUrl(where.folder) : undefined} target="_blank" rel="noreferrer noopener" title={t('Open in Google Drive')}>
                      {where.path.join(' › ')}
                    </a>
                  ) : (
                    FOLDER_NAME
                  )}
                </dd>
                {sync.savedAt && (
                  <>
                    <dt>{t('Last saved')}</dt>
                    <dd>{ago(sync.savedAt)}</dd>
                  </>
                )}
              </dl>
              {sync.error && sync.kind !== 'auth' && <p className="hint warn">{sync.error.message}</p>}
              <div className="cloud-actions">
                {sync.kind === 'auth' ? (
                  <button type="button" className="primary" onClick={onReconnect} disabled={g.status === 'connecting'}>
                    {g.status === 'connecting' ? t('Connecting…') : t('Reconnect')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={sync.kind === 'pending' || sync.kind === 'error' || sync.kind === 'offline' ? 'primary' : ''}
                    onClick={onSaveNow}
                    disabled={sync.kind === 'saving' || sync.kind === 'conflict'}
                  >
                    <Icon name="save" size={16} /> {t('Save now')}
                  </button>
                )}
                <button type="button" onClick={() => (onMove(), setOpen(false))}>
                  <Icon name="folderMove" size={16} /> {t('Move…')}
                </button>
                {where?.link && (
                  <a className="button-link" href={where.link} target="_blank" rel="noreferrer noopener">
                    <Icon name="external" size={16} /> {t('Open in Google Drive')}
                  </a>
                )}
              </div>
            </>
          )}
          {sync.kind !== 'signedOut' && (
            <button type="button" className="cloud-all" onClick={() => (onOpenProjects(), setOpen(false))}>
              <Icon name="folders" size={16} /> {t('All my projects…')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
