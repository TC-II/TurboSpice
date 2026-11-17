// Exportar un panel del visor (su menú del botón derecho): los datos en CSV y el gráfico como
// figura de LaTeX, en PDF (con el aspecto de pgfplots: caja, marcas hacia adentro, Latin Modern
// y la leyenda arriba, como el PDF del esquemático) o como un .tex con pgfplots que compila solo
// y se puede retocar. Se baja recién al exportar.
import { curveOn, type Curve, type PaneData } from './curves.ts';
import { toCsv } from './measure.ts';
import { logTicks, niceTicks, type Range } from './scales.ts';
import { axisTicks, si } from './series.ts';
import { xAxisLabel, xAxisUnit } from './plotShared.ts';
import { PALETTE_DARK, PALETTE_LIGHT } from './view.ts';
import { CREATED_WITH, sheetPdf } from '../schematic/exportSchematic.ts';
import { FONTS, loadFont } from '../schematic/fonts.ts';
import { texEscape } from '../schematic/tikz.ts';

/** Lo que se ve del panel: los rangos de los ejes en pantalla y la grilla */
export interface PaneFrame {
  x: Range;
  y: Range;
  /** eje derecho (corrientes o fase), si hay curvas en él */
  r?: Range | null;
  grid: boolean;
  /** alto / ancho del área del gráfico en pantalla: la figura conserva la proporción */
  aspect: number;
}

const unitOf = (d: PaneData, c: Curve) => (c.axis === 'ph' ? '°' : c.axis === 'i' ? d.iUnit : d.yUnit);
/** Nombre de una curva: la traza y su corrida (.step) */
const curveName = (c: Curve) => (c.runLabel ? `${c.label} (${c.runLabel})` : c.label);
const shownCurves = (d: PaneData) => d.curves.filter((c) => !c.hidden);
/** El nombre de la curva en la leyenda, con su unidad si otra curva tiene el mismo (Bode: magnitud y fase) */
function legendName(d: PaneData, c: Curve): string {
  const same = shownCurves(d).filter((o) => curveName(o) === curveName(c)).length > 1;
  const u = unitOf(d, c);
  return same && u ? `${curveName(c)} [${u}]` : curveName(c);
}

/** CSV de las curvas visibles del panel: todo, o sólo lo que cae en `range` de X */
export function paneCsv(d: PaneData, range?: Range | null): string {
  let idx: number[] | null = null;
  if (range) {
    idx = [];
    for (let k = 0; k < d.x.length; k++) if (d.x[k] >= range[0] && d.x[k] <= range[1]) idx.push(k);
  }
  const pick = <T>(a: ArrayLike<T>): ArrayLike<T> => (idx ? idx.map((k) => a[k]) : a);
  const cols = shownCurves(d).map((c) => {
    const u = unitOf(d, c);
    return { name: u ? `${curveName(c)} [${u}]` : curveName(c), ys: pick(curveOn(c, d.x)) };
  });
  const xu = xAxisUnit(d.xName);
  return toCsv(xu ? `${d.xName} [${xu}]` : d.xName, pick(d.x), cols);
}

/** El color de una curva para imprimir: la figura va sobre blanco, con la paleta del tema claro */
export function printColor(c: string): string {
  const k = PALETTE_DARK.indexOf(c.toLowerCase());
  return k >= 0 ? PALETTE_LIGHT[k] : c;
}

/** Posición de un valor en un eje de `len` (0 a len), lineal o logarítmico; NaN si no se puede ubicar */
function scaler([lo, hi]: Range, len: number, log: boolean): (v: number) => number {
  if (log) {
    const [a, b] = [Math.log10(lo), Math.log10(hi)];
    return (v) => (v > 0 ? ((Math.log10(v) - a) / (b - a)) * len : NaN);
  }
  return (v) => ((v - lo) / (hi - lo)) * len;
}

/**
 * Índices de los puntos que se dibujan, por tramos (un valor que falta corta la curva): los del
 * rango visible y uno más a cada lado (la línea llega al borde, lo de afuera lo recorta el clip). Si
 * son muchos, por cada media unidad de `pos` quedan el primero, el mínimo, el máximo y el último:
 * el archivo es liviano y la curva se ve igual.
 */
