// Mapa de polos (×) y ceros (○) en el plano s: aspecto 1:1, grilla con escala, zoom con la
// rueda o con Shift+arrastre, paneo arrastrando, escala logarítmica opcional, guías de ζ y ω₀,
// corridas de .step superpuestas y resaltado cruzado entre el mapa y la tabla.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { SimPlot } from '../engine/ngspice.ts';
import { download, schematicPng, schematicSvg } from '../schematic/exportSchematic.ts';
import { complexText, niceStep, pzCsv, pzRoots, rootInfo, ticks, unstable, type Root } from './pz.ts';
import { si } from './series.ts';
import { PALETTE } from './view.ts';
import { t } from '../i18n/i18n.ts';

/** lado máximo del mapa [px] */
const MAX = 360;
const ZETAS = [0.1, 0.2, 0.3, 0.5, 0.707];
const HIT = 10;

interface View {
  cx: number;
  cy: number;
  /** media ventana (igual en los dos ejes: aspecto 1:1) */
  h: number;
}
type Drag = { mode: 'pan'; x0: number; y0: number; view: View } | { mode: 'box'; x0: number; y0: number; x1: number; y1: number };

interface Props {
  /** corridas de .pz (una por paso de .step) */
  runs: SimPlot[];
  /** etiqueta de cada corrida ("R=2k") */
  labels?: Map<string, string>;
  /** nombre base de los archivos exportados */
  name?: string;
  /** al lado de otro gráfico: mapa más chico y la tabla debajo */
  compact?: boolean;
}

const fmtNum = (x: number, digits = 3) => (Number.isFinite(x) ? String(Number(x.toPrecision(digits))) : '—');

