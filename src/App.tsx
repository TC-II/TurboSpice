// TurboSpice: editor de esquemáticos .asc (compatible con LTspice) + simulación con ngspice.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { baseName, emptyDoc, type AscDoc, type SymbolInst } from './asc/model.ts';
import { EngineClient } from './engine/client.ts';
import type { SimPlot, SimResult } from './engine/ngspice.ts';
import { Library, PROJECT_DIR, USER_DIR, scanModels, type LibraryBundle } from './library/library.ts';
import { ltNetlist, ltNetlistText, missingSymbolIn } from './netlist/ltnetlist.ts';
import { netNames, type Annotation } from './schematic/NetNames.tsx';
import { currentArrows } from './schematic/currentArrows.tsx';
import { biasCommand, biasParams, elementBias, netBias, sameCircuit, scopedNetBias, type Bias } from './sim/bias.ts';
import { symbolBox, visibleText } from './schematic/geometry.ts';
import type { Point, ShapeKind } from './asc/model.ts';
import type { Status } from './NetlistMode.tsx';
import { isPzPlot, PzPlane, pzRuns, ResultTable } from './waveform/ScalarViews.tsx';
import { pzMarks, pzRoots } from './waveform/pz.ts';
import { SmithChart } from './waveform/SmithChart.tsx';
import { NetlistMode } from './NetlistMode.tsx';
import { Modal, AttributeDialog, ComponentPicker, FlagDialog, HelpDialog, LineStyleDialog, RunsDialog, ShareDialog, TextDialog, UserFilesDialog, AboutDialog, ImportInfoDialog, type UserFileInfo } from './schematic/dialogs.tsx';
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
import { activeSim, analysisLabel, defaultLine, keepResult, MAX_SIMS, simName, type SimList, type SimView } from './sim/simList.ts';
import {
  activeAsc,
  addSim as addProjectSim,
  addGroup,
  applyValues,
  freeBenchName,
  removeGroup,
  renameGroup,
  setBenchGroup,
  simLabel,
  groupPeersWith,
  propagateAttrs,
  mergeFiles,
  projectFileKind,
  uniqueFileName,
  duplicateSim as duplicateProjectSim,
  removeVariant,
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
  withGroups,
  variantOf,
  type FileConflict,
  type ValueChange,
} from './project/project.ts';
import { FileConflictDialog } from './project/FileConflictDialog.tsx';
import { staleInstances } from './project/staleInstances.ts';
import { exportAllZip, subcktFilesFor, runFilesOf, runSummary, exportSubcktNetlist, exportSubcktZip, exportVariantZip, importEntries, subcktFilesFrom } from './project/exchange.ts';
import { readZip, type ZipEntry } from './project/zip.ts';
import { asBenches, EMPTY_ASC, EXT, isTurboText, newProject, parseTurbo, projectFromAsc, projectName, serializeTurbo, type Project } from './project/turbo.ts';
import { SlideConfirm } from './ui/SlideConfirm.tsx';
import { ProjectCapsule } from './project/ProjectCapsule.tsx';
import { HistoryPanel } from './project/HistoryPanel.tsx';
import { diffCircuits } from './project/diff.ts';
import { SimBar } from './schematic/SimBar.tsx';
import { isControlBlock } from './netlist/directives.ts';
import { effectiveAttrs } from './asc/resolve.ts';
import { addFlag, addText, allItems, dcSourcesAsCell, deleteItems, extractItems, pasteItems, patchLabels, setFlagName, setShapeStyle, setSymbolAttrs, setSymbolType, setText, transformItems } from './schematic/edit.ts';
import { parseSource } from './sim/sources.ts';
import { ascBytes, pickAscFiles, readAsc, saveFile } from './schematic/fileio.ts';
import type { ItemRef } from './schematic/geometry.ts';
import { SchematicEditor, type EditorHandle, type Tool, type View as EditorView } from './schematic/SchematicEditor.tsx';
import { BenchParamsDialog, HierBar, NameDialog, ProjectTree, QuickOpen, type BenchItem, type Level, type TreeSub } from './project/Hierarchy.tsx';
import { benchParams, benchVariables, setBenchParams } from './schematic/benchParams.ts';
import { extractSubckt } from './project/extract.ts';
import { SymbolEditor } from './project/SymbolEditor.tsx';
import { ContextMenu, type ContextItem } from './ui/ContextMenu.tsx';
import { adoptSymbol, formatParamList, parseParamList, setSymParams, symParams } from './project/symbolEdit.ts';
import { addSubckt, benchesUsing, childSubckts, freeSubcktName, placingCycle, storeSymbol, subcktSymbol, subcktSymbolText, removeSubckt, renameSubckt, storeSubckt, subckts, subcktFile, subcktPorts, subName, symbolOutdated, updateSymbol, usages, validSubcktName } from './project/subckt.ts';
import { useHistory, type History } from './schematic/useHistory.ts';
import { mirrorX, rotateCW } from './asc/transform.ts';
import { buildSimulation, type BuiltSimulation } from './sim/schematicSim.ts';
import type { PlotAction, PlotPanelHandle } from './waveform/PlotPanel.tsx';
import { PlotPanel, preloadPlots } from './waveform/lazy.ts';
import { spectrum, thd, type FftWindow } from './waveform/fft.ts';
import { displayName, sameRuns, scaleOf, si, stepLabels, stepSweepPlots } from './waveform/series.ts';
import { paneCurves, type ComplexMode } from './waveform/curves.ts';
import { TraceBox, type TraceBoxHandle } from './waveform/TraceBox.tsx';
import { evalTrace, type Resolver } from './waveform/expr.ts';
import { addTraceTo, asPlotView, colorize, emptyPanes, parsePlt, plotKind, sameExpr, serializePlt, traceColor, viewFromDoc, withView, type Pane, type PlotState, type PlotView } from './waveform/view.ts';
import { sameExceptData } from './asc/dataText.ts';
import { deviceParamTraces, probeExpr, traceResolver } from './sim/traces.ts';
import { deviceRefs } from './sim/deviceParams.ts';
import { instScope, scopeElementOf, type InstScope } from './sim/context.ts';
import { blockResultsFromLog, measSweepPlot, measureResults, xyPlotsFromLog, type MeasTable } from './sim/measResults.ts';
import { MeasPanel } from './sim/MeasPanel.tsx';
import { StudyPanel, type StudyInfo } from './schematic/StudyPanel.tsx';
import { applyStudy, applyStudyCode, studyFromDoc } from './sim/study.ts';
import { parseAnalysis } from './sim/analyses.ts';
import { loadView } from './schematic/autosave.ts';
import { decode, decodeText } from './asc/encoding.ts';
import { download, exportSchematic, schematicSvg } from './schematic/exportSchematic.ts';
import { ResultsSplitter, refitsSchematic, toggleResults, useExpanded, type Expanded } from './ui/ResultsSplitter.tsx';
import { AccountButton, DriveDialog, importToDrive } from './cloud/AccountButton.tsx';
import { drive, useGoogle } from './cloud/google.ts';
import { USER_LIBRARY_NAME, mergeUserFiles, pullUserLibrary, pushUserLibrary, userLibraryText } from './cloud/userLibrary.ts';
import { uniqueName, type DriveFile } from './cloud/drive.ts';
import { Logo } from './ui/Logo.tsx';
import { hoverCoords, hoverInfo } from './schematic/hoverInfo.ts';
import { getLang, locale, setLang, t } from './i18n/i18n.ts';
import { synthesizeVerilog } from './hdl/client.ts';
import { applySynthesis, topModuleOf, generatedPins, generatedSub } from './hdl/project.ts';
import { VerilogDialog, verilogTemplate } from './hdl/VerilogDialog.tsx';
import type { SynthResult } from './hdl/yosys.ts';

/** Nombre de un proyecto nuevo; con sesión de Google pasa a «Project 2», «Project 3»… si ya está en el Drive */
const DEFAULT_PROJECT = 'Project';
const DEFAULT_NAME = /^project( \d+)?$/i;

const BASE = import.meta.env.BASE_URL;
const REPO = 'https://github.com/TC-II/TurboSpice';
/** Conversor de .asc a PDF vectorial: recibe el circuito comprimido en el hash (#c=…&n=…) */
// public/examples (scripts/make-examples.ts): el proyecto de muestra, que se abre la primera vez,
// y los ejemplos sueltos, una variante cada uno de Examples.turbo
const SAMPLE = 'Sample Project.turbo';
const EXAMPLES_TURBO = 'Examples.turbo';
const EXAMPLES = ['RC Filter', 'RLC Bode', 'RC Sweep (.step)', 'Half-wave Rectifier', 'Common Emitter', 'Inverting Amplifier'];

type Dialog =
  | { kind: 'picker'; forSymbol?: boolean }
  | { kind: 'attrs'; index: number; label?: number }
  | { kind: 'source'; index: number }
  | { kind: 'text'; index?: number; textKind: 'directive' | 'comment' }
  | { kind: 'flag'; index?: number; at?: Point }
  | { kind: 'sim'; found: FoundLine | null; analysis?: AnalysisKind }
  | { kind: 'control'; index: number }
  | { kind: 'share'; url: string }
  | { kind: 'help' }
  | { kind: 'userfiles' }
  | { kind: 'importinfo' }
  | { kind: 'study' }
  | { kind: 'runs' }
  | { kind: 'about' }
  | { kind: 'drive' }
  /** borrar una simulación (con el control deslizante) */
  | { kind: 'deleteSim'; id: string }
  | { kind: 'deleteVariant'; id: string }
  | { kind: 'projectfiles' }
  /** editar un archivo Verilog del proyecto (#209); sin name, uno nuevo */
  | { kind: 'verilog'; name?: string }
  /** pedir un nombre (testbench o subcircuito, #180) */
  | { kind: 'name'; title: string; label: string; initial: string; check(name: string): string | null; onOk(name: string): void }
  /** parámetros y variables del testbench (#180) */
  | { kind: 'benchParams' }
  /** confirmar con el control deslizante */
  | { kind: 'slide'; title: string; message: string; onConfirm(): void }
  /** estilo de línea para las figuras indicadas y las que se dibujen después */
  | { kind: 'lineStyle'; shapes: number[] };

/** Resultados de una simulación */
/** Nivel de la jerarquía abierto (#180): prefijo de sus vectores en ngspice y red de arriba de cada puerto */
interface HierLevel extends Level {
  prefix: string;
  ports: Map<string, string>;
}

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
  /** versión del archivo en Drive cuando se abrió o guardó: si cambió, otro lo modificó (#156) */
  driveVersion?: string;
}

// Serialización cacheada por documento (el autoguardado y el cambio de simulación la usan seguido)
const ascCache = new WeakMap<AscDoc, string>();
const ascText = (d: AscDoc) => {
  let tt = ascCache.get(d);
  if (tt === undefined) ascCache.set(d, (tt = serializeAsc(d)));
  return tt;
};

const isTyping = (e: KeyboardEvent) =>
  e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;

type Theme = 'auto' | 'light' | 'dark';

