import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { SimPlot, SimVector } from '../engine/ngspice.ts';
import { displayName, isLogScale, project, resample, scaleOf, si, type ComplexView } from './series.ts';

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
    const data: uPlot.AlignedData = [scale.real, ...curves.map((c) => c.y)];
    // Como LTspice: tensiones en el eje izquierdo y corrientes en el derecho
    const isCurrent = (v: SimVector) => displayName(v).startsWith('I');
    const hasV = vectors.some((v) => !isCurrent(v));
    const hasI = vectors.some(isCurrent);
    const yScale = (v: SimVector) => (isCurrent(v) && hasV ? 'i' : 'y');
    const ticks = (_u: uPlot, t: number[]) => t.map((x) => si(x, 3));
    const opts: uPlot.Options = {
      width: el.clientWidth,
      height: height(),
      scales: { x: { time: false, distr: log ? 3 : 1 } },
      axes: [
        {
          // en escala log uPlot pasa null en las marcas sin etiqueta; etiquetamos sólo décadas
          values: (_u, ticks) =>
            ticks.map((t) =>
              t == null || (log && Math.abs(Math.log10(t) - Math.round(Math.log10(t))) > 1e-9) ? '' : si(t, 3),
            ),
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
    const u = new uPlot(opts, data, el);
    const ro = new ResizeObserver(() => u.setSize({ width: el.clientWidth, height: height() }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      u.destroy();
    };
  }, [plot, vectors, view, runs, labels]);

  return <div className="plot" ref={host} />;
}
