// TurboSpice: editor de esquemáticos .asc (compatible con LTspice) + simulación con ngspice.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { baseName, emptyDoc, type AscDoc, type SymbolInst } from './asc/model.ts';
import { EngineClient } from './engine/client.ts';
import { type SimPlot } from './engine/ngspice.ts';
import { Library, PROJECT_DIR, type LibraryBundle } from './library/library.ts';
import { ltNetlist, ltNetlistText } from './netlist/ltnetlist.ts';
import { netNames } from './schematic/NetNames.tsx';
import { type Bias } from './sim/bias.ts';
import { symbolBox, visibleText } from './schematic/geometry.ts';
import type { DrawnShapeKind } from './asc/model.ts';
import type { Status } from './NetlistMode.tsx';
import { isPzPlot, pzRuns } from './waveform/ScalarViews.tsx';
import { pzMarks, pzRoots } from './waveform/pz.ts';
import { NetlistMode } from './NetlistMode.tsx';
import { PDK_CORNERS, pdkLib, pdkOfSymbols } from './library/pdk.ts';
import type { PartGroup } from './schematic/PartTable.tsx';
import { cmpChoicesFor } from './library/cmp.ts';
import { makeSymbol, subcktPins } from './library/makeSymbol.ts';
import { AppMenu } from './ui/Menu.tsx';
import { Toolbar } from './ui/Toolbar.tsx';
import { loadLtspiceIndex, prefetchLtspice, type LtspiceIndex } from './library/ltspiceLib.ts';
import { loadUserFiles } from './schematic/autosave.ts';
import { badLines, parseAsc } from './asc/parse.ts';
import { SavesPanel } from './schematic/SavesPanel.tsx';
import { saveSelection, setSaveSelection } from './sim/saves.ts';
import { type CircuitInfo } from './schematic/simDialogs.tsx';
import { findControl, removeAnalysis } from './schematic/directivesEdit.ts';
import { signalsThatFit, simLimits } from './sim/estimate.ts';
import { streamPlan } from './engine/ngspice.ts';
import { ANALYSIS_LINE } from './sim/analyses.ts';
import { activeSim, simName, type SimList, type SimView } from './sim/simList.ts';
import { simLine } from './sim/complexSim.ts';
import {
  activeAsc,
  addSim as addProjectSim,
  applyValues,
  mergeFiles,
  projectFileKind,
  lineOf,
  setSimAsc,
  simOf,
  simsWithValue,
  valueChanges,
  withGroups,
  variantOf,
  type FileConflict,
  type ValueChange,
} from './project/project.ts';
import { runFilesOf, runSummary } from './project/exchange.ts';
import { EXT, newProject, type Project } from './project/turbo.ts';
import { isNativeSwitch, isTcSwitch } from './schematic/SwitchDialog.tsx';
import { HistoryPanel } from './project/HistoryPanel.tsx';
import type { Probe as TutorialProbe } from './tutorial/lessons.ts';
import { diffCircuits } from './project/diff.ts';
import { isControlBlock } from './netlist/directives.ts';
import { effectiveAttrs } from './asc/resolve.ts';
import { allItems, deleteItems, setText, transformItems } from './schematic/edit.ts';
import { fontChoice, loadFont } from './schematic/fonts.ts';
import { spiceName } from './netlist/spiceName.ts';
import { setMeasureFont } from './schematic/geometry.ts';
import type { ItemRef } from './schematic/geometry.ts';
import { SchematicEditor, type EditorHandle, type Tool, type View as EditorView } from './schematic/SchematicEditor.tsx';
import { ProjectTree, QuickOpen, type TreeSub } from './project/Hierarchy.tsx';
import { ContextMenu, type ContextItem } from './ui/ContextMenu.tsx';
import { TextMenu } from './schematic/TextMenu.tsx';
import { isModelModule, modelModuleFile, modelModuleName, modelModules } from './project/modelModule.ts';
import { Tutorial } from './lazyViews.ts';
import { benchesUsing, moduleFile, modules, subcktFile, subName, updateSymbol, usages } from './project/subckt.ts';
import { useHistory, type History } from './schematic/useHistory.ts';
import { mirrorX, rotateCW } from './asc/transform.ts';
import { buildSimulation, type BuiltSimulation } from './sim/schematicSim.ts';
import type { PlotPanelHandle } from './waveform/PlotPanel.tsx';
import { preloadPlots } from './waveform/lazy.ts';
import { useTraceWidth } from './waveform/lineWidth.ts';
import { sameRuns, scaleOf, stepLabels } from './waveform/series.ts';
import { type ComplexMode } from './waveform/curves.ts';
import { type TraceBoxHandle } from './waveform/TraceBox.tsx';
import { colorize, emptyPanes, plotKind, viewFromDoc, withView, type Pane, type PlotState, type PlotView } from './waveform/view.ts';
import { readData, sameExceptData, writeData } from './asc/dataText.ts';
import { traceResolver } from './sim/traces.ts';
import { moveOpTag } from './sim/opPins.ts';
import { download } from './schematic/exportSchematic.ts';
import { ResultsSplitter, refitsSchematic, toggleResults, useExpanded, type Expanded } from './ui/ResultsSplitter.tsx';
import { useSideSize } from './ui/SideSplit.tsx';
import { AccountButton } from './cloud/AccountButton.tsx';
import { drive, useGoogle } from './cloud/google.ts';
import { connectProgress, PROGRESS_NAME } from './tutorial/progress.ts';
import { Logo } from './ui/Logo.tsx';
import { locale, t } from './i18n/i18n.ts';
import { moduleOf } from './hdl/project.ts';
import { BASE, DEFAULT_PROJECT, SCH_FONT_KEY, SKIN_KEY } from './app/constants.ts';
import type { Dialog, FileState, HierLevel, SavesState, SimRun } from './app/types.ts';
import { lsGet, lsSet, useTheme } from './app/storage.ts';
import { ascText, registerUserFile } from './app/helpers.ts';
import { type Hover } from './app/HintBar.tsx';
import { AppDialogs } from './app/AppDialogs.tsx';
import { buildMenus } from './app/menus.tsx';
import { useShortcuts } from './app/shortcuts.ts';
import { useDrive } from './app/useDrive.ts';
import { AppBarRight, ViewTabs } from './app/AppBarSlots.tsx';
import { SimRow } from './app/SimRow.tsx';
import { simProblems } from './app/Problems.tsx';
import { useUserFiles } from './app/useUserFiles.ts';
import { moduleActions } from './app/modules.ts';
import { navigation } from './app/navigation.ts';
import { benchActions } from './app/benches.ts';
import { useImportExport } from './app/useImportExport.ts';
import { useProbe } from './app/useProbe.ts';
import { useOpPoint } from './app/useOpPoint.ts';
import { ResultsPanel } from './app/ResultsPanel.tsx';
import { ModuleEditors } from './app/ModuleEditors.tsx';
import { treeBenchesOf, treeSubsOf } from './app/projectTree.ts';
import { buildResultsItems, buildToolGroups } from './app/toolbars.ts';
import { contextMenus } from './app/contextMenus.ts';
import { clipboardActions } from './app/clipboard.ts';
import { tutorialState } from './app/tutorialProbe.ts';
import { savingActions } from './app/saving.ts';
import { projectFileActions } from './app/projectFiles.ts';
import { runActions } from './app/runActions.ts';
import { FileInputs } from './app/FileInputs.tsx';
import { StatusBar } from './app/StatusBar.tsx';
import { useVerilog } from './app/useVerilog.ts';
import { studyActions } from './app/studyActions.ts';
import { useSavesPanel } from './app/useSavesPanel.ts';
import { useSubcktEditing } from './app/useSubcktEditing.ts';
import { useProjectSession } from './app/useProjectSession.ts';
import { useHighlights } from './app/useHighlights.ts';
import { useTraces } from './app/useTraces.ts';
import { usePicker } from './app/usePicker.ts';


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
        const skin = lsGet(SKIN_KEY);
        setLib(skin ? l.withSkin(skin) : l);
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
        <AccountButton />
      </header>
      {mode === 'netlist' && <NetlistMode engine={engine} />}
      {mode === 'schematic' &&
        (lib ? (
          <SchematicMode
            engine={engine}
            lib={lib}
            slots={{ menu: menuSlot, tabs: tabsSlot, right: rightSlot, tools: toolsSlot }}
            onNetlist={() => setMode('netlist')}
            onSkin={(name) => {
              lsSet(SKIN_KEY, name);
              setLib((l) => l && l.withSkin(name));
            }}
          />
        ) : (
          <p className="empty pad">{libError ?? t('Loading library…')}</p>
        ))}
    </div>
  );
}

