// PNG de los paneles y lecturas de los markers en texto.
import uPlot from 'uplot';
import type { PaneData } from './curves.ts';
import type { Pane } from './view.ts';
import { delta, horizontalCuts, markerName, markerValue, verticalCuts, type Marker, type MarkerAxis } from './markers.ts';
import { fix, xUnit } from './plotShared.ts';

/** PNG con todos los paneles apilados y la leyenda de cada uno */
export async function exportPng(panes: Pane[], data: PaneData[], charts: Map<number, uPlot>): Promise<Blob | null> {
  const list = panes.map((_, i) => charts.get(i)).filter((u): u is uPlot => !!u);
  if (!list.length) return null;
  const dpr = devicePixelRatio;
  const legendH = 22 * dpr;
  const w = Math.max(...list.map((u) => u.ctx.canvas.width));
  const h = list.reduce((s, u) => s + u.ctx.canvas.height + legendH, 0);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const css = getComputedStyle(document.documentElement);
  ctx.fillStyle = css.getPropertyValue('--bg').trim() || '#fff';
  ctx.fillRect(0, 0, w, h);
  let y = 0;
  panes.forEach((_, i) => {
    const u = charts.get(i);
    if (!u) return;
    ctx.font = `${13 * dpr}px system-ui, sans-serif`;
    let x = 8 * dpr;
    for (const c of data[i].curves.filter((c) => !c.hidden && c.run === 0)) {
      ctx.fillStyle = c.color;
      ctx.fillText(c.label, x, y + 16 * dpr);
      x += ctx.measureText(c.label).width + 16 * dpr;
    }
    y += legendH;
    // uPlot dibuja ejes y curvas en su canvas (sin fondo)
    ctx.drawImage(u.ctx.canvas, 0, y);
    y += u.ctx.canvas.height;
  });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** Lecturas de los markers (cada punto, los cortes de cada línea y D − A): las dibuja el gráfico; acá van
 * en texto a data-marker-readings, para los e2e (el canvas no se puede leer) */
export function markerReadings(markers: Marker[], data: PaneData[]): string[] {
  const rows: { m: Marker; trace: string; color?: string; x: string; y: string }[] = [];
  const unitOf = (d: PaneData, axis: MarkerAxis) => (axis === 'ph' ? '°' : axis === 'i' ? d.iUnit : d.yUnit);
  let a: { x: number; y: number; d: PaneData; axis: MarkerAxis } | undefined;
  let dm: typeof a;
  for (const m of markers) {
    const d = data[m.pane];
    if (!d) continue;
    const xu = xUnit(d.xName);
    if (m.kind === 'v')
      for (const c of verticalCuts(m.x!, d.x, d.curves)) rows.push({ m, trace: c.label, color: d.curves.find((o) => o.label === c.label)?.color, x: fix(m.x!, xu), y: fix(c.y, unitOf(d, c.axis)) });
    else if (m.kind === 'h') {
      const cuts = horizontalCuts(m.y!, m.axis ?? 'y', d.x, d.curves, 8);
      if (!cuts.length) rows.push({ m, trace: '—', x: '—', y: fix(m.y!, unitOf(d, m.axis ?? 'y')) });
      for (const c of cuts) rows.push({ m, trace: c.label, color: d.curves.find((o) => o.label === c.label)?.color, x: fix(c.x, xu), y: fix(m.y!, unitOf(d, m.axis ?? 'y')) });
    } else {
      const c = d.curves.find((o) => o.label === m.trace);
      const y = markerValue(m, d.x, d.curves);
      rows.push({ m, trace: m.trace ?? '', color: c?.color, x: fix(m.x!, xu), y: fix(y, c ? unitOf(d, c.axis) : '') });
      if (c && (m.kind === 'a' || m.kind === 'd')) m.kind === 'a' ? (a = { x: m.x!, y, d, axis: c.axis }) : (dm = { x: m.x!, y, d, axis: c.axis });
    }
  }
  const dd = a && dm ? delta(a, dm, dm.d.log) : null;
  const xu = dm ? xUnit(dm.d.xName) : '';
  const out = rows.map((r) => [markerName(r.m), r.trace, r.x.trim(), r.y.trim()].join('|'));
  if (dd && dm) out.push(['D − A', fix(dd.slope).trim(), fix(dd.dx, xu).trim(), fix(dd.dy, unitOf(dm.d, dm.axis)).trim()].join('|'));
  return out;
}
