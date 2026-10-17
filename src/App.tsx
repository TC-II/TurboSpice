// TurboSpice: editor de esquemáticos .asc (compatible con LTspice) + simulación con ngspice.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emptyDoc, type AscDoc } from './asc/model.ts';
import type { AscEncoding } from './asc/encoding.ts';
import { EngineClient } from './engine/client.ts';
import type { SimPlot, SimResult } from './engine/ngspice.ts';
import { Library, type LibraryBundle } from './library/library.ts';
import { ltNetlist, ltNetlistText } from './netlist/ltnetlist.ts';
import { netNames, type Annotation } from './schematic/NetNames.tsx';
import { biasParams, elementBias, netBias } from './sim/bias.ts';
import { symbolBox } from './schematic/geometry.ts';
import type { Point } from './asc/model.ts';
import { StatusText, type Status } from './NetlistMode.tsx';
import { isPzPlot, PzPlane, ResultTable } from './waveform/ScalarViews.tsx';
import { SmithChart } from './waveform/SmithChart.tsx';
import { NetlistMode } from './NetlistMode.tsx';
import { AttributeDialog, ComponentPicker, FlagDialog, ShareDialog, TextDialog } from './schematic/dialogs.tsx';
import { readShareHash, shareHash } from './schematic/share.ts';
import { addRecent, loadRecent, loadSession, readHandle, saveSession, type RecentFile } from './schematic/autosave.ts';
import { parseAsc } from './asc/parse.ts';
import { serializeAsc } from './asc/serialize.ts';
import { ControlDialog, SimulationDialog, type CircuitInfo, type Picker } from './schematic/simDialogs.tsx';
import { findAnalysis, findControl, replaceAnalysis, type FoundLine } from './schematic/directivesEdit.ts';
import { controlBlock, controlBody } from './sim/controlSnippets.ts';
import { ANALYSIS_LINE } from './sim/analyses.ts';
import { isControlBlock } from './netlist/directives.ts';
import { effectiveAttrs } from './asc/resolve.ts';
import { addFlag, deleteItems, duplicateItems, setFlagName, setSymbolAttrs, setText, transformItems } from './schematic/edit.ts';
import { ascBytes, openFile, readAsc, saveFile } from './schematic/fileio.ts';
import type { ItemRef } from './schematic/geometry.ts';
import { SchematicEditor, type EditorHandle, type Tool } from './schematic/SchematicEditor.tsx';
import { useHistory } from './schematic/useHistory.ts';
import { mirrorX, rotateCW } from './asc/transform.ts';
import { buildSimulation, type BuiltSimulation } from './sim/schematicSim.ts';
import { PlotPanel, type PlotPanelHandle } from './waveform/PlotPanel.tsx';
import { sameRuns, scaleOf, stepLabels, stepSweepPlots } from './waveform/series.ts';
import type { ComplexMode } from './waveform/curves.ts';
import { evalTrace } from './waveform/expr.ts';
import { emptyPanes, parsePlt, plotKind, sameExpr, serializePlt, type Pane, type PlotView } from './waveform/view.ts';
import { probeExpr, traceResolver } from './sim/traces.ts';
import { loadView, saveView } from './schematic/autosave.ts';
import { decode } from './asc/encoding.ts';
import { download, exportSchematic } from './schematic/exportSchematic.ts';

const BASE = import.meta.env.BASE_URL;
const EXAMPLES = ['Filtro RC.asc', 'Bode RLC.asc', 'Inversor OA_Ideal.asc', 'Rectificador.asc', 'Emisor común.asc', 'Barrido RC (.step).asc'];

type Dialog =
  | { kind: 'picker' }
  | { kind: 'attrs'; index: number }
  | { kind: 'text'; index?: number; textKind: 'directive' | 'comment' }
  | { kind: 'flag'; index?: number; at?: Point }
  | { kind: 'sim'; found: FoundLine | null }
  | { kind: 'control'; index: number }
  | { kind: 'share'; url: string };

