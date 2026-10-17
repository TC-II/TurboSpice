// Resultados sin eje X: tabla ordenable (.op, .tf, .sens, ruido integrado) y plano s (.pz).
import { useMemo, useState } from 'react';
import type { SimPlot } from '../engine/ngspice.ts';
import { vectorExpr } from '../sim/traces.ts';
import { si } from './series.ts';

const complexText = (re: number, im: number) => `${si(re)} ${im < 0 ? '−' : '+'} j${si(Math.abs(im))}`;

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
        <input className="filter" placeholder="Filtrar…" aria-label="Filtrar" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <label className="check inline">
          <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} /> Ocultar ceros
        </label>
        <span className="hint">{rows.length} de {plot.vectors.length}</span>
      </div>
      <table className="scalars">
        <thead>
          <tr>
            <th>
              <button className="sort" onClick={() => setSort('name')}>Nombre{sort === 'name' ? ' ▾' : ''}</button>
            </th>
            <th>
              <button className="sort" onClick={() => setSort('abs')}>Valor{sort === 'abs' ? ' (|x| ▾)' : ''}</button>
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

interface Root {
  kind: 'pole' | 'zero';
  name: string;
  re: number;
  im: number;
}

export const isPzPlot = (p: SimPlot) => p.vectors.some((v) => /^(pole|zero)\(\d+\)$/i.test(v.name));

/** Polos (×) y ceros (○) en el plano s, con frecuencia natural y Q */
export function PzPlane({ plot }: { plot: SimPlot }) {
  const roots: Root[] = plot.vectors
    .filter((v) => /^(pole|zero)\(\d+\)$/i.test(v.name))
    .flatMap((v) => Array.from(v.real, (re, i) => ({ kind: (/^pole/i.test(v.name) ? 'pole' : 'zero') as Root['kind'], name: v.name, re, im: v.imag?.[i] ?? 0 })))
    .sort((a, b) => (a.kind === b.kind ? Math.hypot(a.re, a.im) - Math.hypot(b.re, b.im) : a.kind === 'pole' ? -1 : 1));
  const span = Math.max(1, ...roots.map((r) => Math.max(Math.abs(r.re), Math.abs(r.im)))) * 1.25;
  const W = 300;
  const s = W / 2 / span;
  const px = (re: number) => W / 2 + re * s;
  const py = (im: number) => W / 2 - im * s;
  return (
    <div className="pz-view">
      <svg className="pz-plane" viewBox={`0 0 ${W} ${W}`} role="img" aria-label="Plano s">
        <line x1={0} y1={W / 2} x2={W} y2={W / 2} className="axis" />
        <line x1={W / 2} y1={0} x2={W / 2} y2={W} className="axis" />
        <text x={W - 4} y={W / 2 - 4} textAnchor="end">σ</text>
        <text x={W / 2 + 4} y={12}>jω</text>
        <text x={W - 4} y={W / 2 + 14} textAnchor="end">{si(span)}</text>
        {roots.map((r, i) =>
          r.kind === 'pole' ? (
            <path key={i} className="pole" d={`M ${px(r.re) - 5} ${py(r.im) - 5} l 10 10 m -10 0 l 10 -10`} />
          ) : (
            <circle key={i} className="zero" cx={px(r.re)} cy={py(r.im)} r={5} />
          ),
        )}
      </svg>
      <table className="scalars">
        <thead>
          <tr>
            <th />
            <th>s [rad/s]</th>
            <th>f₀ = |s|/2π</th>
            <th>Q</th>
          </tr>
        </thead>
        <tbody>
          {roots.map((r, i) => {
            const w0 = Math.hypot(r.re, r.im);
            return (
              <tr key={i}>
                <th>{r.kind === 'pole' ? `× polo ${r.name.replace(/\D/g, '')}` : `○ cero ${r.name.replace(/\D/g, '')}`}</th>
                <td>{complexText(r.re, r.im)}</td>
                <td>{si(w0 / (2 * Math.PI))}Hz</td>
                <td>{r.im !== 0 && r.re !== 0 ? si(w0 / (2 * Math.abs(r.re)), 3) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
