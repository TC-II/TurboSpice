// Editor de un módulo «Modelo», pensado como el flujo de crear un componente:
//  1. Netlist (arriba a la izquierda): se empieza pegando uno, abriendo un archivo, copiando el de
//     un componente o con una plantilla; el texto se resalta y cada problema se marca en su línea,
//     con su arreglo. Si el archivo define varios componentes, se elige cuál usa el símbolo.
//  2. Pines: a qué nodo va cada pin del símbolo (un desplegable; el SpiceOrder no se escribe a mano).
//  3. Símbolo (a la derecha): generado mientras no se lo toque; o uno existente, con sus pines.
//  4. Parámetros y rótulos: lo que pasa cada instancia y qué se ve en el esquemático.
//  5. Usarlo: el estado de cada paso, la línea que escribe cada instancia y «Colocar».
// Netlist y símbolo cambian juntos (cada cambio pasa por normalizeModel, así los pines nunca quedan
// en otro nodo sin aviso) y comparten un deshacer. El texto se guarda al rato de dejar de escribir.
import { useEffect, useMemo, useRef, useState } from 'react';
import { decodeText } from '../asc/encoding.ts';
import { t } from '../i18n/i18n.ts';
import { Icon } from '../ui/icons.tsx';
import { useEvent } from '../ui/useEvent.ts';
import { analyzeModel, applyFix, chooseDefinition, fromTemplate, normalizeModel, rebuildSymbol, setParams, TEMPLATES, type Area, type ModelState } from './modelEdit.ts';
import { DetailsPanel, LabelsPanel, ParamsPanel, PinsPanel, ProblemList, type Apply } from './ModelPanels.tsx';
import { modelFileName } from './modelModule.ts';
import { NetlistEditor, type NetlistEditorHandle } from './NetlistEditor.tsx';
import { SymbolEditor } from './SymbolEditor.tsx';
import { formatParamList, symPins } from './symbolEdit.ts';

type Tab = 'pins' | 'params' | 'labels' | 'details';
type Step = 'pending' | 'ok' | 'warning' | 'error';

/** pausa al escribir después de la que el netlist se guarda; y lapso en que se junta en un solo deshacer */
const SAVE_MS = 400;
const MERGE_MS = 2000;
const TAB_KEY = 'turbospice.modelTab';
const SPLIT_KEY = 'turbospice.modelSplit';
const load = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const store = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento: no se recuerda */
  }
};
const same = (a: ModelState, b: ModelState) => a.text === b.text && a.sym === b.sym;
const isField = (el: EventTarget | null) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;

