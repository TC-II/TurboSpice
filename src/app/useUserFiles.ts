// «My symbols and models»: los archivos del usuario (símbolos, modelos y bloques), en este navegador
// y, con sesión de Google, en su Drive (USER_LIBRARY_NAME), el mismo para todos los proyectos
import { useEffect, useRef, useState } from 'react';
import { decodeText } from '../asc/encoding.ts';
import { parseAsc } from '../asc/parse.ts';
import { drive } from '../cloud/google.ts';
import { USER_LIBRARY_NAME, mergeUserFiles, pullUserLibrary, pushUserLibrary, userLibraryText } from '../cloud/userLibrary.ts';
import { t } from '../i18n/i18n.ts';
import { USER_DIR, scanModels, type Library } from '../library/library.ts';
import { makeSymbol, schematicPorts, subcktPins } from '../library/makeSymbol.ts';
import { loadUserFiles, saveUserFiles, type UserFile } from '../schematic/autosave.ts';
import type { UserFileInfo } from '../schematic/dialogs.tsx';
import { registerUserFile, userFileKind } from './helpers.ts';
import { useEvent } from './useEvent.ts';

/** `account`: la cuenta de Google con sesión (si hay); `libVersion` cambia cada vez que cambia la librería */
export function useUserFiles(lib: Library, account: string | undefined, setMessage: (m?: string) => void) {
  const [userFiles, setUserFiles] = useState<UserFile[]>([]);
  const [libVersion, setLibVersion] = useState(0);
  useEffect(() => {
    loadUserFiles().then(setUserFiles);
  }, []);
  // con sesión de Google, «My symbols and models» vive en Drive (USER_LIBRARY_NAME), el mismo para
  // todos los proyectos; al entrar se une con lo que haya en este navegador
  const userLibId = useRef<string>();
  // (la librería de este momento: con otro skin es otra, sin volver a sincronizar)
  const currentLib = useEvent(() => lib);
  useEffect(() => {
    userLibId.current = undefined;
    if (!account) return;
    let off = false;
    (async () => {
      const remote = await pullUserLibrary(drive);
      const merged = mergeUserFiles(remote.files ?? [], await loadUserFiles());
      if (off) return;
      for (const f of merged) registerUserFile(currentLib(), f);
      setUserFiles(merged);
      saveUserFiles(merged);
      setLibVersion((v) => v + 1);
      userLibId.current = remote.files && userLibraryText(merged) === userLibraryText(remote.files) ? remote.id : await pushUserLibrary(drive, merged, remote.id);
    })().catch((e: Error) => !off && setMessage(t('Could not sync «{name}» with Google Drive: {message}', { name: USER_LIBRARY_NAME, message: e.message })));
    return () => {
      off = true;
    };
  }, [account, currentLib, setMessage]);
  const storeUserFiles = (next: UserFile[]) => {
    setUserFiles(next);
    saveUserFiles(next);
    setLibVersion((v) => v + 1);
    if (account)
      pushUserLibrary(drive, next, userLibId.current)
        .then((id) => (userLibId.current = id))
        .catch((e: Error) => setMessage(t('Could not sync «{name}» with Google Drive: {message}', { name: USER_LIBRARY_NAME, message: e.message })));
  };
  const addUserFiles = async (files: File[]) => {
    const next = [...userFiles];
    const added: string[] = [];
    for (const f of files) {
      const kind = userFileKind(f.name);
      if (!kind) continue;
      const uf: UserFile = { name: f.name, kind, text: decodeText(new Uint8Array(await f.arrayBuffer())), time: Date.now() };
      const i = next.findIndex((x) => x.name.toLowerCase() === f.name.toLowerCase());
      if (i >= 0) next[i] = uf;
      else next.push(uf);
      registerUserFile(lib, uf);
      added.push(f.name);
    }
    storeUserFiles(next);
    if (added.length) setMessage(t('Added: {p0}', { p0: added.join(', ') }));
  };
  const removeUserFile = (name: string) => {
    const f = userFiles.find((x) => x.name === name);
    if (!f) return;
    if (f.kind === 'symbol') lib.removeSymbol(name.replace(/\.asy$/i, ''));
    else if (f.kind === 'model') lib.removeModelFile(name);
    else lib.removeSchematic(name);
    storeUserFiles(userFiles.filter((x) => x !== f));
  };
  /** Símbolo para un .subckt de un archivo de modelos, o de bloque para un .asc */
  const makeUserSymbol = (file: string, name: string) => {
    const f = userFiles.find((x) => x.name === file);
    if (!f) return;
    const pins = f.kind === 'schematic' ? schematicPorts(parseAsc(f.text).flags) : subcktPins(f.text, name);
    if (!pins) return setMessage(t('No .subckt {name} found in {file}', { name, file }));
    const uf: UserFile = { name: `${name}.asy`, kind: 'symbol', text: makeSymbol({ name, pins, block: f.kind === 'schematic', modelFile: f.kind === 'model' ? file : undefined }), time: Date.now() };
    registerUserFile(lib, uf);
    storeUserFiles([...userFiles.filter((x) => x.name.toLowerCase() !== uf.name.toLowerCase()), uf]);
    setMessage(t('Symbol {name} created: it\'s in the component browser (P) under "{USER_DIR}"', { name, USER_DIR }));
  };
  const userFileInfo = (): UserFileInfo[] =>
    userFiles.map((f) => ({
      name: f.name,
      kind: f.kind,
      items: f.kind === 'model' ? scanModels(f.text).subckts : f.kind === 'schematic' ? schematicPorts(parseAsc(f.text).flags) : [],
    }));
  return { userFiles, libVersion, setLibVersion, storeUserFiles, addUserFiles, removeUserFile, makeUserSymbol, userFileInfo };
}
