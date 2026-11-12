// Guardar en Google Drive (#156): en cola sobre el mismo archivo, con conflictos de versión, guardado
// automático con reintentos, y abrir de ahí. Da también el estado del proyecto en Drive (el
// indicador de la cápsula del proyecto).
import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { drive, driveBg, onConnected, renewInGesture, reconnect, type GoogleState } from '../cloud/google.ts';
import { errorKind, uniqueName, type DriveClient, type DriveErrorKind, type DriveFile } from '../cloud/drive.ts';
import { AUTOSAVE_DELAY, retryDelay, syncKind, type SyncKind } from '../cloud/sync.ts';
import { t } from '../i18n/i18n.ts';
import { EXT, projectName, serializeTurbo, type Project } from '../project/turbo.ts';
import { DEFAULT_NAME, DEFAULT_PROJECT } from './constants.ts';
import type { Dialog, FileState } from './types.ts';
import { useEvent } from '../ui/useEvent.ts';

export interface DriveDeps {
  google: Pick<GoogleState, 'enabled' | 'account' | 'status'>;
  file: FileState;
  setFile: Dispatch<SetStateAction<FileState>>;
  dirty: boolean;
  setDirty(d: boolean): void;
  /** cuenta las ediciones: si no cambió mientras se subía, lo guardado está al día */
  editRev: MutableRefObject<number>;
  projectRef: MutableRefObject<Project>;
  snapshot(): Project;
  turboBytes(name: string): Promise<{ p: Project; bytes: Uint8Array }>;
  turboName(name: string): string;
  savedAs(saved: FileState, p: Project, where?: string): void;
  remember(p: Project, f: FileState, unsaved?: boolean): void;
  openBytes(bytes: Uint8Array, name: string, at?: Pick<FileState, 'handle' | 'driveId' | 'driveVersion'>): Promise<void>;
  confirmDiscard(): boolean;
  setDialog(d: Dialog | null): void;
  setMessage(m?: string): void;
}

/** El proyecto abierto respecto de Drive (para el indicador) */
export interface DriveSync {
  kind: SyncKind;
  /** cuándo se subió (o se abrió) por última vez */
  savedAt?: number;
  error?: { kind: DriveErrorKind; message: string } | null;
}

