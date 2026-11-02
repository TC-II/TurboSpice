// Exportar a TikZ (#327): la misma hoja de la vista de export (el SVG en pantalla, con su tema de
// impresión, capas y trazo) pasada a \path y \node, como un .tex standalone que compila solo.
// Los textos van como texto, para que los componga LaTeX: lo que está entre $…$ va tal cual (es
// LaTeX del usuario) y el resto, escapado.
//
// Unidades: bp (el punto del PDF), no pt: la hoja de 1 unidad = 1 pt del PDF sale igual de grande
// (el pt de TeX es 1/72,27 pulgadas). El eje y de TikZ va para arriba: se escribe (x, −y).

import { hasLatex, labelPlain, latexSpans, plainText } from './latex.ts';

type Pt = [number, number];
/** Un tramo de un camino: recta hasta p, o cúbica con sus dos puntos de control */
type Seg = { p: Pt; c?: [Pt, Pt] };
type Sub = { start: Pt; segs: Seg[]; closed: boolean };

/** Redondeo a 3 decimales, sin notación exponencial (TeX no la lee) */
export function tikzNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const v = Math.round(n * 1000) / 1000;
  return String(Object.is(v, -0) ? 0 : v);
}

/** Lo que LaTeX leería como comandos, y los símbolos que aparecen en los valores */
const TEX_UNICODE: Record<string, string> = {
  'Ω': '\\textohm{}', // OHM SIGN
  'Ω': '\\textohm{}', // GREEK CAPITAL LETTER OMEGA
  'µ': '\\textmu{}', // MICRO SIGN
  'μ': '\\textmu{}', // GREEK SMALL LETTER MU
  '°': '\\textdegree{}',
  '±': '\\textpm{}',
  '×': '\\texttimes{}',
  '·': '\\textperiodcentered{}',
  '–': '\\textendash{}',
  '—': '\\textemdash{}',
  '−': '\\textminus{}',
  '≤': '\\ensuremath{\\leq}',
  '≥': '\\ensuremath{\\geq}',
  '∞': '\\ensuremath{\\infty}',
  'τ': '\\ensuremath{\\tau}',
  'π': '\\ensuremath{\\pi}',
  'ω': '\\ensuremath{\\omega}',
  'Δ': '\\ensuremath{\\Delta}',
  'β': '\\ensuremath{\\beta}',
  'α': '\\ensuremath{\\alpha}',
  'φ': '\\ensuremath{\\varphi}',
};
const TEX_ASCII: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  _: '\\_',
  '%': '\\%',
  '^': '\\textasciicircum{}',
  '~': '\\textasciitilde{}',
  '<': '\\textless{}',
  '>': '\\textgreater{}',
};

export function texEscape(s: string): string {
  let out = '';
  for (const ch of s) out += TEX_UNICODE[ch] ?? TEX_ASCII[ch] ?? (/[\n\r\t]/.test(ch) ? ' ' : ch);
  return out;
}

/**
 * El texto de un rótulo para LaTeX, con las reglas de ASC-Parser (latex.ts): los $…$ tal cual
 * (LaTeX del usuario) y el resto, con sus escapes resueltos (`\%` es un %), escapado para TeX
 */
export function texText(s: string): string {
  if (!hasLatex(s)) return texEscape(labelPlain(s));
  return latexSpans(s)
    .map((part) => (part.latex ? `$${part.text}$` : texEscape(plainText(part.text))))
    .join('');
}

/** Color CSS calculado (rgb/rgba) → color de TikZ; null si no se pinta */
function tikzColor(css: string): string | null {
  if (!css || css === 'none' || css === 'transparent') return null;
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(css);
  if (!m) return 'black';
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => Math.round(Number(v)));
  if (r === 0 && g === 0 && b === 0) return 'black';
  if (r === 255 && g === 255 && b === 255) return 'white';
  return `{rgb,255:red,${r};green,${g};blue,${b}}`;
}

// --- geometría ----------------------------------------------------------------------------------

/** Cuarto de elipse en cúbicas: la constante de la aproximación clásica */
const K = 0.5522847498;

function ellipseSub(cx: number, cy: number, rx: number, ry: number): Sub {
  const kx = rx * K;
  const ky = ry * K;
  return {
    start: [cx + rx, cy],
    closed: true,
    segs: [
      {
        p: [cx, cy + ry],
        c: [
          [cx + rx, cy + ky],
          [cx + kx, cy + ry],
        ],
      },
      {
        p: [cx - rx, cy],
        c: [
          [cx - kx, cy + ry],
          [cx - rx, cy + ky],
        ],
      },
      {
        p: [cx, cy - ry],
        c: [
          [cx - rx, cy - ky],
          [cx - kx, cy - ry],
        ],
      },
      {
        p: [cx + rx, cy],
        c: [
          [cx + kx, cy - ry],
          [cx + rx, cy - ky],
        ],
      },
    ],
  };
}

