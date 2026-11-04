// Lo que el visor dibuja sobre el canvas de uPlot además de las curvas: el eje que acerca la rueda,
// el muestreo de la DFT, las marcas de polos y ceros, los markers y los cursores con sus lecturas.
import uPlot from 'uplot';
import type { Curve, PaneData } from './curves.ts';
import { valueAt } from './measure.ts';
import type { Cursors } from './view.ts';
import { delta, horizontalCuts, markerName, sameMarker, verticalCuts, type Marker } from './markers.ts';
import { t } from '../i18n/i18n.ts';
import { type PzMark, AXIS_X_BAND, AXIS_Y_BAND, fmt, phaseOf, xUnit } from './plotShared.ts';

/** etiqueta que se edita con un click (en px del canvas): las de las líneas V y H y las de los cursores */
export interface LabelHit {
  x: number;
  y: number;
  w: number;
  h: number;
  value: number;
  commit(v: number): void;
}

/** el eje que acerca la rueda, levemente resaltado */
export function drawAxisHover(u: uPlot, ctx: CanvasRenderingContext2D, axisHover: 'left' | 'right' | 'bottom', fg: string) {
  const { left, top, width, height } = u.bbox;
  // (la franja resaltada es la misma que responde a la rueda; el bbox va en píxeles del canvas)
  const px = uPlot.pxRatio;
  ctx.save();
  ctx.fillStyle = fg;
  ctx.globalAlpha = 0.08;
  if (axisHover === 'left') ctx.fillRect(left - AXIS_Y_BAND * px, top, AXIS_Y_BAND * px, height);
  else if (axisHover === 'bottom') ctx.fillRect(left, top + height, width, AXIS_X_BAND * px);
  else ctx.fillRect(left + width, top, AXIS_Y_BAND * px, height);
  ctx.restore();
}

/** muestreo de la DFT que se está armando: lo que queda afuera, sombreado; adentro, un punto en cada
 * muestra de cada curva (si están a más de 4 px una de otra) */
