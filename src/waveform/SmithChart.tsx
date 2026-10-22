// Carta de Smith: cada traza compleja se dibuja como coeficiente de reflexión Γ (p.ej. S11
// de un análisis .sp). Para una impedancia normalizada z, graficar (z-1)/(z+1).
import type { SimPlot } from '../engine/ngspice.ts';
import { evalTrace, type Resolver } from './expr.ts';
import { scaleOf, si } from './series.ts';
import { traceColor, type Pane } from './view.ts';
import { t } from '../i18n/i18n.ts';

const R_CIRCLES = [0.2, 0.5, 1, 2, 5];
const X_ARCS = [0.2, 0.5, 1, 2, 5];

export function SmithChart({ plot, panes, resolver }: { plot: SimPlot; panes: Pane[]; resolver(p: SimPlot): Resolver }) {
  const scale = scaleOf(plot);
  const S = 140; // radio en unidades del dibujo
  const p = (re: number, im: number) => `${(re * S).toFixed(2)},${(-im * S).toFixed(2)}`;
  const traces = panes.flatMap((pane) => pane.traces.map((tt, i) => ({ t: tt, i }))).filter(({ t: tt }) => !tt.hidden);
  return (
    <div className="smith">
      <svg viewBox={`${-S - 10} ${-S - 10} ${2 * S + 20} ${2 * S + 20}`} role="img" aria-label={t('Smith chart')}>
        <g className="grid">
          <circle cx={0} cy={0} r={S} />
          <line x1={-S} y1={0} x2={S} y2={0} />
          {R_CIRCLES.map((r) => (
            <circle key={`r${r}`} cx={(r / (1 + r)) * S} cy={0} r={S / (1 + r)} />
          ))}
          {X_ARCS.flatMap((x) =>
            [x, -x].map((xx) => {
              // arco de reactancia constante: Γ = (z−1)/(z+1) con z = r + jx, r de 0 a ∞
              const pts: string[] = [];
              for (let k = 0; k <= 64; k++) {
                const zr = (k / 64) ** 2 * 50;
                const den = (zr + 1) ** 2 + xx * xx;
                pts.push(p((zr * zr + xx * xx - 1) / den, (2 * xx) / den));
              }
              return <polyline key={`x${xx}`} points={pts.join(' ')} />;
            }),
          )}
          {R_CIRCLES.map((r) => (
            <text key={`t${r}`} x={((r - 1) / (r + 1)) * S + 2} y={-3}>{r}</text>
          ))}
        </g>
        {traces.map(({ t: tt, i }) => {
          let pts = '';
          try {
            const w = evalTrace(tt.expr, { resolve: resolver(plot), scale: scale!.real, scaleName: scale!.name });
            pts = Array.from(w.re, (re, k) => p(re, w.im?.[k] ?? 0)).join(' ');
          } catch {
            return null;
          }
          return <polyline key={tt.expr} className="trace" points={pts} style={{ stroke: traceColor(tt, i) }} />;
        })}
      </svg>
      <ul className="smith-legend">
        {traces.map(({ t: tt, i }) => (
          <li key={tt.expr} style={{ color: traceColor(tt, i) }}>{tt.expr}</li>
        ))}
        {scale && <li className="hint">{scale.name}: {si(scale.real[0])} … {si(scale.real[scale.real.length - 1])}</li>}
      </ul>
    </div>
  );
}