export function useDrive({
  google,
  file,
  setFile,
  dirty,
  setDirty,
  editRev,
  projectRef,
  snapshot,
  turboBytes,
  turboName,
  savedAs,
  remember,
  openBytes,
  confirmDiscard,
  setDialog,
  setMessage,
}: DriveDeps) {
  const account = google.account;
  // --- Google Drive (#156) ---
  // Sobre el mismo archivo los guardados van en cola: nunca dos subidas a la vez, y si llegan
  // varios mientras se sube, después se manda sólo el último. Antes de subir se compara la versión
  // del archivo en Drive con la que se abrió: si cambió, no se pisa y se pregunta.
  const fileRef = useRef(file);
  fileRef.current = file;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const driveBusy = useRef(false);
  const drivePending = useRef<{ auto: boolean } | null>(null);
  const [driveConflict, setDriveConflict] = useState<{ name: string } | null>(null);
  const conflictRef = useRef(driveConflict);
  conflictRef.current = driveConflict;
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number>();
  const [lastError, setLastError] = useState<DriveSync['error']>(null);
  const failures = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();

  /** Sube lo pendiente dentro de `ms` (el guardado automático, los reintentos) */
  const scheduleAuto = (ms: number) => {
    clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => {
      retryTimer.current = undefined;
      autoFlush();
    }, ms);
  };
  const autoFlush = useEvent(() => {
    const f = fileRef.current;
    if (!account || !f.driveId || conflictRef.current || !dirtyRef.current) return;
    queueDriveSave(true);
  });
  useEffect(() => () => clearTimeout(retryTimer.current), []);

  /** Otro archivo (o ninguno): el estado de la subida anterior no le corresponde */
  useEffect(() => {
    setLastError(null);
    failures.current = 0;
  }, [file.driveId]);

  /** Lo que cambió en el archivo de Drive mientras estaba abierto (lo mandaron a la papelera, lo borraron): se guarda uno nuevo */
  const recreate = async (client: DriveClient, parent?: string) => {
    const f = fileRef.current;
    const name = turboName(f.name);
    const taken = (await client.list(parent)).map((x) => x.name);
    const unique = uniqueName(name, taken);
    const { p, bytes } = await turboBytes(unique);
    const r = await client.save(unique, bytes, undefined, parent);
    savedAs({ ...fileRef.current, name: r.name, driveId: r.id, driveVersion: r.version }, p, t(' to Google Drive'));
    setMessage(t('«{name}» was no longer in Google Drive (trash?): it was saved as a new file', { name: f.name }));
  };

  const saveToDrive = async (auto: boolean, force = false) => {
    const f = fileRef.current;
    if (!f.driveId) return;
    const client = auto ? driveBg : drive;
    const name = turboName(f.name);
    if (!force) {
      let m;
      try {
        m = await client.meta(f.driveId);
      } catch (e) {
        if (errorKind(e) === 'notFound') return recreate(client);
        throw e;
      }
      if (m.trashed) {
        // en su carpeta, si ésa sigue (y se sabe); si no, en la raíz
        const folder = client.cachedLibrary?.find((x) => x.id === m.parent);
        return recreate(client, folder && !folder.trashed ? folder.id : undefined);
      }
      // un número es el `version` de Drive que guardaban las versiones anteriores (sube solo, #176):
      // no sirve para comparar con la revisión del contenido
      if (f.driveVersion && !/^\d+$/.test(f.driveVersion) && m.version && m.version !== f.driveVersion) return setDriveConflict({ name: m.name });
    }
    const rev = editRev.current;
    const p = { ...snapshotRef.current(), name: projectName(name) };
    const r = await client.save(name, new TextEncoder().encode(await serializeTurbo(p)), f.driveId);
    const saved = { ...fileRef.current, name: r.name, driveId: r.id, driveVersion: r.version };
    fileRef.current = saved;
    setFile(saved);
    if (editRev.current === rev) setDirty(false);
    setSavedAt(Date.now());
    if (!auto) {
      remember(p, saved);
      setMessage(t('Saved to Google Drive: {name}', { name: r.name }));
    }
  };

  const failed = (e: unknown, auto: boolean) => {
    const kind = errorKind(e);
    const message = (e as Error).message;
    setLastError({ kind, message });
    // lo pasajero se reintenta solo; la sesión vencida espera a que se reconecte (onConnected)
    if (['offline', 'timeout', 'server', 'rateLimit'].includes(kind)) scheduleAuto(retryDelay(++failures.current));
    // de fondo, la sesión vencida o la falta de conexión no se avisan con un cartel: lo dice el indicador
    if (!auto || !['auth', 'offline', 'timeout', 'cancelled'].includes(kind)) setMessage(t('Could not save to Google Drive: {message}', { message }));
  };

  const queueDriveSave = (auto: boolean, force = false) => {
    if (driveBusy.current) {
      drivePending.current = { auto: (drivePending.current?.auto ?? true) && auto };
      return;
    }
    driveBusy.current = true;
    if (!auto) clearTimeout(retryTimer.current);
    setSaving(true);
    // (data-drive en <html>: «busy» mientras sube o hay guardados en cola; lo esperan los e2e)
    document.documentElement.dataset.drive = 'busy';
    saveToDrive(auto, force)
      .then(
        () => {
          // se recuperó de una falla que se avisó: que el cartel no quede diciendo que falló
          if (failures.current && fileRef.current.driveId) setMessage(t('Saved to Google Drive: {name}', { name: fileRef.current.name }));
          failures.current = 0;
          setLastError(null);
        },
        (e) => failed(e, auto),
      )
      .finally(() => {
        driveBusy.current = false;
        const next = drivePending.current;
        drivePending.current = null;
        if (next) queueDriveSave(next.auto);
        else {
          setSaving(false);
          document.documentElement.dataset.drive = 'idle';
        }
      });
  };

  // al simular se guarda solo en Drive (después de que la corrida entró al proyecto)
  const [autoDrive, setAutoDrive] = useState(0);
  const autoSave = useEvent(() => account && fileRef.current.driveId && !conflictRef.current && queueDriveSave(true));
  useEffect(() => {
    if (autoDrive) autoSave();
  }, [autoDrive, autoSave]);

  // con cambios sin subir, se suben solos al rato (si la sesión sigue y la última subida anduvo)
  const connected = google.status === 'connected';
  useEffect(() => {
    if (!dirty || !account || !connected || !file.driveId || driveConflict || lastError) return;
    const id = setTimeout(() => autoFlush(), AUTOSAVE_DELAY);
    return () => clearTimeout(id);
  }, [dirty, account, connected, file.driveId, driveConflict, lastError, autoFlush]);

  // al reconectar (o al volver la conexión) se sube lo que quedó pendiente
  const flushSoon = useEvent(() => fileRef.current.driveId && dirtyRef.current && scheduleAuto(300));
  useEffect(() => {
    const off = onConnected(() => {
      setLastError((e) => (e?.kind === 'auth' ? null : e));
      flushSoon();
    });
    window.addEventListener('online', flushSoon);
    return () => {
      off();
      window.removeEventListener('online', flushSoon);
    };
  }, [flushSoon]);

  // otra cuenta (se reconectó con otra): el archivo abierto es del Drive de la anterior
  const lastEmail = useRef(account?.emailAddress);
  useEffect(() => {
    const prev = lastEmail.current;
    lastEmail.current = account?.emailAddress;
    if (!prev || !account?.emailAddress || prev === account.emailAddress || !fileRef.current.driveId) return;
    setFile({ ...fileRef.current, driveId: undefined, driveVersion: undefined });
    setMessage(t('You switched to the Google account {email}: this project will be saved as a new file in its Drive', { email: account.emailAddress }));
  }, [account?.emailAddress, setFile, setMessage]);

  /** Conflicto: recargar la versión de Drive, guardar la mía como copia o sobrescribir */
  const resolveDriveConflict = async (how: 'reload' | 'copy' | 'overwrite') => {
    setDriveConflict(null);
    const f = fileRef.current;
    if (!f.driveId) return;
    try {
      if (how === 'overwrite') return queueDriveSave(false, true);
      if (how === 'reload') {
        // lo de acá queda en recientes, por las dudas
        remember(snapshotRef.current(), f, true);
        const m = await drive.meta(f.driveId);
        await openBytes(await drive.download(f.driveId), f.name, { driveId: f.driveId, driveVersion: m.version });
        setSavedAt(Date.now());
        return;
      }
      const parent = (await drive.meta(f.driveId)).parent;
      const name = uniqueName(
        t('{p0} (copy){EXT}', { p0: projectName(f.name), EXT }),
        (await drive.list(parent)).map((x) => x.name),
      );
      const { p, bytes } = await turboBytes(name);
      const r = await drive.save(name, bytes, undefined, parent);
      savedAs({ ...f, name: r.name, driveId: r.id, driveVersion: r.version }, p, t(' to Google Drive'));
      setSavedAt(Date.now());
    } catch (e) {
      setMessage(`Google Drive: ${(e as Error).message}`);
    }
  };

  /** Guardar con este nombre en esta carpeta (o reemplazar `replaceId`): lo que confirma el diálogo de Guardar como */
  /** (si falla, tira el error: el diálogo lo muestra) */
  const saveDriveAs = async (name: string, parent: string | undefined, replaceId?: string) => {
    const full = turboName(name);
    const { p, bytes } = await turboBytes(full);
    const r = await drive.save(full, bytes, replaceId, replaceId ? undefined : parent);
    savedAs({ ...fileRef.current, name: r.name, driveId: r.id, driveVersion: r.version }, p, t(' to Google Drive'));
    setSavedAt(Date.now());
    setLastError(null);
  };

  /** Guardar en la carpeta TurboSpice del Drive: sobre el mismo archivo (en cola), o uno nuevo */
  const doSaveDrive = async (saveAs = false) => {
    renewInGesture();
    if (saveAs) return setDialog({ kind: 'driveSave', mode: 'saveAs' });
    if (file.driveId) return queueDriveSave(false);
    const name = turboName(file.name);
    try {
      const same = (await drive.list()).find((f) => f.name.toLowerCase() === name.toLowerCase());
      // el nombre ya está: que el usuario elija (reemplazar u otro nombre)
      if (same) return setDialog({ kind: 'driveSave', mode: 'saveAs' });
      await saveDriveAs(name, undefined);
    } catch (e) {
      setMessage(t('Could not save to Google Drive: {p0}', { p0: (e as Error).message }));
    }
  };

  /** «Guardar ahora» del indicador */
  const syncNow = () => {
    renewInGesture();
    if (fileRef.current.driveId) queueDriveSave(false);
    else void doSaveDrive(false);
  };

  /** «Reconectar» del indicador (en el gesto: abre la ventana de Google si hace falta) */
  const reconnectDrive = () =>
    reconnect().catch((e: Error) => {
      if (errorKind(e) !== 'cancelled') setMessage(t('Could not connect to Google: {message}', { message: e.message }));
    });

  // Con sesión de Google, un proyecto nuevo («project») con cambios se guarda solo en el Drive con
  // un nombre libre («Project 2», «Project 3»…), para que el autoguardado no pise otro
  const autoNaming = useRef(false);
  const autoName = useEvent(() => {
    const f = fileRef.current;
    if (!account || !connected || !dirty || f.driveId || autoNaming.current || !DEFAULT_NAME.test(projectRef.current.name)) return;
    autoNaming.current = true;
    (async () => {
      const taken = new Set((await driveBg.list()).map((x) => x.name.toLowerCase()));
      let n = DEFAULT_PROJECT;
      for (let i = 2; taken.has(`${n}${EXT}`.toLowerCase()); i++) n = `${DEFAULT_PROJECT} ${i}`;
      if (fileRef.current.driveId) return;
      const { p, bytes } = await turboBytes(`${n}${EXT}`);
      const r = await driveBg.save(`${n}${EXT}`, bytes);
      savedAs({ ...fileRef.current, name: r.name, driveId: r.id, driveVersion: r.version }, p, t(' to Google Drive'));
      setSavedAt(Date.now());
    })()
      .catch((e: Error) => !['auth', 'offline', 'timeout'].includes(errorKind(e)) && setMessage(t('Could not save to Google Drive: {message}', { message: e.message })))
      .finally(() => (autoNaming.current = false));
  });
  useEffect(() => autoName(), [account, connected, dirty, autoName]);

  const openDriveFile = async (d: DriveFile) => {
    if (!confirmDiscard()) return;
    try {
      const bytes = await drive.download(d.id);
      setDialog(null);
      await openBytes(bytes, d.name, /\.turbo$/i.test(d.name) ? { driveId: d.id, driveVersion: d.version ?? (await drive.meta(d.id)).version } : {});
      setSavedAt(d.modifiedTime ? Date.parse(d.modifiedTime) : Date.now());
    } catch (e) {
      setMessage(t('Could not open from Google Drive: {p0}', { p0: (e as Error).message }));
    }
  };

  const sync: DriveSync = {
    kind: syncKind({ enabled: google.enabled, signedIn: !!account, auth: google.status, inDrive: !!file.driveId, dirty, saving, conflict: !!driveConflict, error: lastError }),
    savedAt,
    error: lastError,
  };
  // (para los e2e y el CSS: el estado del proyecto en Drive)
  useEffect(() => {
    document.documentElement.dataset.driveSync = sync.kind;
  }, [sync.kind]);

  return { driveConflict, setDriveConflict, setAutoDrive, resolveDriveConflict, doSaveDrive, saveDriveAs, openDriveFile, sync, syncNow, reconnectDrive };
}
