// Navegación entre el testbench y los subcircuitos (#180): panel de proyecto (árbol), barra con
// pestañas y migas de pan, y buscador rápido (Ctrl+P).
import { SUBCKT_DRAG } from '../schematic/SchematicEditor.tsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../schematic/dialogs.tsx';
import { Icon } from '../ui/icons.tsx';
import { NameInput } from '../ui/EditableName.tsx';
import { t } from '../i18n/i18n.ts';

/** Un nivel de la jerarquía abierta: el subcircuito y la instancia por la que se bajó (si se bajó) */
export interface Level {
  sub: string;
  inst?: string;
}

export interface TreeSub {
  name: string;
  ports: number;
  uses: { label: string; inst: string; go(): void }[];
  children: string[];
  outdated: boolean;
  text: boolean;
  /** instancias desactualizadas (#199): pines sin conectar o cables sueltos sobre el símbolo */
  stale?: { label: string; inst: string; detail: string; go(): void }[];
}

/** Panel lateral: testbenches (variantes) y subcircuitos */
export interface TreeBench {
  id: string;
  name: string;
  /** su simulación ("Transient 0–5 ms") */
  detail: string;
  group?: string;
  /** sus .param (nombre, valor) */
  params: [string, string][];
  /** lo que barre con .step (nombre y la línea entera) */
  steps: { name: string; line: string }[];
  /** corridas en su historial */
  runs: number;
}

export type BenchItem = 'sim' | 'schematic' | 'params' | 'history' | 'study';

const COLLAPSED_KEY = 'turbospice.treeCollapsed';
const loadCollapsed = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
};

