// TurboSpice: editor de esquemáticos .asc (compatible con LTspice) + simulación con ngspice.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { baseName, emptyDoc, type AscDoc, type SymbolInst } from './asc/model.ts';
import { EngineClient } from './engine/client.ts';
import type { SimPlot, SimResult } from './engine/ngspice.ts';
import { Library, USER_DIR, scanModels, type LibraryBundle } from './library/library.ts';
import { ltNetlist, ltNetlistText } from './netlist/ltnetlist.ts';
import { netNames, type Annotation } from './schematic/NetNames.tsx';
import { currentArrows } from './schematic/currentArrows.tsx';
import { biasParams, elementBias, netBias, sameCircuit, type Bias } from './sim/bias.ts';
import { symbolBox, visibleText } from './schematic/geometry.ts';
import type { Point, ShapeKind } from './asc/model.ts';
import type { Status } from './NetlistMode.tsx';
import { isPzPlot, PzPlane, pzRuns, ResultTable } from './waveform/ScalarViews.tsx';
import { pzMarks, pzRoots } from './waveform/pz.ts';
import { SmithChart } from './waveform/SmithChart.tsx';
import { NetlistMode } from './NetlistMode.tsx';
import { AttributeDialog, ComponentPicker, FlagDialog, HelpDialog, LineStyleDialog, RunsDialog, ShareDialog, TextDialog, UserFilesDialog, AboutDialog, type UserFileInfo } from './schematic/dialogs.tsx';
import { SourceDialog } from './schematic/SourceDialog.tsx';
import type { PartGroup } from './schematic/PartTable.tsx';
import { cmpChoicesFor } from './library/cmp.ts';
import { makeSymbol, schematicPorts, subcktPins } from './library/makeSymbol.ts';
import { AppMenu, MenuButton, type MenuDef, type MenuItem } from './ui/Menu.tsx';
import { Icon } from './ui/icons.tsx';
import { Toolbar, type ToolGroup } from './ui/Toolbar.tsx';
import { readShareHash, shareHash } from './schematic/share.ts';
import { importLtspiceLibrary, loadLtspiceIndex, prefetchLtspice, removeLtspiceLibrary, type LtspiceIndex } from './library/ltspiceLib.ts';
import { addRecent, dropResult, loadProjectSession, loadRecent, loadResult, loadUserFiles, readHandle, saveProjectSession, saveResult, saveUserFiles, type RecentFile, type UserFile } from './schematic/autosave.ts';
import { parseAsc } from './asc/parse.ts';
import { serializeAsc } from './asc/serialize.ts';
import { ControlDialog, SimulationDialog, type CircuitInfo, type Picker, type PickWhat } from './schematic/simDialogs.tsx';
import { findAnalysis, findControl, removeAnalysis, replaceAnalysis, replaceLine, setAnalysisLine, type FoundLine } from './schematic/directivesEdit.ts';
import { controlBlock, controlBody } from './sim/controlSnippets.ts';
import { ANALYSES, ANALYSIS_LINE, type AnalysisKind } from './sim/analyses.ts';
import { activeSim, defaultLine, keepResult, MAX_SIMS, simName, type SimList, type SimView } from './sim/simList.ts';
import {
  activeAsc,
  addSim as addProjectSim,
  applyValues,
  blankVariant,
  cloneVariant,
  duplicateSim as duplicateProjectSim,
  removeVariant,
  renameVariant,
  selectVariant,
  lineOf,
  recordRun,
  removeSim as removeProjectSim,
  renameSim as renameProjectSim,
  selectSim as selectProjectSim,
  setSimAsc,
  simOf,
  simsWithValue,
  storeActive,
  valueChanges,
  variantOf,
  type ValueChange,
} from './project/project.ts';
import { EXT, isTurboText, newProject, parseTurbo, projectFromAsc, projectName, serializeTurbo, type Project } from './project/turbo.ts';
import { SlideConfirm } from './ui/SlideConfirm.tsx';
import { ProjectCapsule } from './project/ProjectCapsule.tsx';
import { HistoryPanel } from './project/HistoryPanel.tsx';
import { diffCircuits } from './project/diff.ts';
import { SimBar } from './schematic/SimBar.tsx';
import { isControlBlock } from './netlist/directives.ts';
import { effectiveAttrs } from './asc/resolve.ts';
import { addFlag, allItems, dcSourcesAsCell, deleteItems, duplicateItems, extractItems, pasteItems, patchLabels, setFlagName, setShapeStyle, setSymbolAttrs, setSymbolType, setText, transformItems } from './schematic/edit.ts';
import { ascBytes, openProjectFile, pickAscFiles, readAsc, saveFile } from './schematic/fileio.ts';
import type { ItemRef } from './schematic/geometry.ts';
import { SchematicEditor, type EditorHandle, type Tool } from './schematic/SchematicEditor.tsx';
import { useHistory, type History } from './schematic/useHistory.ts';
import { mirrorX, rotateCW } from './asc/transform.ts';
import { buildSimulation, type BuiltSimulation } from './sim/schematicSim.ts';
import { PlotPanel, type PlotAction, type PlotPanelHandle } from './waveform/PlotPanel.tsx';
import { spectrum, thd, type FftWindow } from './waveform/fft.ts';
import { displayName, sameRuns, scaleOf, si, stepLabels, stepSweepPlots } from './waveform/series.ts';
import { paneCurves, type ComplexMode } from './waveform/curves.ts';
import { TraceBox, type TraceBoxHandle } from './waveform/TraceBox.tsx';
import { evalTrace } from './waveform/expr.ts';
import { addTraceTo, asPlotView, colorize, emptyPanes, parsePlt, plotKind, sameExpr, serializePlt, traceColor, viewFromDoc, withView, type Pane, type PlotState, type PlotView } from './waveform/view.ts';
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
import { AccountButton, DriveDialog, importToDrive } from './cloud/AccountButton.tsx';
import { drive, useGoogle } from './cloud/google.ts';
import type { DriveFile } from './cloud/drive.ts';
import { Logo } from './ui/Logo.tsx';
import { hoverCoords, hoverInfo } from './schematic/hoverInfo.ts';

const BASE = import.meta.env.BASE_URL;
const REPO = 'https://github.com/TC-II/TurboSpice';
/** Conversor de .asc a PDF vectorial: recibe el circuito comprimido en el hash (#c=…&n=…) */
const PDF_TOOL = 'https://javierpetrucci.github.io/ASC-Parser/';
const EXAMPLES = ['Filtro RC.asc', 'Bode RLC.asc', 'Inversor OA_Ideal.asc', 'Rectificador.asc', 'Emisor común.asc', 'Barrido RC (.step).asc'];

type Dialog =
  | { kind: 'picker' }
  | { kind: 'attrs'; index: number; label?: number }
  | { kind: 'source'; index: number }
  | { kind: 'text'; index?: number; textKind: 'directive' | 'comment' }
  | { kind: 'flag'; index?: number; at?: Point }
  | { kind: 'sim'; found: FoundLine | null; analysis?: AnalysisKind }
  | { kind: 'control'; index: number }
  | { kind: 'share'; url: string }
  | { kind: 'help' }
  | { kind: 'userfiles' }
  | { kind: 'study' }
  | { kind: 'runs' }
  | { kind: 'about' }
  | { kind: 'drive' }
  /** borrar una simulación (con el control deslizante) */
  | { kind: 'deleteSim'; id: string }
  | { kind: 'deleteVariant'; id: string }
  /** estilo de línea para las figuras indicadas y las que se dibujen después */
  | { kind: 'lineStyle'; shapes: number[] };

/** Resultados de una simulación */
interface SimRun {
  built: BuiltSimulation;
  result: SimResult;
  doc: AscDoc;
  meas: MeasTable | null;
}

interface FileState {
  name: string;
  handle?: Parameters<typeof saveFile>[2];
  /** id del archivo en Google Drive (si se abrió o guardó ahí) */
  driveId?: string;
}

// Serialización cacheada por documento (el autoguardado y el cambio de simulación la usan seguido)
const ascCache = new WeakMap<AscDoc, string>();
const ascText = (d: AscDoc) => {
  let t = ascCache.get(d);
  if (t === undefined) ascCache.set(d, (t = serializeAsc(d)));
  return t;
};

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

/** Nombre de cada vista del panel de resultados (en el botón Resultados) */
const PANEL_NAMES = { plot: 'Gráfico', netlist: 'Netlist', log: 'Log', problems: 'Problemas', meas: 'Mediciones' } as const;

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

  // lugares de la barra superior que llena el modo esquemático: el menú (junto al nombre), las
  // vistas (esquemático, resultados y su disposición) y, arriba a la derecha, archivo, tema y
  // compartir (#38)
  const [menuSlot, setMenuSlot] = useState<HTMLElement | null>(null);
  const [tabsSlot, setTabsSlot] = useState<HTMLElement | null>(null);
  const [rightSlot, setRightSlot] = useState<HTMLElement | null>(null);

  return (
    <div className="app">
      <header className="appbar">
        <div className="appbar-slot" ref={setMenuSlot} />
        <h1><Logo /> <span><span className="logo">Turbo</span>Spice</span></h1>
        {mode === 'netlist' ? (
          <nav className="tabs">
            <button onClick={() => setMode('schematic')}>Esquemático</button>
            <button className="active">Netlist</button>
          </nav>
        ) : (
          <div className="appbar-slot" ref={setTabsSlot} />
        )}
        <div className="appbar-slot appbar-right" ref={setRightSlot} />
        {/* el usuario / login (#35), al final, después de Compartir */}
        <AccountButton />
      </header>
      {mode === 'netlist' && <NetlistMode engine={engine} />}
      {mode === 'schematic' &&
        (lib ? (
          <SchematicMode engine={engine} lib={lib} slots={{ menu: menuSlot, tabs: tabsSlot, right: rightSlot }} onNetlist={() => setMode('netlist')} />
        ) : (
          <p className="empty pad">{libError ?? 'Cargando librería…'}</p>
        ))}
    </div>
  );
}

