// Diálogos del editor: buscador de componentes, atributos, textos y etiquetas.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Logo } from '../ui/Logo.tsx';
import { Icon } from '../ui/icons.tsx';
import { PartTable, type PartGroup } from './PartTable.tsx';
import { cmpApply, type CmpPart } from '../library/cmp.ts';
import { baseName, WINDOW_ATTR, type SymbolDef, type SymbolInst, type TextWindow } from '../asc/model.ts';
import { defaultWindows, effectiveAttrs, effectiveWindows, type WindowDefaults } from '../asc/resolve.ts';
import { transformAlign } from '../asc/transform.ts';
import type { LabelPatch } from './edit.ts';
import type { Library } from '../library/library.ts';
import { localBox } from './geometry.ts';
import { LINE_STYLES } from './shapes.ts';
import { LONG_LINK } from './share.ts';
import { fromRkm, parseSpiceNumber } from '../netlist/spicenum.ts';
import { si } from '../waveform/series.ts';

const UNITS: Record<string, string> = { R: 'Ω', C: 'F', L: 'H' };

/**
 * Valor de un R, C o L: normaliza la notación 4k7 → 4.7k y dice cómo se interpreta, o avisa
 * si no parece un valor (las expresiones {…} y los parámetros "R=…" se aceptan tal cual).
 */
export function checkValue(prefix: string, value: string): { value: string; info?: string; warn?: string } {
  const unit = UNITS[prefix.toUpperCase()];
  if (!unit || !value.trim()) return { value };
  const [first, ...rest] = value.trim().split(/\s+/);
  const rkm = fromRkm(first);
  const main = rkm ?? first;
  const v = [main, ...rest].join(' ');
  if (/^\{.*\}$/.test(main) || /=/.test(main)) return { value: v };
  const x = parseSpiceNumber(main);
  if (!Number.isFinite(x)) return { value: v, warn: t('"{first}" doesn\'t look like a numeric value (e.g. 4.7k, 4k7, 10u, 1meg, {R})', { first }) };
  // "1M" es mili en SPICE: avisar, es un error clásico
  const milli = /^[\d.]+M$/.test(main) ? t(' — careful: M is milli; mega is "meg"') : '';
  return { value: v, info: `= ${si(x, 4)}${unit}${milli}` };
}
import { SymbolView } from './SchematicCanvas.tsx';
import { getLang, locale, t } from '../i18n/i18n.ts';

/** margen mínimo de los diálogos contra los bordes de la ventana */
const MODAL_MARGIN = 16;

/**
 * Diálogo modal. Todos se abren centrados en la ventana y después no se mueven: si cambian de
 * alto (otra pestaña, más o menos resultados) crecen o se achican hacia abajo, y sólo suben lo
 * necesario si dejarían de entrar (#67).
 */
export function Modal({ title, children, onClose, wide, large, hidden }: {
  title: string;
  children: ReactNode;
  onClose(): void;
  wide?: boolean;
  /** casi toda la ventana (exploradores de archivos) */
  large?: boolean;
  /** oculto mientras se elige algo en el esquemático (conserva su estado) */
  hidden?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || hidden) return;
    let tt: number | null = null;
    const place = (center: boolean) => {
      const vh = window.innerHeight;
      const h = el.offsetHeight;
      if (center || tt === null) tt = Math.max(MODAL_MARGIN, (vh - h) / 2);
      else if (tt + h > vh - MODAL_MARGIN) tt = Math.max(MODAL_MARGIN, vh - MODAL_MARGIN - h);
      setTop(tt);
    };
    place(true);
    const ro = new ResizeObserver(() => place(false));
    ro.observe(el);
    const onResize = () => place(true);
    window.addEventListener('resize', onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [hidden]);
  useEffect(() => {
    if (hidden) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, hidden]);
  return (
    <div
      className={`modal-backdrop${hidden ? ' picking' : ''}`}
      style={top !== null ? { paddingTop: top } : undefined}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={box} className={`modal${wide ? ' wide' : ''}${large ? ' large' : ''}`} role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Dibujo del símbolo (cuerpo, sin rótulos salvo `labels`), ajustado a su caja */
const SymbolPreview = memo(function SymbolPreview({ path, lib, className, labels }: { path: string; lib: Library; className: string; labels?: boolean }) {
  const def = lib.symbol(path);
  if (!def) return <svg className={className} />;
  const b = localBox(def, lib.skin(path)?.viewBox);
  const pad = Math.max(8, 0.12 * Math.max(b.x2 - b.x1, b.y2 - b.y1));
  const inst: SymbolInst = { type: path, x: 0, y: 0, orient: 'R0', windows: new Map(), attrs: new Map() };
  return (
    <svg className={`schematic-mini ${className}`} viewBox={`${b.x1 - pad} ${b.y1 - pad} ${b.x2 - b.x1 + 2 * pad} ${b.y2 - b.y1 + 2 * pad}`}>
      <g className="schematic">
        <SymbolView inst={inst} def={def} lib={lib} hideLabels={!labels} />
        {def.pins.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} className="pin-dot" />
        ))}
      </g>
    </svg>
  );
});

