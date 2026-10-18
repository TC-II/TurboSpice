// Mapa de polos y ceros (.pz) en el plano s: ejes con escala, aspecto 1:1, zoom y paneo,
// datos al pasar el mouse, semiplano inestable, guías de ζ y ω₀, corridas de .step
// superpuestas, y exportación a SVG/CSV.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SimPlot } from '../engine/ngspice.ts';
import { download } from '../schematic/exportSchematic.ts';
import { toCsv } from './measure.ts';
import { si } from './series.ts';
import { PALETTE } from './view.ts';

export interface Root {
  kind: 'pole' | 'zero';
  /** número de polo/cero en ngspice ("pole(2)" → 2) */
  n: number;
  re: number;
  im: number;
  /** corrida (índice en la lista de plots .pz) */
  run: number;
}

export const isPzPlot = (p: SimPlot) => p.vectors.some((v) => /^(pole|zero)\(\d+\)$/i.test(v.name));

/** Polos y ceros de un plot .pz */
export function pzRoots(plot: SimPlot, run = 0): Root[] {
  return plot.vectors
    .filter((v) => /^(pole|zero)\(\d+\)$/i.test(v.name))
    .flatMap((v) =>
      Array.from(v.real, (re, i) => ({
        kind: (/^pole/i.test(v.name) ? 'pole' : 'zero') as Root['kind'],
        n: Number(/\((\d+)\)/.exec(v.name)![1]),
        re,
        im: v.imag?.[i] ?? 0,
        run,
      })),
    )
    .sort((a, b) => (a.kind === b.kind ? a.n - b.n : a.kind === 'pole' ? -1 : 1));
}

/** Plots .pz de una simulación (una por corrida de .step), en orden */
export const pzPlots = (plots: SimPlot[]) => plots.filter((p) => /^pz\d+$/i.test(p.name) && isPzPlot(p));

export interface RootInfo {
  /** frecuencia natural ω₀ = |s| (rad/s) y f₀ = ω₀/2π */
  w0: number;
  f0: number;
  /** amortiguamiento ζ = −σ/ω₀; Q = 1/(2ζ) sólo para pares complejos */
  zeta: number;
  q: number;
  /** constante de tiempo 1/|σ| */
  tau: number;
}

export function rootInfo(r: { re: number; im: number }): RootInfo {
  const w0 = Math.hypot(r.re, r.im);
  const zeta = w0 ? -r.re / w0 : NaN;
  return {
    w0,
    f0: w0 / (2 * Math.PI),
    zeta,
    q: r.im !== 0 && r.re !== 0 ? 1 / (2 * Math.abs(zeta)) : NaN,
    tau: r.re !== 0 ? 1 / Math.abs(r.re) : Infinity,
  };
}

