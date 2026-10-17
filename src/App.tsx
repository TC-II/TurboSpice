// TurboSpice: editor de esquemáticos .asc (compatible con LTspice) + simulación con ngspice.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emptyDoc, type AscDoc } from './asc/model.ts';
import type { AscEncoding } from './asc/encoding.ts';
import { EngineClient } from './engine/client.ts';
import type { SimResult } from './engine/ngspice.ts';
import { Library, type LibraryBundle } from './library/library.ts';
import { ltNetlist } from './netlist/ltnetlist.ts';
import { netNames } from './schematic/NetNames.tsx';
import type { Point } from './asc/model.ts';
import { ScalarTable, StatusText, type Status } from './NetlistMode.tsx';
import { NetlistMode } from './NetlistMode.tsx';
import { AttributeDialog, ComponentPicker, FlagDialog, ShareDialog, TextDialog } from './schematic/dialogs.tsx';
import { readShareHash, shareHash } from './schematic/share.ts';
import { ControlDialog, SimulationDialog, type CircuitInfo } from './schematic/simDialogs.tsx';
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
import { buildSimulation, elementVector, netVector, type BuiltSimulation } from './sim/schematicSim.ts';
import { Plot } from './waveform/Plot.tsx';
import { displayName, sameRuns, scaleOf, type ComplexView } from './waveform/series.ts';

const BASE = import.meta.env.BASE_URL;
const EXAMPLES = ['Filtro RC.asc', 'Bode RLC.asc', 'Inversor OA_Ideal.asc', 'Rectificador.asc'];

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
  const [sim, setSim] = useState<{ built: BuiltSimulation; result: SimResult } | null>(null);
  const [traces, setTraces] = useState<string[]>([]);
  const [plotName, setPlotName] = useState('');
  const [view, setView] = useState<ComplexView>('db');
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
      setTraces([]);
      setTool({ kind: 'select' });
      setDocKey((k) => k + 1);
    },
    [history, setTool],
  );

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
    return true;
  }, [loadDoc]);

  // Primer documento: el del link, o un ejemplo (salvo que el usuario ya haya empezado a trabajar)
  const touched = useRef(false);
  touched.current ||= docKey > 0 || history.version > 0;
  useEffect(() => {
    openShared().then((opened) => {
      if (opened) return;
      fetch(`${BASE}examples/${encodeURIComponent(EXAMPLES[0])}`)
        .then((r) => r.arrayBuffer())
        .then((b) => {
          if (touched.current) return;
          const f = readAsc(new Uint8Array(b), EXAMPLES[0]);
          loadDoc(f.doc, { name: f.name, encoding: f.encoding });
        })
        .catch(() => {});
    });
  }, []); // sólo al montar

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
      if (f) loadDoc(f.doc, { name: f.name, encoding: f.encoding, handle: f.handle });
    } catch (e) {
      setMessage(`No se pudo abrir: ${(e as Error).message}`);
    }
  };

  const doSave = async (saveAs = false) => {
    const { bytes, missing } = ascBytes(doc, lib, file.encoding);
    try {
      const r = await saveFile(bytes, file.name, file.handle, saveAs);
      if (!r) return;
      setFile({ ...file, name: r.name, handle: r.handle ?? file.handle });
      setSavedVersion(history.version);
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
    const hash = await shareHash(bytes, file.name);
    setDialog({ kind: 'share', url: `${location.origin}${location.pathname}#${hash}` });
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
      const { result, ms } = await engine.simulate(built.netlist, built.files);
      // Al abrirse el panel de resultados el lienzo se achica: reajustar la vista
      if (!sim) setTimeout(() => editor.current?.fit(), 50);
      setSim({ built, result });
      const withScale = result.plots.filter((p) => scaleOf(p));
      const shown = withScale[withScale.length - 1] ?? result.plots[result.plots.length - 1];
      setPlotName(shown?.name ?? '');
      // conservar las puntas de prueba que sigan existiendo
      setTraces((t) => t.filter((v) => shown?.vectors.some((x) => x.name === v)));
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

  const onProbe = ({ net, symbol }: { net?: string; symbol?: number }) => {
    if (!sim || !plot) return;
    let vec: string | null = null;
    if (net && net !== '0') vec = netVector(net);
    if (symbol !== undefined) {
      const el = sim.built.lt.elements.find((e) => e.sym === symbol);
      if (el) vec = elementVector(sim.built, el.name);
    }
    if (!vec) return;
    const v = vec;
    if (!plot.vectors.some((x) => x.name.toLowerCase() === v)) {
      setMessage(`No hay datos de ${v} en ${plot.name}`);
      return;
    }
    setTraces((t) => (t.includes(v) ? t.filter((x) => x !== v) : [...t, v]));
    setPanel('plot');
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
      if (!f || !f.name.toLowerCase().endsWith('.asc') || !confirmDiscard()) return;
      const r = readAsc(new Uint8Array(await f.arrayBuffer()), f.name);
      loadDoc(r.doc, { name: r.name, encoding: r.encoding });
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
  const chosen = plot ? plot.vectors.filter((v) => traces.includes(v.name)) : [];
  const runs = sim && plot ? sameRuns(sim.result.plots, plot) : [];
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
          />
          {message && (
            <div className="toast" onClick={() => setMessage(undefined)}>
              {message}
            </div>
          )}
          <div className="hint-bar">{toolHint(tool)}</div>
        </div>

        {sim && (
          <section className="results-panel">
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
                  <select value={plotName} onChange={(e) => setPlotName(e.target.value)} aria-label="Plot">
                    {sim.result.plots.map((p) => (
                      <option key={p.name}>{p.name}</option>
                    ))}
                  </select>
                  {isComplex && scale && (
                    <select value={view} onChange={(e) => setView(e.target.value as ComplexView)} aria-label="Vista">
                      <option value="db">Magnitud (dB)</option>
                      <option value="phase">Fase (°)</option>
                      <option value="mag">Magnitud</option>
                    </select>
                  )}
                  {runs.length > 1 && (
                    <label className="check inline">
                      <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} /> Superponer las{' '}
                      {runs.length} corridas
                    </label>
                  )}
                  <div className="trace-chips">
                    {chosen.map((v) => (
                      <button
                        key={v.name}
                        className="chip"
                        onClick={() => setTraces((t) => t.filter((x) => x !== v.name))}
                        onPointerEnter={() => setTraceNet(conn.nets.find((n) => n.name && netVector(n.name) === v.name)?.name)}
                        onPointerLeave={() => setTraceNet(undefined)}
                        title="Quitar"
                      >
                        {displayName(v)} ✕
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button className="close" onClick={() => setSim(null)} title="Cerrar resultados">✕</button>
            </div>
            <div className="results-body">
              {panel === 'plot' && plot && scale && chosen.length > 0 && (
                <Plot plot={plot} vectors={chosen} view={view} runs={overlay ? runs : undefined} />
              )}
              {panel === 'plot' && plot && scale && chosen.length === 0 && (
                <p className="empty pad">Hacé click en un cable para ver su tensión, o en un componente para ver su corriente.</p>
              )}
              {panel === 'plot' && plot && !scale && <ScalarTable plot={plot} />}
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
  }
}