export function PzPlane({ runs, labels, name = t('poles and zeros'), compact }: Props) {
  const roots = useMemo(() => pzRoots(runs), [runs]);
  const [hz, setHz] = useState(false);
  const [log, setLog] = useState(false);
  const [guides, setGuides] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  // el mapa es cuadrado y ocupa el alto disponible del panel (hasta MAX px)
  const box = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState(MAX);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSide(Math.max(100, Math.round(Math.min(MAX, el.clientHeight, el.parentElement?.clientWidth ?? MAX)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const rows = useRef<(HTMLTableRowElement | null)[]>([]);
  // el dibujo se hace en px reales para que los textos no cambien de tamaño
  const W = side;
  const multi = runs.length > 1;
  const runLabel = (run: number) => labels?.get(runs[run]?.name) ?? runs[run]?.name ?? '';
  const color = (r: Root) => (multi ? PALETTE[r.run % PALETTE.length] : undefined);

  // coordenadas del dibujo: s (o s/2π) y, en escala log, |s| → décadas conservando el ángulo
  const unit = hz ? 2 * Math.PI : 1;
  const decade0 = useMemo(() => {
    const mags = roots.map((r) => Math.hypot(r.re, r.im) / unit).filter((m) => m > 0);
    return mags.length ? Math.floor(Math.log10(Math.min(...mags))) - 1 : 0;
  }, [roots, unit]);
  const toXY = (re: number, im: number): [number, number] => {
    const x = re / unit;
    const y = im / unit;
    if (!log) return [x, y];
    const m = Math.hypot(x, y);
    if (!m) return [0, 0];
    const rho = Math.max(0, Math.log10(m) - decade0);
    return [(rho * x) / m, (rho * y) / m];
  };
  const pts = roots.map((r) => toXY(r.re, r.im));

  const fitted = useMemo((): View => {
    const xs = [0, ...pts.map((p) => p[0])];
    const ys = [0, ...pts.map((p) => p[1])];
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const h = (Math.max(x1 - x0, y1 - y0) / 2) * 1.25 || 1;
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, h };
    // pts depende de roots, unit, log y decade0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roots, unit, log, decade0]);
  useEffect(() => setView(null), [fitted]);
  const v = view ?? fitted;

  const k = W / (2 * v.h);
  const px = (x: number) => W / 2 + (x - v.cx) * k;
  const py = (y: number) => W / 2 - (y - v.cy) * k;
  const world = (sx: number, sy: number): [number, number] => [v.cx + (sx - W / 2) / k, v.cy - (sy - W / 2) / k];
  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const b = svg.current!.getBoundingClientRect();
    return [((e.clientX - b.left) * W) / b.width, ((e.clientY - b.top) * W) / b.height];
  };

  // rueda: zoom alrededor del mouse (listener propio: React registra wheel como pasivo)
  const viewRef = useRef({ v, W });
  viewRef.current = { v, W };
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const b = el.getBoundingClientRect();
      const { v: c, W } = viewRef.current;
      const kk = W / (2 * c.h);
      const wx = c.cx + (((e.clientX - b.left) * W) / b.width - W / 2) / kk;
      const wy = c.cy - (((e.clientY - b.top) * W) / b.height - W / 2) / kk;
      const f = Math.exp(e.deltaY * 0.0015);
      setView({ cx: wx + (c.cx - wx) * f, cy: wy + (c.cy - wy) * f, h: c.h * f });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const nearest = (sx: number, sy: number) => {
    let best: number | null = null;
    let bd = HIT;
    pts.forEach(([x, y], i) => {
      const d = Math.hypot(px(x) - sx, py(y) - sy);
      if (d <= bd) [best, bd] = [i, d];
    });
    return best;
  };
  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const [x, y] = local(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(e.shiftKey ? { mode: 'box', x0: x, y0: y, x1: x, y1: y } : { mode: 'pan', x0: x, y0: y, view: v });
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const [x, y] = local(e);
    if (!drag) return setHover(nearest(x, y));
    if (drag.mode === 'box') return setDrag({ ...drag, x1: x, y1: y });
    const kk = W / (2 * drag.view.h);
    setView({ ...drag.view, cx: drag.view.cx - (x - drag.x0) / kk, cy: drag.view.cy + (y - drag.y0) / kk });
  };
  const onUp = () => {
    if (drag?.mode === 'box' && Math.abs(drag.x1 - drag.x0) > 4 && Math.abs(drag.y1 - drag.y0) > 4) {
      const [ax, ay] = world(drag.x0, drag.y0);
      const [bx, by] = world(drag.x1, drag.y1);
      setView({ cx: (ax + bx) / 2, cy: (ay + by) / 2, h: Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / 2 });
    }
    setDrag(null);
  };
  useEffect(() => {
    if (hover !== null) rows.current[hover]?.scrollIntoView?.({ block: 'nearest' });
  }, [hover]);

  // grilla
  const [vx0, vx1, vy0, vy1] = [v.cx - v.h, v.cx + v.h, v.cy - v.h, v.cy + v.h];
  const step = niceStep(2 * v.h, Math.max(3, Math.round(W / 60)));
  const far = Math.hypot(Math.max(Math.abs(vx0), Math.abs(vx1)), Math.max(Math.abs(vy0), Math.abs(vy1)));
  const decades = log ? ticks(1, Math.ceil(far), 1) : [];
  const circles = log ? decades : guides ? ticks(step, far, step) : [];
  const ox = px(0);
  const oy = py(0);
  const unitText = hz ? 'Hz' : 'rad/s';
  const bad = roots.filter(unstable);

  const exportAs = async (what: string) => {
    if (what === 'csv') return download(`${name}.csv`, new Blob([pzCsv(roots, runLabel)], { type: 'text/csv' }));
    if (!svg.current) return;
    const text = schematicSvg(svg.current, { x1: 0, y1: 0, x2: W, y2: W });
    if (what === 'svg') return download(`${name}.svg`, new Blob([text], { type: 'image/svg+xml' }));
    const png = await schematicPng(text);
    if (png) download(`${name}.png`, png);
  };

  const hr = hover !== null ? roots[hover] : undefined;
  const hi = hr && rootInfo(hr);
  return (
    <div className={`pz-view${compact ? ' compact' : ''}`}>
      <div className="pz-side">
        <div className="plot-tools">
          <button onClick={() => setView(null)} title={t('See all poles and zeros (double-click on the map)')}>
            {t('Fit')}
          </button>
          <select value={hz ? 'hz' : 'rad'} aria-label={t('Units')} onChange={(e) => setHz(e.target.value === 'hz')}>
            <option value="rad">rad/s</option>
            <option value="hz">Hz (s/2π)</option>
          </select>
          <label className="check inline" title={t('Radius in decades of |s| (keeps the angle, i.e. ζ): for widely spread poles')}>
            <input type="checkbox" checked={log} onChange={(e) => setLog(e.target.checked)} /> Log
          </label>
          <label className="check inline" title={t('Lines of constant ζ and circles of constant ω₀')}>
            <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> {t('ζ/ω₀ guides')}
          </label>
          <select
            value=""
            aria-label={t('Export poles and zeros')}
            onChange={(e) => {
              void exportAs(e.target.value);
              e.target.value = '';
            }}
          >
            <option value="">{t('Export…')}</option>
            <option value="png">{t('Map to PNG')}</option>
            <option value="svg">{t('Map to SVG')}</option>
            <option value="csv">Tabla a CSV</option>
          </select>
        </div>
        <div className="pz-map" ref={box} style={{ width: side }}>
          <svg
            ref={svg}
            className={`pz-plane${drag?.mode === 'pan' ? ' panning' : ''}`}
            viewBox={`0 0 ${W} ${W}`}
            role="img"
            aria-label="Plano s"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={() => !drag && setHover(null)}
            onDoubleClick={() => setView(null)}
          >
            <rect className="bg" x={0} y={0} width={W} height={W} />
            {ox < W && <rect className="rhp" x={Math.max(0, ox)} y={0} width={W - Math.max(0, ox)} height={W} />}
            {!log && ticks(vx0, vx1, step).map((x) => <line key={`gx${x}`} className="grid" x1={px(x)} x2={px(x)} y1={0} y2={W} />)}
            {!log && ticks(vy0, vy1, step).map((y) => <line key={`gy${y}`} className="grid" x1={0} x2={W} y1={py(y)} y2={py(y)} />)}
            {circles.map((r) => (
              <circle key={`c${r}`} className={log ? 'grid' : 'guide'} cx={ox} cy={oy} r={r * k} />
            ))}
            {guides &&
              ZETAS.flatMap((z) =>
                [1, -1].map((sg) => {
                  const R = far * 2;
                  const s = Math.sqrt(1 - z * z);
                  return <line key={`z${z}${sg}`} className="guide" x1={ox} y1={oy} x2={px(-z * R)} y2={py(sg * s * R)} />;
                }),
              )}
            {guides &&
              ZETAS.map((z) => {
                const d = Math.min(far, v.h) * 0.85;
                return (
                  <text key={`zt${z}`} className="guide-label" x={px(-z * d)} y={py(Math.sqrt(1 - z * z) * d) - 3}>
                    ζ={z}
                  </text>
                );
              })}
            <line x1={0} y1={oy} x2={W} y2={oy} className="axis" />
            <line x1={ox} y1={0} x2={ox} y2={W} className="axis" />
            {!log &&
              ticks(vx0, vx1, step)
                .filter((x) => x !== 0)
                .map((x) => (
                  <text key={`tx${x}`} x={px(x)} y={W - 4} textAnchor="middle">
                    {si(x, 3)}
                  </text>
                ))}
            {!log &&
              ticks(vy0, vy1, step)
                .filter((y) => y !== 0)
                .map((y) => (
                  <text key={`ty${y}`} x={4} y={py(y) - 2}>
                    {si(y, 3)}
                  </text>
                ))}
            {log &&
              decades.map((d) => (
                <text key={`td${d}`} x={px(d) + 2} y={oy - 3}>
                  {si(10 ** (decade0 + d), 3)}
                </text>
              ))}
            <text x={W - 4} y={Math.min(W - 18, Math.max(12, oy - 4))} textAnchor="end">
              σ
            </text>
            <text x={Math.min(W - 20, Math.max(4, ox + 4))} y={12}>
              jω
            </text>
            <text x={W - 4} y={12} textAnchor="end" className="unit">
              {log ? `|s| log, ${unitText}` : unitText}
            </text>
            {roots.map((r, i) => {
              const [x, y] = pts[i];
              const sz = i === hover ? 7 : 5;
              const cls = `${r.kind}${i === hover ? ' hl' : ''}`;
              const style = color(r) ? { stroke: color(r) } : undefined;
              return r.kind === 'pole' ? (
                <path key={i} className={cls} style={style} d={`M ${px(x) - sz} ${py(y) - sz} l ${2 * sz} ${2 * sz} m ${-2 * sz} 0 l ${2 * sz} ${-2 * sz}`} />
              ) : (
                <circle key={i} className={cls} style={style} cx={px(x)} cy={py(y)} r={sz} />
              );
            })}
            {drag?.mode === 'box' && (
              <rect
                className="zoom-box"
                x={Math.min(drag.x0, drag.x1)}
                y={Math.min(drag.y0, drag.y1)}
                width={Math.abs(drag.x1 - drag.x0)}
                height={Math.abs(drag.y1 - drag.y0)}
              />
            )}
          </svg>
          {hr && hi && (
            <div className="pz-tip" style={{ left: `${(px(pts[hover!][0]) / W) * 100}%`, top: `${(py(pts[hover!][1]) / W) * 100}%` }}>
              <b>
                {hr.kind === 'pole' ? t('pole') : t('zero')} {hr.n}
                {multi ? ` · ${runLabel(hr.run)}` : ''}
              </b>
              <span>
                s = {complexText(hr.re / unit, hr.im / unit)} {unitText}
              </span>
              <span>f₀ = {si(hi.f0)}Hz</span>
              {Number.isFinite(hi.q) && <span>Q = {fmtNum(hi.q)}</span>}
              <span>ζ = {fmtNum(hi.zeta)}</span>
              <span>τ = {Number.isFinite(hi.tau) ? `${si(hi.tau)}s` : '∞'}</span>
            </div>
          )}
        </div>
        {!compact && <p className="hint pz-help">{t('Wheel: zoom · drag: pan · Shift+drag: zoom to a box · double-click: fit')}</p>}
        {bad.length > 0 && (
          <p className="hint warn">
            ⚠ {bad.length === 1 ? t('A pole') : t('{length} poles', { length: bad.length })} {t('in the right half-plane: the circuit is unstable')}{multi ? t(' (in some run)') : ''}.
          </p>
        )}
        {multi && (
          <ul className="pz-legend">
            {runs.map((p, i) => (
              <li key={p.name} style={{ color: PALETTE[i % PALETTE.length] }}>
                ━ {runLabel(i)}
              </li>
            ))}
          </ul>
        )}
      </div>
      {!compact && (
        <div className="pz-table">
          <table className="scalars">
            <thead>
              <tr>
                {multi && <th>{t('Run')}</th>}
                <th />
                <th>{hz ? 's/2π [Hz]' : 's [rad/s]'}</th>
                <th>f₀ = |s|/2π</th>
                <th>Q</th>
                <th>ζ</th>
                <th>τ = 1/|σ|</th>
              </tr>
            </thead>
            <tbody>
              {roots.map((r, i) => {
                const info = rootInfo(r);
                return (
                  <tr
                    key={i}
                    ref={(el) => {
                      rows.current[i] = el;
                    }}
                    className={`${i === hover ? 'hl' : ''}${unstable(r) ? ' unstable' : ''}`}
                    onPointerEnter={() => setHover(i)}
                    onPointerLeave={() => setHover(null)}
                  >
                    {multi && <td style={{ color: color(r) }}>{runLabel(r.run)}</td>}
                    <th>{r.kind === 'pole' ? t('× pole {n}', { n: r.n }) : t('○ zero {n}', { n: r.n })}</th>
                    <td>{complexText(r.re / unit, r.im / unit)}</td>
                    <td>{si(info.f0)}Hz</td>
                    <td>{Number.isFinite(info.q) ? fmtNum(info.q) : '—'}</td>
                    <td>{fmtNum(info.zeta)}</td>
                    <td>{Number.isFinite(info.tau) ? `${si(info.tau)}s` : '∞'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
