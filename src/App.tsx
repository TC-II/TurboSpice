// TurboSpice: editor de esquemáticos .asc (compatible con LTspice) + simulación con ngspice.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { baseName, emptyDoc, type AscDoc } from './asc/model.ts';
import type { AscEncoding } from './asc/encoding.ts';
import { EngineClient } from './engine/client.ts';
import type { SimPlot, SimResult } from './engine/ngspice.ts';
import { Library, USER_DIR, scanModels, type LibraryBundle } from './library/library.ts';
import { ltNetlist, ltNetlistText } from './netlist/ltnetlist.ts';
import { netNames, type Annotation } from './schematic/NetNames.tsx';
import { currentArrows } from './schematic/currentArrows.tsx';
import { biasParams, elementBias, netBias } from './sim/bias.ts';
import { symbolBox } from './schematic/geometry.ts';
import type { Point } from './asc/model.ts';
import { StatusText, type Status } from './NetlistMode.tsx';
import { isPzPlot, PzPlane, pzRuns, ResultTable } from './waveform/ScalarViews.tsx';
import { pzMarks, pzRoots } from './waveform/pz.ts';
import { SmithChart } from './waveform/SmithChart.tsx';
import { NetlistMode } from './NetlistMode.tsx';
import { AttributeDialog, ComponentPicker, FlagDialog, HelpDialog, RunsDialog, ShareDialog, TextDialog, UserFilesDialog, WelcomeDialog, type UserFileInfo } from './schematic/dialogs.tsx';
import { makeSymbol, schematicPorts, subcktPins } from './library/makeSymbol.ts';
import { AppMenu, MenuButton, type MenuDef, type MenuItem } from './ui/Menu.tsx';
import { Icon } from './ui/icons.tsx';
import { Toolbar, type ToolGroup } from './ui/Toolbar.tsx';
import { readShareHash, shareHash } from './schematic/share.ts';
import { addRecent, loadRecent, loadSession, loadUserFiles, readHandle, saveSession, saveUserFiles, type RecentFile, type UserFile } from './schematic/autosave.ts';
import { parseAsc } from './asc/parse.ts';
import { serializeAsc } from './asc/serialize.ts';
import { ControlDialog, SimulationDialog, type CircuitInfo, type Picker, type PickWhat } from './schematic/simDialogs.tsx';
import { findAnalysis, findControl, replaceAnalysis, type FoundLine } from './schematic/directivesEdit.ts';
import { controlBlock, controlBody } from './sim/controlSnippets.ts';
import { ANALYSES, ANALYSIS_LINE, type AnalysisKind } from './sim/analyses.ts';
import { isControlBlock } from './netlist/directives.ts';
import { effectiveAttrs } from './asc/resolve.ts';
import { addFlag, allItems, deleteItems, duplicateItems, extractItems, pasteItems, patchLabels, setFlagName, setSymbolAttrs, setText, transformItems } from './schematic/edit.ts';
import { ascBytes, openFile, readAsc, saveFile } from './schematic/fileio.ts';
import type { ItemRef } from './schematic/geometry.ts';
import { SchematicEditor, type EditorHandle, type Tool } from './schematic/SchematicEditor.tsx';
import { useHistory } from './schematic/useHistory.ts';
import { mirrorX, rotateCW } from './asc/transform.ts';
import { buildSimulation, type BuiltSimulation } from './sim/schematicSim.ts';
import { PlotPanel, type PlotAction, type PlotPanelHandle } from './waveform/PlotPanel.tsx';
import { spectrum, thd, type FftWindow } from './waveform/fft.ts';
import { sameRuns, scaleOf, si, stepLabels, stepSweepPlots } from './waveform/series.ts';
import type { ComplexMode } from './waveform/curves.ts';
import { evalTrace } from './waveform/expr.ts';
import { asPlotView, emptyPanes, parsePlt, plotKind, sameExpr, serializePlt, viewFromDoc, withView, type Pane, type PlotView } from './waveform/view.ts';
import { sameExceptData } from './asc/dataText.ts';
import { probeExpr, traceResolver } from './sim/traces.ts';
import { measSweepPlot, measureResults, xyPlotsFromLog, type MeasTable } from './sim/measResults.ts';
import { MeasPanel } from './sim/MeasPanel.tsx';
import { StudyPanel, type StudyInfo } from './schematic/StudyPanel.tsx';
import { applyStudy, applyStudyCode, studyFromDoc } from './sim/study.ts';
import { parseAnalysis } from './sim/analyses.ts';
import { loadView } from './schematic/autosave.ts';
import { decode } from './asc/encoding.ts';
import { download, exportSchematic } from './schematic/exportSchematic.ts';
import { ResultsSplitter, refitsSchematic, toggleResults, useExpanded, type Expanded } from './ui/ResultsSplitter.tsx';
import { AccountButton, DriveDialog } from './cloud/AccountButton.tsx';
import { drive, useGoogle } from './cloud/google.ts';
import type { DriveFile } from './cloud/drive.ts';

const BASE = import.meta.env.BASE_URL;
const REPO = 'https://github.com/TC-II/TurboSpice';
const EXAMPLES = ['Filtro RC.asc', 'Bode RLC.asc', 'Inversor OA_Ideal.asc', 'Rectificador.asc', 'Emisor común.asc', 'Barrido RC (.step).asc'];

type Dialog =
  | { kind: 'picker' }
  | { kind: 'attrs'; index: number; label?: number }
  | { kind: 'text'; index?: number; textKind: 'directive' | 'comment' }
  | { kind: 'flag'; index?: number; at?: Point }
  | { kind: 'sim'; found: FoundLine | null; analysis?: AnalysisKind }
  | { kind: 'control'; index: number }
  | { kind: 'share'; url: string }
  | { kind: 'help' }
  | { kind: 'userfiles' }
  | { kind: 'study' }
  | { kind: 'runs' }
  | { kind: 'welcome' }
  | { kind: 'drive' };

interface FileState {
  name: string;
  encoding?: AscEncoding;
  handle?: Parameters<typeof saveFile>[2];
  /** id del archivo en Google Drive (si se abrió o guardó ahí) */
  driveId?: string;
}

// Serialización cacheada por documento (el autoguardado guarda todo el historial)
const ascCache = new WeakMap<AscDoc, string>();
const ascText = (d: AscDoc) => {
  let t = ascCache.get(d);
  if (t === undefined) ascCache.set(d, (t = serializeAsc(d)));
  return t;
};
/** Pasos de deshacer que se conservan en el autoguardado */
const SAVED_UNDO = 50;

const isTyping = (e: KeyboardEvent) =>
  e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;

type Theme = 'auto' | 'light' | 'dark';

/** Tema claro/oscuro elegido en la app (por defecto, el del sistema) */
function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('turbospice.theme') as Theme) || 'auto';
    } catch {
      return 'auto';
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('turbospice.theme', theme);
    } catch {
      // sin almacenamiento: el tema vale sólo para esta sesión
    }
  }, [theme]);
  return [theme, setTheme];
}

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
    // sin almacenamiento
  }
};

/** Registra un archivo del usuario en la librería (símbolo, modelos o bloque) */
function registerUserFile(lib: Library, f: UserFile) {
  if (f.kind === 'symbol') lib.addSymbol(f.name.replace(/\.asy$/i, ''), f.text);
  else if (f.kind === 'model') lib.addModelFile(f.name, f.text);
  else lib.addSchematic(f.name, f.text);
}

const userFileKind = (name: string): UserFile['kind'] | null =>
  /\.asy$/i.test(name) ? 'symbol' : /\.(lib|sub|mod|inc|cir|txt|lb)$/i.test(name) ? 'model' : /\.asc$/i.test(name) ? 'schematic' : null;

/** Copia interna por si el navegador no deja leer el portapapeles */
let clipboardFallback = '';

