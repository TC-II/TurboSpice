// El proyecto abierto y la sesión: mostrar la vista de un testbench, cargar un proyecto (de un .turbo,
// un .asc, un link compartido, un ejemplo o una práctica del tutorial), los recientes, restaurar al
// entrar, el autoguardado en el navegador, los avisos al cerrar y cambiar de idioma (#72)
import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import type { AscDoc } from '../asc/model.ts';
import { parseAsc } from '../asc/parse.ts';
import type { SimResult } from '../engine/ngspice.ts';
import { dateTime, getLang, setLang, t } from '../i18n/i18n.ts';
import type { Library } from '../library/library.ts';
import { activeAsc, selectSim as selectProjectSim, simOf, variantOf, withGroups } from '../project/project.ts';
import { asBenches, EXT, isTurboText, newProject, parseTurbo, projectFromAsc, projectName, serializeTurbo, type Project } from '../project/turbo.ts';
import { addRecent, loadProjectSession, loadRecent, loadResult, loadView, saveProjectSession, type RecentFile } from '../schematic/autosave.ts';
import { dcSourcesAsCell } from '../schematic/edit.ts';
import { readAsc } from '../schematic/fileio.ts';
import type { ItemRef } from '../schematic/geometry.ts';
import type { EditorHandle, Tool } from '../schematic/SchematicEditor.tsx';
import { readShareHash } from '../schematic/share.ts';
import type { History } from '../schematic/useHistory.ts';
import type { MeasTable } from '../sim/measResults.ts';
import { buildSimulation } from '../sim/schematicSim.ts';
import type { SimList, SimView } from '../sim/simList.ts';
import type { ComplexMode } from '../waveform/curves.ts';
import { asPlotView, emptyPanes, viewFromDoc, withView, type Pane, type PlotState, type PlotView } from '../waveform/view.ts';
import { BASE, DEFAULT_PROJECT } from './constants.ts';
import { ascText } from './helpers.ts';
import type { FileState, HierLevel, SimRun } from './types.ts';
import { useEvent } from '../ui/useEvent.ts';

/** Un ejemplo de public/examples pedido en la URL (?example=Sample%20Project.turbo) */
const EXAMPLE_NAME = /^[\w .()-]+\.turbo$/;

export interface ProjectSessionDeps {
  lib: Library;
  history: { reset(d: AscDoc): void; version: number; state: History<AscDoc> };
  stacks: MutableRefObject<Map<string, History<AscDoc>>>;
  kept: MutableRefObject<Map<string, SimRun>>;
  quietDoc: MutableRefObject<boolean>;
  docRef: MutableRefObject<AscDoc>;
  projectRef: MutableRefObject<Project>;
  simsRef: MutableRefObject<SimList>;
  pathRef: MutableRefObject<HierLevel[]>;
  plotState: MutableRefObject<PlotState | undefined>;
  panesByKind: MutableRefObject<Map<string, Pane[]>>;
  editor: RefObject<EditorHandle>;
  doc: AscDoc;
  docKey: number;
  project: Project;
  file: FileState;
  dirty: boolean;
  panes: Pane[];
  activePane: number;
  plotName: string;
  mode: ComplexMode;
  setPanes(p: Pane[]): void;
  setActivePane(i: number): void;
  setPlotName(name: string): void;
  setMode(m: ComplexMode): void;
  setSim(s: SimRun | null): void;
  setProjectState(p: Project): void;
  setDirty(d: boolean): void;
  setFile(f: FileState): void;
  setSelection(s: ItemRef[]): void;
  setOfferView: Dispatch<SetStateAction<PlotView | null>>;
  setValueOffer(v: null): void;
  setHistoryOpen(open: boolean): void;
  setViewRun(id: string): void;
  setTool(tt: Tool): void;
  setDocKey: Dispatch<SetStateAction<number>>;
  setPath(p: HierLevel[]): void;
  setCurModel(name: string): void;
  setMessage(m?: string): void;
  snapshot(): Project;
  confirmDiscard(): boolean;
  warnMissing(d: AscDoc): void;
}

