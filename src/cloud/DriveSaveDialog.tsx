// «Guardar como» en Drive (nombre y carpeta) y «Mover a otra carpeta» del proyecto abierto: en vez
// de los prompt/confirm del navegador, un diálogo con el árbol de carpetas de la librería.
import { useEffect, useState } from 'react';
import { Modal } from '../schematic/dialogs.tsx';
import { Icon } from '../ui/icons.tsx';
import { t } from '../i18n/i18n.ts';
import { NameInput } from '../ui/EditableName.tsx';
import { useEvent } from '../ui/useEvent.ts';
import { FOLDER_NAME, errorKind, isWithin, uniqueFolderName, uniqueName, type DriveItem } from './drive.ts';
import { drive, useGoogle, cancelConnect } from './google.ts';
import { baseName, children } from './projects.ts';

export interface Library {
  root: string;
  items: DriveItem[];
}

/** La librería de Drive (carpetas y proyectos), con su carga y su error */
export function useLibrary() {
  const [lib, setLib] = useState<Library | null>(null);
  const [error, setError] = useState<{ kind: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setLib(await drive.library());
    } catch (e) {
      setError({ kind: errorKind(e), message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };
  // (sólo al abrir: después recarga quien hace un cambio)
  const loadOnce = useEvent(load);
  useEffect(() => {
    void loadOnce();
  }, [loadOnce]);
  return { lib, setLib, error, loading, load };
}

/** Cargando / error con reintento: lo mismo en todos los diálogos de Drive */
export function LibraryState({ loading, error, onRetry }: { loading: boolean; error: { kind: string; message: string } | null; onRetry(): void }) {
  const g = useGoogle();
  if (g.status === 'connecting')
    return (
      <div className="drive-state" role="status">
        <span className="spinner" aria-hidden="true" />
        <span>{t('Waiting for the Google window…')}</span>
        <button type="button" onClick={cancelConnect}>
          {t('Cancel')}
        </button>
      </div>
    );
  if (error)
    return (
      <div className="drive-state warn" role="alert">
        <Icon name={error.kind === 'offline' || error.kind === 'timeout' ? 'cloudOff' : 'cloudWarn'} />
        <span>{error.message}</span>
        <button type="button" className="primary" onClick={onRetry}>
          {error.kind === 'auth' || error.kind === 'cancelled' ? t('Connect to Google') : t('Try again')}
        </button>
      </div>
    );
  if (loading)
    return (
      <div className="drive-state" role="status">
        <span className="spinner" aria-hidden="true" />
        <span>{t('Loading your projects from Google Drive…')}</span>
      </div>
    );
  return null;
}

/** Árbol de carpetas para elegir dónde (la raíz, TurboSpice, arriba de todo) */
export function FolderTree({ lib, selected, onSelect, disabled }: { lib: Library; selected: string; onSelect(id: string): void; disabled?: (id: string) => boolean }) {
  const row = (id: string, name: string, depth: number) => {
    const off = disabled?.(id);
    return (
      <li key={id}>
        <button
          type="button"
          className={`folder-row${selected === id ? ' on' : ''}`}
          style={{ paddingLeft: 8 + depth * 18 }}
          aria-pressed={selected === id}
          disabled={off}
          onClick={() => onSelect(id)}
        >
          <Icon name="folder" size={16} />
          <span>{name}</span>
        </button>
      </li>
    );
  };
  const walk = (parent: string, depth: number): JSX.Element[] =>
    depth > 32
      ? []
      : children(lib.items, parent, 'name')
          .filter((f) => f.folder)
          .flatMap((f) => [row(f.id, f.name, depth), ...walk(f.id, depth + 1)]);
  return (
    <ul className="folder-tree" role="list" aria-label={t('Folders')}>
      {row(lib.root, FOLDER_NAME, 0)}
      {walk(lib.root, 1)}
    </ul>
  );
}

/** Botón «Nueva carpeta» dentro de la elegida: pide el nombre ahí mismo, la crea y la elige */
export function NewFolderButton({ lib, parent, onCreated }: { lib: Library; parent: string; onCreated(f: DriveItem): void }) {
  const [naming, setNaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taken = lib.items.filter((f) => f.parent === parent && f.folder && !f.trashed).map((f) => f.name);
  const create = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      onCreated(await drive.createFolder(name, parent));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {naming ? (
        <span className="new-folder-name">
          <Icon name="folderNew" size={16} />
          <NameInput
            value={uniqueFolderName(t('New folder'), taken)}
            taken={taken}
            acceptUnchanged
            label={t('Folder name')}
            onDone={(n) => {
              setNaming(false);
              if (n) void create(n);
            }}
          />
        </span>
      ) : (
        <button type="button" onClick={() => setNaming(true)} disabled={busy}>
          <Icon name="folderNew" size={16} /> {t('New folder')}
        </button>
      )}
      {error && <span className="hint warn">{error}</span>}
    </>
  );
}

/**
 * Guardar como (nombre y carpeta) o mover el proyecto abierto. `onSave` recibe el nombre (sin
 * extensión), la carpeta y, si se eligió reemplazar uno que ya estaba, su id.
 */
export function DriveSaveDialog({
  mode,
  name: initialName,
  driveId,
  onSave,
  onMoved,
  onClose,
}: {
  mode: 'saveAs' | 'move';
  /** nombre del proyecto (sin extensión) */
  name: string;
  /** el archivo abierto (para mover, y para saber dónde está) */
  driveId?: string;
  onSave(name: string, parent: string, replaceId?: string): Promise<void>;
  onMoved?(): void;
  onClose(): void;
}) {
  const { lib, setLib, error, loading, load } = useLibrary();
  const [name, setName] = useState(initialName);
  const [folder, setFolder] = useState<string | null>(null);
  const [replace, setReplace] = useState<DriveItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const current = lib && driveId ? lib.items.find((f) => f.id === driveId) : undefined;
  // la carpeta de partida: la del archivo abierto (si está en la librería) o la raíz
  const target = folder ?? (current?.parent && current.parent !== lib?.root && lib?.items.some((f) => f.id === current.parent && !f.trashed) ? current.parent : lib?.root) ?? '';

  const trimmed = name.trim().replace(/\.turbo$/i, '');
  const nameError = mode === 'saveAs' && !trimmed ? t("The name can't be empty") : /[\\/]/.test(trimmed) ? t("The name can't have / or \\") : null;

  const submit = async (replaceId?: string) => {
    if (!lib || busy) return;
    setSaveError(null);
    if (mode === 'move') {
      if (!driveId || !current?.parent || target === current.parent) return onClose();
      setBusy(true);
      try {
        await drive.move(driveId, target, current.parent);
        onMoved?.();
        onClose();
      } catch (e) {
        setSaveError((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (nameError) return;
    const full = `${trimmed}.turbo`;
    const same = lib.items.find((f) => f.parent === target && !f.folder && !f.trashed && f.name.toLowerCase() === full.toLowerCase());
    if (same && !replaceId && same.id !== driveId) return setReplace(same);
    setBusy(true);
    try {
      await onSave(trimmed, target, replaceId ?? (same?.id === driveId ? same?.id : undefined));
      onClose();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={mode === 'move' ? t('Move to another folder') : t('Save to Google Drive')} onClose={onClose}>
      <form
        className="drive-save"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {mode === 'saveAs' && (
          <label className="drive-save-name">
            <span>{t('Project name')}</span>
            <input
              value={name}
              autoFocus
              spellCheck={false}
              aria-invalid={!!nameError}
              onChange={(e) => {
                setName(e.target.value);
                setReplace(null);
              }}
            />
            {nameError && <span className="hint warn">{nameError}</span>}
          </label>
        )}
        <div className="drive-save-where">
          <span>{mode === 'move' ? t('Move «{name}» to:', { name: initialName }) : t('Folder')}</span>
          {lib ? (
            <FolderTree
              lib={lib}
              selected={target}
              onSelect={(id) => {
                setFolder(id);
                setReplace(null);
              }}
              disabled={mode === 'move' && driveId ? (id) => isWithin(lib.items, id, driveId) : undefined}
            />
          ) : (
            <LibraryState loading={loading} error={error} onRetry={load} />
          )}
        </div>
        {replace && (
          <div className="drive-replace" role="alert">
            <Icon name="warning" />
            <span>{t("There's already a «{name}» in that folder. Replace it with this project?", { name: replace.name })}</span>
            <button type="button" className="danger" onClick={() => submit(replace.id)} disabled={busy}>
              {t('Replace')}
            </button>
            <button
              type="button"
              onClick={() => {
                // otro nombre libre en esa carpeta
                const taken = lib?.items.filter((f) => f.parent === target && !f.trashed).map((f) => f.name) ?? [];
                setName(baseName(uniqueName(`${trimmed}.turbo`, taken)));
                setReplace(null);
              }}
            >
              {t('Keep both')}
            </button>
          </div>
        )}
        {saveError && <p className="hint warn">{saveError}</p>}
        <div className="buttons">
          {lib && (
            <NewFolderButton
              lib={lib}
              parent={target}
              onCreated={(f) => {
                setLib({ ...lib, items: [...lib.items, f] });
                setFolder(f.id);
              }}
            />
          )}
          <span className="spacer" />
          {busy && <span className="hint">{mode === 'move' ? t('Moving…') : t('Saving…')}</span>}
          <button type="button" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className="primary" disabled={!lib || busy || !!nameError || !!replace}>
            {mode === 'move' ? t('Move here') : t('Save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