interface FileState {
  name: string;
  encoding?: AscEncoding;
  handle?: Parameters<typeof saveFile>[2];
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

export function App() {
  const engine = useMemo(() => new EngineClient(), []);
  const [mode, setMode] = useState<'schematic' | 'netlist'>('schematic');
  const [lib, setLib] = useState<Library | null>(null);
  const [libError, setLibError] = useState<string>();

  useEffect(() => {
    fetch(`${BASE}library/bundle.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((b: LibraryBundle) => setLib(new Library(b)))
      .catch((e: Error) => setLibError(`No se pudo cargar la librería: ${e.message}`));
    return () => engine.abort();
  }, [engine]);

  return (
    <div className="app">
      <header className="appbar">
        <h1>TurboSpice</h1>
        <nav className="tabs">
          <button className={mode === 'schematic' ? 'active' : ''} onClick={() => setMode('schematic')}>Esquemático</button>
          <button className={mode === 'netlist' ? 'active' : ''} onClick={() => setMode('netlist')}>Netlist</button>
        </nav>
        <div id="appbar-slot" />
      </header>
      {mode === 'netlist' && <NetlistMode engine={engine} />}
      {mode === 'schematic' &&
        (lib ? <SchematicMode engine={engine} lib={lib} /> : <p className="empty pad">{libError ?? 'Cargando librería…'}</p>)}
    </div>
  );
}

function SchematicMode({ engine, lib }: { engine: EngineClient; lib: Library }) {
  const history = useHistory<AscDoc>(emptyDoc());
  const doc = history.value;
  const [file, setFile] = useState<FileState>({ name: 'Sin título.asc' });
  const [savedVersion, setSavedVersion] = useState(0);
  const [tool, setToolState] = useState<Tool>({ kind: 'select' });
  const [selection, setSelection] = useState<ItemRef[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [message, setMessage] = useState<string>();
  const [sim, setSim] = useState<{ built: BuiltSimulation; result: SimResult; doc: AscDoc } | null>(null);
  const [showOp, setShowOp] = useState(false);
  const [panes, setPanes] = useState<Pane[]>(emptyPanes);
  const [activePane, setActivePane] = useState(0);
  // vista recordada (paneles por tipo de análisis) de este circuito
  const [plotView, setPlotView] = useState<PlotView>({});
  const [plotName, setPlotName] = useState('');
  const [mode, setMode] = useState<ComplexMode>('bode');
  const plotPanel = useRef<PlotPanelHandle>(null);
  const [resultsH, setResultsH] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('turbospice.resultsH')) || 0;
    } catch {
      return 0;
    }
  });
  const [panel, setPanel] = useState<'plot' | 'netlist' | 'log'>('plot');
  const [overlay, setOverlay] = useState(true);
  const editor = useRef<EditorHandle>(null);
  const [docKey, setDocKey] = useState(0);
  const dirty = history.version !== savedVersion;

  const lt = useMemo(() => ltNetlist(doc, lib), [doc, lib]);
  const conn = lt.conn;
  const [showNets, setShowNets] = useState(false);
  const shownNets = useMemo(() => (showNets ? netNames(doc, conn, lt.ncNames) : undefined), [showNets, doc, conn, lt]);
  // red resaltada desde el panel de resultados (al pasar por una traza)
  const [traceNet, setTraceNet] = useState<string>();

  // Elegir una red o fuente en el esquemático desde un diálogo (que queda oculto mientras)
  const [picking, setPicking] = useState<{ what: 'net' | 'source'; resolve(v: string | null): void; prev: Tool } | null>(null);

  const setTool = useCallback((t: Tool) => {
    setToolState(t);
    if (t.kind !== 'select') setSelection([]);
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
      setPlotView({});
      setTool({ kind: 'select' });
      setDocKey((k) => k + 1);
    },
    [history, setTool],
  );

  const [recent, setRecent] = useState<RecentFile[]>([]);
  const remember = useCallback((d: AscDoc, f: FileState, unsaved = false) => {
    addRecent({ name: f.name, asc: ascText(d), encoding: f.encoding, handle: f.handle, time: Date.now(), unsaved }).then(setRecent);
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
    loadDoc(f.doc, { name: f.name, encoding: f.encoding });
    remember(f.doc, { name: f.name, encoding: f.encoding });
    if (shared.view) setPlotView(shared.view as PlotView);
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
      if (await openShared()) {
        // el trabajo sin guardar anterior queda en recientes
        if (session && sessionDirty) remember(parseAsc(session.present), { name: session.name, encoding: session.encoding }, true);
        return;
      }
      if (touched.current) return;
      if (session) {
        try {
          history.restore({ past: session.past.map(parseAsc), present: parseAsc(session.present), future: session.future.map(parseAsc) });
          setFile({ name: session.name, encoding: session.encoding, handle: session.handle as FileState['handle'] });
          setSavedVersion(session.savedVersion);
          if (session.view) setPlotView(session.view);
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
        past: h.past.slice(drop).map(ascText),
        present: ascText(h.present),
        future: h.future.slice(0, SAVED_UNDO).map(ascText),
        savedVersion: savedVersion - drop,
        time: Date.now(),
        view: plotView,
      });
    }, 600);
    return () => clearTimeout(t);
  }, [restored, history.state, file, savedVersion, plotView]);

  // Vista recordada para este archivo (si no vino ya con el link o la sesión)
  useEffect(() => {
    loadView(file.name).then((v) => v && setPlotView((cur) => (Object.keys(cur).length ? cur : v)));
  }, [file.name]);

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
      }
    } catch (e) {
      setMessage(`No se pudo abrir: ${(e as Error).message}`);
    }
  };

  const doSave = async (saveAs = false) => {
    const { bytes, missing } = ascBytes(doc, lib, file.encoding);
    try {
      const r = await saveFile(bytes, file.name, file.handle, saveAs);
      if (!r) return;
      const saved = { ...file, name: r.name, handle: r.handle ?? file.handle };
      setFile(saved);
      setSavedVersion(history.version);
      remember(doc, saved);
      setMessage(
        missing.length
          ? `Guardado. Símbolos fuera de la librería (sin hacer explícitos): ${missing.join(', ')}`
          : `Guardado: ${r.name}`,
      );
    } catch (e) {
      setMessage(`No se pudo guardar: ${(e as Error).message}`);
    }
  };

  const doShare = async () => {
    const { bytes } = ascBytes(doc, lib, file.encoding);
    const hash = await shareHash(bytes, file.name, plotView);
    setDialog({ kind: 'share', url: `${location.origin}${location.pathname}#${hash}` });
  };

  const doRecent = async (i: number) => {
    const r = recent[i];
    if (!r || !confirmDiscard()) return;
    // el archivo en disco si se puede leer (puede haber cambiado); si no, la copia guardada
    const bytes = r.unsaved ? null : await readHandle(r.handle);
    const f = bytes ? readAsc(bytes, r.name) : { doc: parseAsc(r.asc), name: r.name, encoding: r.encoding };
    const state = { name: f.name, encoding: f.encoding, handle: r.handle as FileState['handle'] };
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
      // Al abrirse el panel de resultados el lienzo se achica: reajustar la vista
      if (!sim) setTimeout(() => editor.current?.fit(), 50);
      setSim({ built, result, doc });
      const withScale = result.plots.filter((p) => scaleOf(p));
      const shown = withScale[withScale.length - 1] ?? result.plots[result.plots.length - 1];
      setPlotName(shown?.name ?? '');
      // Qué graficar: la vista recordada para este análisis, o lo que pida el .control con
      // "plot", o lo que ya se estaba mirando (las trazas que no existan avisan en su chip)
      const remembered = shown && plotView[plotKind(shown.name)];
      if (remembered) {
        setPanes(remembered);
        if (built.controlPanes.length) built.warnings.push('Se usa la vista recordada en lugar de los "plot" del .control');
      } else if (built.controlPanes.length) setPanes(built.controlPanes);
      const errs = result.errors.length ? result.errors : [];
      setStatus(errs.length && !result.plots.length ? { kind: 'error', message: errs[0] } : { kind: 'done', ms });
      setMessage(built.warnings.length ? built.warnings.join(' · ') : undefined);
      if (result.plots.length) {
        setTool({ kind: 'probe' });
        setPanel(errs.length ? 'log' : 'plot');
      } else setPanel('log');
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message });
    }
  };

