// «Mis proyectos»: la carpeta TurboSpice del Drive como lugar de trabajo, con subcarpetas para
// organizarlos. Buscar en todas, ordenar, abrir, renombrar (ahí mismo), duplicar, mover (con el
// árbol o arrastrando a una carpeta o a la ruta), mandar a la papelera (con «Deshacer») y recuperar
// de la papelera, crear carpetas e importar del equipo. Sin prompt/confirm del navegador.
import { useState, type DragEvent } from 'react';
import { Modal } from '../schematic/dialogs.tsx';
import { pickAscFiles } from '../schematic/fileio.ts';
import { Icon } from '../ui/icons.tsx';
import { NameInput } from '../ui/EditableName.tsx';
import { t } from '../i18n/i18n.ts';
import { FOLDER_NAME, folderPath, isWithin, uniqueFolderName, uniqueName, type DriveFile, type DriveItem } from './drive.ts';
import { drive, folderUrl } from './google.ts';
import { ago, baseName, children, countInside, extOf, importToDrive, shownItem } from './projects.ts';
import { FolderTree, LibraryState, useLibrary } from './DriveSaveDialog.tsx';

const SORT_KEY = 'turbospice.drive.sort';
const FOLDER_KEY = 'turbospice.drive.folder';
const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // sin almacenamiento: vale para esta vez
  }
};

const projectsCount = (n: number) => (n === 0 ? t('empty') : n === 1 ? t('1 project') : t('{n} projects', { n }));

/** Mover: arrastrar una fila (su id va en el dataTransfer con este tipo) */
const DRAG_TYPE = 'application/x-turbospice-drive';