export function plotIndices(xs: ArrayLike<number>, ys: ArrayLike<number>, pos: (v: number) => number, val: (v: number) => number, [x0, x1]: Range, width: number): number[][] {
  let a = 0;
  while (a < xs.length && xs[a] < x0) a++;
  let b = xs.length - 1;
  while (b > 0 && xs[b] > x1) b--;
  a = Math.max(0, a - 1);
  b = Math.min(xs.length - 1, b + 1);
  const dense = b - a > width * 4;
  const out: number[][] = [];
  let seg: number[] = [];
  let col = NaN;
  let bucket: number[] = [];
  const flush = () => {
    if (!bucket.length) return;
    let lo = bucket[0];
    let hi = bucket[0];
    for (const k of bucket) {
      if (val(ys[k]) < val(ys[lo])) lo = k;
      if (val(ys[k]) > val(ys[hi])) hi = k;
    }
    for (const k of [...new Set([bucket[0], lo, hi, bucket[bucket.length - 1]])].sort((p, q) => p - q)) seg.push(k);
    bucket = [];
  };
  const cut = () => {
    flush();
    if (seg.length) out.push(seg);
    seg = [];
  };
  for (let k = a; k <= b; k++) {
    const px = pos(xs[k]);
    if (!Number.isFinite(px) || !Number.isFinite(val(ys[k]))) {
      cut();
      continue;
    }
    if (!dense) {
      seg.push(k);
      continue;
    }
    const c = Math.floor(px * 2);
    if (c !== col) flush();
    col = c;
    bucket.push(k);
  }
  cut();
  return out;
}

interface Ticks {
  major: number[];
  labels: string[];
  minor: number[];
}

/** Marcas de un eje de `len` pt: con números a no menos de `gap` pt (log) o que entren (lineal) */
function axisMarks([lo, hi]: Range, len: number, log: boolean, vertical: boolean, measure: (s: string) => number): Ticks {
  if (log) {
    const r = logTicks(lo, hi, len, vertical ? 14 : 30, vertical ? 14 : 44);
    if (r.linear) return { major: r.ticks, labels: axisTicks(r.ticks), minor: [] };
    const major = r.ticks.filter((_, i) => r.labeled[i]);
    return { major, labels: major.map((v) => si(v, 3)), minor: r.ticks.filter((_, i) => !r.labeled[i]) };
  }
  for (let n = Math.max(2, Math.floor(len / (vertical ? 24 : 36))); n >= 1; n--) {
    const major = niceTicks(lo, hi, n);
    const labels = axisTicks(major);
    const step = major.length > 1 ? ((major[1] - major[0]) / (hi - lo)) * len : len;
    const room = vertical ? 12 : Math.max(...labels.map(measure)) + 8;
    if (step >= room || n === 1) return { major, labels, minor: [] };
  }
  return { major: [], labels: [], minor: [] };
}

const n2 = (v: number) => String(Math.round(v * 100) / 100);
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Letras de la figura (pt) */
const TICK_FS = 8;
const LABEL_FS = 9;
const LEGEND_FS = 8;
/** Ancho de la figura (pt): un poco más que una columna de un paper a dos columnas */
const FIG_W = 330;
const FONT_FAMILY = 'Latin Modern Roman';

/**
 * La figura del panel en SVG (1 unidad = 1 pt), con el aspecto de pgfplots: caja negra, marcas
 * hacia adentro en los cuatro lados (las del eje derecho, si lo hay, son suyas), grilla gris
 * suave, números en Latin Modern y la leyenda arriba, para no tapar las curvas.
 * `measure(texto, tamaño)` da el ancho del texto en la letra de la figura.
 */
