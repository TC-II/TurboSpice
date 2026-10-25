import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Curve } from './curves.ts';
import { formatRadix, type Radix } from './digital.ts';
import { si } from './series.ts';
import { wheelZoom } from './scales.ts';
import { cursorForClick, type Cursors } from './view.ts';
import { t } from '../i18n/i18n.ts';

type Range = [number, number];

const LANE = 26;
const AXIS = 22;
// (los mismos márgenes que el área de dibujo de uPlot en los paneles analógicos: así el tiempo
// queda alineado entre paneles)
const LABEL = 72;
const RIGHT = 25;

/** Tramos en que el valor no cambia: [desde, hasta, valor] (NaN y 0,5 son desconocido o Z) */
function runs(x: Float64Array, y: Float64Array, from: number, to: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const n = Math.min(x.length, y.length);
  if (!n) return out;
  // primer punto que importa: el último antes de `from`
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (x[mid] <= from) lo = mid;
    else hi = mid - 1;
  }
  let start = Math.max(from, x[lo]);
  let v = y[lo];
  for (let k = lo + 1; k < n && x[k] <= to; k++) {
    const w = y[k];
    if (w === v || (Number.isNaN(w) && Number.isNaN(v))) continue;
    out.push([start, x[k], v]);
    start = x[k];
    v = w;
  }
  out.push([start, Math.min(to, x[n - 1]), v]);
  return out;
}