export function drawSamples(u: uPlot, ctx: CanvasRenderingContext2D, data: PaneData, sm: { from: number; to: number; fs: number; n: number }, fg: string, color: string) {
  const { left, top, width, height } = u.bbox;
  const dpr = devicePixelRatio;
  const clampX = (v: number) => Math.min(left + width, Math.max(left, u.valToPos(v, 'x', true)));
  const a = clampX(sm.from);
  const b = clampX(sm.from + (sm.n - 1) / sm.fs);
  ctx.save();
  ctx.fillStyle = fg;
  ctx.globalAlpha = 0.07;
  ctx.fillRect(left, top, a - left, height);
  ctx.fillRect(b, top, left + width - b, height);
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = color;
  ctx.lineWidth = dpr;
  ctx.setLineDash([4 * dpr, 3 * dpr]);
  for (const x of [a, b]) {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + height);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const { min, max } = u.scales.x;
  if (min != null && max != null) {
    const k0 = Math.max(0, Math.ceil((min - sm.from) * sm.fs));
    const k1 = Math.min(sm.n - 1, Math.floor((max - sm.from) * sm.fs));
    const gap = width / ((max - min) * sm.fs);
    if (k1 >= k0 && gap >= 4 * dpr) {
      u.root.dataset.samples = String(k1 - k0 + 1);
      for (const c of data.curves) {
        if (c.hidden) continue;
        ctx.fillStyle = c.color;
        for (let k = k0; k <= k1; k++) {
          const tk = sm.from + k / sm.fs;
          const py = u.valToPos(valueAt(data.x, c.y, tk), c.axis, true);
          if (!Number.isFinite(py) || py < top || py > top + height) continue;
          ctx.beginPath();
          ctx.arc(u.valToPos(tk, 'x', true), py, Math.min(3, gap / (3 * dpr)) * dpr, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }
  }
  ctx.restore();
}

/** f₀ de polos (×) y ceros (○): líneas verticales punteadas */
export function drawPzMarks(u: uPlot, ctx: CanvasRenderingContext2D, marks: PzMark[], markColor: Record<PzMark['kind'], string>) {
  for (const m of marks) {
    const px = u.valToPos(m.f, 'x', true);
    if (!(px >= u.bbox.left && px <= u.bbox.left + u.bbox.width)) continue;
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = markColor[m.kind];
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([2, 3].map((d) => d * devicePixelRatio));
    ctx.lineWidth = devicePixelRatio;
    ctx.beginPath();
    ctx.moveTo(px, u.bbox.top);
    ctx.lineTo(px, u.bbox.top + u.bbox.height);
    ctx.stroke();
    ctx.font = `${11 * devicePixelRatio}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(m.kind === 'pole' ? '×' : '○', px, u.bbox.top + u.bbox.height - 4 * devicePixelRatio);
    ctx.restore();
  }
}

/** markers de este panel (puntos, líneas V y H, el par A/D) con sus lecturas */
export function drawMarkers(
  u: uPlot,
  ctx: CanvasRenderingContext2D,
  data: PaneData,
  L: { markers: Marker[]; selMarker: Pick<Marker, 'kind' | 'id'> | null; onMoveMarker(m: Marker, patch: Partial<Marker>): void },
  k: { fg: string; bg: string; accent: string; unitOf(c: Curve): string },
  hits: LabelHit[],
) {
  const list = L.markers;
  // (para los e2e: el canvas no se puede leer)
  u.root.dataset.markers = list.map(markerName).join('|');
  if (!list.length) return;
  const dpr = devicePixelRatio;
  const { left, top, width, height } = u.bbox;
  const xu = xUnit(data.xName);
  const inX = (px: number) => px >= left && px <= left + width;
  const inY = (py: number) => py >= top && py <= top + height;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, width, height);
  ctx.clip();
  ctx.font = `${11 * dpr}px system-ui`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  /** recuadro con texto junto a (x, y): arriba a la derecha si entra */
  const label = (lines: string[], x: number, y: number, color: string, edit?: { value: number; commit(v: number): void }) => {
    const lh = 14 * dpr;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 8 * dpr;
    const h = lh * lines.length + 4 * dpr;
    let bx = x + 6 * dpr;
    if (bx + w > left + width) bx = x - w - 6 * dpr;
    let by = y - h - 6 * dpr;
    if (by < top) by = y + 6 * dpr;
    by = Math.min(by, top + height - h);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = k.bg;
    ctx.fillRect(bx, by, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = dpr;
    ctx.setLineDash([]);
    ctx.strokeRect(bx, by, w, h);
    ctx.fillStyle = k.fg;
    lines.forEach((l, n) => ctx.fillText(l, bx + 4 * dpr, by + lh * (n + 1) - dpr));
    if (edit) hits.push({ x: bx, y: by, w, h, ...edit });
  };
  const dot = (x: number, y: number, color: string, r = 3.5) => {
    if (!inX(x) || !inY(y)) return;
    ctx.beginPath();
    ctx.arc(x, y, r * dpr, 0, 2 * Math.PI);
    ctx.fillStyle = k.bg;
    ctx.fill();
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = color;
    ctx.setLineDash([]);
    ctx.stroke();
  };
  const stroke = (x0: number, y0: number, x1: number, y1: number, color: string, w: number, dash: number[]) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w * dpr;
    ctx.setLineDash(dash.map((d) => d * dpr));
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };
  const curveOf = (m: Marker) => data.curves.find((c) => c.label === m.trace && !c.hidden);
  /** posición en el canvas de un marker de punto (M, A, D) */
  const pointOf = (m: Marker) => {
    const c = curveOf(m);
    if (!c || m.x === undefined) return null;
    const y = valueAt(data.x, c.y, m.x);
    return { c, y, px: u.valToPos(m.x, 'x', true), py: u.valToPos(y, c.axis, true) };
  };
  for (const m of list) {
    const sel = !!L.selMarker && sameMarker(m, L.selMarker);
    const color = sel ? k.accent : k.fg;
    if (m.kind === 'v') {
      const px = u.valToPos(m.x!, 'x', true);
      if (!inX(px)) continue;
      stroke(px, top, px, top + height, color, sel ? 2 : 1.25, [6, 3]);
      label([`${markerName(m)}  ${fmt(m.x!, xu)}`], px, top, color, { value: m.x!, commit: (x) => L.onMoveMarker(m, { x }) });
      for (const cut of verticalCuts(m.x!, data.x, data.curves)) {
        const c = data.curves.find((o) => o.label === cut.label)!;
        const py = u.valToPos(cut.y, cut.axis, true);
        dot(px, py, c.color);
        if (sel && inY(py)) label([fmt(cut.y, k.unitOf(c))], px, py, c.color);
      }
    } else if (m.kind === 'h') {
      const axis = m.axis ?? 'y';
      const py = u.valToPos(m.y!, axis, true);
      if (!inY(py)) continue;
      stroke(left, py, left + width, py, color, sel ? 2 : 1.25, [6, 3]);
      const unit = axis === 'ph' ? '°' : axis === 'i' ? data.iUnit : data.yUnit;
      // (el nombre a la derecha: a la izquierda suelen estar los cortes)
      label([`${markerName(m)}  ${fmt(m.y!, unit)}`], left + width, py, color, { value: m.y!, commit: (y) => L.onMoveMarker(m, { y }) });
      for (const cut of horizontalCuts(m.y!, axis, data.x, data.curves, 32)) {
        const c = data.curves.find((o) => o.label === cut.label)!;
        const px = u.valToPos(cut.x, 'x', true);
        dot(px, py, c.color);
        if (sel && inX(px)) label([fmt(cut.x, xu)], px, py, c.color);
      }
    } else {
      const p = pointOf(m);
      if (!p) continue;
      dot(p.px, p.py, p.c.color, sel ? 5 : 4);
      if (inX(p.px) && inY(p.py)) label([`${markerName(m)}: ${fmt(m.x!, xu)}, ${fmt(p.y, k.unitOf(p.c))}`], p.px, p.py, sel ? k.accent : p.c.color);
    }
  }
  // A y D en este panel: la recta entre los dos y las diferencias
  const a = list.find((m) => m.kind === 'a');
  const d = list.find((m) => m.kind === 'd');
  const pa = a && pointOf(a);
  const pd = d && pointOf(d);
  if (pa && pd && a.x !== undefined && d.x !== undefined) {
    stroke(pa.px, pa.py, pd.px, pd.py, k.accent, 1.25, [2, 3]);
    const dd = delta({ x: a.x, y: pa.y }, { x: d.x, y: pd.y }, data.log);
    label(
      [`Δx ${fmt(dd.dx, xu)}`, `Δy ${fmt(dd.dy, k.unitOf(pd.c))}`, `${data.log ? t('slope per decade') : t('slope')} ${fmt(dd.slope)}`, ...(xu === 's' ? [`1/Δx ${fmt(dd.inv, 'Hz')}`] : [])],
      (pa.px + pd.px) / 2,
      (pa.py + pd.py) / 2,
      k.accent,
    );
  }
  ctx.restore();
}

/** los cursores A y B: la línea, el punto sobre la traza que siguen y su lectura (que se edita con un click) */
export function drawCursors(
  u: uPlot,
  ctx: CanvasRenderingContext2D,
  o: {
    data: PaneData;
    index: number;
    c: Cursors;
    previewX: number | undefined;
    fg: string;
    bg: string;
    unitOf(c: Curve): string;
    hits: LabelHit[];
    onCursor(c: Cursors): void;
  },
) {
  const { data, index, c, previewX, fg, bg, unitOf, hits, onCursor } = o;
  const dpr = devicePixelRatio;
  const { left, top, width, height } = u.bbox;
  const pa = c.a === undefined && c.b === undefined ? previewX : c.a;
  for (const [name, v, tr] of [
    ['A', pa, c.ta],
    ['B', c.b, c.tb],
  ] as const) {
    if (v === undefined) continue;
    const px = u.valToPos(v, 'x', true);
    if (!(px >= left && px <= left + width)) continue;
    ctx.save();
    ctx.strokeStyle = fg;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(px, top);
    ctx.lineTo(px, top + height);
    ctx.stroke();
    ctx.font = `${12 * dpr}px system-ui`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // lectura junto al cursor: x y, si sigue una traza de este panel, su valor
    const lines = [`${name}  ${fmt(v, xUnit(data.xName))}`];
    const curve = tr !== undefined ? data.curves.find((k) => k.label === tr && !k.hidden) : undefined;
    let boxY = top + 4 * dpr;
    if (curve) {
      const y = valueAt(data.x, curve.y, v);
      const ph = phaseOf(data, curve);
      lines.push(`${curve.label}: ${fmt(y, unitOf(curve))}${ph ? `  ${fmt(valueAt(data.x, ph.y, v), '°')}` : ''}`);
      const py = u.valToPos(y, curve.axis, true);
      if (Number.isFinite(py) && py >= top && py <= top + height) {
        ctx.strokeStyle = curve.color;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(left, py);
        ctx.lineTo(left + width, py);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = curve.color;
        ctx.beginPath();
        ctx.arc(px, py, 4 * dpr, 0, 2 * Math.PI);
        ctx.fill();
        boxY = Math.min(Math.max(top + 4 * dpr, py - 40 * dpr), top + height - 40 * dpr);
      }
    } else if (tr !== undefined || index !== 0) {
      // sin traza en este panel: la lectura de x va sólo en el primero
      lines.length = 0;
    }
    if (lines.length) {
      const lh = 15 * dpr;
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 8 * dpr;
      const bx = px + w + 6 * dpr > left + width ? px - w - 4 * dpr : px + 4 * dpr;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = bg;
      ctx.fillRect(bx, boxY, w, lh * lines.length + 4 * dpr);
      // (el preliminar, que sigue al mouse, no se edita)
      const key = name === 'A' ? 'a' : 'b';
      if (c[key] !== undefined) hits.push({ x: bx, y: boxY, w, h: lh * lines.length + 4 * dpr, value: v, commit: (x) => onCursor({ [key]: x, sel: key }) });
      ctx.globalAlpha = 1;
      ctx.fillStyle = fg;
      lines.forEach((l, k) => ctx.fillText(l, bx + 4 * dpr, boxY + lh * (k + 1) - 2 * dpr));
    }
    ctx.restore();
  }
}
