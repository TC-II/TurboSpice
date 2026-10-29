// Resultados de un .stb al lado del Bode de T: márgenes de fase y de ganancia, y el mapa de
// polos y ceros de T (lazo abierto), los polos del lazo cerrado y el lugar de raíces de 1 + k·T,
// a partir de un modelo racional ajustado a T(jω) (stbMath.ts).
import { useMemo } from 'react';
import type { SimPlot, SimVector } from '../engine/ngspice.ts';
import { closedLoopRoots, fitRational, margins, modelZeros, rootLocus, type Complex } from '../sim/stbMath.ts';
import { PzPlane } from './PzPlane.tsx';
import { si } from './series.ts';
import { t } from '../i18n/i18n.ts';

export const isStbPlot = (p: SimPlot | undefined) => !!p && /^stb\d+$/i.test(p.name) && p.vectors.some((v) => v.name === 'loopgain');

/** plot de raíces como los de .pz ("pole(1)", "zero(1)"), para el mapa */
function rootsPlot(name: string, poles: Complex[], zeros: Complex[] = []): SimPlot {
  const vec = (kind: string, r: Complex, i: number): SimVector => ({ name: `${kind}(${i + 1})`, type: 0, real: Float64Array.of(r.re), imag: Float64Array.of(r.im) });
  return { name, vectors: [...poles.map((r, i) => vec('pole', r, i)), ...zeros.map((r, i) => vec('zero', r, i))] };
}

/** saca los pares polo-cero que se cancelan (sobran en un ajuste de orden de más) */
function cancel(poles: Complex[], zeros: Complex[]): [Complex[], Complex[]] {
  const p = [...poles];
  const z: Complex[] = [];
  for (const zz of zeros) {
    const i = p.findIndex((pp) => Math.hypot(pp.re - zz.re, pp.im - zz.im) < 1e-3 * Math.hypot(pp.re, pp.im));
    if (i >= 0) p.splice(i, 1);
    else z.push(zz);
  }
  return [p, z];
}

export interface StbInfo {
  margins: ReturnType<typeof margins>;
  open: { poles: Complex[]; zeros: Complex[] } | null;
  closed: Complex[];
  locus: Complex[][];
  error: number;
}

export function stbInfo(plot: SimPlot): StbInfo | null {
  const f = plot.vectors.find((v) => v.name === 'frequency')?.real;
  const T = plot.vectors.find((v) => v.name === 'loopgain');
  if (!f || !T?.imag) return null;
  const m = margins(f, T.real, T.imag);
  const model = fitRational(f, T.real, T.imag);
  if (!model) return { margins: m, open: null, closed: [], locus: [], error: NaN };
  const [poles, zeros] = cancel(model.poles, modelZeros(model));
  const closed = closedLoopRoots(model, 1);
  return { margins: m, open: { poles, zeros }, closed, locus: rootLocus(model), error: model.error };
}

const deg = (x: number) => `${x.toFixed(1)}°`;

export function StbView({ plot, name }: { plot: SimPlot; name: string }) {
  const info = useMemo(() => stbInfo(plot), [plot]);
  if (!info) return null;
  const pm = info.margins.phase;
  // margen de ganancia: el cruce de −180° más cercano por encima de la frecuencia de cruce
  const gm = info.margins.gain;
  const minPm = pm.length ? pm.reduce((a, b) => (b.margin < a.margin ? b : a)) : undefined;
  const minGm = gm.length ? gm.reduce((a, b) => (b.margin < a.margin ? b : a)) : undefined;
  const rhpOpen = info.open?.poles.filter((p) => p.re > 1e-9 * Math.hypot(p.re, p.im)).length ?? 0;
  const rhpClosed = info.closed.filter((p) => p.re > 1e-9 * Math.hypot(p.re, p.im)).length;
  const runs = info.open ? [rootsPlot(t('T (open loop)'), info.open.poles, info.open.zeros), rootsPlot(t('closed loop'), info.closed)] : [];
  const labels = new Map(runs.map((r) => [r.name, r.name]));
  return (
    <div className="stb-view">
      <dl className="stb-summary">
        <dt>{t('Phase margin')}</dt>
        <dd className={minPm && minPm.margin < 45 ? 'bad' : ''}>{minPm ? `${deg(minPm.margin)} @ ${si(minPm.f)}Hz` : t('no 0 dB crossing')}</dd>
        {pm.length > 1 && (
          <>
            <dt>{t('0 dB crossings')}</dt>
            <dd>{pm.map((c) => `${si(c.f)}Hz (${deg(c.margin)})`).join(' · ')}</dd>
          </>
        )}
        <dt>{t('Gain margin')}</dt>
        <dd className={minGm && minGm.margin < 6 ? 'bad' : ''}>{minGm ? `${minGm.margin.toFixed(1)} dB @ ${si(minGm.f)}Hz` : t('no −180° crossing')}</dd>
        <dt>{t('Closed loop')}</dt>
        <dd className={rhpClosed ? 'bad' : ''}>{info.open ? (rhpClosed ? t('unstable ({n} poles in the right half-plane)', { n: rhpClosed }) : t('stable')) : '—'}</dd>
      </dl>
      {rhpOpen > 0 && <p className="stb-warn">⚠ {t('T has poles in the right half-plane (an inner loop is unstable): the margins read on the Bode plot are not valid; use the closed-loop poles.')}</p>}
      {info.open ? (
        <PzPlane runs={runs} labels={labels} name={`${name} stb`} compact locus={info.locus} stableRun={1} />
      ) : (
        <p className="hint">{t('Too few points to fit a model of T')}</p>
      )}
      <p className="hint">
        {t('Poles and zeros from a rational fit of T(jω) (error {e}); line: root locus of 1 + k·T, k from 0 to ∞. The margin assumes what stays closed is stable.', { e: Number.isFinite(info.error) ? info.error.toExponential(1) : '—' })}
      </p>
    </div>
  );
}
