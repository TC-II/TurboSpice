// Resultados de un .stb al lado del Bode de T: márgenes de fase y de ganancia, y el mapa de
// polos y ceros de T (lazo abierto), los polos del lazo cerrado y el lugar de raíces de 1 + k·T,
// a partir de un modelo racional ajustado a T(jω) (stbMath.ts). Con la sonda diferencial, lo mismo
// para cada modo (DM y CM, #333): una línea de márgenes por modo y los dos mapas uno al lado del
// otro (#335).
import { useMemo, type CSSProperties } from 'react';
import { isStbMain, type SimPlot, type SimVector } from '../engine/ngspice.ts';
import { closedLoopRoots, fitRational, margins, modelZeros, rootLocus, type Complex } from '../sim/stbMath.ts';
import { PzPlane } from './PzPlane.tsx';
import { si } from './series.ts';
import { t } from '../i18n/i18n.ts';

export const isStbPlot = (p: SimPlot | undefined) => !!p && /^stb\d+$/i.test(p.name) && p.vectors.some((v) => isStbMain(v.name));

/** Modos del plot de un .stb: [''] con la sonda simple; ['dm', 'cm'] con la diferencial */
export function stbModes(plot: SimPlot): string[] {
  const m = ['dm', 'cm'].filter((x) => plot.vectors.some((v) => v.name === `r_${x}` || v.name === `t_${x}`));
  return m.length ? m : [''];
}

/** La traza principal de cada modo, como se escribe: R (GFT) o T (Tian); con la diferencial, R_DM y R_CM */
export function stbMainTraces(plot: SimPlot): string[] {
  return stbModes(plot).map((m) => {
    const s = m ? `_${m}` : '';
    return (plot.vectors.some((v) => v.name === `r${s}`) ? 'R' : 'T') + s.toUpperCase();
  });
}

/**
 * La ganancia de lazo sobre la que se calculan márgenes y polos (positiva con realimentación
 * negativa): R con el GFT, Aβ = −T con Tian. El GFT con entrada y salida también trae una T
 * (la del A-β equivalente): manda R. `s`: el sufijo del modo ("_dm"), o nada.
 */
