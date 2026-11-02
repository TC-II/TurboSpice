// Guardar en Google Drive (#156): en cola sobre el mismo archivo, con conflictos de versión, y abrir de ahí
import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { drive } from '../cloud/google.ts';
import { uniqueName, type DriveFile } from '../cloud/drive.ts';
import { t } from '../i18n/i18n.ts';
import { EXT, projectName, serializeTurbo, type Project } from '../project/turbo.ts';
import { DEFAULT_NAME, DEFAULT_PROJECT } from './constants.ts';
import type { Dialog, FileState } from './types.ts';
import { useEvent } from '../ui/useEvent.ts';

export interface DriveDeps {
  /** hay sesión de Google */
  account: unknown;
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

export function useDrive({
  account,
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
  // --- Google Drive (#156) ---
  // Sobre el mismo archivo los guardados van en cola: nunca dos subidas a la vez, y si llegan
  // varios mientras se sube, después se manda sólo el último. Antes de subir se compara la versión
  // del archivo en Drive con la que se abrió: si cambió, no se pisa y se pregunta.
  const fileRef = useRef(file);
  fileRef.current = file;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const driveBusy = useRef(false);
  const drivePending = useRef<{ auto: boolean } | null>(null);
  const [driveConflict, setDriveConflict] = useState<{ name: string } | null>(null);
  const saveToDrive = async (auto: boolean, force = false) => {
    const f = fileRef.current;
    if (!f.driveId) return;
    const name = turboName(f.name);
    // un número es el `version` de Drive que guardaban las versiones anteriores (sube solo, #176):
    // no sirve para comparar con la revisión del contenido
    if (!force && f.driveVersion && !/^\d+$/.test(f.driveVersion)) {
      const m = await drive.meta(f.driveId);
      if (m.version && m.version !== f.driveVersion) return setDriveConflict({ name: m.name });
    }
    const rev = editRev.current;
    const p = { ...snapshotRef.current(), name: projectName(name) };
    const r = await drive.save(name, new TextEncoder().encode(await serializeTurbo(p)), f.driveId);
    const saved = { ...fileRef.current, name: r.name, driveId: r.id, driveVersion: r.version };
    fileRef.current = saved;
    setFile(saved);
    if (editRev.current === rev) setDirty(false);
    if (!auto) {
      remember(p, saved);
      setMessage(t('Saved to Google Drive: {name}', { name: r.name }));
    }
  };
  const queueDriveSave = (auto: boolean, force = false) => {
    if (driveBusy.current) {
      drivePending.current = { auto: (drivePending.current?.auto ?? true) && auto };
      return;
    }
    driveBusy.current = true;
    // (data-drive en <html>: «busy» mientras sube o hay guardados en cola; lo esperan los e2e)
    document.documentElement.dataset.drive = 'busy';
    saveToDrive(auto, force)
      .catch((e: Error) => setMessage(t('Could not save to Google Drive: {message}', { message: e.message })))
      .finally(() => {
        driveBusy.current = false;
        const next = drivePending.current;
        drivePending.current = null;
        if (next) queueDriveSave(next.auto);
        else document.documentElement.dataset.drive = 'idle';
      });
  };
  // al simular se guarda solo en Drive (después de que la corrida entró al proyecto)
  const [autoDrive, setAutoDrive] = useState(0);
  const autoSave = useEvent(() => account && fileRef.current.driveId && queueDriveSave(true));
  useEffect(() => {
    if (autoDrive) autoSave();
  }, [autoDrive, autoSave]);
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
        return await openBytes(await drive.download(f.driveId), f.name, { driveId: f.driveId, driveVersion: (await drive.meta(f.driveId)).version });
      }
      const name = uniqueName(
        t('{p0} (copy){EXT}', { p0: projectName(f.name), EXT }),
        (await drive.list()).map((x) => x.name),
      );
      const { p, bytes } = await turboBytes(name);
      const r = await drive.save(name, bytes);
      savedAs({ ...f, name: r.name, driveId: r.id, driveVersion: r.version }, p, t(' to Google Drive'));
    } catch (e) {
      setMessage(`Google Drive: ${(e as Error).message}`);
    }
  };

  /** Guardar en la carpeta TurboSpice del Drive: sobre el mismo archivo (en cola), o uno nuevo */
  const doSaveDrive = async (saveAs = false) => {
    if (!saveAs && file.driveId) return queueDriveSave(false);
    let name = turboName(file.name);
    let id: string | undefined;
    if (!id && saveAs) {
      const n = window.prompt(t('Project name in Google Drive'), projectName(name))?.trim();
      if (!n) return;
      name = turboName(n);
    }
    try {
      const { p, bytes } = await turboBytes(name);
      if (!id) {
        const same = (await drive.list()).find((f) => f.name.toLowerCase() === name.toLowerCase());
        if (same) {
          if (!window.confirm(t("There's already a «{name}» in Google Drive. Replace it?", { name: same.name }))) return;
          id = same.id;
        }
      }
      const r = await drive.save(name, bytes, id);
      savedAs({ ...file, name: r.name, driveId: r.id, driveVersion: r.version }, p, t(' to Google Drive'));
    } catch (e) {
      setMessage(t('Could not save to Google Drive: {p0}', { p0: (e as Error).message }));
    }
  };

  // Con sesión de Google, un proyecto nuevo («project») con cambios se guarda solo en el Drive con
  // un nombre libre («Project 2», «Project 3»…), para que el autoguardado no pise otro
  const autoNaming = useRef(false);
  const autoName = useEvent(() => {
    const f = fileRef.current;
    if (!account || !dirty || f.driveId || autoNaming.current || !DEFAULT_NAME.test(projectRef.current.name)) return;
    autoNaming.current = true;
    (async () => {
      const taken = new Set((await drive.list()).map((x) => x.name.toLowerCase()));
      let n = DEFAULT_PROJECT;
      for (let i = 2; taken.has(`${n}${EXT}`.toLowerCase()); i++) n = `${DEFAULT_PROJECT} ${i}`;
      if (fileRef.current.driveId) return;
      const { p, bytes } = await turboBytes(`${n}${EXT}`);
      const r = await drive.save(`${n}${EXT}`, bytes);
      savedAs({ ...fileRef.current, name: r.name, driveId: r.id, driveVersion: r.version }, p, t(' to Google Drive'));
    })()
      .catch((e: Error) => setMessage(t('Could not save to Google Drive: {message}', { message: e.message })))
      .finally(() => (autoNaming.current = false));
  });
  useEffect(() => autoName(), [account, dirty, autoName]);

  const openDriveFile = async (d: DriveFile) => {
    if (!confirmDiscard()) return;
    try {
      const bytes = await drive.download(d.id);
      setDialog(null);
      await openBytes(bytes, d.name, /\.turbo$/i.test(d.name) ? { driveId: d.id, driveVersion: d.version ?? (await drive.meta(d.id)).version } : {});
    } catch (e) {
      setMessage(t('Could not open from Google Drive: {p0}', { p0: (e as Error).message }));
    }
  };
  return { driveConflict, setDriveConflict, setAutoDrive, resolveDriveConflict, doSaveDrive, openDriveFile };
}
