// Resultados sin eje X: tabla ordenable (.op, .tf, .sens, ruido integrado); el plano s (.pz) está en PzPlane.
import { useMemo, useState } from 'react';
import type { SimPlot } from '../engine/ngspice.ts';
import { vectorExpr } from '../sim/traces.ts';
import { complexText } from './pz.ts';
import { si } from './series.ts';
import { t } from '../i18n/i18n.ts';

/** Tabla de valores escalares; ordenable por nombre o por |valor|, con filtro. Las filas se
 * reparten en dos columnas; pasar el mouse por una avisa qué vector es (para resaltarlo en el esquemático) */
export function ResultTable({ plot, onHoverRow }: { plot: SimPlot; onHoverRow?: (expr: string | null) => void }) {
  const [sort, setSort] = useState<'name' | 'abs'>(/^sens/i.test(plot.name) ? 'abs' : 'name');
  const [filter, setFilter] = useState('');
  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = plot.vectors
      .map((v) => ({ name: vectorExpr(v), raw: v.name, v, mag: Math.max(...Array.from(v.real, (re, i) => Math.hypot(re, v.imag?.[i] ?? 0))) }))
      .filter((r) => !f || r.name.toLowerCase().includes(f));
    return sort === 'abs' ? list.sort((a, b) => b.mag - a.mag) : list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [plot, sort, filter]);
  const half = Math.ceil(rows.length / 2);
  // la flechita de orden ocupa siempre su lugar: al ordenar no cambia el ancho de las columnas
  const arrow = (on: boolean) => <span className="sort-mark" aria-hidden={!on}>{on ? '▾' : ''}</span>;
  const table = (part: typeof rows) => (
    <div className="pz-table">
      <table>
        <thead>
          <tr>
            <th>
              <button className="sort" onClick={() => setSort('name')}>{t('Name')}{arrow(sort === 'name')}</button>
            </th>
            <th className="num">
              <button className="sort" title={t('Sort by |x|')} onClick={() => setSort('abs')}>{t('Value')}{arrow(sort === 'abs')}</button>
            </th>
          </tr>
        </thead>
        <tbody onMouseLeave={() => onHoverRow?.(null)}>
          {part.map(({ name, raw, v }) => (
            <tr key={raw} onMouseEnter={() => onHoverRow?.(name)}>
              <th title={raw}>{name}</th>
              <td className="num">{Array.from(v.real, (re, i) => (v.imag ? complexText(re, v.imag[i]) : si(re))).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="result-table">
      <div className="plot-tools">
        <input className="filter" placeholder={t('Filter…')} aria-label={t('Filter')} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="hint">{rows.length} {t('of')}{' '}{plot.vectors.length}</span>
      </div>
      <div className="result-cols">
        {table(rows.slice(0, half))}
        {rows.length > 1 && table(rows.slice(half))}
      </div>
    </div>
  );
}

export { isPzPlot, pzRuns } from './pz.ts';
export { PzPlane } from './PzPlane.tsx';
