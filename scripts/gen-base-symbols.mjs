// Genera library/sym/<nombre>.asy para los símbolos base que LTspice trae incorporados.
//
// Pines (posición y SpiceOrder), Prefix, Value y WINDOW son datos de interoperabilidad:
// tienen que coincidir con los de LTspice para que un .asc se conecte igual en ambos lados.
// Los gráficos y descripciones son propios. Para el render se prefiere el skin SVG
// (library/skins/default); estos gráficos son el respaldo cuando no hay SVG.
//
// Uso: node scripts/gen-base-symbols.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'library', 'sym');

// [x, y, nombre, SpiceOrder]
const P2V = (top, bot, a = 'A', b = 'B', x = 16) => [[x, top, a, 1], [x, bot, b, 2]];

// Gráficos reutilizables (sintaxis .asy, coordenadas locales)
const stub = (x, y1, y2) => `LINE Normal ${x} ${y1} ${x} ${y2}`;
const circle = (cx, cy, r) => `CIRCLE Normal ${cx - r} ${cy - r} ${cx + r} ${cy + r}`;
// Semicírculo hacia la derecha entre (x, y1) arriba e (x, y2) abajo. En ARC el par
// (xs,ys) es el punto final y (xe,ye) el inicial, recorrido antihorario.
const bumpRight = (x, y1, y2) => {
  const r = (y2 - y1) / 2;
  return `ARC Normal ${x - r} ${y1} ${x + r} ${y2} ${x} ${y1} ${x} ${y2}`;
};
const diodeBody = (extra = []) => [
  stub(16, 0, 24), stub(16, 40, 64),
  'LINE Normal 0 24 32 24', 'LINE Normal 0 24 16 40', 'LINE Normal 32 24 16 40',
  'LINE Normal 0 40 32 40', ...extra,
];
const sourceCircle = (top, bot, extra = []) => {
  const cy = (top + bot) / 2;
  return [stub(0, top, cy - 24), stub(0, cy + 24, bot), circle(0, cy, 24), ...extra];
};
const controlPins = (pins) =>
  pins.filter(([x]) => x === -48).map(([x, y]) => `LINE Normal ${x} ${y} -24 ${y}`);
const box = (x1, y1, x2, y2) => `RECTANGLE Normal ${x1} ${y1} ${x2} ${y2}`;

const BJT = (pnp) => [
  'LINE Normal 0 48 16 48', 'LINE Normal 16 16 16 80',
  'LINE Normal 16 32 64 0', 'LINE Normal 16 64 64 96',
  pnp ? 'LINE Normal 24 70 16 64' : 'LINE Normal 64 96 52 82',
  pnp ? 'LINE Normal 16 64 26 60' : 'LINE Normal 64 96 48 92',
];
const FET = (bulk) => [
  'LINE Normal 0 80 16 80', 'LINE Normal 16 32 16 80',
  'LINE Normal 24 16 24 40', 'LINE Normal 24 56 24 80', ...(bulk ? [] : ['LINE Normal 24 40 24 56']),
  'LINE Normal 24 24 48 24', 'LINE Normal 48 24 48 0',
  'LINE Normal 24 72 48 72', 'LINE Normal 48 72 48 96',
  ...(bulk ? ['LINE Normal 24 48 48 48', 'LINE Normal 24 40 24 56'] : []),
];
const JFET = [
  'LINE Normal 0 64 24 64', 'LINE Normal 24 16 24 80',
  'LINE Normal 24 24 48 24', 'LINE Normal 48 24 48 0',
  'LINE Normal 24 72 48 72', 'LINE Normal 48 72 48 96',
];

