// El proyecto tal como se guarda (con lo que se está editando) y guardarlo en el equipo; Abrir e
// Importar (los .asc del equipo van a la carpeta del Drive)
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AscDoc } from '../asc/model.ts';
import { importToDrive } from '../cloud/projects.ts';
import { drive } from '../cloud/google.ts';
import type { DriveFile } from '../cloud/drive.ts';
import { t } from '../i18n/i18n.ts';
import { storeActive } from '../project/project.ts';
import { storeSubckt } from '../project/subckt.ts';
import { EXT, projectName, serializeTurbo, type Project } from '../project/turbo.ts';
import { pickAscFiles, saveFile } from '../schematic/fileio.ts';
import type { SimList, SimView } from '../sim/simList.ts';
import { ascText } from './helpers.ts';
import type { Dialog, FileState, HierLevel } from './types.ts';

export interface SavingDeps {
  dirty: boolean;
  setDirty(d: boolean): void;
  file: FileState;
  setFile: Dispatch<SetStateAction<FileState>>;
  projectRef: MutableRefObject<Project>;
  setProjectState(p: Project): void;
  pathRef: MutableRefObject<HierLevel[]>;
  docRef: MutableRefObject<AscDoc>;
  sims: SimList;
  /** lo que se está viendo de la simulación activa (va en el .turbo) */
  liveView(): SimView;
  remember(p: Project, f: FileState, unsaved?: boolean): void;
  openDriveFile(d: DriveFile): Promise<void>;
  setDialog(d: Dialog | null): void;
  setMessage(m?: string): void;
}

export function savingActions({ dirty, setDirty, file, setFile, projectRef, setProjectState, pathRef, docRef, sims, liveView, remember, openDriveFile, setDialog, setMessage }: SavingDeps) {
  const confirmDiscard = () => !dirty || window.confirm(t('There are unsaved changes. Discard them?'));

  // Ya no hay "abrir" un .asc: Abrir lleva a Importar (que explica qué entra y cómo)
  const doOpen = () => setDialog({ kind: 'importinfo' });

  /** Importar .asc del equipo a la carpeta del Drive; uno solo se abre */
  const doImport = async (picked?: { name: string; bytes: Uint8Array }[]) => {
    const files = picked ?? (await pickAscFiles());
    if (!files.length) return;
    try {
      setMessage(files.length > 1 ? t('Importing {length} files to Google Drive…', { length: files.length }) : t('Importing {p0} to Google Drive…', { p0: files[0].name }));
      const saved = await importToDrive(drive, files);
      if (saved.length === 1) await openDriveFile(saved[0]);
      else setMessage(t('Imported {length} files to «My projects»', { length: saved.length }));
    } catch (e) {
      setMessage(t('Could not import: {p0}', { p0: (e as Error).message }));
    }
  };

  /** El proyecto con el circuito (y la vista) que se están editando: para el archivo o la sesión */
  const snapshot = (): Project => {
    const lv = pathRef.current[pathRef.current.length - 1];
    return lv ? storeSubckt(projectRef.current, lv.sub, ascText(docRef.current)) : storeActive(projectRef.current, ascText(docRef.current), sims.active ? liveView() : undefined);
  };

  /** El .turbo a guardar con ese nombre de archivo (el nombre del proyecto es el del archivo) */
  const turboBytes = async (name: string) => {
    const p = { ...snapshot(), name: projectName(name) };
    return { p, bytes: new TextEncoder().encode(await serializeTurbo(p)) };
  };
  const turboName = (name: string) => (/\.turbo$/i.test(name) ? name : `${projectName(name)}${EXT}`);

  const savedAs = (saved: FileState, p: Project, where = '') => {
    setFile(saved);
    setProjectState({ ...p, name: projectName(saved.name) });
    setDirty(false);
    remember(p, saved);
    setMessage(t('Saved{where}: {name}', { where, name: saved.name }));
  };

  /** Guardar en el equipo */
  const doSaveLocal = async (saveAs = false) => {
    const name = turboName(file.name);
    try {
      // el proyecto se arma con el nombre que se eligió en el diálogo (Guardar como)
      let p: Project | undefined;
      const r = await saveFile(
        async (chosen) => {
          const tb = await turboBytes(chosen);
          p = tb.p;
          return tb.bytes;
        },
        name,
        file.handle,
        saveAs,
      );
      if (r && p) savedAs({ ...file, name: r.name, handle: r.handle ?? file.handle }, p);
    } catch (e) {
      setMessage(t('Could not save: {p0}', { p0: (e as Error).message }));
    }
  };

  return { confirmDiscard, doOpen, doImport, snapshot, turboBytes, turboName, savedAs, doSaveLocal };
}