export function App() {
  const engine = useMemo(() => new EngineClient(), []);
  const [mode, setMode] = useState<'schematic' | 'netlist'>('schematic');
  const [lib, setLib] = useState<Library | null>(null);
  const [libError, setLibError] = useState<string>();

  useEffect(() => {
    fetch(`${BASE}library/bundle.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(async (b: LibraryBundle) => {
        const l = new Library(b);
        for (const f of await loadUserFiles()) registerUserFile(l, f);
        setLib(l);
      })
      .catch((e: Error) => setLibError(`No se pudo cargar la librería: ${e.message}`));
    return () => engine.abort();
  }, [engine]);

  // lugares de la barra superior que llena el modo esquemático: el menú (junto al nombre) y,
  // arriba a la derecha, archivo, tema y compartir (#38)
  const [menuSlot, setMenuSlot] = useState<HTMLElement | null>(null);
  const [rightSlot, setRightSlot] = useState<HTMLElement | null>(null);

  return (
    <div className="app">
      <header className="appbar">
        <div className="appbar-slot" ref={setMenuSlot} />
        <h1>TurboSpice</h1>
        <nav className="tabs">
          <button className={mode === 'schematic' ? 'active' : ''} onClick={() => setMode('schematic')}>Esquemático</button>
          <button className={mode === 'netlist' ? 'active' : ''} onClick={() => setMode('netlist')}>Netlist</button>
        </nav>
        <div className="appbar-slot appbar-right" ref={setRightSlot} />
        {/* el usuario / login (#35), al final, después de Compartir */}
        <AccountButton />
      </header>
      {mode === 'netlist' && <NetlistMode engine={engine} />}
      {mode === 'schematic' &&
        (lib ? (
          <SchematicMode engine={engine} lib={lib} slots={{ menu: menuSlot, right: rightSlot }} />
        ) : (
          <p className="empty pad">{libError ?? 'Cargando librería…'}</p>
        ))}
    </div>
  );
}

function SchematicMode({ engine, lib, slots }: { engine: EngineClient; lib: Library; slots: { menu: HTMLElement | null; right: HTMLElement | null } }) {
  const history = useHistory<AscDoc>(emptyDoc());
  const doc = history.value;
  const [file, setFile] = useState<FileState>({ name: 'Sin título.asc' });
  const [savedVersion, setSavedVersion] = useState(0);
  const [tool, setToolState] = useState<Tool>({ kind: 'select' });
  const [selection, setSelection] = useState<ItemRef[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const google = useGoogle();
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [message, setMessage] = useState<string>();
  const [sim, setSim] = useState<{ built: BuiltSimulation; result: SimResult; doc: AscDoc; meas: MeasTable | null } | null>(null);
  const [showOp, setShowOp] = useState(false);
  const [panes, setPanes] = useState<Pane[]>(emptyPanes);
  const [activePane, setActivePane] = useState(0);
  // vista recordada (paneles por tipo de análisis): va dentro del .asc (";.plot …"), así que
  // cambiarla es editar el documento (entra al historial de deshacer)
  const plotView = useMemo(() => viewFromDoc(doc) ?? {}, [doc]);
  const setPlotView = (v: PlotView) => history.commit(withView(doc, v));
  // vista de una versión anterior (guardada en el navegador por nombre de archivo) para incorporar
  const [offerView, setOfferView] = useState<PlotView | null>(null);
  const [plotName, setPlotName] = useState('');
  const [mode, setMode] = useState<ComplexMode>('bode');
  const plotPanel = useRef<PlotPanelHandle>(null);
  const [resultsSide, setResultsSide] = useState(() => lsGet('turbospice.resultsSide') === '1');
  const sizeKey = resultsSide ? 'turbospice.resultsW' : 'turbospice.resultsH';
  const [resultsH, setResultsH] = useState<number>(() => Number(lsGet(sizeKey)) || 0);
  useEffect(() => setResultsH(Number(lsGet(sizeKey)) || 0), [sizeKey]);
  // esquemático o resultados expandidos a toda la ventana (#24)
  const [expanded, setExpandedState] = useExpanded(!!sim && !dialog);
  const setExpanded = (e: Expanded) => {
    // al volver al esquemático o colapsar/mostrar los resultados, reajustar la vista (cambió el
    // tamaño del lienzo o estaba oculto)
    if (refitsSchematic(expanded, e)) setTimeout(() => editor.current?.fit(), 50);
    setExpandedState(e);
  };
  const [theme, setTheme] = useTheme();
  const [panel, setPanel] = useState<'plot' | 'netlist' | 'log' | 'problems' | 'meas'>('plot');
  const [overlay, setOverlay] = useState(true);
  // mapa de polos y ceros al lado del Bode (si hay .pz y .ac)
  const [pzSide, setPzSide] = useState(true);
  const editor = useRef<EditorHandle>(null);
  const [docKey, setDocKey] = useState(0);
  const dirty = history.version !== savedVersion;

  // archivos del usuario: al cambiar, la librería cambia (se recalcula la netlist y el dibujo)
  const [userFiles, setUserFiles] = useState<UserFile[]>([]);
  const [libVersion, setLibVersion] = useState(0);
  useEffect(() => {
    loadUserFiles().then(setUserFiles);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lt = useMemo(() => ltNetlist(doc, lib), [doc, lib, libVersion]);
  const conn = lt.conn;
  const [showNets, setShowNets] = useState(false);
  const shownNets = useMemo(() => (showNets ? netNames(doc, conn, lt.ncNames) : undefined), [showNets, doc, conn, lt]);
  // red resaltada desde el panel de resultados (al pasar por una traza)
  const [traceNet, setTraceNet] = useState<string>();

  // Elegir una red o fuente en el esquemático desde un diálogo (que queda oculto mientras)
  const [picking, setPicking] = useState<{ what: PickWhat; resolve(v: string | null): void; prev: Tool } | null>(null);

  const setTool = useCallback((t: Tool) => {
    setToolState(t);
    if (t.kind !== 'select' && t.kind !== 'move' && t.kind !== 'zoom') setSelection([]);
  }, []);
  // Ctrl+G / Ctrl+U: grilla y marcas de pines sueltos
  const [showGrid, setShowGrid] = useState(true);
  const [showLoose, setShowLoose] = useState(true);
  // corridas de un .step ocultas (Shift+S)
  const [hiddenRuns, setHiddenRuns] = useState<Set<string>>(new Set());
  // Los atajos dependen de dónde está el mouse, como en LTspice: esquemático o visor
  const area = useRef<'schematic' | 'viewer'>('schematic');
  useEffect(() => {
    const h = (e: PointerEvent) => {
      area.current = e.target instanceof Element && e.target.closest('.results-panel') ? 'viewer' : 'schematic';
    };
    window.addEventListener('pointermove', h);
    return () => window.removeEventListener('pointermove', h);
  }, []);
  const commit = history.commit;

  useEffect(() => {
    engine.ready.then(
      () => setStatus({ kind: 'idle' }),
      (e: Error) => setStatus({ kind: 'error', message: e.message }),
    );
  }, [engine]);

  const loadDoc = useCallback(
    (d: AscDoc, f: FileState) => {
      history.reset(d);
      setSavedVersion(0);
      setFile(f);
      setSelection([]);
      setSim(null);
      setPanes(emptyPanes());
      setActivePane(0);
      setOfferView(null);
      setTool({ kind: 'select' });
      setDocKey((k) => k + 1);
    },
    [history, setTool],
  );

  const [recent, setRecent] = useState<RecentFile[]>([]);
  const remember = useCallback((d: AscDoc, f: FileState, unsaved = false) => {
    addRecent({ name: f.name, asc: ascText(d), encoding: f.encoding, handle: f.handle, driveId: f.driveId, time: Date.now(), unsaved }).then(setRecent);
  }, []);

  // Circuito compartido en el hash del link (#c=…): se abre y se limpia el hash
  const openShared = useCallback(async (): Promise<boolean> => {
    let shared;
    try {
      shared = await readShareHash(location.hash);
    } catch {
      setMessage('El link no contiene un circuito válido');
    }
    if (shared === undefined && !/[#&]c=/.test(location.hash)) return false;
    window.history.replaceState(null, '', location.pathname + location.search);
    if (!shared) return false;
    const f = readAsc(shared.bytes, shared.name);
    // links viejos: la vista venía aparte (&v=…); ahora va dentro del .asc
    const view = asPlotView(shared.view);
    const d = view && !viewFromDoc(f.doc) ? withView(f.doc, view) : f.doc;
    loadDoc(d, { name: f.name, encoding: f.encoding });
    remember(d, { name: f.name, encoding: f.encoding });
    return true;
  }, [loadDoc]);

  // Primer documento: el del link, el último en el que se estaba trabajando (autoguardado)
  // o un ejemplo. Nada de esto pisa lo que el usuario ya haya empezado a hacer.
  const touched = useRef(false);
  touched.current ||= docKey > 0 || history.version > 0;
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    (async () => {
      setRecent(await loadRecent());
      const session = await loadSession();
      const sessionDirty = !!session && session.past.length !== session.savedVersion;
      if (!lsGet('turbospice.welcomed') && !/[#&]c=/.test(location.hash)) setDialog({ kind: 'welcome' });
      if (await openShared()) {
        // el trabajo sin guardar anterior queda en recientes
        if (session && sessionDirty) remember(parseAsc(session.present), { name: session.name, encoding: session.encoding }, true);
        return;
      }
      if (touched.current) return;
      if (session) {
        try {
          history.restore({ past: session.past.map(parseAsc), present: parseAsc(session.present), future: session.future.map(parseAsc) });
          setFile({ name: session.name, encoding: session.encoding, handle: session.handle as FileState['handle'], driveId: session.driveId });
          setSavedVersion(session.savedVersion);
          // sesiones anteriores: la vista estaba aparte del documento
          const old = asPlotView(session.view);
          if (old && !viewFromDoc(parseAsc(session.present))) setOfferView(old);
          setDocKey((k) => k + 1);
          if (sessionDirty) setMessage(`Se recuperó el trabajo sin guardar (${new Date(session.time).toLocaleString()})`);
          return;
        } catch {
          // sesión ilegible: seguir con el ejemplo
        }
      }
      const b = await (await fetch(`${BASE}examples/${encodeURIComponent(EXAMPLES[0])}`)).arrayBuffer();
      if (touched.current) return;
      const f = readAsc(new Uint8Array(b), EXAMPLES[0]);
      loadDoc(f.doc, { name: f.name, encoding: f.encoding });
    })()
      .catch(() => {})
      .finally(() => setRestored(true));
  }, []); // sólo al montar

  // Autoguardado (con el historial de deshacer), un momento después de cada cambio
  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => {
      const h = history.state;
      const drop = Math.max(0, h.past.length - SAVED_UNDO);
      saveSession({
        name: file.name,
        encoding: file.encoding,
        handle: file.handle,
        driveId: file.driveId,
        past: h.past.slice(drop).map(ascText),
        present: ascText(h.present),
        future: h.future.slice(0, SAVED_UNDO).map(ascText),
        savedVersion: savedVersion - drop,
        time: Date.now(),
      });
    }, 600);
    return () => clearTimeout(t);
  }, [restored, history.state, file, savedVersion]);

  // Migración: vista guardada en el navegador para este nombre de archivo (versiones
  // anteriores) y el .asc no trae la suya: se ofrece incorporarla
  useEffect(() => {
    if (!doc.symbols.length || viewFromDoc(doc)) return;
    loadView(file.name).then((v) => {
      const pv = asPlotView(v);
      if (pv) setOfferView((cur) => cur ?? pv);
    });
  }, [docKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Un link compartido abierto con la app ya cargada
  useEffect(() => {
    const h = () => {
      if (/[#&]c=/.test(location.hash) && confirmDiscard()) openShared();
    };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  });

  // Aviso al cerrar con cambios sin guardar
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const confirmDiscard = () => !dirty || window.confirm('Hay cambios sin guardar. ¿Descartarlos?');

  const doOpen = async () => {
    if (!confirmDiscard()) return;
    try {
      const f = await openFile();
      if (f) {
        loadDoc(f.doc, { name: f.name, encoding: f.encoding, handle: f.handle });
        remember(f.doc, { name: f.name, encoding: f.encoding, handle: f.handle });
        warnMissing(f.doc);
      }
    } catch (e) {
      setMessage(`No se pudo abrir: ${(e as Error).message}`);
    }
  };

  const savedAs = (saved: FileState, missing: string[], where = '') => {
    setFile(saved);
    setSavedVersion(history.version);
    remember(doc, saved);
    setMessage(
      missing.length
        ? `Guardado${where}. Símbolos fuera de la librería (sin hacer explícitos): ${missing.join(', ')}`
        : `Guardado${where}: ${saved.name}`,
    );
  };

  /** Guardar en el equipo (como siempre) */
  const doSaveLocal = async (saveAs = false) => {
    const { bytes, missing } = ascBytes(doc, lib, file.encoding);
    try {
      const r = await saveFile(bytes, file.name, file.handle, saveAs);
      if (r) savedAs({ ...file, name: r.name, handle: r.handle ?? file.handle }, missing);
    } catch (e) {
      setMessage(`No se pudo guardar: ${(e as Error).message}`);
    }
  };

  /** Guardar en la carpeta TurboSpice del Drive: sobre el mismo archivo, o uno nuevo */
  const doSaveDrive = async (saveAs = false) => {
    let name = file.name;
    let id = saveAs ? undefined : file.driveId;
    if (!id && saveAs) {
      const n = window.prompt('Nombre del archivo en Google Drive', name)?.trim();
      if (!n) return;
      name = /\.asc$/i.test(n) ? n : `${n}.asc`;
    }
    const { bytes, missing } = ascBytes(doc, lib, file.encoding);
    try {
      if (!id) {
        const same = (await drive.list()).find((f) => f.name.toLowerCase() === name.toLowerCase());
        if (same) {
          if (!window.confirm(`Ya hay un «${same.name}» en Google Drive. ¿Reemplazarlo?`)) return;
          id = same.id;
        }
      }
      const r = await drive.save(name, bytes, id);
      savedAs({ ...file, name: r.name, driveId: r.id }, missing, ' en Google Drive');
    } catch (e) {
      setMessage(`No se pudo guardar en Google Drive: ${(e as Error).message}`);
    }
  };

  // Con la sesión de Google iniciada, Guardar va al Drive; si no, al equipo
  const doSave = (saveAs = false) => (google.account ? doSaveDrive(saveAs) : doSaveLocal(saveAs));

  const openDriveFile = async (d: DriveFile) => {
    if (!confirmDiscard()) return;
    try {
      const f = readAsc(await drive.download(d.id), d.name);
      const state = { name: f.name, encoding: f.encoding, driveId: d.id };
      setDialog(null);
      loadDoc(f.doc, state);
      remember(f.doc, state);
      warnMissing(f.doc);
    } catch (e) {
      setMessage(`No se pudo abrir de Google Drive: ${(e as Error).message}`);
    }
  };

  const doShare = async () => {
    const { bytes } = ascBytes(doc, lib, file.encoding);
    const hash = await shareHash(bytes, file.name);
    setDialog({ kind: 'share', url: `${location.origin}${location.pathname}#${hash}` });
  };

  const doRecent = async (i: number) => {
    const r = recent[i];
    if (!r || !confirmDiscard()) return;
    // el archivo en disco si se puede leer (puede haber cambiado); si no, la copia guardada
    const bytes = r.unsaved ? null : r.driveId && google.account ? await drive.download(r.driveId).catch(() => null) : await readHandle(r.handle);
    const f = bytes ? readAsc(bytes, r.name) : { doc: parseAsc(r.asc), name: r.name, encoding: r.encoding };
    const state = { name: f.name, encoding: f.encoding, handle: r.handle as FileState['handle'], driveId: r.driveId };
    loadDoc(f.doc, state);
    if (!r.unsaved) remember(f.doc, state);
  };

  const doNew = () => confirmDiscard() && loadDoc(emptyDoc(), { name: 'Sin título.asc' });

  const doExample = async (name: string) => {
    if (!confirmDiscard()) return;
    const b = await (await fetch(`${BASE}examples/${encodeURIComponent(name)}`)).arrayBuffer();
    const f = readAsc(new Uint8Array(b), name);
    loadDoc(f.doc, { name, encoding: f.encoding });
  };

  const run = async () => {
    setStatus({ kind: 'running', percent: 0, text: '' });
    setMessage(undefined);
    engine.onStatus = (text, percent) => setStatus({ kind: 'running', percent, text });
    try {
      const built = await buildSimulation(doc, lib, file.name);
      const { result, ms } = await engine.simulate(built.netlist, built.files, { bias: biasParams(built) });
      result.plots.push(...stepSweepPlots(result.plots, built.ng.steps));
      // .meas: se evalúan sobre los resultados de cada corrida
      const meas = measureResults(built, result.plots, stepLabels(result.plots, built.ng.steps));
      const mp = meas && measSweepPlot(meas, built);
      if (mp) result.plots.push(mp);
      // gráficos x-y de un programa de bloques
      const xy = xyPlotsFromLog(result.log, built.ng.xyPlots);
      result.plots.push(...xy);
      // Al abrirse el panel de resultados el lienzo se achica: reajustar la vista
      if (!sim) setTimeout(() => editor.current?.fit(), 50);
      // con el esquemático expandido, los resultados no quedan ocultos
      if (expanded === 'schematic') setExpanded('');
      setSim({ built, result, doc, meas });
      setHiddenRuns(new Set());
      paneUndo.current = { past: [], future: [] };
      // se muestra la última corrida con eje X; los plots sintéticos ("op vs R", "meas vs R")
      // sólo si no hay otra cosa
      const realRuns = result.plots.filter((p) => scaleOf(p) && /^[a-z]+\d+$/i.test(p.name));
      const withScale = xy.length ? xy : realRuns.length ? realRuns : result.plots.filter((p) => scaleOf(p));
      // con .pz se abre el mapa de polos y ceros aunque haya otros análisis
      const pzs = result.plots.filter(isPzPlot);
      const shown = pzs[pzs.length - 1] ?? withScale[withScale.length - 1] ?? result.plots[result.plots.length - 1];
      setPlotName(shown?.name ?? '');
      // Qué graficar: la vista recordada para este análisis, o lo que pida el .control con
      // "plot", o lo que ya se estaba mirando (las trazas que no existan avisan en su chip)
      const remembered = shown && plotView[plotKind(shown.name)];
      if (xy.length && shown === xy[xy.length - 1]) setPanes([{ traces: [{ expr: shown.vectors[1].name }] }]);
      else if (remembered) {
        setPanes(remembered);
        if (built.controlPanes.length) built.warnings.push('Se usa la vista recordada en lugar de los "plot" del .control');
      } else if (built.controlPanes.length) setPanes(built.controlPanes);
      const errs = result.errors.length ? result.errors : [];
      setStatus(errs.length && !result.plots.length ? { kind: 'error', message: errs[0] } : { kind: 'done', ms });
      setMessage(
        built.warnings.length
          ? `${built.warnings.length === 1 ? built.warnings[0] : `${built.warnings.length} avisos`} — ver la pestaña Problemas`
          : undefined,
      );
      if (result.plots.length) {
        setTool({ kind: 'probe' });
        const nothingPlotted = !(remembered ?? panes).some((p) => p.traces.length) && !built.controlPanes.length;
        setPanel(errs.length ? 'problems' : meas?.rows.length && nothingPlotted ? 'meas' : 'plot');
      } else setPanel(errs.length ? 'problems' : 'log');
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message });
    }
  };

  const abort = () => {
    engine.abort();
    engine.ready.then(() => setStatus({ kind: 'idle' }));
    setStatus({ kind: 'error', message: 'Simulación abortada' });
  };
  /** Ctrl+L: log de la simulación (Problemas si hubo errores) */
  const showLog = () => {
    if (!sim) return setMessage('Todavía no hay simulación: simulá con Alt+R');
    setPanel(sim.result.errors.length ? 'problems' : 'log');
  };

  // Deshacer / rehacer los cambios de la vista de resultados (trazas, paneles, colores)
  const paneUndo = useRef<{ past: Pane[][]; future: Pane[][] }>({ past: [], future: [] });
  const editPanes = (next: Pane[]) => {
    paneUndo.current.past.push(panes);
    paneUndo.current.future = [];
    setPanes(next);
  };
  const undoPanes = (redo = false) => {
    const u = paneUndo.current;
    const p = (redo ? u.future : u.past).pop();
    if (!p) return;
    (redo ? u.past : u.future).push(panes);
    setPanes(p);
  };

  const plot = sim?.result.plots.find((p) => p.name === plotName);
  // paneles de cada tipo de análisis (al cambiar de plot se recuperan los de ese tipo)
  const panesByKind = useRef(new Map<string, Pane[]>());
  const selectPlot = (name: string, next?: Pane[]) => {
    if (plotName) panesByKind.current.set(plotKind(plotName), panes);
    setPlotName(name);
    const kind = plotKind(name);
    const r = next ?? plotView[kind] ?? panesByKind.current.get(kind);
    if (r) setPanes(r);
  };
  const doFft = (o: { expr: string; window: FftWindow; from?: number; to?: number }) => {
    if (!sim || !plot) return;
    const sc = scaleOf(plot)!;
    let w;
    try {
      w = evalTrace(o.expr, { resolve: resolver(plot), scale: sc.real, scaleName: sc.name });
    } catch (e) {
      return setMessage((e as Error).message);
    }
    const sp = spectrum(sc.real, w.re, o);
    const t = thd(sp);
    const name = `fft ${o.expr} (${plot.name})`;
    const derived: SimPlot = {
      name,
      vectors: [
        { name: 'frequency', type: 2, real: sp.freq },
        { name: 'mag', type: 0, real: sp.amp },
      ],
      info: `${o.expr}: fundamental ${si(t.fundamental)}Hz, amplitud ${si(t.amplitude)} · THD ${t.thd.toFixed(3)} % (armónicas 2 a ${t.harmonics.length + 1}) · ${sp.n} puntos, ventana ${o.window}`,
    };
    setSim({ ...sim, result: { ...sim.result, plots: [...sim.result.plots.filter((p) => p.name !== name), derived] } });
    selectPlot(name, panesByKind.current.get('fft') ?? [{ traces: [{ expr: 'db(mag)' }] }]);
  };
  const pltInput = useRef<HTMLInputElement>(null);

  // Punto de operación: sólo mientras el esquemático sea el que se simuló
  const bias = sim && sameExceptData(sim.doc, doc) ? sim.result.bias : undefined;
  const describe = useMemo(() => {
    if (!bias || !sim) return undefined;
    return ({ net, symbol }: { net?: string; symbol?: number }) => {
      if (net) return net === '0' ? null : netBias(bias, net);
      const el = symbol !== undefined ? sim.built.lt.elements.find((e) => e.sym === symbol) : undefined;
      return el ? elementBias(sim.built, bias, el) : null;
    };
  }, [bias, sim]);
  const annotations = useMemo((): Annotation[] | undefined => {
    if (!showOp || !bias || !sim) return undefined;
    const out: Annotation[] = [];
    for (const n of netNames(doc, conn, new Map())) {
      const b = netBias(bias, n.name);
      if (b?.short) out.push({ at: n.at, text: b.short, kind: 'v' });
    }
    for (const el of sim.built.lt.elements) {
      if (!/^[RLVIDQMJ]/i.test(el.prefix)) continue;
      const b = elementBias(sim.built, bias, el);
      const s = doc.symbols[el.sym];
      if (!b?.short || !s) continue;
      const box = symbolBox(s, lib.symbol(s.type), lib);
      out.push({ at: { x: box.x2 + 4, y: (box.y1 + box.y2) / 2 }, text: b.short, kind: 'i' });
    }
    return out;
  }, [showOp, bias, sim, doc, conn, lib]);

  // Sentido positivo de la corriente en los pines (punta de prueba y anotación del OP)
  const arrows = useMemo(() => {
    if (!sim || sim.doc !== doc || !(showOp || tool.kind === 'probe')) return undefined;
    return currentArrows(doc, lib, sim.built.lt.elements);
  }, [sim, doc, lib, showOp, tool.kind]);

  const resolver = useCallback((p: SimPlot) => traceResolver(sim?.built ?? null, p), [sim]);

  // Punta de prueba: agrega la traza al panel activo (o la quita si ya estaba)
  const onProbe = (target: { net?: string; symbol?: number }) => {
    if (!sim || !plot) return;
    const expr = probeExpr(sim.built, target);
    if (!expr) return;
    setPanel('plot');
    // con los resultados colapsados, mostrarlos para ver la traza
    if (expanded === 'schematic') setExpanded('');
    if (panes.some((p) => p.traces.some((t) => sameExpr(t.expr, expr)))) {
      editPanes(panes.map((p) => ({ traces: p.traces.filter((t) => !sameExpr(t.expr, expr)) })));
      return;
    }
    const sc = scaleOf(plot);
    if (!sc) return setMessage(`${plot.name} no tiene eje X: elegí otro análisis para graficar`);
    try {
      evalTrace(expr, { resolve: resolver(plot), scale: sc.real, scaleName: sc.name });
    } catch {
      return setMessage(`No hay datos de ${expr} en ${plot.name}`);
    }
    const i = Math.min(activePane, panes.length - 1);
    editPanes(panes.map((p, k) => (k === i ? { traces: [...p.traces, { expr }] } : p)));
  };

  const rememberView = () => {
    if (!plot) return;
    const kind = plotKind(plot.name);
    setPlotView({ ...plotView, [kind]: panes });
    setMessage(`Vista recordada para .${kind}: se aplica en cada simulación y se guarda dentro del .asc`);
  };
  /** Ctrl+Espacio: volver a aplicar la vista recordada */
  const reapplyView = () => {
    const v = plot && plotView[plotKind(plot.name)];
    if (v) editPanes(v);
    else setMessage('No hay una vista recordada para este análisis (botón "Recordar vista")');
  };
  const forgetView = () => {
    if (!plot) return;
    const { [plotKind(plot.name)]: _, ...rest } = plotView;
    setPlotView(rest);
  };
  const acceptOfferedView = () => {
    if (offerView) setPlotView({ ...offerView, ...plotView });
    setOfferView(null);
  };
  const importPlt = (bytes: Uint8Array) => {
    const v = parsePlt(decode(bytes).text);
    if (!Object.keys(v).length) return setMessage('El .plt no tiene vistas que TurboSpice entienda');
    setPlotView({ ...plotView, ...v });
    if (plot && v[plotKind(plot.name)]) setPanes(v[plotKind(plot.name)]);
    setMessage(`Vista importada del .plt (${Object.keys(v).map((k) => `.${k}`).join(', ')})`);
  };
  const exportPlt = () => {
    const v = plot ? { ...plotView, [plotKind(plot.name)]: panes } : plotView;
    download(file.name.replace(/\.asc$/i, '') + '.plt', new Blob([serializePlt(v)], { type: 'text/plain' }));
  };

  const rotateOrMirror = (op: 'rotate' | 'mirror') => {
    if (tool.kind === 'place') setTool({ ...tool, orient: op === 'rotate' ? rotateCW(tool.orient) : mirrorX(tool.orient) });
    else if (selection.length) commit(transformItems(doc, selection, op, lib));
  };

  const editItem = (ref: ItemRef) => {
    if (ref.kind === 'symbol') setDialog({ kind: 'attrs', index: ref.index });
    else if (ref.kind === 'text') {
      const t = doc.texts[ref.index];
      const ls = t.text.split('\\n');
      // Como en LTspice: un comando de análisis abre el menú de simulación
      if (isControlBlock(t.text)) setDialog({ kind: 'control', index: ref.index });
      else if (ls.length === 1 && ANALYSIS_LINE.test(ls[0])) setDialog({ kind: 'sim', found: { text: ref.index, line: 0, value: ls[0].trim() } });
      else setDialog({ kind: 'text', index: ref.index, textKind: t.kind });
    } else if (ref.kind === 'flag') setDialog({ kind: 'flag', index: ref.index });
  };

  const picker: Picker = (what) =>
    new Promise((resolve) => {
      setPicking({ what, resolve, prev: tool });
      setToolState({ kind: 'pick', what });
    });
  const endPick = (v: string | null) => {
    if (!picking) return;
    picking.resolve(v);
    setToolState(picking.prev);
    setPicking(null);
  };
  const pickValue = ({ net, symbol }: { net?: string; symbol?: number }): string | null => {
    if (!picking) return null;
    if (picking.what === 'net') return net && net !== '0' ? net : null;
    if (symbol === undefined) return null;
    const a = effectiveAttrs(doc.symbols[symbol], lib.symbol(doc.symbols[symbol].type));
    if (picking.what === 'component') return a.get('Prefix') ? (a.get('InstName') ?? null) : null;
    return /^[VI]$/i.test(a.get('Prefix') ?? '') ? (a.get('InstName') ?? null) : null;
  };
  useEffect(() => {
    if (!picking) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        endPick(null);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const missingSymbols = (d: AscDoc) => [...new Set(d.symbols.filter((x) => !lib.symbol(x.type)).map((x) => `${baseName(x.type)}.asy`))];
  /** Avisa si el circuito usa símbolos que no están en la librería ni entre los del usuario */
  const warnMissing = (d: AscDoc) => {
    const miss = missingSymbols(d);
    if (miss.length) setMessage(`Faltan símbolos: ${miss.join(', ')}. Agregalos en Archivo › Mis símbolos y modelos.`);
  };
  const storeUserFiles = (next: UserFile[]) => {
    setUserFiles(next);
    saveUserFiles(next);
    setLibVersion((v) => v + 1);
  };
  const addUserFiles = async (files: File[]) => {
    const next = [...userFiles];
    const added: string[] = [];
    for (const f of files) {
      const kind = userFileKind(f.name);
      if (!kind) continue;
      const uf: UserFile = { name: f.name, kind, text: decode(new Uint8Array(await f.arrayBuffer())).text, time: Date.now() };
      const i = next.findIndex((x) => x.name.toLowerCase() === f.name.toLowerCase());
      if (i >= 0) next[i] = uf;
      else next.push(uf);
      registerUserFile(lib, uf);
      added.push(f.name);
    }
    storeUserFiles(next);
    if (added.length) setMessage(`Agregados: ${added.join(', ')}`);
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
    if (!pins) return setMessage(`No se encontró .subckt ${name} en ${file}`);
    const uf: UserFile = { name: `${name}.asy`, kind: 'symbol', text: makeSymbol({ name, pins, block: f.kind === 'schematic', modelFile: f.kind === 'model' ? file : undefined }), time: Date.now() };
    registerUserFile(lib, uf);
    storeUserFiles([...userFiles.filter((x) => x.name.toLowerCase() !== uf.name.toLowerCase()), uf]);
    setMessage(`Símbolo ${name} creado: está en el buscador de componentes (F2) en "${USER_DIR}"`);
  };
  const userFileInfo = (): UserFileInfo[] =>
    userFiles.map((f) => ({
      name: f.name,
      kind: f.kind,
      items: f.kind === 'model' ? scanModels(f.text).subckts : f.kind === 'schematic' ? schematicPorts(parseAsc(f.text).flags) : [],
    }));

  // Portapapeles: la selección como texto .asc (se puede pegar en otra pestaña o en un editor)
  const copySelection = async (cut = false) => {
    if (!selection.length) return;
    const text = serializeAsc(extractItems(doc, selection));
    clipboardFallback = text;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // sin permiso: queda la copia interna
    }
    if (cut) {
      commit(deleteItems(doc, selection, lib));
      setSelection([]);
    }
  };
  const paste = async () => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      text = clipboardFallback;
    }
    if (!/^\s*Version\s/.test(text)) text = clipboardFallback;
    if (!text) return;
    const frag = parseAsc(text);
    const at = editor.current?.cursor() ?? { x: 0, y: 0 };
    const r = pasteItems(doc, frag, at, lib);
    if (!r.refs.length) return;
    commit(r.doc);
    setTool({ kind: 'select' });
    setSelection(r.refs);
  };
  const duplicate = () => {
    if (!selection.length) return;
    const r = duplicateItems(doc, selection, 32, 32, lib);
    commit(r.doc);
    setSelection(r.refs);
  };
  const deleteSelection = () => {
    if (selection.length) {
      commit(deleteItems(doc, selection, lib));
      setSelection([]);
    } else setTool({ kind: 'delete' });
  };
  const exportNetlist = async (which: 'net' | 'cir') => {
    const base = file.name.replace(/\.asc$/i, '');
    if (which === 'net') return download(`${base}.net`, new Blob([`* ${file.name}\n${ltNetlistText(lt)}\n`], { type: 'text/plain' }));
    const built = sim && sameExceptData(sim.doc, doc) ? sim.built : await buildSimulation(doc, lib, file.name);
    download(`${base}.cir`, new Blob([built.netlist], { type: 'text/plain' }));
  };
  const exportImage = (f: 'svg' | 'png') => {
    const svg = editor.current?.svg();
    const box = editor.current?.contentBox();
    if (svg && box) exportSchematic(svg, box, file.name.replace(/\.asc$/i, ''), f);
  };

  const openStudy = () => setDialog({ kind: 'study' });
  const studyInfo = (): StudyInfo => {
    const found = findAnalysis(doc);
    const kind = found ? parseAnalysis(found.value)?.kind : undefined;
    const analysis = kind === 'ac' || kind === 'dc' || kind === 'noise' || kind === 'op' || kind === 'tf' ? kind : 'tran';
    const params = new Set<string>();
    for (const t of doc.texts) {
      if (t.kind !== 'directive') continue;
      for (const l of t.text.split('\\n')) for (const m of l.matchAll(/^\s*\.param\s+(.*)$/gi)) for (const p of m[1].matchAll(/([A-Za-z_]\w*)\s*=/g)) params.add(p[1]);
    }
    return {
      components: doc.symbols
        .map((x) => effectiveAttrs(x, lib.symbol(x.type)))
        .filter((a) => a.get('Prefix'))
        .map((a) => ({ name: a.get('InstName') ?? '', prefix: (a.get('Prefix') ?? '')[0], value: a.get('Value') ?? '' }))
        .filter((c) => c.name),
      sources: circuitInfo().sources,
      nets: circuitInfo().nets,
      params: [...params],
      analysis,
    };
  };

  /** Menú de simulación; con un tipo de análisis, abre en ese tipo */
  const openSimulation = (analysis?: AnalysisKind) => setDialog({ kind: 'sim', found: findAnalysis(doc), analysis });
  const openControl = () => setDialog({ kind: 'control', index: findControl(doc) });

  // Redes y fuentes del circuito, para los selectores del menú de simulación
  const circuitInfo = (): CircuitInfo => ({
    nets: [...new Set(conn.nets.map((n) => n.name).filter((n) => n))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    sources: doc.symbols
      .map((s) => effectiveAttrs(s, lib.symbol(s.type)))
      .filter((a) => /^[VI]$/i.test(a.get('Prefix') ?? ''))
      .map((a) => a.get('InstName') ?? '')
      .filter(Boolean),
  });

  // Atajos de teclado: los de la configuración de LTspice que usamos (LTspice.ini,
  // [SchKeyBoardShortCut] y [RawKeyBoardShortCut]); los del visor, con el mouse sobre los gráficos
  const startMove = (stretch: boolean) =>
    setTool(selection.length ? { kind: 'move', stretch, refs: selection, start: editor.current?.cursor() ?? null } : { kind: 'move', stretch, refs: null, start: null });
  const zoomBox = () => setTool({ kind: 'zoom', prev: tool.kind === 'zoom' ? tool.prev : tool });
  const viewerKeys = () => area.current === 'viewer' && !!sim && panel === 'plot' && !!plotPanel.current;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || isTyping(e)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key;
      // letra sin importar Shift/Bloq Mayús (Shift se mira aparte)
      const lk = k.length === 1 ? k.toLowerCase() : k;
      const handled = () => e.preventDefault();
      // en los dos contextos
      if (e.altKey && lk === 'r') return handled(), !running && status.kind !== 'loading' && run();
      if (e.altKey && lk === 's') return handled(), running && abort();
      if (ctrl && lk === 'l') return handled(), showLog();
      if (ctrl && k === 'Enter') return handled(), run();
      if (ctrl && lk === 's') return handled(), doSave(e.shiftKey);
      if (ctrl && lk === 'o') return handled(), doOpen();
      if (k === ' ' && !e.altKey) {
        // Espacio tocado = ajustar (al soltarlo); mantenido + arrastrar desplaza
        handled();
        if (ctrl && viewerKeys()) reapplyView();
        return;
      }
      if (viewerKeys()) {
        const act = (a: PlotAction) => (handled(), plotPanel.current?.action(a));
        if (ctrl && lk === 'z') return handled(), undoPanes(e.shiftKey);
        if (ctrl && lk === 'y') return act('autoY');
        if (ctrl && lk === 'g') return act('grid');
        if (!ctrl && !e.altKey) {
          switch (lk) {
            case 'z':
              return act(e.shiftKey ? 'zoomPrev' : 'zoomBox');
            case 'a':
              return act('addTrace');
            case 'p':
              return act('addPane');
            case 'b':
              return act('addPaneBelow');
            case 'u':
              return act('paneUp');
            case 'd':
              return act('paneDown');
            case 'Backspace':
              return act('removeTraces');
            case 'c':
              return act(e.shiftKey ? 'clearCursors' : 'cursor');
            case 's':
              if (!e.shiftKey) return;
              handled();
              if (allRuns.length > 1) setDialog({ kind: 'runs' });
              else setMessage('Este análisis no tiene varias corridas (.step)');
              return;
            case 'o':
              return handled(), pltInput.current?.click();
            case 'Escape':
              plotPanel.current?.action('cancel');
              return;
          }
          // el resto de las letras no van al esquemático
          if (k.length === 1) return;
        }
      }
      if (ctrl && lk === 'z') return handled(), e.shiftKey ? history.redo() : history.undo();
      if (ctrl && lk === 'y') return handled(), history.redo();
      if (ctrl && lk === 'r') return handled(), rotateOrMirror('rotate');
      if (ctrl && lk === 'e') return handled(), rotateOrMirror('mirror');
      if (ctrl && lk === 'c') return handled(), copySelection();
      if (ctrl && lk === 'x') return handled(), copySelection(true);
      if (ctrl && lk === 'v') return handled(), paste();
      if (ctrl && lk === 'a') return handled(), setTool({ kind: 'select' }), setSelection(allItems(doc));
      if (ctrl && lk === 'g') return handled(), setShowGrid((v) => !v);
      if (ctrl && lk === 'u') return handled(), setShowLoose((v) => !v);
      if (e.altKey && lk === 'c') return handled(), openControl();
      if (e.altKey && lk === 'n') return handled(), setShowNets((v) => !v);
      if (e.altKey && lk === 'e') return handled(), openStudy();
      if (e.altKey) return;
      if (ctrl) return;
      if (lk === 'z') return handled(), e.shiftKey ? editor.current?.zoomPrev() : zoomBox();
      switch (k) {
        case 'Escape':
          plotPanel.current?.action('cancel');
          setTool({ kind: 'select' });
          setSelection([]);
          return;
        case 'a':
          return handled(), openSimulation();
        case 'F2':
        case 'p':
          return handled(), setDialog({ kind: 'picker' });
        case 'm':
          return handled(), startMove(false);
        case 'j':
          return handled(), setTool({ kind: 'shape', shape: 'LINE', start: null });
        case 'k':
          return handled(), setTool({ kind: 'shape', shape: 'RECTANGLE', start: null });
        case 'F3':
        case 'w':
          return handled(), setTool({ kind: 'wire', start: null });
        case 'F4':
        case 'n':
          return handled(), setDialog({ kind: 'flag' });
        case 'F5':
        case 'Delete':
        case 'Backspace':
          return handled(), deleteSelection();
        case 'F6':
          return handled(), duplicate();
        case '?':
          return handled(), setDialog({ kind: 'help' });
        case 'F7':
        case 'F8':
          return handled(), setTool({ kind: 'select' });
        case 'r':
          return setTool({ kind: 'place', type: 'res', orient: 'R0' });
        case 'c':
          return setTool({ kind: 'place', type: 'cap', orient: 'R0' });
        case 'l':
          return setTool({ kind: 'place', type: 'ind', orient: 'R0' });
        case 'd':
          return setTool({ kind: 'place', type: 'diode', orient: 'R0' });
        case 'v':
          return setTool({ kind: 'place', type: 'voltage', orient: 'R0' });
        case 'g':
          return setTool({ kind: 'flag', name: '0' });
        case 's':
          return handled(), startMove(true);
        case '.':
          return handled(), setDialog({ kind: 'text', textKind: 'directive' });
        case 't':
          return handled(), setDialog({ kind: 'text', textKind: 'comment' });
        case 'Home':
          return handled(), editor.current?.fit();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey || dialog || isTyping(e)) return;
      e.preventDefault();
      if (viewerKeys()) plotPanel.current?.action('fit');
      else if (area.current === 'schematic' && !editor.current?.spacePanned()) editor.current?.fit();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  // Arrastrar y soltar un .asc
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = async (e: DragEvent) => {
      e.preventDefault();
      const all = [...(e.dataTransfer?.files ?? [])];
      const f = all[0];
      if (f?.name.toLowerCase().endsWith('.plt')) return importPlt(new Uint8Array(await f.arrayBuffer()));
      // símbolos y modelos propios (un .asc suelto se abre; junto con otros archivos, es un bloque)
      const own = all.filter((x) => userFileKind(x.name) && (!/\.asc$/i.test(x.name) || all.length > 1));
      if (own.length && !(all.length === 1 && /\.asc$/i.test(f.name))) return addUserFiles(own);
      if (!f || !f.name.toLowerCase().endsWith('.asc') || !confirmDiscard()) return;
      const r = readAsc(new Uint8Array(await f.arrayBuffer()), f.name);
      loadDoc(r.doc, { name: r.name, encoding: r.encoding });
      remember(r.doc, { name: r.name, encoding: r.encoding });
      warnMissing(r.doc);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  });

  const running = status.kind === 'running';
  // Colapsar o mostrar el panel de resultados (#36): el resultado, las trazas, los cursores y la
  // vista se conservan; sólo se reemplazan al volver a simular o al abrir otro circuito
  const resultsShown = !!sim && expanded !== 'schematic';
  const toggleResultsPanel = () => setExpanded(toggleResults(expanded));
  const placeTool = (type: string) => () => setTool({ kind: 'place', type, orient: 'R0' });
  // Tipos de análisis: el elegido abre el menú de simulación en ese tipo. Marcado, el de la
  // directiva actual
  const currentAnalysis = useMemo(() => {
    const found = findAnalysis(doc);
    return found ? parseAnalysis(found.value)?.kind : undefined;
  }, [doc]);
  const analysisItems: MenuItem[] = ANALYSES.map((x) => ({
    label: x.label,
    title: x.help,
    onClick: () => openSimulation(x.kind),
    checked: x.kind === currentAnalysis,
  }));
  // Desplegable de la flecha de Simular: por ahora, los tipos de análisis (#38)
  const simItems: MenuItem[] = [...analysisItems, 'sep', { label: 'Comando de simulación…', shortcut: 'A', onClick: () => openSimulation() }];
  const menus: MenuDef[] = [
    {
      label: 'Archivo',
      items: [
        { label: 'Nuevo', onClick: doNew },
        { label: 'Abrir…', shortcut: 'Ctrl+O', onClick: doOpen },
        ...(google.account ? [{ label: 'Abrir de Google Drive…', onClick: () => setDialog({ kind: 'drive' }) }] : []),
        { label: google.account ? 'Guardar en Drive' : 'Guardar', shortcut: 'Ctrl+S', onClick: () => doSave(false) },
        { label: google.account ? 'Guardar en Drive como…' : 'Guardar como…', shortcut: 'Ctrl+Shift+S', onClick: () => doSave(true) },
        ...(google.account ? [{ label: 'Guardar en el equipo…', onClick: () => doSaveLocal(true) }] : []),
        'sep',
        { label: 'Compartir link…', onClick: doShare },
        { label: 'Mis símbolos y modelos…', onClick: () => setDialog({ kind: 'userfiles' }) },
        'sep',
        { label: 'Ejemplos', items: EXAMPLES.map((x) => ({ label: x.replace('.asc', ''), onClick: () => doExample(x) })) },
        {
          label: 'Recientes',
          items: recent.map((r, i) => ({
            label: `${r.name.replace(/\.asc$/i, '')}${r.unsaved ? ' (sin guardar)' : ''}`,
            title: new Date(r.time).toLocaleString(),
            onClick: () => doRecent(i),
          })),
        },
        'sep',
        { label: 'Exportar esquemático a SVG', onClick: () => exportImage('svg') },
        { label: 'Exportar esquemático a PNG', onClick: () => exportImage('png') },
        { label: 'Exportar netlist de LTspice (.net)', onClick: () => exportNetlist('net') },
        { label: 'Exportar netlist de ngspice (.cir)', onClick: () => exportNetlist('cir') },
      ],
    },
    {
      label: 'Editar',
      items: [
        { label: 'Deshacer', shortcut: 'Ctrl+Z', onClick: history.undo, disabled: !history.canUndo },
        { label: 'Rehacer', shortcut: 'Ctrl+Shift+Z', onClick: history.redo, disabled: !history.canRedo },
        'sep',
        { label: 'Cortar', shortcut: 'Ctrl+X', onClick: () => copySelection(true), disabled: !selection.length },
        { label: 'Copiar', shortcut: 'Ctrl+C', onClick: () => copySelection(), disabled: !selection.length },
        { label: 'Pegar', shortcut: 'Ctrl+V', onClick: paste },
        { label: 'Duplicar', shortcut: 'F6', onClick: duplicate, disabled: !selection.length },
        { label: 'Borrar', shortcut: 'Backspace', onClick: deleteSelection },
        { label: 'Seleccionar todo', shortcut: 'Ctrl+A', onClick: () => (setTool({ kind: 'select' }), setSelection(allItems(doc))) },
        'sep',
        { label: 'Rotar', shortcut: 'Ctrl+R', onClick: () => rotateOrMirror('rotate') },
        { label: 'Espejar', shortcut: 'Ctrl+E', onClick: () => rotateOrMirror('mirror') },
        'sep',
        { label: 'Mover (sin estirar cables)', shortcut: 'M', onClick: () => startMove(false) },
        { label: 'Arrastrar (estirando cables)', shortcut: 'S', onClick: () => startMove(true) },
      ],
    },
    {
      label: 'Dibujar',
      items: [
        { label: 'Cable', shortcut: 'W', onClick: () => setTool({ kind: 'wire', start: null }) },
        { label: 'Componente…', shortcut: 'P', onClick: () => setDialog({ kind: 'picker' }) },
        { label: 'Resistencia', shortcut: 'R', onClick: placeTool('res') },
        { label: 'Capacitor', shortcut: 'C', onClick: placeTool('cap') },
        { label: 'Inductor', shortcut: 'L', onClick: placeTool('ind') },
        { label: 'Diodo', shortcut: 'D', onClick: placeTool('diode') },
        { label: 'Fuente de tensión', shortcut: 'V', onClick: placeTool('voltage') },
        { label: 'Tierra', shortcut: 'G', onClick: () => setTool({ kind: 'flag', name: '0' }) },
        { label: 'Etiqueta de red…', shortcut: 'N', onClick: () => setDialog({ kind: 'flag' }) },
        'sep',
        { label: 'Directiva SPICE…', shortcut: '.', onClick: () => setDialog({ kind: 'text', textKind: 'directive' }) },
        { label: 'Comentario…', shortcut: 'T', onClick: () => setDialog({ kind: 'text', textKind: 'comment' }) },
        { label: 'Línea', shortcut: 'J', onClick: () => setTool({ kind: 'shape', shape: 'LINE', start: null }) },
        { label: 'Rectángulo', shortcut: 'K', onClick: () => setTool({ kind: 'shape', shape: 'RECTANGLE', start: null }) },
      ],
    },
    {
      label: 'Simular',
      items: [
        { label: 'Simular', shortcut: 'Alt+R', onClick: run, disabled: running || status.kind === 'loading' },
        { label: 'Abortar', shortcut: 'Alt+S', onClick: abort, disabled: !running },
        { label: 'Ver el log', shortcut: 'Ctrl+L', onClick: showLog, disabled: !sim },
        'sep',
        { label: 'Tipo de simulación', items: analysisItems },
        { label: 'Comando de simulación…', shortcut: 'A', onClick: () => openSimulation() },
        { label: 'Estudio…', shortcut: 'Alt+E', onClick: openStudy },
        { label: 'Bloque .control…', shortcut: 'Alt+C', onClick: openControl },
        'sep',
        { label: 'Punta de prueba', onClick: () => setTool({ kind: 'probe' }), disabled: !sim },
        { label: 'Anotar punto de operación', onClick: () => setShowOp((v) => !v), disabled: !bias, checked: showOp },
      ],
    },
    {
      label: 'Ver',
      items: [
        { label: 'Ajustar a la vista', shortcut: 'Espacio', onClick: () => editor.current?.fit() },
        { label: 'Zoom a un recuadro', shortcut: 'Z', onClick: zoomBox },
        { label: 'Zoom anterior', shortcut: 'Shift+Z', onClick: () => editor.current?.zoomPrev() },
        { label: 'Grilla', shortcut: 'Ctrl+G', onClick: () => setShowGrid((v) => !v), checked: showGrid },
        { label: 'Marcas de pines sueltos', shortcut: 'Ctrl+U', onClick: () => setShowLoose((v) => !v), checked: showLoose },
        { label: 'Nombres de las redes', shortcut: 'Alt+N', onClick: () => setShowNets((v) => !v), checked: showNets },
        {
          label: 'Resultados al costado',
          onClick: () => {
            lsSet('turbospice.resultsSide', resultsSide ? '0' : '1');
            setResultsSide(!resultsSide);
          },
          checked: resultsSide,
        },
        { label: 'Panel de resultados', shortcut: 'Ctrl+1 / Ctrl+0', onClick: toggleResultsPanel, disabled: !sim, checked: resultsShown },
        'sep',
        { label: 'Tema automático (del sistema)', onClick: () => setTheme('auto'), checked: theme === 'auto' },
        { label: 'Tema claro', onClick: () => setTheme('light'), checked: theme === 'light' },
        { label: 'Tema oscuro', onClick: () => setTheme('dark'), checked: theme === 'dark' },
      ],
    },
    {
      label: 'Ayuda',
      items: [
        { label: 'Atajos de teclado', shortcut: '?', onClick: () => setDialog({ kind: 'help' }) },
        { label: 'Bienvenida y ejemplos', onClick: () => setDialog({ kind: 'welcome' }) },
        'sep',
        { label: 'Compatibilidad con LTspice', onClick: () => window.open(`${REPO}/blob/main/docs/compatibilidad-ltspice.md`, '_blank', 'noopener') },
        { label: 'Reportar un problema', onClick: () => window.open(`${REPO}/issues`, '_blank', 'noopener') },
      ],
    },
  ];

  // Problemas de la última simulación: avisos de la traducción y errores de ngspice; los que
  // nombran un componente llevan a él
  const problems = sim
    ? [
        ...sim.result.errors.map((text) => ({ kind: 'err' as const, text })),
        ...sim.built.warnings.map((text) => ({ kind: 'warn' as const, text })),
      ].map((p) => {
        const name = /^([^\s:]+)/.exec(p.text)?.[1]?.toLowerCase();
        const el = name ? sim.built.lt.elements.find((e) => e.name.toLowerCase() === name || e.name.replace(/§/g, '').toLowerCase() === name) : undefined;
        return { ...p, sym: el?.sym };
      })
    : [];
  const goTo = (sym: number) => {
    const s = doc.symbols[sym];
    if (!s) return;
    setTool({ kind: 'select' });
    setSelection([{ kind: 'symbol', index: sym }]);
    editor.current?.centerOn(symbolBox(s, lib.symbol(s.type), lib));
  };
  const scale = plot ? scaleOf(plot) : null;
  // memoizadas: un arreglo nuevo en cada render recrearía los gráficos (y perdería clicks, #30)
  const allRuns = useMemo(() => (sim && plot ? sameRuns(sim.result.plots, plot) : []), [sim, plot]);
  // corridas que se muestran: todas (salvo las ocultas, Shift+S) al superponer, o sólo la elegida
  const visibleRuns = useMemo(() => allRuns.filter((r) => !hiddenRuns.has(r.name)), [allRuns, hiddenRuns]);
  const runs = useMemo(() => (plot ? (overlay && visibleRuns.length ? visibleRuns : [plot]) : []), [overlay, visibleRuns, plot]);
  const labels = useMemo(() => (sim ? stepLabels(sim.result.plots, sim.built.ng.steps) : new Map<string, string>()), [sim]);
  const isComplex = plot?.vectors.some((v) => v.imag);
  // corridas de .pz (pz1…pzN con .step) y sus f₀ para marcar en el Bode
  const pzAll = useMemo(() => {
    const pzs = sim ? sim.result.plots.filter(isPzPlot) : [];
    return pzs.length ? pzRuns(sim!.result.plots, pzs[pzs.length - 1]) : [];
  }, [sim]);
  const pzShown = useMemo(() => (sim && plot && isPzPlot(plot) ? pzRuns(sim.result.plots, plot) : []), [sim, plot]);
  const marks = useMemo(() => pzMarks(pzRoots(pzAll)), [pzAll]);
  const withPz = !!pzAll.length && scale?.name.toLowerCase() === 'frequency';

  // Barra de herramientas (#38): archivo, historial, dibujo, edición, vista y análisis; si falta
  // lugar, los grupos de la derecha pasan al desplegable "Más herramientas"
  const toolGroups: ToolGroup[] = [
    {
      id: 'file',
      label: 'Archivo',
      tools: [
        { icon: 'new', label: 'Nuevo', title: 'Nuevo esquemático', onClick: doNew },
        { icon: 'save', label: 'Guardar', title: google.account ? 'Guardar en Google Drive' : 'Guardar', shortcut: 'Ctrl+S', onClick: () => doSave(false) },
        { icon: 'open', label: 'Abrir', title: 'Abrir .asc', shortcut: 'Ctrl+O', onClick: doOpen },
      ],
    },
    {
      id: 'history',
      label: 'Historial',
      tools: [
        { icon: 'undo', label: 'Deshacer', title: 'Deshacer', shortcut: 'Ctrl+Z', onClick: history.undo, disabled: !history.canUndo },
        { icon: 'redo', label: 'Rehacer', title: 'Rehacer', shortcut: 'Ctrl+Shift+Z', onClick: history.redo, disabled: !history.canRedo },
      ],
    },
    {
      id: 'draw',
      label: 'Dibujo',
      tools: [
        { icon: 'select', label: 'Seleccionar', title: 'Seleccionar y mover', shortcut: 'Esc', onClick: () => setTool({ kind: 'select' }), active: tool.kind === 'select' },
        { icon: 'wire', label: 'Cable', title: 'Cable', shortcut: 'F3 / W', onClick: () => setTool({ kind: 'wire', start: null }), active: tool.kind === 'wire' },
        { icon: 'component', label: 'Componente', title: 'Componente', shortcut: 'P / F2', onClick: () => setDialog({ kind: 'picker' }), active: tool.kind === 'place' },
        { icon: 'ground', label: 'Tierra', title: 'Tierra (GND)', shortcut: 'G', onClick: () => setTool({ kind: 'flag', name: '0' }), active: tool.kind === 'flag' && tool.name === '0' },
        { icon: 'label', label: 'Etiqueta', title: 'Etiqueta de red', shortcut: 'F4 / N', onClick: () => setDialog({ kind: 'flag' }) },
        { icon: 'text', label: 'Texto', title: 'Texto (comentario)', shortcut: 'T', onClick: () => setDialog({ kind: 'text', textKind: 'comment' }) },
        { icon: 'directive', label: 'Directiva', title: 'Directiva SPICE libre', shortcut: '.', onClick: () => setDialog({ kind: 'text', textKind: 'directive' }) },
      ],
    },
    {
      id: 'edit',
      label: 'Edición',
      tools: [
        { icon: 'rotate', label: 'Rotar', title: 'Rotar', shortcut: 'Ctrl+R', onClick: () => rotateOrMirror('rotate') },
        { icon: 'mirror', label: 'Espejar', title: 'Espejar', shortcut: 'Ctrl+E', onClick: () => rotateOrMirror('mirror') },
        { icon: 'delete', label: 'Borrar', title: 'Borrar', shortcut: 'F5 / Supr', onClick: deleteSelection, active: tool.kind === 'delete' },
      ],
    },
    {
      id: 'view',
      label: 'Vista',
      tools: [
        { icon: 'fit', label: 'Ajustar', title: 'Ajustar a la vista (Z: zoom a un recuadro, Shift+Z: zoom anterior)', shortcut: 'Espacio', onClick: () => editor.current?.fit() },
        { icon: 'nets', label: 'Redes', title: 'Mostrar los nombres de todas las redes, sin modificar el esquemático', shortcut: 'Alt+N', onClick: () => setShowNets((v) => !v), active: showNets },
      ],
    },
    {
      id: 'analysis',
      label: 'Análisis',
      tools: [
        { icon: 'study', label: 'Estudio…', title: 'Estudio: barridos, tolerancias, mediciones', shortcut: 'Alt+E', onClick: openStudy },
        { icon: 'control', label: '.control…', title: 'Bloque .control: scripts de ngspice', shortcut: 'Alt+C', onClick: openControl },
      ],
    },
  ];

  return (
    <div className="schematic-mode">
      {slots.menu && createPortal(<AppMenu menus={menus} />, slots.menu)}
      {slots.right &&
        createPortal(
          <>
            <span className="filename" title={file.name}>{file.name}{dirty ? ' •' : ''}</span>
            <button
              className="theme-btn"
              aria-label="Cambiar tema"
              title={`Tema: ${theme === 'auto' ? 'automático (del sistema)' : theme === 'light' ? 'claro' : 'oscuro'}`}
              onClick={() => setTheme(theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto')}
            >
              <Icon name={theme === 'dark' ? 'moon' : 'sun'} />
              {theme === 'auto' && <span className="auto">A</span>}
            </button>
            <button className="share-btn" aria-label="Compartir" title="Copiar un link que abre este circuito" onClick={doShare}>
              <Icon name="share" />
              <span className="txt">Compartir</span>
            </button>
          </>,
          slots.right,
        )}
      <Toolbar
        label="Herramientas"
        groups={toolGroups}
        fixed={
          <>
            {/* Simular partido: la acción principal simula y la flecha despliega los tipos de análisis */}
            <div className="split" role="group" aria-label="Simulación">
              {running ? (
                <button className="labeled" onClick={abort} aria-label="Abortar" title="Abortar la simulación (Alt+S)">
                  <Icon name="stop" /> Abortar
                </button>
              ) : (
                <button className="primary" onClick={run} disabled={status.kind === 'loading'} aria-label="Simular" aria-keyshortcuts="Alt+R Control+Enter" title="Simular (Alt+R / Ctrl+Enter)">
                  <Icon name="run" /> Simular
                </button>
              )}
              <MenuButton items={simItems} label="Tipo de simulación" title="Tipo de simulación y parámetros (A)" className={running ? 'labeled' : 'primary'}>
                <Icon name="caret" size={14} />
              </MenuButton>
            </div>
            {sim && (
              <button className={tool.kind === 'probe' ? 'active' : ''} aria-label="Medir" title="Punta de prueba: click en un cable (tensión) o componente (corriente)" onClick={() => setTool({ kind: 'probe' })}>
                <Icon name="probe" />
              </button>
            )}
            {bias && (
              <button className={showOp ? 'active' : ''} aria-label="Anotar OP" title="Anotar el punto de operación en el esquemático (sin modificarlo)" onClick={() => setShowOp((v) => !v)}>
                <Icon name="op" />
              </button>
            )}
            {sim && (
              <button
                className={`labeled${resultsShown ? ' active' : ''}`}
                onClick={toggleResultsPanel}
                aria-label="Panel de resultados"
                aria-pressed={resultsShown}
                title={resultsShown ? 'Ocultar el panel de resultados (no se pierden)' : 'Mostrar el panel de resultados'}
              >
                <Icon name="results" /> <span className="txt">Resultados</span>
              </button>
            )}
          </>
        }
        after={<StatusText status={status} />}
      />

      <div className={`workspace${resultsSide ? ' side' : ''}${sim && expanded ? ` expand-${expanded}` : ''}`}>
        <div className="canvas-wrap">
          <SchematicEditor
            handle={editor}
            docKey={docKey}
            doc={doc}
            lib={lib}
            conn={conn}
            commit={commit}
            tool={tool}
            setTool={setTool}
            selection={selection}
            setSelection={setSelection}
            onEdit={editItem}
            onEditLabel={(index, label) => setDialog({ kind: 'attrs', index, label })}
            onProbe={onProbe}
            highlightNet={traceNet}
            netNames={shownNets}
            onNameNet={(at) => setDialog({ kind: 'flag', at })}
            describe={describe}
            annotations={annotations}
            currentArrows={arrows}
            pickValue={pickValue}
            onPicked={endPick}
            showGrid={showGrid}
            showLoose={showLoose}
          />
          {picking && (
            <div className="pick-banner">
              {picking.what === 'net' ? 'Elegí una red en el esquemático' : picking.what === 'source' ? 'Elegí una fuente (V o I) en el esquemático' : 'Elegí un componente en el esquemático'}
              <button onClick={() => endPick(null)}>Cancelar</button>
            </div>
          )}
          {offerView && !picking && (
            <div className="pick-banner">
              Hay una vista de resultados de {file.name} guardada en este navegador. ¿Incorporarla al .asc?
              <button onClick={acceptOfferedView}>Incorporar</button>
              <button onClick={() => setOfferView(null)}>No</button>
            </div>
          )}
          {message && (
            <div className="toast" onClick={() => setMessage(undefined)}>
              {message}
            </div>
          )}
          <div className="hint-bar">{toolHint(tool)}</div>
        </div>

        {sim && (
          <ResultsSplitter side={resultsSide} sizeKey={sizeKey} setSize={setResultsH} expanded={expanded} setExpanded={setExpanded} />
        )}
        {sim && (
          <section className="results-panel" style={resultsH ? { flexBasis: resultsH } : undefined}>
            <input
              ref={pltInput}
              type="file"
              accept=".plt"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) importPlt(new Uint8Array(await f.arrayBuffer()));
                e.target.value = '';
              }}
            />
            <div className="toolbar small">
              <nav className="tabs">
                <button className={panel === 'plot' ? 'active' : ''} onClick={() => setPanel('plot')}>Resultados</button>
                <button className={panel === 'netlist' ? 'active' : ''} onClick={() => setPanel('netlist')}>Netlist</button>
                {sim.meas && (
                  <button className={panel === 'meas' ? 'active' : ''} onClick={() => setPanel('meas')}>
                    Mediciones ({sim.meas.names.length})
                  </button>
                )}
                <button className={panel === 'problems' ? 'active' : ''} onClick={() => setPanel('problems')}>
                  Problemas{problems.length ? ` (${problems.length})` : ''}
                </button>
                <button className={panel === 'log' ? 'active' : ''} onClick={() => setPanel('log')} title="Log de ngspice (Ctrl+L)">
                  Log
                </button>
              </nav>
              {panel === 'plot' && (
                <>
                  <select value={plotName} onChange={(e) => selectPlot(e.target.value)} aria-label="Plot">
                    {sim.result.plots.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                        {labels.has(p.name) ? ` (${labels.get(p.name)})` : ''}
                      </option>
                    ))}
                  </select>
                  {isComplex && scale && (
                    <select value={mode} onChange={(e) => setMode(e.target.value as ComplexMode)} aria-label="Vista">
                      <option value="bode">Bode (dB y fase)</option>
                      <option value="db">Magnitud (dB)</option>
                      <option value="phase">Fase (°)</option>
                      <option value="mag">Magnitud</option>
                      <option value="reim">Real e imaginaria</option>
                      <option value="smith">Carta de Smith</option>
                    </select>
                  )}
                  {withPz && (
                    <label className="check inline" title="Mapa de polos y ceros (.pz) al lado del gráfico; sus f₀ se marcan en el eje">
                      <input type="checkbox" checked={pzSide} onChange={(e) => setPzSide(e.target.checked)} /> Polos y ceros
                    </label>
                  )}
                  {allRuns.length > 1 && (
                    <label className="check inline">
                      <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} /> Superponer las{' '}
                      {allRuns.length} corridas
                    </label>
                  )}
                  {allRuns.length > 1 && overlay && (
                    <button onClick={() => setDialog({ kind: 'runs' })} title="Elegir qué corridas mostrar (Shift+S)">
                      Corridas{hiddenRuns.size ? ` (${visibleRuns.length}/${allRuns.length})` : ''}…
                    </button>
                  )}
                  {scale && (
                    <>
                      {plot && plotView[plotKind(plot.name)] ? (
                        <button className="active" onClick={forgetView} title="Esta vista se reaplica en cada simulación. Click para olvidarla">
                          Vista recordada ✓
                        </button>
                      ) : (
                        <button onClick={rememberView} title="Reaplicar estas trazas, paneles y colores en cada simulación (Ctrl+Espacio la vuelve a aplicar)">Recordar vista</button>
                      )}
                      <select
                        aria-label="Exportar resultados"
                        value=""
                        onChange={async (e) => {
                          const v = e.target.value;
                          const base = file.name.replace(/\.asc$/i, '');
                          if (v === 'csv') download(`${base}.csv`, new Blob([plotPanel.current?.csv() ?? ''], { type: 'text/csv' }));
                          if (v === 'png') {
                            const b = await plotPanel.current?.png();
                            if (b) download(`${base}.png`, b);
                          }
                          if (v === 'plt') exportPlt();
                          if (v === 'plt-in') pltInput.current?.click();
                        }}
                      >
                        <option value="">Exportar…</option>
                        <option value="csv">Trazas a CSV</option>
                        <option value="png">Gráfico a PNG</option>
                        <option value="plt">Vista a .plt (LTspice)</option>
                        <option value="plt-in">Importar vista .plt…</option>
                      </select>
                    </>
                  )}
                </>
              )}
              {panel === 'netlist' && (
                <>
                  <button onClick={() => download(file.name.replace(/\.asc$/i, '') + '.cir', new Blob([sim.built.netlist], { type: 'text/plain' }))}>
                    Descargar .cir (ngspice)
                  </button>
                  <button
                    onClick={() =>
                      download(file.name.replace(/\.asc$/i, '') + '.net', new Blob([`* ${file.name}\n${ltNetlistText(sim.built.lt)}\n`], { type: 'text/plain' }))
                    }
                  >
                    Descargar .net (LTspice)
                  </button>
                </>
              )}
              <button className="close" onClick={() => setExpanded('schematic')} aria-label="Ocultar resultados" title="Ocultar resultados (Ctrl+1)">
                {resultsSide ? '▶' : '▼'}
              </button>
            </div>
            <div className="results-body">
              {panel === 'plot' && plot && scale && isComplex && mode === 'smith' && <SmithChart plot={plot} panes={panes} resolver={resolver} />}
              {panel === 'plot' && plot && scale && !(isComplex && mode === 'smith') && (
                <PlotPanel
                  handle={plotPanel}
                  plot={plot}
                  runs={runs}
                  labels={labels}
                  panes={panes}
                  setPanes={editPanes}
                  resolver={resolver}
                  mode={mode}
                  active={activePane}
                  setActive={setActivePane}
                  onFft={doFft}
                  marks={withPz && pzSide ? marks : undefined}
                  onHoverExpr={(e) => {
                    const net = e && /^\s*V\(([^,()]+)\)\s*$/i.exec(e)?.[1];
                    setTraceNet(net ? conn.nets.find((n) => n.name.toLowerCase() === net.toLowerCase())?.name : undefined);
                  }}
                />
              )}
              {panel === 'plot' && plot && scale && withPz && pzSide && mode !== 'smith' && (
                <PzPlane runs={pzAll} labels={labels} name={file.name.replace(/\.asc$/i, '')} compact />
              )}
              {panel === 'plot' && plot && !scale &&
                (pzShown.length ? <PzPlane runs={pzShown} labels={labels} name={file.name.replace(/\.asc$/i, '')} /> : <ResultTable plot={plot} />)}
              {panel === 'netlist' && <pre className="code">{sim.built.netlist}</pre>}
              {panel === 'log' && <pre className="code">{sim.result.log.join('\n')}</pre>}
              {panel === 'meas' && sim.meas && <MeasPanel table={sim.meas} />}
              {panel === 'problems' &&
                (problems.length ? (
                  <ul className="problems">
                    {problems.map((p, i) => (
                      <li key={i}>
                        <span className={`kind ${p.kind}`}>{p.kind === 'err' ? 'error' : 'aviso'}</span>
                        <span>{p.text}</span>
                        {p.sym !== undefined && (
                          <button className="link" onClick={() => goTo(p.sym!)}>
                            ver en el esquemático
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty pad">Sin problemas.</p>
                ))}
            </div>
          </section>
        )}
      </div>

      {dialog?.kind === 'picker' && (
        <ComponentPicker
          lib={lib}
          onClose={() => setDialog(null)}
          onPick={(type) => {
            setDialog(null);
            // los símbolos del usuario se referencian por nombre, como los de junto al .asc en LTspice
            setTool({ kind: 'place', type: type.startsWith(`${USER_DIR}/`) ? type.slice(USER_DIR.length + 1) : type, orient: 'R0' });
          }}
        />
      )}
      {dialog?.kind === 'attrs' && doc.symbols[dialog.index] && (
        <AttributeDialog
          inst={doc.symbols[dialog.index]}
          def={lib.symbol(doc.symbols[dialog.index].type)}
          windowDefaults={lib.windowDefaults}
          focusLabel={dialog.label}
          onClose={() => setDialog(null)}
          onApply={(attrs, labels, toSelection) => {
            setDialog(null);
            let d = Object.keys(attrs).length ? setSymbolAttrs(doc, dialog.index, attrs) : doc;
            const syms = toSelection ? [dialog.index, ...selection.filter((r) => r.kind === 'symbol' && r.index !== dialog.index).map((r) => r.index)] : [dialog.index];
            d = patchLabels(d, syms, labels, lib);
            if (d !== doc) commit(d);
          }}
        />
      )}
      {dialog?.kind === 'text' && (
        <TextDialog
          initial={dialog.index !== undefined ? doc.texts[dialog.index].text : ''}
          kind={dialog.textKind}
          onClose={() => setDialog(null)}
          onApply={(text, kind) => {
            setDialog(null);
            if (dialog.index !== undefined) commit(setText(doc, dialog.index, { text, kind }));
            else setTool({ kind: 'text', text, textKind: kind });
          }}
        />
      )}
      {dialog?.kind === 'sim' && (
        <SimulationDialog
          initial={dialog.found?.value ?? null}
          analysis={dialog.analysis}
          info={circuitInfo()}
          picker={picker}
          hidden={!!picking}
          onClose={() => setDialog(null)}
          onApply={(line, ngspiceOnly) => {
            setDialog(null);
            if (dialog.found) commit(replaceAnalysis(doc, dialog.found, line, ngspiceOnly));
            else setTool({ kind: 'text', text: line, textKind: ngspiceOnly ? 'comment' : 'directive' });
          }}
        />
      )}
      {dialog?.kind === 'control' && (
        <ControlDialog
          initial={dialog.index >= 0 ? controlBody(doc.texts[dialog.index].text.split('\\n').join('\n')) : 'run\n'}
          picker={picker}
          hidden={!!picking}
          onClose={() => setDialog(null)}
          onRemove={
            dialog.index >= 0
              ? () => {
                  setDialog(null);
                  commit(deleteItems(doc, [{ kind: 'text', index: dialog.index }]));
                }
              : undefined
          }
          onApply={(body) => {
            setDialog(null);
            // En el archivo los saltos de línea son "\n" literales; se guarda como comentario
            const text = controlBlock(body).split('\n').join('\\n');
            if (dialog.index >= 0) commit(setText(doc, dialog.index, { text, kind: 'comment' }));
            else setTool({ kind: 'text', text, textKind: 'comment' });
          }}
        />
      )}
      {dialog?.kind === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === 'runs' && (
        <RunsDialog
          runs={allRuns.map((r) => ({ name: r.name, label: labels.get(r.name) ?? r.name }))}
          hidden={hiddenRuns}
          onClose={() => setDialog(null)}
          onApply={(h) => {
            setDialog(null);
            setHiddenRuns(h);
            setOverlay(true);
          }}
        />
      )}
      {dialog?.kind === 'study' && (
        <StudyPanel
          initial={studyFromDoc(doc, lib)}
          info={studyInfo()}
          picker={picker}
          hidden={!!picking}
          onClose={() => setDialog(null)}
          onApply={(st) => {
            setDialog(null);
            commit(applyStudy(doc, lib, st));
          }}
          onApplyCode={(code) => {
            setDialog(null);
            commit(applyStudyCode(doc, lib, code));
          }}
        />
      )}
      {dialog?.kind === 'userfiles' && (
        <UserFilesDialog
          files={userFileInfo()}
          hasSymbol={(n) => !!lib.symbol(n)}
          onAdd={addUserFiles}
          onRemove={removeUserFile}
          onMakeSymbol={makeUserSymbol}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'welcome' && (
        <WelcomeDialog
          examples={EXAMPLES}
          onClose={() => {
            lsSet('turbospice.welcomed', '1');
            setDialog(null);
          }}
          onHelp={() => setDialog({ kind: 'help' })}
          onExample={(x) => {
            lsSet('turbospice.welcomed', '1');
            setDialog(null);
            doExample(x);
          }}
        />
      )}
      {dialog?.kind === 'drive' && <DriveDialog onOpen={openDriveFile} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'share' && (
        <ShareDialog
          url={dialog.url}
          onClose={() => setDialog(null)}
          onDownload={() => {
            setDialog(null);
            doSave(true);
          }}
        />
      )}
      {dialog?.kind === 'flag' && (
        <FlagDialog
          initial={dialog.index !== undefined ? doc.flags[dialog.index].name : ''}
          onClose={() => setDialog(null)}
          onApply={(name) => {
            setDialog(null);
            if (dialog.index !== undefined) commit(setFlagName(doc, dialog.index, name));
            else if (dialog.at) commit(addFlag(doc, dialog.at, name));
            else setTool({ kind: 'flag', name });
          }}
        />
      )}
    </div>
  );
}

function toolHint(t: Tool): string {
  switch (t.kind) {
    case 'select':
      return 'Click para seleccionar · arrastrar para mover (Ctrl: sin arrastrar cables; en un cable o codo: en línea recta) · doble click para editar (en un cable: agrega o quita un codo) · rueda: zoom · botón medio o Espacio+arrastrar: desplazar · Espacio: ajustar';
    case 'wire':
      return t.start ? 'Click para fijar el tramo (Ctrl: en línea recta) · click derecho o Esc para terminar' : 'Click para empezar el cable';
    case 'place':
      return `Colocando ${t.type} · Ctrl+R rotar · Ctrl+E espejar · Esc para terminar`;
    case 'flag':
      return t.name === '0' ? 'Click para colocar tierra · Esc para terminar' : `Click para colocar la etiqueta "${t.name}"`;
    case 'text':
      return 'Click para ubicar el texto';
    case 'delete':
      return 'Click en un elemento para borrarlo · Esc para terminar';
    case 'probe':
      return 'Click en un cable para ver su tensión o en un componente para su corriente · Esc para editar';
    case 'move':
      return t.refs
        ? `Click para soltar${t.stretch ? ' (los cables se estiran)' : ''} · click derecho o Esc cancela`
        : `${t.stretch ? 'Arrastrar (los cables se estiran)' : 'Mover (sin estirar cables)'}: click en un elemento o recuadro para elegir · Esc para terminar`;
    case 'shape':
      return t.start ? 'Click para terminar · click derecho cancela' : `Click para empezar ${t.shape === 'LINE' ? 'la línea' : 'el rectángulo'} · Esc para terminar`;
    case 'zoom':
      return 'Arrastrá un recuadro para hacer zoom (click: acercar) · Shift+Z: zoom anterior';
    case 'pick':
      return t.what === 'net' ? 'Click en un cable o pin para elegir su red · Esc cancela' : t.what === 'source' ? 'Click en una fuente V o I para elegirla · Esc cancela' : 'Click en un componente para elegirlo · Esc cancela';
  }
}
