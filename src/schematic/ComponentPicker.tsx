// P: elegir un componente de la biblioteca. Arriba, un buscador que busca en toda la biblioteca y
// tiene siempre el cursor (la forma rápida: saberse el nombre y tipearlo); a la izquierda, las
// categorías con sus subcategorías para recorrerla sin saber los nombres; a la derecha, la vista
// previa. «Todos» es el recorrido por carpetas de siempre.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { t } from '../i18n/i18n.ts';
import { BASICS, classify } from '../library/categories.ts';
import type { Library } from '../library/library.ts';
import { lsGet, lsSet } from '../app/storage.ts';
import { Icon } from '../ui/icons.tsx';
import { SlideConfirm } from '../ui/SlideConfirm.tsx';
import { Modal, SymbolPreview } from './dialogs.tsx';
import { baseOf, dirOf, folderItems, isLegacyOpAmp, LEGACY_ALT, LEGACY_OPAMPS, matchSpans, searchLibrary, searchWords } from './pickerModel.ts';

/** La categoría que se estaba mirando la última vez */
const LAST_CATEGORY = 'turbospice.pickerCategory';
/** «Todos»: la biblioteca por carpetas */
const ALL = 'all';
/** Tope de filas de una búsqueda (con una letra coinciden casi todos) */
const MAX_RESULTS = 500;

type Row =
  | { kind: 'head'; id: string; label: string }
  | { kind: 'up' }
  | { kind: 'dir'; path: string }
  | {
      kind: 'sym';
      path: string;
      /** categoría que se muestra al lado (en la búsqueda y en «Todos») */
      chip?: string;
      /** carpeta relativa a la que se está mirando (en «Todos») */
      sub?: string;
    };

/** Que un click no saque el cursor del buscador */
const keepFocus = (e: MouseEvent) => e.preventDefault();

/** Una fila de la lista; memo: al mover el mouse sólo se redibujan las dos que cambian */
const PickerRow = memo(function PickerRow({
  row,
  index,
  active,
  words,
  lib,
  onHover,
  onChoose,
}: {
  row: Row;
  /** posición entre las filas que se pueden elegir (-1 en un encabezado) */
  index: number;
  active: boolean;
  words: string[];
  lib: Library;
  onHover(i: number): void;
  onChoose(row: Row): void;
}) {
  if (row.kind === 'head')
    return (
      <li className="picker-head" data-head={row.id} role="presentation">
        {row.label}
      </li>
    );
  return (
    <li
      className={`${active ? 'active' : ''}${row.kind !== 'sym' ? ' folder' : ''}`}
      role="option"
      aria-selected={active}
      data-active={active || undefined}
      // al mover el mouse, no al desplazar la lista con el teclado (la fila que queda debajo del
      // puntero no se adueña de la selección)
      onPointerMove={() => onHover(index)}
      onMouseDown={keepFocus}
      onClick={() => onChoose(row)}
    >
      {row.kind === 'sym' ? (
        <>
          <SymbolPreview path={row.path} lib={lib} className="thumb" />
          <span className="path">{matchSpans(baseOf(row.path), words).map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : s.text))}</span>
          <span className="desc">
            {row.sub ? `${row.sub} · ` : ''}
            {lib.symbol(row.path)?.attrs.get('Description') ?? ''}
          </span>
          {row.chip && <span className="picker-chip">{row.chip}</span>}
        </>
      ) : (
        <>
          <span className="thumb folder-icon">
            <Icon name="open" size={22} />
          </span>
          <span className="path">{row.kind === 'up' ? '..' : baseOf(row.path)}</span>
          <span className="desc">{row.kind === 'up' ? t('Up one folder') : ''}</span>
        </>
      )}
    </li>
  );
});