export function ModelEditor({
  name,
  text,
  symText,
  onChange,
  onPickSymbol,
  onPickNetlist,
  onPlace,
  onRename,
  onClose,
}: {
  name: string;
  text: string;
  symText: string;
  /** netlist y símbolo nuevos (siempre los dos juntos) */
  onChange(next: ModelState): void;
  /** el dibujo y los pines de un símbolo existente (su .asy) */
  onPickSymbol?(): void;
  /** el netlist de un componente existente (p. ej. un subcircuito del proyecto) */
  onPickNetlist?(): void;
  /** cerrar el editor y colocar el componente en el esquemático */
  onPlace?(): void;
  /** renombrar el módulo (abre el diálogo con `to` propuesto) */
  onRename?(to: string): void;
  onClose(): void;
}) {
  // lo que se abrió (tal cual está en el proyecto) y normalizado: SpiceModel, Prefix y ModelFile al
  // día (un proyecto viejo puede no tenerlos)
  const [init] = useState<ModelState>(() => ({ text, sym: symText }));
  const [opened] = useState(() => normalizeModel(init, name));
  /** lo último guardado (o recibido de afuera); `cur` lo tiene al instante, `base` para el render */
  const cur = useRef<ModelState>(opened);
  const [base, setBaseState] = useState<ModelState>(opened);
  const setBase = (s: ModelState) => {
    cur.current = s;
    setBaseState(s);
  };
  const [draft, setDraftState] = useState(opened.text);
  const draftRef = useRef(opened.text);
  const setDraft = (v: string) => {
    draftRef.current = v;
    setDraftState(v);
  };
  const past = useRef<ModelState[]>([]);
  const future = useRef<ModelState[]>([]);
  const last = useRef<{ kind?: string; at: number }>({ at: 0 });
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const send = useRef(onChange);
  send.current = onChange;

  /** Guarda un cambio (normalizado) como un paso de deshacer; los de escribir seguido van juntos */
  const commit = (next: ModelState, kind?: 'typing') => {
    clearTimeout(timer.current);
    const prev = cur.current;
    const norm = normalizeModel(next, name, prev);
    if (same(norm, prev)) return;
    const now = Date.now();
    if (!(kind === 'typing' && last.current.kind === 'typing' && now - last.current.at < MERGE_MS)) {
      past.current.push(prev);
      if (past.current.length > 200) past.current.shift();
    }
    future.current = [];
    last.current = { kind, at: now };
    setBase(norm);
    if (norm.text !== draftRef.current) setDraft(norm.text);
    send.current(norm);
  };
  /** Lo escrito y no guardado todavía, guardado ya */
  const flush = () => {
    clearTimeout(timer.current);
    if (draftRef.current !== cur.current.text) commit({ text: draftRef.current, sym: cur.current.sym }, 'typing');
  };
  const apply: Apply = (fn) => {
    flush();
    commit(fn(cur.current));
  };
  const travel = (from: ModelState[], to: ModelState[]) => {
    flush();
    const s = from.pop();
    if (!s) return;
    to.push(cur.current);
    last.current = { at: 0 };
    setBase(s);
    setDraft(s.text);
    send.current(s);
  };
  const undo = () => travel(past.current, future.current);
  const redo = () => travel(future.current, past.current);

  // al abrir: lo normalizado, si cambió algo (sin paso de deshacer); al cerrar (el editor se monta
  // de nuevo para cada modelo), lo que quedó sin guardar
  const opening = useEvent(() => {
    if (!same(opened, init)) send.current(opened);
    return () => {
      clearTimeout(timer.current);
      if (draftRef.current !== cur.current.text) send.current(normalizeModel({ text: draftRef.current, sym: cur.current.sym }, name, cur.current));
    };
  });
  useEffect(() => opening(), [opening]);
  // un cambio de afuera (importar un netlist o un símbolo): se lo toma, normalizado, como un paso más
  useEffect(() => {
    const c = cur.current;
    if ((text === c.text && symText === c.sym) || (text === init.text && symText === init.sym)) return;
    const ext = { text, sym: symText };
    const norm = normalizeModel(ext, name, c);
    past.current.push(c);
    future.current = [];
    last.current = { at: 0 };
    setBase(norm);
    setDraft(norm.text);
    if (!same(norm, ext)) send.current(norm);
  }, [text, symText, name, init]);

  // lo que se ve: con el texto que se está escribiendo (los pines y problemas siguen al teclear)
  const view = useMemo<ModelState>(() => (draft === base.text ? base : normalizeModel({ text: draft, sym: base.sym }, name, base)), [draft, base, name]);
  const a = useMemo(() => analyzeModel(view), [view]);
  const marks = useMemo(() => {
    const m = new Map<number, 'error' | 'warning'>();
    for (const d of a.diagnostics) if (d.line !== undefined && m.get(d.line) !== 'error') m.set(d.line, d.severity);
    return m;
  }, [a]);
  const of = (area: Area) => a.diagnostics.filter((d) => d.area === area);
  const stepOf = (area: Area, todo: boolean): Step => (todo ? 'pending' : of(area).some((d) => d.severity === 'error') ? 'error' : of(area).length ? 'warning' : 'ok');
  const steps: { id: Area; label: string; state: Step }[] = [
    { id: 'netlist', label: t('Netlist'), state: stepOf('netlist', a.empty) },
    { id: 'pins', label: t('Pins'), state: stepOf('pins', !a.used) },
    { id: 'params', label: t('Parameters'), state: stepOf('params', !a.used) },
  ];
  const ready = !!a.used && !a.diagnostics.some((d) => d.severity === 'error');

  const [tab, setTabState] = useState<Tab>(() => (['pins', 'params', 'labels', 'details'].includes(load(TAB_KEY) ?? '') ? (load(TAB_KEY) as Tab) : 'pins'));
  const setTab = (x: Tab) => {
    setTabState(x);
    store(TAB_KEY, x);
  };
  const [hover, setHover] = useState<number | null>(null);
  const [selPins, setSelPins] = useState<number[]>([]);
  const [symW, setSymW] = useState<number | null>(null);
  const [writing, setWriting] = useState(false);
  const aligns = useRef(new Map<string, string>());
  const editor = useRef<NetlistEditorHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const reveal = (line: number) => editor.current?.reveal(line);
  const fix: Parameters<typeof ProblemList>[0]['onFix'] = (f) => apply((s) => applyFix(s, f));
  const goStep = (id: Area) => {
    if (id === 'pins') return setTab('pins');
    if (id === 'params') return setTab('params');
    const first = of('netlist').find((d) => d.line !== undefined);
    if (first) reveal(first.line!);
    else editor.current?.focus();
  };
  // al empezar a escribir a mano, el foco va al editor (después de sacar la tarjeta de inicio)
  useEffect(() => {
    if (writing) editor.current?.focus();
  }, [writing]);

  // alto del netlist (se arrastra el borde con los paneles de abajo)
  const left = useRef<HTMLElement>(null);
  const [split, setSplit] = useState<number | null>(() => Number(load(SPLIT_KEY)) || null);
  const dragSplit = (e: React.PointerEvent) => {
    const box = left.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    let h = split ?? box.height / 2;
    const mv = (ev: PointerEvent) => {
      h = Math.min(Math.max(ev.clientY - box.top, 140), box.height - 160);
      setSplit(h);
    };
    const done = () => {
      el.removeEventListener('pointermove', mv);
      el.removeEventListener('pointerup', done);
      store(SPLIT_KEY, String(Math.round(h)));
    };
    el.addEventListener('pointermove', mv);
    el.addEventListener('pointerup', done);
  };
  const splitKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const box = left.current?.getBoundingClientRect();
    if (!box) return;
    const h = Math.min(Math.max((split ?? box.height / 2) + (e.key === 'ArrowUp' ? -24 : 24), 140), box.height - 160);
    setSplit(h);
    store(SPLIT_KEY, String(Math.round(h)));
  };

  const openFile = async (f: File) => {
    const v = decodeText(new Uint8Array(await f.arrayBuffer()));
    apply((s) => ({ ...s, text: v.endsWith('\n') ? v : `${v}\n` }));
  };
  const startWith = (id: string) => apply((s) => fromTemplate(s, id, name));
  const def = a.used;
  const freeNodes = a.free.map((i) => ({ name: a.nodes[i], order: i + 1 }));
  const showStart = a.empty && !writing;

  return (
    <div
      className="model-editor"
      style={{ '--sym-wc': symW ? `min(${symW}px, 75%)` : '46%' } as React.CSSProperties}
      onKeyDown={(e) => {
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && !isField(e.target) && /^[zy]$/i.test(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          if (e.key.toLowerCase() === 'y' || e.shiftKey) redo();
          else undo();
          return;
        }
        // las teclas no llegan al esquemático de abajo (salvo guardar, abrir y buscar)
        if (!(ctrl && /^[sop]$/i.test(e.key))) e.stopPropagation();
      }}
      onPaste={(e) => {
        e.stopPropagation();
        // pegar un netlist con el modelo vacío (sin estar en un campo): va al netlist
        const v = e.clipboardData.getData('text');
        if (!isField(e.target) && a.empty && v.trim()) {
          e.preventDefault();
          apply((s) => ({ ...s, text: v.endsWith('\n') ? v : `${v}\n` }));
        }
      }}
    >
      <header className="mdl-bar">
        <span className="mdl-title">{t('Model Editor')}</span>
        <strong className="mdl-name">{name}</strong>
        <span className="mdl-kind">
          {def
            ? def.kind === 'subckt'
              ? a.nodes.length === 1
                ? t('.subckt · 1 node')
                : t('.subckt · {n} nodes', { n: a.nodes.length })
              : t('.model {type}', { type: def.type ?? '' })
            : a.empty
              ? t('empty')
              : t('no definition')}
        </span>
        <ol className="mdl-steps" aria-label={t('Steps')}>
          {steps.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className={`mdl-step ${s.state}`}
                onClick={() => goStep(s.id)}
                title={s.state === 'ok' ? t('{step}: ready', { step: s.label }) : s.state === 'pending' ? t('{step}: to do', { step: s.label }) : t('{step}: see the problems', { step: s.label })}
              >
                <span className="mdl-step-n">{s.state === 'ok' ? <Icon name="check" size={12} /> : s.state === 'error' ? '!' : s.state === 'warning' ? '!' : i + 1}</span>
                <span className="mdl-step-label">{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
        <span className="mdl-bar-sep" />
        <button type="button" className="icon-btn" onClick={undo} disabled={!past.current.length && draft === base.text} aria-label={t('Undo (Ctrl+Z)')} title={t('Undo (Ctrl+Z)')}>
          <Icon name="undo" size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={redo} disabled={!future.current.length} aria-label={t('Redo (Ctrl+Y)')} title={t('Redo (Ctrl+Y)')}>
          <Icon name="redo" size={16} />
        </button>
        {onPlace && (
          <button
            type="button"
            className={ready ? 'primary' : undefined}
            disabled={!def}
            onClick={() => {
              flush();
              onPlace();
            }}
            title={ready ? t('Close the editor and place {name} on the schematic', { name }) : t('There are problems to solve, but it can be placed already')}
          >
            {t('Place on the schematic')}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            flush();
            onClose();
          }}
          title={t('Back to the testbench')}
        >
          {t('Close')}
        </button>
      </header>
      <section className="mdl-left" ref={left}>
        <div className="mdl-netlist" style={split ? { flex: `0 0 ${split}px` } : undefined}>
          <div className="mdl-pane-head">
            <label className="mdl-label" htmlFor="mdl-netlist">
              {t('Netlist')} <code>{modelFileName(name)}</code>
            </label>
            {a.defs.length > 1 && (
              <label className="mdl-def">
                {t('The symbol uses')}
                <select value={def?.name} onChange={(e) => apply((s) => chooseDefinition(s, e.target.value))}>
                  {a.defs.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.kind === 'subckt' ? `${d.name} (.subckt, ${d.nodes.length})` : `${d.name} (.model ${d.type ?? ''})`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <span className="mdl-grow" />
            <button type="button" className="tree-add" onClick={() => fileInput.current?.click()} title={t('Replace the netlist with a model file (.lib, .sub, .mod, .cir…)')}>
              {t('Open a file…')}
            </button>
            {onPickNetlist && (
              <button
                type="button"
                className="tree-add"
                onClick={() => {
                  flush();
                  onPickNetlist();
                }}
                title={t('Copy the netlist of an existing component (a subcircuit of the project, a library model…)')}
              >
                {t('Copy from a component…')}
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              hidden
              accept=".lib,.sub,.mod,.cir,.inc,.sp,.spi,.spice,.txt,.ckt,.net"
              aria-label={t('Model file')}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void openFile(f);
              }}
            />
          </div>
          <div className="mdl-code">
            <NetlistEditor
              ref={editor}
              id="mdl-netlist"
              value={draft}
              marks={marks}
              label={t('Netlist of {name}', { name })}
              onChange={(v) => {
                setDraft(v);
                clearTimeout(timer.current);
                timer.current = setTimeout(() => commit({ text: draftRef.current, sym: cur.current.sym }, 'typing'), SAVE_MS);
              }}
              onBlur={flush}
            />
            {showStart && (
              <div className="mdl-start" role="group" aria-label={t('How to start')}>
                <h3>{t('Start your component')}</h3>
                <p className="tree-meta">{t('A component is a netlist (a .subckt or a .model) and the symbol that places it on the schematic. Start from:')}</p>
                <div className="mdl-start-actions">
                  <button type="button" onClick={() => setWriting(true)}>
                    <Icon name="edit" size={16} />
                    <span>
                      <strong>{t('Paste or write it')}</strong>
                      <small>{t('Ctrl+V pastes it here')}</small>
                    </span>
                  </button>
                  <button type="button" onClick={() => fileInput.current?.click()}>
                    <Icon name="folder" size={16} />
                    <span>
                      <strong>{t('Open a file…')}</strong>
                      <small>{t('A manufacturer model: .lib, .sub, .mod')}</small>
                    </span>
                  </button>
                  {onPickNetlist && (
                    <button type="button" onClick={onPickNetlist}>
                      <Icon name="component" size={16} />
                      <span>
                        <strong>{t('Copy from a component…')}</strong>
                        <small>{t('A subcircuit of the project or a library model')}</small>
                      </span>
                    </button>
                  )}
                </div>
                <p className="mdl-start-sub">{t('Or a template:')}</p>
                <div className="mdl-templates">
                  {TEMPLATES.map((x) => (
                    <button key={x.id} type="button" className="mdl-chip" onClick={() => startWith(x.id)}>
                      {x.label()}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <ProblemList items={of('netlist')} onReveal={reveal} onFix={fix} />
        </div>
        <div
          className="mdl-split"
          role="separator"
          aria-orientation="horizontal"
          aria-label={t('Drag to change the height of the netlist')}
          tabIndex={0}
          onPointerDown={dragSplit}
          onKeyDown={splitKey}
          onDoubleClick={() => {
            setSplit(null);
            store(SPLIT_KEY, '');
          }}
        />
        <div className="mdl-inspector">
          <div className="mdl-tabs" role="tablist" aria-label={t('Component')}>
            {(
              [
                ['pins', t('Pins'), 'pins'],
                ['params', t('Parameters'), 'params'],
                ['labels', t('Labels'), null],
                ['details', t('Details'), null],
              ] as [Tab, string, Area | null][]
            ).map(([id, label, area]) => {
              const n = area ? of(area).length : 0;
              const bad = area ? of(area).some((d) => d.severity === 'error') : false;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`mdl-tab-${id}`}
                  aria-selected={tab === id}
                  aria-controls="mdl-tabpanel"
                  className={tab === id ? 'active' : undefined}
                  onClick={() => setTab(id)}
                >
                  {label}
                  {n > 0 && <span className={`mdl-badge ${bad ? 'error' : 'warning'}`}>{n}</span>}
                </button>
              );
            })}
          </div>
          <div className="mdl-tabpanel" id="mdl-tabpanel" role="tabpanel" aria-labelledby={`mdl-tab-${tab}`}>
            {tab === 'pins' && <PinsPanel a={a} apply={apply} hover={hover} setHover={setHover} selected={selPins} problems={<ProblemList items={of('pins')} onFix={fix} />} />}
            {tab === 'params' && <ParamsPanel key={formatParamList(a.params)} a={a} apply={apply} problems={<ProblemList items={of('params')} onFix={fix} />} />}
            {tab === 'labels' && <LabelsPanel state={view} apply={apply} aligns={aligns} />}
            {tab === 'details' && <DetailsPanel name={name} a={a} state={view} apply={apply} onRename={onRename} />}
          </div>
          <footer className="mdl-instance" title={t('The line that each instance adds to the netlist (with the names of the pins as nodes)')}>
            <span>{t('Each instance writes')}</span>
            <code>{def ? a.instance : '—'}</code>
          </footer>
        </div>
      </section>
      <SymbolEditor
        name={name}
        text={view.sym}
        ports={a.nodes}
        assign={false}
        keepAlign
        showParams={false}
        onWidth={setSymW}
        onChange={(sym) => apply((s) => ({ ...s, sym }))}
        params={a.params}
        onParams={(ps) => apply((s) => setParams(s, ps))}
        onReset={() => apply((s) => ({ ...s, sym: rebuildSymbol(name, s) }))}
        onPickSymbol={
          onPickSymbol &&
          (() => {
            flush();
            onPickSymbol();
          })
        }
        pickLabel={t('Use an existing symbol…')}
        history={{ undo, redo, canUndo: past.current.length > 0 }}
        highlight={hover === null ? undefined : [hover]}
        onSelectPins={setSelPins}
        modelPins={{ free: freeNodes, count: a.nodes.length }}
      />
      {symPins(view.sym).length === 0 && def && <span className="mdl-sym-empty">{t('The symbol has no pins: add them in Pins')}</span>}
    </div>
  );
}