/** Marcas "lindas" del eje X: 1, 2 o 5 × 10^n */
function niceTicks(a: number, b: number, n = 6): number[] {
  const span = b - a;
  if (!(span > 0)) return [];
  const raw = span / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

/**
 * Panel digital (#209): un carril por señal, como un analizador lógico. Un bit se dibuja alto o
 * bajo (desconocido o Z: una raya al medio); un bus, como tramos con su valor en el radix de la
 * traza. Comparte con los paneles analógicos el rango en X, el zoom y los cursores.
 */
export function DigitalLanes({ x, curves, radix, xRange, cursors, cursorMode, onCursor, onZoom, onWheelZoom, pendingX, onHover }: {
  x: Float64Array;
  curves: Curve[];
  /** radix de cada traza (por índice de traza del panel) */
  radix(trace: number): Radix | undefined;
  xRange: Range | null;
  cursors: Cursors;
  cursorMode: boolean;
  onCursor(c: Partial<Cursors>): void;
  onZoom(r: Range | null): void;
  onWheelZoom(r: Range | null): void;
  /** rango de X pedido por la rueda y todavía no aplicado (v: null = sin zoom) */
  pendingX?(): { v: Range | null } | undefined;
  /** índice del punto bajo el mouse (para los valores de la leyenda) */
  onHover(i: number | null): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const clip = `dl-clip-${useId().replace(/:/g, '')}`;
  const [width, setWidth] = useState(600);
  const [mouse, setMouse] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const shown = curves.filter((c) => !c.hidden);
  const full: Range = [x[0] ?? 0, x[x.length - 1] ?? 1];
  const [x0, x1] = xRange ?? full;
  const W = Math.max(50, width - LABEL - RIGHT);
  const px = (v: number) => LABEL + ((v - x0) / (x1 - x0 || 1)) * W;
  const val = (p: number) => x0 + ((p - LABEL) / W) * (x1 - x0);
  const H = shown.length * LANE + AXIS;
  const ticks = useMemo(() => niceTicks(x0, x1, Math.max(2, Math.round(W / 110))), [x0, x1, W]);
  const nearest = (v: number) => {
    let lo = 0;
    let hi = x.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (x[mid] <= v) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const local = (e: React.PointerEvent | React.MouseEvent | React.WheelEvent) => e.clientX - (host.current?.getBoundingClientRect().left ?? 0);

  return (
    <div
      className={`pane-chart digital-lanes${cursorMode ? ' cursor-mode' : ''}`}
      ref={host}
      style={{ height: H, flex: 'none' }}
      onPointerMove={(e) => {
        const p = local(e);
        if (p < LABEL) return (setMouse(null), onHover(null));
        setMouse(p);
        onHover(nearest(val(p)));
        if (drag) setDrag({ ...drag, b: p });
      }}
      onPointerLeave={() => (setMouse(null), onHover(null))}
      onPointerDown={(e) => {
        const p = local(e);
        if (p < LABEL || e.button !== 0) return;
        if (cursorMode) {
          const v = val(p);
          const k = cursorForClick(cursors, v, e.shiftKey, (c) => Math.abs(px(c) - p));
          return onCursor({ [k]: v, sel: k });
        }
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDrag({ a: p, b: p });
      }}
      onPointerUp={() => {
        if (drag && Math.abs(drag.b - drag.a) > 5) onZoom([val(Math.min(drag.a, drag.b)), val(Math.max(drag.a, drag.b))]);
        setDrag(null);
      }}
      onDoubleClick={() => !cursorMode && onZoom(null)}
      onWheel={(e) => {
        const p = local(e);
        if (p < LABEL) return;
        // (parte de lo pedido y todavía no aplicado: varios eventos por cuadro se acumulan)
        const pend = pendingX?.();
        const [s0, s1] = pend ? (pend.v ?? full) : [x0, x1];
        const c = s0 + ((p - LABEL) / W) * (s1 - s0);
        const k = wheelZoom(e);
        const a = c - (c - s0) * k;
        const b = c + (s1 - c) * k;
        onWheelZoom(a <= full[0] && b >= full[1] ? null : [Math.max(full[0], a), Math.min(full[1], b)]);
      }}
    >
      <svg width={width} height={H} role="img" aria-label={t('Digital signals')}>
        <defs>
          <clipPath id={clip}>
            <rect x={LABEL} y={0} width={W} height={H} />
          </clipPath>
          <clipPath id={`${clip}-names`}>
            <rect x={0} y={0} width={LABEL - 4} height={H} />
          </clipPath>
        </defs>
        {ticks.map((v) => (
          <g key={v} className="dl-tick">
            <line x1={px(v)} x2={px(v)} y1={0} y2={H - AXIS} />
            <text x={px(v)} y={H - 6} textAnchor="middle">
              {si(v, 3)}
            </text>
          </g>
        ))}
        {shown.map((c, i) => {
          const top = i * LANE + 4;
          const bot = top + LANE - 8;
          const mid = (top + bot) / 2;
          const bits = c.bits ?? 1;
          const segs = runs(x, c.y, x0, x1);
          return (
            <g key={`${c.trace}-${c.run}`} className="dl-lane">
              {/* el nombre, alineado a la derecha del margen (si no entra, se ve el final) */}
              <text className="dl-name" x={LABEL - 6} y={mid + 4} textAnchor="end" fill={c.color} clipPath={`url(#${clip}-names)`}>
                <title>{c.label}</title>
                {c.label.replace(/^Dig\((.*)\)$/i, '$1')}
              </text>
              <g clipPath={`url(#${clip})`} stroke={c.color} fill="none" strokeWidth={1.5}>
                {bits === 1 ? (
                  <path
                    d={segs
                      .map(([a, b, v], k) => {
                        const y = v === 1 ? top : v === 0 ? bot : mid;
                        return `${k ? 'L' : 'M'}${px(a)},${y}H${px(b)}`;
                      })
                      .join('')}
                  />
                ) : (
                  segs.map(([a, b, v], k) => {
                    const xa = px(a);
                    const xb = px(b);
                    const s = Math.min(3, (xb - xa) / 2);
                    const label = formatRadix(v, bits, c.trace >= 0 ? (radix(c.trace) ?? 'hex') : 'hex');
                    const unknown = !Number.isFinite(v);
                    return (
                      <g key={k} className={unknown ? 'dl-x' : undefined}>
                        <path d={`M${xa},${mid}L${xa + s},${top}H${xb - s}L${xb},${mid}L${xb - s},${bot}H${xa + s}Z`} />
                        {xb - xa > label.length * 7 + 6 && (
                          <text className="dl-value" x={(xa + xb) / 2} y={mid + 4} textAnchor="middle">
                            {label}
                          </text>
                        )}
                      </g>
                    );
                  })
                )}
              </g>
            </g>
          );
        })}
        {(['a', 'b'] as const).map((k) =>
          cursors[k] !== undefined && cursors[k]! >= x0 && cursors[k]! <= x1 ? (
            <g key={k} className="dl-cursor">
              <line x1={px(cursors[k]!)} x2={px(cursors[k]!)} y1={0} y2={H - AXIS} />
              <text x={px(cursors[k]!) + 3} y={10}>
                {k.toUpperCase()}
              </text>
            </g>
          ) : null,
        )}
        {mouse !== null && <line className="dl-hover" x1={mouse} x2={mouse} y1={0} y2={H - AXIS} />}
        {drag && <rect className="dl-select" x={Math.min(drag.a, drag.b)} y={0} width={Math.abs(drag.b - drag.a)} height={H - AXIS} />}
      </svg>
    </div>
  );
}
