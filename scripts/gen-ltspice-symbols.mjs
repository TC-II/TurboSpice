// Genera símbolos de lib/sym y lib/sym/Misc de LTspice que no son base: library/sym/<ruta>.asy
// y su skin library/skins/default/<nombre>.svg.
//
// Igual que gen-base-symbols.mjs: pines (posición, nombre y SpiceOrder), Prefix, Value, WINDOW y
// los atributos de la netlist son datos de interoperabilidad tomados de LTspice, para que un .asc
// se conecte igual en ambos programas. Los gráficos son propios, con la estética del skin
// "Default" de ASC-Parser (trazo de 1.5, puntas redondeadas, flechas rellenas).
//
// Cada gráfico se describe una vez con primitivas y se escribe en los dos formatos.
//
// Uso: node scripts/gen-ltspice-symbols.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'library');
const r1 = (v) => Math.round(v * 10) / 10;

// ── Primitivas ────────────────────────────────────────────────────────────────
const L = (x1, y1, x2, y2, dash = false) => ({ k: 'L', x1, y1, x2, y2, dash });
const C = (cx, cy, r) => ({ k: 'C', cx, cy, r });
const R = (x1, y1, x2, y2) => ({ k: 'R', x1, y1, x2, y2 });
// arco de centro (cx, cy) y radio r, de a0 a a1 grados en sentido antihorario (como se ve)
const A = (cx, cy, r, a0, a1) => ({ k: 'A', cx, cy, r, a0, a1 });
// polígono relleno (puntas de flecha)
const F = (...pts) => ({ k: 'F', pts });
const polyline = (...pts) => pts.slice(1).map((p, i) => L(pts[i][0], pts[i][1], p[0], p[1]));
// punta de flecha rellena con la punta en (tx, ty), apuntando desde (fx, fy)
const arrow = (fx, fy, tx, ty, len = 10, half = 4) => {
  const d = Math.hypot(tx - fx, ty - fy), ux = (tx - fx) / d, uy = (ty - fy) / d;
  const bx = tx - ux * len, by = ty - uy * len;
  return F([tx, ty], [bx - uy * half, by + ux * half], [bx + uy * half, by - ux * half]);
};
const pt = (cx, cy, r, a) => [r1(cx + r * Math.cos((a * Math.PI) / 180)), r1(cy - r * Math.sin((a * Math.PI) / 180))];

function toAsy(g) {
  switch (g.k) {
    case 'L': return [`LINE Normal ${Math.round(g.x1)} ${Math.round(g.y1)} ${Math.round(g.x2)} ${Math.round(g.y2)}${g.dash ? ' 2' : ''}`];
    case 'C': return [`CIRCLE Normal ${g.cx - g.r} ${g.cy - g.r} ${g.cx + g.r} ${g.cy + g.r}`];
    case 'R': return [`RECTANGLE Normal ${g.x1} ${g.y1} ${g.x2} ${g.y2}`];
    case 'A': {
      // en ARC de LTspice (xs, ys) es el final y (xe, ye) el inicio, recorrido antihorario
      const [sx, sy] = pt(g.cx, g.cy, g.r, g.a1).map(Math.round), [ex, ey] = pt(g.cx, g.cy, g.r, g.a0).map(Math.round);
      const b = [g.cx - g.r, g.cy - g.r, g.cx + g.r, g.cy + g.r].map(Math.round).join(' ');
      return [`ARC Normal ${b} ${sx} ${sy} ${ex} ${ey}`];
    }
    case 'F': return g.pts.map((p, i) => { const q = g.pts[(i + 1) % g.pts.length]; return `LINE Normal ${Math.round(p[0])} ${Math.round(p[1])} ${Math.round(q[0])} ${Math.round(q[1])}`; });
  }
}

// Formato del skin Default de ASC-Parser (clase .st0 como en sus exportaciones de Illustrator),
// limitado a lo que dibuja su exportación a PDF: sin arcos en los path (van como Bézier) ni
// stroke-dasharray (las líneas punteadas van como segmentos sueltos)
const ST0 = '.st0 { fill: none; stroke: #000; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.5px; }';

// arco como curvas de Bézier cúbicas de hasta 90° cada una
function arcPath(g) {
  const span = ((g.a1 - g.a0) % 360 + 360) % 360 || 360;
  const n = Math.ceil(span / 90), step = span / n, k = (4 / 3) * Math.tan(((step / 4) * Math.PI) / 180);
  const d = (a) => [-g.r * Math.sin((a * Math.PI) / 180), -g.r * Math.cos((a * Math.PI) / 180)];
  const [x0, y0] = pt(g.cx, g.cy, g.r, g.a0);
  let out = `M${x0},${y0}`;
  for (let i = 0; i < n; i++) {
    const a = g.a0 + i * step, b = a + step;
    const [ax, ay] = pt(g.cx, g.cy, g.r, a), [bx, by] = pt(g.cx, g.cy, g.r, b);
    const [dax, day] = d(a), [dbx, dby] = d(b);
    out += ` C${r1(ax + k * dax)},${r1(ay + k * day)} ${r1(bx - k * dbx)},${r1(by - k * dby)} ${bx},${by}`;
  }
  return out;
}