export function paneFigure(d: PaneData, f: PaneFrame, measure: (s: string, size: number) => number): { svg: string; w: number; h: number } {
  const curves = shownCurves(d);
  const right = curves.some((c) => c.axis !== 'y') && !!f.r;
  const rightUnit = curves.some((c) => c.axis === 'ph') ? '°' : d.iUnit;
  const tick = (s: string) => measure(s, TICK_FS);
  const plotH = Math.min(260, Math.max(110, Math.round((FIG_W - 80) * (Number.isFinite(f.aspect) && f.aspect > 0 ? f.aspect : 0.5))));
  const yT = axisMarks(f.y, plotH, !!d.logY, true, tick);
  const rT = right ? axisMarks(f.r!, plotH, false, true, tick) : null;
  const yw = Math.max(0, ...yT.labels.map(tick));
  const rw = rT ? Math.max(0, ...rT.labels.map(tick)) : 0;
  const ml = 4 + (d.yUnit ? LABEL_FS + 5 : 0) + yw + 4;
  let mr = rT ? 4 + rw + 4 + (rightUnit ? LABEL_FS + 5 : 0) + 4 : 8;
  let plotW = FIG_W - ml - mr;
  const xT = axisMarks(f.x, plotW, d.log, false, tick);
  // (el último número de X no se sale de la hoja)
  const lastW = xT.labels.length ? tick(xT.labels[xT.labels.length - 1]) / 2 + 2 : 0;
  if (!rT && lastW > mr) {
    mr = lastW;
    plotW = FIG_W - ml - mr;
  }
  // leyenda arriba, en filas (con muchas corridas, las primeras y cuántas más hay)
  type Entry = { c?: Curve; text: string; x: number };
  const entries: Omit<Entry, 'x'>[] = curves.slice(0, 12).map((c) => ({ c, text: legendName(d, c) }));
  if (curves.length > 12) entries.push({ text: `… (+${curves.length - 12})` });
  const rows: Entry[][] = [];
  let row: Entry[] = [];
  let at = 0;
  for (const e of entries) {
    const w = (e.c ? 16 : 0) + measure(e.text, LEGEND_FS) + 10;
    if (row.length && at + w > plotW) {
      rows.push(row);
      row = [];
      at = 0;
    }
    row.push({ ...e, x: at });
    at += w;
  }
  if (row.length) rows.push(row);
  const legendH = rows.length * 11;
  const mt = legendH ? legendH + 8 : 8;
  const mb = 4 + TICK_FS + 5 + LABEL_FS + 6;
  const W = FIG_W;
  const H = Math.round(mt + plotH + mb);
  const X = scaler(f.x, plotW, d.log);
  const Y = scaler(f.y, plotH, !!d.logY);
  const R = right ? scaler(f.r!, plotH, false) : Y;
  const px = (v: number) => ml + X(v);
  const py = (v: number, axis: Curve['axis'] = 'y') => mt + plotH - (axis === 'y' ? Y(v) : R(v));
  const out: string[] = [];
  const text = (x: number, y: number, s: string, size: number, anchor: 'start' | 'middle' | 'end', extra = '') =>
    out.push(`<text x="${n2(x)}" y="${n2(y)}" font-family="${FONT_FAMILY}" font-size="${size}" fill="#000000" text-anchor="${anchor}"${extra}>${xml(s)}</text>`);
  out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);
  out.push(`<defs><clipPath id="plot"><rect x="${n2(ml)}" y="${n2(mt)}" width="${n2(plotW)}" height="${n2(plotH)}"/></clipPath></defs>`);
  const inside = (p: number, lo: number, hi: number) => p >= lo - 0.01 && p <= hi + 0.01;
  // grilla (las marcas con número)
  if (f.grid) {
    const g: string[] = [];
    for (const v of xT.major) if (inside(px(v), ml, ml + plotW)) g.push(`M${n2(px(v))} ${n2(mt)}V${n2(mt + plotH)}`);
    for (const v of yT.major) if (inside(py(v), mt, mt + plotH)) g.push(`M${n2(ml)} ${n2(py(v))}H${n2(ml + plotW)}`);
    if (g.length) out.push(`<path d="${g.join('')}" fill="none" stroke="#d4d4d4" stroke-width="0.4"/>`);
  }
  // curvas
  const paths: string[] = [];
  for (const c of curves) {
    const ys = curveOn(c, d.x);
    const yPos = c.axis === 'y' ? Y : R;
    const segs = plotIndices(d.x, ys, X, (v) => yPos(v), f.x, plotW);
    const parts = segs.map((s) =>
      s
        .map((k, j) => {
          const p = `${n2(px(d.x[k]))} ${n2(py(ys[k], c.axis))}`;
          // (los digitales, en escalones: cada valor vale hasta el punto siguiente)
          return j === 0 ? `M${p}` : c.digital ? `H${n2(px(d.x[k]))}V${n2(py(ys[k], c.axis))}` : `L${p}`;
        })
        .join(''),
    );
    if (!parts.length) continue;
    paths.push(
      `<path d="${parts.join('')}" fill="none" stroke="${printColor(c.color)}" stroke-width="0.9" stroke-linejoin="round" stroke-linecap="round"${c.dash ? ' stroke-dasharray="3 1.6"' : ''}/>`,
    );
  }
  out.push(`<g clip-path="url(#plot)">${paths.join('')}</g>`);
  // caja y marcas hacia adentro
  out.push(`<rect x="${n2(ml)}" y="${n2(mt)}" width="${n2(plotW)}" height="${n2(plotH)}" fill="none" stroke="#000000" stroke-width="0.6"/>`);
  const t: string[] = [];
  const MAJOR = 3.5;
  const MINOR = 2;
  for (const [vs, len] of [
    [xT.major, MAJOR],
    [xT.minor, MINOR],
  ] as const)
    for (const v of vs) {
      const x = px(v);
      if (inside(x, ml, ml + plotW)) t.push(`M${n2(x)} ${n2(mt + plotH)}v${-len}M${n2(x)} ${n2(mt)}v${len}`);
    }
  for (const [vs, len] of [
    [yT.major, MAJOR],
    [yT.minor, MINOR],
  ] as const)
    for (const v of vs) {
      const y = py(v);
      if (inside(y, mt, mt + plotH)) t.push(`M${n2(ml)} ${n2(y)}h${len}${rT ? '' : `M${n2(ml + plotW)} ${n2(y)}h${-len}`}`);
    }
  if (rT)
    for (const v of rT.major) {
      const y = py(v, 'i');
      if (inside(y, mt, mt + plotH)) t.push(`M${n2(ml + plotW)} ${n2(y)}h${-MAJOR}`);
    }
  if (t.length) out.push(`<path d="${t.join('')}" fill="none" stroke="#000000" stroke-width="0.5"/>`);
  // números de los ejes
  xT.major.forEach((v, i) => inside(px(v), ml, ml + plotW) && xT.labels[i] && text(px(v), mt + plotH + 4 + TICK_FS * 0.8, xT.labels[i], TICK_FS, 'middle'));
  yT.major.forEach((v, i) => inside(py(v), mt, mt + plotH) && yT.labels[i] && text(ml - 3, py(v) + TICK_FS * 0.3, yT.labels[i], TICK_FS, 'end'));
  rT?.major.forEach((v, i) => inside(py(v, 'i'), mt, mt + plotH) && rT.labels[i] && text(ml + plotW + 3, py(v, 'i') + TICK_FS * 0.3, rT.labels[i], TICK_FS, 'start'));
  // nombres de los ejes
  text(ml + plotW / 2, H - 6, xAxisLabel(d.xName), LABEL_FS, 'middle');
  const vertical = (x: number, s: string) => text(0, 0, s, LABEL_FS, 'middle', ` transform="translate(${n2(x)} ${n2(mt + plotH / 2)}) rotate(-90)"`);
  if (d.yUnit) vertical(4 + LABEL_FS * 0.8, d.yUnit);
  if (rT && rightUnit) vertical(W - 4 - LABEL_FS * 0.2, rightUnit);
  // leyenda
  rows.forEach((r, k) => {
    const y = 6 + k * 11 + LEGEND_FS * 0.7;
    for (const e of r) {
      const x = ml + e.x;
      if (e.c) out.push(`<path d="M${n2(x)} ${n2(y - LEGEND_FS * 0.3)}h14" fill="none" stroke="${printColor(e.c.color)}" stroke-width="0.9"${e.c.dash ? ' stroke-dasharray="3 1.6"' : ''}/>`);
      text(x + (e.c ? 16 : 0), y, e.text, LEGEND_FS, 'start');
    }
  });
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- ${CREATED_WITH} -->\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}pt" height="${H}pt" viewBox="0 0 ${W} ${H}">${out.join('')}</svg>`;
  return { svg, w: W, h: H };
}

