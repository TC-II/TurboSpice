// TurboSpice: editor de esquemáticos .asc (compatible con LTspice) + simulación con ngspice.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { baseName, emptyDoc, type AscDoc, type SymbolInst } from './asc/model.ts';
import { EngineClient } from './engine/client.ts';
import { DIGITAL_TYPE, type SimPlot, type SimResult } from './engine/ngspice.ts';
import { Library, PROJECT_DIR, type LibraryBundle } from './library/library.ts';
import { ltNetlist, ltNetlistText } from './netlist/ltnetlist.ts';
import { netNames } from './schematic/NetNames.tsx';
import { currentArrows } from './schematic/currentArrows.tsx';
import { type Bias } from './sim/bias.ts';
import { symbolBox, visibleText } from './schematic/geometry.ts';
import type { DrawnShapeKind } from './asc/model.ts';
import type { Status } from './NetlistMode.tsx';
import { isPzPlot, pzRuns, rowDevice } from './waveform/ScalarViews.tsx';
import { isStbPlot, stbMainTraces } from './waveform/StbView.tsx';
import { isPzBodePlot, pzMarks, pzRoots } from './waveform/pz.ts';
import { NetlistMode } from './NetlistMode.tsx';
import { PDK_CORNERS, pdkLib, pdkOfSymbols } from './library/pdk.ts';
import type { PartGroup } from './schematic/PartTable.tsx';
import { cmpChoicesFor } from './library/cmp.ts';
import { makeSymbol, subcktPins } from './library/makeSymbol.ts';
import { AppMenu } from './ui/Menu.tsx';
import { Toolbar } from './ui/Toolbar.tsx';
import { readShareHash, shareHash } from './schematic/share.ts';
import { importLtspiceLibrary, loadLtspiceIndex, prefetchLtspice, removeLtspiceLibrary, type LtspiceIndex } from './library/ltspiceLib.ts';
import { addRecent, dropResult, loadProjectSession, loadRecent, loadResult, loadUserFiles, readHandle, saveProjectSession, saveResult, type RecentFile } from './schematic/autosave.ts';
import { badLines, parseAsc } from './asc/parse.ts';
import { SavesPanel } from './schematic/SavesPanel.tsx';
import { savableSignals, saveSelection, setSaveSelection, targetRefs, toggleRefs, type SavableSignal } from './sim/saves.ts';
import { type CircuitInfo, type Picker, type PickWhat } from './schematic/simDialogs.tsx';
import { findAnalysis, findControl, removeAnalysis } from './schematic/directivesEdit.ts';
import { signalsThatFit, simLimits } from './sim/estimate.ts';
import { streamPlan } from './engine/ngspice.ts';
import { ANALYSIS_LINE, type AnalysisKind } from './sim/analyses.ts';
import { activeSim, keepResult, simName, type SimList, type SimView } from './sim/simList.ts';
import { hasParkedControl, isComplexLine, simLine, unparkControl } from './sim/complexSim.ts';
import {
  activeAsc,
  addSim as addProjectSim,
  applyValues,
  mergeFiles,
  projectFileKind,
  lineOf,
  recordRun,
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
import { staleInstances } from './project/staleInstances.ts';
import { runFilesOf, runSummary, exportSubcktNetlist } from './project/exchange.ts';
import { asBenches, EXT, isTurboText, newProject, parseTurbo, projectFromAsc, projectName, serializeTurbo, type Project } from './project/turbo.ts';
import { isNativeSwitch, isTcSwitch } from './schematic/SwitchDialog.tsx';
import { HistoryPanel } from './project/HistoryPanel.tsx';
import type { Probe as TutorialProbe } from './tutorial/lessons.ts';
import { diffCircuits } from './project/diff.ts';
import { isControlBlock } from './netlist/directives.ts';
import { effectiveAttrs } from './asc/resolve.ts';
import { addFlag, addText, allItems, dcSourcesAsCell, deleteItems, setSymbolAttrs, setText, transformItems } from './schematic/edit.ts';
import { pickAscFiles, readAsc, saveFile } from './schematic/fileio.ts';
import { fontChoice, loadFont } from './schematic/fonts.ts';
import { spiceName } from './netlist/spiceName.ts';
import { setMeasureFont } from './schematic/geometry.ts';
import type { ItemRef } from './schematic/geometry.ts';
import { SchematicEditor, type EditorHandle, type Tool, type View as EditorView } from './schematic/SchematicEditor.tsx';
import { ProjectTree, QuickOpen, type TreeSub } from './project/Hierarchy.tsx';
import { ContextMenu, type ContextItem } from './ui/ContextMenu.tsx';
import { TextMenu } from './schematic/TextMenu.tsx';
import { adoptSymbol, formatParamList, parseParamList, symParams } from './project/symbolEdit.ts';
import { adoptModelSymbol, modelParams, setModelParams, setSymAttr as setModelAttr, subcktParams, symAttr, syncModelAttrs, isModelModule, modelModuleFile, modelModuleName, modelModules, modelSymbolText, storeModelSymbol, storeModelText } from './project/modelModule.ts';
import { Tutorial } from './lazyViews.ts';
import { benchesUsing, moduleFile, modules, storeSymbol, subcktSymbolText, storeSubckt, subcktFile, subcktPorts, subName, symbolOutdated, updateSymbol, usages } from './project/subckt.ts';
import { useHistory, type History } from './schematic/useHistory.ts';
import { mirrorX, rotateCW } from './asc/transform.ts';
import { buildSimulation, elementVector, fetchModelFile, netVector, type BuiltSimulation } from './sim/schematicSim.ts';
import type { PlotPanelHandle } from './waveform/PlotPanel.tsx';
import { preloadPlots } from './waveform/lazy.ts';
import { useTraceWidth } from './waveform/lineWidth.ts';
import { displayName, sameRuns, scaleOf, stepLabels } from './waveform/series.ts';
import { paneCurves, type ComplexMode } from './waveform/curves.ts';
import { type TraceBoxHandle } from './waveform/TraceBox.tsx';
import { type Resolver } from './waveform/expr.ts';
import { addTraceTo, asPlotView, colorize, emptyPanes, parsePlt, plotKind, sameExpr, serializePlt, traceColor, viewFromDoc, withView, type Pane, type PlotState, type PlotView } from './waveform/view.ts';
import { readData, sameExceptData, writeData } from './asc/dataText.ts';
import { deviceParamTraces, probeExpr, traceResolver } from './sim/traces.ts';
import { deviceRefs } from './sim/deviceParams.ts';
import { moveOpTag } from './sim/opPins.ts';
import { type MeasTable } from './sim/measResults.ts';
import { type StudyInfo } from './schematic/StudyPanel.tsx';
import { parseAnalysis } from './sim/analyses.ts';
import { loadView } from './schematic/autosave.ts';
import { decode } from './asc/encoding.ts';
import { download } from './schematic/exportSchematic.ts';
import { ResultsSplitter, refitsSchematic, toggleResults, useExpanded, type Expanded } from './ui/ResultsSplitter.tsx';
import { useSideSize } from './ui/SideSplit.tsx';
import { AccountButton, importToDrive } from './cloud/AccountButton.tsx';
import { drive, useGoogle } from './cloud/google.ts';
import { connectProgress, PROGRESS_NAME } from './tutorial/progress.ts';
import { Logo } from './ui/Logo.tsx';
import { hoverCoords, hoverInfo } from './schematic/hoverInfo.ts';
import { getLang, locale, setLang, t } from './i18n/i18n.ts';
import { compileBehavioral, synthesizeVerilog } from './hdl/client.ts';
import { vvpFileOf, applySynth, isStale, moduleOf, verilogFile, verilogModules, verilogPorts, verilogSources } from './hdl/project.ts';
import { applyVariants, renameSubckt as renameVariant, withSubckts } from './hdl/variants.ts';
import { busNames } from './waveform/digital.ts';
import type { SynthResult } from './hdl/yosys.ts';
import { BASE, DEFAULT_PROJECT, MAX_CACHED_BYTES, SAMPLE, SCH_FONT_KEY, SKIN_KEY } from './app/constants.ts';
import type { Dialog, FileState, HierLevel, SimRun } from './app/types.ts';
import { lsGet, lsSet, useTheme } from './app/storage.ts';
import { ascText, registerUserFile } from './app/helpers.ts';
import { HintBar, toolHint, type Hover } from './app/HintBar.tsx';
import { AppDialogs } from './app/AppDialogs.tsx';
import { buildMenus } from './app/menus.tsx';
import { useShortcuts } from './app/shortcuts.ts';
import { useDrive } from './app/useDrive.ts';
import { AppBarRight, ViewTabs } from './app/AppBarSlots.tsx';
import { SimRow } from './app/SimRow.tsx';
import { simProblems } from './app/Problems.tsx';
import { runTestbench } from './app/simulate.ts';
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
  const [saves, setSaves] = useState<{ mode: 'all' | 'some'; signals?: SavableSignal[]; built?: BuiltSimulation; inactive?: boolean; picking?: boolean } | null>(null);
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

  // --- Módulos Verilog (#209): <nombre>.v + <nombre>.asy, como un subcircuito esquemático ---------
  /** Sintetiza el módulo `name` (con `text`, o el código que tiene el proyecto) y guarda el resultado y su símbolo */
  const synthModule = async (name: string, text?: string): Promise<SynthResult> => {
    const f = verilogFile(projectRef.current, name);
    if (!f) return { error: t('There is no Verilog module {name}', { name }), log: '' };
    const src = text ?? f.text;
    const code = src.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
    if (!new RegExp(`^\\s*module\\s+${name}\\b`, 'm').test(code)) return { error: t('{file} has to define the module {name} (the name of the file)', { file: f.name, name }), log: '' };
    const sources = verilogSources(projectRef.current, { name: f.name, text: src });
    // comportamiento: Icarus (.vvp para d_cosim); si no, síntesis con Yosys
    const r = f.hdl === 'behavioral' ? await compileBehavioral(sources, f.name, name, vvpFileOf(name)) : await synthesizeVerilog(sources, f.name, name);
    if (r.block) {
      const p = applySynth(projectRef.current, name, src, r.block, r.vvp);
      projectRef.current = p;
      editProject(p);
      lib.setProjectFiles(p.files);
      setLibVersion((v) => v + 1);
    }
    return r;
  };
  const synthAndReport = async (name: string) => {
    setMessage(t('Synthesizing {name}…', { name }));
    try {
      const r = await synthModule(name);
      setMessage(r.error ? t('{name}: {error}', { name, error: r.error }) : t('{name}: symbol ready in the component browser (F2) under "{PROJECT_DIR}"', { name, PROJECT_DIR }));
    } catch (e) {
      setMessage(t('Yosys could not run: {msg}', { msg: (e as Error).message }));
    }
  };
  /** Antes de simular: sintetiza los módulos Verilog que cambiaron desde la última vez */
  const synthStale = async () => {
    for (const f of verilogModules(projectRef.current).filter(isStale)) {
      setStatus({ kind: 'running', percent: 0, text: t('Synthesizing {name}…', { name: f.name }) });
      const r = await synthModule(moduleOf(f));
      if (r.error) throw new Error(`${f.name}: ${r.error}`);
    }
  };
  /**
   * Antes de mandar la netlist al motor: las instancias con otro parameter usan su propia síntesis
   * (en memoria mientras no cambie el código), y los bloques de comportamiento necesitan su .vvp
   */
  const variantCache = useRef(new Map<string, { subckt: string; vvp?: string }>());
  const withVariants = async (netlist: string): Promise<{ netlist: string; files: Record<string, string>; warnings: string[] }> => {
    const p = projectRef.current;
    const mods = verilogModules(p).filter((f) => f.synth);
    const v = applyVariants(netlist, mods.map((f) => ({ name: moduleOf(f), params: f.synth!.params })));
    const files: Record<string, string> = {};
    for (const f of mods) if (f.synth!.vvp) files[vvpFileOf(moduleOf(f))] = f.synth!.vvp;
    const subs: string[] = [];
    for (const n of v.needs) {
      const f = verilogFile(p, n.module)!;
      const k = `${n.name}\u0000${f.hdl ?? ''}\u0000${f.text}`;
      let hit = variantCache.current.get(k);
      if (!hit) {
        const label = `${moduleOf(f)} (${Object.entries(n.params).map(([a, b]) => `${a}=${b}`).join(' ')})`;
        setStatus({ kind: 'running', percent: 0, text: t('Synthesizing {name}…', { name: label }) });
        const r =
          f.hdl === 'behavioral'
            ? await compileBehavioral(verilogSources(p), f.name, moduleOf(f), vvpFileOf(n.name), n.params)
            : await synthesizeVerilog(verilogSources(p), f.name, moduleOf(f), n.params);
        if (!r.block) throw new Error(`${label}: ${r.error}`);
        hit = { subckt: renameVariant(r.block.subckt, r.block.name, n.name), ...(r.vvp ? { vvp: r.vvp } : {}) };
        variantCache.current.set(k, hit);
      }
      subs.push(hit.subckt);
      if (hit.vvp) files[vvpFileOf(n.name)] = hit.vvp;
    }
    // Icarus (libvvp) corre una sola simulación por vez: un solo bloque de comportamiento
    const cosims = (withSubckts(v.netlist, subs).match(/^\s*x\S*\s.*$/gim) ?? []).filter((l) =>
      mods.some((f) => f.synth!.vvp && new RegExp(`\\s${moduleOf(f)}(__\\w+)?(\\s|$)`, 'i').test(l)),
    );
    if (cosims.length > 1) throw new Error(t('Only one behavioral Verilog block (Icarus) per simulation for now: there are {n}', { n: cosims.length }));
    return { netlist: withSubckts(v.netlist, subs), files, warnings: v.warnings };
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
  const [picking, setPicking] = useState<{ what: PickWhat; ground?: boolean; resolve(v: string | null): void; prev: Tool } | null>(null);

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

  // Tutorial interactivo (Academia): abierto y la foto del estado que mira (se arma antes del render)
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const tutorialProbe = useRef<() => TutorialProbe>();
  const readTutorialProbe = useCallback(() => tutorialProbe.current!(), []);
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
  // (data-autosave en <html>: «pending» hasta que termina el último guardado, «saved» después; lo esperan los e2e)
  const autosaveSeq = useRef(0);
  useEffect(() => {
    if (!restored) return;
    const seq = ++autosaveSeq.current;
    document.documentElement.dataset.autosave = 'pending';
    const tt = setTimeout(() => {
      serializeTurbo(snapshot())
        .then((turbo) => saveProjectSession({ name: file.name, handle: file.handle, driveId: file.driveId, driveVersion: file.driveVersion, turbo, dirty, time: Date.now() }))
        .then(() => seq === autosaveSeq.current && (document.documentElement.dataset.autosave = 'saved'))
        .catch((e) => console.error(e));
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

  const { driveConflict, setDriveConflict, setAutoDrive, resolveDriveConflict, doSaveDrive, openDriveFile } = useDrive({
    ...{ account: google.account, file, setFile, dirty, setDirty, editRev, projectRef, snapshot, turboBytes, turboName, savedAs, remember, openBytes, confirmDiscard, setDialog, setMessage },
  });

  // Con la sesión de Google iniciada, Guardar va al Drive; si no, al equipo
  const doSave = (saveAs = false) => (google.account ? doSaveDrive(saveAs) : doSaveLocal(saveAs));


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
  const exporting = dialog?.kind === 'export';
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
  /** `unlimited`: «seguir igual» con un transitorio que no entraba, hasta llenar la memoria */
  const run = async ({ unlimited = false }: { unlimited?: boolean } = {}) => {
    // se simula el circuito actual (aunque se esté mirando una corrida vieja)
    // los subcircuitos no se simulan solos (#180): se simula desde un testbench
    if (pathRef.current.length) return setMessage(t('Subcircuits are not simulated on their own: go up to a testbench (Alt+↑) to simulate'));
    const doc = liveDoc;
    setViewRun('');
    // el panel de señales guardadas queda para la próxima corrida: la punta de prueba grafica (#364)
    setSaves((s) => s && { ...s, inactive: true, picking: savesPicking });
    aborting.current = false;
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
      const { built, result, ms, meas, blk, xy } = await runTestbench({
        ...{ doc, simAsc, lib, ltIndex, engine, unlimited, ascName, allTraces, synthStale, withVariants },
        onBias: (built, bias) => setOpPoint({ doc, built, bias }),
      });
      // los resultados de la última corrida quedan en el navegador (no van en el .turbo); los muy
      // grandes no: guardarlos los copia entera otra vez (y la base del navegador puede no admitirlos)
      if (id) {
        const bytes = result.plots.reduce((n, pl) => n + pl.vectors.reduce((k, v) => k + v.real.byteLength + (v.imag?.byteLength ?? 0), 0), 0);
        if (bytes <= MAX_CACHED_BYTES) saveResult(id, { asc: simAsc, result: { result, meas }, time: Date.now() });
        else dropResult(id);
      }
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
      const pzBodes = result.plots.filter(isPzBodePlot);
      const shown = pzBodes[pzBodes.length - 1] ?? pzs[pzs.length - 1] ?? withScale[withScale.length - 1] ?? result.plots[result.plots.length - 1];
      setPlotName(shown?.name ?? '');
      // Qué graficar: la vista recordada para este análisis, o lo que pida el .control con
      // "plot", o lo que ya se estaba mirando (las trazas que no existan avisan en su chip)
      const remembered = shown && plotView[plotKind(shown.name)];
      // .stb: la ganancia de lazo, R (GFT) o T (Tian); con la sonda diferencial, un pane por modo (#333)
      const stbMain = isStbPlot(shown) ? stbMainTraces(shown) : [];
      // vistas guardadas antes de que existieran T y R: la vieja "loopgain" pasa a la de ahora
      const keptView = remembered && stbMain.length ? remembered.map((pn) => ({ ...pn, traces: pn.traces.map((tr) => (/^\s*loopgain\s*$/i.test(tr.expr) ? { ...tr, expr: stbMain[0] } : tr)) })) : remembered;
      // (la vista que se usa tiene que traer alguna traza de este .stb: la de la sonda simple no sirve con la diferencial)
      const fits = (pns: typeof panes) => pns.some((pn) => pn.traces.some((tr) => shown!.vectors.some((v) => v.name === tr.expr.trim().toLowerCase())));
      if (xy.length && shown === xy[xy.length - 1]) setPanes([{ traces: [{ expr: shown.vectors[1].name }] }]);
      else if (stbMain.length && !fits(keptView ?? panes)) setPanes(stbMain.map((expr) => ({ traces: [{ expr }] })));
      else if (isPzBodePlot(shown) && !fits(keptView ?? panes)) setPanes([{ traces: [{ expr: 'h' }] }]);
      else if (keptView) {
        setPanes(keptView);
        if (built.controlPanes.length) built.warnings.push(t('Using the remembered view instead of the .control "plot" commands'));
      } else if (built.controlPanes.length) setPanes(built.controlPanes);
      const errs = result.errors.length ? result.errors : [];
      setStatus(errs.length && (!result.plots.length || result.sizeStop) ? { kind: 'error', message: errs[0] } : { kind: 'done', ms });
      // símbolos faltantes: el circuito simulado no es el del esquemático, el aviso va primero (#108)
      const missing = built.missingSymbols;
      setMessage(
        errs.length && (!result.plots.length || result.sizeStop)
          ? t('{p0} — see the Errors tab', { p0: errs[0] })
          : missing.length
          ? missing.length === 1
            ? t("Incomplete simulation: symbol {names} wasn't found and was left out of the circuit. The results don't match the schematic.", { names: missing[0] })
            : t("Incomplete simulation: symbols {names} weren't found and were left out of the circuit. The results don't match the schematic.", { names: missing.join(', ') })
          : built.warnings.length
            ? t('{p0} — see the Errors tab', { p0: built.warnings.length === 1 ? built.warnings[0] : t('{n} warnings', { n: built.warnings.length }) })
            : undefined,
      );
      setStopPlotted(false);
      // frenado por memoria: la punta de prueba recién con «Plot up to here» (que lleva al gráfico)
      if (result.plots.length && result.sizeStop) setPanel('problems');
      else if (result.plots.length) {
        setTool({ kind: 'probe' });
        const nothingPlotted = !(remembered ?? panes).some((p) => p.traces.length) && !built.controlPanes.length;
        setPanel(errs.length ? 'problems' : meas?.rows.length && (nothingPlotted || (blk.table && !xy.length)) ? 'meas' : 'plot');
      } else setPanel(errs.length ? 'problems' : 'log');
    } catch (e) {
      // (abortar rechaza la simulación en curso: el estado ya lo puso abort)
      if (!aborting.current) setStatus({ kind: 'error', message: (e as Error).message });
    }
  };

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

  // frenada por memoria (#363): lo simulado hasta ahí se mira recién al elegir «Plot up to here»
  const [stopPlotted, setStopPlotted] = useState(false);
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

  const aborting = useRef(false);
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

  // Sentido positivo de la corriente en los pines (punta de prueba y anotación del OP)
  // fila de la tabla de resultados bajo el mouse: su red o sus flechas se resaltan en el esquemático
  const [rowHover, setRowHover] = useState<string | null>(null);
  const rowNet = rowHover ? /^V\(([^,()]+)\)$/i.exec(rowHover)?.[1] : undefined;
  // …y el componente de la fila (@Q1[gm], Ic(Q1), I(R1)); al revés, el componente bajo el mouse resalta sus filas
  const rowDev = rowHover ? rowDevice(rowHover) : null;
  const rowSymbol = rowDev && !lvNow ? doc.symbols.findIndex((s) => spiceName(s.attrs.get('InstName') ?? '').toUpperCase() === rowDev) : -1;
  // (en el panel de señales guardadas, un subcircuito U1 es XU1, como en la netlist)
  const rowElement = rowDev && rowSymbol < 0 && !curSub ? saves?.built?.lt.elements.find((e) => e.name.replace(/§/g, '').toUpperCase() === rowDev) : undefined;
  const [hoverDev, setHoverDev] = useState<string>();
  const onHoverSymbol = useCallback((i: number | undefined) => setHoverDev(i === undefined ? undefined : spiceName(docRef.current.symbols[i]?.attrs.get('InstName') ?? '') || undefined), []);
  const arrows = useMemo(() => {
    const rowCurrent = !!rowHover && /^I/i.test(rowHover);
    if (!sim || (lvNow ? !simScope : sim.doc.symbols !== doc.symbols) || !(showOp || tool.kind === 'probe' || rowCurrent)) return undefined;
    const traces = panes.flatMap((p) => p.traces.map((tt, i) => ({ t: tt, color: traceColor(tt, i) }))).filter((x) => !x.t.hidden);
    // la flecha toma el color de la traza de su corriente (la del pin o la del componente)
    const colorOf = (target: { symbol: number; pin?: number }) => {
      const expr = probeExpr(sim.built, target, simScope);
      return expr ? traces.find((x) => sameExpr(x.t.expr, expr))?.color : undefined;
    };
    const all = currentArrows(doc, lib, simScope ? simScope.block.lt.elements : sim.built.lt.elements);
    const perSym = new Map<number, number>();
    for (const a of all) perSym.set(a.sym, (perSym.get(a.sym) ?? 0) + 1);
    return all.map((a) => {
      // la corriente del componente (sin pin) sólo colorea la flecha si es la única: en uno con
      // varios terminales (Q, M, X…) pintaría todas, y es la de un solo terminal
      const color = colorOf({ symbol: a.sym, pin: a.pin }) ?? (perSym.get(a.sym) === 1 ? colorOf({ symbol: a.sym }) : undefined);
      const isRow = (target: { symbol: number; pin?: number }) => {
        const expr = rowCurrent ? probeExpr(sim.built, target, simScope) : undefined;
        return !!expr && sameExpr(expr, rowHover!);
      };
      const hl = isRow({ symbol: a.sym, pin: a.pin }) || (perSym.get(a.sym) === 1 && isRow({ symbol: a.sym }));
      return { ...a, ...(color ? { color } : {}), ...(hl ? { hl } : {}) };
    }).filter((a) => showOp || tool.kind === 'probe' || a.hl);
  }, [sim, doc, lib, showOp, tool.kind, panes, lvNow, simScope, rowHover]);

  // Schematic | Results: la unión entre las dos pestañas cae sobre el borde derecho de la cápsula
  // del proyecto (que mide --tree-w), sea cual sea el ancho del logo o del texto en cada idioma
  const resolver = useCallback((p: SimPlot) => traceResolver(sim?.built ?? null, p, sim ? sameRuns(sim.result.plots, p) : [p]), [sim]);

  // Color de cada red con una traza V(red) visible en los paneles (el cable toma el color de la
  // traza); sólo con la punta de prueba
  // Con la punta de prueba y sólo las señales elegidas (#314): lo que no se guardó, atenuado (no
  // mientras se elige qué guardar: ahí lo elegido son las marcas del panel, #364)
  const unsaved = useMemo(() => {
    if (tool.kind !== 'probe' || savesPicking || !sim || !plot || path.length || !saveSelection(sim.built.lt.texts)) return undefined;
    const names = new Set(plot.vectors.map((v) => v.name.toLowerCase()));
    const nets = new Set(conn.nets.map((n) => n.name).filter((n) => n && n !== '0' && !names.has(netVector(n))).map((n) => n.toLowerCase()));
    const symbols = new Set(
      sim.built.lt.elements.filter((e) => {
        const v = elementVector(sim.built, e.name);
        return v && !names.has(v) && ![...names].some((n) => n.startsWith(`${v.replace(/\[.*$/, '')}[`));
      }).map((e) => e.sym),
    );
    return { nets, symbols };
  }, [tool.kind, savesPicking, sim, plot, path.length, conn]);
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
  // (tampoco si el renglón de la leyenda se reacomoda o se pasa a otro panel bajo el cursor, ni si
  // la ventana pierde el foco: el pointerleave de un elemento que desaparece nunca llega)
  useEffect(() => setTraceNet(undefined), [panes]);
  useEffect(() => {
    const off = () => setTraceNet(undefined);
    window.addEventListener('blur', off);
    return () => window.removeEventListener('blur', off);
  }, []);
  const traceNetShown =traceNet && panes.some((p) => p.traces.some((tt) => sameExpr(tt.expr, `V(${traceNet})`))) ? traceNet : undefined;

  // Punta de prueba: agrega la traza al panel activo. Si ya está ahí no hace nada (se quita a
  // mano); si está en otro panel, queda en los dos con el mismo color
  // Vista partida del subcircuito (#180): su símbolo al lado. Los pines siguen a los puertos
  // mientras se edita (los que quedan conservan su lugar)
  // (un módulo Verilog, #209: en lugar del esquemático se ve su código; sus pines son los de la síntesis)
  const curModule = curSub ? moduleFile(project, curSub) : undefined;
  const curVerilog = curModule?.kind === 'verilog' ? curModule : undefined;
  const subPorts = useMemo(() => (curVerilog ? verilogPorts(curVerilog, subcktSymbolText(project, curSub)).map((x) => x.name) : curSub ? subcktPorts(liveDoc) : []), [curSub, curVerilog, liveDoc, project]);
  const subPortsKey = subPorts.join(',');
  useEffect(() => {
    if (!curSub || curVerilog) return;
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
  /** Puerto nuevo pedido desde el símbolo (un pin con otro nombre): etiqueta con puerto debajo de las otras */
  const addPort = (name: string) => {
    const fs = doc.flags;
    const x = fs.length ? Math.min(...fs.map((f) => f.x)) : -128;
    const y = (fs.length ? Math.max(...fs.map((f) => f.y)) : -64) + 64;
    commit(addFlag(doc, { x, y }, name, 'BiDir'));
  };
  /** El netlist de un componente existente en el modelo que se edita (el dibujo no se toca): de un
   *  subcircuito del proyecto (o un módulo Verilog sintetizado), su .subckt; de uno de la librería,
   *  su archivo de modelos entero, tal cual. SpiceModel pasa a ser el .subckt/.model que usaba */
  const adoptNetlistFor = async (type: string) => {
    const p0 = projectRef.current;
    if (!curModel) return;
    const vf = verilogFile(p0, type);
    let net = vf ? vf.synth?.subckt : subcktFile(p0, type) ? exportSubcktNetlist(snapshot(), type, lib)?.text : undefined;
    let from = type;
    if (!net) {
      const asy = lib.symbolText(type);
      const at = (k: string) => (asy ? symAttr(asy, k) : '');
      // como el netlist: sin ModelFile, SpiceModel es el archivo y el nombre es Value2 o Value (#ltnetlist)
      const file = at('ModelFile') || (at('Prefix') === 'X' ? at('SpiceModel') : '');
      from = (at('ModelFile') ? at('SpiceModel') || at('Value') : at('Value2') || at('Value')).split(/\s/)[0];
      const rel = file ? lib.resolveModelFile(file) : undefined;
      try {
        net = rel ? (lib.userFile(rel) ?? (await fetchModelFile(rel))) : undefined;
      } catch {
        net = undefined;
      }
    }
    if (!net) return setMessage(t('{sym} has no netlist to import (only subcircuits and components with a model file)', { sym: baseName(type) }));
    let p = storeModelText(p0, curModel, net.endsWith('\n') ? net : `${net}\n`);
    const sym = modelSymbolText(p, curModel);
    // los parámetros del .subckt (params: G=1) van, en orden, a Value, Value2, SpiceLine y SpiceLine2
    const ps = from ? subcktParams(net, from) : [];
    if (sym && from) p = storeModelSymbol(p, curModel, setModelParams(syncModelAttrs(setModelAttr(sym, 'SpiceModel', from), net), ps.length ? ps : modelParams(sym)));
    projectRef.current = p;
    editProject(p);
    setMessage(t('Netlist of {sym} imported into {name}: check the pins of the symbol', { sym: baseName(type), name: curModel }));
  };
  /** Un .asy existente como símbolo del subcircuito (o del modelo) que se edita (#199) */
  const adoptSymbolFor = (type: string) => {
    const asy = lib.symbolText(type) ?? (curModel ? subcktSymbolText(projectRef.current, type) : undefined);
    if (asy && curModel) {
      // el código no se toca: los pines se pasan al .lib con «Update pins in .lib»
      const p = storeModelSymbol(projectRef.current, curModel, adoptModelSymbol(asy, modelSymbolText(projectRef.current, curModel) ?? '', curModel));
      projectRef.current = p;
      editProject(p);
      return setMessage(t('Symbol {sym} adopted: to pass its pins to the code, use «Update pins in .lib»', { sym: baseName(type) }));
    }
    if (!curSub || !asy) return setMessage(t('Symbol not found: {p0}', { p0: type }));
    if (subcktFile(projectRef.current, type)) return setMessage(t('Choose a symbol from the library, not another subcircuit'));
    const ports = subPorts.map((n) => ({ name: n, dir: liveDoc.flags.find((f) => f.name === n)?.ioPin }));
    editSymbol(adoptSymbol(asy, ports, symText ? symParams(symText) : []));
    setMessage(t('Symbol {sym} adopted: check the port of each pin («Port of each pin», under the symbol)', { sym: baseName(type) }));
  };
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
  const traceNames = useMemo(() => {
    const sc = plot && scaleOf(plot);
    if (!plot) return [];
    // y los buses que forman los nodos digitales de los bloques Verilog (#209): Dig(x1.q[3:0])
    return [...new Set([...plot.vectors.filter((v) => v !== sc).map(displayName), ...busNames(plot.vectors.filter((v) => v.type === DIGITAL_TYPE).map((v) => v.name))])];
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

  const picker: Picker = (what, opts) =>
    new Promise((resolve) => {
      // si ya se estaba eligiendo para otro campo, ése queda sin valor y la herramienta a la que
      // se vuelve sigue siendo la de antes de empezar
      picking?.resolve(null);
      setPicking({ what, ground: opts?.ground, resolve, prev: picking ? picking.prev : tool });
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
    if (picking.what === 'net') return net && (net !== '0' || picking.ground) ? net : null;
    if (symbol === undefined) return null;
    const a = effectiveAttrs(doc.symbols[symbol], lib.symbol(doc.symbols[symbol].type));
    // (el nombre que ve el simulador: uno con $…$ va simple, spiceName)
    const inst = a.get('InstName');
    const name = inst === undefined ? null : spiceName(inst);
    if (picking.what === 'component') return a.get('Prefix') ? name : null;
    if (picking.what === 'probe') return /^(LoopProbe|LoopProbe_Dif|DiffLoopProbe)$/i.test(a.get('SpiceModel') ?? '') ? name : null;
    return /^[VI]$/i.test(a.get('Prefix') ?? '') ? name : null;
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

  const openStudy = () => setDialog({ kind: 'study' });
  /**
   * Complex simulation (#241): si el testbench ya lo es, abre el Studio; si pasó a un análisis
   * simple, recupera su .control; si nunca tuvo, abre el Studio para armarlo
   */
  const complexSim = () => {
    if (curSub) return setMessage(t('The analysis belongs to the testbench: go up (Alt+↑) to change it'));
    if (!isComplexLine(docLine) && hasParkedControl(doc)) return commit(unparkControl(doc));
    openStudy();
  };
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
    setMessage(t('{inst}: {param} = {{pname}}, swept with {step}. Edit the values in the Studio.', { inst, param, pname, step }));
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
  /**
   * Panel de señales guardadas (#314, #364), a la derecha de la simulación; `choose`: para elegir
   * (desde «Choose signals»), con «sólo lo elegido» y la punta de prueba
   */
  const openSaves = (choose?: boolean) => {
    if (curSub) return setMessage(t('The saved signals belong to the testbench: go up (Alt+↑) to change them'));
    setSaves((s) => ({ ...s, inactive: false, mode: choose ? 'some' : (s?.mode ?? (saveSelection(doc.texts) ? 'some' : 'all')) }));
    if (choose) setTool({ kind: 'probe' });
  };
  const closeSaves = () => {
    setSaves(null);
    setRowHover(null);
    if (tool.kind === 'probe' && !sim) setTool({ kind: 'select' });
  };
  // las señales del circuito, de nuevo cuando cambia (no al cambiar sólo lo elegido)
  useEffect(() => {
    if (!savesOpen) return;
    let live = true;
    const id = setTimeout(() => {
      buildSimulation(docRef.current, lib, ascName())
        .then((b) => live && setSaves((s) => s && { ...s, signals: savableSignals(b), built: b }))
        .catch(() => live && setSaves((s) => s && { ...s, signals: [], built: undefined }));
    }, 150);
    return () => {
      live = false;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savesOpen, doc.symbols, doc.wires, doc.flags, lib]);
  const pickSave = (target: { net?: string; symbol?: number; pin?: number }) => {
    const b = saves?.built;
    if (!b) return;
    const refs = targetRefs(b, target);
    if (!refs.length) return setMessage(t('Nothing to save there: click a wire (voltage) or a component (current)'));
    commit(setSaveSelection(doc, toggleRefs(saveSelection(doc.texts) ?? [], refs)));
  };
  // lo que está bajo el mouse en el esquemático, para resaltar su fila
  const [hoverTarget, setHoverTarget] = useState<{ net?: string; symbol?: number; pin?: number }>();
  const savesHover = useMemo(() => {
    const b = saves?.built;
    const refs = hoverTarget && b ? targetRefs(b, hoverTarget) : [];
    // el cuerpo de un componente: todas sus filas (con el nombre de la lista: XU1, no U1)
    const el = hoverTarget?.symbol !== undefined && hoverTarget.pin === undefined ? b?.lt.elements.find((e) => e.sym === hoverTarget.symbol) : undefined;
    return { refs, device: el?.name.replace(/§/g, '') };
  }, [hoverTarget, saves?.built]);

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
  // (después de allRuns: los atajos se instalan en cada render, con lo de ese render)
  useShortcuts({
    ...{ dialog, history, status, running, selection, allRuns, hasNets, area, editor, plotPanel, pltInput, viewerKeys, simulate, abort, showLog, doSave, doOpen, setQuickOpen, goUp, reapplyView, undoPanes },
    ...{ setDialog, setMessage, rotateOrMirror, copySelection, paste, setTool, selectAll, setSelection, setShowGrid, setShowLoose, setShowNets, setNetHover, openControl, openStudy, openSimulation, zoomBox, descend, startMove, shapeTool, deleteSelection },
  });
  // corridas que se muestran: todas (salvo las ocultas, Shift+S) al superponer, o sólo la elegida
  const visibleRuns = useMemo(() => allRuns.filter((r) => !hiddenRuns.has(r.name)), [allRuns, hiddenRuns]);
  const runs = useMemo(() => (plot ? (overlay && visibleRuns.length ? visibleRuns : [plot]) : []), [overlay, visibleRuns, plot]);
  const labels = useMemo(() => (sim ? stepLabels(sim.result.plots, sim.built.ng.steps) : new Map<string, string>()), [sim]);
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
          {/* los avisos y estados van todos en la barra de abajo, a la derecha (#342): también las
              preguntas (aplicar un valor en las otras simulaciones, agregar una vista guardada) y
              la corrida vieja que se está mirando. Elegir en el esquemático no pone cartel: la
              barra dice qué clickear (Esc cancela) */}
          <HintBar
            sink={hoverSink}
            text={(hover) => (savesPicking ? t('Click a wire (voltage) or a component (current) to save it, or again to stop saving it') : tool.kind === 'select' ? (hover?.ref ? hoverInfo(doc, lib, conn, hover.ref).join(' · ') : hover ? hoverCoords(hover.at) : '') : toolHint(tool))}
            message={message}
            onDismiss={() => setMessage(undefined)}
            offers={
              <>
                {viewed && (
                  <span className="status-offer history">
                    {t('Run from')}{' '}{new Date(viewed.time).toLocaleString(locale())} {t('· read-only')}
                    <button onClick={() => restoreRun(viewed.id)}>{t('Restore')}</button>
                    <button onClick={() => setViewRun('')}>{t('Back to current')}</button>
                  </span>
                )}
                {valueOffer && !picking && (
                  <span className="status-offer">
                    {valueOffer.changes.map((c) => `${c.inst} = ${c.from}`).join(', ')} {t('also in')}{' '}
                    {valueOffer.sims.length === 1 ? t('1 simulation') : t('{length} simulations', { length: valueOffer.sims.length })}
                    <button onClick={applyValueOffer} title={t('Change to {p0} in the other simulations', { p0: valueOffer.changes.map((c) => `${c.inst} = ${c.to}`).join(', ') })}>
                      {t('Apply')}
                    </button>
                    <button onClick={() => setValueOffer(null)}>No</button>
                  </span>
                )}
                {offerView && !picking && (
                  <span className="status-offer">
                    {t('There\'s a results view of')}{' '}{file.name} {t('saved in this browser. Add it to the .asc?')}
                    <button onClick={acceptOfferedView}>{t('Add')}</button>
                    <button onClick={() => setOfferView(null)}>No</button>
                  </span>
                )}
              </>
            }
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