// nombre: [Prefix, Value, pines, ventanas {idx: [x, y, align]}, descripción, gráficos]
const SYMBOLS = {
  cap: ['C', 'C', P2V(0, 64), { 0: [24, 8, 'Left'], 3: [24, 56, 'Left'] }, 'Capacitor',
    [stub(16, 0, 28), stub(16, 36, 64), 'LINE Normal 0 28 32 28', 'LINE Normal 0 36 32 36']],
  polcap: ['C', 'C', P2V(0, 64), { 0: [24, 8, 'Left'], 3: [24, 57, 'Left'] }, 'Capacitor polarizado',
    [stub(16, 0, 28), stub(16, 36, 64), 'LINE Normal 0 28 32 28', 'RECTANGLE Normal 0 36 32 40',
      'LINE Normal 2 16 10 16', 'LINE Normal 6 12 6 20']],
  ind: ['L', 'L', P2V(16, 96), { 3: [-2, 72, 'Center'], 0: [-2, 40, 'Right'] }, 'Inductor',
    [stub(16, 16, 24), stub(16, 88, 96), ...[24, 40, 56, 72].map((y) => bumpRight(16, y, y + 16))]],
  ind2: ['L', 'L', P2V(16, 96), { 0: [36, 40, 'Left'], 3: [36, 80, 'Left'] }, 'Inductor (variante)',
    [stub(16, 16, 24), stub(16, 88, 96), ...[24, 40, 56, 72].map((y) => bumpRight(16, y, y + 16))]],
  voltage: ['V', 'V', P2V(16, 96, '+', '-', 0), { 0: [24, 16, 'Left'], 3: [24, 96, 'Left'] },
    'Fuente de tensión: DC, AC, PULSE, SINE, PWL, EXP o SFFM',
    sourceCircle(16, 96, ['LINE Normal -8 44 8 44', 'LINE Normal 0 36 0 52', 'LINE Normal -8 68 8 68'])],
  // de la carpeta Misc de LTspice (Misc\signal, Misc\cell, Misc\xtal)
  signal: ['V', 'SINE(0 1 1K)', P2V(16, 96, '+', '-', 0), { 0: [24, 16, 'Left'], 3: [24, 104, 'Left'] },
    'Fuente de señal: DC, AC, PULSE, SINE, PWL, EXP o SFFM',
    sourceCircle(16, 96, ['ARC Normal -16 48 0 64 -16 56 0 56', 'ARC Normal 0 48 16 64 16 56 0 56'])],
  cell: ['V', 'V', P2V(0, 64, '+', '-', 0), { 0: [24, 8, 'Left'], 3: [24, 56, 'Left'] },
    'Pila: fuente de tensión DC, AC, PULSE, SINE, PWL, EXP o SFFM',
    [stub(0, 0, 24), stub(0, 40, 64), 'LINE Normal -16 24 16 24', 'LINE Normal -8 40 8 40', 'LINE Normal -6 12 -6 20', 'LINE Normal -10 16 -2 16']],
  xtal: ['C', 'C', P2V(0, 64), { 0: [24, 0, 'Left'], 3: [24, 72, 'Left'] },
    'Cristal piezoeléctrico: C, Lser y Cpar fijan las resonancias serie y paralelo (es un capacitor)',
    [stub(16, 0, 20), stub(16, 44, 64), 'LINE Normal 0 20 32 20', 'LINE Normal 0 44 32 44', box(4, 26, 28, 38)]],
  current: ['I', 'I', P2V(0, 80, '+', '-', 0), { 0: [24, 0, 'Left'], 3: [24, 80, 'Left'] },
    'Fuente de corriente: DC, AC, PULSE, SINE, PWL, EXP o SFFM',
    sourceCircle(0, 80, ['LINE Normal 0 26 0 54', 'LINE Normal -6 46 0 54', 'LINE Normal 6 46 0 54'])],
  diode: ['D', 'D', P2V(0, 64, '+', '-'), { 0: [24, 0, 'Left'], 3: [24, 64, 'Left'] }, 'Diodo', diodeBody()],
  zener: ['D', 'D', P2V(0, 64, '+', '-'), { 0: [24, 0, 'Left'], 3: [24, 64, 'Left'] }, 'Diodo Zener',
    diodeBody(['LINE Normal 0 40 -4 36', 'LINE Normal 32 40 36 44'])],
  schottky: ['D', 'D', P2V(0, 64, '+', '-'), { 0: [24, 0, 'Left'], 3: [24, 64, 'Left'] }, 'Diodo Schottky',
    diodeBody(['LINE Normal 0 40 0 36', 'LINE Normal 32 40 32 44'])],
  LED: ['D', 'D', P2V(0, 64, '+', '-'), { 0: [24, 0, 'Left'], 3: [24, 64, 'Left'] }, 'LED',
    diodeBody(['LINE Normal 36 24 48 12', 'LINE Normal 36 32 48 20', 'LINE Normal 48 12 42 14', 'LINE Normal 48 20 42 22'])],
  npn: ['QN', 'NPN', [[64, 0, 'C', 1], [0, 48, 'B', 2], [64, 96, 'E', 3]],
    { 0: [56, 32, 'Left'], 3: [56, 68, 'Left'] }, 'Transistor bipolar NPN', BJT(false)],
  pnp: ['QP', 'PNP', [[64, 0, 'C', 1], [0, 48, 'B', 2], [64, 96, 'E', 3]],
    { 0: [84, 32, 'Left'], 3: [84, 68, 'Left'] }, 'Transistor bipolar PNP', BJT(true)],
  nmos: ['MN', 'NMOS', [[48, 0, 'D', 1], [0, 80, 'G', 2], [48, 96, 'S', 3]],
    { 0: [56, 32, 'Left'], 3: [56, 72, 'Left'] }, 'MOSFET canal N', FET(false)],
  pmos: ['MP', 'PMOS', [[48, 0, 'D', 1], [0, 80, 'G', 2], [48, 96, 'S', 3]],
    { 0: [56, 32, 'Left'], 3: [56, 72, 'Left'] }, 'MOSFET canal P', FET(false)],
  nmos4: ['MN', 'NMOS', [[48, 0, 'D', 1], [0, 80, 'G', 2], [48, 96, 'S', 3], [48, 48, 'B', 4]],
    { 0: [56, 32, 'Left'], 3: [56, 72, 'Left'] }, 'MOSFET canal N con sustrato explícito', FET(true)],
  pmos4: ['MP', 'PMOS', [[48, 0, 'D', 1], [0, 80, 'G', 2], [48, 96, 'S', 3], [48, 48, 'B', 4]],
    { 0: [56, 32, 'Left'], 3: [56, 72, 'Left'] }, 'MOSFET canal P con sustrato explícito', FET(true)],
  njf: ['JN', 'NJF', [[48, 0, 'D', 1], [0, 64, 'G', 2], [48, 96, 'S', 3]],
    { 0: [56, 32, 'Left'], 3: [56, 72, 'Left'] }, 'JFET canal N', JFET],
  pjf: ['JP', 'PJF', [[48, 0, 'D', 1], [0, 64, 'G', 2], [48, 96, 'S', 3]],
    { 0: [56, 32, 'Left'], 3: [56, 72, 'Left'] }, 'JFET canal P', JFET],
  e: ['E', 'E', [[0, 16, '+', 1], [0, 96, '-', 2], [-48, 32, 'P', 3], [-48, 80, 'N', 4]],
    { 0: [24, 16, 'Left'], 3: [24, 96, 'Left'] }, 'Fuente de tensión controlada por tensión', null],
  e2: ['E', 'E', [[0, 16, '+', 1], [0, 96, '-', 2], [-48, 80, 'P', 3], [-48, 32, 'N', 4]],
    { 0: [24, 16, 'Left'], 3: [24, 96, 'Left'] }, 'Fuente de tensión controlada por tensión', null],
  f: ['F', 'F', P2V(0, 80, '+', '-', 0), { 0: [24, 0, 'Left'], 3: [24, 80, 'Left'] },
    'Fuente de corriente controlada por corriente',
    sourceCircle(0, 80, ['LINE Normal 0 26 0 54', 'LINE Normal -6 46 0 54', 'LINE Normal 6 46 0 54'])],
  g: ['G', 'G', [[0, 96, '+', 1], [0, 16, '-', 2], [-48, 32, 'NC+', 3], [-48, 80, 'NC-', 4]],
    { 0: [24, 16, 'Left'], 3: [24, 96, 'Left'] }, 'Fuente de corriente controlada por tensión', null],
  g2: ['G', 'G', [[0, 96, '+', 1], [0, 16, '-', 2], [-48, 80, 'NC+', 3], [-48, 32, 'NC-', 4]],
    { 0: [24, 16, 'Left'], 3: [24, 96, 'Left'] }, 'Fuente de corriente controlada por tensión', null],
  h: ['H', 'H', P2V(16, 96, '+', '-', 0), { 0: [24, 16, 'Left'], 3: [24, 96, 'Left'] },
    'Fuente de tensión controlada por corriente',
    sourceCircle(16, 96, ['LINE Normal -8 44 8 44', 'LINE Normal 0 36 0 52', 'LINE Normal -8 68 8 68'])],
  bv: ['B', 'V=F(...)', P2V(16, 96, '+', '-', 0), { 0: [24, 16, 'Left'], 3: [24, 96, 'Left'] },
    'Fuente de tensión comportamental', null],
  bi: ['B', 'I=F(...)', P2V(0, 80, '+', '-', 0), { 0: [24, 0, 'Left'], 3: [24, 80, 'Left'] },
    'Fuente de corriente comportamental', null],
  sw: ['S', 'SW', [[0, 16, 'A', 1], [0, 96, 'B', 2], [-48, 80, 'NC+', 3], [-48, 32, 'NC-', 4]],
    { 0: [24, 16, 'Left'], 3: [24, 96, 'Left'] }, 'Llave controlada por tensión',
    [stub(0, 16, 40), stub(0, 72, 96), 'LINE Normal 0 72 16 44', box(-24, 24, 8, 88)]],
  csw: ['W', 'CSW', P2V(0, 80, '+', '-', 0), { 0: [24, 0, 'Left'], 3: [24, 88, 'Left'] },
    'Llave controlada por corriente',
    [stub(0, 0, 24), stub(0, 56, 80), 'LINE Normal 0 56 16 28', box(-16, 16, 24, 64)]],
  tline: ['T', 'Td=50n Z0=50', [[-48, -16, 'I1', 1], [-48, 16, 'R1', 2], [48, -16, 'I2', 3], [48, 16, 'R2', 4]],
    { 0: [0, -16, 'Bottom'], 3: [0, 16, 'Top'] }, 'Línea de transmisión ideal sin pérdidas',
    ['LINE Normal -48 -16 -32 -16', 'LINE Normal 32 -16 48 -16', 'LINE Normal -48 16 -32 16', 'LINE Normal 32 16 48 16',
      'LINE Normal -32 -8 32 -8', 'LINE Normal -32 8 32 8', 'ARC Normal -40 -8 -24 8 -32 -8 -32 8',
      'ARC Normal 24 -8 40 8 32 8 32 -8']],
};

