// Pestaña "Mediciones": resultados de los .meas por corrida, estadísticas e histogramas.
import { si } from '../waveform/series.ts';
import { columnStats, histogram, measNumber, type MeasTable } from './measResults.ts';
import type { MeasResult } from './meas.ts';
import { t } from '../i18n/i18n.ts';

function fmtResult(r: MeasResult | undefined): string {
  if (!r) return '';
  if ('error' in r) return `— (${r.error})`;
  if (r.im !== undefined) {
    const mag = Math.hypot(r.value, r.im);
    return `${(20 * Math.log10(mag)).toFixed(3)} dB ∠ ${((Math.atan2(r.im, r.value) * 180) / Math.PI).toFixed(2)}°`;
  }
  return si(r.value, 5) + (r.at !== undefined && Number.isFinite(r.at) && r.at !== r.value ? ` @ ${si(r.at, 4)}` : '');
}

function Histogram({ values, label }: { values: number[]; label: string }) {
  const bins = histogram(values);
  const max = Math.max(...bins.map((b) => b.count), 1);
  const W = 240;
  const H = 90;
  const bw = W / bins.length;
  return (
    <figure className="histogram">
      <svg viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label={t('Histogram of {label}', { label })}>
        {bins.map((b, i) => (
          <rect key={i} x={i * bw + 1} y={H - (b.count / max) * H} width={bw - 2} height={(b.count / max) * H}>
            <title>{`${si(b.from, 4)} … ${si(b.to, 4)}: ${b.count}`}</title>
          </rect>
        ))}
        <text x={0} y={H + 12}>{si(bins[0]?.from ?? 0, 4)}</text>
        <text x={W} y={H + 12} textAnchor="end">{si(bins[bins.length - 1]?.to ?? 0, 4)}</text>
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function MeasPanel({ table }: { table: MeasTable }) {
  const many = table.rows.length > 1;
  const cols = table.names.map((n) => table.rows.map((r) => measNumber(r.values.get(n))));
  return (
    <div className="meas-panel">
      {table.errors.map((e) => (
        <p key={e} className="hint warn">{e}</p>
      ))}
      <table className="scalars meas-table">
        <thead>
          <tr>
            {many && <th>{t('Run')}</th>}
            {table.names.map((n) => (
              <th key={n}>{n}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => (
            <tr key={r.plot}>
              {many && <th>{r.label ?? r.plot}</th>}
              {table.names.map((n) => (
                <td key={n}>{fmtResult(r.values.get(n))}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {many && (
          <tfoot>
            {(['mean', 'sigma', 'min', 'max'] as const).map((k) => (
              <tr key={k}>
                <th>{{ mean: 'Media', sigma: t('Std. dev. (σ)'), min: t('Minimum'), max: t('Maximum') }[k]}</th>
                {cols.map((c, i) => {
                  const s = columnStats(c);
                  return <td key={i}>{s ? si(s[k], 5) : ''}</td>;
                })}
              </tr>
            ))}
          </tfoot>
        )}
      </table>
      {table.rows.length >= 10 && (
        <div className="histograms">
          {table.names.map((n, i) => (
            <Histogram key={n} values={cols[i]} label={n} />
          ))}
        </div>
      )}
      {many && <p className="hint">{t('To plot a measurement against the swept parameter, choose the "meas vs …" plot and add the trace with its name.')}</p>}
    </div>
  );
}