/** Paso "lindo" de grilla (1, 2 o 5 × 10ⁿ) para cubrir `span` con unas 4-8 divisiones */
export function niceStep(span: number): number {
  const raw = span / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

const W = 420;
const ZETAS = [0.1, 0.2, 0.4, 0.6, 0.8];

interface View {
  cx: number;
  cy: number;
  /** mitad del ancho visible, en rad/s */
  half: number;
}

function fitView(roots: Root[]): View {
  const m = Math.max(...roots.map((r) => Math.max(Math.abs(r.re), Math.abs(r.im))), 0);
  return { cx: 0, cy: 0, half: (m || 1) * 1.25 };
}

export function PzMap({ plots, labels, compact }: { plots: SimPlot[]; labels: Map<string, string>; compact?: boolean }) {
  const roots = useMemo(() => plots.flatMap((p, i) => pzRoots(p, i)), [plots]);
  const [view, setView] = useState<View>(() => fitView(roots));
  const [hz, setHz] = useState(true);
  const [guides, setGuides] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; v: View } | null>(null);

  const k = W / 2 / view.half; // píxeles por rad/s
  const px = (re: number) => W / 2 + (re - view.cx) * k;
  const py = (im: number) => W / 2 - (im - view.cy) * k;
  const unit = (w: number) => (hz ? w / (2 * Math.PI) : w);
  const unitLabel = hz ? 'Hz' : 'rad/s';
  const step = niceStep(view.half * 2);
  const ticks = (c: number) => {
    const out: number[] = [];
    for (let v = Math.ceil((c - view.half) / step) * step; v <= c + view.half; v += step) out.push(+v.toPrecision(12));
    return out;
  };
  const many = plots.length > 1;
  const colorOf = (r: Root) => (many ? PALETTE[r.run % PALETTE.length] : r.kind === 'pole' ? 'var(--err)' : 'var(--accent)');
  const unstable = roots.filter((r) => r.kind === 'pole' && r.re > 1e-12 * Math.max(1, Math.abs(r.im)));

  // rueda: zoom alrededor del cursor (listener nativo: React la registra como pasiva)
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const el = svg.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const b = el.getBoundingClientRect();
      const kk = W / 2 / v.half;
      const at = { re: v.cx + (((e.clientX - b.left) / b.width) * W - W / 2) / kk, im: v.cy - (((e.clientY - b.top) / b.height) * W - W / 2) / kk };
      const f = Math.exp(e.deltaY * 0.0015);
      setView({ cx: at.re - (at.re - v.cx) * f, cy: at.im - (at.im - v.cy) * f, half: v.half * f });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);


  const exportCsv = () => {
    const rows = roots.map((r) => ({ r, i: rootInfo(r) }));
    const cols = [
      { name: 'corrida', ys: rows.map(({ r }) => r.run + 1) },
      { name: 'tipo (1 polo, 0 cero)', ys: rows.map(({ r }) => (r.kind === 'pole' ? 1 : 0)) },
      { name: 're [rad/s]', ys: rows.map(({ r }) => r.re) },
      { name: 'im [rad/s]', ys: rows.map(({ r }) => r.im) },
      { name: 'f0 [Hz]', ys: rows.map(({ i }) => i.f0) },
      { name: 'Q', ys: rows.map(({ i }) => i.q) },
      { name: 'zeta', ys: rows.map(({ i }) => i.zeta) },
    ];
    download('polos-ceros.csv', new Blob([toCsv('n', rows.map(({ r }) => r.n), cols)], { type: 'text/csv' }));
  };
  const exportSvg = () => {
    // estilos en línea para que el archivo se vea igual fuera de la app
    const clone = svg.current!.cloneNode(true) as SVGSVGElement;
    const src = [svg.current!, ...svg.current!.querySelectorAll('*')];
    const dst = [clone, ...clone.querySelectorAll('*')];
    src.forEach((el, i) => {
      const cs = getComputedStyle(el);
      (dst[i] as SVGElement).setAttribute('style', ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-size', 'font-family'].map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'));
    });
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    download('polos-ceros.svg', new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  };

  return (
    <div className={`pz-view${compact ? ' compact' : ''}`}>
      <div className="pz-main">
        <div className="plot-tools">
          <button onClick={() => setView(fitView(roots))} title="Ver todos los polos y ceros">Ajustar</button>
          <label className="check inline">
            <input type="checkbox" checked={hz} onChange={(e) => setHz(e.target.checked)} /> Frecuencias en Hz
          </label>
          <label className="check inline">
            <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> Guías de ζ y ω₀
          </label>
          {!compact && (
            <>
              <button onClick={exportSvg}>SVG</button>
              <button onClick={exportCsv}>CSV</button>
            </>
          )}
        </div>
        {unstable.length > 0 && <p className="hint warn">{unstable.length === 1 ? 'Hay un polo' : `Hay ${unstable.length} polos`} en el semiplano derecho: el circuito es inestable.</p>}
        <svg
          ref={svg}
          className="pz-plane"
          viewBox={`0 0 ${W} ${W}`}
          role="img"
          aria-label="Mapa de polos y ceros"
          onPointerDown={(e) => {
            (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, v: view };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const b = svg.current!.getBoundingClientRect();
            const kk = (W / b.width) / k;
            setView({ ...d.v, cx: d.v.cx - (e.clientX - d.x) * kk, cy: d.v.cy + (e.clientY - d.y) * kk });
          }}
          onPointerUp={() => (drag.current = null)}
          onDoubleClick={() => setView(fitView(roots))}
        >
          <defs>
            <clipPath id="pz-clip">
              <rect x={0} y={0} width={W} height={W} />
            </clipPath>
          </defs>
          <g clipPath="url(#pz-clip)">
            {/* semiplano derecho (inestable) */}
            <rect className="rhp" x={Math.max(0, px(0))} y={0} width={Math.max(0, W - Math.max(0, px(0)))} height={W} />
            {ticks(view.cx).map((v) => (
              <line key={`gx${v}`} className="grid" x1={px(v)} y1={0} x2={px(v)} y2={W} />
            ))}
            {ticks(view.cy).map((v) => (
              <line key={`gy${v}`} className="grid" x1={0} y1={py(v)} x2={W} y2={py(v)} />
            ))}
            {guides && (
              <g className="guides">
                {ZETAS.map((z) => {
                  const a = Math.acos(z);
                  const r = view.half * 4;
                  return [1, -1].map((sg) => <line key={`${z}${sg}`} x1={px(0)} y1={py(0)} x2={px(-r * Math.cos(a))} y2={py(sg * r * Math.sin(a))} />);
                })}
                {ticks(0)
                  .filter((v) => v > 0)
                  .map((v) => (
                    <circle key={`w${v}`} cx={px(0)} cy={py(0)} r={v * k} />
                  ))}
              </g>
            )}
            <line className="axis" x1={0} y1={py(0)} x2={W} y2={py(0)} />
            <line className="axis" x1={px(0)} y1={0} x2={px(0)} y2={W} />
            {roots.map((r, i) => {
              const x = px(r.re);
              const y = py(r.im);
              const s = hover === i ? 7 : 5;
              const info = rootInfo(r);
              const label = `${r.kind === 'pole' ? 'Polo' : 'Cero'} ${r.n}${many ? ` · ${labels.get(plots[r.run].name) ?? plots[r.run].name}` : ''}: s = ${si(r.re)} ${r.im < 0 ? '−' : '+'} j${si(Math.abs(r.im))} rad/s · f₀ = ${si(info.f0)}Hz${Number.isFinite(info.q) ? ` · Q = ${si(info.q, 3)} · ζ = ${si(info.zeta, 3)}` : ''}`;
              return (
                <g key={i} className={`root ${r.kind}${hover === i ? ' hl' : ''}`} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} style={{ color: colorOf(r) }}>
                  <title>{label}</title>
                  {r.kind === 'pole' ? <path d={`M ${x - s} ${y - s} L ${x + s} ${y + s} M ${x - s} ${y + s} L ${x + s} ${y - s}`} /> : <circle cx={x} cy={y} r={s} />}
                  {/* zona de hover más grande que la marca */}
                  <circle cx={x} cy={y} r={10} className="hit" />
                </g>
              );
            })}
          </g>
          {/* escalas */}
          {ticks(view.cx).map((v) => (
            <text key={`tx${v}`} className="tick" x={px(v)} y={W - 4} textAnchor="middle">
              {si(unit(v), 3)}
            </text>
          ))}
          {ticks(view.cy).map((v) => (
            <text key={`ty${v}`} className="tick" x={4} y={py(v) - 3}>
              {si(unit(v), 3)}
            </text>
          ))}
          <text className="tick" x={W - 4} y={12} textAnchor="end">
            σ, jω [{hz ? 'Hz (÷2π)' : 'rad/s'}]
          </text>
        </svg>
        {many && (
          <div className="run-legend">
            {plots.map((p, i) => (
              <span key={p.name} style={{ color: PALETTE[i % PALETTE.length] }}>
                ● {labels.get(p.name) ?? p.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <table className="scalars pz-table">
        <thead>
          <tr>
            {many && <th>Corrida</th>}
            <th />
            <th>s [rad/s]</th>
            <th>f₀ [{unitLabel}]</th>
            <th>Q</th>
            <th>ζ</th>
            <th>τ</th>
          </tr>
        </thead>
        <tbody>
          {roots.map((r, i) => {
            const info = rootInfo(r);
            return (
              <tr key={i} className={hover === i ? 'hl' : undefined} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                {many && <td style={{ color: PALETTE[r.run % PALETTE.length] }}>{labels.get(plots[r.run].name) ?? plots[r.run].name}</td>}
                <th>{r.kind === 'pole' ? `× polo ${r.n}` : `○ cero ${r.n}`}</th>
                <td>
                  {si(r.re)} {r.im < 0 ? '−' : '+'} j{si(Math.abs(r.im))}
                </td>
                <td>{si(hz ? info.f0 : info.w0)}</td>
                <td>{Number.isFinite(info.q) ? si(info.q, 3) : '—'}</td>
                <td>{Number.isFinite(info.zeta) ? si(info.zeta, 3) : '—'}</td>
                <td>{Number.isFinite(info.tau) ? `${si(info.tau, 3)}s` : '∞'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