/** PDF vectorial del panel (paneFigure), con la Latin Modern incrustada como el del esquemático */
export async function panePdf(d: PaneData, f: PaneFrame, title: string): Promise<Blob> {
  const lm = FONTS.find((x) => x.id === 'lmodern')!;
  await loadFont(lm);
  const ctx = document.createElement('canvas').getContext('2d')!;
  const measure = (s: string, size: number) => {
    ctx.font = `${size}px "${FONT_FAMILY}"`;
    return ctx.measureText(s).width;
  };
  const fig = paneFigure(d, f, measure);
  return sheetPdf(fig.svg, { x: 0, y: 0, w: fig.w, h: fig.h }, lm.font!, title);
}

/** Número para pgfplots (lee 1e-7; los que faltan van como nan y cortan la curva) */
const pgfNum = (v: number) => (Number.isFinite(v) ? String(Number(v.toPrecision(7))) : 'nan');

/**
 * La figura del panel en un .tex standalone con pgfplots: los mismos rangos, escalas, grilla,
 * colores y leyenda que en pantalla, y los datos reducidos a lo que se distingue (unos cientos de
 * puntos por curva, para que TeX no se quede sin memoria).
 */
export function panePgfplots(d: PaneData, f: PaneFrame, name: string): string {
  const curves = shownCurves(d);
  const left = curves.filter((c) => c.axis === 'y');
  const rightCurves = f.r ? curves.filter((c) => c.axis !== 'y') : [];
  const rightUnit = curves.some((c) => c.axis === 'ph') ? '°' : d.iUnit;
  const colors = [...new Set(curves.map((c) => printColor(c.color).toUpperCase()))];
  const colorName = (c: Curve) => `ts${colors.indexOf(printColor(c.color).toUpperCase()) + 1}`;
  const hex = (c: string) => (/^#[0-9A-F]{6}$/.test(c) ? c.slice(1) : '000000');
  const widthCm = 10;
  const heightCm = Math.min(8, Math.max(4.5, Math.round(widthCm * (Number.isFinite(f.aspect) && f.aspect > 0 ? f.aspect : 0.55) * 10) / 10));
  const X = scaler(f.x, 300, d.log);
  const style = (c: Curve) => [`color=${colorName(c)}`, 'thick', 'no markers', ...(c.dash ? ['dashed'] : []), ...(c.digital ? ['const plot'] : [])].join(', ');
  const plot = (c: Curve, yLog: boolean, yr: Range) => {
    const ys = curveOn(c, d.x);
    const Y = scaler(yr, 200, yLog);
    const segs = plotIndices(d.x, ys, X, Y, f.x, 300);
    const pts = segs.map((s) => s.map((k) => `(${pgfNum(d.x[k])},${pgfNum(ys[k])})`).join(' '));
    // (entre tramos, un punto sin valor: unbounded coords=jump corta la línea)
    const body = pts.flatMap((p, i) => (i ? [`(${pgfNum(d.x[segs[i][0]])},nan)`, p] : [p])).join('\n    ');
    return [`  \\addplot[${style(c)}] coordinates {`, `    ${body}`, '  };', `  \\addlegendentry{${texEscape(legendName(d, c))}}`];
  };
  const common = (yr: Range) => [
    'scale only axis',
    `width=${widthCm}cm`,
    `height=${heightCm}cm`,
    `xmin=${pgfNum(f.x[0])}`,
    `xmax=${pgfNum(f.x[1])}`,
    `ymin=${pgfNum(yr[0])}`,
    `ymax=${pgfNum(yr[1])}`,
    ...(d.log ? ['xmode=log'] : []),
    'unbounded coords=jump',
  ];
  const opts = (list: string[]) => list.map((o) => `    ${o},`).join('\n');
  const n = name.replace(/[\r\n]+/g, ' ');
  return [
    `% pgfplots export of a TurboSpice plot: ${n}`,
    `% ${CREATED_WITH}`,
    '%',
    `% Compile on its own:   pdflatex "${n}.tex"`,
    '% Or include it in a document:',
    '%     \\usepackage{standalone}',
    `%     \\includestandalone{${n}}`,
    '\\documentclass[border=4pt]{standalone}',
    '\\usepackage[T1]{fontenc}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage{lmodern}',
    '\\usepackage{textcomp}',
    '\\usepackage{pgfplots}',
    '\\pgfplotsset{compat=1.16}',
    ...colors.map((c, i) => `\\definecolor{ts${i + 1}}{HTML}{${hex(c)}}`),
    '\\begin{document}',
    '\\begin{tikzpicture}',
    '  \\begin{axis}[',
    opts([
      ...common(f.y),
      ...(d.logY ? ['ymode=log'] : []),
      `xlabel={${texEscape(xAxisLabel(d.xName))}}`,
      ...(d.yUnit ? [`ylabel={${texEscape(d.yUnit)}}`] : []),
      ...(f.grid ? ['grid=major', 'major grid style={black!15}'] : []),
      ...(rightCurves.length ? ['axis y line*=left'] : []),
      'legend cell align=left',
      'legend style={at={(0.5,1.02)}, anchor=south, legend columns=-1, draw=none, font=\\footnotesize, /tikz/every even column/.append style={column sep=6pt}}',
    ]),
    '  ]',
    ...left.flatMap((c) => plot(c, !!d.logY, f.y)),
    // (las curvas del eje derecho también van en esta leyenda)
    ...rightCurves.flatMap((c) => [`  \\addlegendimage{${style(c)}}`, `  \\addlegendentry{${texEscape(legendName(d, c))}}`]),
    '  \\end{axis}',
    ...(rightCurves.length
      ? [
          '  \\begin{axis}[',
          opts([...common(f.r!), 'axis y line*=right', 'axis x line=none', ...(rightUnit ? [`ylabel={${texEscape(rightUnit)}}`] : [])]),
          '  ]',
          ...rightCurves.flatMap((c) => plot(c, false, f.r!).slice(0, 3)),
          '  \\end{axis}',
        ]
      : []),
    '\\end{tikzpicture}',
    '\\end{document}',
    '',
  ].join('\n');
}