function loopGain(plot: SimPlot, s: string): { re: Float64Array; im: Float64Array } | null {
  const r = plot.vectors.find((v) => v.name === `r${s}`);
  if (r?.imag) return { re: r.real, im: r.imag };
  const tv = plot.vectors.find((v) => v.name === `t${s}`);
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

/** márgenes y polos de un modo: '' con la sonda simple, 'dm' o 'cm' con la diferencial */
export function stbInfo(plot: SimPlot, mode = ''): StbInfo | null {
  const f = plot.vectors.find((v) => v.name === 'frequency')?.real;
  const L = loopGain(plot, mode ? `_${mode}` : '');
  if (!f || !L) return null;
  const m = margins(f, L.re, L.im);
  const model = fitRational(f, L.re, L.im);
  if (!model) return { margins: m, open: null, closed: [], locus: [], error: NaN };
  const [poles, zeros] = cancel(model.poles, modelZeros(model));
  const closed = closedLoopRoots(model, 1);
  return { margins: m, open: { poles, zeros }, closed, locus: rootLocus(model), error: model.error };
}

const deg = (x: number) => `${x.toFixed(1)}°`;
const rhp = (roots: Complex[]) => roots.filter((p) => p.re > 1e-9 * Math.hypot(p.re, p.im)).length;

/** márgenes y estabilidad en una sola línea (#332); los otros cruces de 0 dB, en el tooltip */
function Summary({ info, L, tag }: { info: StbInfo; L: string; tag?: string }) {
  const pm = info.margins.phase;
  // margen de ganancia: el cruce de −180° más cercano por encima de la frecuencia de cruce
  const gm = info.margins.gain;
  const minPm = pm.length ? pm.reduce((a, b) => (b.margin < a.margin ? b : a)) : undefined;
  const minGm = gm.length ? gm.reduce((a, b) => (b.margin < a.margin ? b : a)) : undefined;
  const rhpClosed = rhp(info.closed);
  return (
    <p
      className={`stb-summary${tag ? ' mode' : ''}`}
      title={t('Poles and zeros from a rational fit of {L}(jω) (error {e}); line: root locus of 1 + k·{L}, k from 0 to ∞. The margin assumes what stays closed is stable.', {
        L,
        e: Number.isFinite(info.error) ? info.error.toExponential(1) : '—',
      })}
    >
      {tag && <span className="stb-mode">{tag}</span>}
      <span title={t('Phase margin') + (pm.length > 1 ? ` · ${t('0 dB crossings')}: ${pm.map((c) => `${si(c.f)}Hz (${deg(c.margin)})`).join(' · ')}` : '')}>
        {t('PM')} <b className={minPm && minPm.margin < 45 ? 'bad' : ''}>{minPm ? `${deg(minPm.margin)} @ ${si(minPm.f)}Hz` : t('no 0 dB crossing')}</b>
        {pm.length > 1 && <sup>{pm.length}×</sup>}
      </span>
      <span title={t('Gain margin')}>
        {t('GM')} <b className={minGm && minGm.margin < 6 ? 'bad' : ''}>{minGm ? `${minGm.margin.toFixed(1)} dB @ ${si(minGm.f)}Hz` : t('no −180° crossing')}</b>
      </span>
      {info.open && <b className={rhpClosed ? 'bad' : 'ok'}>{rhpClosed ? `⚠ ${t('unstable ({n} poles in the right half-plane)', { n: rhpClosed })}` : `✓ ${t('Stable')}`}</b>}
    </p>
  );
}

export function StbView({ plot, name, style }: { plot: SimPlot; name: string; style?: CSSProperties }) {
  const modes = useMemo(() => stbModes(plot), [plot]);
  const infos = useMemo(() => modes.map((m) => stbInfo(plot, m)), [plot, modes]);
  if (!infos.some(Boolean)) return null;
  const multi = modes.length > 1;
  // la ganancia de lazo de cada modo: Aβ (Tian, T = −Aβ) o R (GFT)
  const loopName = (mode: string) => (plot.vectors.some((v) => v.name === `r${mode ? `_${mode}` : ''}`) ? 'R' : 'Aβ') + (mode ? `_${mode.toUpperCase()}` : '');
  return (
    <div className={`stb-view${multi ? ' multi' : ''}`} style={style}>
      {modes.map((m, i) => {
        const info = infos[i];
        return info && <Summary key={m} info={info} L={loopName(m)} tag={multi ? m.toUpperCase() : undefined} />;
      })}
      {modes.map((m, i) => {
        const info = infos[i];
        const L = loopName(m);
        return info?.open && rhp(info.open.poles) > 0 ? (
          <p key={m} className="stb-warn">
            ⚠ {t('{L} has poles in the right half-plane (an inner loop is unstable): the margins read on the Bode plot are not valid; use the closed-loop poles.', { L })}
          </p>
        ) : null;
      })}
      {/* con la sonda diferencial, el mapa de cada modo, uno al lado del otro (#335) */}
      <div className="stb-maps">
        {modes.map((m, i) => {
          const info = infos[i];
          if (!info) return null;
          const L = loopName(m);
          const runs = info.open ? [rootsPlot(t('{L} (open loop)', { L }), info.open.poles, info.open.zeros), rootsPlot(t('closed loop'), info.closed)] : [];
          const labels = new Map(runs.map((r) => [r.name, r.name]));
          return (
            <div key={m} className="stb-map">
              {multi && (
                <span className="stb-mode" title={m === 'dm' ? t('Differential (DM)') : t('Common mode (CM)')}>
                  {m.toUpperCase()}
                </span>
              )}
              {info.open ? (
                <PzPlane runs={runs} labels={labels} name={`${name} stb${m ? `_${m}` : ''}`} compact locus={info.locus} stableRun={1} />
              ) : (
                <p className="hint">{t('Too few points to fit a model of {L}', { L })}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