export function ProjectTree({ project, benches, groups, activeBench, subs, current, peek, onBench, onTestbench, onBenchItem, onNewBench, onRenameProject, onNewGroup, onGroupAction, onMoveBench, onBenchAction, onOpen, onNew, onFromSelection, onRename, onDelete, onUpdateSymbol, onExport, onExportNetlist, onToUser, onImport, onClose, onLeave }: {
  project: string;
  benches: TreeBench[];
  groups: { id: string; name: string }[];
  activeBench: string;
  subs: TreeSub[];
  /** subcircuito abierto ('' = testbench) */
  current: string;
  /** se está mostrando por acercar el mouse (encima del esquemático) */
  peek: boolean;
  onBench(id: string): void;
  /** volver al testbench activo (desde un subcircuito) */
  onTestbench(): void;
  /** abrir una parte de un testbench: su simulación, su esquemático o sus parámetros */
  onBenchItem(id: string, item: BenchItem): void;
  onNewBench(group?: string): void;
  onNewGroup(): void;
  onGroupAction(id: string, action: 'rename' | 'delete'): void;
  /** mover a un grupo; con `before`, justo antes de ese testbench (#218), si no al final */
  onMoveBench(id: string, group: string, before?: string): void;
  onBenchAction(id: string, action: 'rename' | 'duplicate' | 'delete'): void;
  onOpen(name: string): void;
  onNew(): void;
  /** exportar un subcircuito (.zip con su .asc y su .asy) e importar */
  onExport(name: string): void;
  /** exportar como netlist .sub (#199) */
  onExportNetlist(name: string): void;
  /** copiar a My symbols and models (#199, #171) */
  onToUser(name: string): void;
  onImport(): void;
  /** convertir la selección (sin selección: undefined) */
  onFromSelection?(): void;
  onRename(name: string): void;
  /** renombra el proyecto (clic en el título) */
  onRenameProject(name: string): void;
  onDelete(name: string): void;
  onUpdateSymbol(name: string): void;
  onClose(): void;
  /** el mouse salió del panel (para esconderlo si se mostró al acercarlo) */
  onLeave(): void;
}) {
  // grupos, testbenches y sus parámetros plegados (los testbenches arrancan plegados: una línea)
  const [renamingProject, setRenamingProject] = useState(false);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [openBench, setOpenBench] = useState<Set<string>>(() => new Set());
  const [openParams, setOpenParams] = useState<Set<string>>(() => new Set());
  const toggleGroup = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...n]));
      } catch {
        /* sin almacenamiento */
      }
      return n;
    });
  const toggleIn = (set: (f: (s: Set<string>) => Set<string>) => void, id: string, on?: boolean) =>
    set((s) => {
      const n = new Set(s);
      if (on ?? !n.has(id)) n.add(id);
      else n.delete(id);
      return n;
    });
  const [dragging, setDragging] = useState('');
  const [dropOn, setDropOn] = useState<string | null>(null);
  const drop = (group: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragging) return;
      e.preventDefault();
      setDropOn(group);
    },
    onDragLeave: () => setDropOn(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragging) onMoveBench(dragging, group);
      setDragging('');
      setDropOn(null);
    },
  });
  // reordenar (#218): soltar sobre otro testbench lo pone antes o después (una línea marca dónde)
  const [insertAt, setInsertAt] = useState<{ id: string; after: boolean } | null>(null);
  const reorder = (b: TreeBench) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragging) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      if (insertAt?.id !== b.id || insertAt.after !== after) setInsertAt({ id: b.id, after });
      setDropOn(null);
    },
    onDragLeave: () => setInsertAt(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragging && insertAt && b.group) {
        const peers = benches.filter((x) => x.group === b.group && x.id !== dragging);
        const before = insertAt.after ? peers[peers.findIndex((x) => x.id === b.id) + 1]?.id : b.id;
        if (before !== dragging) onMoveBench(dragging, b.group, before);
      }
      setDragging('');
      setInsertAt(null);
    },
  });
  // los testbenches a la vista, en orden: las flechas ↑ ↓ pasan de uno a otro (como en el historial)
  const visible = groups.filter((g) => !collapsed.has(g.id)).flatMap((g) => benches.filter((b) => b.group === g.id));
  const treeRef = useRef<HTMLElement>(null);
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea') || e.altKey || e.ctrlKey || e.metaKey) return;
    const i = visible.findIndex((b) => b.id === activeBench);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const next = visible[Math.max(0, Math.min(visible.length - 1, i < 0 ? 0 : i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next && next.id !== activeBench) onBench(next.id);
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && i >= 0) toggleIn(setOpenBench, activeBench, e.key === 'ArrowRight');
    else return;
    e.preventDefault();
  };
  // el foco sigue al testbench activo (para seguir con las flechas)
  useEffect(() => {
    const tree = treeRef.current;
    if (!tree?.contains(document.activeElement)) return;
    tree.querySelector<HTMLElement>(`[data-bench="${activeBench}"] .tree-name`)?.focus();
  }, [activeBench]);
  const bench = (b: TreeBench) => {
    const open = openBench.has(b.id);
    const pOpen = openParams.has(b.id);
    const active = !current && b.id === activeBench;
    const nVars = b.params.length + b.steps.length;
    return (
      <li key={b.id}>
        <div
          className={`tree-row${active ? ' active' : ''}${dragging === b.id ? ' dragging' : ''}${insertAt?.id === b.id ? (insertAt.after ? ' insert-after' : ' insert-before') : ''}`}
          data-bench={b.id}
          {...reorder(b)}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', b.name);
            setDragging(b.id);
          }}
          onDragEnd={() => (setDragging(''), setDropOn(null), setInsertAt(null))}
          title={t('Drag it to reorder it, or onto a workbench to move it')}
        >
          <button className="tree-caret" onClick={() => toggleIn(setOpenBench, b.id)} aria-label={open ? t('Collapse {name}', { name: b.name }) : t('Expand {name}', { name: b.name })} aria-expanded={open}>
            {open ? '▾' : '▸'}
          </button>
          <button className="tree-name" onClick={() => (b.id === activeBench ? onTestbench() : onBench(b.id))} title={`${b.detail} — ${t('↑ ↓ to go through the testbenches')}`}>
            {b.name}
          </button>
          <span className="tree-actions">
            <button onClick={() => onBenchAction(b.id, 'rename')} title={t('Rename')} aria-label={t('Rename {name}', { name: b.name })}>✎</button>
            <button onClick={() => onBenchAction(b.id, 'duplicate')} title={t('Duplicate')} aria-label={t('Duplicate {name}', { name: b.name })}>
              <Icon name="copy" size={13} />
            </button>
            <button onClick={() => onBenchAction(b.id, 'delete')} disabled={benches.length === 1} title={benches.length > 1 ? t('Delete') : t('It\'s the only testbench')} aria-label={t('Delete {name}', { name: b.name })}>
              <Icon name="trash" size={13} />
            </button>
          </span>
          <button className={`tree-runs${b.runs ? '' : ' none'}`} onClick={() => onBenchItem(b.id, 'history')} disabled={!b.runs} title={b.runs ? t('Run history') : t('No runs yet')} aria-label={t('Run history of {name}', { name: b.name })}>
            <Icon name="clock" size={13} />
            {b.runs > 0 && <span>{b.runs}</span>}
          </button>
        </div>
        {open && (
          <ul className="tree-branch">
            <li>
              <div className="tree-row tree-sub">
                <button className="tree-name" onClick={() => onBenchItem(b.id, 'sim')} title={t('Simulation settings')}>
                  <span className="tree-glyph">⚙</span> {b.detail}
                </button>
              </div>
            </li>
            <li>
              <div className="tree-row tree-sub">
                <button className="tree-caret" onClick={() => toggleIn(setOpenParams, b.id)} aria-label={pOpen ? t('Collapse {name}', { name: t('Parameters and variables') }) : t('Expand {name}', { name: t('Parameters and variables') })} aria-expanded={pOpen}>
                  {pOpen ? '▾' : '▸'}
                </button>
                <button className="tree-name" onClick={() => onBenchItem(b.id, 'params')}>
                  {t('Parameters and variables')}
                </button>
                {nVars > 0 && <span className="tree-meta">{nVars}</span>}
              </div>
              {pOpen && (
                <ul className="tree-branch">
                  {b.params.map(([k, v]) => (
                    <li key={`p:${k}`}>
                      <div className="tree-row tree-sub tree-var">
                        <button className="tree-name" onClick={() => onBenchItem(b.id, 'params')} title={t('Parameter (.param): click to edit')}>
                          <code>{k}</code> = <code>{v}</code>
                        </button>
                      </div>
                    </li>
                  ))}
                  {b.steps.map((x) => (
                    <li key={`s:${x.line}`}>
                      <div className="tree-row tree-sub tree-var">
                        <button className="tree-name" onClick={() => onBenchItem(b.id, 'study')} title={`${x.line} — ${t('swept: click to edit it in the Study')}`}>
                          <span className="tree-glyph">↻</span> <code>{x.name}</code> <span className="tree-meta">{x.line.replace(/^\s*\.step\s+(param\s+)?\S+\s*/i, '')}</span>
                        </button>
                      </div>
                    </li>
                  ))}
                  {!nVars && <li className="tree-meta tree-empty">{t('None.')}</li>}
                </ul>
              )}
            </li>
          </ul>
        )}
      </li>
    );
  };
  const [usesOf, setUsesOf] = useState('');
  const byName = new Map(subs.map((s) => [s.name.toLowerCase(), s]));
  // raíces: los que no usa ningún otro subcircuito
  const nested = new Set(subs.flatMap((s) => s.children.map((c) => c.toLowerCase())));
  const roots = subs.filter((s) => !nested.has(s.name.toLowerCase()));
  const node = (s: TreeSub, depth: number, seen: string[]): JSX.Element => (
    <li key={`${seen.join('/')}/${s.name}`}>
      <div className={`tree-row${current.toLowerCase() === s.name.toLowerCase() ? ' active' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}>
        <button
          className="tree-name"
          onClick={() => onOpen(s.name)}
          title={t('Open {name} (drag it onto the schematic to place it)', { name: s.name })}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(SUBCKT_DRAG, s.name);
            e.dataTransfer.effectAllowed = 'copy';
          }}
        >
          <span className="tree-glyph">▭</span> {s.name}
        </button>
        <span className="tree-meta">{t('{n} pins', { n: s.ports })}</span>
        <button className={`tree-uses${s.uses.length ? '' : ' none'}`} onClick={() => setUsesOf(usesOf === s.name ? '' : s.name)} title={t('Where it is used')}>
          {!s.uses.length ? t('not used') : s.uses.length === 1 ? t('used in 1') : t('used in {n}', { n: s.uses.length })}
        </button>
        <span className="tree-actions">
          <button onClick={() => onRename(s.name)} title={t('Rename')} aria-label={t('Rename {name}', { name: s.name })}>✎</button>
          <button onClick={() => onExport(s.name)} title={t('Export (.zip with its .asc and .asy, for LTspice or another project)')} aria-label={t('Export {name}', { name: s.name })}>⤓</button>
          <button onClick={() => onExportNetlist(s.name)} title={t('Export as a .sub netlist (to share it as a text subcircuit)')} aria-label={t('Export {name} as .sub', { name: s.name })}>
            .sub
          </button>
          <button onClick={() => onToUser(s.name)} title={t('Copy to My symbols and models (to use it in other projects)')} aria-label={t('Copy {name} to My symbols and models', { name: s.name })}>
            ☆
          </button>
          <button onClick={() => onDelete(s.name)} title={t('Delete')} aria-label={t('Delete {name}', { name: s.name })}>
            <Icon name="trash" size={13} />
          </button>
        </span>
      </div>
      {s.stale?.map((x, i) => (
        <div key={i} className="tree-warn" style={{ paddingLeft: 24 + depth * 14 }}>
          ⚠{' '}
          <button className="link" onClick={x.go} title={t('Go to {inst}', { inst: x.inst })}>
            {x.inst}
          </button>{' '}
          <span className="tree-meta">({x.label})</span>: {x.detail}
        </div>
      ))}
      {s.outdated && (
        <div className="tree-warn" style={{ paddingLeft: 24 + depth * 14 }}>
          {t('The ports changed.')} <button className="link" onClick={() => onUpdateSymbol(s.name)}>{t('Update symbol')}</button>
        </div>
      )}
      {usesOf === s.name && (
        <ul className="tree-usages" style={{ paddingLeft: 24 + depth * 14 }}>
          {s.uses.length ? (
            s.uses.map((u, i) => (
              <li key={i}>
                <button className="link" onClick={u.go}>
                  {u.inst}
                </button>{' '}
                <span className="tree-meta">{u.label}</span>
              </li>
            ))
          ) : (
            <li className="tree-meta">{t('Not used yet: place it with P (Project folder)')}</li>
          )}
        </ul>
      )}
      {!!s.children.length && (
        <ul>
          {s.children
            .filter((c) => !seen.includes(c.toLowerCase()))
            .map((c) => byName.get(c.toLowerCase()))
            .filter((c): c is TreeSub => !!c)
            .map((c) => node(c, depth + 1, [...seen, s.name.toLowerCase()]))}
        </ul>
      )}
    </li>
  );
  return (
    <aside className={`project-tree${peek ? ' peek' : ''}`} aria-label={t('Project')} onMouseLeave={onLeave} onKeyDown={onKey} ref={treeRef}>
      <header>
        {renamingProject ? (
          <NameInput
            value={project}
            label={t('Project name')}
            onDone={(n) => {
              setRenamingProject(false);
              if (n) onRenameProject(n);
            }}
          />
        ) : (
          <strong className="tree-project" role="button" tabIndex={0} title={t('{project} (click to rename)', { project })} style={{ cursor: 'text' }} onClick={() => setRenamingProject(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'F2') setRenamingProject(true); }}>{project}</strong>
        )}
        <button className="tree-add" onClick={onNewGroup} title={t('New workbench of testbenches')}>
          + {t('Workbench')}
        </button>
        <button className="icon-btn" onClick={onClose} title={t('Hide the project panel')} aria-label={t('Hide the project panel')}>
          <Icon name="close" size={14} />
        </button>
      </header>
      <ul className="tree-branch tree-groups">
        {groups.map((g) => {
          const fold = collapsed.has(g.id);
          const inGroup = benches.filter((b) => b.group === g.id);
          return (
            <li key={g.id}>
              <div className={`tree-row tree-group${dropOn === g.id ? ' drop' : ''}`} {...drop(g.id)}>
                <button className="tree-caret" onClick={() => toggleGroup(g.id)} aria-label={fold ? t('Expand {name}', { name: g.name }) : t('Collapse {name}', { name: g.name })} aria-expanded={!fold}>
                  {fold ? '▸' : '▾'}
                </button>
                <button className="tree-name" onClick={() => toggleGroup(g.id)}>
                  <span className="tree-glyph">▤</span> {g.name}
                </button>
                <span className="tree-actions">
                  <button onClick={() => onGroupAction(g.id, 'rename')} title={t('Rename')} aria-label={t('Rename {name}', { name: g.name })}>✎</button>
                  <button onClick={() => onGroupAction(g.id, 'delete')} disabled={groups.length < 2} title={groups.length > 1 ? t('Delete the workbench (its testbenches stay)') : t('A project always has at least one workbench')} aria-label={t('Delete {name}', { name: g.name })}>
                    <Icon name="trash" size={13} />
                  </button>
                </span>
                <button className="tree-add" onClick={() => onNewBench(g.id)} title={t('New testbench in this workbench')} aria-label={t('New testbench in {name}', { name: g.name })}>
                  + {t('Testbench')}
                </button>
              </div>
              {!fold && <ul className="tree-branch">{inGroup.length ? inGroup.map((b) => bench(b)) : <li className="tree-meta tree-empty">{t('Empty: create or drag a Testbench')}</li>}</ul>}
            </li>
          );
        })}
      </ul>
      {/* módulos (por ahora sólo subcircuitos), abajo de todo */}
      <section className="tree-modules">
        <h4>
          {t('Modules')}
          <span className="tree-adds">
            <button className="tree-add" onClick={onImport} title={t('Import subcircuits: .zip, .asc (+ .asy), .lib/.sub')}>
              {t('Import')}
            </button>
            <button className="tree-add" onClick={onFromSelection} disabled={!onFromSelection} title={t('Turn the selected components into a subcircuit (Alt+B)')}>
              {t('From selection')}
            </button>
            <button className="tree-add" onClick={onNew} title={t('New empty subcircuit')} aria-label={t('Add an empty subcircuit')}>
              + {t('New')}
            </button>
          </span>
        </h4>
        {subs.length ? <ul>{roots.map((s) => node(s, 0, []))}</ul> : <p className="tree-meta tree-empty">{t('None yet. Create an empty one, or select part of the circuit and use «From selection» (Alt+B).')}</p>}
      </section>
    </aside>
  );
}

/** Barra arriba del lienzo, adentro de un subcircuito: migas de pan para subir */
export function HierBar({ testbench, path, onCrumb, onUp, onQuick }: {
  testbench: string;
  path: Level[];
  /** -1 = testbench */
  onCrumb(i: number): void;
  onUp(): void;
  onQuick(): void;
}) {
  return (
    <div className="hier-bar">
      <nav className="hier-crumbs" aria-label={t('Hierarchy')}>
        {path[0]?.inst ? (
          <button className="link" onClick={() => onCrumb(-1)}>
            {testbench}
          </button>
        ) : (
          <span className="tree-meta" title={t('Opened from the panel: to see the values of an instance, enter it from the testbench (double-click or E)')}>
            {t('standalone')}
          </span>
        )}
        {path.map((l, i) => (
          <span key={i}>
            <span className="hier-sep">›</span>
            {i === path.length - 1 ? (
              <strong>{l.inst ? `${l.inst} (${l.sub})` : l.sub}</strong>
            ) : (
              <button className="link" onClick={() => onCrumb(i)}>
                {l.inst ? `${l.inst} (${l.sub})` : l.sub}
              </button>
            )}
          </span>
        ))}
        <button className="hier-up" onClick={onUp} title={t('Go up one level (Alt+↑)')}>
          ↑ {t('Up')}
        </button>
        <button className="hier-quick" onClick={onQuick} title={t('Go to a testbench or subcircuit (Ctrl+P)')}>
          {t('Go to…')} <kbd>{'Ctrl+P'}</kbd>
        </button>
      </nav>
    </div>
  );
}

/** Buscador rápido de testbenches y subcircuitos */
export function QuickOpen({ items, onPick, onClose }: { items: { key: string; label: string; hint: string }[]; onPick(key: string): void; onClose(): void }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((x) => x.label.toLowerCase().includes(s)) : items;
  }, [items, q]);
  const pick = (k?: string) => {
    if (k) onPick(k);
    onClose();
  };
  return (
    <div className="quick-open-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="quick-open" role="dialog" aria-label={t('Go to')}>
        <input
          ref={input}
          value={q}
          placeholder={t('Testbench or subcircuit…')}
          onChange={(e) => {
            setQ(e.target.value);
            setI(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setI((x) => Math.min(x + 1, list.length - 1));
            else if (e.key === 'ArrowUp') setI((x) => Math.max(x - 1, 0));
            else if (e.key === 'Enter') pick(list[i]?.key);
            else if (e.key === 'Escape') onClose();
            else return;
            e.preventDefault();
            e.stopPropagation();
          }}
        />
        <ul>
          {list.map((x, k) => (
            <li key={x.key}>
              <button className={k === i ? 'active' : ''} onPointerEnter={() => setI(k)} onClick={() => pick(x.key)}>
                {x.label} <span className="tree-meta">{x.hint}</span>
              </button>
            </li>
          ))}
          {!list.length && <li className="tree-meta">{t('Nothing found')}</li>}
        </ul>
      </div>
    </div>
  );
}

/** Pide un nombre (reemplaza a prompt(), que no existe en todos los navegadores) */
export function NameDialog({ title, label, initial, check, onOk, onClose }: {
  title: string;
  label: string;
  initial: string;
  /** mensaje de error, o null si el nombre sirve */
  check(name: string): string | null;
  onOk(name: string): void;
  onClose(): void;
}) {
  const [name, setName] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const err = name.trim() ? check(name.trim()) : null;
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="attrs"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && !err) onOk(name.trim());
        }}
      >
        <label>
          <span>{label}</span>
          <input ref={input} value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} />
        </label>
        {err && <p className="err-text">{err}</p>}
        <div className="buttons">
          <button type="button" onClick={onClose}>{t('Cancel')}</button>
          <button type="submit" className="primary" disabled={!name.trim() || !!err}>{t('OK')}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Parámetros (.param) y variables (.step) de un testbench (#180) */
export function BenchParamsDialog({ bench, params, variables, onApply, onStudy, onClose }: {
  bench: string;
  params: [string, string][];
  variables: { name: string; line: string }[];
  onApply(ps: [string, string][]): void;
  onStudy(): void;
  onClose(): void;
}) {
  const [rows, setRows] = useState<[string, string][]>(params.length ? params : [['', '']]);
  const bad = rows.some(([k, v]) => (k.trim() || v.trim()) && !(/^[A-Za-z_]\w*$/.test(k.trim()) && v.trim()));
  return (
    <Modal title={t('Parameters and variables · {bench}', { bench })} onClose={onClose}>
      <form
        className="attrs bench-params"
        onSubmit={(e) => {
          e.preventDefault();
          if (!bad) onApply(rows.filter(([k, v]) => k.trim() && v.trim()).map(([k, v]) => [k.trim(), v.trim()]));
        }}
      >
        <p className="hint">{t('Parameters (.param): used in the schematic as {name}.')}</p>
        <table>
          <tbody>
            {rows.map(([k, v], i) => (
              <tr key={i}>
                <td>
                  <input value={k} placeholder={t('name')} aria-label={t('Parameter name')} spellCheck={false} onChange={(e) => setRows(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
                </td>
                <td>=</td>
                <td>
                  <input value={v} placeholder={t('value')} aria-label={t('Value of {name}', { name: k })} spellCheck={false} onChange={(e) => setRows(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
                </td>
                <td>
                  <button type="button" className="icon-x" aria-label={t('Remove {name}', { name: k })} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="tree-add" onClick={() => setRows([...rows, ['', '']])}>
          + {t('Add')}
        </button>
        <p className="hint">{t('Variables (swept with .step):')}</p>
        {variables.length ? (
          <ul className="bench-vars">
            {variables.map((x) => (
              <li key={x.line}>
                <code>{x.name}</code> <span className="tree-meta">{x.line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tree-meta">{t('None.')}</p>
        )}
        <button type="button" className="link" onClick={onStudy}>
          {t('Edit sweeps in the Study…')}
        </button>
        {bad && <p className="err-text">{t('Each parameter needs a valid name and a value')}</p>}
        <div className="buttons">
          <button type="button" onClick={onClose}>{t('Cancel')}</button>
          <button type="submit" className="primary" disabled={bad}>{t('OK')}</button>
        </div>
      </form>
    </Modal>
  );
}
