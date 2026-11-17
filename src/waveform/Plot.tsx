import { winOf } from '../ui/hostWindow.ts';
import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import { mountIn } from './plotShared.ts';
import 'uplot/dist/uPlot.min.css';
import type { SimPlot, SimVector } from '../engine/ngspice.ts';
import { exactRange } from './scales.ts';
import { logAxis } from './logAxis.ts';
import { axisSpace, axisTicks, displayName, isLogScale, project, resample, scaleOf, si, type ComplexView } from './series.ts';

const PALETTE = ['#2f6fdb', '#d9480f', '#2b8a3e', '#ae3ec9', '#e67700', '#0b7285', '#c2255c', '#5c940d'];

interface Props {
  plot: SimPlot;
  vectors: SimVector[];
  view: ComplexView;
  /** Corridas a superponer (barridos de .control); incluye a `plot` */
  runs?: SimPlot[];
  /** etiqueta de cada corrida (.step: "R=2k") */
  labels?: Map<string, string>;
}

export function Plot({ plot, vectors, view, runs, labels }: Props) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    const scale = scaleOf(plot);
    if (!el || !scale || vectors.length === 0) return;

    const log = isLogScale(plot);
    // uPlot dibuja en canvas: hay que resolver los tokens CSS a colores concretos
    const css = getComputedStyle(el);
    const muted = css.getPropertyValue('--fg-muted').trim();
    const grid = css.getPropertyValue('--grid').trim();
    const height = () => Math.max(240, el.clientHeight - 50);
    // Cada vector en cada corrida, llevado al eje X de `plot`
    const all = runs && runs.length > 1 ? runs : [plot];
    const curves: { v: SimVector; label: string; y: Float64Array }[] = [];
    all.forEach((r) => {
      const rs = scaleOf(r);
      for (const v of vectors) {
        const rv = r.vectors.find((x) => x.name === v.name);
        if (!rv || !rs) continue;
        const y = project(rv, view);
        curves.push({
          v: rv,
          label: displayName(rv) + (all.length > 1 ? ` · ${labels?.get(r.name) ?? r.name}` : ''),
          y: r === plot ? y : resample(rs.real, y, scale.real),
        });
      }
    });
    // (-Infinity, el dB de 0, no va a uPlot: se convierte en hueco, como en PaneView)
    const data: uPlot.AlignedData = [scale.real, ...curves.map((c) => (c.y.every(Number.isFinite) ? c.y : Array.from(c.y, (v) => (Number.isFinite(v) ? v : null))))];
    // Como LTspice: tensiones en el eje izquierdo y corrientes en el derecho
    const isCurrent = (v: SimVector) => displayName(v).startsWith('I');
    const hasV = vectors.some((v) => !isCurrent(v));
    const hasI = vectors.some(isCurrent);
    const yScale = (v: SimVector) => (isCurrent(v) && hasV ? 'i' : 'y');
    const ticks = (_u: uPlot, t: number[]) => axisTicks(t);
    const opts: uPlot.Options = {
      width: el.clientWidth,
      height: height(),
      scales: { x: { time: false, distr: log ? 3 : 1, range: (_u, min, max) => exactRange(min, max, log) as uPlot.Range.MinMax } },
      axes: [
        {
          // (log: marcas propias, que no se quedan sin números con mucho zoom)
          ...(log ? logAxis('x') : { space: (_u: uPlot, _i: number, min: number, max: number) => axisSpace(min, max), values: (_u: uPlot, tt: number[]) => axisTicks(tt) }),
          stroke: muted,
          grid: { stroke: grid },
        },
        { scale: 'y', values: ticks, stroke: muted, grid: { stroke: grid }, size: 60, label: view === 'phase' ? '°' : hasV ? 'V' : 'A' },
        ...(hasV && hasI ? [{ scale: 'i', side: 1, values: ticks, stroke: muted, grid: { show: false }, size: 60, label: 'A' } as uPlot.Axis] : []),
      ],
      series: [
        { label: scale.name, value: (_u, x) => (x == null ? '—' : si(x)) },
        ...curves.map(({ v, label }, i) => ({
          label,
          scale: yScale(v),
          stroke: PALETTE[i % PALETTE.length],
          width: 1.5,
          value: (_u: uPlot, y: number | null) => (y == null ? '—' : si(y)),
        })),
      ],
      cursor: { drag: { x: true, y: true, uni: 20 } },
    };
    const u = new uPlot(opts, data, mountIn(el));
    const ro = new (winOf(el).ResizeObserver)(() => u.setSize({ width: el.clientWidth, height: height() }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      u.destroy();
    };
  }, [plot, vectors, view, runs, labels]);

  return <div className="plot" ref={host} />;
}