function toSvg(g) {
  switch (g.k) {
    case 'L': {
      if (!g.dash) return [`<line class="st0" x1="${r1(g.x1)}" y1="${r1(g.y1)}" x2="${r1(g.x2)}" y2="${r1(g.y2)}"/>`];
      // punteada: segmentos de 4 con huecos de 4
      const len = Math.hypot(g.x2 - g.x1, g.y2 - g.y1), ux = (g.x2 - g.x1) / len, uy = (g.y2 - g.y1) / len, out = [];
      for (let t = 0; t < len; t += 8) {
        const e = Math.min(t + 4, len);
        out.push(`<line class="st0" x1="${r1(g.x1 + ux * t)}" y1="${r1(g.y1 + uy * t)}" x2="${r1(g.x1 + ux * e)}" y2="${r1(g.y1 + uy * e)}"/>`);
      }
      return out;
    }
    case 'C': return [`<circle class="st0" cx="${g.cx}" cy="${g.cy}" r="${g.r}"/>`];
    case 'R': return [`<rect class="st0" x="${Math.min(g.x1, g.x2)}" y="${Math.min(g.y1, g.y2)}" width="${Math.abs(g.x2 - g.x1)}" height="${Math.abs(g.y2 - g.y1)}"/>`];
    case 'A': return [`<path class="st0" d="${arcPath(g)}"/>`];
    // relleno negro por omisión, como las puntas de flecha de los skins de ASC-Parser
    case 'F': return [`<polygon points="${g.pts.map((p) => p.map(r1).join(',')).join(' ')}"/>`];
  }
}