for (const [name, [prefix, value, pins, windows, desc, graphics]] of Object.entries(SYMBOLS)) {
  // Fuentes controladas sin gráfico propio: rombo con los pines de control
  const g = graphics ?? (() => {
    const top = Math.min(...pins.filter(([x]) => x === 0).map(([, y]) => y));
    const bot = Math.max(...pins.filter(([x]) => x === 0).map(([, y]) => y));
    const cy = (top + bot) / 2;
    return [stub(0, top, cy - 24), stub(0, cy + 24, bot),
      `LINE Normal 0 ${cy - 24} 24 ${cy}`, `LINE Normal 24 ${cy} 0 ${cy + 24}`,
      `LINE Normal 0 ${cy + 24} -24 ${cy}`, `LINE Normal -24 ${cy} 0 ${cy - 24}`,
      ...controlPins(pins)];
  })();
  const lines = [
    'Version 4',
    'SymbolType CELL',
    ...g,
    ...Object.entries(windows).map(([i, [x, y, a]]) => `WINDOW ${i} ${x} ${y} ${a} 2`),
    `SYMATTR Value ${value}`,
    `SYMATTR Prefix ${prefix}`,
    `SYMATTR Description ${desc}`,
    ...pins.flatMap(([x, y, pn, order]) => [
      `PIN ${x} ${y} NONE 0`,
      `PINATTR PinName ${pn}`,
      `PINATTR SpiceOrder ${order}`,
    ]),
  ];
  writeFileSync(join(OUT, `${name}.asy`), lines.join('\r\n') + '\r\n', 'latin1');
}
console.log(`${Object.keys(SYMBOLS).length} símbolos base escritos en library/sym/`);