export function ProjectsDialog({
  currentId,
  onOpen,
  onRenamed,
  onClose,
}: {
  /** archivo abierto ahora (se marca en la lista) */
  currentId?: string;
  onOpen(f: DriveFile): void;
  onRenamed?(f: DriveFile): void;
  onClose(): void;
}) {
  const { lib, error, loading, load } = useLibrary();
  const [folder, setFolderState] = useState<string | null>(() => lsGet(FOLDER_KEY));
  const [query, setQuery] = useState('');
  const [sort, setSortState] = useState<'recent' | 'name'>(() => (lsGet(SORT_KEY) === 'name' ? 'name' : 'recent'));
  const [view, setView] = useState<'files' | 'trash'>('files');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [moving, setMoving] = useState<DriveItem | null>(null);
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ text: string; run(): Promise<void> } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);

  const root = lib?.root ?? '';
  const items = lib?.items ?? [];
  // la carpeta recordada puede no estar más (borrada, de otra cuenta): la raíz
  const here = folder && items.some((f) => f.id === folder && f.folder && !f.trashed) ? folder : root;
  const setFolder = (id: string) => {
    setFolderState(id);
    lsSet(FOLDER_KEY, id);
    setQuery('');
    setRenaming(null);
  };
  const setSort = (s: 'recent' | 'name') => {
    setSortState(s);
    lsSet(SORT_KEY, s);
  };

  /** Una acción sobre Drive: «Renombrando…» mientras tanto, el error si falla, y la lista al día */
  const run = async (what: string, f: () => Promise<unknown>) => {
    setBusy(what);
    setActionError(null);
    try {
      await f();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      await load();
      setBusy(null);
    }
  };

  const siblings = (f: DriveItem) => items.filter((x) => x.parent === f.parent && x.id !== f.id && !x.trashed);
  const rename = (f: DriveItem, n: string) => {
    const name = f.folder ? n : `${baseName(n)}${extOf(f.name) || '.turbo'}`;
    if (name === f.name) return;
    run(t('Renaming…'), async () => {
      const r = await drive.rename(f.id, name);
      if (!f.folder) onRenamed?.(r);
    });
  };
  const duplicate = (f: DriveItem) =>
    run(t('Duplicating…'), () =>
      drive.copy(
        f.id,
        uniqueName(
          f.name.replace(/(\.(asc|turbo))?$/i, t(' (copy)$1')),
          siblings(f).map((x) => x.name),
        ),
        f.parent,
      ),
    );
  const trash = (f: DriveItem) =>
    run(t('Moving to the trash…'), async () => {
      await drive.trash(f.id);
      setUndo({ text: t('«{name}» was moved to the trash', { name: f.name }), run: () => drive.restore(f.id) });
    });
  const restore = (f: DriveItem) =>
    run(t('Restoring…'), async () => {
      await drive.restore(f.id);
      // su carpeta también está en la papelera (o ya no está): vuelve a la raíz
      const parent = items.find((x) => x.id === f.parent);
      if (f.parent && f.parent !== root && (!parent || parent.trashed)) await drive.move(f.id, root, f.parent);
    });
  const move = (f: DriveItem, to: string) => {
    if (!f.parent || f.parent === to || isWithin(items, to, f.id)) return;
    const dest = to === root ? FOLDER_NAME : (items.find((x) => x.id === to)?.name ?? '');
    run(t('Moving…'), async () => {
      const taken = items.filter((x) => x.parent === to && !x.trashed).map((x) => x.name);
      // si en la de destino ya hay uno con ese nombre, se renombra al moverlo
      const name = f.folder ? uniqueFolderName(f.name, taken) : uniqueName(f.name, taken);
      if (name !== f.name) await drive.rename(f.id, name);
      await drive.move(f.id, to, f.parent!);
      setUndo({ text: t('«{name}» was moved to «{dest}»', { name, dest }), run: () => drive.move(f.id, f.parent!, to).then(() => undefined) });
    });
  };
  const newFolder = () =>
    run(t('Creating folder…'), async () => {
      const taken = items.filter((x) => x.parent === here && x.folder && !x.trashed).map((x) => x.name);
      const f = await drive.createFolder(uniqueFolderName(t('New folder'), taken), here);
      setRenaming(f.id);
    });
  const importLocal = async () => {
    const picked = await pickAscFiles();
    if (!picked.length) return;
    let saved: DriveFile[] = [];
    await run(picked.length > 1 ? t('Importing {length} files…', { length: picked.length }) : t('Importing…'), async () => {
      saved = await importToDrive(
        drive,
        picked,
        here,
        items.filter((x) => x.parent === here && !x.trashed).map((x) => x.name),
      );
    });
    // uno solo: se abre directamente; varios: quedan en la lista
    if (saved.length === 1) onOpen(saved[0]);
  };

  // ── arrastrar a una carpeta (o a la ruta) ──
  const dragProps = (f: DriveItem) => ({
    draggable: !busy && renaming !== f.id,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, f.id);
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragEnd: () => setDropOn(null),
  });
  const dropProps = (target: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropOn(target);
    },
    onDragLeave: () => setDropOn((d) => (d === target ? null : d)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDropOn(null);
      const f = items.find((x) => x.id === e.dataTransfer.getData(DRAG_TYPE));
      if (f) move(f, target);
    },
  });

  // ── qué se lista ──
  const q = query.trim().toLowerCase();
  const pathName = (f: DriveItem) => [FOLDER_NAME, ...folderPath(items, f.parent, root).map((x) => x.name)].join(' › ');
  const rows: DriveItem[] =
    view === 'trash'
      ? items.filter((f) => f.explicitlyTrashed && shownItem(f)).sort((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''))
      : q
        ? items
            .filter((f) => !f.trashed && shownItem(f) && f.name.toLowerCase().includes(q))
            .sort((a, b) => Number(b.folder) - Number(a.folder) || (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''))
        : children(items, here, sort);
  const crumbs = folderPath(items, here, root);
  const anyProject = items.some((f) => !f.trashed && !f.folder && shownItem(f));

  const openRow = (f: DriveItem) => (f.folder ? setFolder(f.id) : onOpen(f));

  return (
    <Modal title={t('My projects')} onClose={onClose} large>
      <div className="drive-browser">
        <div className="drive-top">
          {view === 'files' ? (
            <nav className="drive-crumbs" aria-label={t('Folder')}>
              {[{ id: root, name: FOLDER_NAME }, ...crumbs].map((c, i, all) => (
                <span key={c.id || 'root'} className="crumb-wrap">
                  {i > 0 && <span className="crumb-sep">›</span>}
                  <button
                    type="button"
                    className={`crumb${i === all.length - 1 ? ' here' : ''}${dropOn === c.id ? ' drop' : ''}`}
                    onClick={() => c.id && setFolder(c.id)}
                    disabled={!lib}
                    aria-current={i === all.length - 1 ? 'location' : undefined}
                    {...(c.id ? dropProps(c.id) : {})}
                  >
                    {i === 0 && <Icon name="folder" size={16} />}
                    {c.name}
                  </button>
                </span>
              ))}
            </nav>
          ) : (
            <div className="drive-crumbs">
              <button type="button" className="crumb" onClick={() => setView('files')}>
                ‹ {t('Back to my projects')}
              </button>
            </div>
          )}
          <div className="drive-tools">
            <select value={sort} onChange={(e) => setSort(e.target.value as 'recent' | 'name')} aria-label={t('Sort by')} disabled={view === 'trash' || !!q}>
              <option value="recent">{t('Most recent first')}</option>
              <option value="name">{t('By name')}</option>
            </select>
            <button
              type="button"
              className={`icon-only${view === 'trash' ? ' on' : ''}`}
              onClick={() => setView(view === 'trash' ? 'files' : 'trash')}
              title={t('Trash')}
              aria-label={t('Trash')}
              aria-pressed={view === 'trash'}
            >
              <Icon name="trash" size={16} />
            </button>
            <button type="button" className="icon-only" onClick={() => void load()} title={t('Reload the list')} aria-label={t('Reload the list')} disabled={loading}>
              <Icon name="refresh" size={16} />
            </button>
          </div>
        </div>
        {view === 'files' && (
          <input
            type="search"
            className="drive-search"
            placeholder={t('Search in all folders…')}
            value={query}
            autoFocus
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && rows.length === 1 && openRow(rows[0])}
          />
        )}
        {(actionError || undo) && (
          <div className={`drive-note${actionError ? ' warn' : ''}`} role={actionError ? 'alert' : 'status'}>
            <span>{actionError ?? undo?.text}</span>
            {!actionError && undo && (
              <button
                type="button"
                onClick={() => {
                  const u = undo;
                  setUndo(null);
                  void run(t('Undoing…'), u.run);
                }}
                disabled={!!busy}
              >
                {t('Undo')}
              </button>
            )}
            <button type="button" className="icon-only" aria-label={t('Close')} onClick={() => (setActionError(null), setUndo(null))}>
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
        {moving && lib && (
          <div className="drive-move" role="group" aria-label={t('Move «{name}» to:', { name: moving.name })}>
            <strong>{t('Move «{name}» to:', { name: moving.name })}</strong>
            <FolderTree lib={lib} selected={moveTo ?? moving.parent ?? root} onSelect={setMoveTo} disabled={(id) => isWithin(items, id, moving.id)} />
            <div className="buttons">
              <button type="button" onClick={() => (setMoving(null), setMoveTo(null))}>
                {t('Cancel')}
              </button>
              <button
                type="button"
                className="primary"
                disabled={!moveTo || moveTo === moving.parent}
                onClick={() => {
                  const f = moving;
                  setMoving(null);
                  setMoveTo(null);
                  if (moveTo) move(f, moveTo);
                }}
              >
                {t('Move here')}
              </button>
            </div>
          </div>
        )}
        {!lib ? (
          <LibraryState loading={loading} error={error} onRetry={load} />
        ) : !rows.length ? (
          <div className="drive-empty">
            {view === 'trash' ? (
              <p className="hint">{t('The trash is empty. Google Drive deletes what is in the trash after 30 days.')}</p>
            ) : q ? (
              <p className="hint">{t('Nothing matches «{query}».', { query })}</p>
            ) : here === root && !anyProject ? (
              <>
                <Icon name="cloud" size={36} />
                <p>{t('No projects yet.')}</p>
                <p className="hint">{t('Save with Ctrl+S, or import .turbo or .asc files from your computer.')}</p>
              </>
            ) : (
              <p className="hint">{t('This folder is empty. Drag projects here, or save into it with «Save as…».')}</p>
            )}
          </div>
        ) : (
          <ul className="drive-list" aria-busy={loading || !!busy}>
            {rows.map((f) => (
              <li
                key={f.id}
                className={`${f.id === currentId ? 'current' : ''}${f.folder ? ' folder' : ''}${dropOn === f.id ? ' drop' : ''}`}
                {...(view === 'files' ? dragProps(f) : {})}
                {...(view === 'files' && f.folder ? dropProps(f.id) : {})}
              >
                {renaming === f.id ? (
                  <span className="drive-open renaming">
                    <Icon name={f.folder ? 'folder' : 'project'} size={16} />
                    <NameInput
                      value={f.folder ? f.name : baseName(f.name)}
                      taken={siblings(f)
                        .filter((x) => x.folder === f.folder)
                        .map((x) => (f.folder ? x.name : baseName(x.name)))}
                      label={t('New name for {name}', { name: f.name })}
                      onDone={(n) => {
                        setRenaming(null);
                        if (n) rename(f, n);
                      }}
                    />
                  </span>
                ) : (
                  <button
                    className="drive-open"
                    onClick={() => view === 'files' && openRow(f)}
                    onDoubleClick={(e) => e.preventDefault()}
                    title={view === 'trash' ? undefined : f.folder ? t('Open folder') : t('Open')}
                    disabled={!!busy || view === 'trash'}
                  >
                    <Icon name={f.folder ? 'folder' : 'project'} size={16} />
                    <span className="drive-name">{f.name}</span>
                    {f.id === currentId && <span className="drive-badge">{t('open')}</span>}
                    {(q || view === 'trash') && <span className="drive-where">{pathName(f)}</span>}
                    <span className="hint">{f.folder ? projectsCount(countInside(items, f.id)) : ago(f.modifiedTime)}</span>
                  </button>
                )}
                {view === 'trash' ? (
                  <button className="drive-act labeled" onClick={() => restore(f)} disabled={!!busy} aria-label={t('Restore {name}', { name: f.name })}>
                    <Icon name="restore" size={14} /> {t('Restore')}
                  </button>
                ) : (
                  <>
                    <button className="drive-act" title={t('Rename')} aria-label={t('Rename {name}', { name: f.name })} onClick={() => setRenaming(f.id)} disabled={!!busy}>
                      <Icon name="edit" size={14} />
                    </button>
                    {!f.folder && (
                      <button className="drive-act" title={t('Duplicate')} aria-label={t('Duplicate {name}', { name: f.name })} onClick={() => duplicate(f)} disabled={!!busy}>
                        <Icon name="duplicate" size={14} />
                      </button>
                    )}
                    <button className="drive-act" title={t('Move to another folder')} aria-label={t('Move {name}', { name: f.name })} onClick={() => (setMoving(f), setMoveTo(null))} disabled={!!busy}>
                      <Icon name="folderMove" size={14} />
                    </button>
                    <a
                      className="drive-act"
                      href={f.folder ? folderUrl(f.id) : (f.webViewLink ?? `https://drive.google.com/file/d/${encodeURIComponent(f.id)}/view`)}
                      target="_blank"
                      rel="noreferrer noopener"
                      title={t('Open in Google Drive')}
                      aria-label={t('Open {name} in Google Drive', { name: f.name })}
                    >
                      <Icon name="external" size={14} />
                    </a>
                    <button className="drive-act" title={t('Move to trash')} aria-label={t('Delete {name}', { name: f.name })} onClick={() => trash(f)} disabled={!!busy}>
                      <Icon name="trash" size={14} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="buttons">
        {view === 'files' && (
          <>
            <button type="button" onClick={newFolder} disabled={!lib || !!busy}>
              <Icon name="folderNew" size={16} /> {t('New folder')}
            </button>
            <button type="button" onClick={importLocal} disabled={!lib || !!busy} title={t("Uploads .turbo or .asc files from your computer to this folder and opens the file (if it's just one)")}>
              {t('Import from computer…')}
            </button>
          </>
        )}
        <span className="spacer" />
        {busy && <span className="hint">{busy}</span>}
        {lib && (
          <a className="button-link" href={folderUrl(here)} target="_blank" rel="noreferrer noopener" title={t('Opens this folder in Google Drive, in another tab')}>
            {t('Open in Google Drive')} <Icon name="external" size={14} />
          </a>
        )}
        <button type="button" onClick={onClose}>
          {t('Close')}
        </button>
      </div>
    </Modal>
  );
}
