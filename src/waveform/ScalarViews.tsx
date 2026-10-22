// Resultados sin eje X: tabla ordenable (.op, .tf, .sens, ruido integrado); el plano s (.pz) está en PzPlane.
import { useMemo, useState } from 'react';
import type { SimPlot } from '../engine/ngspice.ts';
import { vectorExpr } from '../sim/traces.ts';
import { complexText } from './pz.ts';
import { si } from './series.ts';
import { t } from '../i18n/i18n.ts';

/** Tabla de valores escalares; ordenable por nombre o por |valor|, con filtro */
export function ResultTable({ plot }: { plot: SimPlot }) {
  const [sort, setSort] = useState<'name' | 'abs'>(/^sens/i.test(plot.name) ? 'abs' : 'name');
  const [hideZero, setHideZero] = useState(/^sens/i.test(plot.name));
  const [filter, setFilter] = useState('');
  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = plot.vectors
      .map((v) => ({ name: vectorExpr(v), raw: v.name, v, mag: Math.max(...Array.from(v.real, (re, i) => Math.hypot(re, v.imag?.[i] ?? 0))) }))
      .filter((r) => (!hideZero || r.mag !== 0) && (!f || r.name.toLowerCase().includes(f)));
    return sort === 'abs' ? list.sort((a, b) => b.mag - a.mag) : list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [plot, sort, hideZero, filter]);
  return (
    <div className="result-table">
      <div className="plot-tools">
        <input className="filter" placeholder={t('Filter…')} aria-label={t('Filter')} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <label className="check inline">
          <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} /> {t('Hide zeros')}
        </label>
        <span className="hint">{rows.length} {t('of')}{' '}{plot.vectors.length}</span>
      </div>
      <table className="scalars">
        <thead>
          <tr>
            <th>
              <button className="sort" onClick={() => setSort('name')}>{t('Name')}{sort === 'name' ? ' ▾' : ''}</button>
            </th>
            <th>
              <button className="sort" onClick={() => setSort('abs')}>{t('Value')}{sort === 'abs' ? ' (|x| ▾)' : ''}</button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ name, raw, v }) => (
            <tr key={raw}>
              <th title={raw}>{name}</th>
              <td>{Array.from(v.real, (re, i) => (v.imag ? complexText(re, v.imag[i]) : si(re))).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { isPzPlot, pzRuns } from './pz.ts';
export { PzPlane } from './PzPlane.tsx';
