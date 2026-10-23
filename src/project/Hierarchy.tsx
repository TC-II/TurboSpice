// Navegación entre el testbench y los subcircuitos (#180): panel de proyecto (árbol), barra con
// pestañas y migas de pan, y buscador rápido (Ctrl+P).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../schematic/dialogs.tsx';
import { Icon } from '../ui/icons.tsx';
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
}

/** Panel lateral: testbenches (variantes) y subcircuitos */
export interface TreeBench {
  id: string;
  name: string;
  /** su simulación ("Transient 0–5 ms") */
  detail: string;
  group?: string;
  /** cuántos .param tiene */
  params: number;
}

export type BenchItem = 'sim' | 'schematic' | 'params';

const COLLAPSED_KEY = 'turbospice.treeCollapsed';
const loadCollapsed = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
};

export function ProjectTree({ project, benches, groups, activeBench, subs, current, hoverReveal, peek, onHoverReveal, onBench, onTestbench, onBenchItem, onNewBench, onNewGroup, onGroupAction, onMoveBench, onBenchAction, onOpen, onNew, onFromSelection, onRename, onDelete, onUpdateSymbol, onExport, onImport, onClose, onLeave }: {
  project: string;
  benches: TreeBench[];
  groups: { id: string; name: string }[];
  activeBench: string;
  subs: TreeSub[];
  /** subcircuito abierto ('' = testbench) */
  current: string;
  /** mostrar el panel al acercar el mouse al borde (en modo selección) */
  hoverReveal: boolean;
  /** se está mostrando por acercar el mouse (encima del esquemático) */
  peek: boolean;
  onHoverReveal(on: boolean): void;
  onBench(id: string): void;
  /** volver al testbench activo (desde un subcircuito) */
  onTestbench(): void;
  /** abrir una parte de un testbench: su simulación, su esquemático o sus parámetros */
  onBenchItem(id: string, item: BenchItem): void;
  onNewBench(group?: string): void;
  onNewGroup(): void;
  onGroupAction(id: string, action: 'rename' | 'delete'): void;
  onMoveBench(id: string, group?: string): void;
  onBenchAction(id: string, action: 'rename' | 'duplicate' | 'delete'): void;
  onOpen(name: string): void;
  onNew(): void;
  /** exportar un subcircuito (.zip con su .asc y su .asy) e importar */
  onExport(name: string): void;
  onImport(): void;
  /** convertir la selección (sin selección: undefined) */
  onFromSelection?(): void;
  onRename(name: string): void;
  onDelete(name: string): void;
  onUpdateSymbol(name: string): void;
  onClose(): void;
  /** el mouse salió del panel (para esconderlo si se mostró al acercarlo) */
  onLeave(): void;
}) {
  // grupos y testbenches plegados (los testbenches arrancan plegados salvo el activo)
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [openBench, setOpenBench] = useState<Set<string>>(() => new Set([activeBench]));
  useEffect(() => setOpenBench((s) => (s.has(activeBench) ? s : new Set([...s, activeBench]))), [activeBench]);
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
  const toggleBench = (id: string) =>
    setOpenBench((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const [dragging, setDragging] = useState('');
  const [dropOn, setDropOn] = useState<string | null>(null);
  const drop = (group?: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragging) return;
      e.preventDefault();
      setDropOn(group ?? '');
    },
    onDragLeave: () => setDropOn(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragging) onMoveBench(dragging, group);
      setDragging('');
      setDropOn(null);
    },
  });
  const bench = (b: TreeBench, depth: number) => {
    const open = openBench.has(b.id);
    const active = !current && b.id === activeBench;
    const item = (it: BenchItem, glyph: string, label: string, meta?: string) => (
      <li key={it}>
        <div className="tree-row tree-sub" style={{ paddingLeft: 26 + depth * 14 }}>
          <button className="tree-name" onClick={() => onBenchItem(b.id, it)}>
            <span className="tree-glyph">{glyph}</span> {label}
          </button>
          {meta && <span className="tree-meta">{meta}</span>}
        </div>
      </li>
    );
    return (
      <li key={b.id}>
        <div
          className={`tree-row${active ? ' active' : ''}${dragging === b.id ? ' dragging' : ''}`}
          style={{ paddingLeft: 4 + depth * 14 }}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', b.name);
            setDragging(b.id);
          }}
          onDragEnd={() => (setDragging(''), setDropOn(null))}
          title={t('Drag it onto a group to move it')}
        >
          <button className="tree-caret" onClick={() => toggleBench(b.id)} aria-label={open ? t('Collapse {name}', { name: b.name }) : t('Expand {name}', { name: b.name })} aria-expanded={open}>
            {open ? '▾' : '▸'}
          </button>
          <button className="tree-name" onClick={() => (b.id === activeBench ? onTestbench() : onBench(b.id))} title={b.detail}>
            <span className="tree-glyph">{b.id === activeBench ? '●' : '○'}</span> {b.name}
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
        </div>
        {open && (
          <ul>
            {item('sim', '⚙', t('Simulation settings'), b.detail)}
            {item('schematic', '▭', t('Schematic'))}
            {item('params', '{}', t('Parameters and variables'), b.params ? String(b.params) : undefined)}
          </ul>
        )}
      </li>
    );
  };
  const loose = benches.filter((b) => !b.group || !groups.some((g) => g.id === b.group));
  const [usesOf, setUsesOf] = useState('');
  const byName = new Map(subs.map((s) => [s.name.toLowerCase(), s]));
  // raíces: los que no usa ningún otro subcircuito
  const nested = new Set(subs.flatMap((s) => s.children.map((c) => c.toLowerCase())));
  const roots = subs.filter((s) => !nested.has(s.name.toLowerCase()));
  const node = (s: TreeSub, depth: number, seen: string[]): JSX.Element => (
    <li key={`${seen.join('/')}/${s.name}`}>
      <div className={`tree-row${current.toLowerCase() === s.name.toLowerCase() ? ' active' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}>
        <button className="tree-name" onClick={() => onOpen(s.name)} title={t('Open {name}', { name: s.name })}>
          <span className="tree-glyph">▭</span> {s.name}
        </button>
        <span className="tree-meta">{t('{n} pins', { n: s.ports })}</span>
        <button className={`tree-uses${s.uses.length ? '' : ' none'}`} onClick={() => setUsesOf(usesOf === s.name ? '' : s.name)} title={t('Where it is used')}>
          {!s.uses.length ? t('not used') : s.uses.length === 1 ? t('used in 1') : t('used in {n}', { n: s.uses.length })}
        </button>
        <span className="tree-actions">
          <button onClick={() => onRename(s.name)} title={t('Rename')} aria-label={t('Rename {name}', { name: s.name })}>✎</button>
          <button onClick={() => onExport(s.name)} title={t('Export (.zip with its .asc and .asy, for LTspice or another project)')} aria-label={t('Export {name}', { name: s.name })}>⤓</button>
          <button onClick={() => onDelete(s.name)} title={t('Delete')} aria-label={t('Delete {name}', { name: s.name })}>
            <Icon name="trash" size={13} />
          </button>
        </span>
      </div>
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
            <li className="tree-meta">{t('Not used yet: place it with F2 (Project folder)')}</li>
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
    <aside className={`project-tree${peek ? ' peek' : ''}`} aria-label={t('Project')} onMouseLeave={onLeave}>
      <header>
        <strong title={project}>{project}</strong>
        <button className="icon-btn" onClick={onClose} title={t('Hide the project panel')} aria-label={t('Hide the project panel')}>
          <Icon name="close" size={14} />
        </button>
      </header>
      <label className="tree-hover">
        <input type="checkbox" checked={hoverReveal} onChange={(e) => onHoverReveal(e.target.checked)} />
        {t('Show when the mouse approaches the edge (in select mode)')}
      </label>
      <h4>
        {t('Testbenches')}
        <span className="tree-adds">
          <button className="tree-add" onClick={onNewGroup} title={t('New group of testbenches')}>
            + {t('Group')}
          </button>
          <button className="tree-add" onClick={() => onNewBench()} title={t('New empty testbench')} aria-label={t('Add an empty testbench')}>
            + {t('New')}
          </button>
        </span>
      </h4>
      <ul>
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
                <span className="tree-meta">{inGroup.length}</span>
                <span className="tree-actions">
                  <button onClick={() => onNewBench(g.id)} title={t('New testbench in this group')} aria-label={t('New testbench in {name}', { name: g.name })}>+</button>
                  <button onClick={() => onGroupAction(g.id, 'rename')} title={t('Rename')} aria-label={t('Rename {name}', { name: g.name })}>✎</button>
                  <button onClick={() => onGroupAction(g.id, 'delete')} title={t('Delete the group (its testbenches stay)')} aria-label={t('Delete {name}', { name: g.name })}>
                    <Icon name="trash" size={13} />
                  </button>
                </span>
              </div>
              {!fold && <ul>{inGroup.length ? inGroup.map((b) => bench(b, 1)) : <li className="tree-meta tree-empty tree-indent">{t('Empty: drag testbenches here')}</li>}</ul>}
            </li>
          );
        })}
      </ul>
      <ul className={`tree-loose${dropOn === '' ? ' drop' : ''}`} {...drop(undefined)}>
        {loose.map((b) => bench(b, 0))}
        {dragging && !loose.some((b) => b.id === dragging) && <li className="tree-meta tree-empty">{t('Drop here to take it out of the group')}</li>}
      </ul>
      <h4>
        {t('Subcircuits')}
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
