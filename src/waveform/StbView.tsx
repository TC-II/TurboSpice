// Resultados de un .stb al lado del Bode de T: márgenes de fase y de ganancia, y el mapa de
// polos y ceros de T (lazo abierto), los polos del lazo cerrado y el lugar de raíces de 1 + k·T,
// a partir de un modelo racional ajustado a T(jω) (stbMath.ts).
import { useMemo } from 'react';
import { STB_MAIN, type SimPlot, type SimVector } from '../engine/ngspice.ts';
import { closedLoopRoots, fitRational, margins, modelZeros, rootLocus, type Complex } from '../sim/stbMath.ts';
import { PzPlane } from './PzPlane.tsx';
import { si } from './series.ts';
import { t } from '../i18n/i18n.ts';

export const isStbPlot = (p: SimPlot | undefined) => !!p && /^stb\d+$/i.test(p.name) && p.vectors.some((v) => STB_MAIN.includes(v.name));

/**
 * La ganancia de lazo sobre la que se calculan márgenes y polos (positiva con realimentación
 * negativa): R con el GFT, Aβ = −T con Tian. El GFT con entrada y salida también trae una T
 * (la del A-β equivalente): manda R.
 */
function loopGain(plot: SimPlot): { re: Float64Array; im: Float64Array } | null {
  const r = plot.vectors.find((v) => v.name === 'r');
  if (r?.imag) return { re: r.real, im: r.imag };
  const tv = plot.vectors.find((v) => v.name === 't');
  if (!tv?.imag) return null;
  return { re: tv.real.map((x) => -x), im: tv.imag.map((x) => -x) };
}

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
  const L = loopGain(plot);
  if (!f || !L) return null;
  const m = margins(f, L.re, L.im);
  const model = fitRational(f, L.re, L.im);
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
  const gft = plot.vectors.some((v) => v.name === 'r');
  // la ganancia de lazo de los márgenes: Aβ (Tian, T = −Aβ) o R (GFT)
  const L = gft ? 'R' : 'Aβ';
  const runs = info.open ? [rootsPlot(t('{L} (open loop)', { L }), info.open.poles, info.open.zeros), rootsPlot(t('closed loop'), info.closed)] : [];
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
      {rhpOpen > 0 && <p className="stb-warn">⚠ {t('{L} has poles in the right half-plane (an inner loop is unstable): the margins read on the Bode plot are not valid; use the closed-loop poles.', { L })}</p>}
      {info.open ? (
        <PzPlane runs={runs} labels={labels} name={`${name} stb`} compact locus={info.locus} stableRun={1} />
      ) : (
        <p className="hint">{t('Too few points to fit a model of {L}', { L })}</p>
      )}
      <p className="hint">
        {t('Poles and zeros from a rational fit of {L}(jω) (error {e}); line: root locus of 1 + k·{L}, k from 0 to ∞. The margin assumes what stays closed is stable.', { L, e: Number.isFinite(info.error) ? info.error.toExponential(1) : '—' })}
      </p>
    </div>
  );
}