export function useProjectSession(d: ProjectSessionDeps) {
  const { lib, history, stacks, kept, quietDoc, docRef, projectRef, simsRef, pathRef, plotState, panesByKind, editor, doc, docKey, project, file, dirty, panes, activePane, plotName, mode } = d;
  const {
    setPanes,
    setActivePane,
    setPlotName,
    setMode,
    setSim,
    setProjectState,
    setDirty,
    setFile,
    setSelection,
    setOfferView,
    setValueOffer,
    setHistoryOpen,
    setViewRun,
    setTool,
    setDocKey,
    setPath,
    setCurModel,
    setMessage,
  } = d;
  const { snapshot, confirmDiscard, warnMissing } = d;
  /** Muestra la vista guardada de una simulación (o una vacía) */
  const showView = (v?: SimView) => {
    setPanes(v?.panes ?? emptyPanes());
    setActivePane(v?.active ?? 0);
    setPlotName(v?.plot ?? '');
    setMode(v?.mode ?? 'bode');
    plotState.current = v?.plotState;
    panesByKind.current.clear();
  };

  /**
   * Resultados de la última corrida guardados en el navegador (no van en el .turbo): se
   * muestran si son del circuito que se está viendo
   */
  const restoreCached = (simId: string, asc: string) => {
    loadResult<{ result: SimResult; meas: MeasTable | null }>(simId)
      .then(async (c) => {
        const d = docRef.current;
        if (!c || c.asc !== asc || simsRef.current.active !== simId || ascText(d) !== asc) return;
        const built = await buildSimulation(d, lib, `${projectRef.current.name}.asc`);
        if (simsRef.current.active !== simId || docRef.current !== d) return;
        setSim({ built, result: c.result.result, doc: d, meas: c.result.meas });
      })
      .catch(() => {});
  };

  /** Abre un proyecto: se ve el circuito de la simulación activa de su variante activa */
  const loadProject = (p0: Project, f: FileState) => {
    const p = asBenches(p0);
    stacks.current.clear();
    kept.current.clear();
    const v = variantOf(p);
    const s = simOf(v);
    quietDoc.current = true;
    history.reset(parseAsc(activeAsc(v)));
    setProjectState(p);
    setDirty(false);
    setFile(f);
    setSelection([]);
    setSim(null);
    showView(s?.view);
    setOfferView(null);
    setValueOffer(null);
    setHistoryOpen(false);
    setViewRun('');
    setTool({ kind: 'select' });
    setDocKey((k) => k + 1);
    if (s) restoreCached(s.id, s.asc);
  };

  /** Un .asc pasa a ser un proyecto nuevo (se guarda aparte, como .turbo) */
  const loadDoc = (d0: AscDoc, ascName: string): Project => {
    // las fuentes V con valor DC se muestran como Cell (#121)
    const p = projectFromAsc(dcSourcesAsCell(d0, lib), ascName);
    loadProject(p, { name: `${projectName(ascName)}${EXT}` });
    return p;
  };

  /** Proyecto de práctica de una misión: vacío o con un circuito. El actual, si tenía cambios, queda en Recientes */
  const loadPractice = (name: string, asc: string | null) => {
    if (dirty) remember(snapshot(), file, true);
    // (desde adentro de un subcircuito: se vuelve al testbench del proyecto nuevo)
    pathRef.current = [];
    setPath([]);
    setCurModel('');
    if (asc) loadDoc(parseAsc(asc), `${name}.asc`);
    else loadProject(withGroups(newProject(name)), { name: `${name}${EXT}` });
    setTimeout(() => editor.current?.fit(), 80);
  };

  const [recent, setRecent] = useState<RecentFile[]>([]);
  const remember = useCallback((p: Project, f: FileState, unsaved = false) => {
    serializeTurbo(p)
      .then((turbo) => addRecent({ name: f.name, asc: turbo, turbo: true, handle: f.handle, driveId: f.driveId, time: Date.now(), unsaved }))
      .then(setRecent);
  }, []);

  /** Abre los bytes de un .turbo o de un .asc (`at`: dónde está el archivo, si es un .turbo) */
  const openBytes = async (bytes: Uint8Array, name: string, at: Pick<FileState, 'handle' | 'driveId' | 'driveVersion'> = {}, variant?: string) => {
    const utf8 = new TextDecoder().decode(bytes);
    if (/\.turbo$/i.test(name) || isTurboText(utf8)) {
      const { project: parsed, warnings } = await parseTurbo(utf8);
      // el nombre del proyecto es el del archivo (un .turbo duplicado o renombrado en Drive, o
      // copiado en el disco, todavía tiene adentro el nombre de antes)
      const named = /\.turbo$/i.test(name) ? { ...parsed, name: projectName(name) } : parsed;
      // (los ejemplos se abren en el testbench con ese nombre)
      const bench = variant ? named.variants[0].sims.find((x) => x.name === variant)?.id : undefined;
      const p = bench ? selectProjectSim(named, bench) : named;
      const f: FileState = { name: /\.turbo$/i.test(name) ? name : `${projectName(name)}${EXT}`, ...at };
      loadProject(p, f);
      remember(p, f);
      if (warnings.length) setMessage(warnings.join(' · '));
      return;
    }
    const r = readAsc(bytes, name);
    const p = loadDoc(r.doc, name);
    remember(p, { name: `${projectName(name)}${EXT}` });
    warnMissing(r.doc);
  };

  // Circuito compartido en el hash del link (#c=…): se abre y se limpia el hash
  const openShared = useEvent(async (): Promise<boolean> => {
    let shared;
    try {
      shared = await readShareHash(location.hash);
    } catch {
      setMessage(t("The link doesn't contain a valid circuit"));
    }
    if (shared === undefined && !/[#&]c=/.test(location.hash)) return false;
    window.history.replaceState(null, '', location.pathname + location.search);
    if (!shared) return false;
    if (/\.turbo$/i.test(shared.name) || isTurboText(new TextDecoder().decode(shared.bytes))) {
      await openBytes(shared.bytes, shared.name);
      return true;
    }
    const f = readAsc(shared.bytes, shared.name);
    // links viejos: la vista venía aparte (&v=…); ahora va dentro del .asc
    const view = asPlotView(shared.view);
    const d = view && !viewFromDoc(f.doc) ? withView(f.doc, view) : f.doc;
    remember(loadDoc(d, f.name), { name: `${projectName(f.name)}${EXT}` });
    warnMissing(f.doc);
    return true;
  });

  // Primer documento: el del link, el ejemplo pedido en la URL (?example=…), el último en el que se
  // estaba trabajando (autoguardado) o, la primera vez, un proyecto vacío como el de «Nuevo proyecto».
  // Nada de esto pisa lo que el usuario ya haya empezado a hacer.
  const touched = useRef(false);
  touched.current ||= docKey > 0 || history.version > 0;
  const [restored, setRestored] = useState(false);
  const restore = useEvent(() => {
    (async () => {
      // (primero la sesión: puede pasar a recientes el trabajo sin guardar de otras pestañas cerradas)
      const { session, elsewhere } = await loadProjectSession();
      setRecent(await loadRecent());
      // el trabajo sin guardar anterior queda en recientes
      const keepSession = () => {
        if (session?.dirty) addRecent({ name: session.name, asc: session.turbo, turbo: true, time: session.time, unsaved: true }).then(setRecent);
      };
      if (await openShared()) return keepSession();
      const example = new URLSearchParams(location.search).get('example');
      if (example && EXAMPLE_NAME.test(example)) {
        window.history.replaceState(null, '', location.pathname + location.hash);
        const r = await fetch(`${BASE}examples/${encodeURIComponent(example)}`);
        if (r.ok) {
          // sin pasar por recientes: es lo que se ve al entrar, no algo que abrió el usuario
          const { project: p } = await parseTurbo(new TextDecoder().decode(await r.arrayBuffer()));
          if (touched.current) return;
          loadProject(p, { name: example });
          return keepSession();
        }
      }
      if (touched.current) return;
      if (session) {
        try {
          const { project: p, warnings } = await parseTurbo(session.turbo);
          if (touched.current) return;
          loadProject(p, { name: session.name, handle: session.handle as FileState['handle'], driveId: session.driveId, driveVersion: session.driveVersion });
          setDirty(session.dirty);
          const notes = [...(session.dirty ? [t('Recovered unsaved work ({p0})', { p0: dateTime(session.time) })] : []), ...warnings];
          if (notes.length) setMessage(notes.join(' · '));
          return;
        } catch {
          // sesión ilegible: seguir con un proyecto vacío
        }
      }
      loadProject(newProject(DEFAULT_PROJECT), { name: `${DEFAULT_PROJECT}${EXT}` });
      if (elsewhere) setMessage(t('The project you were working on is open in another tab: this one starts a new project.'));
    })()
      .catch(() => {})
      .finally(() => setRestored(true));
  });
  // sólo al montar (restore es estable)
  useEffect(() => restore(), [restore]);

  // Autoguardado del proyecto entero en el navegador, un momento después de cada cambio (las
  // pilas de deshacer no se guardan, #154)
  // (data-autosave en <html>: «pending» hasta que termina el último guardado, «saved» después; lo esperan los e2e)
  const autosaveSeq = useRef(0);
  const projectNow = useEvent(snapshot);
  useEffect(() => {
    if (!restored) return;
    const seq = ++autosaveSeq.current;
    document.documentElement.dataset.autosave = 'pending';
    const tt = setTimeout(() => {
      serializeTurbo(projectNow())
        .then((turbo) => saveProjectSession({ name: file.name, handle: file.handle, driveId: file.driveId, driveVersion: file.driveVersion, turbo, dirty, time: Date.now() }))
        .then(() => seq === autosaveSeq.current && (document.documentElement.dataset.autosave = 'saved'))
        .catch((e) => console.error(e));
    }, 600);
    return () => clearTimeout(tt);
  }, [restored, history.state, project, file, dirty, panes, activePane, plotName, mode, projectNow]);

  // Migración: vista guardada en el navegador para este nombre de archivo (versiones
  // anteriores) y el .asc no trae la suya: se ofrece incorporarla
  const offerSavedView = useEvent(() => {
    if (!doc.symbols.length || viewFromDoc(doc)) return;
    loadView(file.name).then((v) => {
      const pv = asPlotView(v);
      if (pv) setOfferView((cur) => cur ?? pv);
    });
  });
  useEffect(() => offerSavedView(), [docKey, offerSavedView]);

  // Un link compartido abierto con la app ya cargada
  useEffect(() => {
    const h = () => {
      if (/[#&]c=/.test(location.hash) && confirmDiscard()) openShared();
    };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  });

  // Aviso al cerrar con cambios sin guardar (no al recargar para cambiar de idioma: se guardó todo)
  const reloading = useRef(false);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty && !reloading.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  /**
   * Cambiar de idioma (#72): el idioma se fija al cargar la página, así que se guarda el proyecto
   * (con lo que se está editando) y se recarga; el autoguardado lo trae de vuelta con sus resultados
   */
  const switchLang = async () => {
    const turbo = await serializeTurbo(snapshot());
    await saveProjectSession({ name: file.name, handle: file.handle, driveId: file.driveId, driveVersion: file.driveVersion, turbo, dirty, time: Date.now() });
    setLang(getLang() === 'en' ? 'es' : 'en');
    reloading.current = true;
    location.reload();
  };
  return { showView, restoreCached, loadProject, loadDoc, loadPractice, recent, remember, openBytes, switchLang };
}