function SchematicMode({ engine, lib, slots, onNetlist }: {
  engine: EngineClient;
  lib: Library;
  slots: { menu: HTMLElement | null; tabs: HTMLElement | null; right: HTMLElement | null };
  /** pasar al editor de netlist */
  onNetlist(): void;
}) {
  const history = useHistory<AscDoc>(emptyDoc());
  // el circuito que se edita; `doc` es el que se ve (otro mientras se mira una corrida vieja)
  const liveDoc = history.value;
  const docRef = useRef(liveDoc);
  docRef.current = liveDoc;
  const [file, setFile] = useState<FileState>({ name: `Sin título${EXT}` });
  // proyecto (.turbo, #149): variantes y simulaciones, cada una con su circuito. El que se está
  // editando vive en `history` y pasa al proyecto al cambiar de simulación o al guardar (snapshot)
  const [project, setProjectState] = useState<Project>(() => newProject('Sin título'));
  const projectRef = useRef(project);
  projectRef.current = project;
  const [dirty, setDirty] = useState(false);
  const editProject = (p: Project) => {
    setProjectState(p);
    setDirty(true);
  };
  // deshacer por simulación (#154): la pila de cada una mientras no se la ve
  const stacks = useRef(new Map<string, History<AscDoc>>());
  // el próximo cambio de `history` no es una edición (se abrió un archivo o se cambió de simulación)
  const quietDoc = useRef(true);
  useEffect(() => {
    if (quietDoc.current) quietDoc.current = false;
    else setDirty(true);
  }, [history.state]);
  const [tool, setToolState] = useState<Tool>({ kind: 'select' });
  const [selection, setSelection] = useState<ItemRef[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const google = useGoogle();
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [message, setMessage] = useState<string>();
  // resultados de la simulación que se está viendo
  const [sim, setSim] = useState<SimRun | null>(null);
  // lista de simulaciones de la variante (#39, #151) y resultados en memoria de las que no se
  // están viendo. El comando de la activa es el del esquemático
  const variant = variantOf(project);
  // Historial de corridas (#152): con una elegida, el esquemático la muestra en sólo lectura
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewRun, setViewRun] = useState('');
  const curRuns = useMemo(() => simOf(variant)?.runs ?? [], [variant]);
  const viewed = historyOpen && viewRun ? curRuns.find((r) => r.id === viewRun && !r.damaged) : undefined;
  const viewedDoc = useMemo(() => (viewed ? parseAsc(viewed.asc) : null), [viewed]);
  const doc = viewedDoc ?? liveDoc;
  const viewingRef = useRef(false);
  viewingRef.current = !!viewedDoc;
  /** la corrida anterior a la que se ve (o la última, para el actual) */
  const prevRun = (r?: (typeof curRuns)[number]) => curRuns.slice(0, r ? curRuns.indexOf(r) : curRuns.length).reverse().find((x) => !x.damaged);
  // cambios contra la corrida anterior (#153): resaltados en el esquemático
  const historyDiff = useMemo(() => {
    const prev = historyOpen ? prevRun(viewed) : undefined;
    return prev ? diffCircuits(parseAsc(prev.asc), doc) : undefined;
  }, [historyOpen, viewed, curRuns, doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const currentChanges = useMemo(() => {
    const last = historyOpen ? prevRun() : undefined;
    return last ? diffCircuits(parseAsc(last.asc), liveDoc).summary : undefined;
  }, [historyOpen, curRuns, liveDoc]); // eslint-disable-line react-hooks/exhaustive-deps
  const docLine = findAnalysis(doc)?.value ?? '';
  const sims = useMemo(
    (): SimList => ({
      items: variant.sims.map((s) => ({ id: s.id, ...(s.name ? { name: s.name } : {}), line: s.id === variant.activeSim ? docLine : lineOf(s.asc), ...(s.view ? { view: s.view } : {}) })),
      active: variant.activeSim,
    }),
    [variant, docLine],
  );
  const simsRef = useRef(sims);
  simsRef.current = sims;
  const kept = useRef(new Map<string, SimRun>());
  // zoom y cursores del visor (los avisa PlotPanel; se guardan con la simulación)
  const plotState = useRef<PlotState>();
  const [showOp, setShowOp] = useState(false);
  // último punto de operación calculado: sigue valiendo al elegir otra simulación de la lista
  // (aunque todavía no tenga resultados) mientras el circuito no cambie
  const [opPoint, setOpPoint] = useState<{ doc: AscDoc; built: BuiltSimulation; bias: Bias } | null>(null);
  const [panes, setPanesRaw] = useState<Pane[]>(emptyPanes);
  // cada traza con su color fijo: al quitar una, las demás no se recolorean
  const setPanes = useCallback((p: Pane[]) => setPanesRaw(colorize(p)), []);
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

  // archivos del usuario: al cambiar, la librería cambia (se recalcula la netlist y el dibujo)
  const [userFiles, setUserFiles] = useState<UserFile[]>([]);
  const [libVersion, setLibVersion] = useState(0);
  useEffect(() => {
    loadUserFiles().then(setUserFiles);
  }, []);
  // librería de la instalación de LTspice del usuario, importada a este navegador (ltspiceLib.ts):
  // cada esquemático trae de ahí sólo los símbolos y modelos que le faltan
  const [ltIndex, setLtIndex] = useState<LtspiceIndex>();
  const ltInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    loadLtspiceIndex().then(setLtIndex);
  }, []);
  useEffect(() => {
    if (!ltIndex) return;
    let alive = true;
    prefetchLtspice(doc, lib, ltIndex).then((n) => alive && n && setLibVersion((v) => v + 1));
    return () => {
      alive = false;
    };
  }, [doc, lib, ltIndex]);
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
  // estilo de línea de las figuras que se dibujen (Dibujar › Estilo de línea)
  const [shapeStyle, setShapeStyleState] = useState('');
  const shapeTool = (shape: ShapeKind) => () => setTool({ kind: 'shape', shape, pts: [], ...(shapeStyle ? { style: shapeStyle } : {}) });
  const openLineStyle = (shapes = selection.filter((r) => r.kind === 'shape').map((r) => r.index)) => setDialog({ kind: 'lineStyle', shapes });
  // Ctrl+G / Ctrl+U: grilla y marcas de pines sueltos
  const [showGrid, setShowGrid] = useState(true);
  // elemento bajo el mouse: la barra de estado muestra sus propiedades
  const [hover, setHover] = useState<{ ref: ItemRef | null; at: Point } | null>(null);
  const [showLoose, setShowLoose] = useState(true);
  // Ver › Mostrar el comando de simulación (oculto por defecto: se configura en la barra de Simular)
  const [showSimCommand, setShowSimCommand] = useState(() => lsGet('turbospice.showSimCommand') === '1');
  const toggleSimCommand = () =>
    setShowSimCommand((v) => {
      lsSet('turbospice.showSimCommand', v ? '0' : '1');
      return !v;
    });
  /** Ctrl+A: todo lo que se ve (no el comando de simulación oculto) */
  const selectAll = () => setSelection(allItems(doc).filter((r) => r.kind !== 'text' || visibleText(doc.texts[r.index], showSimCommand)));
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
  // «R1 = 1k también en 3 simulaciones · Aplicar» (#151): al cambiar el valor de un componente
  // que está igual en otras simulaciones de la variante
  const [valueOffer, setValueOffer] = useState<{ changes: ValueChange[]; sims: string[] } | null>(null);
  const offerValues = useRef<(prev: AscDoc, next: AscDoc) => void>();
  offerValues.current = (prev, next) => {
    const changes = sims.active ? valueChanges(prev, next) : [];
    const v = variantOf(projectRef.current);
    const ids = [...new Set(changes.flatMap((c) => simsWithValue(v, c)))];
    setValueOffer(ids.length ? { changes, sims: ids } : null);
  };
  const commit = useCallback(
    (next: AscDoc) => {
      if (viewingRef.current) return setMessage('Es una corrida anterior (sólo lectura): Restore la trae al presente');
      offerValues.current?.(docRef.current, next);
      history.commit(next);
    },
    [history.commit],
  );

  useEffect(() => {
    engine.ready.then(
      () => setStatus({ kind: 'idle' }),
      (e: Error) => setStatus({ kind: 'error', message: e.message }),
    );
  }, [engine]);

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
  const loadProject = (p: Project, f: FileState) => {
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

  const [recent, setRecent] = useState<RecentFile[]>([]);
  const remember = useCallback((p: Project, f: FileState, unsaved = false) => {
    serializeTurbo(p)
      .then((turbo) => addRecent({ name: f.name, asc: turbo, turbo: true, handle: f.handle, driveId: f.driveId, time: Date.now(), unsaved }))
      .then(setRecent);
  }, []);

  /** Abre los bytes de un .turbo o de un .asc (`at`: dónde está el archivo, si es un .turbo) */
  const openBytes = async (bytes: Uint8Array, name: string, at: Pick<FileState, 'handle' | 'driveId'> = {}) => {
    const utf8 = new TextDecoder().decode(bytes);
    if (/\.turbo$/i.test(name) || isTurboText(utf8)) {
      const { project: p, warnings } = await parseTurbo(utf8);
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
    remember(loadDoc(d, f.name), { name: `${projectName(f.name)}${EXT}` });
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
      const session = await loadProjectSession();
      if (await openShared()) {
        // el trabajo sin guardar anterior queda en recientes
        if (session?.dirty) addRecent({ name: session.name, asc: session.turbo, turbo: true, time: session.time, unsaved: true }).then(setRecent);
        return;
      }
      if (touched.current) return;
      if (session) {
        try {
          const { project: p, warnings } = await parseTurbo(session.turbo);
          if (touched.current) return;
          loadProject(p, { name: session.name, handle: session.handle as FileState['handle'], driveId: session.driveId });
          setDirty(session.dirty);
          const notes = [...(session.dirty ? [`Se recuperó el trabajo sin guardar (${new Date(session.time).toLocaleString()})`] : []), ...warnings];
          if (notes.length) setMessage(notes.join(' · '));
          return;
        } catch {
          // sesión ilegible: seguir con el ejemplo
        }
      }
      const b = await (await fetch(`${BASE}examples/${encodeURIComponent(EXAMPLES[0])}`)).arrayBuffer();
      if (touched.current) return;
      loadDoc(readAsc(new Uint8Array(b), EXAMPLES[0]).doc, EXAMPLES[0]);
    })()
      .catch(() => {})
      .finally(() => setRestored(true));
  }, []); // sólo al montar

  // Autoguardado del proyecto entero en el navegador, un momento después de cada cambio (las
  // pilas de deshacer no se guardan, #154)
  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => {
      serializeTurbo(snapshot()).then((turbo) =>
        saveProjectSession({ name: file.name, handle: file.handle, driveId: file.driveId, turbo, dirty, time: Date.now() }),
      );
    }, 600);
    return () => clearTimeout(t);
  }, [restored, history.state, project, file, dirty, panes, activePane, plotName, mode]);

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

  // Con la sesión de Google iniciada, Abrir muestra "Mis simulaciones" (la carpeta del Drive);
  // los archivos del equipo entran con Importar. Sin sesión, abre un .asc del equipo.
  const doOpen = () => (google.account ? setDialog({ kind: 'drive' }) : doOpenLocal());

  /** Importar .asc del equipo a la carpeta del Drive; uno solo se abre */
  const doImport = async (picked?: { name: string; bytes: Uint8Array }[]) => {
    const files = picked ?? (await pickAscFiles());
    if (!files.length) return;
    try {
      setMessage(files.length > 1 ? `Importando ${files.length} archivos a Google Drive…` : `Importando ${files[0].name} a Google Drive…`);
      const saved = await importToDrive(files);
      if (saved.length === 1) await openDriveFile(saved[0]);
      else setMessage(`Importados ${saved.length} archivos a «Mis simulaciones»`);
    } catch (e) {
      setMessage(`No se pudo importar: ${(e as Error).message}`);
    }
  };

  const doOpenLocal = async () => {
    if (!confirmDiscard()) return;
    try {
      const f = await openProjectFile();
      // el handle de un .asc no sirve para guardar el proyecto: se guarda aparte
      if (f) await openBytes(f.bytes, f.name, /\.turbo$/i.test(f.name) ? { handle: f.handle } : {});
    } catch (e) {
      setMessage(`No se pudo abrir: ${(e as Error).message}`);
    }
  };

  /** El proyecto con el circuito (y la vista) que se están editando: para el archivo o la sesión */
  const snapshot = (): Project => storeActive(projectRef.current, ascText(docRef.current), sims.active ? liveView() : undefined);

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
    setMessage(`Guardado${where}: ${saved.name}`);
  };

  /** Guardar en el equipo */
  const doSaveLocal = async (saveAs = false) => {
    const name = turboName(file.name);
    try {
      const { p, bytes } = await turboBytes(name);
      const r = await saveFile(bytes, name, file.handle, saveAs);
      if (r) savedAs({ ...file, name: r.name, handle: r.handle ?? file.handle }, p);
    } catch (e) {
      setMessage(`No se pudo guardar: ${(e as Error).message}`);
    }
  };

  /** Guardar en la carpeta TurboSpice del Drive: sobre el mismo archivo, o uno nuevo */
  const doSaveDrive = async (saveAs = false) => {
    let name = turboName(file.name);
    let id = saveAs ? undefined : file.driveId;
    if (!id && saveAs) {
      const n = window.prompt('Nombre del proyecto en Google Drive', projectName(name))?.trim();
      if (!n) return;
      name = turboName(n);
    }
    try {
      const { p, bytes } = await turboBytes(name);
      if (!id) {
        const same = (await drive.list()).find((f) => f.name.toLowerCase() === name.toLowerCase());
        if (same) {
          if (!window.confirm(`Ya hay un «${same.name}» en Google Drive. ¿Reemplazarlo?`)) return;
          id = same.id;
        }
      }
      const r = await drive.save(name, bytes, id);
      savedAs({ ...file, name: r.name, driveId: r.id }, p, ' en Google Drive');
    } catch (e) {
      setMessage(`No se pudo guardar en Google Drive: ${(e as Error).message}`);
    }
  };

  // Con la sesión de Google iniciada, Guardar va al Drive; si no, al equipo
  const doSave = (saveAs = false) => (google.account ? doSaveDrive(saveAs) : doSaveLocal(saveAs));

  const openDriveFile = async (d: DriveFile) => {
    if (!confirmDiscard()) return;
    try {
      const bytes = await drive.download(d.id);
      setDialog(null);
      await openBytes(bytes, d.name, /\.turbo$/i.test(d.name) ? { driveId: d.id } : {});
    } catch (e) {
      setMessage(`No se pudo abrir de Google Drive: ${(e as Error).message}`);
    }
  };

  // carpeta lib de LTspice (lib/sym, lib/sub, lib/cmp): de Analog Devices, no se redistribuye; queda
  // en el IndexedDB de este navegador y no se sube a ningún lado
  const doImportLtspice = async (files: File[]) => {
    try {
      setMessage('Importando la librería de LTspice…');
      const index = await importLtspiceLibrary(files, (done, total) => setMessage(`Importando la librería de LTspice: ${done} de ${total} archivos…`));
      setLtIndex(index);
      setMessage(`Librería de LTspice importada: ${index.count.symbols} símbolos y ${index.count.models} archivos de modelos. Queda sólo en este navegador.`);
    } catch (e) {
      setMessage(`No se pudo importar la librería de LTspice: ${(e as Error).message}`);
    }
  };
  const doRemoveLtspice = async () => {
    await removeLtspiceLibrary();
    setLtIndex(undefined);
    setMessage('Se quitó la librería de LTspice de este navegador (lo ya cargado se va al recargar la página)');
  };

  // el link y el PDF llevan el circuito que se está viendo, como .asc
  const ascName = () => `${project.name}.asc`;
  const doShare = async () => {
    const { bytes } = ascBytes(doc, lib);
    const hash = await shareHash(bytes, ascName());
    setDialog({ kind: 'share', url: `${location.origin}${location.pathname}#${hash}` });
  };

  // Exportar a PDF: abre ASC-Parser con el circuito en el hash (nunca viaja a un servidor)
  const doExportPdf = async () => {
    // la pestaña se abre ya, dentro del click, para que no la bloquee el navegador
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    const { bytes } = ascBytes(doc, lib);
    const hash = await shareHash(bytes, ascName());
    const url = `${PDF_TOOL}#${hash}`;
    if (tab) tab.location.href = url;
    else setMessage('El navegador bloqueó la pestaña nueva: permitila para exportar a PDF.');
  };

  const doRecent = async (i: number) => {
    const r = recent[i];
    if (!r || !confirmDiscard()) return;
    // el archivo en disco si se puede leer (puede haber cambiado); si no, la copia guardada
    const bytes = r.unsaved ? null : r.driveId && google.account ? await drive.download(r.driveId).catch(() => null) : await readHandle(r.handle);
    const at = { handle: r.handle as FileState['handle'], driveId: r.driveId };
    try {
      if (bytes) return await openBytes(bytes, r.name, at);
      // la copia guardada en recientes
      if (!r.turbo) return void remember(loadDoc(parseAsc(r.asc), r.name), { name: `${projectName(r.name)}${EXT}` });
      const { project: p, warnings } = await parseTurbo(r.asc);
      loadProject(p, { name: r.name, ...at });
      if (r.unsaved) setDirty(true);
      else remember(p, { name: r.name, ...at });
      if (warnings.length) setMessage(warnings.join(' · '));
    } catch (e) {
      setMessage(`No se pudo abrir: ${(e as Error).message}`);
    }
  };

  const doNew = () => confirmDiscard() && loadProject(newProject('Sin título'), { name: `Sin título${EXT}` });

  const doExample = async (name: string) => {
    if (!confirmDiscard()) return;
    const b = await (await fetch(`${BASE}examples/${encodeURIComponent(name)}`)).arrayBuffer();
    loadDoc(readAsc(new Uint8Array(b), name).doc, name);
  };

  const run = async () => {
    // se simula el circuito actual (aunque se esté mirando una corrida vieja)
    const doc = liveDoc;
    setViewRun('');
    setStatus({ kind: 'running', percent: 0, text: '' });
    setMessage(undefined);
    engine.onStatus = (text, percent) => setStatus({ kind: 'running', percent, text });
    // simulación de la lista a la que van los resultados
    const id = sims.active;
    // el circuito exacto que se simula queda en el historial de la simulación (#152)
    const simAsc = ascText(doc);
    if (id) {
      const last = prevRun();
      editProject(recordRun(snapshot(), id, simAsc, Date.now(), last ? diffCircuits(parseAsc(last.asc), doc).summary : undefined).project);
    }
    try {
      if (ltIndex) await prefetchLtspice(doc, lib, ltIndex);
      const built = await buildSimulation(doc, lib, ascName());
      // lo que no entra en memoria no llega a ngspice: sólo el error, en Problemas (#58)
      const tooBig = built.tooBig.map((p) => p.text);
      const { result, ms } = tooBig.length
        ? { result: { plots: [], log: tooBig, errors: tooBig, aborted: false }, ms: 0 }
        : await engine.simulate(built.netlist, built.files, { bias: biasParams(built) });
      if (result.bias) setOpPoint({ doc, built, bias: result.bias });
      result.plots.push(...stepSweepPlots(result.plots, built.ng.steps));
      // .meas: se evalúan sobre los resultados de cada corrida
      const meas = measureResults(built, result.plots, stepLabels(result.plots, built.ng.steps));
      const mp = meas && measSweepPlot(meas, built);
      if (mp) result.plots.push(mp);
      // gráficos x-y de un programa de bloques
      const xy = xyPlotsFromLog(result.log, built.ng.xyPlots);
      result.plots.push(...xy);
      // los resultados de la última corrida quedan en el navegador (no van en el .turbo)
      if (id) saveResult(id, { asc: simAsc, result: { result, meas }, time: Date.now() });
      // si mientras tanto se eligió otra simulación, los resultados quedan guardados para ésta
      if (simsRef.current.active !== id) {
        if (simsRef.current.items.some((s) => s.id === id)) keepResult(kept.current, id, { built, result, doc, meas });
        setStatus({ kind: 'done', ms });
        return;
      }
      // Al abrirse el panel de resultados el lienzo se achica: reajustar la vista
      if (!sim) setTimeout(() => editor.current?.fit(), 50);
      // al simular se ven los dos: esquemático y resultados en pantalla partida
      if (expanded) setExpanded('');
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
      // símbolos faltantes: el circuito simulado no es el del esquemático, el aviso va primero (#108)
      const missing = built.missingSymbols;
      setMessage(
        missing.length
          ? `Simulación incompleta: no se encontr${missing.length === 1 ? 'ó el símbolo' : 'aron los símbolos'} ${missing.join(', ')} y se ` +
              `omiti${missing.length === 1 ? 'ó' : 'eron'} del circuito. Los resultados no corresponden al esquemático.`
          : built.warnings.length
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

  // --- Lista de simulaciones (#39) ---
  /** Lo que se está viendo de la simulación activa */
  const liveView = (): SimView => ({ panes, active: activePane, plot: plotName, mode, plotState: plotState.current });
  // Cada simulación tiene su circuito (#151) y su pila de deshacer (#154): cambiar de simulación
  // guarda lo que se está editando (circuito, vista, pila y resultados) y trae lo de la otra
  const keyOf = (p: Project) => {
    const v = variantOf(p);
    return `${v.id}/${v.activeSim || 'base'}`;
  };
  /** Deja la simulación que se está viendo: devuelve el proyecto con su estado guardado */
  const leave = (): Project => {
    const p = snapshot();
    stacks.current.set(keyOf(p), history.state);
    if (sim && sims.active) keepResult(kept.current, sims.active, sim);
    return p;
  };
  /** Muestra la simulación activa del proyecto (o la base): su circuito, pila, vista y resultados */
  const enter = (p: Project, refit = false) => {
    const v = variantOf(p);
    const s = simOf(v);
    const h = stacks.current.get(keyOf(p));
    quietDoc.current = true;
    if (h && ascText(h.present) === activeAsc(v)) history.restore(h);
    else history.reset(parseAsc(activeAsc(v)));
    setProjectState(p);
    const r = s ? kept.current.get(s.id) : undefined;
    if (s) kept.current.delete(s.id);
    setSim(r ?? null);
    showView(s?.view);
    setSelection([]);
    setValueOffer(null);
    setViewRun('');
    if (refit) setDocKey((k) => k + 1);
    if (s && !r) restoreCached(s.id, s.asc);
  };
  /** Pasa a otra simulación de la variante ('' = el circuito base) */
  const goSim = (id: string) => id !== sims.active && enter(selectProjectSim(leave(), id));
  // En la base, escribir un comando de análisis (a mano o con el diálogo) crea la primera
  // simulación con ese circuito; la base se queda sin el comando
  useEffect(() => {
    if (sims.active || !docLine) return;
    const p0 = projectRef.current;
    const v = variantOf(p0);
    const r = addProjectSim({ ...p0, variants: p0.variants.map((x) => (x.id === v.id ? { ...x, base: ascText(removeAnalysis(doc)) } : x)) }, ascText(doc));
    if (r) editProject(r.project);
  }, [docLine]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Simulación nueva de ese tipo, con el circuito que está en pantalla */
  const newSim = (kind: AnalysisKind) => {
    // del mismo tipo que otra: se parte de sus parámetros
    const same = [...sims.items].reverse().find((s) => ANALYSIS_LINE.exec(s.line)?.[1].toLowerCase() === kind);
    const r = addProjectSim(leave(), ascText(setAnalysisLine(doc, same?.line ?? defaultLine(kind, circuitInfo()))));
    if (!r) return setMessage(`Ya hay ${MAX_SIMS} simulaciones: borrá alguna para agregar otra`);
    enter(r.project);
    setDirty(true);
  };
  // nombre propio desde la barra (vacío: vuelve al automático)
  const renameActive = (name: string) => editProject(renameProjectSim(projectRef.current, sims.active, name));
  // borrar la elegida (con el control deslizante): pasa a la siguiente, o a la base si era la única
  const deleteActive = () => sims.active && setDialog({ kind: 'deleteSim', id: sims.active });
  const deleteSim = (id: string) => {
    const p0 = leave();
    stacks.current.delete(`${variantOf(p0).id}/${id}`);
    kept.current.delete(id);
    dropResult(id);
    enter(removeProjectSim(p0, id));
    setDirty(true);
  };
  const duplicateSim = (id: string) => {
    const r = duplicateProjectSim(leave(), id);
    if (!r) return setMessage(`Ya hay ${MAX_SIMS} simulaciones: borrá alguna para agregar otra`);
    enter(r.project);
    setDirty(true);
  };

  // --- Variantes (#150): la cápsula Proyecto · Variante ---
  const goVariant = (id: string) => id !== variant.id && enter(selectVariant(leave(), id), true);
  const cloneOf = (id: string) => {
    enter(cloneVariant(leave(), id).project, true);
    setDirty(true);
  };
  const newBlankVariant = () => {
    enter(blankVariant(leave()).project, true);
    setDirty(true);
  };
  const deleteVariant = (id: string) => {
    const p0 = leave();
    for (const s of variantOf(p0, id).sims) {
      kept.current.delete(s.id);
      dropResult(s.id);
    }
    for (const k of [...stacks.current.keys()]) if (k.startsWith(`${id}/`)) stacks.current.delete(k);
    const p = removeVariant(p0, id);
    if (p.activeVariant !== p0.activeVariant) enter(p, true);
    else setProjectState(p);
    setDirty(true);
  };
  /** El nombre del proyecto es el del archivo: en Drive se renombra ya; en el equipo, al guardar */
  const renameProject = async (name: string) => {
    const newName = `${name}${EXT}`;
    editProject({ ...projectRef.current, name });
    if (file.driveId && google.account) {
      setFile({ ...file, name: newName });
      try {
        await drive.rename(file.driveId, newName);
      } catch (e) {
        setMessage(`No se pudo renombrar en Google Drive: ${(e as Error).message}`);
      }
      return;
    }
    // el archivo del equipo no se puede renombrar desde el navegador: Guardar pide dónde
    setFile({ ...file, name: newName, handle: undefined });
    if (file.handle) setMessage(`Al guardar (Ctrl+S) se crea «${newName}»`);
  };

  /** Restore: la corrida pasa a ser el circuito actual (un paso más de deshacer) */
  const restoreRun = (id: string) => {
    const r = curRuns.find((x) => x.id === id);
    if (!r) return;
    setViewRun('');
    viewingRef.current = false;
    setValueOffer(null);
    history.commit(parseAsc(r.asc));
    setMessage(`Se trajo al presente la corrida del ${new Date(r.time).toLocaleString()} (Ctrl+Z la deshace)`);
  };
  /** Clonar: una simulación nueva con el circuito de esa corrida */
  const cloneRun = (id: string) => {
    const r = curRuns.find((x) => x.id === id);
    if (!r || !curSim) return;
    const res = addProjectSim(leave(), r.asc, `${simName(curSim) || 'Sin análisis'} (${new Date(r.time).toLocaleString()})`);
    if (!res) return setMessage(`Ya hay ${MAX_SIMS} simulaciones: borrá alguna para agregar otra`);
    enter(res.project);
    setDirty(true);
  };
  const openHistory = (id: string) => {
    goSim(id);
    setViewRun('');
    setHistoryOpen(true);
  };
  useEffect(() => setSelection([]), [viewRun]);

  /** «Aplicar»: el valor nuevo va a las otras simulaciones, cada una con su paso de deshacer */
  const applyValueOffer = () => {
    if (!valueOffer) return;
    let p = projectRef.current;
    const v = variantOf(p);
    let n = 0;
    for (const id of valueOffer.sims) {
      const s = simOf(v, id);
      if (!s) continue;
      const key = `${v.id}/${id}`;
      const h = stacks.current.get(key);
      const cur = h?.present ?? parseAsc(s.asc);
      const next = applyValues(cur, valueOffer.changes);
      if (next === cur) continue;
      stacks.current.set(key, { past: [...(h?.past ?? []), cur], present: next, future: [] });
      p = setSimAsc(p, id, ascText(next));
      n++;
    }
    editProject(p);
    setValueOffer(null);
    setMessage(`Aplicado en ${n === 1 ? '1 simulación' : `${n} simulaciones`}`);
  };
  const curSim = activeSim(sims);
  // sin simulación (ni bloque .control), Simular despliega el menú para elegir qué simular
  const simMenu = useRef<(() => void) | null>(null);
  const canRun = !!curSim?.line || findControl(doc) >= 0;
  const simulate = () => (canRun ? run() : simMenu.current?.());
  const onPlotState = useCallback((s: PlotState) => {
    plotState.current = s;
  }, []);
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

  // Punto de operación: el de la simulación elegida o el último calculado, mientras el circuito
  // sea el que se simuló (no importa el comando de análisis)
  const op = useMemo(
    () =>
      sim?.result.bias && sameCircuit(sim.doc, doc)
        ? { built: sim.built, bias: sim.result.bias }
        : opPoint && sameCircuit(opPoint.doc, doc)
          ? opPoint
          : undefined,
    [sim, opPoint, doc],
  );
  const bias = op?.bias;
  const describe = useMemo(() => {
    if (!op) return undefined;
    return ({ net, symbol }: { net?: string; symbol?: number }) => {
      if (net) return net === '0' ? null : netBias(op.bias, net);
      const el = symbol !== undefined ? op.built.lt.elements.find((e) => e.sym === symbol) : undefined;
      return el ? elementBias(op.built, op.bias, el) : null;
    };
  }, [op]);
  const annotations = useMemo((): Annotation[] | undefined => {
    if (!showOp || !op) return undefined;
    const { built, bias } = op;
    const out: Annotation[] = [];
    for (const n of netNames(doc, conn, new Map())) {
      const b = netBias(bias, n.name);
      if (b?.short) out.push({ at: n.at, text: b.short, kind: 'v' });
    }
    for (const el of built.lt.elements) {
      if (!/^[RLVIDQMJ]/i.test(el.prefix)) continue;
      const b = elementBias(built, bias, el);
      const s = doc.symbols[el.sym];
      if (!b?.short || !s) continue;
      const box = symbolBox(s, lib.symbol(s.type), lib);
      out.push({ at: { x: box.x2 + 4, y: (box.y1 + box.y2) / 2 }, text: b.short, kind: 'i' });
    }
    return out;
  }, [showOp, op, doc, conn, lib]);

  // Sentido positivo de la corriente en los pines (punta de prueba y anotación del OP)
  const arrows = useMemo(() => {
    if (!sim || sim.doc !== doc || !(showOp || tool.kind === 'probe')) return undefined;
    const traces = panes.flatMap((p) => p.traces.map((t, i) => ({ t, color: traceColor(t, i) }))).filter((x) => !x.t.hidden);
    // la flecha toma el color de la traza de su corriente (la del pin o la del componente)
    const colorOf = (target: { symbol: number; pin?: number }) => {
      const expr = probeExpr(sim.built, target);
      return expr ? traces.find((x) => sameExpr(x.t.expr, expr))?.color : undefined;
    };
    return currentArrows(doc, lib, sim.built.lt.elements).map((a) => {
      const color = colorOf({ symbol: a.sym, pin: a.pin }) ?? colorOf({ symbol: a.sym });
      return color ? { ...a, color } : a;
    });
  }, [sim, doc, lib, showOp, tool.kind, panes]);

  const resolver = useCallback((p: SimPlot) => traceResolver(sim?.built ?? null, p, sim ? sameRuns(sim.result.plots, p) : [p]), [sim]);

  // Color de cada red con una traza V(red) visible en los paneles (el cable toma el color de la
  // traza); sólo con la punta de prueba
  const netColors = useMemo(() => {
    const m = new Map<string, string>();
    if (tool.kind !== 'probe') return m;
    for (const p of panes) p.traces.forEach((t, i) => {
      const n = /^V\(([^()]+)\)$/i.exec(t.expr.trim());
      if (n && !t.hidden && !m.has(n[1].toLowerCase())) m.set(n[1].toLowerCase(), traceColor(t, i));
    });
    return m;
  }, [panes, tool.kind]);
  // la red resaltada al pasar sobre una traza deja de estarlo si la traza se borra (al borrarla
  // no llega el pointerleave)
  const traceNetShown = traceNet && panes.some((p) => p.traces.some((t) => sameExpr(t.expr, `V(${traceNet})`))) ? traceNet : undefined;

  // Punta de prueba: agrega la traza al panel activo. Si ya está ahí no hace nada (se quita a
  // mano); si está en otro panel, queda en los dos con el mismo color
  const onProbe = (target: { net?: string; symbol?: number; pin?: number }) => {
    if (!sim || !plot) return;
    const expr = probeExpr(sim.built, target);
    if (!expr) return;
    // con el foco en la caja de trazas, se escribe ahí (para armar una expresión)
    if (traceBox.current?.focused()) return traceBox.current.insert(expr);
    setPanel('plot');
    // con los resultados colapsados, mostrarlos para ver la traza
    if (expanded === 'schematic') setExpanded('');
    const i = Math.min(activePane, panes.length - 1);
    if (panes[i]?.traces.some((t) => sameExpr(t.expr, expr))) return;
    const sc = scaleOf(plot);
    if (!sc) return setMessage(`${plot.name} no tiene eje X: elegí otro análisis para graficar`);
    try {
      evalTrace(expr, { resolve: resolver(plot), scale: sc.real, scaleName: sc.name });
    } catch {
      return setMessage(`No hay datos de ${expr} en ${plot.name}`);
    }
    editPanes(addTraceTo(panes, i, expr));
  };

  // Caja de trazas de la barra de resultados
  const traceBox = useRef<TraceBoxHandle>(null);
  const [viewerTools, setViewerTools] = useState<HTMLElement | null>(null);
  const traceNames = useMemo(() => {
    const sc = plot && scaleOf(plot);
    return plot ? [...new Set(plot.vectors.filter((v) => v !== sc).map(displayName))] : [];
  }, [plot]);
  /** agrega la expresión al panel activo; devuelve el error si no se puede graficar */
  const addExpr = (expr: string): string | undefined => {
    if (!plot) return;
    const test = paneCurves({ traces: [{ expr }] }, { plot, runs: [plot], labels, resolver, mode });
    if (test.errors.size) return test.errors.get(0);
    const next = addTraceTo(panes, activePane, expr);
    if (next !== panes) editPanes(next);
  };

  /** Ctrl+Espacio: volver a aplicar la vista guardada para el análisis (";.plot" o un .plt importado) */
  const reapplyView = () => {
    const v = plot && plotView[plotKind(plot.name)];
    if (v) editPanes(v);
    else setMessage('No hay una vista guardada para este análisis (se importa con un .plt)');
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
    download(`${project.name}.plt`, new Blob([serializePlt(v)], { type: 'text/plain' }));
  };

  const rotateOrMirror = (op: 'rotate' | 'mirror') => {
    if (tool.kind === 'place') setTool({ ...tool, orient: op === 'rotate' ? rotateCW(tool.orient) : mirrorX(tool.orient) });
    else if (selection.length) commit(transformItems(doc, selection, op, lib));
  };

  /** Listas de library/cmp de las que se elige el valor de un componente (vacío si no tiene) */
  const partGroups = (s: SymbolInst): PartGroup[] =>
    cmpChoicesFor(effectiveAttrs(s, lib.symbol(s.type)).get('Prefix') ?? '', s.type).map((c) => ({ kind: c.kind, label: c.label, parts: lib.parts(c.kind).filter(c.accept) }));

  const editItem = (ref: ItemRef) => {
    if (ref.kind === 'symbol') {
      // las fuentes independientes (V, I) tienen su ventana de configuración
      const s = doc.symbols[ref.index];
      const prefix = effectiveAttrs(s, lib.symbol(s.type)).get('Prefix') ?? '';
      setDialog(/^[VI]$/i.test(prefix) ? { kind: 'source', index: ref.index } : { kind: 'attrs', index: ref.index });
    }
    else if (ref.kind === 'text') {
      const t = doc.texts[ref.index];
      const ls = t.text.split('\\n');
      // Como en LTspice: un comando de análisis abre el menú de simulación
      if (isControlBlock(t.text)) setDialog({ kind: 'control', index: ref.index });
      else if (ls.length === 1 && ANALYSIS_LINE.test(ls[0])) setDialog({ kind: 'sim', found: { text: ref.index, line: 0, value: ls[0].trim() } });
      else setDialog({ kind: 'text', index: ref.index, textKind: t.kind });
    } else if (ref.kind === 'flag') setDialog({ kind: 'flag', index: ref.index });
    else if (ref.kind === 'shape') {
      // doble click en una figura de la selección: el estilo va a todas las seleccionadas
      const sel = selection.filter((r) => r.kind === 'shape').map((r) => r.index);
      openLineStyle(sel.includes(ref.index) ? sel : [ref.index]);
    }
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
    const base = project.name;
    if (which === 'net') return download(`${base}.net`, new Blob([`* ${ascName()}\n${ltNetlistText(lt)}\n`], { type: 'text/plain' }));
    const built = sim && sameExceptData(sim.doc, doc) ? sim.built : await buildSimulation(doc, lib, ascName());
    download(`${base}.cir`, new Blob([built.netlist], { type: 'text/plain' }));
  };
  const exportImage = (f: 'svg' | 'png') => {
    const svg = editor.current?.svg();
    const box = editor.current?.contentBox();
    if (svg && box) exportSchematic(svg, box, project.name, f);
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
  // (con los resultados colapsados el visor no se ve: el teclado vuelve al esquemático)
  const viewerKeys = () => area.current === 'viewer' && !!sim && expanded !== 'schematic' && panel === 'plot' && !!plotPanel.current;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || isTyping(e)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key;
      // letra sin importar Shift/Bloq Mayús (Shift se mira aparte)
      const lk = k.length === 1 ? k.toLowerCase() : k;
      const handled = () => e.preventDefault();
      // en los dos contextos
      if (e.altKey && lk === 'r') return handled(), !running && status.kind !== 'loading' && simulate();
      if (e.altKey && lk === 's') return handled(), running && abort();
      if (ctrl && lk === 'l') return handled(), showLog();
      if (ctrl && k === 'Enter') return handled(), simulate();
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
      if (ctrl && lk === 'a') return handled(), setTool({ kind: 'select' }), selectAll();
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
          return handled(), shapeTool('LINE')();
        case 'k':
          return handled(), shapeTool('RECTANGLE')();
        case 'o':
          return handled(), shapeTool('CIRCLE')();
        case 'u':
          return handled(), shapeTool('ARC')();
        case 'F3':
        case 'w':
          return handled(), setTool({ kind: 'wire', start: null });
        case 'F4':
        case 'n':
          return handled(), setDialog({ kind: 'flag' });
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
        case 'i':
          return setTool({ kind: 'place', type: 'current', orient: 'R0' });
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
      if (f && /\.turbo$/i.test(f.name)) return confirmDiscard() && openBytes(new Uint8Array(await f.arrayBuffer()), f.name);
      if (!f || !f.name.toLowerCase().endsWith('.asc')) return;
      // con la sesión de Google, soltar un .asc lo importa a "Mis simulaciones" y lo abre
      if (google.account) return doImport([{ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }]);
      if (!confirmDiscard()) return;
      await openBytes(new Uint8Array(await f.arrayBuffer()), f.name);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  });

  const running = status.kind === 'running';
  // Vistas (#36): esquemático y resultados prendidos = pantalla partida; con uno solo, ése a toda
  // la ventana. Los resultados se conservan aunque no se vean; sólo se reemplazan al volver a
  // simular o al abrir otro circuito
  const schematicShown = !sim || expanded !== 'results';
  const resultsShown = !!sim && expanded !== 'schematic';
  const toggleResultsPanel = () => setExpanded(toggleResults(expanded));
  // Botones de vista (#55): un click siempre suma. Si la vista no está, se agrega en pantalla
  // partida; si ya está junto con la otra, queda a pantalla completa
  const showSchematicView = () => sim && setExpanded(!schematicShown ? '' : resultsShown ? 'schematic' : expanded);
  const showResultsView = () => sim && setExpanded(!resultsShown ? '' : schematicShown ? 'results' : expanded);
  const setSide = (side: boolean) => {
    lsSet('turbospice.resultsSide', side ? '1' : '0');
    setResultsSide(side);
  };
  const placeTool = (type: string) => () => setTool({ kind: 'place', type, orient: 'R0' });
  // Figuras: en el menú Dibujar y en el botón de la barra (#64)
  const shapeItems: MenuItem[] = [
    { label: 'Línea', shortcut: 'J', onClick: shapeTool('LINE') },
    { label: 'Rectángulo', shortcut: 'K', onClick: shapeTool('RECTANGLE') },
    { label: 'Círculo', shortcut: 'O', onClick: shapeTool('CIRCLE') },
    { label: 'Arco', shortcut: 'U', onClick: shapeTool('ARC') },
    'sep',
    { label: 'Estilo de línea…', onClick: () => openLineStyle() },
  ];
  // Desplegable de Simular: las simulaciones guardadas (se elige cuál ver, #39); los tipos de
  // análisis, que crean una simulación nueva con sus parámetros en la barra; los comandos a mano
  // y los análisis programados
  const simItems: MenuItem[] = [
    ...sims.items.map(
      (x): MenuItem => ({
        label: simName(x) || 'Sin análisis',
        title: `${x.line} (doble clic para renombrar)`,
        checked: x.id === sims.active,
        onClick: () => goSim(x.id),
        rename: { taken: sims.items.filter((y) => y.id !== x.id).map((y) => simName(y)), onRename: (n) => editProject(renameProjectSim(projectRef.current, x.id, n)) },
        actions: [
          ...(variant.sims.find((y) => y.id === x.id)?.runs.length ? [{ icon: 'clock' as const, label: 'Historial', onClick: () => openHistory(x.id) }] : []),
          { icon: 'copy', label: 'Duplicar', onClick: () => duplicateSim(x.id) },
          { icon: 'trash', label: 'Borrar', onClick: () => setDialog({ kind: 'deleteSim', id: x.id }) },
        ],
      }),
    ),
    ...(sims.items.length
      ? [{ label: 'Circuito base (sin simulación)', title: 'El circuito de la variante fuera de las simulaciones', checked: !sims.active, onClick: () => goSim('') }]
      : []),
    'sep',
    ...ANALYSES.map((x) => ({ label: x.label, title: `Nueva simulación: ${x.help}`, onClick: () => newSim(x.kind), disabled: sims.items.length >= MAX_SIMS })),
    'sep',
    { label: 'Comando de simulación…', shortcut: 'A', onClick: () => openSimulation() },
    { label: 'Directiva SPICE…', shortcut: '.', onClick: () => setDialog({ kind: 'text', textKind: 'directive' }) },
    'sep',
    { label: 'Estudio…', shortcut: 'Alt+E', onClick: openStudy },
    { label: 'Bloque .control…', shortcut: 'Alt+C', onClick: openControl },
  ];
  const menus: MenuDef[] = [
    {
      label: 'Archivo',
      items: [
        { label: 'Nuevo', onClick: doNew },
        { label: google.account ? 'Abrir (Mis simulaciones)…' : 'Abrir…', shortcut: 'Ctrl+O', onClick: doOpen },
        ...(google.account ? [{ label: 'Importar desde la PC…', onClick: () => doImport() }] : []),
        { label: 'Guardar', shortcut: 'Ctrl+S', onClick: () => doSave(false) },
        { label: 'Guardar como…', shortcut: 'Ctrl+Shift+S', onClick: () => doSave(true) },
        ...(google.account ? [{ label: 'Exportar a la PC…', onClick: () => doSaveLocal(true) }] : []),
        { label: 'Exportar a PDF', title: 'Abre ASC-Parser con este circuito; no se sube a ningún servidor', onClick: doExportPdf },
        'sep',
        { label: 'Compartir link…', onClick: doShare },
        { label: 'Mis símbolos y modelos…', onClick: () => setDialog({ kind: 'userfiles' }) },
        {
          label: ltIndex ? 'Librería de LTspice' : 'Importar librería de LTspice…',
          items: [
            { label: ltIndex ? 'Volver a importar…' : 'Elegir la carpeta lib…', onClick: () => ltInput.current?.click() },
            ...(ltIndex
              ? [
                  { label: `${ltIndex.count.symbols} símbolos, ${ltIndex.count.models} archivos de modelos (${new Date(ltIndex.time).toLocaleDateString()})`, disabled: true, onClick: () => {} },
                  { label: 'Quitar', onClick: doRemoveLtspice },
                ]
              : []),
          ],
        },
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
        { label: 'Seleccionar todo', shortcut: 'Ctrl+A', onClick: () => (setTool({ kind: 'select' }), selectAll()) },
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
        { label: 'Fuente de corriente', shortcut: 'I', onClick: placeTool('current') },
        { label: 'Tierra', shortcut: 'G', onClick: () => setTool({ kind: 'flag', name: '0' }) },
        { label: 'Etiqueta de red…', shortcut: 'N', onClick: () => setDialog({ kind: 'flag' }) },
        'sep',
        { label: 'Directiva SPICE…', shortcut: '.', onClick: () => setDialog({ kind: 'text', textKind: 'directive' }) },
        { label: 'Comentario…', shortcut: 'T', onClick: () => setDialog({ kind: 'text', textKind: 'comment' }) },
        'sep',
        ...shapeItems,
      ],
    },
    {
      label: 'Simular',
      items: [
        { label: 'Simular', shortcut: 'Alt+R', onClick: run, disabled: running || status.kind === 'loading' },
        { label: 'Abortar', shortcut: 'Alt+S', onClick: abort, disabled: !running },
        { label: 'Ver el log', shortcut: 'Ctrl+L', onClick: showLog, disabled: !sim },
        'sep',
        ...simItems,
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
        { label: 'Mostrar el comando de simulación', title: 'Dibujar .tran, .ac… sobre el esquemático, como LTspice', onClick: toggleSimCommand, checked: showSimCommand },
        { label: 'Nombres de las redes', shortcut: 'Alt+N', onClick: () => setShowNets((v) => !v), checked: showNets },
        { label: 'Resultados al costado', onClick: () => setSide(!resultsSide), checked: resultsSide },
        { label: 'Panel de resultados', shortcut: 'Ctrl+1 / Ctrl+0', onClick: toggleResultsPanel, disabled: !sim, checked: resultsShown },
        'sep',
        { label: 'Editor de netlist (SPICE)', onClick: onNetlist },
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
        { label: 'Acerca de TurboSpice', onClick: () => setDialog({ kind: 'about' }) },
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
        ...sim.built.warnings.map((text) => ({ kind: /^Símbolo no encontrado:/.test(text) ? ('err' as const) : ('warn' as const), text })),
      ].map((p) => {
        const name = /^([^\s:]+)/.exec(p.text)?.[1]?.toLowerCase();
        const el = name ? sim.built.lt.elements.find((e) => e.name.toLowerCase() === name || e.name.replace(/§/g, '').toLowerCase() === name) : undefined;
        const fix = sim.built.tooBig?.find((f) => f.text === p.text)?.fix;
        return { ...p, sym: el?.sym, fix };
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

  // Barra de herramientas (#38): archivo, historial, dibujo, edición y vista; si falta
  // lugar, los grupos de la derecha pasan al desplegable "Más herramientas"
  const toolGroups: ToolGroup[] = [
    {
      id: 'file',
      label: 'Archivo',
      tools: [
        { icon: 'new', label: 'Nuevo', title: 'Nuevo esquemático', onClick: doNew },
        { icon: 'save', label: 'Guardar', title: google.account ? 'Guardar en Google Drive' : 'Guardar', shortcut: 'Ctrl+S', onClick: () => doSave(false) },
        { icon: 'pdf', label: 'Exportar a PDF', title: 'Exportar a PDF (se abre ASC-Parser con este circuito)', onClick: doExportPdf },
        { icon: 'open', label: 'Abrir', title: google.account ? 'Mis simulaciones (Google Drive)' : 'Abrir .asc', shortcut: 'Ctrl+O', onClick: doOpen },
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
        { icon: 'shapes', label: 'Figuras', title: 'Figuras: línea, rectángulo, círculo, arco', items: shapeItems, active: tool.kind === 'shape' },
        { icon: 'directive', label: 'Directiva', title: 'Directiva SPICE libre', shortcut: '.', onClick: () => setDialog({ kind: 'text', textKind: 'directive' }) },
      ],
    },
    {
      id: 'edit',
      label: 'Edición',
      tools: [
        { icon: 'rotate', label: 'Rotar', title: 'Rotar', shortcut: 'Ctrl+R', onClick: () => rotateOrMirror('rotate') },
        { icon: 'mirror', label: 'Espejar', title: 'Espejar', shortcut: 'Ctrl+E', onClick: () => rotateOrMirror('mirror') },
        { icon: 'delete', label: 'Borrar', title: 'Borrar', shortcut: 'Supr', onClick: deleteSelection, active: tool.kind === 'delete' },
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
  ];

  // Flecha de Resultados: exportar y las otras vistas (netlist, log, problemas, mediciones)
  const exportBase = () => project.name;
  const canExportPlot = panel === 'plot' && !!plot && !!scaleOf(plot);
  const resultsItems: MenuItem[] = !sim
    ? []
    : [
        {
          label: 'Exportar',
          items: [
            { label: 'Trazas a CSV', disabled: !canExportPlot, onClick: () => download(`${exportBase()}.csv`, new Blob([plotPanel.current?.csv() ?? ''], { type: 'text/csv' })) },
            {
              label: 'Gráfico a PNG',
              disabled: !canExportPlot,
              onClick: async () => {
                const b = await plotPanel.current?.png();
                if (b) download(`${exportBase()}.png`, b);
              },
            },
            { label: 'Vista a .plt (LTspice)', onClick: () => exportPlt() },
            { label: 'Importar vista .plt…', shortcut: 'O', onClick: () => pltInput.current?.click() },
            'sep',
            { label: 'Netlist .cir (ngspice)', onClick: () => download(`${exportBase()}.cir`, new Blob([sim.built.netlist], { type: 'text/plain' })) },
            { label: 'Netlist .net (LTspice)', onClick: () => download(`${exportBase()}.net`, new Blob([`* ${ascName()}
${ltNetlistText(sim.built.lt)}
`], { type: 'text/plain' })) },
          ],
        },
        'sep',
        { label: 'Netlist', checked: panel === 'netlist', onClick: () => setPanel('netlist') },
        ...(sim.meas ? [{ label: `Mediciones (${sim.meas.names.length})`, checked: panel === 'meas', onClick: () => setPanel('meas') }] : []),
        { label: `Problemas${problems.length ? ` (${problems.length})` : ''}`, checked: panel === 'problems', onClick: () => setPanel('problems') },
        { label: 'Log', shortcut: 'Ctrl+L', checked: panel === 'log', onClick: () => setPanel('log') },
      ];

  return (
    <div className="schematic-mode">
      {slots.menu && createPortal(<AppMenu menus={menus} />, slots.menu)}
      {slots.right &&
        createPortal(
          <>
            <ProjectCapsule
              project={project.name}
              variants={project.variants.map((v) => ({ id: v.id, name: v.name, sims: v.sims.length }))}
              active={variant.id}
              dirty={dirty}
              onRenameProject={renameProject}
              onRenameVariant={(id, name) => editProject(renameVariant(projectRef.current, id, name))}
              onSelect={goVariant}
              onClone={() => cloneOf(variant.id)}
              onBlank={newBlankVariant}
              onDuplicate={cloneOf}
              onDelete={(id) => setDialog({ kind: 'deleteVariant', id })}
            />
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
      {slots.tabs &&
        createPortal(
          <>
            {/* vistas: con las dos prendidas, pantalla partida */}
            <nav className="tabs view-tabs" aria-label="Vistas">
              <button className={schematicShown ? 'active' : ''} aria-pressed={schematicShown} onClick={showSchematicView} title={!sim ? 'Esquemático' : schematicShown && resultsShown ? 'Esquemático a pantalla completa (Ctrl+1)' : schematicShown ? 'Esquemático' : 'Agregar el esquemático en pantalla partida (Ctrl+0)'}>
                Esquemático
              </button>
              <button
                className={resultsShown ? 'active' : ''}
                aria-pressed={resultsShown}
                disabled={!sim}
                onClick={showResultsView}
                title={!sim ? 'Todavía no hay resultados: simulá primero' : schematicShown && resultsShown ? 'Resultados a pantalla completa (Ctrl+2)' : resultsShown ? 'Resultados' : 'Agregar los resultados en pantalla partida (Ctrl+0)'}
              >
                Resultados
              </button>
            </nav>
            <div className="layout-btns" role="group" aria-label="Disposición de los resultados">
              <button className={resultsSide ? 'active' : ''} aria-pressed={resultsSide} aria-label="Resultados al costado" title="Resultados al costado" onClick={() => setSide(true)}>
                <Icon name="layoutSide" size={16} />
              </button>
              <button className={!resultsSide ? 'active' : ''} aria-pressed={!resultsSide} aria-label="Resultados abajo" title="Resultados abajo" onClick={() => setSide(false)}>
                <Icon name="layoutStack" size={16} />
              </button>
            </div>
          </>,
          slots.tabs,
        )}
      <Toolbar
        label="Herramientas"
        groups={toolGroups}
        fixed={
          <>
            {/* Simular partido: la acción principal simula y la flecha despliega las simulaciones */}
            <div className="split" role="group" aria-label="Simulación">
              {running ? (
                <button className="labeled" onClick={abort} aria-label="Abortar" title="Abortar la simulación (Alt+S)">
                  <Icon name="stop" /> Abortar
                </button>
              ) : (
                <button
                  className="primary"
                  onClick={simulate}
                  disabled={status.kind === 'loading'}
                  aria-label="Simular"
                  aria-keyshortcuts="Alt+R Control+Enter"
                  title={canRun ? 'Simular (Alt+R / Ctrl+Enter)' : 'Elegir qué simular'}
                >
                  <Icon name="run" /> Simular
                </button>
              )}
              <MenuButton items={simItems} label="Tipo de simulación" title="Simulaciones y tipos de análisis" className={running ? 'labeled' : 'primary'} openRef={simMenu}>
                <Icon name="caret" size={14} />
              </MenuButton>
            </div>
            {/* siempre a la vista, separados de Simular; se habilitan cuando hay resultados (y punto de operación) */}
            <span className="tb-sep" />
            <button
              className={tool.kind === 'probe' ? 'active' : ''}
              aria-label="Medir"
              title={sim ? 'Punta de prueba: click en un cable (tensión) o componente (corriente)' : 'Punta de prueba: simulá primero'}
              disabled={!sim}
              onClick={() => setTool(tool.kind === 'probe' ? { kind: 'select' } : { kind: 'probe' })}
            >
              <Icon name="probe" />
            </button>
            <button
              className={showOp && bias ? 'active' : ''}
              aria-label="Anotar OP"
              title={bias ? 'Anotar el punto de operación en el esquemático (sin modificarlo)' : sim ? 'Punto de operación: el circuito cambió desde la última simulación' : 'Punto de operación: simulá primero'}
              disabled={!bias}
              onClick={() => setShowOp((v) => !v)}
            >
              <Icon name="op" />
            </button>
          </>
        }
        after={
          <SimBar
            sim={curSim && { name: simName(curSim), custom: !!curSim.name, line: curSim.line }}
            info={circuitInfo()}
            state={running ? 'running' : status.kind === 'error' ? 'err' : sim ? 'ok' : 'idle'}
            stateDetail={
              status.kind === 'running'
                ? status.percent ? `${status.percent.toFixed(0)} %` : undefined
                : status.kind === 'error'
                  ? status.message
                  : status.kind === 'done' && sim
                    ? `completada en ${status.ms.toFixed(0)} ms`
                    : undefined
            }
            stale={!sim && !!curSim?.view?.panes.some((p) => p.traces.length)}
            running={running}
            picker={picker}
            onApply={(line) => commit(setAnalysisLine(doc, line))}
            onRun={run}
            onRename={renameActive}
            onDelete={deleteActive}
          />
        }
      />

      <div className={`workspace${resultsSide ? ' side' : ''}${sim && expanded ? ` expand-${expanded}` : ''}`}>
        <div
          className={`canvas-wrap${historyOpen && curSim ? ' with-history' : ''}`}
          // con el foco en la caja de trazas, un click en el esquemático no se lo saca: la punta
          // de prueba escribe ahí el nodo o componente
          onMouseDownCapture={(e) => traceBox.current?.focused() && e.preventDefault()}
        >
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
            highlightNet={traceNetShown}
            netColors={netColors}
            netNames={shownNets}
            onNameNet={(at) => setDialog({ kind: 'flag', at })}
            describe={describe}
            annotations={annotations}
            currentArrows={arrows}
            pickValue={pickValue}
            onPicked={endPick}
            showGrid={showGrid}
            showLoose={showLoose}
            showSimCommand={showSimCommand}
            onHover={setHover}
            diff={historyDiff}
          />
          {historyOpen && curSim && (
            <HistoryPanel
              sim={simName(curSim) || 'Sin análisis'}
              runs={curRuns}
              picked={viewed?.id ?? ''}
              currentChanges={currentChanges}
              onPick={setViewRun}
              onRestore={restoreRun}
              onClone={cloneRun}
              onClose={() => {
                setHistoryOpen(false);
                setViewRun('');
              }}
            />
          )}
          {viewed && (
            <div className="pick-banner history-banner">
              Corrida del {new Date(viewed.time).toLocaleString()} · sólo lectura
              <button onClick={() => restoreRun(viewed.id)}>Restore</button>
              <button onClick={() => setViewRun('')}>Volver al actual</button>
            </div>
          )}
          {picking && (
            <div className="pick-banner">
              {picking.what === 'net' ? 'Elegí una red en el esquemático' : picking.what === 'source' ? 'Elegí una fuente (V o I) en el esquemático' : 'Elegí un componente en el esquemático'}
              <button onClick={() => endPick(null)}>Cancelar</button>
            </div>
          )}
          {valueOffer && !picking && (
            <div className="pick-banner">
              {valueOffer.changes.map((c) => `${c.inst} = ${c.from}`).join(', ')} también en{' '}
              {valueOffer.sims.length === 1 ? '1 simulación' : `${valueOffer.sims.length} simulaciones`}
              <button onClick={applyValueOffer} title={`Cambiar a ${valueOffer.changes.map((c) => `${c.inst} = ${c.to}`).join(', ')} en las otras simulaciones`}>
                Aplicar
              </button>
              <button onClick={() => setValueOffer(null)}>No</button>
            </div>
          )}
          {offerView && !picking && (
            <div className="pick-banner">
              Hay una vista de resultados de {file.name} guardada en este navegador. ¿Incorporarla al .asc?
              <button onClick={acceptOfferedView}>Incorporar</button>
              <button onClick={() => setOfferView(null)}>No</button>
            </div>
          )}
          {/* carpeta lib de LTspice (Archivo → Importar librería de LTspice) */}
          <input
            ref={ltInput}
            type="file"
            hidden
            {...{ webkitdirectory: '', directory: '' }}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length) doImportLtspice(files);
            }}
          />
          {message && (
            <div className="toast" onClick={() => setMessage(undefined)}>
              {message}
            </div>
          )}
          <div className="hint-bar">{tool.kind === 'select' ? (hover?.ref ? hoverInfo(doc, lib, conn, hover.ref).join(' · ') : hover ? hoverCoords(hover.at) : '') : toolHint(tool)}</div>
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
            <div className="toolbar small results-bar">
              {/* como Simular: el botón vuelve al gráfico; la flecha, a exportar y al resto de las vistas */}
              <div className="split" role="group" aria-label="Vista de resultados">
                <button className="active" onClick={() => setPanel('plot')} title="Volver al gráfico de resultados">
                  Resultados
                </button>
                <MenuButton items={resultsItems} label="Más vistas de resultados" title="Exportar, netlist, log y problemas" className="active">
                  <Icon name="caret" size={14} />
                </MenuButton>
              </div>
              {/* queda a la vista mientras se miran estos resultados, aunque se cierre el aviso (#108) */}
              {(sim.built.missingSymbols?.length ?? 0) > 0 && (
                <button
                  className="incomplete-badge"
                  onClick={() => setPanel('problems')}
                  title={`Faltan ${sim.built.missingSymbols.join(', ')}: se omitieron del circuito y los resultados no corresponden al esquemático`}
                >
                  Simulación incompleta
                </button>
              )}
              {/* la vista elegida en el menú (netlist, log…); el botón no cambia */}
              {panel !== 'plot' && <span className="results-view">{PANEL_NAMES[panel]}</span>}
              {panel === 'plot' && plot && scale && <TraceBox handle={traceBox} names={traceNames} onAdd={addExpr} />}
              {panel === 'plot' && (
                <>
                  {/* varios plots: un .control con varios análisis, .step (op vs R), .meas, FFT, gráficos x-y */}
                  {sim.result.plots.length > 1 && (
                    <select value={plotName} onChange={(e) => selectPlot(e.target.value)} aria-label="Plot" title="Resultado a ver (la simulación devolvió varios)">
                      {sim.result.plots.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                          {labels.has(p.name) ? ` (${labels.get(p.name)})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
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
                  {/* Cursores, FFT, Medidas y Ajustar (los pone el visor) */}
                  <span className="viewer-tools" ref={setViewerTools} />
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
                  key={sims.active}
                  initial={plotState.current}
                  onState={onPlotState}
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
                  onFocusTrace={() => traceBox.current?.focus()}
                  side={resultsSide}
                  toolsHost={viewerTools}
                  marks={withPz && pzSide ? marks : undefined}
                  onHoverExpr={(e) => {
                    const net = e && /^\s*V\(([^,()]+)\)\s*$/i.exec(e)?.[1];
                    setTraceNet(net ? conn.nets.find((n) => n.name.toLowerCase() === net.toLowerCase())?.name : undefined);
                  }}
                />
              )}
              {panel === 'plot' && plot && scale && withPz && pzSide && mode !== 'smith' && (
                <PzPlane runs={pzAll} labels={labels} name={project.name} compact />
              )}
              {panel === 'plot' && plot && !scale &&
                (pzShown.length ? <PzPlane runs={pzShown} labels={labels} name={project.name} /> : <ResultTable plot={plot} />)}
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
                        {p.fix && (
                          <button
                            className="link"
                            onClick={() => {
                              commit(replaceLine(doc, p.fix!.from, p.fix!.to));
                              setMessage(`Cambiado a «${p.fix!.to}»: simulá de nuevo con Alt+R`);
                            }}
                          >
                            usar «{p.fix.to}»
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
      {dialog?.kind === 'source' && doc.symbols[dialog.index] && (
        <SourceDialog
          inst={doc.symbols[dialog.index]}
          def={lib.symbol(doc.symbols[dialog.index].type)}
          onClose={() => setDialog(null)}
          onAttributes={() => setDialog({ kind: 'attrs', index: dialog.index })}
          windowDefaults={lib.windowDefaults}
          onApply={(attrs, labels, type) => {
            setDialog(null);
            const s = doc.symbols[dialog.index];
            const changed = Object.fromEntries(Object.entries(attrs).filter(([k, v]) => v !== (s.attrs.get(k) ?? null)));
            let d = Object.keys(changed).length ? setSymbolAttrs(doc, dialog.index, changed) : doc;
            if (type && type !== s.type) d = setSymbolType(d, dialog.index, type, lib);
            if (labels.size) d = patchLabels(d, [dialog.index], labels, lib);
            if (d !== doc) commit(d);
          }}
        />
      )}
      {dialog?.kind === 'attrs' && doc.symbols[dialog.index] && (
        <AttributeDialog
          inst={doc.symbols[dialog.index]}
          def={lib.symbol(doc.symbols[dialog.index].type)}
          parts={partGroups(doc.symbols[dialog.index])}
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
      {dialog?.kind === 'about' && <AboutDialog repo={REPO} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'drive' && (
        <DriveDialog
          currentId={file.driveId}
          onOpen={openDriveFile}
          onRenamed={(f) => {
            if (f.id !== file.driveId) return;
            setFile({ ...file, name: f.name });
            setProjectState({ ...projectRef.current, name: projectName(f.name) });
          }}
          onTrashed={(id) => id === file.driveId && setFile({ ...file, driveId: undefined })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'deleteSim' && (
        <SlideConfirm
          title="Borrar la simulación"
          message={`Se borra «${simName(sims.items.find((x) => x.id === dialog.id) ?? { id: '', line: '' }) || 'Sin análisis'}» con su circuito y su historial de corridas.`}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            deleteSim(dialog.id);
          }}
        />
      )}
      {dialog?.kind === 'deleteVariant' && (
        <SlideConfirm
          title="Borrar la variante"
          message={`Se borra «${variantOf(project, dialog.id).name}» con todas sus simulaciones y su historial.`}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            deleteVariant(dialog.id);
          }}
        />
      )}
      {dialog?.kind === 'share' && (
        <ShareDialog
          url={dialog.url}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'lineStyle' && (
        <LineStyleDialog
          initial={dialog.shapes.length ? (doc.shapes[dialog.shapes[0]]?.style ?? '') : shapeStyle}
          count={dialog.shapes.length}
          onClose={() => setDialog(null)}
          onApply={(style) => {
            setDialog(null);
            setShapeStyleState(style);
            if (tool.kind === 'shape') setToolState({ ...tool, style: style || undefined });
            if (dialog.shapes.length) commit(setShapeStyle(doc, dialog.shapes, style));
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
      return '';
    case 'wire':
      return t.start ? 'Click para fijar el tramo (Ctrl: en línea recta) · click derecho o Esc para terminar' : 'Click para empezar el cable';
    case 'place':
      return `Colocando ${t.type} · Ctrl+R rotar · Ctrl+E espejar · Esc para terminar`;
    case 'flag':
      return t.name === '0' ? 'Click para colocar tierra · Esc para terminar' : `Click para colocar la etiqueta "${t.name}"`;
    case 'text':
      return 'Click para ubicar el texto';
    case 'delete':
      return 'Click en un elemento para borrarlo · arrastrar un recuadro borra todo lo que queda adentro · Esc para terminar';
    case 'probe':
      return 'Click en un cable para ver su tensión o en un componente para su corriente · Esc para editar';
    case 'move':
      return t.refs
        ? `Click para soltar${t.stretch ? ' (los cables se estiran)' : ''} · click derecho o Esc cancela`
        : `${t.stretch ? 'Arrastrar (los cables se estiran)' : 'Mover (sin estirar cables)'}: click en un elemento o recuadro para elegir · Esc para terminar`;
    case 'shape': {
      const n = t.pts.length;
      if (t.shape === 'ARC' && n >= 2) return `${n === 2 ? 'Click en el punto de inicio del arco' : 'Click en el punto final (sentido antihorario)'} · click derecho cancela`;
      if (n) return `Click para terminar${t.shape === 'ARC' ? ' la caja del arco' : ''} · click derecho cancela`;
      const what = { LINE: 'la línea', RECTANGLE: 'el rectángulo', CIRCLE: 'el círculo (su caja)', ARC: 'el arco (la caja de su elipse)' }[t.shape];
      return `Click para empezar ${what} · Dibujar › Estilo de línea · Esc para terminar`;
    }
    case 'zoom':
      return 'Arrastrá un recuadro para hacer zoom (click: acercar) · Shift+Z: zoom anterior';
    case 'pick':
      return t.what === 'net' ? 'Click en un cable o pin para elegir su red · Esc cancela' : t.what === 'source' ? 'Click en una fuente V o I para elegirla · Esc cancela' : 'Click en un componente para elegirlo · Esc cancela';
  }
}