export function ComponentPicker({ lib, onPick, onClose }: { lib: Library; onPick(path: string): void; onClose(): void }) {
  // rutas, descripciones y categorías se leen una vez; al tipear sólo se filtra y ordena
  const all = useMemo(() => {
    const paths = lib.symbolPaths();
    const desc = new Map(paths.map((p) => [p, lib.symbol(p)?.attrs.get('Description') ?? '']));
    const cls = classify(paths);
    const sizes = new Map(cls.categories.map((c) => [c.id, new Set(cls.sections(c.id).flatMap((s) => s.paths)).size]));
    return { paths, desc, cls, sizes };
  }, [lib]);
  const { cls } = all;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(() => {
    const last = lsGet(LAST_CATEGORY);
    return last && (last === ALL || cls.categories.some((c) => c.id === last)) ? last : BASICS;
  });
  /** la búsqueda acotada a una categoría (click en la barra mientras se busca) */
  const [narrow, setNarrow] = useState<string | null>(null);
  const [dir, setDir] = useState('');
  /** fila elegida, entre las que se pueden elegir (sin los encabezados) */
  const [sel, setSel] = useState(0);
  /** la subcategoría que se ve arriba de la lista (se resalta en la barra) */
  const [spy, setSpy] = useState<string | null>(null);
  // un OpAmp sin modelo se pide confirmar deslizando (#309)
  const [legacy, setLegacy] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => lsSet(LAST_CATEGORY, cat), [cat]);

  const words = useMemo(() => searchWords(q), [q]);
  const searching = words.length > 0;
  const search = useMemo(() => (searching ? searchLibrary(all.paths, q, (p) => all.desc.get(p) ?? '', cls, narrow, cat === ALL ? dir : '') : null), [searching, all, cls, q, narrow, cat, dir]);
  const catLabel = useCallback((id: string) => cls.categories.find((c) => c.id === id)?.label ?? '', [cls]);
  const rows = useMemo((): Row[] => {
    const primaryChip = (p: string) => {
      const w = cls.primary(p);
      return w && `${w.cat.label} › ${w.sub.label}`;
    };
    if (search)
      return search.paths.slice(0, MAX_RESULTS).map((p) => ({
        kind: 'sym',
        path: p,
        chip: narrow ? cls.placements(p).find((w) => w.cat.id === narrow)?.sub.label : primaryChip(p),
      }));
    if (cat === ALL)
      return folderItems(all.paths, dir).map((it) =>
        it.kind === 'sym'
          ? {
              ...it,
              chip: primaryChip(it.path),
              sub: dirOf(it.path)
                .slice(dir ? dir.length + 1 : 0)
                .replace(/^\//, ''),
            }
          : it,
      );
    return cls.sections(cat).flatMap((s): Row[] => [{ kind: 'head', id: s.sub.id, label: s.sub.label }, ...s.paths.map((p): Row => ({ kind: 'sym', path: p }))]);
  }, [search, cat, dir, narrow, all, cls]);
  /** índice en `rows` de cada fila que se puede elegir */
  const choosable = useMemo(() => rows.flatMap((r, i) => (r.kind === 'head' ? [] : [i])), [rows]);
  const selIndex = Math.max(0, Math.min(sel, choosable.length - 1));
  const current = rows[choosable[selIndex]] as Exclude<Row, { kind: 'head' }> | undefined;
  const sections = useMemo(() => (cat === ALL ? [] : cls.sections(cat)), [cat, cls]);

  const toTop = () => list.current?.scrollTo(0, 0);
  /** al cambiar lo que se muestra: la primera fila elegida, la lista arriba */
  const reset = () => {
    setSel(0);
    setSpy(null);
    toTop();
  };
  const browse = (id: string) => {
    setCat(id);
    if (id === ALL) setDir('');
    reset();
  };
  const go = (d: string) => {
    setDir(d);
    reset();
  };
  const up = () => go(dir.split('/').slice(0, -1).join('/'));

  // la fila elegida con el teclado, siempre a la vista (antes que el salto de abajo: al cambiar de
  // categoría corre con la selección vieja, y el salto tiene que ganarle)
  useLayoutEffect(() => {
    list.current?.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' });
  }, [selIndex, rows]);

  // ir a una subcategoría (click en la barra o en un chip de la vista previa): su encabezado arriba
  // de la lista y elegido su primer componente (o `path`); se hace después de dibujar la categoría
  const jump = useRef<{ sub: string; path?: string } | null>(null);
  const [jumpTick, setJumpTick] = useState(0);
  /** el próximo evento de scroll lo causó el salto: la subcategoría resaltada es la elegida */
  const quietScroll = useRef(false);
  const jumpTo = (catId: string, sub: string, path?: string) => {
    jump.current = { sub, path };
    if (catId !== cat || searching) {
      setQ('');
      setNarrow(null);
      setCat(catId);
    }
    setJumpTick((n) => n + 1);
  };
  useLayoutEffect(() => {
    const target = jump.current;
    const ul = list.current;
    if (!target || !ul) return;
    jump.current = null;
    const head = rows.findIndex((r) => r.kind === 'head' && r.id === target.sub);
    if (head < 0) return;
    let end = rows.findIndex((r, i) => i > head && r.kind === 'head');
    if (end < 0) end = rows.length;
    const at = target.path ? rows.findIndex((r, i) => i > head && i < end && r.kind === 'sym' && r.path === target.path) : head + 1;
    setSel(Math.max(0, choosable.indexOf(at)));
    setSpy(target.sub);
    const el = ul.querySelector<HTMLElement>(`[data-head="${CSS.escape(target.sub)}"]`);
    // (una sección del final no llega hasta arriba: la lista se queda en el fondo)
    // (un encabezado pegado arriba da la posición en que está pegado: la suya es la de su primera fila)
    const next = el?.nextElementSibling as HTMLElement | null | undefined;
    const natural = el ? (next ? next.offsetTop - el.offsetHeight : el.offsetTop) : ul.scrollTop;
    const top = Math.min(natural, ul.scrollHeight - ul.clientHeight);
    if (Math.abs(top - ul.scrollTop) > 1) {
      quietScroll.current = true;
      ul.scrollTop = top;
    }
  }, [rows, choosable, jumpTick]);

  const onScroll = () => {
    const ul = list.current;
    if (!ul || searching || cat === ALL) return;
    if (quietScroll.current) {
      quietScroll.current = false;
      return;
    }
    const heads = [...ul.querySelectorAll<HTMLElement>('[data-head]')];
    // en el fondo, la última sección (su encabezado no puede llegar hasta arriba)
    if (ul.scrollTop + ul.clientHeight >= ul.scrollHeight - 2) return setSpy(heads.at(-1)?.dataset.head ?? null);
    let id: string | null = null;
    for (const h of heads) {
      if (h.offsetTop <= ul.scrollTop + 2) id = h.dataset.head ?? null;
      else break;
    }
    setSpy(id);
  };

  // estable entre renders: las filas (memo) no se redibujan al mover el mouse
  const chooseRef = useRef<(row: Row) => void>(() => {});
  chooseRef.current = (row) => {
    if (row.kind === 'up') up();
    else if (row.kind === 'dir') go(row.path);
    else if (row.kind === 'sym') {
      if (isLegacyOpAmp(row.path)) setLegacy(row.path);
      else onPick(row.path);
    }
  };
  const choose = useCallback((row: Row) => chooseRef.current(row), []);

  /** Ctrl+↑/↓: la categoría anterior o la siguiente (buscando, acota a las que tienen resultados) */
  const stepCategory = (d: 1 | -1) => {
    if (search) {
      const ids = [null, ...cls.categories.filter((c) => search.counts.get(c.id)).map((c) => c.id)];
      const i = ids.indexOf(narrow);
      setNarrow(ids[(i + d + ids.length) % ids.length]);
      reset();
    } else {
      const ids = [...cls.categories.map((c) => c.id), ALL];
      browse(ids[(ids.indexOf(cat) + d + ids.length) % ids.length]);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const move = (n: number) => {
      e.preventDefault();
      setSel(Math.max(0, Math.min(selIndex + n, choosable.length - 1)));
    };
    if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      stepCategory(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'ArrowDown') move(1);
    else if (e.key === 'ArrowUp') move(-1);
    else if (e.key === 'PageDown') move(10);
    else if (e.key === 'PageUp') move(-10);
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (current) choose(current);
    } else if (e.key === 'Backspace' && !q && cat === ALL && dir) {
      e.preventDefault();
      up();
    }
  };

  const total = search ? search.paths.length : 0;
  const preview = current?.kind === 'sym' ? current.path : null;
  const previewPlaces = preview
    ? [
        ...new Map(
          cls
            .placements(preview)
            .filter((w) => w.cat.id !== BASICS)
            .map((w) => [`${w.cat.id}/${w.sub.id}`, w]),
        ).values(),
      ]
    : [];

  return (
    <>
      <Modal title={t('Component')} onClose={onClose} className="picker-modal" hidden={!!legacy}>
        {cat === ALL && !searching && (dir === LEGACY_OPAMPS || dir.startsWith(`${LEGACY_OPAMPS}/`)) && (
          <p className="hint warn picker-legacy">
            {t('These are the SPICE default OpAmps, kept for compatibility: they have no model. For new designs use the TCLib OpAmps (OA_Ideal, OA_param, LM741, TL072…).')}{' '}
            <button type="button" className="link" onClick={() => onPick(LEGACY_ALT)}>
              {t('Use OA_Ideal')}
            </button>
          </p>
        )}
        <div className="picker-search">
          {narrow && (
            <button type="button" className="picker-narrow" onMouseDown={keepFocus} onClick={() => (setNarrow(null), reset())} title={t('Search all categories')}>
              {t('in {category}', { category: catLabel(narrow) })}
              <Icon name="close" size={12} />
            </button>
          )}
          <input
            ref={input}
            placeholder={t('Search all components (res, npn, OA_Ideal, regulator…)')}
            value={q}
            aria-label={t('Search components')}
            onChange={(e) => {
              setQ(e.target.value);
              if (!e.target.value.trim()) setNarrow(null);
              reset();
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="picker">
          <nav className="picker-side" aria-label={t('Categories')}>
            {cls.categories.map((c) => {
              const n = search ? (search.counts.get(c.id) ?? 0) : (all.sizes.get(c.id) ?? 0);
              const on = search ? narrow === c.id : cat === c.id;
              return (
                <div key={c.id} className="picker-cat-group">
                  <button
                    type="button"
                    className={`picker-cat${on ? ' on' : ''}${search && !n ? ' dim' : ''}`}
                    onMouseDown={keepFocus}
                    onClick={() => {
                      if (search) {
                        setNarrow(narrow === c.id ? null : c.id);
                        reset();
                      } else browse(c.id);
                    }}
                  >
                    <span>{c.label}</span>
                    <span className="n">{n || ''}</span>
                  </button>
                  {!search &&
                    cat === c.id &&
                    sections.map((s) => (
                      <button
                        key={s.sub.id}
                        type="button"
                        className={`picker-sub${(spy ?? sections[0]?.sub.id) === s.sub.id ? ' on' : ''}`}
                        onMouseDown={keepFocus}
                        onClick={() => jumpTo(c.id, s.sub.id)}
                      >
                        {s.sub.label}
                      </button>
                    ))}
                </div>
              );
            })}
            <hr />
            <button
              type="button"
              className={`picker-cat${search ? (narrow === null ? ' on' : '') : cat === ALL ? ' on' : ''}`}
              onMouseDown={keepFocus}
              onClick={() => {
                if (search) {
                  setNarrow(null);
                  reset();
                } else browse(ALL);
              }}
            >
              <span>{search ? t('All') : t('All (folders)')}</span>
              <span className="n">{search ? total || '' : ''}</span>
            </button>
          </nav>
          <div className="picker-list">
            {cat === ALL && !searching && (
              <div className="picker-dir">
                <button type="button" className="link" onMouseDown={keepFocus} onClick={() => go('')}>
                  {t('Library')}
                </button>
                {dir
                  .split('/')
                  .filter(Boolean)
                  .map((part, i, parts) => (
                    <span key={i}>
                      {' / '}
                      <button type="button" className="link" onMouseDown={keepFocus} onClick={() => go(parts.slice(0, i + 1).join('/'))}>
                        {part}
                      </button>
                    </span>
                  ))}
              </div>
            )}
            <ul ref={list} className={cat !== ALL && !searching ? 'sectioned' : ''} role="listbox" aria-label={t('Components')} onScroll={onScroll}>
              {rows.map((row, i) => {
                const index = row.kind === 'head' ? -1 : choosable.indexOf(i);
                return (
                  <PickerRow
                    key={row.kind === 'head' ? `head:${row.id}` : row.kind === 'up' ? '..' : `${row.kind}:${row.path}:${i}`}
                    row={row}
                    index={index}
                    active={index >= 0 && index === selIndex}
                    words={words}
                    lib={lib}
                    onHover={setSel}
                    onChoose={choose}
                  />
                );
              })}
              {searching && !rows.length && (
                <li className="picker-empty" role="presentation">
                  {narrow ? t('Nothing matches “{query}” in {category}.', { query: q.trim(), category: catLabel(narrow) }) : t('Nothing matches “{query}”.', { query: q.trim() })}
                </li>
              )}
            </ul>
          </div>
          <div className="picker-preview">
            {preview ? (
              <>
                <SymbolPreview path={preview} lib={lib} className="big" />
                <strong>{baseOf(preview)}</strong>
                <p>{all.desc.get(preview) || t('No description')}</p>
                {previewPlaces.length > 0 && (
                  <div className="picker-places">
                    {previewPlaces.map((w) => (
                      <button
                        key={`${w.cat.id}/${w.sub.id}`}
                        type="button"
                        className="picker-chip"
                        onMouseDown={keepFocus}
                        onClick={() => jumpTo(w.cat.id, w.sub.id, preview)}
                        title={t('Show in its category')}
                      >
                        {w.cat.label} › {w.sub.label}
                      </button>
                    ))}
                  </div>
                )}
                <span className="picker-folder">{t('Folder: {folder}', { folder: dirOf(preview) || t('(root)') })}</span>
              </>
            ) : (
              <div className="big" />
            )}
          </div>
        </div>
        <div className="picker-hint">{t('↑↓ select · Enter place · Ctrl+↑↓ category · Esc close')}</div>
      </Modal>
      {legacy && (
        <SlideConfirm
          title={t('{name} has no model', { name: baseOf(legacy) })}
          message={t(
            'This OpAmp is only for compatibility with old LTspice schematics: it has no model, so the simulation fails unless you import or write one. For new designs use the TCLib OpAmps.',
          )}
          action={t('Slide to use it anyway')}
          releaseLabel={t('Release to use it')}
          extra={
            <button className="primary" onClick={() => onPick(LEGACY_ALT)}>
              {t('Use OA_Ideal')}
            </button>
          }
          onConfirm={() => onPick(legacy)}
          onClose={() => setLegacy(null)}
        />
      )}
    </>
  );
}