/** Carpetas que no aparecen en la búsqueda ni en el listado (sólo entrando a mano) */
const HIDDEN_DIRS = ['TCLib/Special/Characters'];
const hiddenIn = (path: string, dir: string) => HIDDEN_DIRS.some((h) => (path === h || path.startsWith(`${h}/`)) && !(dir === h || dir.startsWith(`${h}/`)));

/**
 * Qué tan bien coincide un componente con la búsqueda (menor = mejor; Infinity = no coincide).
 * Manda el nombre: igual, empieza con, contiene; después la carpeta y por último la descripción.
 * Con varias palabras, todas tienen que aparecer y se suman.
 */
export function searchRank(path: string, desc: string, words: string[]): number {
  const name = (path.split('/').pop() ?? path).toLowerCase();
  const dir = path.toLowerCase().slice(0, -name.length);
  const d = desc.toLowerCase();
  let rank = 0;
  for (const w of words) {
    if (name === w) rank += 0;
    else if (name.startsWith(w)) rank += 1;
    else if (name.includes(w)) rank += 2;
    else if (dir.includes(w)) rank += 3;
    else if (d.includes(w)) rank += 4;
    else return Infinity;
  }
  return rank;
}

export type PickerItem = { kind: 'up' } | { kind: 'dir'; path: string } | { kind: 'sym'; path: string; desc: string };

/**
 * Lo que muestra el explorador de componentes (F2) en la carpeta `dir` ('' = la raíz). Sin
 * búsqueda: las subcarpetas primero (se abren), después los componentes sueltos de la carpeta y,
 * más abajo, todo el contenido de sus subcarpetas. Con búsqueda: los componentes de toda la
 * librería que coinciden. Las carpetas ocultas (Characters) sólo se ven entrando a ellas.
 */
export function pickerItems(paths: string[], dir: string, query: string, descOf: (path: string) => string): PickerItem[] {
  const prefix = dir ? `${dir}/` : '';
  const visible = paths.filter((p) => !hiddenIn(p, dir));
  const sym = (p: string): PickerItem => ({ kind: 'sym', path: p, desc: descOf(p) });
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length)
    return visible
      .map((p, i) => ({ p, i, rank: searchRank(p, descOf(p), words) }))
      .filter((x) => Number.isFinite(x.rank))
      .sort((a, b) => a.rank - b.rank || a.i - b.i)
      .map((x) => sym(x.p));
  const inside = paths.filter((p) => p.startsWith(prefix));
  const dirs = [...new Set(inside.map((p) => p.slice(prefix.length)).filter((r) => r.includes('/')).map((r) => prefix + r.split('/')[0]))];
  const loose = inside.filter((p) => !p.slice(prefix.length).includes('/'));
  const nested = visible.filter((p) => p.startsWith(prefix) && p.slice(prefix.length).includes('/'));
  return [...(dir ? [{ kind: 'up' } as const] : []), ...dirs.map((d): PickerItem => ({ kind: 'dir', path: d })), ...loose.map(sym), ...nested.map(sym)];
}

/** Una fila del explorador; memo: al mover el mouse sólo se redibujan las dos que cambian */
const PickerRow = memo(function PickerRow({ it, index, active, dir, lib, onEnter, onChoose }: {
  it: PickerItem;
  index: number;
  active: boolean;
  dir: string;
  lib: Library;
  onEnter(i: number): void;
  onChoose(it: PickerItem): void;
}) {
  const name = (p: string) => p.split('/').pop() ?? p;
  // carpeta relativa a la que se está viendo (para los que están más abajo)
  const sub = it.kind === 'sym' ? it.path.slice(dir ? dir.length + 1 : 0).split('/').slice(0, -1).join('/') : '';
  return (
    <li className={`${active ? 'active' : ''}${it.kind !== 'sym' ? ' folder' : ''}`} onPointerEnter={() => onEnter(index)} onClick={() => onChoose(it)}>
      {it.kind === 'sym' ? (
        <>
          <SymbolPreview path={it.path} lib={lib} className="thumb" />
          <span className="path">{name(it.path)}</span>
          <span className="desc">{sub ? `${sub} · ` : ''}{it.desc}</span>
        </>
      ) : (
        <>
          <span className="thumb folder-icon"><Icon name="open" size={22} /></span>
          <span className="path">{it.kind === 'up' ? '..' : name(it.path)}</span>
          <span className="desc">{it.kind === 'up' ? t('Up one folder') : t('Folder')}</span>
        </>
      )}
    </li>
  );
});

