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

/** lado máximo del área del mapa [px] */
const MAX = 900;
const ZETAS = [0.1, 0.2, 0.3, 0.5, 0.707];
const HIT = 10;
/** márgenes alrededor del área del mapa: las marcas de los ejes van afuera, como en los gráficos */
const GL = 46;
const GR = 10;
const GT = 8;
const GB = 20;

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
  /** al lado de otro gráfico: mapa más chico y sin tabla */
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
  // el área del mapa es cuadrada: con espacio al costado, la tabla va a la derecha y el mapa toma
  // el alto; en un panel angosto (o más alto que ancho), la tabla va debajo
  const root = useRef<HTMLDivElement>(null);
  const tools = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState(320);
  const [stacked, setStacked] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      const h = el.clientHeight - (tools.current?.offsetHeight ?? 0) - (foot.current?.offsetHeight ?? 0) - 12;
      const st = !compact && (w < 620 || w < el.clientHeight * 1.15);
      const p = compact ? Math.min(w - GL - GR, h - GT - GB) : st ? Math.min(w - GL - GR, h * 0.6 - GT - GB) : Math.min(h - GT - GB, w * 0.55 - GL - GR);
      setStacked(st);
      setSide(Math.round(Math.max(110, Math.min(MAX, p))));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    if (foot.current) ro.observe(foot.current);
    return () => ro.disconnect();
  }, [compact]);
  const rows = useRef<(HTMLTableRowElement | null)[]>([]);
  // el dibujo se hace en px reales para que los textos no cambien de tamaño
  const W = side;
  const SW = W + GL + GR;
  const SH = W + GT + GB;
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

  // px, py: coordenadas dentro del área del mapa (el <g> la corre a los márgenes)
  const k = W / (2 * v.h);
  const px = (x: number) => W / 2 + (x - v.cx) * k;
  const py = (y: number) => W / 2 - (y - v.cy) * k;
  const world = (sx: number, sy: number): [number, number] => [v.cx + (sx - W / 2) / k, v.cy - (sy - W / 2) / k];
  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const b = svg.current!.getBoundingClientRect();
    return [((e.clientX - b.left) * SW) / b.width - GL, ((e.clientY - b.top) * SH) / b.height - GT];
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
      const sx = ((e.clientX - b.left) * (W + GL + GR)) / b.width - GL;
      const sy = ((e.clientY - b.top) * (W + GT + GB)) / b.height - GT;
      const wx = c.cx + (sx - W / 2) / kk;
      const wy = c.cy - (sy - W / 2) / kk;
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
  /** click en una fila: centra el mapa en esa raíz, con su módulo como escala */
  const focus = (i: number) => {
    const [x, y] = pts[i];
    setView({ cx: x, cy: y, h: Math.max(Math.hypot(x, y) * 0.5, fitted.h * 0.02) || fitted.h });
  };

  // grilla
  const [vx0, vx1, vy0, vy1] = [v.cx - v.h, v.cx + v.h, v.cy - v.h, v.cy + v.h];
  const step = niceStep(2 * v.h, Math.max(3, Math.round(W / 70)));
  const far = Math.hypot(Math.max(Math.abs(vx0), Math.abs(vx1)), Math.max(Math.abs(vy0), Math.abs(vy1)));
  const decades = log ? ticks(1, Math.ceil(far), 1) : [];
  const circles = log ? decades : guides ? ticks(step, far, step) : [];
  const xt = log ? [] : ticks(vx0, vx1, step);
  const yt = log ? [] : ticks(vy0, vy1, step);
  const ox = px(0);
  const oy = py(0);
  const unitText = hz ? 'Hz' : 'rad/s';
  const bad = roots.filter(unstable);
  const nPoles = roots.filter((r) => r.kind === 'pole').length;

  // raíces en el mismo punto (polos dobles, etc.): se marca la multiplicidad
  const mult = useMemo(() => {
    const seen = new Map<string, number[]>();
    roots.forEach((r, i) => {
      const key = `${r.kind}|${r.run}|${r.re.toPrecision(4)}|${r.im.toPrecision(4)}`;
      seen.set(key, [...(seen.get(key) ?? []), i]);
    });
    return [...seen.values()].filter((g) => g.length > 1);
  }, [roots]);

  const exportAs = async (what: string) => {
    if (what === 'csv') return download(`${name}.csv`, new Blob([pzCsv(roots, runLabel)], { type: 'text/csv' }));
    if (!svg.current) return;
    const text = schematicSvg(svg.current, { x1: 0, y1: 0, x2: SW, y2: SH });
    if (what === 'svg') return download(`${name}.svg`, new Blob([text], { type: 'image/svg+xml' }));
    const png = await schematicPng(text);
    if (png) download(`${name}.png`, png);
  };

  const hr = hover !== null ? roots[hover] : undefined;
  const hi = hr && rootInfo(hr);
  const glyph = (r: Root) => (
    <span className={`pz-glyph ${r.kind}`} style={{ color: color(r) }}>
      {r.kind === 'pole' ? '×' : '○'}
    </span>
  );
  return (
    <div ref={root} className={`pz-view${compact ? ' compact' : ''}${stacked ? ' stacked' : ''}`}>
      <div className="plot-tools pz-tools" ref={tools}>
        <button onClick={() => setView(null)} title={t('See all poles and zeros (double-click on the map)')}>
          {t('Fit')}
        </button>
        <span className="pz-seg" role="group" aria-label={t('Units')}>
          <button className={hz ? '' : 'active'} aria-pressed={!hz} onClick={() => setHz(false)}>
            rad/s
          </button>
          <button className={hz ? 'active' : ''} aria-pressed={hz} onClick={() => setHz(true)} title="s/2π">
            Hz
          </button>
        </span>
        <button className={log ? 'active' : ''} aria-pressed={log} onClick={() => setLog(!log)} title={t('Radius in decades of |s| (keeps the angle, i.e. ζ): for widely spread poles')}>
          Log
        </button>
        <button className={guides ? 'active' : ''} aria-pressed={guides} onClick={() => setGuides(!guides)} title={t('Lines of constant ζ and circles of constant ω₀')}>
          {t('ζ/ω₀ guides')}
        </button>
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
          <option value="csv">{t('Table to CSV')}</option>
        </select>
        <span className="pz-summary">
          {multi && (
            <ul className="pz-legend">
              {runs.map((p, i) => (
                <li key={p.name}>
                  <i style={{ background: PALETTE[i % PALETTE.length] }} />
                  {runLabel(i)}
                </li>
              ))}
            </ul>
          )}
          {!compact && (
            <span className="pz-count">
              <span className="pz-glyph pole">×</span> {nPoles} <span className="pz-glyph zero">○</span> {roots.length - nPoles}
            </span>
          )}
          <span className={`pz-badge ${bad.length ? 'bad' : 'ok'}`} title={bad.length ? t('in the right half-plane: the circuit is unstable') : undefined}>
            {bad.length ? `⚠ ${t('Unstable')}` : `✓ ${t('Stable')}`}
          </span>
        </span>
      </div>
      <div className="pz-body">
        <div className="pz-side" style={{ width: SW }}>
          <div className="pz-map">
            <svg
              ref={svg}
              className={`pz-plane${drag?.mode === 'pan' ? ' panning' : ''}`}
              width={SW}
              height={SH}
              viewBox={`0 0 ${SW} ${SH}`}
              role="img"
              aria-label={t('s-plane')}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={() => !drag && setHover(null)}
              onDoubleClick={() => setView(null)}
            >
              <defs>
                <clipPath id="pz-clip">
                  <rect x={0} y={0} width={W} height={W} />
                </clipPath>
              </defs>
              <g transform={`translate(${GL} ${GT})`}>
                <g clipPath="url(#pz-clip)">
                  {ox < W && <rect className="rhp" x={Math.max(0, ox)} y={0} width={W - Math.max(0, ox)} height={W} />}
                  {xt.map((x) => (
                    <line key={`gx${x}`} className="grid" x1={px(x)} x2={px(x)} y1={0} y2={W} />
                  ))}
                  {yt.map((y) => (
                    <line key={`gy${y}`} className="grid" x1={0} x2={W} y1={py(y)} y2={py(y)} />
                  ))}
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
                  {log &&
                    decades.map((d) => (
                      <text key={`td${d}`} x={px(d) + 3} y={oy - 4}>
                        {si(10 ** (decade0 + d), 3)}
                      </text>
                    ))}
                  <text className="axis-name" x={W - 6} y={Math.min(W - 6, Math.max(14, oy - 6))} textAnchor="end">
                    σ
                  </text>
                  <text className="axis-name" x={Math.min(W - 20, Math.max(6, ox + 6))} y={14}>
                    jω
                  </text>
                  {hr && <circle className="halo" cx={px(pts[hover!][0])} cy={py(pts[hover!][1])} r={11} />}
                  {roots.map((r, i) => {
                    const [x, y] = pts[i];
                    const sz = i === hover ? 6 : 4.5;
                    const cls = `${r.kind}${i === hover ? ' hl' : ''}`;
                    const style = color(r) ? { stroke: color(r) } : undefined;
                    return r.kind === 'pole' ? (
                      <path key={i} className={cls} style={style} d={`M ${px(x) - sz} ${py(y) - sz} l ${2 * sz} ${2 * sz} m ${-2 * sz} 0 l ${2 * sz} ${-2 * sz}`} />
                    ) : (
                      <circle key={i} className={cls} style={style} cx={px(x)} cy={py(y)} r={sz} />
                    );
                  })}
                  {mult.map((g) => (
                    <text key={`m${g[0]}`} className="mult" x={px(pts[g[0]][0]) + 7} y={py(pts[g[0]][1]) - 6}>
                      {g.length}
                    </text>
                  ))}
                  {drag?.mode === 'box' && (
                    <rect
                      className="zoom-box"
                      x={Math.min(drag.x0, drag.x1)}
                      y={Math.min(drag.y0, drag.y1)}
                      width={Math.abs(drag.x1 - drag.x0)}
                      height={Math.abs(drag.y1 - drag.y0)}
                    />
                  )}
                </g>
                <rect className="frame" x={0.5} y={0.5} width={W - 1} height={W - 1} />
                {xt.map((x) => (
                  <text key={`tx${x}`} x={px(x)} y={W + 14} textAnchor="middle">
                    {si(x, 3)}
                  </text>
                ))}
                {yt.map((y) => (
                  <text key={`ty${y}`} x={-6} y={py(y) + 3.5} textAnchor="end">
                    {si(y, 3)}
                  </text>
                ))}
                <text x={-6} y={W + 14} textAnchor="end" className="unit">
                  {log ? `log ${unitText}` : unitText}
                </text>
              </g>
            </svg>
            {hr && hi && (
              <div className="pz-tip" style={{ left: GL + px(pts[hover!][0]), top: GT + py(pts[hover!][1]) }}>
                <b>
                  {glyph(hr)} {hr.kind === 'pole' ? t('pole') : t('zero')} {hr.n}
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
          <div className="pz-foot" ref={foot}>
            {!compact && SW >= 380 && <p className="hint pz-help">{t('Wheel: zoom · drag: pan · Shift+drag: zoom to a box · double-click: fit')}</p>}
          </div>
        </div>
        {!compact && (
          <div className="pz-table">
            {bad.length > 0 && (
              <p className="pz-warn">
                ⚠ {bad.length === 1 ? t('A pole') : t('{length} poles', { length: bad.length })} {t('in the right half-plane: the circuit is unstable')}
                {multi ? t(' (in some run)') : ''}.
              </p>
            )}
            <table>
              <thead>
                <tr>
                  {multi && <th>{t('Run')}</th>}
                  <th />
                  <th className="num">σ [{unitText}]</th>
                  <th className="num">ω [{unitText}]</th>
                  <th className="num">f₀</th>
                  <th className="num">Q</th>
                  <th className="num">ζ</th>
                  <th className="num">τ</th>
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
                      title={t('Click: center the map on it')}
                      onClick={() => focus(i)}
                      onPointerEnter={() => setHover(i)}
                      onPointerLeave={() => setHover(null)}
                    >
                      {multi && (
                        <td className="run">
                          <i style={{ background: color(r) }} />
                          {runLabel(r.run)}
                        </td>
                      )}
                      <th>
                        {glyph({ ...r, run: multi ? -1 : r.run })} {r.kind === 'pole' ? t('pole') : t('zero')} {r.n}
                      </th>
                      <td className="num">{si(r.re / unit)}</td>
                      <td className="num">{r.im ? `${r.im < 0 ? '−' : '+'}${si(Math.abs(r.im / unit))}` : '0'}</td>
                      <td className="num">{si(info.f0)}Hz</td>
                      <td className="num">{Number.isFinite(info.q) ? fmtNum(info.q) : '—'}</td>
                      <td className="num">{fmtNum(info.zeta)}</td>
                      <td className="num">{Number.isFinite(info.tau) ? `${si(info.tau)}s` : '∞'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
