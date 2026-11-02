// TurboSpice: editor de esquemáticos .asc (compatible con LTspice) + simulación con ngspice.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { baseName, emptyDoc, type AscDoc, type SymbolInst } from './asc/model.ts';
import { EngineClient } from './engine/client.ts';
import { DIGITAL_TYPE, type SimPlot, type SimResult } from './engine/ngspice.ts';
import { Library, PROJECT_DIR, USER_DIR, scanModels, type LibraryBundle } from './library/library.ts';
import { ltNetlist, ltNetlistText, missingSymbolIn } from './netlist/ltnetlist.ts';
import { netNames, type Annotation } from './schematic/NetNames.tsx';
import { currentArrows } from './schematic/currentArrows.tsx';
import { biasCommand, biasParams, elementBias, netBias, pinBias, sameCircuit, scopedNetBias, type Bias } from './sim/bias.ts';
import { pinPoints, symbolBox, visibleText } from './schematic/geometry.ts';
import type { DrawnShapeKind } from './asc/model.ts';
import type { Status } from './NetlistMode.tsx';
import { isPzPlot, PzPlane, pzRuns, ResultTable, rowDevice } from './waveform/ScalarViews.tsx';
import { isStbPlot, StbView, stbMainTraces } from './waveform/StbView.tsx';
import { isPzBodePlot, pzBodePlots, pzMarks, pzRoots } from './waveform/pz.ts';
import { SmithChart } from './waveform/SmithChart.tsx';
import { NetlistMode } from './NetlistMode.tsx';
import { PDK_CORNERS, pdkLib, pdkOfSymbols } from './library/pdk.ts';
import { type UserFileInfo } from './schematic/dialogs.tsx';
import type { PartGroup } from './schematic/PartTable.tsx';
import { cmpChoicesFor } from './library/cmp.ts';
import { makeSymbol, schematicPorts, subcktPins } from './library/makeSymbol.ts';
import { AppMenu, MenuButton, type MenuItem } from './ui/Menu.tsx';
import { Icon } from './ui/icons.tsx';
import { Toolbar, type ToolGroup } from './ui/Toolbar.tsx';
import { readShareHash, shareHash } from './schematic/share.ts';
import { importLtspiceLibrary, loadLtspiceIndex, prefetchLtspice, removeLtspiceLibrary, type LtspiceIndex } from './library/ltspiceLib.ts';
import { addRecent, dropResult, loadProjectSession, loadRecent, loadResult, loadUserFiles, readHandle, saveProjectSession, saveResult, saveUserFiles, type RecentFile, type UserFile } from './schematic/autosave.ts';
import { badLines, parseAsc } from './asc/parse.ts';
import { serializeAsc } from './asc/serialize.ts';
import { SavesPanel } from './schematic/SavesPanel.tsx';
import { elementRefs, savableSignals, saveSelection, setSaveSelection, targetRefs, toggleRefs, type SavableSignal } from './sim/saves.ts';
import { type CircuitInfo, type Picker, type PickWhat } from './schematic/simDialogs.tsx';
import { findAnalysis, findControl, removeAnalysis, replaceLine, setAnalysisLine } from './schematic/directivesEdit.ts';
import { fmtBytes, measuredSizeProblem, signalsThatFit, simLimits } from './sim/estimate.ts';
import { streamPlan } from './engine/ngspice.ts';
import { ANALYSIS_LINE, type AnalysisKind } from './sim/analyses.ts';
import { activeSim, analysisDetail, analysisLabel, defaultLine, keepResult, analysisProblem, pzLogErrors, reuseLine, simName, type SimList, type SimView } from './sim/simList.ts';
import { hasParkedControl, isComplexLine, parkControl, simLine, unparkControl } from './sim/complexSim.ts';
import {
  activeAsc,
  addSim as addProjectSim,
  addGroup,
  applyValues,
  removeGroup,
  renameGroup,
  setBenchGroup,
  placeBench,
  groupPeersWith,
  propagateAttrs,
  mergeFiles,
  projectFileKind,
  cornerSims,
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
import { staleInstances } from './project/staleInstances.ts';
import { exportAllZip, subcktFilesFor, runFilesOf, runSummary, exportSubcktNetlist, exportSubcktZip, exportVariantZip, importEntries, subcktFilesFrom, type Imported } from './project/exchange.ts';
import { readZip, type ZipEntry } from './project/zip.ts';
import { asBenches, EMPTY_ASC, EXT, isTurboText, newId, newProject, parseTurbo, projectFromAsc, projectName, serializeTurbo, type Project } from './project/turbo.ts';
import { isNativeSwitch, isTcSwitch } from './schematic/SwitchDialog.tsx';
import { HistoryPanel } from './project/HistoryPanel.tsx';
import type { Probe as TutorialProbe } from './tutorial/lessons.ts';
import { diffCircuits } from './project/diff.ts';
import { isControlBlock } from './netlist/directives.ts';
import { effectiveAttrs } from './asc/resolve.ts';
import { addFlag, addText, allItems, dcSourcesAsCell, deleteItems, extractItems, pasteItems, setSymbolAttrs, setText, transformItems } from './schematic/edit.ts';
import { parseSource } from './sim/sources.ts';
import { pickAscFiles, readAsc, saveFile } from './schematic/fileio.ts';
import { fontChoice, loadFont } from './schematic/fonts.ts';
import { spiceName } from './netlist/spiceName.ts';
import { DISPLAY_PREFIXES, formatSi } from './netlist/spicenum.ts';
import { setMeasureFont } from './schematic/geometry.ts';
import type { ItemRef } from './schematic/geometry.ts';
import { SchematicEditor, type EditorHandle, type Tool, type View as EditorView } from './schematic/SchematicEditor.tsx';
import { ProjectTree, QuickOpen, type BenchItem, type TreeSub } from './project/Hierarchy.tsx';
import { benchParams, benchVariables } from './schematic/benchParams.ts';
import { ContextMenu, type ContextItem } from './ui/ContextMenu.tsx';
import { TextMenu } from './schematic/TextMenu.tsx';
import { adoptSymbol, formatParamList, parseParamList, setSymParams, symParams } from './project/symbolEdit.ts';
import { addModelModule, adoptModelSymbol, modelParams, setModelParams, setSymAttr as setModelAttr, subcktParams, symAttr, syncModelAttrs, isModelModule, modelModuleFile, modelModuleName, modelModules, modelSymbolText, removeModelModule, renameModelModule, storeModelSymbol, storeModelText } from './project/modelModule.ts';
import { ModelEditor, SymbolEditor, Tutorial } from './lazyViews.ts';
import { addSubckt, benchesUsing, childSubckts, freeSubcktName, moduleFile, modules, placingCycle, storeSymbol, subcktSymbol, subcktSymbolText, removeSubckt, renameSubckt, storeSubckt, subcktFile, subcktPorts, subName, symbolOutdated, updateSymbol, usages, validSubcktName } from './project/subckt.ts';
import { useHistory, type History } from './schematic/useHistory.ts';
import { mirrorX, rotateCW } from './asc/transform.ts';
import { buildSimulation, elementVector, fetchModelFile, netVector, type BuiltSimulation } from './sim/schematicSim.ts';
import type { PlotPanelHandle } from './waveform/PlotPanel.tsx';
import { PlotPanel, preloadPlots } from './waveform/lazy.ts';
import { useTraceWidth } from './waveform/lineWidth.ts';
import { displayName, sameRuns, scaleOf, stepLabels, stepSweepPlots } from './waveform/series.ts';
import { paneCurves, placeTrace, type ComplexMode } from './waveform/curves.ts';
import { TraceBox, type TraceBoxHandle } from './waveform/TraceBox.tsx';
import { evalTrace, type Resolver } from './waveform/expr.ts';
import { addTraceTo, asPlotView, colorize, emptyPanes, parsePlt, plotKind, sameExpr, serializePlt, traceColor, viewFromDoc, withView, type Pane, type PlotState, type PlotView } from './waveform/view.ts';
import { readData, sameExceptData, writeData } from './asc/dataText.ts';
import { deviceParamTraces, digitalProbeExpr, multiPinPrefix, probeExpr, traceResolver } from './sim/traces.ts';
import { deviceRefs } from './sim/deviceParams.ts';
import { hideOpTag, moveOpTag, noOpTags, opPinKey, opTagsData, opTagsFromData, opTagVisible, toggleOpTag, unhideOpTags, type OpPinTarget, type OpTags } from './sim/opPins.ts';
import { instScope, scopeElementOf, type InstScope } from './sim/context.ts';
import { blockResultsFromLog, measSweepPlot, measureResults, xyPlotsFromLog, type MeasTable } from './sim/measResults.ts';
import { MeasPanel } from './sim/MeasPanel.tsx';
import { type StudyInfo } from './schematic/StudyPanel.tsx';
import { parseAnalysis } from './sim/analyses.ts';
import { loadView } from './schematic/autosave.ts';
import { decode, decodeText } from './asc/encoding.ts';
import { download } from './schematic/exportSchematic.ts';
import { ResultsSplitter, refitsSchematic, toggleResults, useExpanded, type Expanded } from './ui/ResultsSplitter.tsx';
import { SideSplit, useSideSize } from './ui/SideSplit.tsx';
import { ErrorBoundary } from './ui/ErrorBoundary.tsx';
import { AccountButton, importToDrive } from './cloud/AccountButton.tsx';
import { drive, useGoogle } from './cloud/google.ts';
import { connectProgress, PROGRESS_NAME } from './tutorial/progress.ts';
import { USER_LIBRARY_NAME, mergeUserFiles, pullUserLibrary, pushUserLibrary, userLibraryText } from './cloud/userLibrary.ts';
import { Logo } from './ui/Logo.tsx';
import { hoverCoords, hoverInfo } from './schematic/hoverInfo.ts';
import { getLang, locale, setLang, t } from './i18n/i18n.ts';
import { compileBehavioral, synthesizeVerilog } from './hdl/client.ts';
import { addVerilogModule, looksBehavioral, setHdlMode, vvpFileOf, withParams, applySynth, isStale, moduleOf, storeVerilog, verilogFile, verilogModules, verilogPorts, verilogSources, verilogSymbol } from './hdl/project.ts';
import { applyVariants, renameSubckt as renameVariant, withSubckts } from './hdl/variants.ts';
import { VerilogModule } from './hdl/VerilogModule.tsx';
import { busNames } from './waveform/digital.ts';
import { busBits, isBusName } from './netlist/bus.ts';
import type { SynthResult } from './hdl/yosys.ts';
import { BASE, DEFAULT_PROJECT, MAX_CACHED_BYTES, PANEL_NAMES, SAMPLE, SCH_FONT_KEY, SKIN_KEY } from './app/constants.ts';
import type { Dialog, FileState, HierLevel, SimRun } from './app/types.ts';
import { lsGet, lsSet, useTheme } from './app/storage.ts';
import { ascText, clipboardImage, registerUserFile, userFileKind } from './app/helpers.ts';
import { HintBar, toolHint, type Hover } from './app/HintBar.tsx';
import { AppDialogs } from './app/AppDialogs.tsx';
import { buildMenus } from './app/menus.tsx';
import { useShortcuts } from './app/shortcuts.ts';
import { useDrive } from './app/useDrive.ts';
import { AppBarRight, ViewTabs } from './app/AppBarSlots.tsx';
import { SimRow } from './app/SimRow.tsx';


/** Copia interna por si el navegador no deja leer el portapapeles */
let clipboardFallback = '';

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
  }, [doc, lib, ltIndex]);
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
      if (ltIndex) await prefetchLtspice(doc, lib, ltIndex);
      // los módulos Verilog que cambiaron se sintetizan antes (#209)
      await synthStale();
      const prepare = async (pinCurrents: boolean) => {
        const b = await buildSimulation(doc, lib, ascName(), allTraces(), { pinCurrents });
        // y las instancias con otro parameter usan su propia síntesis
        const vv = await withVariants(b.netlist);
        b.netlist = vv.netlist;
        b.files = { ...b.files, ...vv.files };
        b.warnings.push(...vv.warnings);
        return b;
      };
      let built = await prepare(true);
      // lo que no entra en memoria no llega a ngspice: sólo el error, en Problemas (#58)
      // un componente sin valor tampoco se simula (#256): el error va a Problemas con el link
      // un análisis incompleto (sin fuente, nodo o valor) tampoco: ngspice sólo diría "Error on line N"
      const incomplete = analysisProblem(lineOf(simAsc) ?? '');
      const blocking = [...built.tooBig.map((p) => p.text), ...built.ng.missingValues.map((name) => t('{name} has no value assigned', { name })), ...(incomplete ? [incomplete] : [])];
      // (un transitorio que al ritmo que va no entra en memoria se corta mientras simula)
      // (punto a punto los datos no se duplican en el motor: entra más, ver simLimits)
      const run = (b: BuiltSimulation) => {
        const lim = simLimits(!!streamPlan(b.netlist));
        return engine.simulate(b.netlist, b.files, { bias: biasParams(b), biasCommand: biasCommand(b.netlist).cmd, digital: b.digitalSaves, maxBytes: unlimited ? lim.full : lim.max, project: !unlimited });
      };
      let { result, ms } = blocking.length ? { result: { plots: [], log: blocking, errors: blocking, aborted: false }, ms: 0 } : await run(built);
      // las fuentes de 0 V de los pines de los subcircuitos pueden dejar la matriz singular (un
      // modelo que une dos pines por dentro, en redes que afuera une una fuente): otra vez sin ellas
      if (!blocking.length && !result.aborted && [...result.errors, ...result.log].some((l) => /singular/i.test(l))) {
        const plain = await prepare(false);
        if (plain.netlist !== built.netlist) {
          const again = await run(plain);
          if (!again.result.errors.some((l) => /singular/i.test(l))) {
            built = plain;
            ({ result, ms } = again);
            built.warnings.push(t('Simulated without the subcircuit pin currents (Ix): with them the matrix was singular'));
          }
        }
      }
      // cortado porque no iba a entrar: cuánto iba a guardar y qué hacer; los plots traen lo simulado
      if (result.sizeStop) {
        // (cuántas señales o cuánto del final entran: con el límite de una corrida normal, no el de «seguir igual»)
        const big = measuredSizeProblem(lineOf(simAsc) ?? '.tran', result.sizeStop, simLimits(!!streamPlan(built.netlist)).max);
        built.tooBig = [...built.tooBig, big];
        result.errors = [big.text];
      }
      // los errores de un .pz que ngspice deja sólo en el log ("Input is shorted"), explicados
      const pzErrs = pzLogErrors(result.log).filter((e) => !result.errors.includes(e));
      if (pzErrs.length) result.errors.unshift(...pzErrs);
      if (result.bias) setOpPoint({ doc, built, bias: result.bias });
      result.plots.push(...stepSweepPlots(result.plots, built.ng.steps));
      // .pz sin otro análisis en frecuencia: su Bode normalizado, con el mapa al lado (#343)
      result.plots.push(...pzBodePlots(result.plots));
      // .meas: se evalúan sobre los resultados de cada corrida
      const cardMeas = measureResults(built, result.plots, stepLabels(result.plots, built.ng.steps));
      const mp = cardMeas && measSweepPlot(cardMeas, built);
      if (mp) result.plots.push(mp);
      // gráficos x-y de un programa de bloques, y sus listas y tabla (#179)
      const blk = built.ng.blocks ? blockResultsFromLog(result.log) : { table: null, plots: [] };
      const xy = [...xyPlotsFromLog(result.log, built.ng.xyPlots), ...blk.plots];
      result.plots.push(...xy);
      const meas = cardMeas ?? blk.table;
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
    // (sin encuadrar, la vista sigue la del testbench anterior: si su circuito no se ve, se encuadra)
    else setTimeout(() => editor.current?.fitIfLost(), 50);
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
    // (un módulo Verilog pone su símbolo al día al sintetizarse)
    if (verilogFile(p, name)) return updateSymbol(p, name);
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
    const mf = target ? moduleFile(p, target.sub) : undefined;
    // un módulo Verilog no tiene esquemático (se ve su código): el editor queda con uno vacío
    const text = target ? (mf?.kind === 'verilog' ? EMPTY_ASC : mf?.text) : activeAsc(variantOf(p));
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
    // al entrar a un subcircuito aparece el panel del símbolo y el esquemático se angosta después de
    // ajustar: se vuelve a ajustar con el ancho final (si no, lo dibujado queda detrás del panel)
    else setTimeout(() => editor.current?.fit(), 120);
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
    const f = s && moduleFile(projectRef.current, s.type);
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
  // módulo nuevo (#209): esquemático o Verilog
  const newSubckt = () => setDialog({ kind: 'newModule', module: 'schematic' });
  const createModule = (name: string, kind: 'schematic' | 'verilog') => {
    setDialog(null);
    if (kind === 'schematic') return createSubckt(name);
    projectRef.current = addVerilogModule(projectRef.current, name);
    editProject(projectRef.current);
    openSub(name);
    // (sintetizar la plantilla: así el módulo ya tiene símbolo para colocarlo)
    synthAndReport(name);
  };
  const createSubckt = (name: string) => {
    editProject(addSubckt(projectRef.current, name));
    // el proyecto nuevo tiene que estar antes de abrirlo
    projectRef.current = addSubckt(projectRef.current, name);
    openSub(name);
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
  // --- Módulos «Modelo»: netlist (.subckt/.model) + símbolo ---------------------------------
  const newModel = () =>
    askSubName(t('New model'), freeSubcktName(projectRef.current, 'MODEL'), (name) => {
      const p = addModelModule(projectRef.current, name);
      projectRef.current = p;
      editProject(p);
      setCurModel(name);
    });
  const renameModel = (from: string) =>
    askSubName(t('Rename model'), from, (to) => {
      if (to === from) return;
      const retype = (asc: string) => {
        const d = parseAsc(asc);
        let changed = false;
        for (const s of d.symbols)
          if (baseName(s.type).toLowerCase() === from.toLowerCase()) {
            s.type = s.type.slice(0, s.type.length - baseName(s.type).length) + to;
            changed = true;
          }
        return changed ? serializeAsc(d) : asc;
      };
      // lo que se está editando también se renombra (se guarda antes)
      const p = renameModelModule(snapshot(), from, to, retype);
      projectRef.current = p;
      editProject(p);
      history.reset(parseAsc(retype(ascText(docRef.current))));
      if (curModel.toLowerCase() === from.toLowerCase()) setCurModel(to);
    }, from);
  const deleteModel = (name: string) => {
    const n = usages(projectRef.current, name, (asc, nm) => nm || lineOf(asc)).length;
    setDialog({
      kind: 'slide',
      title: t('Delete model {name}?', { name }),
      message: n ? t('{name} is used {n} times. Delete it anyway? The instances will lose their symbol.', { name, n }) : t('Its netlist and its symbol will be deleted.'),
      onConfirm: () => {
        setDialog(null);
        if (curModel.toLowerCase() === name.toLowerCase()) setCurModel('');
        const p = removeModelModule(projectRef.current, name);
        projectRef.current = p;
        editProject(p);
      },
    });
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
    const r = addProjectSim({ ...p0, variants: p0.variants.map((x) => (x.id === v.id ? { ...x, base: ascText(removeAnalysis(doc)) } : x)) }, ascText(doc));
    editProject(r.project);
  }, [docLine]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Simulación nueva de ese tipo, con el circuito que está en pantalla */
  // Cada testbench tiene una configuración de simulación: elegir un análisis la cambia
  const newSim = (kind: AnalysisKind) => {
    if (curSub) return setMessage(t('The analysis belongs to the testbench: go up (Alt+↑) to change it'));
    // si ya es de ese tipo queda como está; si otro testbench usa ese tipo, se parte de sus parámetros
    const same = [...sims.items].reverse().find((s) => ANALYSIS_LINE.exec(s.line)?.[1].toLowerCase() === kind);
    // (sus redes y fuentes se adaptan a este circuito)
    const line = same ? reuseLine(same.line, kind, circuitInfo()) : defaultLine(kind, circuitInfo());
    // una Complex simulation (#241) pasa a este análisis en el mismo testbench: el .control queda
    // guardado y vuelve al elegir otra vez Complex simulation
    if (isComplexLine(docLine)) return commit(setAnalysisLine(parkControl(doc), line));
    // un testbench tiene una sola simulación: sin análisis se la pone; si ya tiene, se crea otro
    // testbench (en el mismo grupo) con el mismo circuito y ésta
    if (!docLine) return commit(setAnalysisLine(doc, line));
    const p1 = leave();
    const r = addProjectSim(p1, ascText(setAnalysisLine(doc, line)));
    enter(r.project);
    markDirty();
  };
  /** Testbench nuevo, vacío, con el nombre automático (sigue a su análisis hasta que se lo renombra) */
  const newEmptyBench = (group?: string) => {
    const r = addProjectSim(leave(), EMPTY_ASC);
    enter(group ? setBenchGroup(r.project, r.id, group) : r.project, true);
    markDirty();
  };
  // (el nombre se edita en su misma fila del panel: el campo ya valida que no se repita)
  const renameBench = (id: string, n: string) => editProject(renameProjectSim(projectRef.current, id, n));
  // Grupos de testbenches y partes de cada uno (#180)
  // se crea con el nombre sugerido y el panel deja el campo listo para renombrarlo
  const newGroup = () => {
    // un workbench nuevo viene con un testbench vacío adentro
    const g = addGroup(leave(), uniqueGroupName());
    const r = addProjectSim(g.project, EMPTY_ASC);
    enter(setBenchGroup(r.project, r.id, g.id), true);
    markDirty();
    return g.id;
  };
  const uniqueGroupName = () => {
    const names = new Set(projectRef.current.groups.map((g) => g.name.toLowerCase()));
    for (let i = 1; ; i++) if (!names.has(t('Workbench {n}', { n: i }).toLowerCase())) return t('Workbench {n}', { n: i });
  };
  const renameGroupTo = (id: string, n: string) => editProject(renameGroup(snapshot(), id, n));
  const groupAction = (id: string) => {
    const g = projectRef.current.groups.find((x) => x.id === id);
    if (!g) return;
    if (projectRef.current.groups.length < 2) return setMessage(t('A project always has at least one workbench'));
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
  // menú del botón derecho de un comentario (tamaño, alineación)
  const [textMenu, setTextMenu] = useState<{ index: number; at: { x: number; y: number } } | null>(null);
  const closeTextMenu = useCallback(() => setTextMenu(null), []);
  /**
   * Ítem del botón derecho para guardar o dejar de guardar unas señales, sólo si el testbench
   * guarda lo elegido (#314)
   */
  const saveItem = (refs: string[]): ContextItem | null => {
    const sel = curSub ? null : saveSelection(doc.texts);
    if (!sel || !refs.length) return null;
    const next = toggleRefs(sel, refs)!;
    const saved = next.length < sel.length;
    const what = refs.join(' ');
    return {
      label: saved ? t('Don\'t save {what}', { what }) : t('Save {what}', { what }),
      disabled: saved && !next.length,
      onClick: () => {
        commit(setSaveSelection(doc, next));
        setMessage(t('Saved signals changed: simulate again with Alt+R'));
      },
    };
  };
  const netMenu = (net: string, at: { x: number; y: number }): boolean => {
    if (net === '0') return false;
    const item = saveItem([`V(${net})`]);
    if (!item) return false;
    setCtxMenu({ at, items: [item] });
    return true;
  };
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
    // con sólo las señales elegidas (#314): guardar (o no) sus corrientes
    const save = saveItem(elementRefs(inst, prefix));
    // fuera de los casos rápidos, el menú sólo aparece si hay a quién propagarle (o qué guardar)
    if (!quick && !canPropagate) {
      if (!save) return false;
      setCtxMenu({ at, items: [save] });
      return true;
    }
    const group = p0.groups.find((g) => g.id === me?.group)?.name ?? '';
    setCtxMenu({
      at,
      items: [
        quick
          ? { label: `${inst} =`, onClick: () => {}, edit: { value, onCommit: (v) => commit(setSymbolAttrs(doc, index, { Value: v })) } }
          : { label: t('Edit {inst}…', { inst }), onClick: () => editItem({ kind: 'symbol', index }) },
        {
          // con el valor que se está escribiendo (#229): se aplica primero y después se propaga
          label: (v = value) =>
            !canPropagate
              ? t('Propagate {inst} across the other testbenches of the workbench', { inst })
              : t('Propagate {inst}={value} across «{group}»', { inst, value: v, group }),
          short: t('Propagate'),
          disabled: !canPropagate,
          primary: true,
          onClick: (edited) => {
            const v = edited?.trim() || value;
            const attrs = new Map(s.attrs);
            if (quick && v !== value) {
              commit(setSymbolAttrs(doc, index, { Value: v }));
              attrs.set('Value', v);
            }
            editProject(propagateAttrs(snapshot(), peers, inst, s.type, attrs));
            setMessage(t('{inst} = {value} propagated to {n} testbenches of «{group}»', { inst, value: v, n: peers.length, group }));
          },
        },
        ...(save ? [save] : []),
      ],
    });
    return true;
  };
  const moveBench = (id: string, group: string, before?: string) => {
    const p0 = snapshot();
    const p = placeBench(p0, id, group, before);
    if (p !== p0) editProject(p);
  };
  /** Abrir una parte de un testbench: su configuración de simulación, su esquemático o sus parámetros */
  const benchItem = (id: string, item: BenchItem) => {
    if (id !== sims.active) goSim(id);
    else if (pathRef.current.length) go([]);
    // el diálogo, cuando ya se ve el testbench
    if (item === 'history') return setTimeout(() => openHistory(id), 0);
    if (item === 'study') return setTimeout(openStudy, 0);
    if (item !== 'schematic') setTimeout(() => (item === 'sim' ? openSimulation() : setDialog({ kind: 'benchParams' })), 0);
  };
  const benchAction = (id: string, action: 'duplicate' | 'delete') =>
    action === 'duplicate' ? duplicateSim(id) : sims.items.length > 1 && setDialog({ kind: 'deleteSim', id });
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
    if (!r) return;
    enter(r.project);
    markDirty();
  };

  const simAllCorners = (id: string, name: string, corner: string) => {
    enter(cornerSims(leave(), id, name, corner, PDK_CORNERS));
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
  // valores del OP fijados con la punta de prueba (#228); se borran con otro punto de operación
  // #306: siguen entre corridas, se pueden mover y borrar; se reinician al abrir otro circuito
  // las fijadas y las movidas van en el documento (y así en el .turbo); las borradas, sólo en la sesión
  const [opHidden, setOpHidden] = useState<ReadonlySet<string>>(() => new Set());
  const opTags = useMemo(() => opTagsFromData(readData(doc, 'optags'), opHidden), [doc, opHidden]);
  const setOpTags = (f: (t: OpTags) => OpTags) => {
    const next = f(opTags);
    if (next.hidden !== opTags.hidden) setOpHidden(next.hidden);
    const data = opTagsData(next);
    if (JSON.stringify(data) !== JSON.stringify(opTagsData(opTags))) commit(writeData(doc, 'optags', data));
  };
  const [opSel, setOpSel] = useState<string>();
  useEffect(() => (setOpHidden(new Set()), setOpSel(undefined)), [docKey]);
  useEffect(() => {
    if (showOp) setOpHidden((h) => unhideOpTags({ ...noOpTags(), hidden: h }).hidden);
  }, [showOp]);
  useEffect(() => {
    if (selection.length) setOpSel(undefined);
  }, [selection]);
  // los valores del OP con `all` (el botón OP) o sólo los elegidos a mano; Exportar los pide todos
  const opAnnotations = useCallback((all: boolean): Annotation[] | undefined => {
    if (!op || (!all && !opTags.pins.size && !opTags.moved.size)) return undefined;
    const { built, bias, scope } = op;
    const out: Annotation[] = [];
    const shown = (target: OpPinTarget) => {
      const key = opPinKey(target);
      return opTagVisible(opTags, key, all) ? key : undefined;
    };
    const push = (a: Omit<Annotation, 'offset'>) => out.push({ ...a, offset: opTags.moved.get(a.key) });
    for (const n of netNames(doc, conn, new Map())) {
      const key = shown({ net: n.name });
      if (!key) continue;
      const b = scope ? scopedNetBias(bias, scope, n.name) : netBias(bias, n.name);
      if (b?.short) push({ key, at: n.at, text: b.short, kind: 'v' });
    }
    for (const el of scope ? scope.block.lt.elements : built.lt.elements) {
      // transistores: la corriente de cada pin, junto al pin (como la punta de prueba en los demás análisis)
      if (multiPinPrefix(el.prefix)) {
        const s = doc.symbols[el.sym];
        const def = s && lib.symbol(s.type);
        if (!def) continue;
        pinPoints(s, def).forEach((at, k) => {
          const pin = Number(def.pins[k].attrs.get('SpiceOrder') ?? k + 1);
          const key = shown({ symbol: el.sym, pin });
          if (!key) return;
          const text = pinBias(built, bias, el, pin, scope);
          if (text) push({ key, at: { x: at.x + 4, y: at.y - 4 }, text, kind: 'i' });
        });
        continue;
      }
      const key = /^[RLVIDQMJ]/i.test(el.prefix) ? shown({ symbol: el.sym }) : undefined;
      if (!key) continue;
      const b = elementBias(built, bias, el, scope);
      const s = doc.symbols[el.sym];
      if (!b?.short || !s) continue;
      const box = symbolBox(s, lib.symbol(s.type), lib);
      push({ key, at: { x: box.x2 + 4, y: (box.y1 + box.y2) / 2 }, text: b.short, kind: 'i' });
    }
    return out;
  }, [opTags, op, doc, conn, lib]);
  const annotations = useMemo(() => opAnnotations(showOp), [opAnnotations, showOp]);

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
    return variant.sims.map((x) => {
      const line = sims.items.find((y) => y.id === x.id)?.line ?? '';
      const d = x.id === sims.active && !curSub ? liveDoc : parseAsc(x.asc);
      // sin nombre propio, el automático con el análisis en vivo (el que se está editando)
      return { id: x.id, name: x.name || (line ? analysisLabel(line) : t('No analysis')), detail: line ? analysisDetail(line) : t('No analysis'), ...(x.group ? { group: x.group } : {}), runs: x.runs.length, params: benchParams(d), steps: benchVariables(d) };
    });
  }, [treeOpen, treePeek, variant, sims, curSub, liveDoc]);

  // Panel de proyecto (#180): subcircuitos con sus usos y los que tienen adentro (el que se está
  // editando, con su texto actual)
  const treeSubs = useMemo((): TreeSub[] => {
    if (!treeOpen) return [];
    const p = curSub ? storeSubckt(project, curSub, ascText(liveDoc)) : storeActive(project, ascText(liveDoc));
    const label = (asc: string, nm?: string) => nm || (lineOf(asc) ? analysisLabel(lineOf(asc)) : t('No analysis'));
    return modules(p).map((f) => {
      const name = subName(f.name);
      // un módulo Verilog (#209): sus pines son los de la última síntesis
      if (f.kind === 'verilog')
        return {
          name,
          ports: verilogPorts(f, subcktSymbolText(p, name)).length,
          uses: usages(p, name, label).map((u) => ({ label: u.where.label, inst: u.inst, go: () => goUsage(u, name) })),
          children: [],
          outdated: false,
          text: false,
          type: 'verilog' as const,
          ...(isStale(f) ? { unsynthesized: true } : {}),
        };
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
    }).concat(
      modelModules(p).map((f): TreeSub => {
        const name = modelModuleName(f);
        return {
          name,
          type: 'model',
          ports: (modelSymbolText(p, name)?.match(/^PIN\s/gm) ?? []).length,
          uses: usages(p, name, label).map((u) => ({ label: u.where.label, inst: u.inst, go: () => goUsage(u, name) })),
          children: [],
          outdated: false,
          text: false,
        };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeOpen, project, curSub, liveDoc, libVersion]);
  const toggleTree = () => {
    lsSet('turbospice.tree', treeOpen ? '0' : '1');
    setTreePref(!treeOpen);
  };

  // ⌖ de la DFT: mientras se elige, el esquemático está en la punta de prueba y lo que se pinche
  // (esté graficado o no) va a la DFT; al terminar vuelve a la herramienta de antes
  const dftPick = useRef<Tool | null>(null);
  const onDftPicking = (on: boolean) => {
    if (on === !!dftPick.current) return;
    if (on) {
      dftPick.current = tool;
      if (sim) setTool({ kind: 'probe' });
    } else {
      const back = dftPick.current;
      dftPick.current = null;
      setToolState((cur) => (cur.kind === 'probe' && back ? back : cur));
    }
  };
  const onProbe = (target: { net?: string; symbol?: number; pin?: number }) => {
    if (savesPicking) return pickSave(target);
    if (!sim || !plot) return;
    // un punto de operación (sin eje X): se anota el valor en el esquemático y queda fijo (#228)
    if (!scaleOf(plot) && op) return setOpTags((p) => toggleOpTag(p, target));
    // un cable de bus (f[10:0]): una traza por bit, en el testbench
    if (target.net && isBusName(target.net) && !pathRef.current.length && !dftPick.current) {
      const sc = scaleOf(plot);
      if (!sc) return;
      // si sale de un bloque Verilog, el bus digital entero (Dig(x1.d[2:0]))
      const dig = digitalProbeExpr(sim.built, busBits(target.net), target.net);
      if (dig && hasData(dig)) return addDigitalProbe(dig);
      const exprs = busBits(target.net)
        .map((b) => probeExpr(sim.built, { net: b }))
        .filter((e): e is string => {
          if (!e) return false;
          try {
            evalTrace(e, { resolve: resolver(plot), scale: sc.real, scaleName: sc.name });
            return true;
          } catch {
            return false;
          }
        });
      if (!exprs.length) return setMessage(t('No data for {expr} in {name}', { expr: target.net, name: plot.name }));
      setPanel('plot');
      if (expanded === 'schematic') setExpanded('');
      const i = Math.min(activePane, panes.length - 1);
      return editPanes(exprs.reduce((ps, e) => addTraceTo(ps, i, e), panes));
    }
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
    if (dftPick.current) {
      const sc = scaleOf(plot);
      try {
        if (sc) evalTrace(expr, { resolve: resolver(plot), scale: sc.real, scaleName: sc.name });
      } catch {
        return setMessage(t('No data for {expr} in {name}', { expr, name: plot.name }));
      }
      return plotPanel.current?.addDft(expr);
    }
    // con el foco en la caja de trazas, se escribe ahí (para armar una expresión)
    if (traceBox.current?.focused()) return traceBox.current.insert(expr);
    // una salida de un bloque Verilog: su versión digital (la tensión se puede pedir con V())
    if (target.net && !lv) {
      const dig = digitalProbeExpr(sim.built, [target.net]);
      if (dig && hasData(dig)) return addDigitalProbe(dig);
    }
    setPanel('plot');
    // con los resultados colapsados, mostrarlos para ver la traza
    if (expanded === 'schematic') setExpanded('');
    const i = Math.min(activePane, panes.length - 1);
    if (panes[i]?.traces.some((tt) => !tt.dft && sameExpr(tt.expr, expr))) return;
    const sc = scaleOf(plot);
    if (!sc) return setMessage(t('{name} has no X axis: choose another analysis to plot', { name: plot.name }));
    try {
      evalTrace(expr, { resolve: resolver(plot), scale: sc.real, scaleName: sc.name });
    } catch {
      // con sólo las señales elegidas (#314) puede no haberse guardado: la traza queda y, como lo
      // que usan las trazas se guarda siempre, aparece al volver a simular
      if (saveSelection(sim.built.lt.texts)) {
        addProbed(i, expr);
        return setMessage(t('{expr} wasn\'t saved (only the selected signals are): it will be when you run again', { expr }));
      }
      return setMessage(t('No data for {expr} in {name}', { expr, name: plot.name }));
    }
    addProbed(i, expr);
  };
  /** ¿La expresión tiene datos en el plot que se ve? (Dig() sólo después de un transitorio) */
  const hasData = (expr: string) => {
    const sc = plot && scaleOf(plot);
    if (!plot || !sc) return false;
    try {
      evalTrace(expr, { resolve: resolver(plot), scale: sc.real, scaleName: sc.name });
      return true;
    } catch {
      return false;
    }
  };
  /** traza digital de la punta: al panel digital (o a uno nuevo), con los resultados a la vista */
  const addDigitalProbe = (expr: string) => {
    setPanel('plot');
    if (expanded === 'schematic') setExpanded('');
    editPanes(addTraceTo(panes, Math.min(activePane, panes.length - 1), expr));
  };
  /** traza medida con la punta: a un eje con su unidad o libre del panel activo, o a uno nuevo (#308) */
  const addProbed = (i: number, expr: string) => {
    if (isComplex) return editPanes(addTraceTo(panes, i, expr));
    const r = placeTrace(panes, i, expr);
    editPanes(r.panes);
    if (r.index !== i) setActivePane(r.index);
  };

  /**
   * Punta de prueba arrastrada de un punto a otro (#308): V−V o I−I es la resta; V/I (Ω) o I/V (S)
   * el cociente
   */
  const onProbePair = (from: { net?: string; symbol?: number; pin?: number }, to: { net?: string; symbol?: number; pin?: number }) => {
    if (savesPicking || !sim || !plot || pathRef.current.length || dftPick.current) return onProbe(from);
    const sc = scaleOf(plot);
    if (!sc) return onProbe(from);
    const isV = (x: typeof from) => x.net !== undefined;
    const ea = probeExpr(sim.built, from);
    const eb = probeExpr(sim.built, to);
    // contra tierra, la resta es la propia tensión
    if (isV(from) && isV(to) && (from.net === '0' || to.net === '0')) return onProbe(from.net === '0' ? to : from);
    if (!ea || !eb) return;
    const ratio = isV(from) !== isV(to);
    const expr = ratio ? `${ea}/${eb}` : `${ea}-${eb}`;
    try {
      evalTrace(expr, { resolve: resolver(plot), scale: sc.real, scaleName: sc.name });
    } catch {
      return setMessage(t('No data for {expr} in {name}', { expr, name: plot.name }));
    }
    setPanel('plot');
    if (expanded === 'schematic') setExpanded('');
    const i = Math.min(activePane, panes.length - 1);
    addProbed(i, expr);
  };

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
    // una imagen en el portapapeles se pega como fondo del esquemático (figura IMAGE, en base64)
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((ty) => ty.startsWith('image/'));
        if (!type) continue;
        const img = await clipboardImage(await item.getType(type));
        const at = editor.current?.cursor() ?? { x: 0, y: 0 };
        const shape = { kind: 'IMAGE' as const, coords: [at.x, at.y, at.x + img.w, at.y + img.h], data: img.data };
        commit({ ...doc, shapes: [...doc.shapes, shape] });
        setTool({ kind: 'select' });
        setSelection([{ kind: 'shape', index: doc.shapes.length }]);
        return;
      }
    } catch {
      // sin permiso o sin API de imágenes: se sigue con el texto
    }
    let text: string;
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
    if (opSel) {
      setOpTags((p) => hideOpTag(p, opSel, showOp));
      setOpSel(undefined);
    } else if (selection.length) {
      commit(deleteItems(doc, selection, lib));
      setSelection([]);
    } else setTool({ kind: 'delete' });
  };
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
      const before = new Set(p.variants.map((v) => v.id));
      const variants: string[] = [];
      const files: Project['files'] = [];
      const damaged: Imported['damaged'] = [];
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
        damaged.push(...r.damaged);
      }
      if (loose.length) {
        const r = importEntries(p, loose);
        p = r.project;
        variants.push(...r.variants);
        files.push(...r.files);
        damaged.push(...r.damaged);
      }
      // cada .asc (o carpeta de un .zip) importado es un workbench propio con sus testbenches
      const fresh = p.variants.filter((v) => !before.has(v.id));
      const groups = [...p.groups, ...fresh.map((v) => ({ id: `g_${v.id}`, name: v.name }))];
      p = {
        ...p,
        groups,
        variants: p.variants.map((v) => {
          if (before.has(v.id)) return v;
          // (un .asc sin análisis no trae simulaciones: su único testbench es el circuito)
          const sims = v.sims.length ? v.sims : [{ id: newId('s'), asc: v.base, runs: [] }];
          return { ...v, activeSim: v.activeSim || sims[0].id, sims: sims.map((s) => ({ ...s, group: `g_${v.id}` })) };
        }),
      };
      const merged = await mergeFiles(p.files, files, askConflict);
      enter(asBenches({ ...p, files: merged.files }), true);
      // (el testbench importado todavía no tiene resultados: nada que medir con la punta de prueba)
      if (fresh.length) setTool({ kind: 'select' });
      markDirty();
      const parts = [
        ...(variants.length ? [`${variants.length === 1 ? t('the workbench') : t('{length} workbenches:', { length: variants.length })} ${variants.join(', ')}`] : []),
        ...(merged.added.length ? [`${merged.added.length === 1 ? t('the file') : t('{length} files:', { length: merged.added.length })} ${merged.added.join(', ')}`] : []),
      ];
      const imported = parts.length ? t('Imported {p0}', { p0: parts.join(' y ') }) : t('There was nothing to import (.asc, .asy, .lib, .sub or .zip)');
      // las líneas dañadas quedan tal cual en el testbench (no se pierden al guardar), pero hay que avisarlo
      const bad = damaged.map((d) => t('{file}: {n} lines could not be read and were kept as they are (the first one: {line})', { file: d.file, n: d.lines, line: d.first.slice(0, 80) }));
      setMessage([imported, ...bad].join(' · '));
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
    // un módulo Verilog (#209): su síntesis (primitivas de XSPICE: sirve para ngspice, no para LTspice)
    const vf = verilogFile(projectRef.current, name);
    if (vf) {
      if (!vf.synth) return setMessage(t('{name} was not synthesized yet', { name }));
      return download(`${name}.sub`, new Blob([vf.synth.subckt], { type: 'text/plain' }));
    }
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
  const problems = sim
    ? [
        ...sim.result.errors.map((text) => ({ kind: 'err' as const, text })),
        ...sim.built.warnings.filter((text) => !sim.result.errors.includes(text)).map((text) => ({ kind: missingSymbolIn(text) !== null ? ('err' as const) : ('warn' as const), text })),
      ].map((p) => {
        const name = /^([^\s:]+)/.exec(p.text)?.[1]?.toLowerCase();
        const el = name ? sim.built.lt.elements.find((e) => e.name.toLowerCase() === name || e.name.replace(/§/g, '').toLowerCase() === name) : undefined;
        const big = sim.built.tooBig?.find((f) => f.text === p.text);
        // demasiado grande con todo guardado: elegir qué guardar (#314)
        return { ...p, sym: el?.sym, fix: big?.fix, size: big, big: !!big && (!!big.chooseSignals || !saveSelection(sim.built.lt.texts)) };
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
        {
          icon: 'pdf',
          label: t('Export to PDF'),
          title: t('Export to PDF or LaTeX'),
          onClick: doExport,
        },
        // con la sesión de Google, Abrir muestra «Mis simulaciones»; sin sesión, Abrir/Importar
        google.account
          ? { icon: 'open', label: t('Open'), title: t('My simulations (Google Drive)'), onClick: () => setDialog({ kind: 'drive' }) }
          : { icon: 'open', label: t('Open'), title: t('Open (import .turbo, .zip, .asc…)'), shortcut: 'Ctrl+O', onClick: doOpen },
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
        ...(curSub ? [{ icon: 'label', label: t('Port'), title: t('Subcircuit port: a net label that becomes a pin of the symbol'), onClick: () => setDialog({ kind: 'flag', ioPin: 'BiDir' }) }] : []),
        { icon: 'text', label: t('Text'), title: t('Text (comment)'), shortcut: 'T', onClick: () => setTool({ kind: 'comment' }), active: tool.kind === 'comment' },
        { icon: 'shapes', label: t('Shapes'), title: t('Shapes: line, rectangle, circle, arc'), items: shapeItems, active: tool.kind === 'shape' || tool.kind === 'pencil' },
        { icon: 'directive', label: t('Directive'), title: t('Free SPICE directive'), shortcut: '.', onClick: () => setDialog({ kind: 'text', textKind: 'directive' }) },
      ],
    },
    {
      id: 'edit',
      label: t('Editing'),
      tools: [
        { icon: 'fit', label: t('Fit'), title: t('Fit to view (Z: zoom to a box, Shift+Z: previous zoom)'), shortcut: t('Space'), onClick: () => editor.current?.fit() },
        { icon: 'grid', label: t('Grid'), title: t('Show or hide the grid'), shortcut: 'Ctrl+G', onClick: () => setShowGrid((v) => !v), active: showGrid },
        // resaltar la red bajo el cursor (#340), el mismo modo que la tecla H
        { icon: 'highlight', label: t('Highlight'), title: t('Highlight the net under the cursor'), shortcut: 'H', onClick: () => setNetHover((v) => !v), active: netHover },
        { icon: 'move', label: t('Move'), title: t('Move (without stretching wires)'), shortcut: 'M', onClick: () => startMove(false), active: tool.kind === 'move' && !tool.stretch },
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
        { label: t('Errors{p0}', { p0: problems.length ? ` (${problems.length})` : '' }), checked: panel === 'problems', onClick: () => setPanel('problems') },
        { label: 'Log', shortcut: 'Ctrl+L', checked: panel === 'log', onClick: () => setPanel('log') },
      ];

  // Tutorial (Academia): lo que mira para saber si se cumplió cada paso. Es una función que se
  // reemplaza en cada render: el tutorial la consulta seguido y siempre ve el estado actual
  tutorialProbe.current = (): TutorialProbe => {
    const effective = (s: SymbolInst) => effectiveAttrs(s, lib.symbol(s.type));
    const benchDoc = tbDoc ?? doc;
    let loose = 0;
    for (const n of conn.pinNet.values()) if (n.pins.length === 1 && !n.labels.length) loose++;
    loose += doc.symbols.reduce((k, s, si) => k + (lib.symbol(s.type)?.pins.filter((_, pi) => !conn.pinNet.has(`${si}:${pi}`)).length ?? 0), 0);
    const ps = plotState.current;
    return {
      projectName: project.name,
      dirty,
      benches: variant.sims.map((x) => ({ id: x.id, custom: !!x.name, ...(x.group ? { group: x.group } : {}), line: sims.items.find((y) => y.id === x.id)?.line ?? '', runs: x.runs.length })),
      activeBench: sims.active,
      groups: project.groups.length,
      modules: [...modules(project).map((f) => ({ name: subName(f.name), kind: f.kind === 'verilog' ? ('verilog' as const) : ('schematic' as const) })), ...modelModules(project).map((f) => ({ name: modelModuleName(f), kind: 'model' as const }))],
      inSub: curSub,
      symbols: doc.symbols.map((s) => {
        const e = effective(s);
        return { type: s.type, prefix: e.get('Prefix') ?? '', value: s.attrs.get('Value') ?? e.get('Value') ?? '' };
      }),
      wires: doc.wires.length,
      grounds: doc.flags.filter((f) => f.name === '0').length,
      labels: doc.flags.filter((f) => f.name !== '0' && !f.ioPin).map((f) => f.name),
      ports: doc.flags.filter((f) => f.ioPin).length,
      loose,
      directives: benchDoc.texts.filter((x) => x.kind === 'directive').map((x) => x.text),
      line: docLine,
      tool: tool.kind,
      dialog: dialog?.kind ?? null,
      hasResult: !!sim,
      resultKind: plot ? plotKind(plot.name) : '',
      runs: allRuns.length,
      panes: panes.map((p) => p.traces.map((x) => x.expr)),
      zoomed: !!ps?.xRange,
      cursors: ps ? [ps.cursors.a, ps.cursors.b].filter((x) => x !== undefined).length : 0,
      markers: ps?.markers?.map((m) => m.kind) ?? [],
      panel,
      treeOpen,
      historyOpen,
      showOp: showOp && !!bias,
      showNets: showNets && hasNets,
    };
  };

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
          {curSub && symText && (
            <Suspense fallback={null}>
            <SymbolEditor
              name={curSub}
              text={symText}
              ports={subPorts}
              onChange={editSymbol}
              onParams={(ps) => editSymbol(curVerilog ? withParams(symText, ps) : setSymParams(symText, ps))}
              onReset={() =>
                editSymbol(curVerilog?.synth ? setSymParams(verilogSymbol(curSub, curVerilog.synth), symParams(symText)) : setSymParams(subcktSymbol(curSub, liveDoc).text, symParams(symText)))
              }
              onPickSymbol={() => setDialog({ kind: 'picker', forSymbol: true })}
              onWidth={setSymW}
              onAddPort={addPort}
            />
            </Suspense>
          )}
          {curModel && modelModuleFile(project, curModel) && (
            <Suspense fallback={null}>
            <ModelEditor
              name={curModel}
              text={modelModuleFile(project, curModel)!.text}
              symText={modelSymbolText(project, curModel) ?? ''}
              onText={(text) => {
                const p = storeModelText(projectRef.current, curModel, text);
                projectRef.current = p;
                editProject(p);
              }}
              onSymbol={(text) => {
                const p = storeModelSymbol(projectRef.current, curModel, text);
                projectRef.current = p;
                editProject(p);
              }}
              onPickSymbol={() => setDialog({ kind: 'picker', forSymbol: true })}
              onPickNetlist={() => setDialog({ kind: 'picker', forNetlist: true })}
              onClose={() => setCurModel('')}
            />
            </Suspense>
          )}
          {ctxMenu && createPortal(<ContextMenu at={ctxMenu.at} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />, document.body)}
          {curVerilog && (
            <VerilogModule
              name={curSub}
              text={curVerilog.text}
              stale={isStale(curVerilog)}
              mode={curVerilog.hdl === 'behavioral' ? 'behavioral' : 'synth'}
              suggestBehavioral={curVerilog.hdl !== 'behavioral' && looksBehavioral(curVerilog.text)}
              onMode={(m) => {
                const p = setHdlMode(projectRef.current, curSub, m);
                projectRef.current = p;
                editProject(p);
              }}
              pins={curVerilog.synth?.pins ?? []}
              params={symText ? symParams(symText) : []}
              onText={(text) => {
                const p = storeVerilog(projectRef.current, curSub, text);
                projectRef.current = p;
                editProject(p);
                warnShared();
              }}
              onSynthesize={(text) => synthModule(curSub, text)}
              onParams={(ps) => symText && editSymbol(withParams(symText, ps))}
            />
          )}
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
              {/* en un .stb, el selector muestra sólo las magnitudes del lazo, sin los parámetros de los dispositivos (#337) */}
              {panel === 'plot' && plot && scale && <TraceBox handle={traceBox} names={traceNames} hints={isStbPlot(plot) ? undefined : traceHints} onAdd={addExpr} onFocusChange={setTraceFocus} />}
              {panel === 'plot' && (
                <>
                  {/* varios plots: un .control con varios análisis, .step (op vs R), .meas, fft de ngspice, gráficos x-y */}
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
                  {/* Cursores, DFT, Medidas y Ajustar (los pone el visor) */}
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
            </div>
            <div className="results-body">
              {/* un error al dibujar el gráfico (o el visor que no bajó sin red) no se lleva el resto */}
              <ErrorBoundary resetKeys={[panel, plot, panes, mode]}>
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
                  onFocusTrace={() => traceBox.current?.focus()}
                  onDftPicking={onDftPicking}
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
              {/* el mapa de polos o el de Stability al lado (o debajo) del gráfico, con un divisor (#336) */}
              {panel === 'plot' && plot && scale && withPz && pzSide && mode !== 'smith' && (
                <>
                  <SideSplit dir={splitDir} onSize={pzSplit.set} label={t('Resize the pole-zero map')} />
                  <PzPlane runs={pzAll} labels={labels} name={project.name} compact style={pzSplit.style} />
                </>
              )}
              {panel === 'plot' && plot && scale && isStbPlot(plot) && mode !== 'smith' && (
                <>
                  <SideSplit dir={splitDir} onSize={stbSplit.set} label={t('Resize the stability view')} />
                  <StbView plot={plot} name={project.name} style={stbSplit.style} />
                </>
              )}
              {panel === 'plot' && plot && !scale &&
                (pzShown.length ? <PzPlane runs={pzShown} labels={labels} name={project.name} /> : <ResultTable plot={plot} maxCols={resultsSide ? 2 : 4} onHoverRow={setRowHover} highlightDevice={lvNow ? undefined : hoverDev} />)}
              </ErrorBoundary>
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
                        {p.size?.fit !== undefined ? (
                          // el transitorio que se cortó mientras simulaba: qué se puede hacer, como botones
                          <span className="size-actions">
                            {p.size.chooseSignals && (
                              <button className="primary" onClick={() => openSaves(true)} title={t('Save only some signals: the plotted ones count too')}>
                                {t('Choose signals (up to {n})', { n: p.size.fit })}
                              </button>
                            )}
                            {stopTime !== undefined && (
                              <button className={p.size.chooseSignals ? '' : 'primary'} onClick={plotStop} title={t('Show in the plotter what was simulated up to the stop, with the probe to pick what to plot')}>
                                {t('Plot up to {time}', { time: `${formatSi(stopTime, 3, DISPLAY_PREFIXES)}s` })}
                              </button>
                            )}
                            {p.fix && p.size.keep && (
                              <button
                                onClick={() => {
                                  commit(replaceLine(doc, p.fix!.from, p.fix!.to));
                                  setRunQueued(true);
                                }}
                                title={t('Change the analysis to «{p0}» and simulate again', { p0: p.fix.to })}
                              >
                                {t('Save only the last {keep}', { keep: p.size.keep })}
                              </button>
                            )}
                            {p.size.resume && (
                              <button onClick={() => run({ unlimited: true })} title={t("Simulate again without stopping until the results fill {size} (ngspice can't resume where it stopped: it starts over)", { size: fmtBytes(simLimits(!!streamPlan(sim.built.netlist)).full) })}>
                                {t('Continue anyway')}
                              </button>
                            )}
                          </span>
                        ) : p.big && (
                          <button className="link" onClick={() => openSaves(true)}>
                            {t('choose saved signals')}
                          </button>
                        )}
                        {p.fix && p.size?.fit === undefined && (
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
