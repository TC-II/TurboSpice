// Tabla de componentes de library/cmp dentro del diálogo de atributos: se busca por nombre (o
// fabricante, tipo) y muestra los parámetros relevantes de cada uno en columnas. Click elige
// el valor; doble click elige y acepta. Click en un encabezado ordena por esa columna
// (ascendente, y alternando con cada click).
import { useMemo, useState } from 'react';
import { CMP_COLUMNS, cmpCell, compareCells, type CmpKind, type CmpPart } from '../library/cmp.ts';
import { t } from '../i18n/i18n.ts';

export interface PartGroup {
  kind: CmpKind;
  label: string;
  parts: CmpPart[];
}

export function PartTable({ groups, selected, onPick, onPickAndAccept }: {
  groups: PartGroup[];
  /** nombre de la pieza elegida (para resaltar su fila) */
  selected?: string;
  onPick(p: CmpPart): void;
  onPickAndAccept(p: CmpPart): void;
}) {
  const [g, setG] = useState(() => Math.max(0, groups.findIndex((x) => x.parts.some((p) => p.name === selected))));
  const [q, setQ] = useState('');
  // columna por la que se ordena ('' = el nombre) y sentido; sin orden, el de la librería
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const sortBy = (key: string) => setSort((s) => ({ key, dir: s?.key === key ? (-s.dir as 1 | -1) : 1 }));
  const ariaSort = (key: string) => (sort?.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined);
  const group = groups[g] ?? groups[0];
  const cols = CMP_COLUMNS[group.kind];
  const rows = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const found = group.parts.filter((p) => {
      const hay = [p.name, cmpCell(p, 'mfg'), cmpCell(p, 'type'), p.type].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    if (!sort) return found;
    const cell = (p: CmpPart) => (sort.key ? cmpCell(p, sort.key) : p.name);
    return [...found].sort((a, b) => compareCells(cell(a), cell(b), sort.dir));
  }, [group, q, sort]);
  return (
    <div className="parts">
      <div className="parts-head">
        {groups.length > 1 && (
          <div className="seg" role="radiogroup" aria-label={t('List')}>
            {groups.map((x, i) => (
              <label key={x.kind}>
                <input type="radio" checked={i === g} onChange={() => setG(i)} /> {x.label}
              </label>
            ))}
          </div>
        )}
        <input
          type="search"
          aria-label={t('Search the library')}
          placeholder={t('Search {p0} by name or manufacturer', { p0: group.label.toLowerCase() })}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          // Enter en el buscador elige la primera fila (no acepta el diálogo)
          onKeyDown={(e) => {
            if (e.key === 'Enter' && rows.length) {
              e.preventDefault();
              onPick(rows[0]);
            }
          }}
        />
      </div>
      <div className="parts-table">
        <table>
          <thead>
            <tr>
              <th className="sortable" aria-sort={ariaSort('')} onClick={() => sortBy('')}>{t('Name')}</th>
              {cols.map((c) => (
                <th key={c.key} className="sortable" aria-sort={ariaSort(c.key)} onClick={() => sortBy(c.key)}>
                  {c.label}
                  {c.unit && <span className="unit"> [{c.unit}]</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.name}
                className={p.name === selected ? 'on' : ''}
                aria-selected={p.name === selected}
                onClick={() => onPick(p)}
                onDoubleClick={() => onPickAndAccept(p)}
              >
                <td>{p.name}</td>
                {cols.map((c) => (
                  <td key={c.key}>{cmpCell(p, c.key)}</td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr className="empty">
                <td colSpan={cols.length + 1}>{group.parts.length ? t('Nothing matches the search') : t('There are no components of this type in the library yet')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