/** F2: buscar y elegir un componente de la librería, o recorrerla por carpetas */
export function ComponentPicker({ lib, onPick, onClose }: { lib: Library; onPick(path: string): void; onClose(): void }) {
  const [q, setQ] = useState('');
  const [dir, setDir] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => input.current?.focus(), []);
  // rutas y descripciones se leen una vez; al tipear sólo se filtra y ordena
  const all = useMemo(() => {
    const paths = lib.symbolPaths();
    return { paths, desc: new Map(paths.map((p) => [p, lib.symbol(p)?.attrs.get('Description') ?? ''])) };
  }, [lib]);
  const items = useMemo(() => pickerItems(all.paths, dir, q, (p) => all.desc.get(p) ?? '').slice(0, 500), [q, dir, all]);
  const current = items[Math.min(sel, items.length - 1)];
  const go = (d: string) => {
    setDir(d);
    setSel(0);
    list.current?.scrollTo(0, 0);
    input.current?.focus();
  };
  const up = () => go(dir.split('/').slice(0, -1).join('/'));
  // estable entre renders: las filas (memo) no se redibujan al mover el mouse
  const chooseRef = useRef<(it: PickerItem) => void>(() => {});
  chooseRef.current = (it) => (it.kind === 'up' ? up() : it.kind === 'dir' ? go(it.path) : onPick(it.path));
  const choose = useCallback((it: PickerItem) => chooseRef.current(it), []);
  return (
    // la lista tiene alto fijo: la caja de búsqueda no se mueve mientras se escribe
    <Modal title={t('Component')} onClose={onClose} wide>
      <div className="picker">
        <div className="picker-list">
          <input
            ref={input}
            placeholder={t('Search (e.g. res, cap, OA_Ideal, npn)…')}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, items.length - 1));
              if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0));
              if (e.key === 'Enter' && current) choose(current);
              if (e.key === 'Backspace' && !q && dir) up();
            }}
          />
          {dir && !q && <div className="picker-dir">{dir}</div>}
          <ul ref={list}>
            {items.map((it, i) => (
              <PickerRow key={it.kind === 'up' ? '..' : `${it.kind}:${it.path}`} it={it} index={i} active={it === current} dir={dir} lib={lib} onEnter={setSel} onChoose={choose} />
            ))}
          </ul>
        </div>
        <div className="picker-preview">
          {current?.kind !== 'sym' && <div className="big" />}
          {current?.kind === 'sym' && (
            <>
              <SymbolPreview path={current.path} lib={lib} className="big" />
              <strong>{current.path}</strong>
              <p>{current.desc}</p>
              <p className="pins">
                {t('Pins:')}{' '}{lib.symbol(current.path)?.pins.map((p) => p.attrs.get('PinName') || '?').join(', ')}
              </p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Atributos de un componente (InstName, Value, SpiceLine…) */
interface LabelRow {
  win: number;
  attr: string;
  visible: boolean;
  /** alineación tal como se ve en el esquemático */
  align: string;
  size: number;
  /** distinto de lo que pone el símbolo (se puede volver a la posición por defecto) */
  moved: boolean;
}

const sameWin = (a: TextWindow | undefined, b: TextWindow | undefined) =>
  !!a && !!b && a.x === b.x && a.y === b.y && a.align === b.align && a.size === b.size;

/** Rótulos del componente que muestran un atributo (InstName, Value…), en orden de WINDOW */
export function labelRows(inst: SymbolInst, def: SymbolDef | undefined, table: WindowDefaults): LabelRow[] {
  if (!def) return [];
  const eff = effectiveWindows(inst, def, table);
  const dflt = defaultWindows(def, inst.orient, table);
  const attrs = effectiveAttrs(inst, def);
  const rows: LabelRow[] = [];
  for (const [win, w] of [...eff].sort((a, b) => a[0] - b[0])) {
    const attr = WINDOW_ATTR[win];
    if (!attr || !attrs.has(attr)) continue;
    const d = dflt.get(win);
    const hidden = w.align === 'Invisible';
    // un rótulo oculto se muestra con la alineación por defecto
    const local = hidden ? (d && d.align !== 'Invisible' ? d.align : 'Left') : w.align;
    rows.push({ win, attr, visible: !hidden, align: transformAlign(local, inst.orient), size: w.size, moved: !sameWin(w, d) });
  }
  return rows;
}

const PASSIVE_KINDS = new Set(['res', 'cap', 'ind', 'bead']);

/** Atributos de un componente y, a la derecha de cada uno, si su rótulo se ve en el esquemático */
export function AttributeDialog({ inst, def, windowDefaults, focusLabel, parts, onApply, onClose }: {
  inst: SymbolInst;
  def: SymbolDef | undefined;
  windowDefaults: WindowDefaults;
  /** listas de library/cmp de las que se elige el valor (transistores, diodos, capacitores…) */
  parts?: PartGroup[];
  /** rótulo desde el que se abrió (botón derecho o doble click sobre el texto) */
  focusLabel?: number;
  onApply(attrs: Record<string, string>, labels: Map<number, LabelPatch>, toSelection: boolean): void;
  onClose(): void;
}) {
  const eff = effectiveAttrs(inst, def);
  const keys = ['InstName', 'Value', 'Value2', 'SpiceLine', 'SpiceLine2', 'SpiceModel'].filter(
    (k) => k === 'InstName' || k === 'Value' || eff.has(k) || k === 'SpiceLine',
  );
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(keys.map((k) => [k, eff.get(k) ?? ''])));
  const [rows, setRows] = useState(() => labelRows(inst, def, windowDefaults));
  const [patches, setPatches] = useState(new Map<number, LabelPatch>());
  const focusAttr = rows.find((r) => r.win === focusLabel)?.attr ?? 'Value';
  const first = useRef<HTMLInputElement>(null);
  // con una tabla de la librería (transistores, diodos…) el cursor arranca en su buscador, salvo
  // que se haya abierto desde un rótulo
  const searchFirst = !!parts?.length && focusLabel === undefined;
  useEffect(() => {
    if (searchFirst) return;
    first.current?.focus();
    first.current?.select();
  }, []);
  const prefix = eff.get('Prefix') ?? '';
  const check = checkValue(prefix, vals.Value ?? '');
  const setVisible = (win: number, visible: boolean) => {
    setPatches(new Map(patches).set(win, { ...patches.get(win), visible }));
    setRows(rows.map((r) => (r.win === win ? { ...r, visible, moved: true } : r)));
  };
  // pieza elegida de la tabla: su nombre (semiconductores) o la que se eligió en esta ventana
  const [picked, setPicked] = useState<string | undefined>(() => parts?.flatMap((g) => g.parts).find((p) => p.name.toLowerCase() === (eff.get('Value') ?? '').toLowerCase())?.name);
  const pick = (p: CmpPart) => {
    const a = cmpApply(p);
    setPicked(p.name);
    const next = { ...vals, Value: a.Value, ...(a.SpiceLine !== null || p.kind !== 'res' ? { SpiceLine: a.SpiceLine ?? '' } : {}) };
    setVals(next);
    return next;
  };
  // R, L, C: la tabla de modelos de fabricante va escondida en «Avanzado» (#70), abierta si ya
  // se usa uno; en semiconductores queda a la vista
  const passive = !!parts?.length && parts.every((g) => PASSIVE_KINDS.has(g.kind));
  // (un R de la tabla sólo pone el valor: un «1k» escrito a mano es lo mismo; un C o un L deja
  // además sus parásitos en SpiceLine, y eso sí lo reconoce)
  const [partsOpen, setPartsOpen] = useState(() => {
    if (!passive) return true;
    if (picked) return true;
    const line = eff.get('SpiceLine') ?? '';
    return !!line && !!parts?.some((g) => g.parts.some((p) => {
      const a = cmpApply(p);
      return a.SpiceLine === line && a.Value.toLowerCase() === (eff.get('Value') ?? '').toLowerCase();
    }));
  });
  const table = !!parts?.length && <PartTable groups={parts} autoFocus={searchFirst} selected={picked} onPick={pick} onPickAndAccept={(p) => submit(pick(p))} />;
  const submit = (from = vals) => {
    const vals = from;
    const check = checkValue(prefix, vals.Value ?? '');
    const out = { ...vals, ...(vals.Value !== undefined ? { Value: check.value } : {}) };
    // Sólo se guardan los que cambiaron respecto al valor efectivo
    const changed = Object.fromEntries(Object.entries(out).filter(([k, v]) => v !== (eff.get(k) ?? '')));
    onApply(changed, patches, false);
  };
  return (
    <Modal title={`${baseName(inst.type)} — ${eff.get('InstName') ?? ''}`} onClose={onClose} wide={!!parts?.length && partsOpen}>
      <form
        className="attrs"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {!passive && table}
        {keys.map((k) => {
          const row = rows.find((r) => r.attr === k);
          return (
            <label key={k} className="attr-row">
              <span>{k}</span>
              <input
                ref={k === focusAttr ? first : undefined}
                value={vals[k]}
                spellCheck={false}
                onChange={(e) => (setVals({ ...vals, [k]: e.target.value }), k === 'Value' && setPicked(undefined))}
              />
              {row ? (
                <input
                  type="checkbox"
                  className="attr-vis"
                  checked={row.visible}
                  title={t('Visible on the schematic')}
                  aria-label={t('{k} visible on the schematic', { k })}
                  onChange={(e) => setVisible(row.win, e.target.checked)}
                />
              ) : (
                <span className="attr-vis" />
              )}
              {k === 'Value' && (check.warn || check.info) && <small className={check.warn ? 'hint warn' : 'hint'}>{check.warn ?? check.info}</small>}
            </label>
          );
        })}
        {passive && (
          <details className="src-adv" open={partsOpen} onToggle={(e) => setPartsOpen(e.currentTarget.open)}>
            <summary>{t('Advanced: manufacturer model')}</summary>
            {partsOpen && table}
          </details>
        )}
        {rows.length > 0 && <p className="hint">{t('Labels can be dragged with the mouse (Shift: free).')}</p>}
        {def?.attrs.get('Description') && <p className="hint">{def.attrs.get('Description')}</p>}
        <div className="buttons">
          <button type="button" onClick={onClose}>{t('Cancel')}</button>
          <button type="submit" className="primary">{t('OK')}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Texto libre: directiva SPICE (S) o comentario (T) */
export function TextDialog({ initial, kind, onApply, onClose }: {
  initial: string;
  kind: 'directive' | 'comment';
  onApply(text: string, kind: 'directive' | 'comment'): void;
  onClose(): void;
}) {
  // En el archivo los saltos de línea se guardan como "\n" literal
  const [text, setText] = useState(initial.split('\\n').join('\n'));
  const [k, setK] = useState(kind);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ta.current?.focus(), []);
  const submit = () => text.trim() && onApply(text.replace(/\r?\n/g, '\\n'), k);
  return (
    <Modal title={k === 'directive' ? t('SPICE directive') : t('Comment')} onClose={onClose}>
      <div className="textdlg">
        <div className="seg">
          <label>
            <input type="radio" checked={k === 'directive'} onChange={() => setK('directive')} /> {t('SPICE directive')}
          </label>
          <label>
            <input type="radio" checked={k === 'comment'} onChange={() => setK('comment')} /> {t('Comment')}
          </label>
        </div>
        <textarea
          ref={ta}
          rows={6}
          spellCheck={false}
          value={text}
          placeholder={k === 'directive' ? '.tran 10m\n.ac dec 100 1 1meg' : t('Text')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
          }}
        />
        <p className="hint">{t('Ctrl+Enter to accept. One directive per line.')}</p>
        <div className="buttons">
          <button type="button" onClick={onClose}>{t('Cancel')}</button>
          <button type="button" className="primary" onClick={submit}>{t('OK')}</button>
        </div>
      </div>
    </Modal>
  );
}

/** F4: nombre de red (o tierra) */
export function FlagDialog({ initial, onApply, onClose }: {
  initial: string;
  onApply(name: string): void;
  onClose(): void;
}) {
  const [name, setName] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <Modal title={t('Net name')} onClose={onClose}>
      <form
        className="attrs"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onApply(name.trim());
        }}
      >
        <label>
          <span>{t('Name')}</span>
          <input ref={input} value={name} spellCheck={false} onChange={(e) => setName(e.target.value.replace(/\s/g, ''))} />
        </label>
        <div className="buttons">
          <button type="button" onClick={onClose}>{t('Cancel')}</button>
          <button type="submit" className="primary">{t('OK')}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Estilo de línea de las figuras (Dibujar › Estilo de línea, doble click en una figura) */