function SchematicMode({ engine, lib, slots, onNetlist, onSkin }: {
  engine: EngineClient;
  lib: Library;
  slots: { menu: HTMLElement | null; tabs: HTMLElement | null; right: HTMLElement | null; tools: HTMLElement | null };
  /** pasar al editor de netlist */
  onNetlist(): void;
  /** elegir el skin de los símbolos (#329) */
  onSkin(name: string): void;
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
  // letra del esquemático (#328): una variable de CSS y la que mide los textos
  const [schFont, setSchFontState] = useState(() => fontChoice(lsGet(SCH_FONT_KEY)).id);
  useEffect(() => {
    const c = fontChoice(schFont);
    const apply = () => {
      document.documentElement.style.setProperty('--sch-font', c.css);
      setMeasureFont(c.css);
    };
    loadFont(c).then(apply, () => setMessage(t('Could not load the font «{name}»', { name: c.label })));
  }, [schFont]);
  const setSchFont = (id: string) => (lsSet(SCH_FONT_KEY, id), setSchFontState(id));
  const traceW = useTraceWidth();
  const setHoverReveal = (on: boolean) => (lsSet('turbospice.treeHover', on ? '1' : '0'), setHoverRevealState(on));
  const [treePeek, setTreePeek] = useState(false);
  // panel de proyecto: lo que eligió el usuario; si nunca eligió, abierto para quien entra por
  // primera vez (así ve los testbenches del proyecto de ejemplo) y, si no, abierto si hay subcircuitos
  const [treePref, setTreePref] = useState<boolean | null>(() => {
    const v = lsGet('turbospice.tree');
    return v === '1' ? true : v === '0' ? false : lsGet('turbospice.welcomed') ? null : true;
  });
  // (desde la segunda visita ya no cuenta como primera)
  useEffect(() => lsSet('turbospice.welcomed', '1'), []);
  const hasSubs = project.files.some((f) => f.kind === 'schematic' || isModelModule(f));
  // módulo «Modelo» abierto en su editor ('' = ninguno); se cierra al cambiar de nivel o de testbench
  const [curModel, setCurModel] = useState('');
  const treeOpen = treePref ?? hasSubs;
  // la barra de jerarquía sólo con subcircuitos (o el panel abierto): sin ellos no ocupa lugar
  // ancho del panel del símbolo (se arrastra su borde izquierdo)
  const [symW, setSymWState] = useState(() => {
    try {
      return Number(localStorage.getItem('turbospice.symW')) || 420;
    } catch {
      return 420;
    }
  });
  const setSymW = (w: number) => {
    setSymWState(w);
    try {
      localStorage.setItem('turbospice.symW', String(Math.round(w)));
    } catch {
      /* sin almacenamiento */
    }
  };
  // con «mostrar al acercar el mouse» el panel oculto queda como un borde visible (#251)
  const treeShown = treeOpen || treePeek || hoverReveal;
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
    const n = benchesUsing(projectRef.current, sub);
    // (si todavía lo usa uno solo, se avisa cuando pase a usarse en varios)
    if (n < 2) return;
    warnedSubs.current.add(sub.toLowerCase());
    setMessage(t('{name} is used in {n} testbenches: the changes apply to all of them', { name: sub, n }));
  };
  const [tool, setToolState] = useState<Tool>({ kind: 'select' });
  const [selection, setSelection] = useState<ItemRef[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  // panel de señales guardadas (#364): «sólo lo elegido» aunque todavía no haya nada elegido, y
  // las señales del circuito con la netlist armada (para la punta de prueba)
  // Al simular queda en gris (`inactive`) y la punta de prueba vuelve a graficar; un click en el
  // panel lo reactiva y, si se estaba eligiendo (`picking`), la punta vuelve a elegir
  const [saves, setSaves] = useState<SavesState | null>(null);
  const savesOpen = !!saves && !curSub;
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
  /** Con el panel en «sólo lo elegido», la punta de prueba elige qué se guarda */
  const savesPicking = savesOpen && !saves.inactive && tool.kind === 'probe' && (saves.mode === 'some' || !!saveSelection(doc.texts));
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
  // (#241: COMPLEX_LINE si el testbench es una Complex simulation)
  const docLine = simLine(tbDoc ?? doc);
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
  // el mapa de polos y la vista de Stability van al lado del gráfico (debajo, con los resultados
  // al costado); su tamaño se cambia con un divisor y se recuerda (#336)
  const splitDir = resultsSide ? 'column' : 'row';
  const pzSplit = useSideSize('pz', splitDir);
  const stbSplit = useSideSize('stb', splitDir);
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
  const [netHover, setNetHover] = useState(false);

  // archivos del usuario: al cambiar, la librería cambia (se recalcula la netlist y el dibujo)
  const account = google.account?.emailAddress ?? google.account?.displayName;
  const { userFiles, libVersion, setLibVersion, storeUserFiles, addUserFiles, removeUserFile, makeUserSymbol, userFileInfo } = useUserFiles(lib, account, setMessage);
  // el progreso del tutorial también (PROGRESS_NAME): así no se repite en otra máquina
  useEffect(() => {
    if (!account) return;
    return connectProgress(drive, (e) => setMessage(t('Could not sync «{name}» with Google Drive: {message}', { name: PROGRESS_NAME, message: e.message })));
  }, [account]);
  useEffect(() => setCurModel(''), [path, sims.active]);
  // archivos del proyecto (#155): se registran en la librería antes que los del usuario
  useEffect(() => {
    lib.setProjectFiles(project.files);
    setLibVersion((v) => v + 1);
  }, [lib, project.files, setLibVersion]);
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
    // un .v agregado es un módulo: se sintetiza enseguida (así aparece su símbolo)
    for (const name of r.added) if (projectFileKind(name) === 'verilog') await synthAndReport(moduleOf({ name }));
  };

  // Módulos Verilog (#209): síntesis, comportamiento y variantes
  const { synthModule, synthAndReport, synthStale, withVariants } = useVerilog({ lib, projectRef, editProject, setLibVersion, setStatus, setMessage });
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
  }, [doc, lib, ltIndex, setLibVersion]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lt = useMemo(() => ltNetlist(doc, lib), [doc, lib, libVersion]);
  const conn = lt.conn;
  const [showNets, setShowNets] = useState(false);
  const shownNets = useMemo(() => (showNets ? netNames(doc, conn, lt.ncNames) : undefined), [showNets, doc, conn, lt]);
  // sin redes (esquemático vacío o sin nombres) el botón y Alt+N no hacen nada (#242)
  const hasNets = conn.nets.some((n) => n.name);
  // red resaltada desde el panel de resultados (al pasar por una traza)
  const [traceNet, setTraceNet] = useState<string>();

  // Elegir una red o fuente en el esquemático desde un diálogo (que queda oculto mientras)
  const { picking, picker, endPick, pickValue } = usePicker(doc, lib, tool, setToolState);

  const setTool = useCallback((tt: Tool) => {
    setToolState(tt);
    if (tt.kind !== 'select' && tt.kind !== 'move' && tt.kind !== 'zoom') setSelection([]);
  }, []);
  // estilo de línea de las figuras que se dibujen (Dibujar › Estilo de línea)
  const [shapeStyle, setShapeStyleState] = useState('');
  const shapeTool = (shape: DrawnShapeKind) => () => setTool({ kind: 'shape', shape, pts: [], ...(shapeStyle ? { style: shapeStyle } : {}) });
  const openLineStyle = (shapes = selection.filter((r) => r.kind === 'shape').map((r) => r.index)) => setDialog({ kind: 'lineStyle', shapes });
  // Ctrl+G / Ctrl+U: grilla y marcas de pines sueltos
  const [showGrid, setShowGrid] = useState(false);
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

  // Tutorial interactivo (Academia): abierto y la foto del estado que mira (se arma antes del render)
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const tutorialProbe = useRef<() => TutorialProbe>();
  const readTutorialProbe = useCallback(() => tutorialProbe.current!(), []);

  // paneles de cada tipo de análisis (al cambiar de plot se recuperan los de ese tipo)
  const panesByKind = useRef(new Map<string, Pane[]>());
  const { showView, restoreCached, loadProject, loadDoc, loadPractice, recent, remember, openBytes, switchLang } = useProjectSession({
    ...{ lib, history, stacks, kept, quietDoc, docRef, projectRef, simsRef, pathRef, plotState, panesByKind, editor, doc, docKey, project, file, dirty, panes, activePane, plotName, mode },
    ...{ setPanes, setActivePane, setPlotName, setMode, setSim, setProjectState, setDirty, setFile, setSelection, setOfferView, setValueOffer, setHistoryOpen, setViewRun, setTool, setDocKey, setPath, setCurModel, setMessage },
    // (declaradas más abajo)
    snapshot: () => snapshot(),
    confirmDiscard: () => confirmDiscard(),
    warnMissing: (d) => warnMissing(d),
  });

  const { confirmDiscard, doOpen, doImport, snapshot, turboBytes, turboName, savedAs, doSaveLocal } = savingActions({
    ...{ dirty, setDirty, file, setFile, projectRef, setProjectState, pathRef, docRef, sims, remember, setDialog, setMessage },
    // (declaradas más abajo)
    liveView: () => liveView(),
    openDriveFile: (d) => openDriveFile(d),
  });

  const { driveConflict, setDriveConflict, setAutoDrive, resolveDriveConflict, doSaveDrive, openDriveFile } = useDrive({
    ...{ account: google.account, file, setFile, dirty, setDirty, editRev, projectRef, snapshot, turboBytes, turboName, savedAs, remember, openBytes, confirmDiscard, setDialog, setMessage },
  });

  // Con la sesión de Google iniciada, Guardar va al Drive; si no, al equipo
  const doSave = (saveAs = false) => (google.account ? doSaveDrive(saveAs) : doSaveLocal(saveAs));


  const { doImportLtspice, doRemoveLtspice, ascName, doShare, doExport, exportName, doRecent, doNew, doExample } = projectFileActions({
    curSim: activeSim(sims),
    ...{ google, project, variant, sims, recent, setLtIndex, turboBytes, confirmDiscard, openBytes, remember, loadDoc, loadProject, markDirty, setDialog, setMessage },
    warnMissing: (d) => warnMissing(d), // (declarada más abajo)
  });
  const exporting = dialog?.kind === 'export';

  /** Expresiones de todas las trazas (las que se ven y las recordadas por análisis), para pedir
   *  con .save los parámetros de dispositivo que usen (#202) */
  const allTraces = () => [panes, ...Object.values(plotView), ...panesByKind.current.values()].flatMap((ps) => ps.flatMap((p) => p.traces.map((tt) => tt.expr)));
  // frenada por memoria (#363): lo simulado hasta ahí se mira recién al elegir «Plot up to here»
  const [stopPlotted, setStopPlotted] = useState(false);
  const aborting = useRef(false);
  // Deshacer / rehacer los cambios de la vista de resultados (trazas, paneles, colores)
  const paneUndo = useRef<{ past: Pane[][]; future: Pane[][] }>({ past: [], future: [] });
  const run = runActions({
    ...{ engine, lib, ltIndex, liveDoc, pathRef, sims, simsRef, sim, kept, aborting, paneUndo, editor, savesPicking, setSaves, setStatus, setViewRun, setMessage, prevRun, snapshot, editProject, setAutoDrive },
    ...{ ascName, allTraces, synthStale, withVariants, setOpPoint, expanded, setExpanded, setSim, setHiddenRuns, setPlotName, plotView, panes, setPanes, setStopPlotted, setPanel, setTool },
  });

  // la esquina del PDK (docs/pdk.md): la de una directiva .lib, si hay, o la elegida en la barra
  // (guardada en el .asc, ;.pdk); el PDK, de los símbolos o de esa directiva
  const pdkBar = useMemo(() => {
    const lines = doc.texts.filter((x) => x.kind === 'directive').flatMap((x) => x.text.split('\\n'));
    let fixed: { name: string; corner?: string; line: string } | undefined;
    for (const line of lines) {
      const m = /^\s*\.(?:lib|include|inc)\s+["']?([^"'\s]+)["']?(?:\s+(\S+))?/i.exec(line);
      const hit = m && pdkLib(m[1], m[2]);
      if (hit && (hit.corner || !fixed)) fixed = { ...hit, line: line.trim() };
    }
    const name = pdkOfSymbols(doc.symbols.map((x) => x.type)) ?? fixed?.name;
    if (!name) return undefined;
    const chosen = (readData(doc, 'pdk') as { corner?: string } | undefined)?.corner;
    return {
      name,
      corner: fixed?.corner ?? chosen ?? 'tt',
      corners: PDK_CORNERS,
      fixed: fixed?.corner ? fixed.line : undefined,
      onChange: (corner: string) => commit(writeData(doc, 'pdk', corner === 'tt' ? undefined : { corner })),
    };
  }, [doc]);

  const stopHidden = !!sim?.result.sizeStop && !stopPlotted;
  // hasta qué instante llegó (el último tiempo del transitorio frenado)
  const stopTime = useMemo(() => {
    if (!sim?.result.sizeStop) return undefined;
    const time = sim.result.plots.filter((pl) => /^tran\d+$/i.test(pl.name)).at(-1)?.vectors.find((v) => v.name === 'time')?.real;
    return time?.length ? time[time.length - 1] : undefined;
  }, [sim]);
  const plotStop = () => {
    // todo lo simulado a la vista: sin el zoom de la corrida anterior (al volver a simular el mismo
    // análisis se conserva, pero tras «seguir igual» hay más tiempo y no se vería)
    if (plotState.current) plotState.current = { ...plotState.current, xRange: null, yRanges: {} };
    plotPanel.current?.action('fit');
    setStopPlotted(true);
    setPanel('plot');
    setTool({ kind: 'probe' });
  };
  // «Save only the last…»: se simula otra vez cuando el cambio de la línea ya llegó al documento
  const [runQueued, setRunQueued] = useState(false);
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (!runQueued) return;
    setRunQueued(false);
    runRef.current();
  }, [runQueued]);

  const abort = () => {
    engine.abort();
    aborting.current = true;
    // queda "sin simular" (no "lista": lo que se ve, si hay algo, es de la corrida anterior)
    setStatus({ kind: 'aborted' });
    setMessage(sim ? t('Simulation aborted: the results shown are from the previous run') : t('Simulation aborted'));
    engine.ready.catch((e: Error) => setStatus({ kind: 'error', message: e.message }));
  };
  /** Ctrl+L: log de la simulación (Problemas si hubo errores) */
  const showLog = () => {
    if (!sim) return setMessage(t('No simulation yet: simulate with Alt+R'));
    setPanel(sim.result.errors.length ? 'problems' : 'log');
  };

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
  const { leave, enter, goSim, subKey, go, goUp, openSub, descend } = navigation({
    ...{ history, stacks, levelViews, quietDoc, kept, projectRef, pathRef, docRef, editor, snapshot, sim, sims, lt },
    ...{ setProjectState, setPath, setSubTabs, setSim, showView, restoreCached, setSelection, setTool, setValueOffer, setViewRun, setDocKey, setMessage },
  });
  const { checkSubName, newSubckt, createModule, renameSub, deleteSub, newModel, renameModel, deleteModel } = moduleActions({
    ...{ projectRef, editProject, snapshot, docRef, history, stacks, subKey, pathRef, go, openSub, setSubTabs, curModel, setCurModel, setDialog, synthAndReport },
  });
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
    const r = addProjectSim({ ...p0, variants: p0.variants.map((x) => (x.id === v.id ? { ...x, base: ascText(removeAnalysis(doc)) } : x)) }, ascText(doc));
    editProject(r.project);
  }, [docLine]); // eslint-disable-line react-hooks/exhaustive-deps
  const { newSim, newEmptyBench, renameBench, newGroup, renameGroupTo, groupAction, moveBench, benchItem, benchAction, deleteSim, simAllCorners, deleteVariant } = benchActions({
    ...{ doc, docLine, curSub, sims, commit, projectRef, pathRef, stacks, kept, editProject, setProjectState, snapshot, markDirty, leave, enter, go, goSim, setDialog, setMessage },
    // (declaradas más abajo)
    circuitInfo: () => circuitInfo(),
    openHistory: (id) => openHistory(id),
    openStudy: () => openStudy(),
    openSimulation: () => openSimulation(),
  });
  // Botón derecho en un componente de un testbench de un grupo: editar o propagar sus valores a
  // los otros testbenches del grupo que tienen el mismo componente
  const [ctxMenu, setCtxMenu] = useState<{ at: { x: number; y: number }; items: ContextItem[] } | null>(null);
  // menú del botón derecho de un comentario (tamaño, alineación)
  const [textMenu, setTextMenu] = useState<{ index: number; at: { x: number; y: number } } | null>(null);
  const closeTextMenu = useCallback(() => setTextMenu(null), []);
  const { netMenu, symbolMenu } = contextMenus({
    ...{ doc, lib, curSub, sims, commit, snapshot, editProject, setCtxMenu, setMessage },
    editItem: (ref) => editItem(ref), // (declarada más abajo)
  });
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
  const pltInput = useRef<HTMLInputElement>(null);

  // Punto de operación: el de la simulación elegida o el último calculado, mientras el circuito
  // sea el que se simuló (no importa el comando de análisis)
  // Adentro de una instancia (#199): la simulación del testbench vista desde esa instancia, si
  // el subcircuito es el que se simuló
  const lvNow = path[path.length - 1];
  const { simScope, op, bias, describe, setOpTags, opSel, setOpSel, opAnnotations, annotations } = useOpPoint({ lvNow, sim, opPoint, doc, conn, lib, showOp, docKey, selection, commit });

  // Schematic | Results: la unión entre las dos pestañas cae sobre el borde derecho de la cápsula
  // del proyecto (que mide --tree-w), sea cual sea el ancho del logo o del texto en cada idioma
  const resolver = useCallback((p: SimPlot) => traceResolver(sim?.built ?? null, p, sim ? sameRuns(sim.result.plots, p) : [p]), [sim]);
  const { setRowHover, rowNet, rowSymbol, rowElement, hoverDev, onHoverSymbol, arrows, unsaved, netColors, traceNetShown } = useHighlights({
    ...{ doc, docRef, lib, conn, path, lvNow, curSub, sim, simScope, plot, panes, tool, showOp, saves, savesPicking, traceNet, setTraceNet },
  });

  // Punta de prueba: agrega la traza al panel activo. Si ya está ahí no hace nada (se quita a
  // mano); si está en otro panel, queda en los dos con el mismo color
  // Vista partida del subcircuito (#180): su símbolo al lado. Los pines siguen a los puertos
  // mientras se edita (los que quedan conservan su lugar)
  // (un módulo Verilog, #209: en lugar del esquemático se ve su código; sus pines son los de la síntesis)
  const { curVerilog, subPorts, editSymbol, symText, addPort, adoptNetlistFor, adoptSymbolFor } = useSubcktEditing({
    ...{ project, projectRef, setProjectState, editProject, snapshot, curSub, curModel, doc, liveDoc, docRef, commit, lib, warnShared, setMessage },
  });
  // testbenches del panel, con sus .param y .step (el activo, con lo que se está editando)
  const treeBenches = useMemo(() => {
    if (!treeOpen && !treePeek) return [];
    return treeBenchesOf(variant, sims, curSub, liveDoc);
  }, [treeOpen, treePeek, variant, sims, curSub, liveDoc]);

  // Panel de proyecto (#180): subcircuitos con sus usos y los que tienen adentro (el que se está
  // editando, con su texto actual)
  const treeSubs = useMemo((): TreeSub[] => {
    if (!treeOpen) return [];
    return treeSubsOf(project, curSub, liveDoc, lib, goUsage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeOpen, project, curSub, liveDoc, libVersion]);
  const toggleTree = () => {
    lsSet('turbospice.tree', treeOpen ? '0' : '1');
    setTreePref(!treeOpen);
  };

  // ⌖ de la DFT: mientras se elige, el esquemático está en la punta de prueba y lo que se pinche
  // (esté graficado o no) va a la DFT; al terminar vuelve a la herramienta de antes
  // Caja de trazas de la barra de resultados
  const traceBox = useRef<TraceBoxHandle>(null);
  // con el foco en la caja de trazas se está en modo punta de prueba (#341): un clic en una red la
  // escribe en la caja, aunque la herramienta elegida sea la de selección
  const [traceFocus, setTraceFocus] = useState(false);
  const [viewerTools, setViewerTools] = useState<HTMLElement | null>(null);

  const rotateOrMirror = (op: 'rotate' | 'mirror') => {
    if (op === 'rotate' && editor.current?.rotateLabel()) return;
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
      setDialog(/^[VI]$/i.test(prefix) ? { kind: 'source', index: ref.index } : isTcSwitch(s.type) || isNativeSwitch(prefix) ? { kind: 'switch', index: ref.index } : { kind: 'attrs', index: ref.index });
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


  const missingSymbols = (d: AscDoc) => [...new Set(d.symbols.filter((x) => !lib.symbol(x.type)).map((x) => `${baseName(x.type)}.asy`))];
  /** Avisa si el circuito usa símbolos que no están en la librería ni entre los del usuario */
  const warnMissing = (d: AscDoc) => {
    const miss = missingSymbols(d);
    const bad = badLines(d);
    const msgs = [
      ...(miss.length ? [t('Missing symbols: {p0}. Add them in File › My symbols and models.', { p0: miss.join(', ') })] : []),
      // (las líneas dañadas quedan tal cual en el archivo: no se pierden al guardar)
      ...(bad.length ? [t('{n} lines of the file could not be read and were kept as they are (the first one: {line})', { n: bad.length, line: bad[0].slice(0, 80) })] : []),
    ];
    if (msgs.length) setMessage(msgs.join(' · '));
  };

  const { copySelection, makesCycle, paste, deleteSelection } = clipboardActions({ doc, lib, selection, setSelection, setTool, commit, editor, pathRef, projectRef, opSel, setOpSel, setOpTags, showOp, setMessage });
  const exportNetlist = async (which: 'net' | 'cir') => {
    const base = project.name;
    if (which === 'net') return download(`${base}.net`, new Blob([`* ${ascName()}\n${ltNetlistText(lt)}\n`], { type: 'text/plain' }));
    const built = sim && sameExceptData(sim.doc, doc) ? sim.built : await buildSimulation(doc, lib, ascName(), allTraces());
    download(`${base}.cir`, new Blob([(await withVariants(built.netlist)).netlist], { type: 'text/plain' }));
  };

  const { openStudy, complexSim, sweepSubParam, studyInfo, openSimulation, openControl } = studyActions({
    ...{ doc, docLine, curSub, lib, commit, setDialog, setMessage },
    circuitInfo: () => circuitInfo(), // (declarada más abajo)
  });
  const { openSaves, closeSaves, pickSave, setHoverTarget, savesHover } = useSavesPanel({ saves, setSaves, savesOpen, curSub, doc, docRef, lib, sim, tool, setTool, setRowHover, commit, ascName, setMessage });

  // Redes y fuentes del circuito, para los selectores del menú de simulación
  // (en cada render de la vista: ordenar las redes con localeCompare costaba, #187)
  const info = useMemo(
    (): CircuitInfo => ({
      nets: [...new Set(conn.nets.map((n) => n.name).filter((n) => n))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      sources: doc.symbols
        .map((s) => effectiveAttrs(s, lib.symbol(s.type)))
        .filter((a) => /^[VI]$/i.test(a.get('Prefix') ?? ''))
        .map((a) => spiceName(a.get('InstName') ?? ''))
        .filter(Boolean),
      // sondas de lazo del .stb (librería Stability)
      probes: doc.symbols
        .map((s) => effectiveAttrs(s, lib.symbol(s.type)))
        .filter((a) => /^(LoopProbe|LoopProbe_Dif|DiffLoopProbe)$/i.test(a.get('SpiceModel') ?? ''))
        .map((a) => ({ name: spiceName(a.get('InstName') ?? ''), diff: /^(LoopProbe_Dif|DiffLoopProbe)$/i.test(a.get('SpiceModel') ?? '') }))
        .filter((p, i, all) => p.name && all.findIndex((q) => q.name === p.name) === i),
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

  const { importInput, importFiles, subImport, exportSub, subToUser, exportSubNetlist, importSubckts, exportZip } = useImportExport({
    ...{ lib, projectRef, editProject, snapshot, markDirty, leave, enter, confirmDiscard, openBytes, askConflict, userFiles, storeUserFiles, setTool, setMessage },
  });

  // Arrastrar y soltar: un .turbo se abre; un .plt es una vista; lo demás (.asc, varios
  // archivos, un .zip, símbolos y modelos) se importa al proyecto
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = async (e: DragEvent) => {
      e.preventDefault();
      const all = [...(e.dataTransfer?.files ?? [])];
      const f = all[0];
      if (!f) return;
      if (f.name.toLowerCase().endsWith('.plt')) return importPlt(new Uint8Array(await f.arrayBuffer()));
      if (all.length === 1 && /\.turbo$/i.test(f.name)) return confirmDiscard() && openBytes(new Uint8Array(await f.arrayBuffer()), f.name);
      // lo demás (.asc, varios archivos, un .zip, símbolos y modelos) se suma al proyecto abierto:
      // cada .asc, un workbench nuevo (#316)
      return importFiles(all);
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
  const setSide = (side: boolean) => {
    lsSet('turbospice.resultsSide', side ? '1' : '0');
    setResultsSide(side);
  };
  const { menus, shapeItems, simItems } = buildMenus({
    ...{ google, history, status, running, sim, bias, selection, docLine, editor, ltIndex, ltInput, recent, shapeStyle, theme, setTheme, setDialog, setTool, setTutorialOpen },
    ...{ shapeTool, openLineStyle, paste, newSim, complexSim, openSimulation, openSaves, openStudy, openControl, doImport, doRemoveLtspice, doNew, doOpen, doSave, doSaveLocal, exportZip, doShare, doExport, exportNetlist },
    ...{ copySelection, deleteSelection, selectAll, rotateOrMirror, startMove, run, abort, showLog, showOp, setShowOp, netHover, setNetHover, zoomBox, showGrid, setShowGrid, showLoose, setShowLoose },
    ...{ showSimCommand, toggleSimCommand, showNets, setShowNets, resultsSide, setSide, treeOpen, toggleTree, resultsShown, toggleResultsPanel, onNetlist, doExample, doRecent },
  });

  // Problemas de la última simulación: avisos de la traducción y errores de ngspice; los que
  // nombran un componente llevan a él
  const problems = simProblems(sim);
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
  const { traceNames, traceHints, addExpr, reapplyView, acceptOfferedView, importPlt, exportPlt } = useTraces({
    ...{ sim, plot, labels, resolver, mode, panes, activePane, editPanes, setPanes, plotView, setPlotView, offerView, setOfferView, setMessage },
    projectName: project.name,
  });
  // (los atajos se instalan en cada render, con lo de ese render)
  useShortcuts({
    ...{ dialog, history, status, running, selection, allRuns, hasNets, area, editor, plotPanel, pltInput, viewerKeys, simulate, abort, showLog, doSave, doOpen, setQuickOpen, goUp, reapplyView, undoPanes },
    ...{ setDialog, setMessage, rotateOrMirror, copySelection, paste, setTool, selectAll, setSelection, setShowGrid, setShowLoose, setShowNets, setNetHover, openControl, openStudy, openSimulation, zoomBox, descend, startMove, shapeTool, deleteSelection },
  });
  const isComplex = plot?.vectors.some((v) => v.imag);
  const { onDftPicking, onProbe, onProbePair } = useProbe({
    ...{ tool, setTool, setToolState, sim, plot, op, setOpTags, simScope, resolver, isComplex, panes, activePane, editPanes, setActivePane },
    ...{ expanded, setExpanded, setPanel, pathRef, plotPanel, traceBox, savesPicking, pickSave, setMessage },
  });
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
  const toolGroups = buildToolGroups({
    ...{ google, history, tool, setTool, curSub, shapeItems, editor, showGrid, setShowGrid, netHover, setNetHover, setDialog },
    ...{ doNew, doSave, doExport, doOpen, startMove, rotateOrMirror, deleteSelection },
  });

  const resultsItems = buildResultsItems({ sim, project, panel, setPanel, plot, plotPanel, pltInput, exportPlt, ascName, problems });

  // Tutorial (Academia): lo que mira para saber si se cumplió cada paso. Es una función que se
  // reemplaza en cada render: el tutorial la consulta seguido y siempre ve el estado actual
  tutorialProbe.current = () =>
    tutorialState({ lib, doc, tbDoc, conn, plotState, project, dirty, variant, sims, curSub, docLine, tool, dialog, sim, plot, allRuns, panes, panel, treeOpen, historyOpen, showOp, bias, showNets, hasNets });

  return (
    <div className="schematic-mode">
      {tutorialOpen && (
        <Suspense fallback={null}>
          <Tutorial probe={readTutorialProbe} onPractice={loadPractice} onClose={() => setTutorialOpen(false)} />
        </Suspense>
      )}
      {/* exportando, la barra de la app queda (marca y estilo) con las herramientas de la vista previa */}
      {slots.tools && !exporting && createPortal(<Toolbar label={t('Tools')} groups={toolGroups} lead={<AppMenu menus={menus} />} />, slots.tools)}
      {slots.right && <AppBarRight slot={slots.right} {...{ theme, setTheme, switchLang, exporting, doShare }} />}
      {slots.tabs && !exporting && <ViewTabs slot={slots.tabs} hasSim={!!sim} {...{ schematicShown, resultsShown, setExpanded, resultsSide, setSide }} />}
      <SimRow
        projectName={project.name}
        bias={!!bias}
        {...{ dirty, treeOpen, toggleTree, schematicShown, setExpanded, renameProject, simItems, simMenu, canRun, running, status, simulate, abort, curSub, curSim, sim, stopHidden }}
        {...{ tool, setTool, showNets, hasNets, setShowNets, showOp, setShowOp, docLine, circuitInfo, lib, picker, endPick, tbDoc, doc, pdkBar, simAllCorners, openStudy, setMessage, commit }}
      />

      <div className="work-row">
      <div className={`workspace${resultsSide ? ' side' : ''}${sim && expanded ? ` expand-${expanded}` : ''}`}>
        <div
          onMouseMove={(e) => {
            // acercar el mouse al borde izquierdo muestra el panel (si se tildó, en modo selección)
            if (!hoverReveal || treeOpen || treePeek || tool.kind !== 'select') return;
            if (e.clientX - e.currentTarget.getBoundingClientRect().left < 14) setTreePeek(true);
          }}
          style={curSub && symText ? ({ '--sym-w': `${symW}px` } as React.CSSProperties) : undefined}
          className={`canvas-wrap${curSub ? ' with-hier' : ''}${treeOpen ? ' with-tree' : ''}${curSub && symText ? ' with-sym' : ''}${historyOpen && curSim && !curSub ? ' with-history' : ''}`}
          // con el foco en la caja de trazas, un click en el esquemático no se lo saca: la punta
          // de prueba escribe ahí el nodo o componente
          onMouseDownCapture={(e) => traceBox.current?.focused() && e.preventDefault()}
        >
          {curSub && (
            <div className={`sub-hint${curVerilog ? ' verilog' : ''}`} role="status">
              <strong>{curVerilog ? t('Verilog Editor') : t('Subcircuit Editor')}</strong>
              <span className="sub-hint-name">{curSub}</span>
              <span className="sub-hint-text">
                {curVerilog ? t('write the module; its ports are the pins of the symbol') : t('draw the circuit between the ports (net labels with a port, N)')}
              </span>
              <button onClick={() => go([])} title={t('Back to the testbench (Alt+↑ goes up one level)')}>
                {t('Return')}
              </button>
            </div>
          )}
          {treeShown && (
            <ProjectTree
              project={project.name}
              benches={treeBenches}
              groups={project.groups}
              peek={!treeOpen && treePeek}
              edgeOnly={!treeOpen && !treePeek}
              onEnter={() => !treeOpen && !treePeek && tool.kind === 'select' && setTreePeek(true)}
              onBenchItem={benchItem}
              onNewGroup={newGroup}
              onGroupAction={groupAction}
              onRenameGroup={renameGroupTo}
              onMoveBench={moveBench}
              onLeave={() => setTreePeek(false)}
              activeBench={sims.active}
              subs={treeSubs}
              current={curModel || curSub}
              onBench={goSim}
              onTestbench={() => path.length && go([])}
              onNewBench={newEmptyBench}
              onRenameProject={renameProject}
              onBenchAction={benchAction}
              onRenameBench={renameBench}
              onOpen={(n) => {
                if (modelModuleFile(projectRef.current, n)) setCurModel(n);
                else openSub(n);
              }}
              onNew={newSubckt}
              onNewModel={newModel}
              onNewVerilog={() => setDialog({ kind: 'newModule', module: 'verilog' })}
              onRename={(n) => (modelModuleFile(projectRef.current, n) ? renameModel(n) : renameSub(n))}
              onDelete={(n) => (modelModuleFile(projectRef.current, n) ? deleteModel(n) : deleteSub(n))}
              onExport={exportSub}
              onExportNetlist={exportSubNetlist}
              onToUser={subToUser}
              onImport={() => subImport.current?.click()}
              onUpdateSymbol={(n) => {
                const p = updateSymbol(snapshot(), n);
                projectRef.current = p;
                editProject(p);
              }}
            />
          )}
          {quickOpen &&
            createPortal(
            <QuickOpen
              items={[
                ...sims.items.map((x) => ({ key: `v:${x.id}`, label: simName(x) || t('No analysis'), hint: t('testbench') })),
                ...modules(project).map((f) => ({ key: `s:${subName(f.name)}`, label: subName(f.name), hint: f.kind === 'verilog' ? t('Verilog module') : t('subcircuit') })),
                ...modelModules(project).map((f) => ({ key: `m:${modelModuleName(f)}`, label: modelModuleName(f), hint: t('model') })),
              ]}
              onPick={(k) => {
                const id = k.slice(2);
                if (k.startsWith('m:')) return setCurModel(id);
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
          <ModuleEditors {...{ project, projectRef, editProject, curSub, curVerilog, curModel, setCurModel, symText, subPorts, editSymbol, addPort, setSymW, liveDoc, setDialog, synthModule, warnShared }} />
          {ctxMenu && createPortal(<ContextMenu at={ctxMenu.at} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />, document.body)}
          {textMenu && doc.texts[textMenu.index] &&
            createPortal(
              <TextMenu
                at={textMenu.at}
                text={doc.texts[textMenu.index]}
                onClose={closeTextMenu}
                onChange={(patch) => commit(setText(doc, textMenu.index, patch))}
                onEdit={() => editor.current?.editText(textMenu.index)}
                onDialog={() => setDialog({ kind: 'text', index: textMenu.index, textKind: doc.texts[textMenu.index].kind })}
                onDelete={() => {
                  commit(deleteItems(doc, [{ kind: 'text', index: textMenu.index }]));
                  setSelection([]);
                }}
              />,
              document.body,
            )}
          <SchematicEditor
            handle={editor}
            onSymbolMenu={symbolMenu}
            onNetMenu={netMenu}
            unsaved={unsaved}
            onTextMenu={(index, at) => (setTextMenu({ index, at }), true)}
            onDescend={descend}
            docKey={docKey}
            netHover={netHover}
            doc={doc}
            lib={lib}
            conn={conn}
            commit={commit}
            tool={traceFocus && tool.kind === 'select' && sim ? { kind: 'probe' } : tool}
            setTool={setTool}
            selection={selection}
            setSelection={setSelection}
            onEdit={editItem}
            onEditLabel={(index, label) => setDialog({ kind: 'attrs', index, label })}
            onProbe={onProbe}
            onProbePair={onProbePair}
            onDropSubckt={(name) => {
              const m = modelModuleFile(projectRef.current, name);
              if (m) return viewRun ? null : modelModuleName(m);
              const f = moduleFile(projectRef.current, name);
              return f && !viewRun && !makesCycle([subName(f.name)]) ? subName(f.name) : null;
            }}
            highlightNet={rowNet ?? traceNetShown}
            highlightSymbol={rowSymbol >= 0 ? rowSymbol : rowElement?.sym}
            onHoverSymbol={onHoverSymbol}
            onHoverTarget={savesOpen ? setHoverTarget : undefined}
            netColors={netColors}
            netNames={shownNets}
            onNameNet={(at) => setDialog({ kind: 'flag', at })}
            describe={describe}
            annotations={annotations}
            selectedAnnotation={opSel}
            onSelectAnnotation={(key) => {
              setOpSel(key);
              if (key) setSelection([]);
            }}
            onMoveAnnotation={(key, dx, dy) => setOpTags((p) => moveOpTag(p, key, dx, dy))}
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
          <FileInputs {...{ importInput, importFiles, ltInput, doImportLtspice }} />
          <StatusBar
            picking={!!picking}
            fileName={file.name}
            {...{ hoverSink, savesPicking, tool, doc, lib, conn, message, setMessage, viewed, restoreRun, setViewRun, valueOffer, applyValueOffer, setValueOffer, offerView, acceptOfferedView, setOfferView }}
          />
        </div>

        {sim && !curSub && (
          <ResultsSplitter side={resultsSide} sizeKey={sizeKey} setSize={setResultsH} expanded={expanded} setExpanded={setExpanded} />
        )}
        {sim && !curSub && (
          <ResultsPanel
            projectName={project.name}
            {...{ sim, resultsH, pltInput, importPlt, panel, setPanel, resultsItems, plot, scale, traceBox, traceNames, traceHints, addExpr, setTraceFocus, plotName, selectPlot, labels, isComplex, mode, setMode }}
            {...{ viewerTools, setViewerTools, withPz, pzSide, setPzSide, allRuns, visibleRuns, hiddenRuns, overlay, setOverlay, setDialog, sims, plotState, onPlotState, plotPanel, runs, panes, editPanes, resolver }}
            {...{ activePane, setActivePane, onDftPicking, resultsSide, marks, setTraceNet, conn, splitDir, pzSplit, stbSplit, pzAll, pzShown, setRowHover, lvNow, hoverDev }}
            {...{ problems, doc, stopTime, goTo, openSaves, plotStop, commit, setRunQueued, run, setMessage }}
          />
        )}
      </div>
      {saves && (
        <SavesPanel
          selection={curSub ? null : saveSelection(doc.texts)}
          mode={saves.mode}
          onMode={(mode) => setSaves((s) => s && { ...s, mode })}
          signals={curSub ? [] : saves.signals}
          max={sim?.result.sizeStop ? signalsThatFit(sim.result.sizeStop.projected, simLimits(!!streamPlan(sim.built.netlist)).max) : undefined}
          onChange={(refs) => commit(setSaveSelection(doc, refs))}
          hover={savesHover}
          onHoverRow={setRowHover}
          picking={savesPicking}
          inactive={!!saves.inactive}
          onActivate={() => {
            setSaves((s) => s && { ...s, inactive: false });
            if (saves.picking) setTool({ kind: 'probe' });
          }}
          onPicking={(on) => setTool(on ? { kind: 'probe' } : { kind: 'select' })}
          blocked={curSub ? t('The saved signals belong to the testbench: go up (Alt+↑) to change them') : undefined}
          onClose={closeSaves}
        />
      )}
      </div>

      <AppDialogs
        picking={!!picking}
        {...{ dialog, setDialog, lib, doc, conn, commit, selection, tool, setTool, setToolState, shapeStyle, setShapeStyleState, makesCycle, adoptNetlistFor, adoptSymbolFor, partGroups, sweepSubParam }}
        {...{ picker, circuitInfo, studyInfo, allRuns, labels, hiddenRuns, setHiddenRuns, setOverlay }}
        {...{ userFileInfo, addUserFiles, removeUserFile, makeUserSymbol, project, projectRef, setProjectState, openSub, addProjectFiles, removeProjectFile, makeProjectSymbol, checkSubName, createModule }}
        {...{ driveConflict, setDriveConflict, resolveDriveConflict, conflict, setConflict, schFont, setSchFont, onSkin, hoverReveal, setHoverReveal, traceW, importInput, file, setFile, openDriveFile }}
        {...{ curSim, sims, deleteSim, deleteVariant, exportName, curSub, slots, opAnnotations, sim, lvNow, simScope, setMessage }}
      />
    </div>
  );
}