/** Arco de un camino SVG (A) en rectas: de la forma por extremos a la por centro (SVG F.6.5) */
function arcPoints(p0: Pt, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, p1: Pt): Pt[] {
  if (!rx || !ry) return [p1];
  const phi = (phiDeg * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
  const cx1 = (co * rx * y1) / ry;
  const cy1 = (-co * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t0 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(2, Math.ceil(Math.abs(dt) / (Math.PI / 16)));
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) {
    const t = t0 + (dt * i) / n;
    const [ex, ey] = [rx * Math.cos(t), ry * Math.sin(t)];
    out.push(i === n ? p1 : [cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  return out;
}

/** Datos de un <path> (M L H V C S Q T A Z, absolutos y relativos) en subcaminos */
export function parsePath(d: string): Sub[] {
  const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const subs: Sub[] = [];
  let cur: Sub | null = null;
  let pos: Pt = [0, 0];
  let lastC: Pt | null = null;
  let lastQ: Pt | null = null;
  let cmd = '';
  let i = 0;
  const num = () => Number(toks[i++]);
  const isNum = () => i < toks.length && !/^[a-zA-Z]$/.test(toks[i]);
  const add = (seg: Seg) => {
    if (!cur) subs.push((cur = { start: pos, segs: [], closed: false }));
    cur.segs.push(seg);
    pos = seg.p;
  };
  while (i < toks.length) {
    if (/^[a-zA-Z]$/.test(toks[i])) cmd = toks[i++];
    else if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const at = (x: number, y: number): Pt => (rel ? [pos[0] + x, pos[1] + y] : [x, y]);
    switch (cmd.toUpperCase()) {
      case 'M': {
        pos = at(num(), num());
        subs.push((cur = { start: pos, segs: [], closed: false }));
        cmd = rel ? 'l' : 'L';
        lastC = lastQ = null;
        break;
      }
      case 'L':
        add({ p: at(num(), num()) });
        lastC = lastQ = null;
        break;
      case 'H': {
        const x = num();
        add({ p: [rel ? pos[0] + x : x, pos[1]] });
        lastC = lastQ = null;
        break;
      }
      case 'V': {
        const y = num();
        add({ p: [pos[0], rel ? pos[1] + y : y] });
        lastC = lastQ = null;
        break;
      }
      case 'C': {
        const c1 = at(num(), num());
        const c2 = at(num(), num());
        const p = at(num(), num());
        add({ p, c: [c1, c2] });
        lastC = c2;
        lastQ = null;
        break;
      }
      case 'S': {
        const c1: Pt = lastC ? [2 * pos[0] - lastC[0], 2 * pos[1] - lastC[1]] : pos;
        const c2 = at(num(), num());
        const p = at(num(), num());
        add({ p, c: [c1, c2] });
        lastC = c2;
        lastQ = null;
        break;
      }
      case 'Q':
      case 'T': {
        const q: Pt = cmd.toUpperCase() === 'Q' ? at(num(), num()) : lastQ ? [2 * pos[0] - lastQ[0], 2 * pos[1] - lastQ[1]] : pos;
        const p = at(num(), num());
        const p0 = pos;
        add({
          p,
          c: [
            [p0[0] + (2 / 3) * (q[0] - p0[0]), p0[1] + (2 / 3) * (q[1] - p0[1])],
            [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])],
          ],
        });
        lastQ = q;
        lastC = null;
        break;
      }
      case 'A': {
        const [rx, ry, rot, large, sweep] = [num(), num(), num(), num(), num()];
        const p = at(num(), num());
        for (const q of arcPoints(pos, rx, ry, rot, !!large, !!sweep, p)) add({ p: q });
        lastC = lastQ = null;
        break;
      }
      case 'Z':
        if (cur) {
          cur.closed = true;
          pos = cur.start;
          cur = null;
        }
        lastC = lastQ = null;
        // (un número después de Z: sigue un lineto implícito, que no se usa)
        while (isNum()) i++;
        break;
      default:
        // comando desconocido: se descarta con sus números
        while (isNum()) i++;
    }
  }
  return subs.filter((s) => s.segs.length || s.closed);
}

/** Matriz afín [a b c d e f] (la de SVGMatrix) */
type Mat = [number, number, number, number, number, number];
const apply = (m: Mat, [x, y]: Pt): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function transformSub(m: Mat, s: Sub): Sub {
  return { start: apply(m, s.start), closed: s.closed, segs: s.segs.map((g) => ({ p: apply(m, g.p), c: g.c && [apply(m, g.c[0]), apply(m, g.c[1])] })) };
}

/** Geometría de un elemento, en sus coordenadas */
function shapeOf(el: SVGElement): Sub[] {
  const n = (a: string) => Number(el.getAttribute(a) ?? 0) || 0;
  switch (el.tagName.toLowerCase()) {
    case 'line':
      return [{ start: [n('x1'), n('y1')], segs: [{ p: [n('x2'), n('y2')] }], closed: false }];
    case 'polyline':
    case 'polygon': {
      const v = (el.getAttribute('points') ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      const pts: Pt[] = [];
      for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
      if (pts.length < 2) return [];
      return [{ start: pts[0], segs: pts.slice(1).map((p) => ({ p })), closed: el.tagName.toLowerCase() === 'polygon' }];
    }
    case 'rect': {
      const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')];
      if (!w || !h) return [];
      return [{ start: [x, y], segs: [{ p: [x + w, y] }, { p: [x + w, y + h] }, { p: [x, y + h] }], closed: true }];
    }
    case 'circle':
      return n('r') > 0 ? [ellipseSub(n('cx'), n('cy'), n('r'), n('r'))] : [];
    case 'ellipse':
      return n('rx') > 0 && n('ry') > 0 ? [ellipseSub(n('cx'), n('cy'), n('rx'), n('ry'))] : [];
    case 'path':
      return parsePath(el.getAttribute('d') ?? '');
  }
  return [];
}

// --- salida -------------------------------------------------------------------------------------

const pt = ([x, y]: Pt) => `(${tikzNum(x)},${tikzNum(-y)})`;

function pathText(subs: Sub[]): string {
  return subs
    .map((s) => {
      let out = pt(s.start);
      for (const g of s.segs) out += g.c ? ` .. controls ${pt(g.c[0])} and ${pt(g.c[1])} .. ${pt(g.p)}` : ` -- ${pt(g.p)}`;
      return s.closed ? `${out} -- cycle` : out;
    })
    .join(' ');
}

/** Anclas de TikZ para text-anchor × dominant-baseline del SVG */
function textAnchor(anchor: string, baseline: string): string {
  const h = anchor === 'end' ? ' east' : anchor === 'middle' ? '' : ' west';
  const v = baseline === 'hanging' || baseline === 'text-before-edge' ? 'north' : baseline === 'text-after-edge' ? 'south' : baseline === 'central' || baseline === 'middle' ? '' : 'base';
  return `${v}${h}`.trim() || 'center';
}

const GRAPHIC = 'line, polyline, polygon, rect, circle, ellipse, path, text';

/**
 * El .tex de la hoja: `content` es el <g> con el dibujo, en unidades de la hoja (1 = 1 bp), ya
 * con el tema de impresión aplicado; `page`, la hoja
 */
export function sheetTikz(
  content: SVGGraphicsElement,
  page: { x: number; y: number; w: number; h: number },
  info: { name: string; skin: string; /** sólo un área de la hoja: lo de afuera se recorta */ clip?: boolean },
): string {
  const base = content.getCTM();
  if (!base) throw new Error('TikZ: the sheet is not laid out');
  const inv = base.inverse();
  const body: string[] = [];
  let images = 0;
  for (const el of content.querySelectorAll<SVGGraphicsElement>(`${GRAPHIC}, image, .math`)) {
    if (el.closest('defs, clipPath, mask, marker, pattern')) continue;
    // una fórmula (#328) va como su texto con $…$, para que la componga LaTeX; no sus caminos
    if (el.parentElement?.closest('.math')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const ctm = el.getCTM();
    if (!ctm) continue;
    const r = inv.multiply(ctm);
    const m: Mat = [r.a, r.b, r.c, r.d, r.e - page.x, r.f - page.y];
    const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
    const tag = el.tagName.toLowerCase();
    if (tag === 'image') {
      images++;
      continue;
    }
    const math = el.classList.contains('math');
    if (tag === 'text' || math) {
      const text = (math ? el.dataset.tex : el.textContent) ?? '';
      if (!text.trim()) continue;
      const at = apply(m, math ? [Number(el.dataset.x) || 0, Number(el.dataset.y) || 0] : [Number(el.getAttribute('x') ?? 0) || 0, Number(el.getAttribute('y') ?? 0) || 0]);
      const angle = (-Math.atan2(m[1], m[0]) * 180) / Math.PI;
      const size = (math ? Number(el.dataset.size) || 16 : parseFloat(cs.fontSize)) * scale;
      const opts = [`anchor=${math ? textAnchor(el.dataset.anchor ?? '', el.dataset.baseline ?? '') : textAnchor(cs.textAnchor, cs.dominantBaseline)}`, 'inner sep=0pt', 'outer sep=0pt'];
      if (Math.abs(angle) > 0.01) opts.push(`rotate=${tikzNum(angle)}`);
      const color = tikzColor(cs.fill);
      if (!color) continue;
      if (color !== 'black') opts.push(`text=${color}`);
      const bold = Number(cs.fontWeight) >= 600 || cs.fontWeight === 'bold';
      opts.push(`font=\\fontsize{${tikzNum(size)}bp}{${tikzNum(size * 1.2)}bp}\\selectfont${bold ? '\\bfseries' : ''}`);
      body.push(`  \\node[${opts.join(', ')}] at ${pt(at)} {${texText(text)}};`);
      continue;
    }
    const subs = shapeOf(el).map((s) => transformSub(m, s));
    if (!subs.length) continue;
    const fill = tikzColor(cs.fill);
    const stroke = tikzColor(cs.stroke);
    const width = parseFloat(cs.strokeWidth) * scale;
    const drawn = stroke && width > 0;
    // (una línea no tiene relleno aunque el estilo lo pida)
    const filled = fill && (tag !== 'line' && (tag !== 'polyline' || subs.some((s) => s.closed)) ? fill : null);
    if (!drawn && !filled) continue;
    const opts: string[] = [];
    if (drawn) {
      opts.push(`draw=${stroke}`, `line width=${tikzNum(width)}bp`);
      if (cs.strokeLinecap !== 'round') opts.push(`line cap=${cs.strokeLinecap === 'square' ? 'rect' : 'butt'}`);
      if (cs.strokeLinejoin !== 'round') opts.push(`line join=${cs.strokeLinejoin === 'bevel' ? 'bevel' : 'miter'}`);
      const dash = cs.strokeDasharray && cs.strokeDasharray !== 'none' ? cs.strokeDasharray.split(/[\s,]+/).map((v) => parseFloat(v) * scale) : [];
      if (dash.length && dash.some((v) => v > 0)) {
        const d = dash.length % 2 ? [...dash, ...dash] : dash;
        opts.push(`dash pattern=${d.map((v, i) => `${i % 2 ? 'off' : 'on'} ${tikzNum(v)}bp`).join(' ')}`);
      }
    }
    if (filled) {
      opts.push(`fill=${filled}`);
      if (cs.fillRule === 'evenodd') opts.push('even odd rule');
    }
    const rx = tag === 'rect' ? Number(el.getAttribute('rx') ?? 0) * scale : 0;
    if (rx > 0) opts.push(`rounded corners=${tikzNum(rx)}bp`);
    const op = Number(cs.opacity);
    if (op < 1) opts.push(`opacity=${tikzNum(op)}`);
    body.push(`  \\path[${opts.join(', ')}] ${pathText(subs)};`);
  }
  const name = info.name.replace(/[\r\n]+/g, ' ');
  return [
    `% TikZ export of a TurboSpice schematic: ${name}   Skin: ${info.skin}`,
    '% Created with TurboSpice https://tc-ii.github.io/TurboSpice/',
    '%',
    `% Compile on its own:   pdflatex "${name}.tex"`,
    '% Or include it in a document:',
    '%     \\usepackage{standalone}',
    `%     \\includestandalone{${name}}`,
    '%',
    '% Lengths are in bp (PDF points): this matches the PDF export 1:1. Text between $…$ is LaTeX',
    '% and goes as written; the rest is set in the document font.',
    ...(images ? [`% (${images} pasted image${images > 1 ? 's' : ''} left out: TikZ draws only lines and text)`] : []),
    '\\documentclass[border=0pt]{standalone}',
    '\\usepackage[T1]{fontenc}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage{lmodern}',
    '\\usepackage{textcomp}',
    '\\usepackage{tikz}',
    '\\begin{document}',
    '\\begin{tikzpicture}[x=1bp, y=1bp, line cap=round, line join=round]',
    `  \\useasboundingbox (0,0) rectangle (${tikzNum(page.w)},${tikzNum(-page.h)});`,
    ...(info.clip ? [`  \\clip (0,0) rectangle (${tikzNum(page.w)},${tikzNum(-page.h)});`] : []),
    ...body,
    '\\end{tikzpicture}',
    '\\end{document}',
    '',
  ].join('\n');
}