export function LineStyleDialog({ initial, count, onApply, onClose }: {
  initial: string;
  /** figuras seleccionadas a las que se aplica (0: sólo las que se dibujen después) */
  count: number;
  onApply(style: string): void;
  onClose(): void;
}) {
  const [style, setStyle] = useState(initial);
  return (
    <Modal title={t('Line style')} onClose={onClose}>
      <form
        className="attrs line-styles"
        onSubmit={(e) => {
          e.preventDefault();
          onApply(style);
        }}
      >
        <p className="hint">
          {count ? t('Applies to {p0} and to the ones drawn afterwards.', { p0: count === 1 ? t('the selected shape') : t('the {count} selected shapes', { count }) }) : t('Applies to the shapes that get drawn.')}
        </p>
        {LINE_STYLES.map((ls) => (
          <label key={ls.value} className="line-style">
            <input type="radio" name="line-style" checked={style === ls.value} onChange={() => setStyle(ls.value)} autoFocus={style === ls.value} />
            <svg width="96" height="12" aria-hidden="true">
              <line x1="4" y1="6" x2="92" y2="6" stroke="currentColor" strokeWidth="1.6" strokeDasharray={ls.dash} />
            </svg>
            <span>{ls.label}</span>
          </label>
        ))}
        <div className="buttons">
          <button type="button" onClick={onClose}>{t('Cancel')}</button>
          <button type="submit" className="primary">{t('OK')}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Link para compartir el circuito: se copia al portapapeles al abrir */
export function ShareDialog({ url, onClose }: { url: string; onClose(): void }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const copy = () =>
    navigator.clipboard.writeText(url).then(
      () => setCopied(true),
      () => {
        setCopied(false);
        input.current?.select();
      },
    );
  useEffect(() => {
    input.current?.select();
    copy();
  }, []);
  // el circuito comprimido es el parámetro c= del hash (base64url: 4 caracteres por 3 bytes)
  const packed = new URLSearchParams(url.slice(url.indexOf('#') + 1)).get('c') ?? '';
  const bytes = Math.floor((packed.length * 3) / 4);
  return (
    <Modal title={t('Share circuit')} onClose={onClose}>
      <div className="textdlg">
        <input ref={input} readOnly value={url} aria-label={t('Link')} onFocus={(e) => e.target.select()} />
        <p className="hint">{t('The link holds the whole circuit compressed in')}{' '}{t('{n} bytes.', { n: bytes.toLocaleString(locale()) })}</p>
        {copied ? (
          <p className="hint ok"><span aria-hidden="true">✓</span> {t('Link copied to the clipboard')}</p>
        ) : copied === false ? (
          <p className="hint">{t('Copy the link with Ctrl+C.')}</p>
        ) : null}
        {url.length > LONG_LINK && <p className="hint warn">{t('It\'s a long link: some chats or e-mails may cut it.')}</p>}
        <div className="buttons">
          <button type="button" onClick={copy}>{t('Copy')}</button>
          <button type="button" className="primary" onClick={onClose}>{t('Ready')}</button>
        </div>
      </div>
    </Modal>
  );
}

// Los de la configuración de LTspice que usamos (LTspice.ini): dependen de dónde está el mouse
const SHORTCUTS: [string, [string, string][]][] = [
  [
    t('Schematic'),
    [
      ['P · F2', t('Component (browser)')],
      ['R · C · L · D · V · I', t('Resistor, capacitor, inductor, diode, voltage source, current source')],
      ['G', t('Ground')],
      ['W · F3', t('Wire (right-click or Esc finishes)')],
      ['N · F4', t('Net label')],
      ['. · T', t('SPICE directive · comment')],
      ['J · K · O · U', t('Line · rectangle · circle · arc (decorative)')],
      ['M', t('Move: click an element (or a box); it follows the cursor until the next click; wires don\'t stretch')],
      ['S', t('Drag: like M, but wires stretch')],
      ['Del · Backspace', t('Delete the selection (no selection: delete mode, by click or box)')],
      ['Ctrl+C · Ctrl+X · Ctrl+V', t('Copy · cut · paste (also between tabs)')],
      ['Ctrl+A', t('Select all')],
      ['Ctrl+R · Ctrl+E', t('Rotate · mirror')],
      ['Ctrl+Z · Ctrl+Shift+Z', t('Undo · redo (also Ctrl+Y)')],
      [t('Drag'), t('Move (wires follow); with Ctrl, without dragging wires')],
      [t('Repeated click'), t('Cycles through overlapping elements')],
      [t('Drag a label'), t('Moves the InstName/Value of a selected component')],
      [t('Wheel'), 'Zoom'],
      [t('Middle button · right button · Space+drag'), t('Pan')],
      [t('Space · Home'), t('Fit to view')],
      ['Z · Shift+Z', t('Zoom to a box · previous zoom')],
      ['Ctrl+G · Ctrl+U', t('Show/hide the grid · the unconnected pin marks')],
      ['Alt+N', t('Show the net names')],
      ['A · Alt+E · Alt+C', t('Simulation command · study · .control block')],
      ['Alt+R · Ctrl+Enter', t('Simulate')],
      ['Alt+S', t('Abort the simulation')],
      ['Ctrl+L', t('View the simulation log (or problems)')],
      ['Ctrl+S · Ctrl+Shift+S · Ctrl+O', t('Save · save as · open')],
      ['Ctrl+1 · Ctrl+0', t('Show · hide the results panel')],
      ['F7 · F8 · Esc', t('Back to the selection tool')],
      ['?', t('This help')],
    ],
  ],
  [
    t('Results viewer (with the mouse over the plots)'),
    [
      [t('Space'), t('Fit (see everything)')],
      ['Z · Shift+Z', t('Zoom to a box (X and Y) · previous zoom')],
      ['Ctrl+Y', t('Vertical autoscale')],
      ['Ctrl+G', t('Show/hide the grid')],
      ['A', t('Add trace (expression field, with autocomplete)')],
      ['P · B', t('Add pane · add pane below the active one')],
      ['U · D', t('Move the active pane up · down')],
      ['Backspace', t('Remove traces: click the name (Esc finishes)')],
      ['C · Shift+C', t('Cursors · clear the cursors')],
      ['Shift+S', t('Choose which runs of a .step to show')],
      [t('O · Ctrl+Space'), t('Open a .plt view · apply the remembered view again')],
      ['Ctrl+Z · Ctrl+Shift+Z', t('Undo · redo the view changes (traces, panes, colors)')],
      ['Alt+R · Alt+S · Ctrl+L', t('Simulate · abort · log')],
    ],
  ],
  [
    t('Netlist mode'),
    [
      ['Alt+R · Ctrl+Enter', t('Simulate')],
      ['Alt+S', t('Abort')],
      ['Ctrl+L', t('View the log')],
      ['Ctrl+G', t('Go to a line')],
    ],
  ],
];

export function HelpDialog({ onClose }: { onClose(): void }) {
  return (
    <Modal title={t('Keyboard shortcuts')} onClose={onClose} wide>
      {SHORTCUTS.map(([section, rows]) => (
        <section key={section}>
          <h3>{section}</h3>
          <table className="shortcuts">
            <tbody>
              {rows.map(([k, d]) => (
                <tr key={k}>
                  <th>
                    {k.split(' · ').map((x, i) => (
                      <span key={i}>
                        {i > 0 && ' · '}
                        <kbd>{x}</kbd>
                      </span>
                    ))}
                  </th>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <p className="hint">{t('On touch screens: pinch to zoom, two fingers to pan, long-press to edit.')}</p>
      <div className="buttons">
        <button className="primary" onClick={onClose}>{t('Close')}</button>
      </div>
    </Modal>
  );
}

/** Shift+S en el visor: qué corridas de un .step se muestran */
export function RunsDialog({ runs, hidden, onApply, onClose }: {
  runs: { name: string; label: string }[];
  hidden: Set<string>;
  onApply(hidden: Set<string>): void;
  onClose(): void;
}) {
  const [off, setOff] = useState(() => new Set(hidden));
  const toggle = (name: string) => {
    const next = new Set(off);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setOff(next);
  };
  return (
    <Modal title={t('Runs to show')} onClose={onClose}>
      <div className="runs-list">
        {runs.map((r) => (
          <label key={r.name} className="check">
            <input type="checkbox" checked={!off.has(r.name)} onChange={() => toggle(r.name)} /> {r.label}
          </label>
        ))}
      </div>
      <div className="buttons">
        <button onClick={() => setOff(new Set())}>{t('All')}</button>
        <button onClick={() => setOff(new Set(runs.map((r) => r.name)))}>{t('None')}</button>
        <button onClick={onClose}>{t('Cancel')}</button>
        <button className="primary" disabled={off.size === runs.length} onClick={() => onApply(off)}>
          {t('OK')}
        </button>
      </div>
    </Modal>
  );
}

export function AboutDialog({ repo, onClose }: { repo: string; onClose(): void }) {
  return (
    <Modal title={t('About TurboSpice')} onClose={onClose}>
      <div className="welcome about">
        <h3><Logo size={28} /> <span><span className="logo">Turbo</span>Spice</span></h3>
        <p>
          {t('Circuit simulator that runs the')}{' '}<strong>ngspice</strong>{' '}{t('engine, compiled in WebAssembly. Compatible with LTspice .ASC file format.')}
        </p>
        <p>{t('Designed and developed by Agustín Gullino and Javier Petrucci.')}</p>
        <p className="about-links">
          <a href={repo} target="_blank" rel="noopener noreferrer">{t('Source code and bug reports')}</a>
          <a href={getLang() === 'es' ? 'privacidad.html' : 'privacy.html'} target="_blank" rel="noopener noreferrer">{t('Privacy policy')}</a>
        </p>
      </div>
      <div className="buttons">
        <button className="primary" onClick={onClose}>{t('Close')}</button>
      </div>
    </Modal>
  );
}

/** Archivo › Importar en este proyecto: qué se puede traer y cómo armar el .zip, antes de elegir */
export function ImportInfoDialog({ onChoose, onClose }: { onChoose(): void; onClose(): void }) {
  return (
    <Modal title={t('Open / Import')} onClose={onClose} wide>
      <div className="import-info">
        <p>{t('Everything you import is added to the open project; nothing is replaced.')}</p>
        <ul>
          <li><strong>.turbo</strong> — {t('a TurboSpice project: it opens in place of the current one.')}</li>
          <li><strong>.zip</strong> — {t('the best way to bring a whole LTspice project. Each')}{' '}<code>.asc</code>{' '}{t('in it becomes a testbench. The')}{' '}<code>.asy</code>, <code>.lib</code>, <code>.sub</code>{' '}{t('anywhere in the .zip go to the project files.')}</li>
          <li><strong>.asc</strong> — {t('loose schematics: each one becomes a testbench.')}</li>
          <li><strong>{'.asy · .lib · .sub · .mod'}</strong> — {t('symbols and models: they go to the project files and apply to all its testbenches.')}</li>
        </ul>
        <p className="hint">
          {t('To build the .zip: put one .asc per testbench, and add the symbols and models the circuits use that are not in the standard library. Then compress the whole folder.')}
        </p>
      </div>
      <div className="buttons">
        <button onClick={onClose}>{t('Cancel')}</button>
        <button className="primary" onClick={onChoose} autoFocus>{t('Choose files…')}</button>
      </div>
    </Modal>
  );
}

export interface UserFileInfo {
  name: string;
  kind: 'symbol' | 'model' | 'schematic';
  /** .subckt definidos (modelos) o puertos (bloques) */
  items: string[];
}

/** Símbolos, modelos y bloques propios del usuario (guardados en el navegador) */
export function UserFilesDialog({ files, hasSymbol, onAdd, onRemove, onMakeSymbol, onClose, project }: {
  files: UserFileInfo[];
  /** los del proyecto (#155): se guardan en el .turbo, sin bloques .asc */
  project?: string;
  hasSymbol(name: string): boolean;
  onAdd(files: File[]): void;
  onRemove(name: string): void;
  onMakeSymbol(file: string, name: string): void;
  onClose(): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const section = (kind: UserFileInfo['kind'], title: string, empty: string) => {
    const list = files.filter((f) => f.kind === kind);
    return (
      <section className="userfiles-section">
        <h3>{title}</h3>
        {list.length ? (
          <ul>
            {list.map((f) => (
              <li key={f.name}>
                <div className="uf-head">
                  <code>{f.name}</code>
                  <button className="danger small" onClick={() => onRemove(f.name)} aria-label={t('Remove {name}', { name: f.name })}>{t('Remove')}</button>
                </div>
                {kind === 'model' && f.items.length > 0 && (
                  <div className="uf-items">
                    {f.items.map((sub) =>
                      hasSymbol(sub) ? (
                        <span key={sub} className="uf-done" title={t('There\'s already a symbol with this name')}>✓ {sub}</span>
                      ) : (
                        <button key={sub} onClick={() => onMakeSymbol(f.name, sub)} title={t('Create a symbol for subcircuit {sub}', { sub })}>
                          {t('Create symbol for')}{' '}{sub}
                        </button>
                      ),
                    )}
                  </div>
                )}
                {kind === 'schematic' && (
                  <div className="uf-items">
                    <span className="hint">{t('Ports:')}{' '}{f.items.join(', ') || t('(no labels)')}</span>
                    {hasSymbol(f.name.replace(/\.asc$/i, '')) ? (
                      <span className="uf-done">{t('✓ block symbol')}</span>
                    ) : (
                      <button onClick={() => onMakeSymbol(f.name, f.name.replace(/\.asc$/i, ''))}>{t('Create block symbol')}</button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">{empty}</p>
        )}
      </section>
    );
  };
  return (
    <Modal title={project ? t('Project files «{project}»', { project }) : t('My symbols and models')} onClose={onClose} wide>
      {project ? (
        <p className="hint">
          {t('They\'re saved inside the project (.turbo) and apply to all its variants; they take precedence over «My symbols and models» and over the library. Symbols (')}<code>.asy</code>{t(') show up in the component browser (F2) under «Project»; models (')}
          <code>.lib</code>, <code>.sub</code>, <code>.mod</code>{t(') are used when simulating as if they were next to the')}{' '}<code>.asc</code>.
        </p>
      ) : (
      <p className="hint">
        {t('Shared by all your projects. Signed in with Google, they are saved in your Drive (TurboSpice › My symbols and models.json); otherwise, in this browser. Symbols (')}<code>.asy</code>{t(') show up in the component browser (F2); models (')}<code>.lib</code>,{' '}
        <code>.sub</code>, <code>.mod</code>{t(') are used when simulating as if they were next to the')}{' '}<code>.asc</code>{t('; an')}{' '}<code>.asc</code> {t('with its block symbol is used as a subcircuit (hierarchy, like in LTspice).')}
      </p>
      )}
      <div className="buttons left">
        <button className="primary" onClick={() => input.current?.click()}>{t('Add files…')}</button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={project ? '.asy,.lib,.sub,.mod,.inc,.cir,.txt,.lb' : '.asy,.lib,.sub,.mod,.inc,.cir,.txt,.lb,.asc'}
          aria-label={t('Symbol and model files')}
          onChange={(e) => {
            if (e.target.files?.length) onAdd([...e.target.files]);
            e.target.value = '';
          }}
        />
      </div>
      {section('symbol', t('Symbols'), t('None yet.'))}
      {section('model', t('Models and subcircuits'), t('None yet.'))}
      {!project && section('schematic', t('Hierarchical blocks (.asc)'), t('None yet.'))}
      <div className="buttons">
        <button className="primary" onClick={onClose}>{t('Close')}</button>
      </div>
    </Modal>
  );
}
