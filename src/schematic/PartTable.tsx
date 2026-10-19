// Tabla de componentes de library/cmp dentro del diálogo de atributos: se busca por nombre (o
// fabricante, tipo) y muestra los parámetros relevantes de cada uno en columnas. Click elige
// el valor; doble click elige y acepta.
import { useMemo, useState } from 'react';
import { CMP_COLUMNS, cmpCell, type CmpKind, type CmpPart } from '../library/cmp.ts';

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
  const group = groups[g] ?? groups[0];
  const cols = CMP_COLUMNS[group.kind];
  const rows = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return group.parts.filter((p) => {
      const hay = [p.name, cmpCell(p, 'mfg'), cmpCell(p, 'type'), p.type].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [group, q]);
  return (
    <div className="parts">
      <div className="parts-head">
        {groups.length > 1 && (
          <div className="seg" role="radiogroup" aria-label="Lista">
            {groups.map((x, i) => (
              <label key={x.kind}>
                <input type="radio" checked={i === g} onChange={() => setG(i)} /> {x.label}
              </label>
            ))}
          </div>
        )}
        <input
          type="search"
          aria-label="Buscar en la librería"
          placeholder={`Buscar ${group.label.toLowerCase()} por nombre o fabricante`}
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
              <th>Nombre</th>
              {cols.map((c) => (
                <th key={c.key}>
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
                <td colSpan={cols.length + 1}>{group.parts.length ? 'Nada coincide con la búsqueda' : 'Todavía no hay componentes de este tipo en la librería'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
