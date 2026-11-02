// Tablas debajo (o al costado) de los paneles: lecturas de los cursores y medidas rápidas.
import type { Curve, PaneData } from './curves.ts';
import { bandwidth3dB, cursorDiff, stats, valueAt } from './measure.ts';
import type { Cursors } from './view.ts';
import { t } from '../i18n/i18n.ts';
import { type Range, MAX_ROWS, fmt, fix, xUnit } from './plotShared.ts';

export function CursorTable({ data, cursors, preview, setCursors }: { data: PaneData[]; cursors: Cursors; preview?: boolean; setCursors(f: (c: Cursors) => Cursors): void }) {
  const { a, b } = cursors;
  const dx = a !== undefined && b !== undefined ? b - a : NaN;
  const rows = data.flatMap((d) => d.curves.filter((c) => !c.hidden).map((c) => ({ d, c }))).slice(0, MAX_ROWS);
  const labels = [...new Set(data.flatMap((d) => d.curves.filter((c) => !c.hidden).map((c) => c.label)))];
  const xu = xUnit(data[0]?.xName);
  const traceSelect = (k: 'ta' | 'tb', name: string) => (
    <select value={cursors[k] ?? ''} aria-label={t('Cursor {name} trace', { name })} onChange={(e) => setCursors((c) => ({ ...c, [k]: e.target.value || undefined }))}>
      <option value="">
        {name}
        {t(': no trace')}
      </option>
      {labels.map((l) => (
        <option key={l} value={l}>
          {name}: {l}
        </option>
      ))}
    </select>
  );
  return (
    <div className="cursor-readout">
      <div className="cursor-tools">
        {traceSelect('ta', 'A')}
        {traceSelect('tb', 'B')}
        <button disabled={a === undefined || preview} onClick={() => setCursors((c) => ({ ...c, a: undefined, sel: 'b' }))}>
          {t('Clear A')}
        </button>
        <button disabled={b === undefined} onClick={() => setCursors((c) => ({ ...c, b: undefined, sel: 'a' }))}>
          {t('Clear B')}
        </button>
        <button onClick={() => setCursors((c) => ({ ...c, a: c.b, b: c.a, ta: c.tb, tb: c.ta }))} title={t('Swap A and B')}>
          A ⇄ B
        </button>
      </div>
      <table className="scalars readout">
        <thead>
          <tr>
            <th>{t('Trace')}</th>
            <th>A</th>
            <th>B</th>
            <th>B − A</th>
            <th>{t('slope')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ d, c }, i) => {
            const ya = a !== undefined ? valueAt(d.x, c.y, a) : NaN;
            const yb = b !== undefined ? valueAt(d.x, c.y, b) : NaN;
            const followed = c.label === cursors.ta || c.label === cursors.tb;
            return (
              <tr key={i} className={followed ? 'followed' : undefined}>
                <td style={{ color: c.color }}>{c.label}</td>
                <td>{fix(ya)}</td>
                <td>{fix(yb)}</td>
                <td>{fix(cursorDiff(a ?? NaN, b ?? NaN, ya, yb).dy)}</td>
                <td>{fix(cursorDiff(a ?? NaN, b ?? NaN, ya, yb).slope)}</td>
              </tr>
            );
          })}
          <tr className="dx">
            <td>{data[0]?.xName}</td>
            <td className={preview ? 'xa preview' : 'xa'} title={preview ? t('Follows the mouse: click to fix it') : undefined}>
              {fix(a ?? NaN, xu)}
            </td>
            <td className="xb">{fix(b ?? NaN, xu)}</td>
            <td className="xd">{fix(dx, xu)}</td>
            <td className="xf">{fix(cursorDiff(a ?? NaN, b ?? NaN, NaN, NaN).freq, xu === 's' ? 'Hz' : '')}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function StatsTable({ data, range }: { data: PaneData[]; range: Range | null }) {
  const rows = data.flatMap((d) => d.curves.filter((c) => !c.hidden).map((c) => ({ d, c }))).slice(0, MAX_ROWS);
  const db = (d: PaneData, c: Curve) => d.yUnit === 'dB' && c.axis === 'y';
  return (
    <table className="scalars readout">
      <thead>
        <tr>
          <th>{t('Trace')}</th>
          <th>{t('Minimum')}</th>
          <th>{t('Maximum')}</th>
          <th>{t('Peak to peak')}</th>
          <th>{t('Average')}</th>
          <th>{t('RMS')}</th>
          <th>{t('Frequency / −3 dB')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ d, c }, i) => {
          const s = stats(d.x, c.y, range?.[0], range?.[1]);
          if (!s) return null;
          const bw = db(d, c) ? bandwidth3dB(d.x, c.y) : null;
          return (
            <tr key={i}>
              <td style={{ color: c.color }}>{c.label}</td>
              <td>
                {fmt(s.min)} @ {fmt(s.xMin)}
              </td>
              <td>
                {fmt(s.max)} @ {fmt(s.xMax)}
              </td>
              <td>{fmt(s.pp)}</td>
              <td>{db(d, c) ? '—' : fmt(s.avg)}</td>
              <td>{db(d, c) ? '—' : fmt(s.rms)}</td>
              <td>{bw ? `${Number.isFinite(bw.low) ? `${fmt(bw.low)} … ` : ''}${fmt(bw.high)}` : fmt(s.freq, 'Hz')}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
