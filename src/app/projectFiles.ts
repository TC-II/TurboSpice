// Archivos y proyectos: la biblioteca de LTspice del usuario, compartir por link, el nombre de lo que
// se exporta, abrir un reciente, un proyecto nuevo y los ejemplos de public/examples
import type { AscDoc } from '../asc/model.ts';
import { parseAsc } from '../asc/parse.ts';
import { drive, type GoogleState } from '../cloud/google.ts';
import { t } from '../i18n/i18n.ts';
import { importLtspiceLibrary, removeLtspiceLibrary, type LtspiceIndex } from '../library/ltspiceLib.ts';
import type { variantOf } from '../project/project.ts';
import { EXT, newProject, parseTurbo, projectName, type Project } from '../project/turbo.ts';
import { readHandle, type RecentFile } from '../schematic/autosave.ts';
import { shareHash } from '../schematic/share.ts';
import { simName, type SimList } from '../sim/simList.ts';
import { BASE, DEFAULT_PROJECT } from './constants.ts';
import type { Dialog, FileState } from './types.ts';

export interface ProjectFileDeps {
  google: Pick<GoogleState, 'account'>;
  project: Project;
  variant: ReturnType<typeof variantOf>;
  sims: SimList;
  curSim: SimList['items'][number] | undefined;
  recent: RecentFile[];
  setLtIndex(index: LtspiceIndex | undefined): void;
  turboBytes(name: string): Promise<{ p: Project; bytes: Uint8Array }>;
  confirmDiscard(): boolean;
  openBytes(bytes: Uint8Array, name: string, at?: Pick<FileState, 'handle' | 'driveId' | 'driveVersion'>, variant?: string): Promise<void>;
  remember(p: Project, f: FileState, unsaved?: boolean): void;
  loadDoc(d: AscDoc, ascName: string): Project;
  loadProject(p: Project, f: FileState): void;
  markDirty(): void;
  /** avisa si el circuito usa símbolos que no están */
  warnMissing(d: AscDoc): void;
  setDialog(d: Dialog | null): void;
  setMessage(m?: string): void;
}

export function projectFileActions({ google, project, variant, sims, curSim, recent, setLtIndex, turboBytes, confirmDiscard, openBytes, remember, loadDoc, loadProject, markDirty, warnMissing, setDialog, setMessage }: ProjectFileDeps) {
  // carpeta lib de LTspice (lib/sym, lib/sub, lib/cmp): de Analog Devices, no se redistribuye; queda
  // en el IndexedDB de este navegador y no se sube a ningún lado
  const doImportLtspice = async (files: File[]) => {
    try {
      setMessage(t('Importing the LTspice library…'));
      const index = await importLtspiceLibrary(files, (done, total) => setMessage(t('Importing the LTspice library: {done} of {total} files…', { done, total })));
      setLtIndex(index);
      setMessage(t('LTspice library imported: {symbols} symbols and {models} model files. It stays only in this browser.', { symbols: index.count.symbols, models: index.count.models }));
    } catch (e) {
      setMessage(t('Could not import the LTspice library: {p0}', { p0: (e as Error).message }));
    }
  };
  const doRemoveLtspice = async () => {
    await removeLtspiceLibrary();
    setLtIndex(undefined);
    setMessage(t('The LTspice library was removed from this browser (what\'s already loaded goes away when the page reloads)'));
  };

  // el link y el PDF llevan el circuito que se está viendo, como .asc
  const ascName = () => `${project.name}.asc`;
  // el link lleva el proyecto entero (.turbo): variantes, simulaciones, archivos del proyecto
  const doShare = async () => {
    const { bytes } = await turboBytes(`${project.name}${EXT}`);
    const hash = await shareHash(bytes, `${project.name}${EXT}`);
    setDialog({ kind: 'share', url: `${location.origin}${location.pathname}#${hash}` });
  };

  // Exportar (#326): la hoja a pantalla completa (PDF, SVG, PNG o portapapeles); nada viaja a un servidor
  const doExport = () => setDialog({ kind: 'export' });
  /** nombre de lo que se exporta: «Workbench - Testbench» (sin los caracteres que no van en un archivo) */
  const exportName = () => {
    const me = variant.sims.find((x) => x.id === sims.active);
    const bench = project.groups.find((g) => g.id === me?.group)?.name;
    const tb = (curSim && simName(curSim)) || t('No analysis');
    return [bench, tb].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]+/g, '_').trim() || project.name;
  };

  const doRecent = async (i: number) => {
    const r = recent[i];
    if (!r || !confirmDiscard()) return;
    // el archivo en disco si se puede leer (puede haber cambiado); si no, la copia guardada
    const bytes = r.unsaved ? null : r.driveId && google.account ? await drive.download(r.driveId).catch(() => null) : await readHandle(r.handle);
    const driveVersion = bytes && r.driveId && google.account ? await drive.meta(r.driveId).then((m) => m.version, () => undefined) : undefined;
    const at = { handle: r.handle as FileState['handle'], driveId: r.driveId, driveVersion };
    try {
      if (bytes) return await openBytes(bytes, r.name, at);
      // la copia guardada en recientes
      if (!r.turbo) {
        const d = parseAsc(r.asc);
        remember(loadDoc(d, r.name), { name: `${projectName(r.name)}${EXT}` });
        return warnMissing(d);
      }
      const { project: parsed, warnings } = await parseTurbo(r.asc);
      const p = { ...parsed, name: projectName(r.name) };
      loadProject(p, { name: r.name, ...at });
      if (r.unsaved) markDirty();
      else remember(p, { name: r.name, ...at });
      if (warnings.length) setMessage(warnings.join(' · '));
    } catch (e) {
      setMessage(t('Could not open: {p0}', { p0: (e as Error).message }));
    }
  };

  /** Proyecto nuevo, vacío (false: el usuario no quiso descartar los cambios) */
  const doNew = () => {
    if (!confirmDiscard()) return false;
    loadProject(newProject(DEFAULT_PROJECT), { name: `${DEFAULT_PROJECT}${EXT}` });
    return true;
  };

  /** Abre un proyecto de public/examples, opcionalmente en una de sus variantes */
  const doExample = async (name: string, variant?: string) => {
    if (!confirmDiscard()) return;
    const b = await (await fetch(`${BASE}examples/${encodeURIComponent(name)}`)).arrayBuffer();
    return openBytes(new Uint8Array(b), name, {}, variant);
  };

  return { doImportLtspice, doRemoveLtspice, ascName, doShare, doExport, exportName, doRecent, doNew, doExample };
}