  const abort = () => {
    engine.abort();
    engine.ready.then(() => setStatus({ kind: 'idle' }));
    setStatus({ kind: 'error', message: 'Simulación abortada' });
  };

  const plot = sim?.result.plots.find((p) => p.name === plotName);
  const selectPlot = (name: string) => {
    setPlotName(name);
    const r = plotView[plotKind(name)];
    if (r) setPanes(r);
  };
  const pltInput = useRef<HTMLInputElement>(null);

  // Punto de operación: sólo mientras el esquemático sea el que se simuló
  const bias = sim && sim.doc === doc ? sim.result.bias : undefined;
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

  const resolver = useCallback((p: SimPlot) => traceResolver(sim?.built ?? null, p), [sim]);

  // Punta de prueba: agrega la traza al panel activo (o la quita si ya estaba)
  const onProbe = (target: { net?: string; symbol?: number }) => {
    if (!sim || !plot) return;
    const expr = probeExpr(sim.built, target);
    if (!expr) return;
    setPanel('plot');
    if (panes.some((p) => p.traces.some((t) => sameExpr(t.expr, expr)))) {
      setPanes(panes.map((p) => ({ traces: p.traces.filter((t) => !sameExpr(t.expr, expr)) })));
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
    setPanes(panes.map((p, k) => (k === i ? { traces: [...p.traces, { expr }] } : p)));
  };

  const rememberView = () => {
    if (!plot) return;
    const kind = plotKind(plot.name);
    const next = { ...plotView, [kind]: panes };
    setPlotView(next);
    saveView(file.name, next);
    setMessage(`Vista recordada para .${kind}: se aplica en cada simulación (y se guarda con el link y en el .plt)`);
  };
  const forgetView = () => {
    if (!plot) return;
    const { [plotKind(plot.name)]: _, ...rest } = plotView;
    setPlotView(rest);
    saveView(file.name, rest);
  };
  const importPlt = (bytes: Uint8Array) => {
    const v = parsePlt(decode(bytes).text);
    if (!Object.keys(v).length) return setMessage('El .plt no tiene vistas que TurboSpice entienda');
    const next = { ...plotView, ...v };
    setPlotView(next);
    saveView(file.name, next);
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

  const openSimulation = () => setDialog({ kind: 'sim', found: findAnalysis(doc) });
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

  // Atajos de teclado estilo LTspice
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || isTyping(e)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key;
      const handled = () => e.preventDefault();
      if (ctrl && (k === 'z' || k === 'Z') && !e.shiftKey) return handled(), history.undo();
      if (ctrl && (k === 'y' || ((k === 'z' || k === 'Z') && e.shiftKey))) return handled(), history.redo();
      if (ctrl && (k === 's' || k === 'S')) return handled(), doSave(e.shiftKey);
      if (ctrl && (k === 'o' || k === 'O')) return handled(), doOpen();
      if (ctrl && (k === 'r' || k === 'R')) return handled(), rotateOrMirror('rotate');
      if (ctrl && (k === 'e' || k === 'E')) return handled(), rotateOrMirror('mirror');
      if (ctrl && k === 'Enter') return handled(), run();
      if (e.altKey && (k === 's' || k === 'S')) return handled(), openSimulation();
      if (e.altKey && (k === 'c' || k === 'C')) return handled(), openControl();
      if (e.altKey && (k === 'n' || k === 'N')) return handled(), setShowNets((v) => !v);
      if (e.altKey) return;
      if (ctrl) return;
      switch (k) {
        case 'Escape':
          setTool({ kind: 'select' });
          setSelection([]);
          return;
        case 'F2':
          return handled(), setDialog({ kind: 'picker' });
        case 'F3':
        case 'w':
          return handled(), setTool({ kind: 'wire', start: null });
        case 'F4':
        case 'n':
          return handled(), setDialog({ kind: 'flag' });
        case 'F5':
        case 'Delete':
        case 'Backspace':
          handled();
          if (selection.length) {
            commit(deleteItems(doc, selection));
            setSelection([]);
          } else setTool({ kind: 'delete' });
          return;
        case 'F6':
          handled();
          if (selection.length) {
            const r = duplicateItems(doc, selection, 32, 32, lib);
            commit(r.doc);
            setSelection(r.refs);
          }
          return;
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
          return setDialog({ kind: 'text', textKind: 'directive' });
        case 't':
          return setDialog({ kind: 'text', textKind: 'comment' });
        case 'Home':
          return handled(), editor.current?.fit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Arrastrar y soltar un .asc
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = async (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer?.files[0];
      if (f?.name.toLowerCase().endsWith('.plt')) return importPlt(new Uint8Array(await f.arrayBuffer()));
      if (!f || !f.name.toLowerCase().endsWith('.asc') || !confirmDiscard()) return;
      const r = readAsc(new Uint8Array(await f.arrayBuffer()), f.name);
      loadDoc(r.doc, { name: r.name, encoding: r.encoding });
      remember(r.doc, { name: r.name, encoding: r.encoding });
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  });

  const running = status.kind === 'running';
  const scale = plot ? scaleOf(plot) : null;
  const runs = sim && plot ? sameRuns(sim.result.plots, plot) : [];
  const labels = useMemo(() => (sim ? stepLabels(sim.result.plots, sim.built.ng.steps) : new Map<string, string>()), [sim]);
  const isComplex = plot?.vectors.some((v) => v.imag);
  const toolBtn = (t: Tool, label: string, title: string) => (
    <button className={tool.kind === t.kind ? 'active' : ''} title={title} onClick={() => setTool(t)}>
      {label}
    </button>
  );

  return (
    <div className="schematic-mode">
      <div className="toolbar">
        <div className="group">
          <button onClick={doNew} title="Nuevo esquemático">Nuevo</button>
          <button onClick={doOpen} title="Abrir .asc (Ctrl+O)">Abrir</button>
          <button onClick={() => doSave(false)} title="Guardar (Ctrl+S)">Guardar</button>
          <button onClick={() => doSave(true)} title="Guardar como (Ctrl+Shift+S)">Guardar como</button>
          <button onClick={doShare} title="Copiar un link que abre este circuito">Compartir</button>
          <select aria-label="Ejemplos" value="" onChange={(e) => e.target.value && doExample(e.target.value)}>
            <option value="">Ejemplos…</option>
            {EXAMPLES.map((x) => (
              <option key={x} value={x}>{x.replace('.asc', '')}</option>
            ))}
          </select>
          <select
            aria-label="Exportar esquemático"
            value=""
            onChange={(e) => {
              const f = e.target.value as 'svg' | 'png' | 'net';
              const base = file.name.replace(/\.asc$/i, '');
              if (f === 'net') return download(`${base}.net`, new Blob([`* ${file.name}\n${ltNetlistText(lt)}\n`], { type: 'text/plain' }));
              const svg = editor.current?.svg();
              const box = editor.current?.contentBox();
              if (svg && box) exportSchematic(svg, box, base, f);
            }}
          >
            <option value="">Exportar…</option>
            <option value="svg">Esquemático a SVG</option>
            <option value="png">Esquemático a PNG</option>
            <option value="net">Netlist de LTspice (.net)</option>
          </select>
          {recent.length > 0 && (
            <select aria-label="Recientes" value="" onChange={(e) => e.target.value && doRecent(Number(e.target.value))}>
              <option value="">Recientes…</option>
              {recent.map((r, i) => (
                <option key={`${r.name}${r.time}`} value={i} title={new Date(r.time).toLocaleString()}>
                  {r.name.replace(/\.asc$/i, '')}{r.unsaved ? ' (sin guardar)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="group">
          {toolBtn({ kind: 'select' }, 'Seleccionar', 'Seleccionar y mover (Esc)')}
          {toolBtn({ kind: 'wire', start: null }, 'Cable', 'Cable (F3 / W)')}
          <button className={tool.kind === 'place' ? 'active' : ''} title="Componente (F2)" onClick={() => setDialog({ kind: 'picker' })}>
            Componente
          </button>
          {toolBtn({ kind: 'flag', name: '0' }, 'Tierra', 'Tierra (G)')}
          <button title="Etiqueta de red (F4 / N)" onClick={() => setDialog({ kind: 'flag' })}>Etiqueta</button>
          <button title="Directiva SPICE libre (S)" onClick={() => setDialog({ kind: 'text', textKind: 'directive' })}>Directiva</button>
          {toolBtn({ kind: 'delete' }, 'Borrar', 'Borrar (F5 / Supr)')}
        </div>
        <div className="group">
          <button onClick={() => rotateOrMirror('rotate')} title="Rotar (Ctrl+R)">Rotar</button>
          <button onClick={() => rotateOrMirror('mirror')} title="Espejar (Ctrl+E)">Espejar</button>
          <button onClick={history.undo} disabled={!history.canUndo} title="Deshacer (Ctrl+Z)">↶</button>
          <button onClick={history.redo} disabled={!history.canRedo} title="Rehacer (Ctrl+Y)">↷</button>
          <button onClick={() => editor.current?.fit()} title="Ajustar a la vista (Inicio)">Ajustar</button>
          <button className={showNets ? 'active' : ''} onClick={() => setShowNets((v) => !v)} title="Mostrar los nombres de todas las redes, sin modificar el esquemático (Alt+N)">
            Redes
          </button>
        </div>
        <div className="group">
          <button onClick={openSimulation} title="Tipo de simulación y parámetros (Alt+S)">Simulación…</button>
          <button onClick={openControl} title="Bloque .control: scripts de ngspice (Alt+C)">.control…</button>
          {running ? (
            <button onClick={abort}>Abortar</button>
          ) : (
            <button className="primary" onClick={run} disabled={status.kind === 'loading'} title="Simular (Ctrl+Enter)">
              Simular
            </button>
          )}
          {sim && toolBtn({ kind: 'probe' }, 'Medir', 'Punta de prueba: click en un cable (tensión) o componente (corriente)')}
          {bias && (
            <button className={showOp ? 'active' : ''} onClick={() => setShowOp((v) => !v)} title="Anotar el punto de operación en el esquemático (sin modificarlo)">
              Anotar OP
            </button>
          )}
          <StatusText status={status} />
        </div>
        <span className="filename" title={file.name}>{file.name}{dirty ? ' •' : ''}</span>
      </div>

      <div className="workspace">
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
            onProbe={onProbe}
            highlightNet={traceNet}
            netNames={shownNets}
            onNameNet={(at) => setDialog({ kind: 'flag', at })}
            describe={describe}
            annotations={annotations}
            pickValue={pickValue}
            onPicked={endPick}
          />
          {picking && (
            <div className="pick-banner">
              {picking.what === 'net' ? 'Elegí una red en el esquemático' : 'Elegí una fuente (V o I) en el esquemático'}
              <button onClick={() => endPick(null)}>Cancelar</button>
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
          <div
            className="splitter"
            role="separator"
            aria-orientation="horizontal"
            title="Arrastrar para cambiar el tamaño de los resultados"
            onPointerDown={(e) => {
              const wrap = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              const move = (ev: PointerEvent) => setResultsH(Math.min(wrap.height - 120, Math.max(140, wrap.bottom - ev.clientY)));
              const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                setResultsH((h) => {
                  try {
                    localStorage.setItem('turbospice.resultsH', String(h));
                  } catch {
                    // sin almacenamiento: el tamaño vale sólo para esta sesión
                  }
                  return h;
                });
              };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
            }}
          />
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
                <button className={panel === 'log' ? 'active' : ''} onClick={() => setPanel('log')}>
                  Log{sim.result.errors.length ? ` (${sim.result.errors.length} errores)` : ''}
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
                  {runs.length > 1 && (
                    <label className="check inline">
                      <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} /> Superponer las{' '}
                      {runs.length} corridas
                    </label>
                  )}
                  {scale && (
                    <>
                      {plot && plotView[plotKind(plot.name)] ? (
                        <button className="active" onClick={forgetView} title="Esta vista se reaplica en cada simulación. Click para olvidarla">
                          Vista recordada ✓
                        </button>
                      ) : (
                        <button onClick={rememberView} title="Reaplicar estas trazas, paneles y colores en cada simulación">Recordar vista</button>
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
              <button className="close" onClick={() => setSim(null)} title="Cerrar resultados">✕</button>
            </div>
            <div className="results-body">
              {panel === 'plot' && plot && scale && isComplex && mode === 'smith' && <SmithChart plot={plot} panes={panes} resolver={resolver} />}
              {panel === 'plot' && plot && scale && !(isComplex && mode === 'smith') && (
                <PlotPanel
                  handle={plotPanel}
                  plot={plot}
                  runs={overlay ? runs : [plot]}
                  labels={labels}
                  panes={panes}
                  setPanes={setPanes}
                  resolver={resolver}
                  mode={mode}
                  active={activePane}
                  setActive={setActivePane}
                  onHoverExpr={(e) => {
                    const net = e && /^\s*V\(([^,()]+)\)\s*$/i.exec(e)?.[1];
                    setTraceNet(net ? conn.nets.find((n) => n.name.toLowerCase() === net.toLowerCase())?.name : undefined);
                  }}
                />
              )}
              {panel === 'plot' && plot && !scale && (isPzPlot(plot) ? <PzPlane plot={plot} /> : <ResultTable plot={plot} />)}
              {panel === 'netlist' && <pre className="code">{sim.built.netlist}</pre>}
              {panel === 'log' && <pre className="code">{sim.result.log.join('\n')}</pre>}
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
            setTool({ kind: 'place', type, orient: 'R0' });
          }}
        />
      )}
      {dialog?.kind === 'attrs' && doc.symbols[dialog.index] && (
        <AttributeDialog
          inst={doc.symbols[dialog.index]}
          def={lib.symbol(doc.symbols[dialog.index].type)}
          onClose={() => setDialog(null)}
          onApply={(attrs) => {
            setDialog(null);
            if (Object.keys(attrs).length) commit(setSymbolAttrs(doc, dialog.index, attrs));
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
      return 'Click para seleccionar · arrastrar para mover (Ctrl: sin arrastrar cables) · doble click para editar · rueda: zoom · botón medio o espacio: desplazar';
    case 'wire':
      return t.start ? 'Click para fijar el tramo · click derecho o Esc para terminar' : 'Click para empezar el cable';
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
    case 'pick':
      return t.what === 'net' ? 'Click en un cable o pin para elegir su red · Esc cancela' : 'Click en una fuente V o I para elegirla · Esc cancela';
  }
}