/** Tema claro/oscuro elegido en la app (por defecto, el del sistema) */
function useTheme(): [Theme, (tt: Theme) => void] {
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
const PANEL_NAMES = { plot: t('Plot'), netlist: 'Netlist', log: 'Log', problems: t('Problems'), meas: t('Measurements') };

export function App() {
  // (el motor arranca cuando llegó la librería, #190)
  const engine = useMemo(() => new EngineClient(false), []);
  const [mode, setMode] = useState<'schematic' | 'netlist'>('schematic');
  const [lib, setLib] = useState<Library | null>(null);
  const [libError, setLibError] = useState<string>();

  useEffect(() => {
    fetch(`${BASE}library/bundle.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(async (b: LibraryBundle) => {
        const l = new Library(b);
        for (const f of await loadUserFiles()) registerUserFile(l, f);
        engine.start();
        setLib(l);
        // las listas de pasivos (para elegir el valor) llegan después, sin demorar el esquemático (#189)
        fetch(`${BASE}library/cmp-passives.json`)
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
          .then((files: Record<string, string>) => l.addCmp(files))
          .catch(() => {});
      })
      .catch((e: Error) => {
        engine.start();
        setLibError(t('Could not load the library: {message}', { message: e.message }));
      });
    return () => engine.abort();
  }, [engine]);

  // lugares de la barra superior que llena el modo esquemático: el menú (junto al nombre), las
  // vistas (esquemático, resultados y su disposición) y, arriba a la derecha, archivo, tema y
  // compartir (#38)
  const [menuSlot, setMenuSlot] = useState<HTMLElement | null>(null);
  const [tabsSlot, setTabsSlot] = useState<HTMLElement | null>(null);
  const [rightSlot, setRightSlot] = useState<HTMLElement | null>(null);
  const [toolsSlot, setToolsSlot] = useState<HTMLElement | null>(null);

  return (
    <div className="app">
      <header className="appbar">
        <h1><Logo /> <span><span className="logo">Turbo</span>Spice</span></h1>
        {mode === 'netlist' ? (
          <nav className="tabs">
            <button onClick={() => setMode('schematic')}>{t('Schematic')}</button>
            <button className="active">Netlist</button>
          </nav>
        ) : (
          <div className="appbar-slot" ref={setTabsSlot} />
        )}
        {/* el menú, junto a las herramientas (que llenan la primera línea) */}
        <div className="appbar-slot" ref={setMenuSlot} />
        <div className="appbar-slot appbar-tools" ref={setToolsSlot} />
        <div className="appbar-slot appbar-right" ref={setRightSlot} />
        {/* el usuario / login (#35), al final, después de Compartir */}
        <div className="account-col">
          <AccountButton />
          <div id="sim-state-slot" />
        </div>
      </header>
      {mode === 'netlist' && <NetlistMode engine={engine} />}
      {mode === 'schematic' &&
        (lib ? (
          <SchematicMode engine={engine} lib={lib} slots={{ menu: menuSlot, tabs: tabsSlot, right: rightSlot, tools: toolsSlot }} onNetlist={() => setMode('netlist')} />
        ) : (
          <p className="empty pad">{libError ?? t('Loading library…')}</p>
        ))}
    </div>
  );
}

function SchematicMode({ engine, lib, slots, onNetlist }: {
  engine: EngineClient;
  lib: Library;
  slots: { menu: HTMLElement | null; tabs: HTMLElement | null; right: HTMLElement | null; tools: HTMLElement | null };
  /** pasar al editor de netlist */
  onNetlist(): void;
}) {
  const history = useHistory<AscDoc>(emptyDoc());
  // el circuito que se edita; `doc` es el que se ve (otro mientras se mira una corrida vieja)
  const liveDoc = history.value;
  const docRef = useRef(liveDoc);
  docRef.current = liveDoc;
  const [file, setFile] = useState<FileState>({ name: `${DEFAULT_PROJECT}${EXT}` });
  // proyecto (.turbo, #149): variantes y simulaciones, cada una con su circuito. El que se está
  // editando vive en `history` y pasa al proyecto al cambiar de simulación o al guardar (snapshot)
  const [project, setProjectRaw] = useState<Project>(() => withGroups(newProject(DEFAULT_PROJECT)));
  // los testbenches viven siempre en un grupo (proyectos viejos: pasan a «Group 1»)
  const setProjectState = (p: Project) => setProjectRaw(withGroups(p));
  const projectRef = useRef(project);
  projectRef.current = project;
  const [dirty, setDirty] = useState(false);
  // cuenta los cambios: un guardado en Drive limpia el «sin guardar» sólo si no hubo otros mientras
  const editRev = useRef(0);
  const markDirty = () => {
    editRev.current++;
    setDirty(true);
  };
  const editProject = (p: Project) => {
    setProjectState(p);
    markDirty();
  };
  // deshacer por simulación (#154): la pila de cada una mientras no se la ve
  const stacks = useRef(new Map<string, History<AscDoc>>());
  // Jerarquía (#180): niveles abiertos (vacío = el testbench). Cada nivel recuerda la instancia por
  // la que se bajó, el prefijo de sus vectores en ngspice (x_u1.) y a qué red de arriba va cada puerto
  const [path, setPath] = useState<HierLevel[]>([]);
  const pathRef = useRef(path);
  pathRef.current = path;
  const curSub = path.length ? path[path.length - 1].sub : '';
  const [, setSubTabs] = useState<string[]>([]);
  // el panel se muestra al acercar el mouse al borde izquierdo (si se tildó, en modo selección)
  const [hoverReveal, setHoverRevealState] = useState(() => lsGet('turbospice.treeHover') === '1');
  const setHoverReveal = (on: boolean) => (lsSet('turbospice.treeHover', on ? '1' : '0'), setHoverRevealState(on));
  const [treePeek, setTreePeek] = useState(false);
  // panel de proyecto: lo que eligió el usuario; si nunca eligió, abierto si hay subcircuitos
  const [treePref, setTreePref] = useState<boolean | null>(() => {
    const v = lsGet('turbospice.tree');
    return v === '1' ? true : v === '0' ? false : null;
  });
  const hasSubs = project.files.some((f) => f.kind === 'schematic');
  const treeOpen = treePref ?? hasSubs;
  // la barra de jerarquía sólo con subcircuitos (o el panel abierto): sin ellos no ocupa lugar
  const hierOn = path.length > 0;
  const treeShown = treeOpen || treePeek;
  const [quickOpen, setQuickOpen] = useState(false);
  const levelViews = useRef(new Map<string, EditorView>());
  // el próximo cambio de `history` no es una edición (se abrió un archivo o se cambió de simulación)
  const quietDoc = useRef(true);
  useEffect(() => {
    if (quietDoc.current) quietDoc.current = false;
    else markDirty(), warnShared();
  }, [history.state]);
  // la primera vez que se edita un subcircuito usado en varios testbenches, avisarlo (#199)
  const warnedSubs = useRef(new Set<string>());
  const warnShared = () => {
    const sub = pathRef.current[pathRef.current.length - 1]?.sub;
    if (!sub || warnedSubs.current.has(sub.toLowerCase())) return;
    warnedSubs.current.add(sub.toLowerCase());
    const n = benchesUsing(projectRef.current, sub);
    if (n > 1) setMessage(t('{name} is used in {n} testbenches: the changes apply to all of them', { name: sub, n }));
  };
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
    return last ? runSummary(diffCircuits(parseAsc(last.asc), liveDoc).summary, last.files, runFilesOf(project, ascText(liveDoc))) : undefined;
  }, [historyOpen, curRuns, liveDoc, project.files]); // eslint-disable-line react-hooks/exhaustive-deps
  // adentro de un subcircuito (#180) el comando es el del testbench (lo que se simula)
  const tbDoc = useMemo(() => (curSub ? parseAsc(activeAsc(variant)) : null), [curSub, variant]);
  const docLine = findAnalysis(tbDoc ?? doc)?.value ?? '';
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
  // con sesión de Google, «My symbols and models» vive en Drive (USER_LIBRARY_NAME), el mismo para
  // todos los proyectos; al entrar se une con lo que haya en este navegador
  const userLibId = useRef<string>();
  const account = google.account?.emailAddress ?? google.account?.displayName;
  useEffect(() => {
    userLibId.current = undefined;
    if (!account) return;
    let off = false;
    (async () => {
      const remote = await pullUserLibrary(drive);
      const merged = mergeUserFiles(remote.files ?? [], await loadUserFiles());
      if (off) return;
      for (const f of merged) registerUserFile(lib, f);
      setUserFiles(merged);
      saveUserFiles(merged);
      setLibVersion((v) => v + 1);
      userLibId.current = remote.files && userLibraryText(merged) === userLibraryText(remote.files) ? remote.id : await pushUserLibrary(drive, merged, remote.id);
    })().catch((e: Error) => !off && setMessage(t('Could not sync «{name}» with Google Drive: {message}', { name: USER_LIBRARY_NAME, message: e.message })));
    return () => {
      off = true;
    };
  }, [account]); // eslint-disable-line react-hooks/exhaustive-deps
  // archivos del proyecto (#155): se registran en la librería antes que los del usuario
  useEffect(() => {
    lib.setProjectFiles(project.files);
    setLibVersion((v) => v + 1);
  }, [lib, project.files]);
  // archivo repetido con otro contenido: se pregunta qué hacer
  const [conflict, setConflict] = useState<{ name: string; resolve(c: FileConflict): void } | null>(null);
  const askConflict = (name: string) => new Promise<FileConflict>((resolve) => setConflict({ name, resolve }));
  /** Agrega símbolos y modelos al proyecto (los demás tipos se ignoran) */
  const addProjectFiles = async (list: { name: string; text: string }[]) => {
    const incoming = list.flatMap((f) => {
      const kind = projectFileKind(f.name);
      return kind ? [{ name: f.name, kind, text: f.text }] : [];
    });
    if (!incoming.length) return;
    const r = await mergeFiles(projectRef.current.files, incoming, askConflict);
    if (r.added.length) editProject({ ...projectRef.current, files: r.files });
    setMessage(r.added.length ? t('Added to the project: {p0}', { p0: r.added.join(', ') }) : t('Nothing was added (they were already there)'));
    // el Verilog agregado se sintetiza enseguida: genera su .sub y su símbolo
    for (const name of r.added) if (projectFileKind(name) === 'verilog') await synthProjectVerilog(name);
  };
  /** Todos los Verilog del proyecto (un módulo puede usar los de otro archivo), con `name` = `text` */
  const verilogSources = (name: string, text: string) => ({
    ...Object.fromEntries(projectRef.current.files.filter((f) => f.kind === 'verilog').map((f) => [f.name, f.text])),
    [name]: text,
  });
  /** Guarda el .sub y el .asy que generó un Verilog del proyecto */
  const saveSynthesis = (name: string, text: string, r: SynthResult): boolean => {
    if (!r.block) return false;
    const files = [...projectRef.current.files.filter((f) => f.name.toLowerCase() !== name.toLowerCase()), { name, kind: 'verilog' as const, text }];
    const out = applySynthesis(files, name, r.block);
    if (out.clash) {
      setMessage(t('{file} already exists in the project and wasn\'t generated from {name}: rename the module', { file: out.clash, name }));
      return false;
    }
    editProject({ ...projectRef.current, files: out.files });
    setMessage(t('{name}: symbol {sym} ready in the component browser (F2) under "{PROJECT_DIR}"', { name, sym: r.block.name, PROJECT_DIR }));
    return true;
  };
  const synthProjectVerilog = async (name: string) => {
    const f = projectRef.current.files.find((x) => x.name === name);
    if (!f) return;
    setMessage(t('Synthesizing {name}…', { name }));
    try {
      const r = await synthesizeVerilog(verilogSources(name, f.text), name, topModuleOf(f.text));
      if (r.error) setMessage(t('{name}: {error}', { name, error: r.error }));
      else saveSynthesis(name, f.text, r);
    } catch (e) {
      setMessage(t('Yosys could not run: {msg}', { msg: (e as Error).message }));
    }
  };
  const removeProjectFile = (name: string) => editProject({ ...projectRef.current, files: projectRef.current.files.filter((f) => f.name !== name) });
  /** Símbolo para un .subckt de un archivo de modelos del proyecto */
  const makeProjectSymbol = (file: string, name: string) => {
    const f = projectRef.current.files.find((x) => x.name === file);
    const pins = f && subcktPins(f.text, name);
    if (!pins) return setMessage(t('No .subckt {name} found in {file}', { name, file }));
    const sym = { name: `${name}.asy`, kind: 'symbol' as const, text: makeSymbol({ name, pins, block: false, modelFile: file }) };
    editProject({ ...projectRef.current, files: [...projectRef.current.files.filter((x) => x.name.toLowerCase() !== sym.name.toLowerCase()), sym] });
    setMessage(t('Symbol {name} created: it\'s in the component browser (P) under "{PROJECT_DIR}"', { name, PROJECT_DIR }));
  };

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

  const setTool = useCallback((tt: Tool) => {
    setToolState(tt);
    if (tt.kind !== 'select' && tt.kind !== 'move' && tt.kind !== 'zoom') setSelection([]);
  }, []);
  // estilo de línea de las figuras que se dibujen (Dibujar › Estilo de línea)
  const [shapeStyle, setShapeStyleState] = useState('');
  const shapeTool = (shape: ShapeKind) => () => setTool({ kind: 'shape', shape, pts: [], ...(shapeStyle ? { style: shapeStyle } : {}) });
  const openLineStyle = (shapes = selection.filter((r) => r.kind === 'shape').map((r) => r.index)) => setDialog({ kind: 'lineStyle', shapes });
  // Ctrl+G / Ctrl+U: grilla y marcas de pines sueltos
  const [showGrid, setShowGrid] = useState(true);
  // elemento bajo el mouse: la barra de estado muestra sus propiedades (el estado vive en
  // HintBar: guardarlo acá re-renderizaba toda la vista al mover el mouse, #187)
  const hoverSink = useRef<((h: Hover) => void) | undefined>(undefined);
  const onHover = useCallback((h: Hover) => hoverSink.current?.(h), []);
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
  // (con testbenches, #180, cada uno es un circuito propio: no se ofrece; la lógica queda por si
  // vuelven las simulaciones que comparten circuito)
  const OFFER_VALUES = false;
  offerValues.current = (prev, next) => {
    const changes = OFFER_VALUES && sims.active ? valueChanges(prev, next) : [];
    const v = variantOf(projectRef.current);
    const ids = [...new Set(changes.flatMap((c) => simsWithValue(v, c)))];
    setValueOffer(ids.length ? { changes, sims: ids } : null);
  };
  const commit = useCallback(
    (next: AscDoc) => {
      if (viewingRef.current) return setMessage(t('This is a previous run (read-only): Restore brings it to the present'));
      offerValues.current?.(docRef.current, next);
      history.commit(next);
    },
    [history.commit],
  );

  useEffect(() => {
    engine.ready.then(
      () => {
        setStatus({ kind: 'idle' });
        preloadPlots(); // uPlot y el visor, cuando la app quede ociosa (#195)
      },
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
  const openShared = useCallback(async (): Promise<boolean> => {
    let shared;
    try {
      shared = await readShareHash(location.hash);
    } catch {
      setMessage(t('The link doesn\'t contain a valid circuit'));
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
          loadProject(p, { name: session.name, handle: session.handle as FileState['handle'], driveId: session.driveId, driveVersion: session.driveVersion });
          setDirty(session.dirty);
          const notes = [...(session.dirty ? [t('Recovered unsaved work ({p0})', { p0: new Date(session.time).toLocaleString(locale()) })] : []), ...warnings];
          if (notes.length) setMessage(notes.join(' · '));
          return;
        } catch {
          // sesión ilegible: seguir con el ejemplo
        }
      }
      const b = await (await fetch(`${BASE}examples/${encodeURIComponent(SAMPLE)}`)).arrayBuffer();
      if (touched.current) return;
      // sin pasar por recientes: es lo que se ve al entrar, no algo que abrió el usuario
      const { project: sample } = await parseTurbo(new TextDecoder().decode(b));
      if (touched.current) return;
      loadProject(sample, { name: SAMPLE });
    })()
      .catch(() => {})
      .finally(() => setRestored(true));
  }, []); // sólo al montar

  // Autoguardado del proyecto entero en el navegador, un momento después de cada cambio (las
  // pilas de deshacer no se guardan, #154)
  useEffect(() => {
    if (!restored) return;
    const tt = setTimeout(() => {
      serializeTurbo(snapshot()).then((turbo) =>
        saveProjectSession({ name: file.name, handle: file.handle, driveId: file.driveId, driveVersion: file.driveVersion, turbo, dirty, time: Date.now() }),
      );
    }, 600);
    return () => clearTimeout(tt);
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

  const confirmDiscard = () => !dirty || window.confirm(t('There are unsaved changes. Discard them?'));

  // Ya no hay "abrir" un .asc: Abrir lleva a Importar (que explica qué entra y cómo)
  const doOpen = () => setDialog({ kind: 'importinfo' });

  /** Importar .asc del equipo a la carpeta del Drive; uno solo se abre */
  const doImport = async (picked?: { name: string; bytes: Uint8Array }[]) => {
    const files = picked ?? (await pickAscFiles());
    if (!files.length) return;
    try {
      setMessage(files.length > 1 ? t('Importing {length} files to Google Drive…', { length: files.length }) : t('Importing {p0} to Google Drive…', { p0: files[0].name }));
      const saved = await importToDrive(files);
      if (saved.length === 1) await openDriveFile(saved[0]);
      else setMessage(t('Imported {length} files to «My simulations»', { length: saved.length }));
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
      const r = await saveFile(async (chosen) => {
        const tb = await turboBytes(chosen);
        p = tb.p;
        return tb.bytes;
      }, name, file.handle, saveAs);
      if (r && p) savedAs({ ...file, name: r.name, handle: r.handle ?? file.handle }, p);
    } catch (e) {
      setMessage(t('Could not save: {p0}', { p0: (e as Error).message }));
    }
  };

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
    saveToDrive(auto, force)
      .catch((e: Error) => setMessage(t('Could not save to Google Drive: {message}', { message: e.message })))
      .finally(() => {
        driveBusy.current = false;
        const next = drivePending.current;
        drivePending.current = null;
        if (next) queueDriveSave(next.auto);
      });
  };
  // al simular se guarda solo en Drive (después de que la corrida entró al proyecto)
  const [autoDrive, setAutoDrive] = useState(0);
  useEffect(() => {
    if (autoDrive && google.account && fileRef.current.driveId) queueDriveSave(true);
  }, [autoDrive]); // eslint-disable-line react-hooks/exhaustive-deps
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
      const name = uniqueName(t('{p0} (copy){EXT}', { p0: projectName(f.name), EXT }), (await drive.list()).map((x) => x.name));
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
          if (!window.confirm(t('There\'s already a «{name}» in Google Drive. Replace it?', { name: same.name }))) return;
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
  useEffect(() => {
    const f = fileRef.current;
    if (!google.account || !dirty || f.driveId || autoNaming.current || !DEFAULT_NAME.test(projectRef.current.name)) return;
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
  }, [google.account, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Con la sesión de Google iniciada, Guardar va al Drive; si no, al equipo
  const doSave = (saveAs = false) => (google.account ? doSaveDrive(saveAs) : doSaveLocal(saveAs));

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
  const doShare = async () => {
    const { bytes } = ascBytes(doc, lib);
    const hash = await shareHash(bytes, ascName());
    setDialog({ kind: 'share', url: `${location.origin}${location.pathname}#${hash}` });
  };

  // Exportar a PDF: la vista actual del esquemático (lo que se ve en pantalla), en una pestaña
  // que abre el diálogo de impresión (Guardar como PDF); nada viaja a un servidor
  const doExportPdf = () => {
    const svg = editor.current?.svg();
    const vb = svg?.getAttribute('viewBox')?.split(/\s+/).map(Number);
    if (!svg || !vb || vb.length !== 4) return;
    const text = schematicSvg(svg, { x1: vb[0], y1: vb[1], x2: vb[0] + vb[2], y2: vb[1] + vb[3] }).replace(/^<\?xml[^>]*>\s*/, '');
    const tab = window.open('', '_blank');
    if (!tab) return setMessage(t('The browser blocked the new tab: allow it to export to PDF.'));
    const title = project.name.replace(/[<&]/g, '');
    tab.document.write(`<!doctype html><title>${title}</title><style>@page{size:${vb[2] >= vb[3] ? 'landscape' : 'portrait'};margin:10mm}html,body{margin:0;height:100%}svg{width:100%;height:100%;display:block}</style>${text}`);
    tab.document.close();
    tab.focus();
    // después del click: en Firefox print() bloquea hasta cerrar el diálogo de impresión
    tab.setTimeout(() => tab.print(), 50);
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
      if (!r.turbo) return void remember(loadDoc(parseAsc(r.asc), r.name), { name: `${projectName(r.name)}${EXT}` });
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

  const doNew = () => confirmDiscard() && loadProject(newProject(DEFAULT_PROJECT), { name: `${DEFAULT_PROJECT}${EXT}` });

  /** Abre un proyecto de public/examples, opcionalmente en una de sus variantes */
  const doExample = async (name: string, variant?: string) => {
    if (!confirmDiscard()) return;
    const b = await (await fetch(`${BASE}examples/${encodeURIComponent(name)}`)).arrayBuffer();
    return openBytes(new Uint8Array(b), name, {}, variant);
  };

  /** Expresiones de todas las trazas (las que se ven y las recordadas por análisis), para pedir
   *  con .save los parámetros de dispositivo que usen (#202) */
  const allTraces = () => [panes, ...Object.values(plotView), ...panesByKind.current.values()].flatMap((ps) => ps.flatMap((p) => p.traces.map((tt) => tt.expr)));
  const run = async () => {
    // se simula el circuito actual (aunque se esté mirando una corrida vieja)
    // los subcircuitos no se simulan solos (#180): se simula desde un testbench
    if (pathRef.current.length) return setMessage(t('Subcircuits are not simulated on their own: go up to a testbench (Alt+↑) to simulate'));
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
      const p0 = snapshot();
      const files = runFilesOf(p0, simAsc);
      editProject(recordRun(p0, id, simAsc, Date.now(), last ? runSummary(diffCircuits(parseAsc(last.asc), doc).summary, last.files, files) : undefined, files).project);
      setAutoDrive((n) => n + 1);
    }
    try {
      if (ltIndex) await prefetchLtspice(doc, lib, ltIndex);
      const built = await buildSimulation(doc, lib, ascName(), allTraces());
      // lo que no entra en memoria no llega a ngspice: sólo el error, en Problemas (#58)
      const tooBig = built.tooBig.map((p) => p.text);
      const { result, ms } = tooBig.length
        ? { result: { plots: [], log: tooBig, errors: tooBig, aborted: false }, ms: 0 }
        : await engine.simulate(built.netlist, built.files, { bias: biasParams(built), biasCommand: biasCommand(built.netlist).cmd });
      if (result.bias) setOpPoint({ doc, built, bias: result.bias });
      result.plots.push(...stepSweepPlots(result.plots, built.ng.steps));
      // .meas: se evalúan sobre los resultados de cada corrida
      const cardMeas = measureResults(built, result.plots, stepLabels(result.plots, built.ng.steps));
      const mp = cardMeas && measSweepPlot(cardMeas, built);
      if (mp) result.plots.push(mp);
      // gráficos x-y de un programa de bloques, y sus listas y tabla (#179)
      const blk = built.ng.blocks ? blockResultsFromLog(result.log) : { table: null, plots: [] };
      const xy = [...xyPlotsFromLog(result.log, built.ng.xyPlots), ...blk.plots];
      result.plots.push(...xy);
      const meas = cardMeas ?? blk.table;
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
        if (built.controlPanes.length) built.warnings.push(t('Using the remembered view instead of the .control "plot" commands'));
      } else if (built.controlPanes.length) setPanes(built.controlPanes);
      const errs = result.errors.length ? result.errors : [];
      setStatus(errs.length && !result.plots.length ? { kind: 'error', message: errs[0] } : { kind: 'done', ms });
      // símbolos faltantes: el circuito simulado no es el del esquemático, el aviso va primero (#108)
      const missing = built.missingSymbols;
      setMessage(
        missing.length
          ? missing.length === 1
            ? t("Incomplete simulation: symbol {names} wasn't found and was left out of the circuit. The results don't match the schematic.", { names: missing[0] })
            : t("Incomplete simulation: symbols {names} weren't found and were left out of the circuit. The results don't match the schematic.", { names: missing.join(', ') })
          : built.warnings.length
            ? t('{p0} — see the Problems tab', { p0: built.warnings.length === 1 ? built.warnings[0] : t('{n} warnings', { n: built.warnings.length }) })
            : undefined,
      );
      if (result.plots.length) {
        setTool({ kind: 'probe' });
        const nothingPlotted = !(remembered ?? panes).some((p) => p.traces.length) && !built.controlPanes.length;
        setPanel(errs.length ? 'problems' : meas?.rows.length && (nothingPlotted || (blk.table && !xy.length)) ? 'meas' : 'plot');
      } else setPanel(errs.length ? 'problems' : 'log');
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message });
    }
  };

  const abort = () => {
    engine.abort();
    engine.ready.then(() => setStatus({ kind: 'idle' }));
    setStatus({ kind: 'error', message: t('Simulation aborted') });
  };
  /** Ctrl+L: log de la simulación (Problemas si hubo errores) */
  const showLog = () => {
    if (!sim) return setMessage(t('No simulation yet: simulate with Alt+R'));
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
    let p = snapshot();
    const lv = pathRef.current[pathRef.current.length - 1];
    stacks.current.set(lv ? subKey(lv.sub) : keyOf(p), history.state);
    if (lv) p = syncSymbol(p, lv.sub);
    if (sim && sims.active) keepResult(kept.current, sims.active, sim);
    return p;
  };
  /** Muestra la simulación activa del proyecto (o la base): su circuito, pila, vista y resultados */
  const enter = (p: Project, refit = false) => {
    pathRef.current = [];
    setPath([]);
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

  // --- Jerarquía (#180) ---------------------------------------------------------------------
  const subKey = (name: string) => `sub:${name.toLowerCase()}`;
  const levelKey = (ls: HierLevel[]) => (ls.length ? ls.map((l) => `${l.inst ?? ''}:${l.sub}`.toLowerCase()).join('/') : `tb:${keyOf(projectRef.current)}`);
  /** Si cambiaron los puertos del subcircuito, regenera su símbolo (y avisa) */
  const syncSymbol = (p: Project, name: string): Project => {
    if (!symbolOutdated(p, name)) return p;
    const f = subcktFile(p, name);
    setMessage(t('Symbol {name} updated with the ports: {ports}', { name, ports: f ? subcktPorts(parseAsc(f.text)).join(', ') : '' }));
    return updateSymbol(p, name);
  };
  /** Pasa a otro nivel de la jerarquía (vacío = el testbench), guardando lo que se edita */
  const go = (next: HierLevel[], select?: number) => {
    const cur = pathRef.current;
    const v = editor.current?.view();
    if (v) levelViews.current.set(levelKey(cur), v);
    let p = snapshot();
    const lv = cur[cur.length - 1];
    stacks.current.set(lv ? subKey(lv.sub) : keyOf(p), history.state);
    if (lv && !next.some((l) => l.sub.toLowerCase() === lv.sub.toLowerCase())) p = syncSymbol(p, lv.sub);
    const target = next[next.length - 1];
    const text = target ? subcktFile(p, target.sub)?.text : activeAsc(variantOf(p));
    if (text === undefined) return;
    const h = stacks.current.get(target ? subKey(target.sub) : keyOf(p));
    quietDoc.current = true;
    if (h && ascText(h.present) === text) history.restore(h);
    else history.reset(parseAsc(text));
    if (p !== projectRef.current) {
      setProjectState(p);
      projectRef.current = p;
    }
    if (target) setSubTabs((ts) => (ts.some((x) => x.toLowerCase() === target.sub.toLowerCase()) ? ts : [...ts, target.sub]));
    pathRef.current = next;
    setPath(next);
    setSelection(select === undefined ? [] : [{ kind: 'symbol', index: select }]);
    setTool({ kind: 'select' });
    setViewRun('');
    setValueOffer(null);
    // misma posición y zoom que la última vez en ese nivel (si no, ajustar)
    setDocKey((k) => k + 1);
    const saved = levelViews.current.get(levelKey(next));
    if (saved) requestAnimationFrame(() => requestAnimationFrame(() => editor.current?.setView(saved)));
  };
  const goUp = () => pathRef.current.length && go(pathRef.current.slice(0, -1));
  /** Abre un subcircuito sin instancia (desde el panel, una pestaña o Ctrl+P) */
  const openSub = (name: string, select?: number) => {
    const cur = pathRef.current;
    const i = cur.findIndex((l) => l.sub.toLowerCase() === name.toLowerCase());
    go(i >= 0 ? cur.slice(0, i + 1) : [{ sub: name, prefix: '', ports: new Map() }], select);
  };
  /** Doble clic / E / Enter sobre una instancia de un subcircuito del proyecto: bajar */
  const descend = (si: number): boolean => {
    const s = docRef.current.symbols[si];
    const f = s && subcktFile(projectRef.current, s.type);
    if (!f) return false;
    const parent = pathRef.current[pathRef.current.length - 1];
    const el = lt.elements.find((e) => e.sym === si);
    const ng = el ? el.name.replace(/§/g, '_').toLowerCase() : '';
    const up = (node: string) => (node === '0' ? '0' : (parent?.ports.get(node.toLowerCase()) ?? `${parent?.prefix ?? ''}${node}`));
    const ports = new Map<string, string>();
    el?.pinNames.forEach((pn, i) => pn && ports.set(pn.toLowerCase(), up(el.nodes[i])));
    go([...pathRef.current, { sub: subName(f.name), inst: s.attrs.get('InstName') ?? el?.name ?? '?', prefix: parent && !parent.inst ? '' : `${parent?.prefix ?? ''}${ng}.`, ports: parent && !parent.inst ? new Map() : ports }]);
    return true;
  };
  /** Nombre de subcircuito: válido y libre (salvo `except`, el que se renombra) */
  const checkSubName = (except?: string) => (n: string) =>
    !validSubcktName(n)
      ? t('Invalid name: use letters, digits, _ or -')
      : n.toLowerCase() !== except?.toLowerCase() && projectRef.current.files.some((f) => f.name.replace(/\.[^.]*$/, '').toLowerCase() === n.toLowerCase())
        ? t('There is already a file called {name}', { name: n })
        : null;
  const askSubName = (title: string, initial: string, onOk: (name: string) => void, except?: string) =>
    setDialog({
      kind: 'name',
      title,
      label: t('Name'),
      initial,
      check: checkSubName(except),
      onOk: (n) => {
        setDialog(null);
        onOk(n);
      },
    });
  const newSubckt = () => askSubName(t('New subcircuit'), freeSubcktName(projectRef.current), createSubckt);
  const createSubckt = (name: string) => {
    editProject(addSubckt(projectRef.current, name));
    // el proyecto nuevo tiene que estar antes de abrirlo
    projectRef.current = addSubckt(projectRef.current, name);
    openSub(name);
  };
  /** La selección pasa a un subcircuito nuevo y queda su instancia en su lugar */
  const subFromSelection = () => {
    if (!selection.length) return setMessage(t('Select the part of the circuit to turn into a subcircuit'));
    const refs = selection;
    askSubName(t('Subcircuit from the selection'), freeSubcktName(projectRef.current), (name) => extractTo(name, refs));
  };
  const extractTo = (name: string, selection: ItemRef[]) => {
    const r = extractSubckt(doc, selection, conn, lib, name);
    if (typeof r === 'string') return setMessage(r);
    const p0 = snapshot();
    const p: Project = { ...p0, modified: Date.now(), files: [...p0.files, { name: `${name}.asc`, kind: 'schematic', text: serializeAsc(r.sub) }, { name: `${name}.asy`, kind: 'symbol', text: r.symbol }] };
    projectRef.current = p;
    editProject(p);
    lib.setProjectFiles(p.files);
    setLibVersion((v) => v + 1);
    commit(r.parent);
    setSelection([{ kind: 'symbol', index: r.parent.symbols.length - 1 }]);
    setMessage(t('Subcircuit {name} created with the ports {ports}: double-click {inst} (or E) to enter it', { name, ports: r.ports.join(', '), inst: r.inst }));
  };
  const renameSub = (from: string) => askSubName(t('Rename subcircuit'), from, (to) => to !== from && doRenameSub(from, to), from);
  const doRenameSub = (from: string, to: string) => {
    // guardar lo que se edita, renombrar en todo el proyecto y volver a mostrar el nivel actual
    const cur = pathRef.current;
    const p = renameSubckt(snapshot(), from, to);
    const re = (n: string) => (n.toLowerCase() === from.toLowerCase() ? to : n);
    for (const k of [...stacks.current.keys()]) if (k === subKey(from) || !k.startsWith('sub:')) stacks.current.delete(k);
    setSubTabs((ts) => ts.map(re));
    editProject(p);
    projectRef.current = p;
    const next = cur.map((l) => ({ ...l, sub: re(l.sub) }));
    pathRef.current = [];
    go(next);
  };
  const deleteSub = (name: string) => {
    const n = usages(projectRef.current, name, (asc, nm) => nm || lineOf(asc)).length;
    setDialog({
      kind: 'slide',
      title: t('Delete subcircuit {name}?', { name }),
      message: n ? t('{name} is used {n} times. Delete it anyway? The instances will lose their symbol.', { name, n }) : t('Its schematic and its symbol will be deleted.'),
      onConfirm: () => {
        setDialog(null);
        doDeleteSub(name);
      },
    });
  };
  const doDeleteSub = (name: string) => {
    if (pathRef.current.some((l) => l.sub.toLowerCase() === name.toLowerCase())) go([]);
    stacks.current.delete(subKey(name));
    setSubTabs((ts) => ts.filter((x) => x.toLowerCase() !== name.toLowerCase()));
    const p = removeSubckt(projectRef.current, name);
    projectRef.current = p;
    editProject(p);
  };
  /** Ir a una instancia de un subcircuito (desde «usado en») */
  const goUsage = (u: ReturnType<typeof usages>[number], name: string) => {
    const find = (asc: string) => parseAsc(asc).symbols.findIndex((s) => s.attrs.get('InstName') === u.inst && subName(baseName(s.type)).toLowerCase() === name.toLowerCase());
    if (u.where.kind === 'subckt') {
      const f = subcktFile(projectRef.current, u.where.name);
      return f && openSub(u.where.name, find(f.text));
    }
    const w = u.where;
    if (w.kind === 'sim' && w.sim !== variantOf(projectRef.current).activeSim) goSim(w.sim);
    else if (pathRef.current.length) go([]);
    requestAnimationFrame(() => {
      const i = find(ascText(docRef.current));
      if (i >= 0) {
        setSelection([{ kind: 'symbol', index: i }]);
        const s = docRef.current.symbols[i];
        editor.current?.centerOn(symbolBox(s, lib.symbol(s.type), lib));
      }
    });
  };
  // En la base, escribir un comando de análisis (a mano o con el diálogo) crea la primera
  // simulación con ese circuito; la base se queda sin el comando
  useEffect(() => {
    if (sims.active || !docLine) return;
    const p0 = projectRef.current;
    const v = variantOf(p0);
    const r = addProjectSim({ ...p0, variants: p0.variants.map((x) => (x.id === v.id ? { ...x, base: ascText(removeAnalysis(doc)) } : x)) }, ascText(doc), freeBenchName(p0));
    if (r) editProject(r.project);
  }, [docLine]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Simulación nueva de ese tipo, con el circuito que está en pantalla */
  // Cada testbench tiene una configuración de simulación: elegir un análisis la cambia
  const newSim = (kind: AnalysisKind) => {
    if (curSub) return setMessage(t('The analysis belongs to the testbench: go up (Alt+↑) to change it'));
    // si ya es de ese tipo queda como está; si otro testbench usa ese tipo, se parte de sus parámetros
    const same = [...sims.items].reverse().find((s) => ANALYSIS_LINE.exec(s.line)?.[1].toLowerCase() === kind);
    const line = same?.line ?? defaultLine(kind, circuitInfo());
    // un testbench tiene una sola simulación: sin análisis se la pone; si ya tiene, se crea otro
    // testbench (en el mismo grupo) con el mismo circuito y ésta
    if (!docLine) return commit(setAnalysisLine(doc, line));
    const p1 = leave();
    const r = addProjectSim(p1, ascText(setAnalysisLine(doc, line)), freeBenchName(p1));
    if (!r) return setMessage(t('There are already {MAX_SIMS} testbenches: delete one to add another', { MAX_SIMS }));
    enter(r.project);
    markDirty();
  };
  /** Testbench nuevo, vacío, con el nombre por defecto (se renombra después) */
  const newEmptyBench = (group?: string) => {
    const r = addProjectSim(leave(), EMPTY_ASC, freeBenchName(projectRef.current));
    if (!r) return setMessage(t('There are already {MAX_SIMS} testbenches: delete one to add another', { MAX_SIMS }));
    enter(group ? setBenchGroup(r.project, r.id, group) : r.project, true);
    markDirty();
  };
  const renameBench = (id: string) => {
    const cur = sims.items.find((x) => x.id === id);
    if (!cur) return;
    setDialog({
      kind: 'name',
      title: t('Rename testbench'),
      label: t('Name'),
      initial: simName(cur) || '',
      check: (n) => (sims.items.some((x) => x.id !== id && (simName(x) || '').toLowerCase() === n.toLowerCase()) ? t('There is already a testbench called {name}', { name: n }) : null),
      onOk: (n) => {
        setDialog(null);
        editProject(renameProjectSim(projectRef.current, id, n));
      },
    });
  };
  // Grupos de testbenches y partes de cada uno (#180)
  const newGroup = () =>
    setDialog({
      kind: 'name',
      title: t('New workbench'),
      label: t('Name'),
      initial: uniqueGroupName(),
      check: () => null,
      onOk: (n) => {
        setDialog(null);
        editProject(addGroup(snapshot(), n).project);
      },
    });
  const uniqueGroupName = () => {
    const names = new Set(projectRef.current.groups.map((g) => g.name.toLowerCase()));
    for (let i = 1; ; i++) if (!names.has(t('Workbench {n}', { n: i }).toLowerCase())) return t('Workbench {n}', { n: i });
  };
  const groupAction = (id: string, action: 'rename' | 'delete') => {
    const g = projectRef.current.groups.find((x) => x.id === id);
    if (!g) return;
    if (action === 'delete' && projectRef.current.groups.length < 2) return setMessage(t('A project always has at least one workbench'));
    if (action === 'rename')
      return setDialog({
        kind: 'name',
        title: t('Rename workbench'),
        label: t('Name'),
        initial: g.name,
        check: () => null,
        onOk: (n) => {
          setDialog(null);
          editProject(renameGroup(snapshot(), id, n));
        },
      });
    setDialog({
      kind: 'slide',
      title: t('Delete the workbench {name}?', { name: g.name }),
      message: t('Its testbenches are not deleted: they move to {name}.', { name: projectRef.current.groups.find((x) => x.id !== id)?.name ?? '' }),
      onConfirm: () => {
        setDialog(null);
        editProject(removeGroup(snapshot(), id));
      },
    });
  };
  // Botón derecho en un componente de un testbench de un grupo: editar o propagar sus valores a
  // los otros testbenches del grupo que tienen el mismo componente
  const [ctxMenu, setCtxMenu] = useState<{ at: { x: number; y: number }; items: ContextItem[] } | null>(null);
  const symbolMenu = (index: number, at: { x: number; y: number }): boolean => {
    const s = doc.symbols[index];
    const inst = s?.attrs.get('InstName');
    if (!s || !inst) return false;
    const eff = effectiveAttrs(s, lib.symbol(s.type));
    const value = s.attrs.get('Value') ?? eff.get('Value') ?? '';
    const prefix = (eff.get('Prefix') ?? '').toUpperCase();
    // R, L, C y fuentes V de continua: el valor se edita en el mismo menú
    const quick =
      /^[RLC]$/.test(prefix) ||
      (prefix === 'V' && parseSource({ Value: s.attrs.get('Value'), Value2: s.attrs.get('Value2'), SpiceLine: s.attrs.get('SpiceLine') })?.kind === 'dc');
    const p0 = snapshot();
    const inBench = !curSub && !!sims.active;
    const peers = inBench ? groupPeersWith(p0, sims.active, inst, s.type) : [];
    const me = inBench ? variantOf(p0).sims.find((x) => x.id === sims.active) : undefined;
    const canPropagate = !!me?.group && peers.length > 0;
    // fuera de los casos rápidos, el menú sólo aparece si hay a quién propagarle
    if (!quick && !canPropagate) return false;
    const group = p0.groups.find((g) => g.id === me?.group)?.name ?? '';
    setCtxMenu({
      at,
      items: [
        quick
          ? { label: `${inst} =`, onClick: () => {}, edit: { value, onCommit: (v) => commit(setSymbolAttrs(doc, index, { Value: v })) } }
          : { label: t('Edit {inst}…', { inst }), onClick: () => editItem({ kind: 'symbol', index }) },
        {
          label: !canPropagate
            ? t('Propagate {inst} to the other testbenches of the workbench', { inst })
            : peers.length === 1
              ? t('Propagate {inst} = {value} to the other testbench of «{group}»', { inst, value, group })
              : t('Propagate {inst} = {value} to the {n} other testbenches of «{group}»', { inst, value, group, n: peers.length }),
          title: t('Copies its value and parameters to the component with the same name in the other testbenches of the workbench'),
          disabled: !canPropagate,
          onClick: () => {
            editProject(propagateAttrs(snapshot(), peers, inst, s.type, s.attrs));
            setMessage(t('{inst} = {value} propagated to {n} testbenches of «{group}»', { inst, value, n: peers.length, group }));
          },
        },
      ],
    });
    return true;
  };
  const moveBench = (id: string, group?: string) => editProject(setBenchGroup(snapshot(), id, group));
  /** Abrir una parte de un testbench: su configuración de simulación, su esquemático o sus parámetros */
  const benchItem = (id: string, item: BenchItem) => {
    if (id !== sims.active) goSim(id);
    else if (pathRef.current.length) go([]);
    // el diálogo, cuando ya se ve el testbench
    if (item === 'history') return setTimeout(() => openHistory(id), 0);
    if (item === 'study') return setTimeout(openStudy, 0);
    if (item !== 'schematic') setTimeout(() => (item === 'sim' ? openSimulation() : setDialog({ kind: 'benchParams' })), 0);
  };
  const benchAction = (id: string, action: 'rename' | 'duplicate' | 'delete') =>
    action === 'rename' ? renameBench(id) : action === 'duplicate' ? duplicateSim(id) : sims.items.length > 1 && setDialog({ kind: 'deleteSim', id });
  // borrar la elegida (con el control deslizante): pasa a la siguiente, o a la base si era la única
  const deleteActive = () => sims.active && sims.items.length > 1 && setDialog({ kind: 'deleteSim', id: sims.active });
  const deleteSim = (id: string) => {
    const p0 = leave();
    stacks.current.delete(`${variantOf(p0).id}/${id}`);
    kept.current.delete(id);
    dropResult(id);
    enter(removeProjectSim(p0, id));
    markDirty();
  };
  const duplicateSim = (id: string) => {
    const r = duplicateProjectSim(leave(), id);
    if (!r) return setMessage(t('There are already {MAX_SIMS} simulations: delete one to add another', { MAX_SIMS }));
    enter(r.project);
    markDirty();
  };

  // --- Variantes (#150): la cápsula Proyecto · Variante ---
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
    markDirty();
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
        setMessage(t('Could not rename in Google Drive: {p0}', { p0: (e as Error).message }));
      }
      return;
    }
    // el archivo del equipo no se puede renombrar desde el navegador: Guardar pide dónde
    setFile({ ...file, name: newName, handle: undefined });
    if (file.handle) setMessage(t('Saving (Ctrl+S) will create «{newName}»', { newName }));
  };

  /** Restore: la corrida pasa a ser el circuito actual (un paso más de deshacer) */
  const restoreRun = (id: string) => {
    const r = curRuns.find((x) => x.id === id);
    if (!r) return;
    setViewRun('');
    viewingRef.current = false;
    setValueOffer(null);
    history.commit(parseAsc(r.asc));
    setMessage(t('Brought the run from {p0} to the present (Ctrl+Z undoes it)', { p0: new Date(r.time).toLocaleString(locale()) }));
  };
  /** Clonar: una simulación nueva con el circuito de esa corrida */
  const cloneRun = (id: string) => {
    const r = curRuns.find((x) => x.id === id);
    if (!r || !curSim) return;
    const res = addProjectSim(leave(), r.asc, `${simName(curSim) || t('No analysis')} (${new Date(r.time).toLocaleString(locale())})`);
    if (!res) return setMessage(t('There are already {MAX_SIMS} simulations: delete one to add another', { MAX_SIMS }));
    enter(res.project);
    markDirty();
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
    setMessage(t('Applied to {p0}', { p0: n === 1 ? t('1 simulation') : t('{n} simulations', { n }) }));
  };
  const curSim = activeSim(sims);
  // sin simulación (ni bloque .control), Simular despliega el menú para elegir qué simular
  const simMenu = useRef<(() => void) | null>(null);
  const canRun = !!curSim?.line || findControl(tbDoc ?? doc) >= 0;
  const simulate = () => (curSub ? run() : canRun ? run() : simMenu.current?.());
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
    const tt = thd(sp);
    const name = `fft ${o.expr} (${plot.name})`;
    const derived: SimPlot = {
      name,
      vectors: [
        { name: 'frequency', type: 2, real: sp.freq },
        { name: 'mag', type: 0, real: sp.amp },
      ],
      info: t('{expr}: fundamental {p1}Hz, amplitude {p2} · THD {p3} % (harmonics 2 to {p4}) · {n} points, {window} window', { expr: o.expr, p1: si(tt.fundamental), p2: si(tt.amplitude), p3: tt.thd.toFixed(3), p4: tt.harmonics.length + 1, n: sp.n, window: o.window }),
    };
    setSim({ ...sim, result: { ...sim.result, plots: [...sim.result.plots.filter((p) => p.name !== name), derived] } });
    selectPlot(name, panesByKind.current.get('fft') ?? [{ traces: [{ expr: 'db(mag)' }] }]);
  };
  const pltInput = useRef<HTMLInputElement>(null);

  // Punto de operación: el de la simulación elegida o el último calculado, mientras el circuito
  // sea el que se simuló (no importa el comando de análisis)
  // Adentro de una instancia (#199): la simulación del testbench vista desde esa instancia, si
  // el subcircuito es el que se simuló
  const lvNow = path[path.length - 1];
  const docText = useMemo(() => (lvNow?.inst ? ascText(doc) : ''), [lvNow, doc]);
  const scopeIn = useCallback(
    (built: BuiltSimulation | undefined): InstScope | undefined => {
      if (!built || !lvNow?.inst) return undefined;
      const sc = instScope(built, lvNow.sub, lvNow.prefix, lvNow.ports);
      return sc && ascText(sc.block.doc) === docText ? sc : undefined;
    },
    [lvNow, docText],
  );
  const simScope = useMemo(() => scopeIn(sim?.built), [scopeIn, sim]);
  const op = useMemo((): { built: BuiltSimulation; bias: Bias; scope?: InstScope } | undefined => {
    if (lvNow) {
      for (const c of [sim?.result.bias ? { built: sim.built, bias: sim.result.bias } : null, opPoint]) {
        const scope = c ? scopeIn(c.built) : undefined;
        if (c && scope) return { built: c.built, bias: c.bias, scope };
      }
      return undefined;
    }
    return sim?.result.bias && sameCircuit(sim.doc, doc)
      ? { built: sim.built, bias: sim.result.bias }
      : opPoint && sameCircuit(opPoint.doc, doc)
        ? opPoint
        : undefined;
  }, [sim, opPoint, doc, lvNow, scopeIn]);
  const bias = op?.bias;
  const describe = useMemo(() => {
    if (!op) return undefined;
    return ({ net, symbol }: { net?: string; symbol?: number }) => {
      if (net) return net === '0' ? null : op.scope ? scopedNetBias(op.bias, op.scope, net) : netBias(op.bias, net);
      const el = symbol === undefined ? undefined : op.scope ? scopeElementOf(op.scope, symbol) : op.built.lt.elements.find((e) => e.sym === symbol);
      return el ? elementBias(op.built, op.bias, el, op.scope) : null;
    };
  }, [op]);
  const annotations = useMemo((): Annotation[] | undefined => {
    if (!showOp || !op) return undefined;
    const { built, bias, scope } = op;
    const out: Annotation[] = [];
    for (const n of netNames(doc, conn, new Map())) {
      const b = scope ? scopedNetBias(bias, scope, n.name) : netBias(bias, n.name);
      if (b?.short) out.push({ at: n.at, text: b.short, kind: 'v' });
    }
    for (const el of scope ? scope.block.lt.elements : built.lt.elements) {
      if (!/^[RLVIDQMJ]/i.test(el.prefix)) continue;
      const b = elementBias(built, bias, el, scope);
      const s = doc.symbols[el.sym];
      if (!b?.short || !s) continue;
      const box = symbolBox(s, lib.symbol(s.type), lib);
      out.push({ at: { x: box.x2 + 4, y: (box.y1 + box.y2) / 2 }, text: b.short, kind: 'i' });
    }
    return out;
  }, [showOp, op, doc, conn, lib]);

  // Sentido positivo de la corriente en los pines (punta de prueba y anotación del OP)
  const arrows = useMemo(() => {
    if (!sim || (lvNow ? !simScope : sim.doc !== doc) || !(showOp || tool.kind === 'probe')) return undefined;
    const traces = panes.flatMap((p) => p.traces.map((tt, i) => ({ t: tt, color: traceColor(tt, i) }))).filter((x) => !x.t.hidden);
    // la flecha toma el color de la traza de su corriente (la del pin o la del componente)
    const colorOf = (target: { symbol: number; pin?: number }) => {
      const expr = probeExpr(sim.built, target, simScope);
      return expr ? traces.find((x) => sameExpr(x.t.expr, expr))?.color : undefined;
    };
    return currentArrows(doc, lib, simScope ? simScope.block.lt.elements : sim.built.lt.elements).map((a) => {
      const color = colorOf({ symbol: a.sym, pin: a.pin }) ?? colorOf({ symbol: a.sym });
      return color ? { ...a, color } : a;
    });
  }, [sim, doc, lib, showOp, tool.kind, panes, lvNow, simScope]);

  const resolver = useCallback((p: SimPlot) => traceResolver(sim?.built ?? null, p, sim ? sameRuns(sim.result.plots, p) : [p]), [sim]);

  // Color de cada red con una traza V(red) visible en los paneles (el cable toma el color de la
  // traza); sólo con la punta de prueba
  const netColors = useMemo(() => {
    const m = new Map<string, string>();
    if (tool.kind !== 'probe') return m;
    // adentro de una instancia (#180): V(x_u1.red) colorea «red» y la red de arriba, su puerto
    const lv = path[path.length - 1];
    const local = (n: string) => {
      if (!lv) return n;
      if (!lv.inst) return undefined;
      if (n.startsWith(lv.prefix)) return n.slice(lv.prefix.length);
      return [...lv.ports].find(([, up]) => up.toLowerCase() === n)?.[0];
    };
    for (const p of panes) p.traces.forEach((tt, i) => {
      const n = /^V\(([^()]+)\)$/i.exec(tt.expr.trim());
      const name = n && local(n[1].toLowerCase());
      if (name && !tt.hidden && !m.has(name)) m.set(name, traceColor(tt, i));
    });
    return m;
  }, [panes, tool.kind, path]);
  // la red resaltada al pasar sobre una traza deja de estarlo si la traza se borra (al borrarla
  // no llega el pointerleave)
  const traceNetShown = traceNet && panes.some((p) => p.traces.some((tt) => sameExpr(tt.expr, `V(${traceNet})`))) ? traceNet : undefined;

  // Punta de prueba: agrega la traza al panel activo. Si ya está ahí no hace nada (se quita a
  // mano); si está en otro panel, queda en los dos con el mismo color
  // Vista partida del subcircuito (#180): su símbolo al lado. Los pines siguen a los puertos
  // mientras se edita (los que quedan conservan su lugar)
  const subPorts = useMemo(() => (curSub ? subcktPorts(liveDoc) : []), [curSub, liveDoc]);
  const subPortsKey = subPorts.join(',');
  useEffect(() => {
    if (!curSub) return;
    const p = storeSubckt(projectRef.current, curSub, ascText(docRef.current));
    if (!symbolOutdated(p, curSub)) return;
    const next = updateSymbol(p, curSub);
    projectRef.current = next;
    setProjectState(next);
    // las instancias ya colocadas no se recablean solas: avisar cuáles quedaron mal (#199)
    lib.setProjectFiles(next.files);
    const stale = staleInstances(next, curSub, lib, (_, nm) => nm ?? '');
    if (stale.length) setMessage(t('The ports of {name} changed: {insts} must be rewired (marked in the project panel)', { name: curSub, insts: stale.map((u) => u.inst).join(', ') }));
  }, [curSub, subPortsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const editSymbol = (text: string) => {
    if (!curSub) return;
    const p = storeSymbol(projectRef.current, curSub, text);
    projectRef.current = p;
    editProject(p);
    warnShared();
  };
  const symText = curSub ? subcktSymbolText(project, curSub) : undefined;
  /** Un .asy existente como símbolo del subcircuito que se edita (#199) */
  const adoptSymbolFor = (type: string) => {
    const asy = lib.symbolText(type);
    if (!curSub || !asy) return setMessage(t('Symbol not found: {p0}', { p0: type }));
    if (subcktFile(projectRef.current, type)) return setMessage(t('Choose a symbol from the library, not another subcircuit'));
    const ports = subPorts.map((n) => ({ name: n, dir: liveDoc.flags.find((f) => f.name === n)?.ioPin }));
    editSymbol(adoptSymbol(asy, ports, symText ? symParams(symText) : []));
    setMessage(t('Symbol {sym} adopted: check the port of each pin («Port of each pin», under the symbol)', { sym: baseName(type) }));
  };
  // testbenches del panel, con sus .param y .step (el activo, con lo que se está editando)
  const treeBenches = useMemo(() => {
    if (!treeOpen && !treePeek) return [];
    return variant.sims.map((x) => {
      const line = sims.items.find((y) => y.id === x.id)?.line ?? '';
      const d = x.id === sims.active && !curSub ? liveDoc : parseAsc(x.asc);
      return { id: x.id, name: simLabel(x) || t('No analysis'), detail: line ? analysisLabel(line) : t('No analysis'), ...(x.group ? { group: x.group } : {}), runs: x.runs.length, params: benchParams(d), steps: benchVariables(d) };
    });
  }, [treeOpen, treePeek, variant, sims, curSub, liveDoc]);

  // Panel de proyecto (#180): subcircuitos con sus usos y los que tienen adentro (el que se está
  // editando, con su texto actual)
  const treeSubs = useMemo((): TreeSub[] => {
    if (!treeOpen) return [];
    const p = curSub ? storeSubckt(project, curSub, ascText(liveDoc)) : storeActive(project, ascText(liveDoc));
    const label = (asc: string, nm?: string) => nm || (lineOf(asc) ? analysisLabel(lineOf(asc)) : t('No analysis'));
    return subckts(p).map((f) => {
      const name = subName(f.name);
      const stale = staleInstances(p, name, lib, label).map((u) => ({
        label: u.where.label,
        inst: u.inst,
        go: () => goUsage(u, name),
        detail: [
          ...(u.unconnected.length ? [u.unconnected.length === 1 ? t('pin {pins} not connected', { pins: u.unconnected[0] }) : t('pins {pins} not connected', { pins: u.unconnected.join(', ') })] : []),
          ...(u.dangling ? [t('a wire ends on the symbol without a pin (was a port removed?)')] : []),
        ].join('; '),
      }));
      return {
        ...(stale.length ? { stale } : {}),
        name,
        ports: subcktPorts(parseAsc(f.text)).length,
        uses: usages(p, name, (asc, nm) => nm || (lineOf(asc) ? analysisLabel(lineOf(asc)) : t('No analysis'))).map((u) => ({ label: u.where.label, inst: u.inst, go: () => goUsage(u, name) })),
        children: childSubckts(p, f.text),
        outdated: symbolOutdated(p, name),
        text: false,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeOpen, project, curSub, liveDoc, libVersion]);
  const toggleTree = () => {
    lsSet('turbospice.tree', treeOpen ? '0' : '1');
    setTreePref(!treeOpen);
  };

  const onProbe = (target: { net?: string; symbol?: number; pin?: number }) => {
    if (!sim || !plot) return;
    let expr = probeExpr(sim.built, target);
    // adentro de un subcircuito (#180): la red de esta instancia en la netlist del testbench
    const lv = pathRef.current[pathRef.current.length - 1];
    if (lv) {
      if (!lv.inst) return setMessage(t('To probe inside a subcircuit, enter it from an instance (double-click it in the testbench)'));
      // con el subcircuito tal como se simuló: tensiones y corrientes de los de adentro (#199)
      if (simScope) expr = probeExpr(sim.built, target, simScope);
      else {
        if (!target.net || target.net === '0') return setMessage(t('Inside a subcircuit the probe measures voltages (click a wire)'));
        const up = lv.ports.get(target.net.toLowerCase());
        if (up === '0') return;
        expr = `V(${up ?? lv.prefix + target.net})`;
      }
    }
    if (!expr) return;
    // con el foco en la caja de trazas, se escribe ahí (para armar una expresión)
    if (traceBox.current?.focused()) return traceBox.current.insert(expr);
    setPanel('plot');
    // con los resultados colapsados, mostrarlos para ver la traza
    if (expanded === 'schematic') setExpanded('');
    const i = Math.min(activePane, panes.length - 1);
    if (panes[i]?.traces.some((tt) => sameExpr(tt.expr, expr))) return;
    const sc = scaleOf(plot);
    if (!sc) return setMessage(t('{name} has no X axis: choose another analysis to plot', { name: plot.name }));
    try {
      evalTrace(expr, { resolve: resolver(plot), scale: sc.real, scaleName: sc.name });
    } catch {
      return setMessage(t('No data for {expr} in {name}', { expr, name: plot.name }));
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
  // parámetros de los dispositivos para elegir en la caja de trazas (#202)
  const traceHints = useMemo(() => (sim ? deviceParamTraces(sim.built) : undefined), [sim]);
  /** agrega la expresión al panel activo; devuelve el error si no se puede graficar */
  const addExpr = (expr: string): string | undefined => {
    if (!plot) return;
    const test = paneCurves({ traces: [{ expr }] }, { plot, runs: [plot], labels, resolver, mode });
    if (test.errors.size) {
      // un parámetro de dispositivo que no se guardó (#202): queda la traza y se guarda al simular de nuevo
      if (!deviceRefs(expr).length) return test.errors.get(0);
      const len = scaleOf(plot)?.real.length ?? 0;
      const missingOk = (p: SimPlot): Resolver => {
        const r = resolver(p);
        return (fn, args, run) => r(fn, args, run) ?? (fn === '@' ? { re: new Float64Array(len) } : null);
      };
      const again = paneCurves({ traces: [{ expr }] }, { plot, runs: [plot], labels, resolver: missingOk, mode });
      if (again.errors.size) return again.errors.get(0);
      setMessage(t('{expr} wasn\'t saved in this simulation: it will be saved when you simulate again', { expr }));
    }
    const next = addTraceTo(panes, activePane, expr);
    if (next !== panes) editPanes(next);
  };

  /** Ctrl+Espacio: volver a aplicar la vista guardada para el análisis (";.plot" o un .plt importado) */
  const reapplyView = () => {
    const v = plot && plotView[plotKind(plot.name)];
    if (v) editPanes(v);
    else setMessage(t('There\'s no saved view for this analysis (import one with a .plt)'));
  };
  const acceptOfferedView = () => {
    if (offerView) setPlotView({ ...offerView, ...plotView });
    setOfferView(null);
  };
  const importPlt = (bytes: Uint8Array) => {
    const v = parsePlt(decode(bytes).text);
    if (!Object.keys(v).length) return setMessage(t('The .plt has no views TurboSpice understands'));
    setPlotView({ ...plotView, ...v });
    if (plot && v[plotKind(plot.name)]) setPanes(v[plotKind(plot.name)]);
    setMessage(t('View imported from the .plt ({p0})', { p0: Object.keys(v).map((k) => `.${k}`).join(', ') }));
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
      const tt = doc.texts[ref.index];
      const ls = tt.text.split('\\n');
      // Como en LTspice: un comando de análisis abre el menú de simulación
      if (isControlBlock(tt.text)) setDialog({ kind: 'control', index: ref.index });
      else if (ls.length === 1 && ANALYSIS_LINE.test(ls[0])) setDialog({ kind: 'sim', found: { text: ref.index, line: 0, value: ls[0].trim() } });
      else setDialog({ kind: 'text', index: ref.index, textKind: tt.kind });
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
    if (miss.length) setMessage(t('Missing symbols: {p0}. Add them in File › My symbols and models.', { p0: miss.join(', ') }));
  };
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
  /** Ciclos (#199): un subcircuito no se puede colocar adentro de sí mismo, ni indirectamente */
  const makesCycle = (types: string[]): boolean => {
    const host = pathRef.current[pathRef.current.length - 1]?.sub;
    const c = host ? placingCycle(projectRef.current, host, types) : null;
    if (c) setMessage(c.toLowerCase() === host!.toLowerCase() ? t("{name} can't contain itself", { name: c }) : t("{name} can't go inside {host}: {name} already contains {host}", { name: c, host: host! }));
    return !!c;
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
    if (makesCycle(frag.symbols.map((x) => x.type))) return;
    const at = editor.current?.cursor() ?? { x: 0, y: 0 };
    const r = pasteItems(doc, frag, at, lib);
    if (!r.refs.length) return;
    commit(r.doc);
    setTool({ kind: 'select' });
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
    const built = sim && sameExceptData(sim.doc, doc) ? sim.built : await buildSimulation(doc, lib, ascName(), allTraces());
    download(`${base}.cir`, new Blob([built.netlist], { type: 'text/plain' }));
  };
  const exportImage = (f: 'svg' | 'png') => {
    const svg = editor.current?.svg();
    const box = editor.current?.contentBox();
    if (svg && box) exportSchematic(svg, box, project.name, f);
  };

  const openStudy = () => setDialog({ kind: 'study' });
  /**
   * Barrer un parámetro de un subcircuito en una instancia (#180): la instancia pasa a usar
   * {U1_G} y se agrega «.step param U1_G list <valor>», que el Estudio muestra como un barrido
   */
  const sweepSubParam = (index: number, param: string, value: string, attrs: Record<string, string>) => {
    const s = doc.symbols[index];
    if (!s) return;
    const def = lib.symbol(s.type);
    const inst = s.attrs.get('InstName') ?? 'X';
    const pname = `${inst}_${param}`.replace(/\W/g, '_');
    const eff = attrs.SpiceLine ?? effectiveAttrs(s, def).get('SpiceLine') ?? '';
    const defaults = parseParamList(def?.attrs.get('SpiceLine') ?? '');
    const cur = new Map(parseParamList(eff).map(([k, v]) => [k.toLowerCase(), v]));
    cur.set(param.toLowerCase(), `{${pname}}`);
    const line = formatParamList(defaults.map(([k, d]): [string, string] => [k, cur.get(k.toLowerCase()) ?? d]).filter(([k, v], i) => v !== defaults[i][1] && k));
    let d = setSymbolAttrs(doc, index, { ...attrs, SpiceLine: line });
    const step = `.step param ${pname} list ${/^\{.*\}$/.test(value) ? '1' : value}`;
    if (!d.texts.some((tt) => tt.kind === 'directive' && new RegExp(`\\.step\\s+param\\s+${pname}\\b`, 'i').test(tt.text))) {
      const ys = [...d.symbols.map((x) => x.y), ...d.texts.map((x) => x.y), ...d.wires.flatMap((w) => [w.y1, w.y2]), 0];
      const xs = [...d.symbols.map((x) => x.x), ...d.wires.flatMap((w) => [w.x1, w.x2]), 0];
      d = addText(d, { x: Math.min(...xs), y: Math.max(...ys) + 96, align: 'Left', size: 2, kind: 'directive', text: step });
    }
    setDialog(null);
    commit(d);
    setMessage(t('{inst}: {param} = {{pname}}, swept with {step}. Edit the values in the Study.', { inst, param, pname, step }));
    setDialog({ kind: 'study' });
  };
  const studyInfo = (): StudyInfo => {
    const found = findAnalysis(doc);
    const kind = found ? parseAnalysis(found.value)?.kind : undefined;
    const analysis = kind === 'ac' || kind === 'dc' || kind === 'noise' || kind === 'op' || kind === 'tf' ? kind : 'tran';
    const params = new Set<string>();
    for (const tt of doc.texts) {
      if (tt.kind !== 'directive') continue;
      for (const l of tt.text.split('\\n')) for (const m of l.matchAll(/^\s*\.param\s+(.*)$/gi)) for (const p of m[1].matchAll(/([A-Za-z_]\w*)\s*=/g)) params.add(p[1]);
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
  // (en cada render de la vista: ordenar las redes con localeCompare costaba, #187)
  const info = useMemo(
    (): CircuitInfo => ({
      nets: [...new Set(conn.nets.map((n) => n.name).filter((n) => n))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      sources: doc.symbols
        .map((s) => effectiveAttrs(s, lib.symbol(s.type)))
        .filter((a) => /^[VI]$/i.test(a.get('Prefix') ?? ''))
        .map((a) => a.get('InstName') ?? '')
        .filter(Boolean),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conn, doc, lib, libVersion],
  );
  const circuitInfo = () => info;

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
      if (ctrl && lk === 'p') return handled(), setQuickOpen(true);
      if (e.altKey && k === 'ArrowUp') return handled(), goUp();
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
              else setMessage(t('This analysis doesn\'t have several runs (.step)'));
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
      if (e.altKey && lk === 'b') return handled(), subFromSelection();
      if (e.altKey) return;
      if (ctrl) return;
      if (lk === 'z') return handled(), e.shiftKey ? editor.current?.zoomPrev() : zoomBox();
      switch (k) {
        case 'Escape':
          plotPanel.current?.action('cancel');
          setTool({ kind: 'select' });
          setSelection([]);
          return;
        case 'e':
        case 'Enter': {
          const sel = selection.length === 1 && selection[0].kind === 'symbol' ? selection[0].index : -1;
          if (sel >= 0 && descend(sel)) return handled();
          if (k === 'Enter') return;
          return handled(), setMessage(t('Select an instance of a project subcircuit to enter it (E or double-click)'));
        }
        case 'a':
          return handled(), openSimulation();
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
        case 'w':
          return handled(), setTool({ kind: 'wire', start: null });
        case 'n':
          return handled(), setDialog({ kind: 'flag' });
        case 'Delete':
        case 'Backspace':
          return handled(), deleteSelection();
        case '?':
          return handled(), setDialog({ kind: 'help' });
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

  // Importar a este proyecto (#157): un .zip (cada carpeta, y la raíz, es una variante) o archivos
  // sueltos (cada .asc, una variante); los símbolos y modelos van a los archivos del proyecto
  const importInput = useRef<HTMLInputElement>(null);
  const importFiles = async (list: File[]) => {
    // un .turbo es un proyecto entero: se abre (Abrir lleva a Importar)
    const turbo = list.find((f) => /\.turbo$/i.test(f.name));
    if (turbo) {
      if (!confirmDiscard()) return;
      try {
        return void (await openBytes(new Uint8Array(await turbo.arrayBuffer()), turbo.name, {}));
      } catch (e) {
        return setMessage(t('Could not open: {p0}', { p0: (e as Error).message }));
      }
    }
    try {
      let p = leave();
      const variants: string[] = [];
      const files: Project['files'] = [];
      const loose: ZipEntry[] = [];
      for (const f of list) {
        const data = new Uint8Array(await f.arrayBuffer());
        if (!/\.zip$/i.test(f.name)) {
          loose.push({ path: f.name, data });
          continue;
        }
        const r = importEntries(p, await readZip(data), f.name);
        p = r.project;
        variants.push(...r.variants);
        files.push(...r.files);
      }
      if (loose.length) {
        const r = importEntries(p, loose);
        p = r.project;
        variants.push(...r.variants);
        files.push(...r.files);
      }
      const merged = await mergeFiles(p.files, files, askConflict);
      enter(asBenches({ ...p, files: merged.files }), true);
      markDirty();
      const parts = [
        ...(variants.length ? [`${variants.length === 1 ? t('the testbench') : t('{length} testbenches:', { length: variants.length })} ${variants.join(', ')}`] : []),
        ...(merged.added.length ? [`${merged.added.length === 1 ? t('the file') : t('{length} files:', { length: merged.added.length })} ${merged.added.join(', ')}`] : []),
      ];
      setMessage(parts.length ? t('Imported {p0}', { p0: parts.join(' y ') }) : t('There was nothing to import (.asc, .asy, .lib, .sub or .zip)'));
    } catch (e) {
      setMessage(t('Could not import: {p0}', { p0: (e as Error).message }));
    }
  };
  // Exportar e importar subcircuitos (#180)
  const subImport = useRef<HTMLInputElement>(null);
  const exportSub = (name: string) => {
    const z = exportSubcktZip(snapshot(), name, lib);
    if (z) download(z.name, new Blob([z.bytes as BlobPart], { type: 'application/zip' }));
  };
  /** Copia el subcircuito (con su símbolo, los subcircuitos y modelos que usa) a My symbols and models (#199) */
  const subToUser = (name: string) => {
    const files = subcktFilesFor(snapshot(), name);
    if (!files.length) return;
    const next = [...userFiles];
    const added: string[] = [];
    const kept: string[] = [];
    for (const f of files) {
      if (f.kind === 'verilog') continue;
      const i = next.findIndex((x) => x.name.toLowerCase() === f.name.toLowerCase());
      // uno distinto con el mismo nombre no se pisa (lo más conservador): se avisa
      if (i >= 0 && next[i].text !== f.text) {
        kept.push(f.name);
        continue;
      }
      const uf: UserFile = { name: f.name, kind: f.kind, text: f.text, time: Date.now() };
      if (i >= 0) next[i] = uf;
      else next.push(uf);
      registerUserFile(lib, uf);
      added.push(f.name);
    }
    storeUserFiles(next);
    setMessage(
      [
        ...(added.length ? [t('Copied to My symbols and models: {p0}', { p0: added.join(', ') })] : []),
        ...(kept.length ? [t('Not replaced (My symbols and models already has a different one): {p0}', { p0: kept.join(', ') })] : []),
      ].join(' · '),
    );
  };
  const exportSubNetlist = (name: string) => {
    const r = exportSubcktNetlist(snapshot(), name, lib);
    if (!r) return setMessage(t('{name} has no ports: there is nothing to export as .sub', { name }));
    download(r.name, new Blob([r.text], { type: 'text/plain' }));
    if (r.warnings.length) setMessage(r.warnings[0]);
  };
  const importSubckts = async (list: File[]) => {
    try {
      const entries: ZipEntry[] = [];
      for (const f of list) {
        const data = new Uint8Array(await f.arrayBuffer());
        if (/\.zip$/i.test(f.name)) entries.push(...(await readZip(data)));
        else entries.push({ path: f.name, data });
      }
      const p0 = snapshot();
      const incoming = subcktFilesFrom(entries, p0.files, (n, asc) => subcktSymbol(n, parseAsc(asc)));
      const subs = incoming.filter((f) => f.kind === 'schematic').map((f) => f.name.replace(/\.asc$/i, ''));
      if (!incoming.length) return setMessage(t('There was nothing to import (.zip, .asc, .asy, .lib or .sub)'));
      const merged = await mergeFiles(p0.files, incoming, askConflict);
      const p = { ...p0, modified: Date.now(), files: merged.files };
      projectRef.current = p;
      editProject(p);
      setMessage(subs.length ? t('Imported subcircuits: {list}', { list: subs.join(', ') }) : t('Imported: {list}', { list: merged.added.join(', ') }));
    } catch (e) {
      setMessage(t('Could not import: {p0}', { p0: (e as Error).message }));
    }
  };
  const exportZip = (all: boolean) => {
    const p = snapshot();
    const z = all ? exportAllZip(p, lib) : exportVariantZip(p, p.activeVariant, lib);
    download(z.name, new Blob([z.bytes as BlobPart], { type: 'application/zip' }));
  };

  // Arrastrar y soltar: un .turbo o un .asc se abre; un .plt es una vista; lo demás (varios
  // archivos, un .zip, símbolos y modelos) se importa al proyecto
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = async (e: DragEvent) => {
      e.preventDefault();
      const all = [...(e.dataTransfer?.files ?? [])];
      const f = all[0];
      if (!f) return;
      if (f.name.toLowerCase().endsWith('.plt')) return importPlt(new Uint8Array(await f.arrayBuffer()));
      if (all.length > 1 || !/\.(turbo|asc)$/i.test(f.name)) return importFiles(all);
      if (/\.turbo$/i.test(f.name)) return confirmDiscard() && openBytes(new Uint8Array(await f.arrayBuffer()), f.name);
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
    { label: t('Line'), shortcut: 'J', onClick: shapeTool('LINE') },
    { label: t('Rectangle'), shortcut: 'K', onClick: shapeTool('RECTANGLE') },
    { label: t('Circle'), shortcut: 'O', onClick: shapeTool('CIRCLE') },
    { label: t('Arc'), shortcut: 'U', onClick: shapeTool('ARC') },
    'sep',
    { label: t('Line style…'), onClick: () => openLineStyle() },
  ];
  // Desplegable de Simular: los tipos de análisis (configuran la simulación del testbench, con
  // sus parámetros en la barra), los comandos a mano y los análisis programados. Los testbenches
  // se eligen en el panel del proyecto (#180)
  const simItems: MenuItem[] = [
    ...ANALYSES.map((x) => ({ label: x.label, title: docLine ? t('New testbench with this simulation: {help}', { help: x.help }) : t('Simulation of this testbench: {help}', { help: x.help }), checked: ANALYSIS_LINE.exec(docLine)?.[1].toLowerCase() === x.kind, onClick: () => newSim(x.kind) })),
    'sep',
    { label: t('Simulation command…'), shortcut: 'A', onClick: () => openSimulation() },
    { label: t('SPICE directive…'), shortcut: '.', onClick: () => setDialog({ kind: 'text', textKind: 'directive' }) },
    'sep',
    { label: t('Study…'), shortcut: 'Alt+E', onClick: openStudy },
    { label: t('.control block…'), shortcut: 'Alt+C', onClick: openControl },
  ];
  const menus: MenuDef[] = [
    {
      label: t('File'),
      items: [
        { label: t('New project'), onClick: doNew },
        { label: t('Open…'), title: t('Import: .turbo, .zip, .asc, .asy, .lib, .sub'), shortcut: 'Ctrl+O', onClick: doOpen },
        ...(google.account ? [{ label: t('My simulations (Google Drive)…'), onClick: () => setDialog({ kind: 'drive' }) }] : []),
        ...(google.account ? [{ label: t('Import from computer…'), onClick: () => doImport() }] : []),
        { label: t('Save'), shortcut: 'Ctrl+S', onClick: () => doSave(false) },
        { label: t('Save as…'), shortcut: 'Ctrl+Shift+S', onClick: () => doSave(true) },
        ...(google.account ? [{ label: t('Export to computer…'), onClick: () => doSaveLocal(true) }] : []),
        { label: t('Export to PDF'), title: t('The current view of the schematic'), onClick: doExportPdf },
        'sep',
        { label: t('Import into this project…'), title: t('.zip, .asc (each one, a testbench), .asy, .lib, .sub'), onClick: () => setDialog({ kind: 'importinfo' }) },
        { label: t('Export project'), title: t('A .zip for LTspice: an .asc per testbench and the project files they use'), onClick: () => exportZip(true) },
        'sep',
        { label: t('Share link…'), onClick: doShare },
        { label: t('Project files…'), title: t('Subcircuits, symbols and models saved in the .turbo, for all testbenches'), onClick: () => setDialog({ kind: 'projectfiles' }) },
        { label: t('My symbols and models…'), onClick: () => setDialog({ kind: 'userfiles' }) },
        {
          label: ltIndex ? t('LTspice library') : t('Import LTspice library…'),
          items: [
            { label: ltIndex ? t('Import again…') : t('Choose the lib folder…'), onClick: () => ltInput.current?.click() },
            ...(ltIndex
              ? [
                  { label: t('{symbols} symbols, {models} model files ({p2})', { symbols: ltIndex.count.symbols, models: ltIndex.count.models, p2: new Date(ltIndex.time).toLocaleDateString(locale()) }), disabled: true, onClick: () => {} },
                  { label: t('Remove'), onClick: doRemoveLtspice },
                ]
              : []),
          ],
        },
        'sep',
        {
          label: t('Examples'),
          items: [
            { label: 'Sample Project', onClick: () => doExample(SAMPLE) },
            'sep',
            ...EXAMPLES.map((x) => ({ label: x, title: t('Testbench of the «Examples» project'), onClick: () => doExample(EXAMPLES_TURBO, x) })),
          ],
        },
        {
          label: t('Recent'),
          items: recent.map((r, i) => ({
            label: `${r.name.replace(/\.(asc|turbo)$/i, '')}${r.unsaved ? t(' (unsaved)') : ''}`,
            title: new Date(r.time).toLocaleString(locale()),
            onClick: () => doRecent(i),
          })),
        },
        'sep',
        { label: t('Export schematic to SVG'), onClick: () => exportImage('svg') },
        { label: t('Export schematic to PNG'), onClick: () => exportImage('png') },
        { label: t('Export LTspice netlist (.net)'), onClick: () => exportNetlist('net') },
        { label: t('Export ngspice netlist (.cir)'), onClick: () => exportNetlist('cir') },
      ],
    },
    {
      label: t('Edit'),
      items: [
        { label: t('Undo'), shortcut: 'Ctrl+Z', onClick: history.undo, disabled: !history.canUndo },
        { label: t('Redo'), shortcut: 'Ctrl+Shift+Z', onClick: history.redo, disabled: !history.canRedo },
        'sep',
        { label: t('Cut'), shortcut: 'Ctrl+X', onClick: () => copySelection(true), disabled: !selection.length },
        { label: t('Copy'), shortcut: 'Ctrl+C', onClick: () => copySelection(), disabled: !selection.length },
        { label: t('Paste'), shortcut: 'Ctrl+V', onClick: paste },
        { label: t('Delete'), shortcut: 'Del', onClick: deleteSelection },
        { label: t('Select all'), shortcut: 'Ctrl+A', onClick: () => (setTool({ kind: 'select' }), selectAll()) },
        'sep',
        { label: t('Rotate'), shortcut: 'Ctrl+R', onClick: () => rotateOrMirror('rotate') },
        { label: t('Mirror'), shortcut: 'Ctrl+E', onClick: () => rotateOrMirror('mirror') },
        'sep',
        { label: t('Move (without stretching wires)'), shortcut: 'M', onClick: () => startMove(false) },
        { label: t('Drag (stretching wires)'), shortcut: 'S', onClick: () => startMove(true) },
      ],
    },
    {
      label: t('Draw'),
      items: [
        { label: t('Wire'), shortcut: 'W', onClick: () => setTool({ kind: 'wire', start: null }) },
        { label: t('Component…'), shortcut: 'P', onClick: () => setDialog({ kind: 'picker' }) },
        { label: t('Resistor'), shortcut: 'R', onClick: placeTool('res') },
        { label: 'Capacitor', shortcut: 'C', onClick: placeTool('cap') },
        { label: 'Inductor', shortcut: 'L', onClick: placeTool('ind') },
        { label: t('Diode'), shortcut: 'D', onClick: placeTool('diode') },
        { label: t('Voltage source'), shortcut: 'V', onClick: placeTool('voltage') },
        { label: t('Current source'), shortcut: 'I', onClick: placeTool('current') },
        { label: t('Ground'), shortcut: 'G', onClick: () => setTool({ kind: 'flag', name: '0' }) },
        { label: t('Net label…'), shortcut: 'N', onClick: () => setDialog({ kind: 'flag' }) },
        'sep',
        { label: t('SPICE directive…'), shortcut: '.', onClick: () => setDialog({ kind: 'text', textKind: 'directive' }) },
        { label: t('Comment…'), shortcut: 'T', onClick: () => setDialog({ kind: 'text', textKind: 'comment' }) },
        'sep',
        ...shapeItems,
      ],
    },
    {
      label: t('Simulate'),
      items: [
        { label: t('Simulate'), shortcut: 'Alt+R', onClick: run, disabled: running || status.kind === 'loading' },
        { label: t('Abort'), shortcut: 'Alt+S', onClick: abort, disabled: !running },
        { label: t('View the log'), shortcut: 'Ctrl+L', onClick: showLog, disabled: !sim },
        'sep',
        ...simItems,
        'sep',
        { label: t('Probe'), onClick: () => setTool({ kind: 'probe' }), disabled: !sim },
        { label: t('Annotate operating point'), onClick: () => setShowOp((v) => !v), disabled: !bias, checked: showOp },
      ],
    },
    {
      label: t('View'),
      items: [
        { label: t('Fit to view'), shortcut: t('Space'), onClick: () => editor.current?.fit() },
        { label: t('Zoom to a box'), shortcut: 'Z', onClick: zoomBox },
        { label: t('Previous zoom'), shortcut: 'Shift+Z', onClick: () => editor.current?.zoomPrev() },
        { label: t('Grid'), shortcut: 'Ctrl+G', onClick: () => setShowGrid((v) => !v), checked: showGrid },
        { label: t('Unconnected pin marks'), shortcut: 'Ctrl+U', onClick: () => setShowLoose((v) => !v), checked: showLoose },
        { label: t('Show the directives on the schematic'), title: t('Draw .tran, .ac…, .param, .step, .meas and .control on the schematic, like LTspice (they are edited from the simulation bar, the project panel and the Study)'), onClick: toggleSimCommand, checked: showSimCommand },
        { label: t('Net names'), shortcut: 'Alt+N', onClick: () => setShowNets((v) => !v), checked: showNets },
        { label: t('Results on the side'), onClick: () => setSide(!resultsSide), checked: resultsSide },
        { label: t('Project panel (subcircuits)'), onClick: toggleTree, checked: treeOpen },
        { label: t('Results panel'), shortcut: 'Ctrl+1 / Ctrl+0', onClick: toggleResultsPanel, disabled: !sim, checked: resultsShown },
        'sep',
        { label: t('Netlist editor (SPICE)'), onClick: onNetlist },
        'sep',
        { label: t('Automatic theme (system)'), onClick: () => setTheme('auto'), checked: theme === 'auto' },
        { label: t('Light theme'), onClick: () => setTheme('light'), checked: theme === 'light' },
        { label: t('Dark theme'), onClick: () => setTheme('dark'), checked: theme === 'dark' },
      ],
    },
    {
      label: t('Settings'),
      items: [
        { label: t('Show the project panel when the mouse approaches the edge (in select mode)'), onClick: () => setHoverReveal(!hoverReveal), checked: hoverReveal },
      ],
    },
    {
      label: t('Help'),
      items: [
        { label: t('Keyboard shortcuts'), shortcut: '?', onClick: () => setDialog({ kind: 'help' }) },
        { label: t('Report a problem'), onClick: () => window.open(`${REPO}/issues`, '_blank', 'noopener') },
      ],
    },
    // directo en el menú (no dentro de Ayuda), con ícono, para que se encuentre
    { label: t('About TurboSpice'), icon: 'info', onClick: () => setDialog({ kind: 'about' }) },
  ];

  // Problemas de la última simulación: avisos de la traducción y errores de ngspice; los que
  // nombran un componente llevan a él
  const problems = sim
    ? [
        ...sim.result.errors.map((text) => ({ kind: 'err' as const, text })),
        ...sim.built.warnings.map((text) => ({ kind: missingSymbolIn(text) !== null ? ('err' as const) : ('warn' as const), text })),
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
      label: t('File'),
      tools: [
        { icon: 'new', label: t('New'), title: t('New project'), onClick: doNew },
        { icon: 'save', label: t('Save'), title: google.account ? t('Save to Google Drive') : t('Save'), shortcut: 'Ctrl+S', onClick: () => doSave(false) },
        { icon: 'pdf', label: t('Export to PDF'), title: t('Export the current view to PDF'), onClick: doExportPdf },
        { icon: 'open', label: t('Open'), title: t('Open (import .turbo, .zip, .asc…)'), shortcut: 'Ctrl+O', onClick: doOpen },
      ],
    },
    {
      id: 'history',
      label: t('History'),
      tools: [
        { icon: 'undo', label: t('Undo'), title: t('Undo'), shortcut: 'Ctrl+Z', onClick: history.undo, disabled: !history.canUndo },
        { icon: 'redo', label: t('Redo'), title: t('Redo'), shortcut: 'Ctrl+Shift+Z', onClick: history.redo, disabled: !history.canRedo },
      ],
    },
    {
      id: 'draw',
      label: t('Drawing'),
      tools: [
        { icon: 'select', label: t('Select'), title: t('Select and move'), shortcut: 'Esc', onClick: () => setTool({ kind: 'select' }), active: tool.kind === 'select' },
        { icon: 'wire', label: t('Wire'), title: t('Wire'), shortcut: 'W', onClick: () => setTool({ kind: 'wire', start: null }), active: tool.kind === 'wire' },
        { icon: 'component', label: t('Component'), title: t('Component'), shortcut: 'P', onClick: () => setDialog({ kind: 'picker' }), active: tool.kind === 'place' },
        { icon: 'ground', label: t('Ground'), title: t('Ground (GND)'), shortcut: 'G', onClick: () => setTool({ kind: 'flag', name: '0' }), active: tool.kind === 'flag' && tool.name === '0' },
        { icon: 'label', label: t('Label'), title: t('Net label'), shortcut: 'N', onClick: () => setDialog({ kind: 'flag' }) },
        { icon: 'text', label: t('Text'), title: t('Text (comment)'), shortcut: 'T', onClick: () => setDialog({ kind: 'text', textKind: 'comment' }) },
        { icon: 'shapes', label: t('Shapes'), title: t('Shapes: line, rectangle, circle, arc'), items: shapeItems, active: tool.kind === 'shape' },
        { icon: 'directive', label: t('Directive'), title: t('Free SPICE directive'), shortcut: '.', onClick: () => setDialog({ kind: 'text', textKind: 'directive' }) },
      ],
    },
    {
      id: 'edit',
      label: t('Editing'),
      tools: [
        { icon: 'fit', label: t('Fit'), title: t('Fit to view (Z: zoom to a box, Shift+Z: previous zoom)'), shortcut: t('Space'), onClick: () => editor.current?.fit() },
        { icon: 'move', label: t('Move'), title: t('Move (without stretching wires)'), shortcut: 'M', onClick: () => startMove(false), active: tool.kind === 'move' && !tool.stretch },
        { icon: 'drag', label: t('Drag'), title: t('Drag (stretching wires)'), shortcut: 'S', onClick: () => startMove(true), active: tool.kind === 'move' && tool.stretch },
        { icon: 'rotate', label: t('Rotate'), title: t('Rotate'), shortcut: 'Ctrl+R', onClick: () => rotateOrMirror('rotate') },
        { icon: 'mirror', label: t('Mirror'), title: t('Mirror'), shortcut: 'Ctrl+E', onClick: () => rotateOrMirror('mirror') },
        { icon: 'delete', label: t('Delete'), title: t('Delete'), shortcut: 'Del', onClick: deleteSelection, active: tool.kind === 'delete' },
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
          label: t('Export'),
          items: [
            { label: t('Traces to CSV'), disabled: !canExportPlot, onClick: () => download(`${exportBase()}.csv`, new Blob([plotPanel.current?.csv() ?? ''], { type: 'text/csv' })) },
            {
              label: t('Plot to PNG'),
              disabled: !canExportPlot,
              onClick: async () => {
                const b = await plotPanel.current?.png();
                if (b) download(`${exportBase()}.png`, b);
              },
            },
            { label: t('View to .plt (LTspice)'), onClick: () => exportPlt() },
            { label: t('Import .plt view…'), shortcut: 'O', onClick: () => pltInput.current?.click() },
            'sep',
            { label: 'Netlist .cir (ngspice)', onClick: () => download(`${exportBase()}.cir`, new Blob([sim.built.netlist], { type: 'text/plain' })) },
            { label: 'Netlist .net (LTspice)', onClick: () => download(`${exportBase()}.net`, new Blob([`* ${ascName()}
${ltNetlistText(sim.built.lt)}
`], { type: 'text/plain' })) },
          ],
        },
        'sep',
        { label: 'Netlist', checked: panel === 'netlist', onClick: () => setPanel('netlist') },
        ...(sim.meas ? [{ label: t('Measurements ({length})', { length: sim.meas.names.length }), checked: panel === 'meas', onClick: () => setPanel('meas') }] : []),
        { label: t('Problems{p0}', { p0: problems.length ? ` (${problems.length})` : '' }), checked: panel === 'problems', onClick: () => setPanel('problems') },
        { label: 'Log', shortcut: 'Ctrl+L', checked: panel === 'log', onClick: () => setPanel('log') },
      ];

  return (
    <div className="schematic-mode">
      {slots.tools && createPortal(<Toolbar label={t('Tools')} groups={toolGroups} lead={<AppMenu menus={menus} />} />, slots.tools)}
      {slots.right &&
        createPortal(
          <>
            <button
              className="theme-btn"
              aria-label={t('Change theme')}
              title={t('Theme: {p0}', { p0: theme === 'auto' ? t('automatic (system)') : theme === 'light' ? t('light') : t('dark') })}
              onClick={() => setTheme(theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto')}
            >
              <Icon name={theme === 'dark' ? 'moon' : 'sun'} />
              {theme === 'auto' && <span className="auto">A</span>}
            </button>
            <button
              className="lang-btn"
              aria-label={t('Change language')}
              title={t('Language: English · Spanish (the page reloads; your work is kept)')}
              onClick={switchLang}
            >
              <span className={getLang() === 'en' ? 'on' : ''}>EN</span>
              <span className={getLang() === 'es' ? 'on' : ''}>ES</span>
            </button>
            <button className="share-btn" aria-label={t('Share')} title={t('Copy a link that opens this circuit')} onClick={doShare}>
              <Icon name="share" />
              <span className="txt">{t('Share')}</span>
            </button>
          </>,
          slots.right,
        )}
      {slots.tabs &&
        createPortal(
          <>
            {/* vistas: con las dos prendidas, pantalla partida */}
            <nav className="tabs view-tabs" aria-label={t('Views')}>
              <button className={schematicShown ? 'active' : ''} aria-pressed={schematicShown} onClick={showSchematicView} title={!sim ? t('Schematic') : schematicShown && resultsShown ? t('Schematic full screen (Ctrl+1)') : schematicShown ? t('Schematic') : t('Add the schematic in split screen (Ctrl+0)')}>
                {t('Schematic')}
              </button>
              <button
                className={resultsShown ? 'active' : ''}
                aria-pressed={resultsShown}
                disabled={!sim}
                onClick={showResultsView}
                title={!sim ? t('No results yet: simulate first') : schematicShown && resultsShown ? t('Results full screen (Ctrl+2)') : resultsShown ? t('Results') : t('Add the results in split screen (Ctrl+0)')}
              >
                {t('Results')}
              </button>
            </nav>
            <div className="layout-btns" role="group" aria-label={t('Results layout')}>
              <button className={resultsSide ? 'active' : ''} aria-pressed={resultsSide} aria-label={t('Results on the side')} title={t('Results on the side')} onClick={() => setSide(true)}>
                <Icon name="layoutSide" size={16} />
              </button>
              <button className={!resultsSide ? 'active' : ''} aria-pressed={!resultsSide} aria-label={t('Results below')} title={t('Results below')} onClick={() => setSide(false)}>
                <Icon name="layoutStack" size={16} />
              </button>
            </div>
            <span className="appbar-sep" />
          </>,
          slots.tabs,
        )}
      {/* segunda barra: el proyecto (árbol y cápsula) y la simulación */}
      <div className="iconbar sim-row" role="toolbar" aria-label={t('Simulation')}>
        <div className="group fixed">
            <button className={`proj-toggle${treeOpen ? ' on' : ''}`} onClick={toggleTree} aria-pressed={treeOpen} aria-label={t('Project panel')} title={t('Project panel: testbenches and subcircuits')}>
              <Icon name="tree" />
            </button>
            <ProjectCapsule
              project={project.name}
              bench={(curSim && simName(curSim)) || t('No analysis')}
              taken={sims.items.filter((x) => x.id !== sims.active).map((x) => simName(x))}
              dirty={dirty}
              onRenameProject={renameProject}
              onRenameBench={(name) => editProject(renameProjectSim(projectRef.current, sims.active, name))}
            />
            <span className="tb-sep" />
            {/* New simulation elige el análisis (en otro testbench si éste ya tiene); Run corre el elegido */}
            <MenuButton items={simItems} label={t('New simulation')} title={t('Simulations and analysis types')} className={canRun ? "labeled" : "primary"} openRef={simMenu}>
              {t('New simulation')} <Icon name="caret" size={14} />
            </MenuButton>
            {running ? (
              <button className="labeled" onClick={abort} aria-label={t('Abort')} title={t('Abort the simulation (Alt+S)')}>
                <Icon name="stop" /> {t('Abort')}
              </button>
            ) : (
              <button
                className={canRun ? "primary" : "run-off"}
                onClick={simulate}
                disabled={status.kind === 'loading' || !!curSub}
                aria-label={t('Run|verb')}
                aria-keyshortcuts="Alt+R Control+Enter"
                title={curSub ? t('Subcircuits are not simulated on their own: go up to a testbench (Alt+↑) to simulate') : canRun ? t('Run the simulation with these parameters (Alt+R / Ctrl+Enter)') : t('Choose what to simulate')}
              >
                <Icon name="run" /> {t('Run|verb')}
              </button>
            )}
            {/* siempre a la vista, separados de Simular; se habilitan cuando hay resultados (y punto de operación) */}
            <span className="tb-sep" />
            <button
              className={tool.kind === 'probe' ? 'active' : ''}
              aria-label={t('Measure')}
              title={sim ? t('Probe: click a wire (voltage) or a component (current)') : t('Probe: simulate first')}
              disabled={!sim}
              onClick={() => setTool(tool.kind === 'probe' ? { kind: 'select' } : { kind: 'probe' })}
            >
              <Icon name="probe" />
            </button>
            <button className={showNets ? 'active' : ''} aria-label={t('Nets')} aria-keyshortcuts="Alt+N" title={t('Show the names of all the nets, without changing the schematic') + ' (Alt+N)'} onClick={() => setShowNets((v) => !v)}>
              <Icon name="nets" />
            </button>
            <button
              className={showOp && bias ? 'active' : ''}
              aria-label={t('Annotate OP')}
              title={bias ? (/^\.tran\b/i.test(docLine) ? t('Annotate the values at t = 0 on the schematic: the bias with the initial conditions (with uic, the initial state)') : t('Annotate the operating point on the schematic (without changing it)')) : sim ? t('Operating point: the circuit changed since the last simulation') : t('Operating point: simulate first')}
              disabled={!bias}
              onClick={() => setShowOp((v) => !v)}
            >
              <Icon name="op" />
            </button>
        </div>
        <div className="bar-after">
          {curSub ? (
            <span className="sub-simbar">{t('Subcircuit {name}: it is simulated from the testbenches that use it', { name: curSub })}</span>
          ) : (
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
                    ? t('done in {p0} ms', { p0: status.ms.toFixed(0) })
                    : undefined
            }
            stale={!sim && !!curSim?.view?.panes.some((p) => p.traces.length)}
            running={running}
            picker={picker}
            onApply={(line) => (curSub ? setMessage(t('The analysis belongs to the testbench: go up (Alt+↑) to change it')) : commit(setAnalysisLine(doc, line)))}
            onRun={run}
            onDelete={deleteActive}
          />
          )}
        </div>
      </div>

      <div className={`workspace${resultsSide ? ' side' : ''}${sim && expanded ? ` expand-${expanded}` : ''}`}>
        <div
          onMouseMove={(e) => {
            // acercar el mouse al borde izquierdo muestra el panel (si se tildó, en modo selección)
            if (!hoverReveal || treeOpen || treePeek || tool.kind !== 'select') return;
            if (e.clientX - e.currentTarget.getBoundingClientRect().left < 14) setTreePeek(true);
          }}
          className={`canvas-wrap${hierOn ? ' with-hier' : ''}${treeOpen ? ' with-tree' : ''}${curSub && symText ? ' with-sym' : ''}${historyOpen && curSim && !curSub ? ' with-history' : ''}`}
          // con el foco en la caja de trazas, un click en el esquemático no se lo saca: la punta
          // de prueba escribe ahí el nodo o componente
          onMouseDownCapture={(e) => traceBox.current?.focused() && e.preventDefault()}
        >
          {hierOn && (
          <HierBar
            testbench={(curSim && simName(curSim)) || variant.name}
            path={path}
            onCrumb={(i) => go(path.slice(0, i + 1))}
            onUp={goUp}
            onQuick={() => setQuickOpen(true)}
          />
          )}
          {treeShown && (
            <ProjectTree
              project={project.name}
              benches={treeBenches}
              groups={project.groups}
              peek={!treeOpen && treePeek}
              onBenchItem={benchItem}
              onNewGroup={newGroup}
              onGroupAction={groupAction}
              onMoveBench={moveBench}
              onLeave={() => setTreePeek(false)}
              activeBench={sims.active}
              subs={treeSubs}
              current={curSub}
              onBench={goSim}
              onTestbench={() => path.length && go([])}
              onNewBench={newEmptyBench}
              onBenchAction={benchAction}
              onOpen={(n) => openSub(n)}
              onNew={newSubckt}
              onFromSelection={selection.length ? subFromSelection : undefined}
              onRename={renameSub}
              onDelete={deleteSub}
              onExport={exportSub}
              onExportNetlist={exportSubNetlist}
              onToUser={subToUser}
              onImport={() => subImport.current?.click()}
              onUpdateSymbol={(n) => {
                const p = updateSymbol(snapshot(), n);
                projectRef.current = p;
                editProject(p);
              }}
              onClose={() => (treeOpen ? toggleTree() : setTreePeek(false))}
            />
          )}
          {quickOpen &&
            createPortal(
            <QuickOpen
              items={[
                ...sims.items.map((x) => ({ key: `v:${x.id}`, label: simName(x) || t('No analysis'), hint: t('testbench') })),
                ...subckts(project).map((f) => ({ key: `s:${subName(f.name)}`, label: subName(f.name), hint: t('subcircuit') })),
              ]}
              onPick={(k) => {
                const id = k.slice(2);
                if (k.startsWith('s:')) return openSub(id);
                if (id !== sims.active) return goSim(id);
                if (path.length) go([]);
              }}
              onClose={() => setQuickOpen(false)}
            />,
              document.body,
            )}
          <input
            ref={subImport}
            data-subckt-import
            type="file"
            hidden
            multiple
            accept=".zip,.asc,.asy,.lib,.sub,.mod,.inc,.cir,.txt"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length) importSubckts(files);
            }}
          />
          {curSub && symText && (
            <SymbolEditor
              name={curSub}
              text={symText}
              ports={subPorts}
              onChange={editSymbol}
              onParams={(ps) => editSymbol(setSymParams(symText, ps))}
              onReset={() => editSymbol(setSymParams(subcktSymbol(curSub, liveDoc).text, symParams(symText)))}
              onPickSymbol={() => setDialog({ kind: 'picker', forSymbol: true })}
            />
          )}
          {ctxMenu && createPortal(<ContextMenu at={ctxMenu.at} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />, document.body)}
          <SchematicEditor
            handle={editor}
            onSymbolMenu={symbolMenu}
            onDescend={descend}
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
            onDropSubckt={(name) => {
              const f = subcktFile(projectRef.current, name);
              return f && !viewRun && !makesCycle([subName(f.name)]) ? subName(f.name) : null;
            }}
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
            onHover={onHover}
            diff={historyDiff}
          />
          {historyOpen && curSim && !curSub && (
            <HistoryPanel
              sim={simName(curSim) || t('No analysis')}
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
              {t('Run from')}{' '}{new Date(viewed.time).toLocaleString(locale())} {t('· read-only')}
              <button onClick={() => restoreRun(viewed.id)}>{t('Restore')}</button>
              <button onClick={() => setViewRun('')}>{t('Back to current')}</button>
            </div>
          )}
          {picking && (
            <div className="pick-banner">
              {picking.what === 'net' ? t('Pick a net on the schematic') : picking.what === 'source' ? t('Pick a source (V or I) on the schematic') : t('Pick a component on the schematic')}
              <button onClick={() => endPick(null)}>{t('Cancel')}</button>
            </div>
          )}
          {valueOffer && !picking && (
            <div className="pick-banner">
              {valueOffer.changes.map((c) => `${c.inst} = ${c.from}`).join(', ')} {t('also in')}{' '}
              {valueOffer.sims.length === 1 ? t('1 simulation') : t('{length} simulations', { length: valueOffer.sims.length })}
              <button onClick={applyValueOffer} title={t('Change to {p0} in the other simulations', { p0: valueOffer.changes.map((c) => `${c.inst} = ${c.to}`).join(', ') })}>
                {t('Apply')}
              </button>
              <button onClick={() => setValueOffer(null)}>No</button>
            </div>
          )}
          {offerView && !picking && (
            <div className="pick-banner">
              {t('There\'s a results view of')}{' '}{file.name} {t('saved in this browser. Add it to the .asc?')}
              <button onClick={acceptOfferedView}>{t('Add')}</button>
              <button onClick={() => setOfferView(null)}>No</button>
            </div>
          )}
          {/* Archivo › Importar a este proyecto */}
          <input
            ref={importInput}
            type="file"
            hidden
            multiple
            accept=".turbo,.zip,.asc,.asy,.lib,.sub,.mod,.inc,.cir,.txt,.lb"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length) importFiles(files);
            }}
          />
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
          <HintBar sink={hoverSink} text={(hover) => (tool.kind === 'select' ? (hover?.ref ? hoverInfo(doc, lib, conn, hover.ref).join(' · ') : hover ? hoverCoords(hover.at) : '') : toolHint(tool))} />
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
              <div className="split" role="group" aria-label={t('Results view')}>
                <button className="active" onClick={() => setPanel('plot')} title={t('Back to the results plot')}>
                  {t('Results')}
                </button>
                <MenuButton items={resultsItems} label={t('More results views')} title={t('Export, netlist, log and problems')} className="active">
                  <Icon name="caret" size={14} />
                </MenuButton>
              </div>
              {/* queda a la vista mientras se miran estos resultados, aunque se cierre el aviso (#108) */}
              {(sim.built.missingSymbols?.length ?? 0) > 0 && (
                <button
                  className="incomplete-badge"
                  onClick={() => setPanel('problems')}
                  title={t('Missing {p0}: they were left out of the circuit and the results don\'t match the schematic', { p0: sim.built.missingSymbols.join(', ') })}
                >
                  {t('Incomplete simulation')}
                </button>
              )}
              {/* la vista elegida en el menú (netlist, log…); el botón no cambia */}
              {panel !== 'plot' && <span className="results-view">{PANEL_NAMES[panel]}</span>}
              {panel === 'plot' && plot && scale && <TraceBox handle={traceBox} names={traceNames} hints={traceHints} onAdd={addExpr} />}
              {panel === 'plot' && (
                <>
                  {/* varios plots: un .control con varios análisis, .step (op vs R), .meas, FFT, gráficos x-y */}
                  {sim.result.plots.length > 1 && (
                    <select value={plotName} onChange={(e) => selectPlot(e.target.value)} aria-label={t('Result plot')} title={t('Result to view (the simulation returned several)')}>
                      {sim.result.plots.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                          {labels.has(p.name) ? ` (${labels.get(p.name)})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  {isComplex && scale && (
                    <select value={mode} onChange={(e) => setMode(e.target.value as ComplexMode)} aria-label={t('Display')}>
                      <option value="bode">{t('Bode (dB and phase)')}</option>
                      <option value="db">{t('Magnitude (dB)')}</option>
                      <option value="phase">{t('Phase (°)')}</option>
                      <option value="mag">{t('Magnitude')}</option>
                      <option value="reim">{t('Real and imaginary')}</option>
                      <option value="smith">{t('Smith chart')}</option>
                    </select>
                  )}
                  {/* Cursores, FFT, Medidas y Ajustar (los pone el visor) */}
                  <span className="viewer-tools" ref={setViewerTools} />
                  {withPz && (
                    <label className="check inline" title={t('Pole-zero map (.pz) next to the plot; its f₀ are marked on the axis')}>
                      <input type="checkbox" checked={pzSide} onChange={(e) => setPzSide(e.target.checked)} /> {t('Poles and zeros')}
                    </label>
                  )}
                  {allRuns.length > 1 && (
                    <label className="check inline">
                      <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} /> {t('Overlay the')}{' '}
                      {allRuns.length} {t('runs')}
                    </label>
                  )}
                  {allRuns.length > 1 && overlay && (
                    <button onClick={() => setDialog({ kind: 'runs' })} title={t('Choose which runs to show (Shift+S)')}>
                      {t('Runs')}{hiddenRuns.size ? ` (${visibleRuns.length}/${allRuns.length})` : ''}…
                    </button>
                  )}
                </>
              )}
              <button className="close" onClick={() => setExpanded('schematic')} aria-label={t('Hide results')} title={t('Hide results (Ctrl+1)')}>
                {resultsSide ? '▶' : '▼'}
              </button>
            </div>
            <div className="results-body">
              {panel === 'plot' && plot && scale && isComplex && mode === 'smith' && <SmithChart plot={plot} panes={panes} resolver={resolver} />}
              {panel === 'plot' && plot && scale && !(isComplex && mode === 'smith') && (
                <Suspense fallback={null}>
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
                </Suspense>
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
                        <span className={`kind ${p.kind}`}>{p.kind === 'err' ? 'error' : t('warning')}</span>
                        <span>{p.text}</span>
                        {p.sym !== undefined && (
                          <button className="link" onClick={() => goTo(p.sym!)}>
                            {t('show on the schematic')}
                          </button>
                        )}
                        {p.fix && (
                          <button
                            className="link"
                            onClick={() => {
                              commit(replaceLine(doc, p.fix!.from, p.fix!.to));
                              setMessage(t('Changed to «{p0}»: simulate again with Alt+R', { p0: p.fix!.to }));
                            }}
                          >
                            {t('use «')}{p.fix.to}»
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty pad">{t('No problems.')}</p>
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
            const dir = [USER_DIR, PROJECT_DIR].find((d) => type.startsWith(`${d}/`));
            const name = dir ? type.slice(dir.length + 1) : type;
            if (dialog.forSymbol) return adoptSymbolFor(name);
            if (!makesCycle([name])) setTool({ kind: 'place', type: name, orient: 'R0' });
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
          onSweep={(param, value, attrs) => sweepSubParam(dialog.index, param, value, attrs)}
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
      {dialog?.kind === 'projectfiles' && (
        <UserFilesDialog
          project={project.name}
          files={project.files.map((f) => {
            const sub = f.kind === 'verilog' ? generatedSub(project.files, f.name) : undefined;
            return { name: f.name, kind: f.kind, items: f.kind === 'model' ? scanModels(f.text).subckts : sub ? generatedPins(sub) : [] };
          })}
          onEditVerilog={(name) => setDialog({ kind: 'verilog', name })}
          onNewVerilog={() => setDialog({ kind: 'verilog' })}
          hasSymbol={(n) => !!lib.symbol(n)}
          onAdd={async (files) => addProjectFiles(await Promise.all(files.map(async (x) => ({ name: x.name, text: decodeText(new Uint8Array(await x.arrayBuffer())) }))))}
          onRemove={removeProjectFile}
          onMakeSymbol={makeProjectSymbol}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'verilog' && (
        <VerilogDialog
          name={dialog.name ?? uniqueFileName('counter.v', project.files.map((f) => f.name))}
          initial={(dialog.name && project.files.find((f) => f.name === dialog.name)?.text) || verilogTemplate('counter')}
          isNew={!dialog.name}
          taken={project.files.map((f) => f.name)}
          synth={(name, text) => synthesizeVerilog(verilogSources(name, text), name, topModuleOf(text))}
          onSave={(name, text, r) => saveSynthesis(name, text, r) && setDialog({ kind: 'projectfiles' })}
          onClose={() => setDialog({ kind: 'projectfiles' })}
        />
      )}
      {driveConflict && (
        <Modal title={t('The file changed in Google Drive')} onClose={() => setDriveConflict(null)}>
          <p>
            «{driveConflict.name}{t('» was modified in Google Drive (in another tab or computer) after you opened it. Nothing was saved, so those changes aren\'t overwritten.')}
          </p>
          <div className="buttons">
            <button onClick={() => resolveDriveConflict('reload')} title={t('Opens the Drive version; what you have here stays in Recent')}>{t('Reload the Drive version')}</button>
            <button onClick={() => resolveDriveConflict('copy')}>{t('Save mine as a copy')}</button>
            <button className="danger" onClick={() => resolveDriveConflict('overwrite')}>{t('Overwrite')}</button>
          </div>
        </Modal>
      )}
      {conflict && (
        <FileConflictDialog
          name={conflict.name}
          onChoose={(c) => {
            setConflict(null);
            conflict.resolve(c);
          }}
        />
      )}
      {dialog?.kind === 'about' && <AboutDialog repo={REPO} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'importinfo' && (
        <ImportInfoDialog
          onChoose={() => {
            setDialog(null);
            importInput.current?.click();
          }}
          onClose={() => setDialog(null)}
        />
      )}
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
      {dialog?.kind === 'benchParams' && (
        <BenchParamsDialog
          bench={(curSim && simName(curSim)) || ''}
          params={benchParams(doc)}
          variables={benchVariables(doc)}
          onApply={(ps) => {
            setDialog(null);
            const d = setBenchParams(doc, ps);
            if (ascText(d) !== ascText(doc)) commit(d);
          }}
          onStudy={() => setDialog({ kind: 'study' })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'name' && <NameDialog title={dialog.title} label={dialog.label} initial={dialog.initial} check={dialog.check} onOk={dialog.onOk} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'slide' && <SlideConfirm title={dialog.title} message={dialog.message} onConfirm={dialog.onConfirm} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'deleteSim' && (
        <SlideConfirm
          title={t('Delete the testbench')}
          message={t('«{p0}» will be deleted with its schematic, its simulation and its run history.', { p0: simName(sims.items.find((x) => x.id === dialog.id) ?? { id: '', line: '' }) || t('No analysis') })}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            deleteSim(dialog.id);
          }}
        />
      )}
      {dialog?.kind === 'deleteVariant' && (
        <SlideConfirm
          title={t('Delete the variant')}
          message={t('«{p0}» will be deleted with all its simulations and their history.', { p0: variantOf(project, dialog.id).name })}
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

type Hover = { ref: ItemRef | null; at: Point } | null;

/** Barra de estado de abajo: lo que hay bajo el mouse (con su propio estado, #187) */
function HintBar({ sink, text }: { sink: MutableRefObject<((h: Hover) => void) | undefined>; text(hover: Hover): string }) {
  const [hover, setHover] = useState<Hover>(null);
  useEffect(() => {
    sink.current = setHover;
    return () => {
      sink.current = undefined;
    };
  }, [sink]);
  return <div className="hint-bar">{text(hover)}</div>;
}

function toolHint(tt: Tool): string {
  switch (tt.kind) {
    case 'select':
      return '';
    case 'wire':
      return tt.start ? t('Click to fix the segment (Ctrl: straight line) · right-click or Esc to finish') : t('Click to start the wire');
    case 'place':
      return t('Placing {type} · Ctrl+R rotate · Ctrl+E mirror · Esc to finish', { type: tt.type });
    case 'flag':
      return tt.name === '0' ? t('Click to place ground · Esc to finish') : t('Click to place the label "{name}"', { name: tt.name });
    case 'text':
      return t('Click to place the text');
    case 'delete':
      return t('Click an element to delete it · drag a box to delete everything inside · Esc to finish');
    case 'probe':
      return t('Click a wire to see its voltage or a component for its current · Esc to edit');
    case 'move':
      return tt.refs
        ? t('Click to drop{p0} · right-click or Esc cancels', { p0: tt.stretch ? t(' (wires stretch)') : '' })
        : t('{p0}: click an element or drag a box to choose · Esc to finish', { p0: tt.stretch ? t('Drag (wires stretch)') : t('Move (without stretching wires)') });
    case 'shape': {
      const n = tt.pts.length;
      if (tt.shape === 'ARC' && n >= 2) return t('{p0} · right-click cancels', { p0: n === 2 ? t("Click the arc's start point") : t('Click the end point (counterclockwise)') });
      if (n) return t('Click to finish{p0} · right-click cancels', { p0: tt.shape === 'ARC' ? t(' the arc\'s box') : '' });
      const what = { LINE: t('the line'), RECTANGLE: t('the rectangle'), CIRCLE: t('the circle (its box)'), ARC: t('the arc (its ellipse\'s box)') }[tt.shape];
      return t('Click to start {what} · Draw › Line style · Esc to finish', { what });
    }
    case 'zoom':
      return t('Drag a box to zoom (click: zoom in) · Shift+Z: previous zoom');
    case 'pick':
      return tt.what === 'net' ? t('Click a wire or pin to choose its net · Esc cancels') : tt.what === 'source' ? t('Click a V or I source to choose it · Esc cancels') : t('Click a component to choose it · Esc cancels');
  }
}