function svgDoc(gs, pins, tight = false) {
  const xs = [], ys = [];
  const add = (x, y) => { xs.push(x); ys.push(y); };
  for (const g of gs) {
    if (g.k === 'L' || g.k === 'R') { add(g.x1, g.y1); add(g.x2, g.y2); }
    else if (g.k === 'C' || (g.k === 'A' && !tight)) { add(g.cx - g.r, g.cy - g.r); add(g.cx + g.r, g.cy + g.r); }
    // tight: el arco ocupa sólo su recorrido (los de las compuertas son de círculos grandes)
    else if (g.k === 'A') for (let i = 0, span = ((g.a1 - g.a0) % 360 + 360) % 360 || 360; i <= 32; i++) add(...pt(g.cx, g.cy, g.r, g.a0 + (span * i) / 32));
    else for (const p of g.pts) add(...p);
  }
  for (const [x, y] of pins) add(x, y);
  const x0 = Math.floor(Math.min(...xs)), y0 = Math.floor(Math.min(...ys));
  const w = Math.ceil(Math.max(...xs)) - x0, h = Math.ceil(Math.max(...ys)) - y0;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="${x0} ${y0} ${w} ${h}">`,
    '  <defs>',
    `    <style>${ST0}</style>`,
    '  </defs>',
    ...gs.flatMap(toSvg).map((e) => `  ${e}`),
    '</svg>',
    '',
  ].join('\n');
}

// ── Piezas comunes ────────────────────────────────────────────────────────────
// BJT como el skin npn/pnp de ASC-Parser: base en y=48, barra en x=36
const bjt = (pnp) => [
  L(0, 48, 36, 48), L(36, 21, 36, 74),
  L(36, 31, 64, 10), L(64, 10, 64, 0),
  L(36, 65, 64, 86), L(64, 86, 64, 96),
  pnp ? arrow(58, 81.6, 42, 69.8) : arrow(40, 68.3, 61, 83.8),
];
const substrate = [L(44, 48, 64, 48), L(44, 44, 44, 52)];
// diodo vertical entre (x, top) y (x, bot): triángulo hacia abajo y barra
const diode = (x, y1, y2, w = 16) => [L(x - w, y1, x + w, y1), L(x - w, y1, x, y2), L(x + w, y1, x, y2), L(x - w, y2, x + w, y2)];
const diodeUp = (x, y1, y2, w = 16) => [L(x - w, y2, x + w, y2), L(x - w, y2, x, y1), L(x + w, y2, x, y1), L(x - w, y1, x + w, y1)];
// fuente: círculo de radio 29 con conexiones de 11, como en el skin current/voltage
const srcCircle = (x, top, bot) => { const cy = (top + bot) / 2; return [L(x, top, x, cy - 29), L(x, cy + 29, x, bot), C(x, cy, 29)]; };
const diamond = (x, top, bot) => {
  const cy = (top + bot) / 2;
  return [L(x, top, x, cy - 29), L(x, cy + 29, x, bot), ...polyline([x, cy - 29], [x + 29, cy], [x, cy + 29], [x - 29, cy], [x, cy - 29])];
};
const plus = (x, y, s = 4) => [L(x - s, y, x + s, y), L(x, y - s, x, y + s)];
const minus = (x, y, s = 4) => [L(x - s, y, x + s, y)];
const downArrow = (x, y1, y2) => [L(x, y1, x, y2 - 8), arrow(x, y1, x, y2)];
// IGBT: compuerta aislada (como MOSFET) con colector/emisor de bipolar
const igbt = (p) => [
  L(0, 80, 16, 80), L(16, 32, 16, 80), L(24, 24, 24, 72),
  L(24, 32, 48, 16), L(48, 16, 48, 0), L(24, 64, 48, 80), L(48, 80, 48, 96),
  p ? arrow(44, 77.3, 28, 66.7) : arrow(28, 66.7, 46, 78.7),
];
// válvulas: cápsula, placa, grillas punteadas y cátodo con su conexión
const plate = (y, top) => [L(0, top, 0, y), L(-16, y, 16, y)];
const grid = (y, side) => [L(-20, y, 20, y, true), side < 0 ? L(-48, y, -20, y) : L(20, y, 48, y)];
const cathode = (y, pin) => [L(-16, y, 16, y), L(16, y, 16, y - 6), ...polyline([-16, y], [-16, y + 10], pin)];
// amp. op.: triángulo de (-32, top) a (-32, top + 64) con la punta en (32, top + 32); entradas
// "-" e "+" a ±16 del centro y, si tiene, alimentaciones en x=0
const opamp = (top, invUp, supplies) => {
  const cy = top + 32;
  const [ym, yp] = invUp ? [cy - 16, cy + 16] : [cy + 16, cy - 16];
  return [...polyline([-32, top], [32, cy], [-32, top + 64], [-32, top]), ...minus(-22, ym), ...plus(-22, yp),
    ...(supplies ? [L(0, top - 0, 0, top + 16), L(0, top + 48, 0, top + 64)] : [])];
};

// compuertas digitales (dispositivos A): entradas a la izquierda, Q y _Q a la derecha (_Q con
// burbuja), com abajo; los pines que no dibuja el gráfico llevan un tramo hasta el cuerpo
const stubs = (x, ys, bodyX) => ys.map((y) => L(x, y, bodyX(y), y));
const notQ = (x0, y, pin) => [L(x0, y, pin - 12, y), C(pin - 8, y, 4), L(pin - 4, y, pin, y)];
// AND: frente semicircular de centro (-12, 64)
const andX = (y) => r1(-12 + Math.sqrt(32 ** 2 - (y - 64) ** 2));
const andGate = [
  L(-24, 32, -24, 96), L(-24, 32, -12, 32), L(-24, 96, -12, 96), A(-12, 64, 32, -90, 90),
  ...stubs(-32, [32, 48, 64, 80, 96], () => -24), L(andX(48), 48, 32, 48), ...notQ(andX(80), 80, 32),
];
// OR: dorso cóncavo de centro (-88, 64) y frente en punta de arcos de radio 64
const orBack = (y, dx = 0) => r1(-88 - dx + Math.sqrt(64.5 ** 2 - (y - 64) ** 2));
const orFront = r1(-32 + Math.sqrt(64 ** 2 - 48 ** 2));
const orBody = [A(-32, 96, 64, 30, 90), A(-32, 32, 64, -90, -30), A(-88, 64, 64.5, -29.7, 29.7), L(-16, 94, -16, 96)];
const orGate = [...orBody, ...stubs(-32, [48, 64, 80], orBack), L(orFront, 48, 32, 48), ...notQ(orFront, 80, 32)];
const xorGate = [...orBody, A(-96, 64, 64.5, -29.7, 29.7), ...stubs(-48, [32, 48, 64, 80, 96], (y) => orBack(y, 8)),
  L(orFront, 48, 16, 48), ...notQ(orFront, 80, 32)];
// buffers: triángulo con la entrada en (0, 64)
const bufTri = (y0, y1, tip) => [...polyline([8, y0], [tip, 64], [8, y1], [8, y0]), L(0, 64, 8, 64)];
const gate = (model, desc) => ['A', '', desc, [`SpiceModel ${model}`]];
// flip-flops: caja con las letras en trazos (no hay texto en los gráficos), _Q con burbuja
const glyphs = {
  D: [[[0, 0], [4, 0], [8, 4], [8, 8], [4, 12], [0, 12], [0, 0]]],
  Q: [[[2, 0], [6, 0], [8, 2], [8, 10], [6, 12], [2, 12], [0, 10], [0, 2], [2, 0]], [[5, 9], [9, 13]]],
  S: [[[8, 1], [6, 0], [2, 0], [0, 2], [0, 4], [2, 6], [6, 6], [8, 8], [8, 10], [6, 12], [2, 12], [0, 11]]],
  R: [[[0, 12], [0, 0], [6, 0], [8, 2], [8, 4], [6, 6], [0, 6]], [[4, 6], [8, 12]]],
};
const letter = (ch, x, y, bar = false) => [
  ...glyphs[ch].flatMap((p) => polyline(...p.map(([a, b]) => [x + a, y + b]))),
  ...(bar ? [L(x, y - 3, x + 8, y - 3)] : []),
];
const flopBox = (x0, x1, y0, y1, ins, qx, qbx) => [
  R(x0, y0, x1, y1),
  ...ins.flatMap(([ch, y, pin]) => [L(pin, y, x0, y), ...(ch ? letter(ch, x0 + 6, y - 6) : [])]),
  L(x1, 48, qx, 48), ...letter('Q', x1 - 14, 42),
  C(x1 + 4, 96, 4), L(x1 + 8, 96, qbx, 96), ...letter('Q', x1 - 14, 90, true),
];
const dflop = [
  ...flopBox(-48, 48, 16, 128, [['D', 48, -80], ['', 96, -80]], 80, 96),
  ...polyline([-48, 88], [-38, 96], [-48, 104]), L(0, 0, 0, 16), L(0, 128, 0, 144),
];
const srflop = flopBox(-32, 32, 16, 120, [['S', 48, -48], ['R', 96, -48]], 48, 64);

// nombre: [Prefix, Value, pines [x, y, nombre, SpiceOrder], ventanas, descripción, gráficos, atributos extra]
const SYMBOLS = {
  npn2: ['QN', 'NPN', [[64, 0, 'C', 1], [0, 48, 'B', 2], [64, 96, 'E', 3]], { 0: [56, 32, 'Left'], 3: [56, 68, 'Left'] },
    'Transistor bipolar NPN (con cápsula)', [...bjt(false), C(53, 48, 43)]],
  npn3: ['QN', 'NPN', [[64, 0, 'C', 1], [0, 48, 'B', 2], [64, 96, 'E', 3]], { 0: [56, 32, 'Left'], 3: [56, 68, 'Left'] },
    'Transistor bipolar NPN (variante)', bjt(false)],
  npn4: ['QN', 'NPN', [[64, 0, 'C', 1], [0, 48, 'B', 2], [64, 96, 'E', 3], [64, 48, 'S', 4]], { 0: [72, 32, 'Left'], 3: [72, 68, 'Left'] },
    'Transistor bipolar NPN con sustrato', [...bjt(false), ...substrate]],
  pnp2: ['QP', 'PNP', [[64, 0, 'C', 1], [0, 48, 'B', 2], [64, 96, 'E', 3]], { 0: [84, 32, 'Left'], 3: [84, 68, 'Left'] },
    'Transistor bipolar PNP (con cápsula)', [...bjt(true), C(53, 48, 43)]],
  pnp4: ['QP', 'PNP', [[64, 0, 'C', 1], [0, 48, 'B', 2], [64, 96, 'E', 3], [64, 48, 'S', 4]], { 0: [72, 32, 'Left'], 3: [72, 68, 'Left'] },
    'Transistor bipolar PNP con sustrato', [...bjt(true), ...substrate]],
  lpnp: ['QP', 'LPNP', [[64, 0, 'C', 1], [0, 48, 'B', 2], [64, 96, 'E', 3], [64, 48, 'S', 4]], { 0: [72, 32, 'Left'], 3: [72, 68, 'Left'] },
    'Transistor bipolar PNP lateral con sustrato', [...bjt(true), ...substrate]],
  res2: ['R', 'R', [[16, 0, 'A', 1], [16, 64, 'B', 2]], { 0: [36, 16, 'Left'], 3: [36, 56, 'Left'] },
    'Resistencia (corta)', [L(16, 0, 16, 12), L(16, 52, 16, 64), R(5, 12, 27, 52)]],
  load: ['I', 'I', [[16, 0, 'A', 1], [16, 64, 'B', 2]], { 0: [48, 8, 'Left'], 3: [48, 56, 'Left'] },
    'Carga: fuente de corriente (consume I de A a B)', [L(16, 0, 16, 12), L(16, 52, 16, 64), R(2, 12, 30, 52), ...downArrow(16, 18, 46)]],
  load2: ['I', 'I', [[0, 0, '+', 1], [0, 80, '-', 2]], { 0: [17, -16, 'Left'], 3: [25, 84, 'Left'] },
    'Carga: fuente de corriente (consume I de + a -)', [...srcCircle(0, 0, 80), ...downArrow(0, 24, 56), L(-20, 60, 20, 20)]],
  varactor: ['D', 'D', [[16, 0, '+', 1], [16, 64, '-', 2]], { 0: [24, 0, 'Left'], 3: [24, 64, 'Left'] },
    'Varactor (diodo de capacidad variable)', [L(16, 0, 16, 18), ...diode(16, 18, 44), L(0, 52, 32, 52), L(16, 52, 16, 64)]],
  TVSdiode: ['D', 'D', [[16, 0, '+', 1], [16, 64, '-', 2]], { 0: [24, -2, 'Left'], 3: [24, 65, 'Left'] },
    'Diodo supresor de transitorios (bidireccional)',
    [L(16, 0, 16, 8), ...diode(16, 8, 32), ...diodeUp(16, 32, 56), L(16, 56, 16, 64), L(0, 32, -4, 28), L(32, 32, 36, 36)]],
  ltline: ['O', 'LTRA', [[-48, -16, 'I1', 1], [-48, 16, 'R1', 2], [48, -16, 'I2', 3], [48, 16, 'R2', 4]],
    { 0: [0, -16, 'Bottom'], 3: [0, 16, 'Top'] }, 'Línea de transmisión con pérdidas (LTRA)',
    [L(-48, -16, -32, -16), L(32, -16, 48, -16), L(-48, 16, -32, 16), L(32, 16, 48, 16),
      L(-32, -8, 32, -8), L(-32, 8, 32, 8), A(-32, 0, 8, 90, 270), A(32, 0, 8, -90, 90),
      ...polyline([-12, 0], [-8, -4], [-4, 4], [0, -4], [4, 4], [8, -4], [12, 0])]],
  mesfet: ['Z', 'NMF', [[48, 0, 'D', 1], [0, 80, 'G', 2], [48, 96, 'S', 3]], { 0: [56, 32, 'Left'], 3: [56, 72, 'Left'] },
    'MESFET canal N', [L(0, 80, 26, 80), L(26, 18, 26, 86), L(26, 26, 48, 26), L(48, 26, 48, 0), L(26, 70, 48, 70), L(48, 70, 48, 96)]],

  'Misc/battery': ['V', 'V', [[0, 16, '+', 1], [0, 96, '-', 2]], { 0: [24, 16, 'Left'], 3: [24, 104, 'Left'] },
    'Batería: fuente de tensión DC, AC, PULSE, SINE, PWL, EXP o SFFM',
    [L(0, 16, 0, 36), L(-24, 36, 24, 36), L(-12, 44, 12, 44), L(0, 44, 0, 52, true), L(0, 52, 0, 60, true),
      L(-24, 60, 24, 60), L(-12, 68, 12, 68), L(0, 68, 0, 96), ...plus(-20, 26)]],
  'Misc/Epoly': ['E', 'POLY()', [[0, 16, '+', 1], [0, 96, '-', 2]], { 0: [24, 16, 'Left'], 3: [24, 104, 'Left'] },
    'Fuente de tensión controlada por un polinomio', [...diamond(0, 16, 96), ...plus(0, 42), ...minus(0, 72)]],
  'Misc/Gpoly': ['G', 'POLY()', [[0, 96, '+', 1], [0, 16, '-', 2]], { 0: [24, 16, 'Left'], 3: [24, 104, 'Left'] },
    'Fuente de corriente controlada por un polinomio', [...diamond(0, 16, 96), ...downArrow(0, 38, 74)]],
  'Misc/fixedind': ['L', 'L', [[16, 16, 'A', 1], [16, 96, 'B', 2]], { 0: [36, 40, 'Left'], 3: [36, 80, 'Left'] },
    'Inductor de valor fijo', [L(16, 16, 16, 24), L(16, 88, 16, 96), ...[24, 40, 56, 72].map((y) => A(16, y + 8, 8, -90, 90)), L(32, 24, 32, 88)]],
  // sin Prefix: en LTspice une las dos redes y no genera línea en la netlist (ver connectivity.ts)
  'Misc/jumper': ['', '', [[-32, 64, '+', 1], [32, 64, '-', 2]], { 0: [0, 40, 'Bottom'] },
    'Puente: une las dos redes', [A(0, 80, 36, 26.4, 153.6), C(-32, 64, 2), C(32, 64, 2)]],
  'Misc/neonbulb': ['X', '', [[0, -48, 'V+', 1], [0, 48, 'V-', 2]], { 0: [16, -48, 'Left'] },
    'Lámpara de neón', [L(0, -48, 0, -30), L(0, 30, 0, 48), C(0, 0, 30), L(0, -30, 0, -8), L(-14, -8, 14, -8), L(0, 30, 0, 8), L(-14, 8, 14, 8),
      F([16, 0], [12, -2], [12, 2])],
    ['Value2 Vstrike=100 Vhold=50', 'ModelFile neonbulb.sub', 'SpiceModel neonbulb', 'SpiceLine Zon=2K Ihold=200u', 'SpiceLine2 Tau=100u']],
  'Misc/NIGBT': ['Z', 'NIGBT', [[48, 0, 'C', 1], [0, 80, 'G', 2], [48, 96, 'E', 3]], { 0: [56, 32, 'Left'], 3: [56, 72, 'Left'] },
    'IGBT canal N', igbt(false)],
  'Misc/PIGBT': ['Z', 'PIGBT', [[48, 0, 'C', 1], [0, 80, 'G', 2], [48, 96, 'E', 3]], { 0: [56, 32, 'Left'], 3: [56, 72, 'Left'] },
    'IGBT canal P', igbt(true)],
  'Misc/SCR': ['X', 'SCR', [[16, 0, 'A', 1], [-32, 64, 'G', 2], [16, 64, 'K', 3]], { 0: [24, 0, 'Left'], 3: [24, 72, 'Left'] },
    'Tiristor (SCR): el modelo lo provee el usuario', [L(16, 0, 16, 18), ...diode(16, 18, 46), L(16, 46, 16, 64), ...polyline([8, 46], [-12, 64], [-32, 64])]],
  'Misc/TRIAC': ['X', 'TRIAC', [[32, 0, 'MT2', 1], [-16, 64, 'G', 2], [32, 64, 'MT1', 3]], { 0: [48, 0, 'Left'], 3: [48, 72, 'Left'] },
    'TRIAC: el modelo lo provee el usuario',
    [L(32, 0, 32, 20), L(32, 44, 32, 64), L(8, 20, 56, 20), L(8, 44, 56, 44), L(8, 20, 20, 44), L(32, 20, 20, 44), L(32, 44, 44, 20), L(56, 44, 44, 20),
      ...polyline([16, 44], [0, 64], [-16, 64])]],
  'Misc/DIAC': ['X', 'DIAC', [[32, 0, '+', 1], [32, 64, '-', 2]], { 0: [48, 0, 'Left'], 3: [48, 72, 'Left'] },
    'DIAC: el modelo lo provee el usuario',
    [L(32, 0, 32, 20), L(32, 44, 32, 64), L(8, 20, 56, 20), L(8, 44, 56, 44), L(8, 20, 20, 44), L(32, 20, 20, 44), L(32, 44, 44, 20), L(56, 44, 44, 20)]],
  'Misc/triode': ['X', 'Triode', [[0, -48, 'Plate', 1], [-48, 0, 'Grid', 2], [-32, 48, 'Cathode', 3]], { 0: [8, -64, 'Left'], 3: [-24, 64, 'Left'] },
    'Triodo: el modelo lo provee el usuario', [C(0, 0, 40), ...plate(-20, -48), ...grid(0, -1), ...cathode(22, [-32, 48])]],
  'Misc/tetrode': ['X', 'Tetrode', [[0, -48, 'Anode', 1], [48, 0, 'Screen', 2], [-48, 16, 'Grid', 3], [-32, 64, 'Cathode', 4]],
    { 0: [8, -64, 'Left'], 3: [-24, 80, 'Left'] }, 'Tetrodo: el modelo lo provee el usuario',
    [C(0, 8, 46), ...plate(-22, -48), ...grid(0, 1), ...grid(16, -1), ...cathode(34, [-32, 64])]],
  'Misc/pentode': ['X', 'Pentrode', [[-32, 64, 'Cathode', 1], [-48, 16, 'G1', 2], [48, 0, 'G2', 3], [-48, -16, 'G3', 4], [0, -64, 'Anode', 5]],
    { 0: [8, -80, 'Left'], 3: [-24, 80, 'Left'] }, 'Pentodo: el modelo lo provee el usuario',
    [C(0, 0, 50), ...plate(-30, -64), ...grid(-16, -1), ...grid(0, 1), ...grid(16, -1), ...cathode(32, [-32, 64])]],
  'Misc/urc2': ['U', 'URC', [[16, 0, 'A', 1], [16, 64, 'B', 2], [-16, 32, 'C', 3]], { 0: [36, 16, 'Left'], 3: [36, 56, 'Left'] },
    'Línea RC distribuida (URC)', [L(16, 0, 16, 8), L(16, 56, 16, 64), R(10, 8, 22, 56), L(2, 12, 2, 52), L(-16, 32, 2, 32)]],
  'Misc/xvaristor': ['X', 'varistor', [[16, 16, 'A', 1], [16, 96, 'B', 2]], { 0: [36, 40, 'Left'], 3: [36, 76, 'Left'] },
    'Varistor: el modelo lo provee el usuario', [L(16, 16, 16, 27), L(16, 85, 16, 96), R(5, 27, 27, 85), ...polyline([-4, 84], [2, 84], [30, 28])]],
  // amplificadores operacionales: los modelos propios están en library/sub (opamp.sub,
  // UniversalOpAmp1.lib, UniversalOpAmp2.lib); opamp2 usa el modelo que indique Value
  'OpAmps/opamp': ['X', 'opamp', [[-32, 48, 'invin', 1], [-32, 80, 'noninvin', 2], [32, 64, 'out', 3]], { 0: [0, 32, 'Left'] },
    'Amp. op. de un polo (Aol, GBW); requiere .lib opamp.sub', opamp(32, true, false), ['SpiceLine Aol=100K', 'SpiceLine2 GBW=10Meg']],
  'OpAmps/opamp2': ['X', 'opamp2', [[-32, 80, 'In+', 1], [-32, 48, 'In-', 2], [0, 32, 'V+', 3], [0, 96, 'V-', 4], [32, 64, 'OUT', 5]],
    { 0: [16, 32, 'Left'], 3: [16, 96, 'Left'] }, 'Amp. op. con alimentación; Value es el nombre del modelo', opamp(32, true, true)],
  'OpAmps/UniversalOpamp2': ['X', '', [[-32, 16, 'In+', 1], [-32, -16, 'In-', 2], [0, -32, 'V+', 3], [0, 32, 'V-', 4], [32, 0, 'OUT', 5]],
    { 0: [16, -32, 'Left'] }, 'Amp. op. universal: Avol, GBW, slew, límites de salida y de corriente', opamp(-32, true, true),
    ['SpiceModel level2', 'Value2 Avol=1Meg GBW=10Meg Slew=10Meg', 'SpiceLine Ilimit=25m Rail=0 Vos=0',
      'SpiceLine2 En=0 Enk=0 In=0 Ink=0 Rin=500Meg', 'ModelFile UniversalOpAmp2.lib']],
  'OpAmps/UniversalOpAmp': ['X', '', [[-32, 16, 'In+', 1], [-32, -16, 'In-', 2], [0, -32, 'V+', 3], [0, 32, 'V-', 4], [32, 0, 'OUT', 5]],
    { 0: [16, -32, 'Left'] }, 'Amp. op. universal de un polo (Avol, GBW, Vos), salida sin límites', opamp(-32, true, true),
    ['SpiceModel level1', 'Value2 Avol=1Meg GBW=10Meg Vos=0', 'SpiceLine En=0 Enk=0 In=0 Ink=0 Rin=500Meg', 'ModelFile UniversalOpAmp1.lib']],
  'Misc/EuropeanPolcap': ['C', 'C', [[16, 0, 'A', 1], [16, 64, 'B', 2]], { 0: [24, 4, 'Left'], 3: [24, 64, 'Left'] },
    'Capacitor polarizado (gráfico europeo)', [L(16, 0, 16, 28), L(16, 36, 16, 64), L(0, 28, 32, 28), F([0, 36], [32, 36], [32, 41], [0, 41]), ...plus(4, 16, 3)]],
  // compuertas digitales: Vhigh, Vlow, Ref, Td, Trise, Tfall, Tau, Rout, Cout en SpiceLine
  'Digital/and': ((a) => [a[0], a[1], [[-32, 32, 'a', 1], [-32, 48, 'b', 2], [-32, 64, 'c', 3], [-32, 80, 'd', 4], [-32, 96, 'e', 5],
    [32, 80, '_Q', 6], [32, 48, 'Q', 7], [-16, 96, 'com', 8]], { 0: [16, 24, 'Left'], 3: [16, 112, 'Left'] }, a[2], andGate, a[3]])(
    gate('AND', 'Compuerta AND (hasta 5 entradas) con salida complementaria')),
  'Digital/or': ((a) => [a[0], a[1], [[-32, 32, 'a', 1], [-32, 48, 'b', 2], [-32, 64, 'c', 3], [-32, 80, 'd', 4], [-32, 96, 'e', 5],
    [32, 80, '_Q', 6], [32, 48, 'Q', 7], [-16, 96, 'com', 8]], { 0: [-8, 8, 'Left'], 3: [-8, 128, 'Left'] }, a[2], orGate, a[3]])(
    gate('OR', 'Compuerta OR (hasta 5 entradas) con salida complementaria')),
  'Digital/xor': ((a) => [a[0], a[1], [[-48, 32, 'a', 1], [-48, 48, 'b', 2], [-48, 64, 'c', 3], [-48, 80, 'd', 4], [-48, 96, 'e', 5],
    [32, 80, '_Q', 6], [16, 48, 'Q', 7], [-16, 96, 'com', 8]], { 0: [16, 24, 'Left'], 3: [16, 112, 'Left'] }, a[2], xorGate, a[3]])(
    gate('XOR', 'Compuerta XOR: alta si exactamente una entrada está alta')),
  'Digital/buf': ((a) => [a[0], a[1], [[0, 64, 'in', 1], [64, 80, '_Q', 6], [64, 48, 'Q', 7], [0, 96, 'com', 8]],
    { 0: [8, 16, 'Left'], 3: [8, 120, 'Left'] }, a[2], [...bufTri(24, 104, 56), L(36.8, 48, 64, 48), ...notQ(36.8, 80, 64), L(0, 96, 8, 96)], a[3]])(
    gate('BUF', 'Buffer digital con salida complementaria')),
  'Digital/buf1': ((a) => [a[0], a[1], [[0, 64, 'in', 1], [64, 64, 'Q', 7], [0, 80, 'com', 8]],
    { 0: [8, 32, 'Left'], 3: [8, 104, 'Left'] }, a[2], [...bufTri(40, 88, 56), L(56, 64, 64, 64), L(0, 80, 8, 80)], a[3]])(
    gate('BUF', 'Buffer digital')),
  'Digital/inv': ((a) => [a[0], a[1], [[0, 64, 'in', 1], [64, 64, '_Q', 6], [0, 80, 'com', 8]],
    { 0: [8, 32, 'Left'], 3: [8, 104, 'Left'] }, a[2], [...bufTri(40, 88, 52), C(56, 64, 4), L(60, 64, 64, 64), L(0, 80, 8, 80)], a[3]])(
    gate('BUF', 'Inversor digital (salida _Q de un BUF)')),
  'Digital/dflop': ['A', '', [[-80, 48, 'D', 1], [-80, 96, 'CLK', 3], [0, 0, 'PRE', 4], [0, 144, 'CLR', 5],
    [96, 96, '_Q', 6], [80, 48, 'Q', 7], [-80, 144, 'com', 8]], { 0: [8, -16, 'Left'], 3: [8, 168, 'Left'] },
    'D flip-flop: takes D on the rising edge of CLK; asynchronous PRE and CLR (CLR wins)', dflop, ['SpiceModel DFLOP']],
  'Digital/srflop': ['A', '', [[-48, 48, 'S', 1], [-48, 96, 'R', 2], [64, 96, '_Q', 6], [48, 48, 'Q', 7], [-48, 128, 'com', 8]],
    { 0: [-40, 0, 'Left'], 3: [-40, 152, 'Left'] }, 'Set-reset flip-flop (R wins if both are high)', srflop, ['SpiceModel SRFLOP']],
};

// Skins que no se generan: son los npn.svg y pnp.svg (BJT con cápsula) del skin Default de
// ASC-Parser, copiados tal cual (ver library/LICENSES.md)
const ASC_PARSER_SKINS = new Set(['npn2', 'pnp2']);

for (const [path, [prefix, value, pins, windows, desc, graphics, extra = []]] of Object.entries(SYMBOLS)) {
  const lines = [
    'Version 4',
    'SymbolType CELL',
    ...graphics.flatMap(toAsy),
    ...Object.entries(windows).map(([i, [x, y, a]]) => `WINDOW ${i} ${x} ${y} ${a} 2`),
    ...(value ? [`SYMATTR Value ${value}`] : []),
    ...(prefix ? [`SYMATTR Prefix ${prefix}`] : []),
    ...extra.map((a) => `SYMATTR ${a}`),
    `SYMATTR Description ${desc}`,
    ...pins.flatMap(([x, y, pn, order]) => [`PIN ${x} ${y} NONE 0`, `PINATTR PinName ${pn}`, `PINATTR SpiceOrder ${order}`]),
  ];
  const asy = join(LIB, 'sym', `${path}.asy`);
  mkdirSync(dirname(asy), { recursive: true });
  writeFileSync(asy, lines.join('\r\n') + '\r\n', 'latin1');
  // en minúsculas: la librería busca el skin por el nombre exacto y después en minúsculas, y los
  // .asc escriben el mismo símbolo con distintas mayúsculas (UniversalOpamp2, universalopamp2)
  if (ASC_PARSER_SKINS.has(path)) continue;
  writeFileSync(join(LIB, 'skins', 'default', `${path.split('/').pop().toLowerCase()}.svg`), svgDoc(graphics, pins, path.startsWith('Digital/')));
}
console.log(`${Object.keys(SYMBOLS).length} símbolos escritos en library/sym/ (con su skin)`);
