// Resultados sin eje X: tabla ordenable (.op, .tf, .sens, ruido integrado); el plano s (.pz) está en PzPlane.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { SimPlot } from '../engine/ngspice.ts';
import { deviceParams, parseDeviceVector } from '../sim/deviceParams.ts';
import { vectorExpr } from '../sim/traces.ts';
import { complexText } from './pz.ts';
import { si } from './series.ts';
import { t } from '../i18n/i18n.ts';

/** Tabla de valores escalares; ordenable por nombre o por |valor|, con filtro. Las filas se
 * reparten en columnas (hasta `maxCols`, las que entren en el ancho del panel); pasar el mouse por una avisa qué vector es (para resaltarlo en el esquemático) */
export function ResultTable({ plot, maxCols = 2, onHoverRow, highlightDevice }: { plot: SimPlot; maxCols?: number; onHoverRow?: (expr: string | null) => void; highlightDevice?: string }) {
  const box = useRef<HTMLDivElement>(null);
  // el componente bajo el mouse en el esquemático: sus filas se resaltan y la primera se muestra
  const hl = highlightDevice?.toUpperCase();
  useEffect(() => {
    if (hl) box.current?.querySelector('tr.hl')?.scrollIntoView({ block: 'nearest' });
  }, [hl]);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // cada columna necesita ~260 px para que nombre y valor no se aprieten
  const cols = Math.max(1, Math.min(maxCols, Math.floor((width + 12) / 272) || 1));
  const [sort, setSort] = useState<'name' | 'abs'>(/^sens/i.test(plot.name) ? 'abs' : 'name');
  const [filter, setFilter] = useState('');
  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = plot.vectors
      .map((v) => ({ name: vectorExpr(v), raw: v.name, v, mag: Math.max(...Array.from(v.real, (re, i) => Math.hypot(re, v.imag?.[i] ?? 0))) }))
      // (un parámetro de dispositivo que el modelo no calcula, p. ej. vth en un MOSFET nivel 1, no se lista)
      .filter((r) => !parseDeviceVector(r.raw) || Number.isFinite(r.mag))
      .filter((r) => !f || r.name.toLowerCase().includes(f));
    return sort === 'abs' ? list.sort((a, b) => b.mag - a.mag) : list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [plot, sort, filter]);
  const per = Math.ceil(rows.length / cols) || 1;
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
            <tr key={raw} className={hl && rowDevice(name) === hl ? 'hl' : undefined} onMouseEnter={() => onHoverRow?.(name)}>
              <th title={paramTitle(raw)}>{name}</th>
              <td className="num">{Array.from(v.real, (re, i) => (v.imag ? complexText(re, v.imag[i]) : si(re))).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="result-table" ref={box}>
      <div className="plot-tools">
        <input className="filter" placeholder={t('Filter…')} aria-label={t('Filter')} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="hint">{rows.length} {t('of')}{' '}{plot.vectors.length}</span>
      </div>
      <div className="result-cols">
        {Array.from({ length: Math.min(cols, Math.ceil(rows.length / per) || 1) }, (_, k) => (
          <Fragment key={k}>{table(rows.slice(k * per, (k + 1) * per))}</Fragment>
        ))}
      </div>
    </div>
  );
}

/** Componente de una fila: "@Q1[gm]", "Ic(Q1)", "I(R1)" → "Q1"; null si no es de un componente */
export function rowDevice(expr: string): string | null {
  const m = /^@([^[\]\s]+)\[\w+\]$/.exec(expr) ?? /^I[a-z]?\(([^,()]+)\)$/i.exec(expr);
  return m ? m[1].toUpperCase() : null;
}

/** Vector y, si es un parámetro de dispositivo (@q1[gm]), qué es */
function paramTitle(raw: string): string {
  const d = parseDeviceVector(raw);
  const label = d && deviceParams(d.device).find((p) => p.name === d.param.toLowerCase())?.label;
  return label ? `${raw} — ${label}` : raw;
}

export { isPzPlot, pzRuns } from './pz.ts';
export { PzPlane } from './PzPlane.tsx';
