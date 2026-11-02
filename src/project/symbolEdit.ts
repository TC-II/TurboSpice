// Edición del símbolo (.asy) de un subcircuito (#180), sobre el texto: se cambian sólo las líneas
// que hacen falta (PIN, RECTANGLE, SYMATTR SpiceLine, WINDOW 39) y el resto queda como estaba.

const LINE = /\r\n|\r|\n/;
const lines = (text: string) => text.split(LINE).filter((l, i, a) => l !== '' || i < a.length - 1);
const join = (ls: string[]) => ls.join('\n') + '\n';

export interface SymPin {
  /** índice de la línea PIN */
  line: number;
  x: number;
  y: number;
  align: string;
  name: string;
  order: number;
}

/** Pines del símbolo, en el orden del archivo */
export function symPins(text: string): SymPin[] {
  const ls = lines(text);
  const out: SymPin[] = [];
  ls.forEach((l, i) => {
    const m = /^PIN\s+(-?\d+)\s+(-?\d+)\s+(\S+)/.exec(l);
    if (!m) return;
    let name = '';
    let order = out.length + 1;
    for (let k = i + 1; k < ls.length && ls[k].startsWith('PINATTR'); k++) {
      const a = /^PINATTR\s+(\S+)\s+(.*)$/.exec(ls[k]);
      if (a?.[1] === 'PinName') name = a[2].trim();
      if (a?.[1] === 'SpiceOrder') order = Number(a[2]);
    }
    out.push({ line: i, x: Number(m[1]), y: Number(m[2]), align: m[3], name, order });
  });
  return out;
}

/** Cuerpo: el primer RECTANGLE (x1 y1 x2 y2 ordenados) */
export function symBody(text: string): { x1: number; y1: number; x2: number; y2: number } | null {
  const m = /^RECTANGLE\s+\S+\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/m.exec(text);
  if (!m) return null;
  const [a, b, c, d] = m.slice(1).map(Number);
  return { x1: Math.min(a, c), y1: Math.min(b, d), x2: Math.max(a, c), y2: Math.max(b, d) };
}

/** Lado del cuerpo más cercano a un punto (para la alineación del nombre del pin) */
function sideOf(x: number, y: number, body: ReturnType<typeof symBody>): string {
  if (!body) return x < 0 ? 'LEFT' : 'RIGHT';
  const d = [
    ['LEFT', Math.abs(x - body.x1)],
    ['RIGHT', Math.abs(x - body.x2)],
    ['TOP', Math.abs(y - body.y1)],
    ['BOTTOM', Math.abs(y - body.y2)],
  ] as const;
  return [...d].sort((a, b) => a[1] - b[1])[0][0];
}

/** Mueve el pin `index` (orden en el archivo) */
export function movePin(text: string, index: number, x: number, y: number, keepAlign = false): string {
  const ls = lines(text);
  const pin = symPins(text)[index];
  if (!pin) return text;
  const off = /^PIN\s+\S+\s+\S+\s+\S+\s+(\S+)/.exec(ls[pin.line])?.[1] ?? '8';
  // la alineación elegida a mano (y un nombre oculto, NONE) se conserva; si no, la del lado más cercano
  ls[pin.line] = `PIN ${x} ${y} ${keepAlign || pin.align === 'NONE' ? pin.align : sideOf(x, y, symBody(text))} ${off}`;
  return join(ls);
}

/** Cambia el cuerpo; los rótulos de nombre y valor se acomodan arriba y abajo */
export function resizeBody(text: string, b: { x1: number; y1: number; x2: number; y2: number }): string {
  const ls = lines(text);
  const i = ls.findIndex((l) => l.startsWith('RECTANGLE'));
  const rect = `RECTANGLE Normal ${b.x1} ${b.y1} ${b.x2} ${b.y2}`;
  if (i >= 0) ls[i] = rect;
  else ls.splice(Math.max(1, ls.findIndex((l) => l.startsWith('SymbolType')) + 1), 0, rect);
  const cx = Math.round((b.x1 + b.x2) / 2);
  // los parámetros sólo siguen al cuerpo si están donde se los pone solos (no si se los movió)
  const old = symBody(text);
  const p39 = old && `${Math.round((old.x1 + old.x2) / 2)} ${old.y2 + 24}`;
  for (let k = 0; k < ls.length; k++) {
    if (/^WINDOW 0 /.test(ls[k])) ls[k] = `WINDOW 0 ${cx} ${b.y1 - 8} Bottom 2`;
    else if (/^WINDOW 3 /.test(ls[k])) ls[k] = `WINDOW 3 ${cx} ${b.y2 + 8} Top 2`;
    else if (/^WINDOW 39 /.test(ls[k]) && (!p39 || ls[k].startsWith(`WINDOW 39 ${p39} `))) ls[k] = `WINDOW 39 ${cx} ${b.y2 + 24} Top 2`;
  }
  return join(ls);
}

/**
 * Los pines siguen a los puertos del esquemático: se quedan los que siguen existiendo (en su
 * lugar), se sacan los de puertos que ya no están y los nuevos se agregan en el borde izquierdo
 * (entradas) o derecho, en el primer lugar libre. SpiceOrder = orden de los puertos.
 */
export function syncPins(text: string, ports: { name: string; dir?: string }[]): string {
  const pins = symPins(text);
  let ls = lines(text);
  // sacar los que sobran (con sus PINATTR)
  const keep = new Set(ports.map((p) => p.name.toLowerCase()));
  const drop = new Set<number>();
  for (const p of pins) {
    if (keep.has(p.name.toLowerCase())) continue;
    drop.add(p.line);
    for (let k = p.line + 1; k < ls.length && ls[k].startsWith('PINATTR'); k++) drop.add(k);
  }
  ls = ls.filter((_, i) => !drop.has(i));
  const have = new Set(pins.filter((p) => keep.has(p.name.toLowerCase())).map((p) => p.name.toLowerCase()));
  const body = symBody(text) ?? { x1: -48, y1: -16, x2: 48, y2: 16 };
  const taken = new Set(pins.filter((p) => keep.has(p.name.toLowerCase())).map((p) => `${p.x},${p.y}`));
  const free = (x: number) => {
    for (let y = body.y1 + 16; ; y += 32) if (!taken.has(`${x},${y}`)) return taken.add(`${x},${y}`), y;
  };
  let maxY = body.y2;
  for (const p of ports) {
    if (have.has(p.name.toLowerCase())) continue;
    const left = !/^out/i.test(p.dir ?? '') && !/out/i.test(p.name);
    const x = left ? body.x1 : body.x2;
    const y = free(x);
    ls.push(`PIN ${x} ${y} ${left ? 'LEFT' : 'RIGHT'} 8`, `PINATTR PinName ${p.name}`, 'PINATTR SpiceOrder 0');
    maxY = Math.max(maxY, y + 16);
  }
  // SpiceOrder en el orden de los puertos
  const order = new Map(ports.map((p, i) => [p.name.toLowerCase(), i + 1]));
  let cur = '';
  ls = ls.map((l) => {
    const n = /^PINATTR PinName (.*)$/.exec(l);
    if (n) cur = n[1].trim().toLowerCase();
    return /^PINATTR SpiceOrder /.test(l) ? `PINATTR SpiceOrder ${order.get(cur) ?? 0}` : l;
  });
  // agrandar el cuerpo si un pin nuevo quedó fuera (los que ya estaban, aunque estén fuera del
  // rectángulo, como un clk dibujado abajo, son del dibujo: no se tocan)
  return maxY > body.y2 ? resizeBody(join(ls), { ...body, y2: maxY }) : join(ls);
}

// --- un .asy existente como símbolo (#199) --------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Cambia el nombre (PinName) del pin `index` y reordena con syncPins */
function renamePins(text: string, names: Map<number, string>): string {
  const pins = symPins(text);
  const ls = lines(text);
  pins.forEach((p, i) => {
    const name = names.get(i);
    if (name === undefined) return;
    let k = p.line + 1;
    for (; k < ls.length && ls[k].startsWith('PINATTR'); k++) {
      if (/^PINATTR PinName /.test(ls[k])) {
        ls[k] = `PINATTR PinName ${name}`;
        return;
      }
    }
    ls.splice(p.line + 1, 0, `PINATTR PinName ${name}`);
    // las líneas de abajo se corrieron una: los índices de los pines siguientes también
    pins.forEach((q) => q.line > p.line && q.line++);
  });
  return join(ls);
}

/**
 * Usa el dibujo y los pines de otro símbolo (un opamp, un transistor) para el subcircuito: queda
 * como BLOCK, sin los atributos que lo harían otro componente (Prefix, Value, SpiceModel…), con los
 * parámetros `params`. Cada pin toma un puerto: el de nombre parecido («In+» → «inp» o «in_p» no;
 * «OUT» → «out» sí) y, si no, los que quedan en el orden de los pines (SpiceOrder). Los pines que
 * sobran se quitan y los puertos que no tienen pin se agregan en un borde (syncPins).
 */
export function adoptSymbol(asy: string, ports: { name: string; dir?: string }[], params: [string, string][] = []): string {
  const drop = /^SYMATTR (Prefix|Value|Value2|SpiceModel|ModelFile|SpiceLine|SpiceLine2|Def_Sub|InstName)\b/;
  let text = join(
    lines(asy)
      .map((l) => (/^SymbolType /.test(l) ? 'SymbolType BLOCK' : l))
      .filter((l) => !drop.test(l)),
  );
  const pins = symPins(text).map((p, i) => ({ ...p, i }));
  const free = new Set(ports.map((p) => p.name));
  const names = new Map<number, string>();
  for (const p of pins) {
    const m = [...free].find((n) => norm(n) === norm(p.name));
    if (m) names.set(p.i, m), free.delete(m);
  }
  const rest = [...free];
  for (const p of [...pins].sort((a, b) => a.order - b.order)) if (!names.has(p.i) && rest.length) names.set(p.i, rest.shift()!);
  // los pines sin puerto quedan con un nombre que no es puerto: syncPins los quita
  pins.forEach((p) => names.has(p.i) || names.set(p.i, `\u0000${p.i}`));
  text = renamePins(text, names);
  return setSymParams(syncPins(text, ports), params);
}

/** Asigna el puerto `port` al pin `index`; si otro pin lo tenía, intercambian (#199) */
export function assignPin(text: string, index: number, port: string, ports: { name: string; dir?: string }[]): string {
  const pins = symPins(text);
  if (!pins[index]) return text;
  const names = new Map<number, string>([[index, port]]);
  const other = pins.findIndex((p, i) => i !== index && p.name.toLowerCase() === port.toLowerCase());
  if (other >= 0) names.set(other, pins[index].name);
  return syncPins(renamePins(text, names), ports);
}

// --- parámetros ---------------------------------------------------------------------------

/** "G=1 R={2*k} C=1n" → [["G","1"],["R","{2*k}"],["C","1n"]] (llaves y comillas con espacios) */
export function parseParamList(s: string): [string, string][] {
  const out: [string, string][] = [];
  const re = /([A-Za-z_]\w*)\s*=\s*(\{[^}]*\}|"[^"]*"|\S+)/g;
  for (const m of s.matchAll(re)) out.push([m[1], m[2]]);
  return out;
}

export const formatParamList = (ps: [string, string][]) => ps.map(([k, v]) => `${k}=${v}`).join(' ');

/** Parámetros del símbolo (SYMATTR SpiceLine) */
export const symParams = (text: string): [string, string][] => parseParamList(/^SYMATTR SpiceLine (.*)$/m.exec(text)?.[1] ?? '');

/** Cambia los parámetros del símbolo; con parámetros se muestran en la instancia (WINDOW 39) */
export function setSymParams(text: string, ps: [string, string][]): string {
  // la posición de los parámetros (WINDOW 39) se conserva si ya la tenían (se la pudo mover)
  const w39 = lines(text).find((l) => /^WINDOW 39 /.test(l));
  let ls = lines(text).filter((l) => !/^SYMATTR SpiceLine /.test(l) && !/^WINDOW 39 /.test(l));
  if (ps.length) {
    const body = symBody(text) ?? { x1: 0, y1: 0, x2: 0, y2: 0 };
    const i = ls.findIndex((l) => l.startsWith('SYMATTR'));
    const at = i < 0 ? ls.findIndex((l) => l.startsWith('PIN')) : i;
    const add = [w39 ?? `WINDOW 39 ${Math.round((body.x1 + body.x2) / 2)} ${body.y2 + 24} Top 2`, `SYMATTR SpiceLine ${formatParamList(ps)}`];
    ls = at < 0 ? [...ls, ...add] : [...ls.slice(0, at), ...add, ...ls.slice(at)];
  }
  return join(ls);
}

/** Rótulo de los parámetros en la instancia (WINDOW 39), si el símbolo tiene */
export function symParamWindow(text: string): { x: number; y: number; align: string; size: number } | null {
  const m = /^WINDOW 39 (-?\d+) (-?\d+) (\S+)(?: (\d+))?/m.exec(text);
  return m ? { x: Number(m[1]), y: Number(m[2]), align: m[3], size: m[4] === undefined ? 2 : Number(m[4]) } : null;
}

/** Mueve el rótulo de los parámetros (WINDOW 39); las instancias nuevas lo ponen ahí */
export function moveParamWindow(text: string, x: number, y: number): string {
  const ls = lines(text);
  const i = ls.findIndex((l) => /^WINDOW 39 /.test(l));
  if (i < 0) return text;
  const m = /^WINDOW 39 \S+ \S+ (.*)$/.exec(ls[i]);
  ls[i] = `WINDOW 39 ${x} ${y} ${m?.[1] ?? 'Top 2'}`;
  return join(ls);
}

export interface SymWindow {
  /** número de WINDOW (0 InstName, 3 Value, 38 SpiceModel, 39 SpiceLine, 40 SpiceLine2, 123 Value2) */
  n: number;
  x: number;
  y: number;
  align: string;
  size: number;
}

/** Rótulos (WINDOW) del símbolo */
export function symWindows(text: string): SymWindow[] {
  return [...text.matchAll(/^WINDOW (\d+) (-?\d+) (-?\d+) (\S+)(?: (\d+))?/gm)].map((m) => ({
    n: Number(m[1]),
    x: Number(m[2]),
    y: Number(m[3]),
    align: m[4],
    size: m[5] === undefined ? 2 : Number(m[5]),
  }));
}

/** ¿Se ve el rótulo? Sólo «Invisible» lo oculta: el tamaño 0 es la letra más chica (spec §7.1) */
export const windowShown = (w: SymWindow) => w.align !== 'Invisible';

/** Mueve el rótulo `n` (conserva su alineación y tamaño) */
export function moveWindow(text: string, n: number, x: number, y: number): string {
  const ls = lines(text);
  const i = ls.findIndex((l) => l.startsWith(`WINDOW ${n} `));
  if (i < 0) return text;
  const m = /^WINDOW \d+ \S+ \S+ (.*)$/.exec(ls[i]);
  ls[i] = `WINDOW ${n} ${x} ${y} ${m?.[1] ?? 'Left 2'}`;
  return join(ls);
}

// --- dibujo: líneas, rectángulos, círculos y pines nuevos ----------------------------------

export type ShapeKind = 'LINE' | 'RECTANGLE' | 'CIRCLE';

export interface SymShape {
  /** índice de la línea en el texto */
  line: number;
  kind: ShapeKind;
  coords: [number, number, number, number];
}

/** Figuras del símbolo (LINE, RECTANGLE, CIRCLE), en el orden del archivo */
export function symShapes(text: string): SymShape[] {
  const out: SymShape[] = [];
  lines(text).forEach((l, i) => {
    const m = /^(LINE|RECTANGLE|CIRCLE)\s+\S+\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/.exec(l);
    if (m) out.push({ line: i, kind: m[1] as ShapeKind, coords: [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])] });
  });
  return out;
}

/** Agrega una figura antes de los pines y atributos (detrás de las que ya hay) */
export function addShape(text: string, kind: ShapeKind, c: [number, number, number, number]): string {
  const ls = lines(text);
  const last = symShapes(text).at(-1)?.line;
  const at = last !== undefined ? last + 1 : Math.max(1, ls.findIndex((l) => /^SymbolType /.test(l)) + 1);
  ls.splice(at, 0, `${kind} Normal ${c.join(' ')}`);
  return join(ls);
}

/** Cambia las coordenadas de la figura de la línea `line` (conserva su estilo) */
export function setShape(text: string, line: number, c: [number, number, number, number]): string {
  const ls = lines(text);
  const m = /^(LINE|RECTANGLE|CIRCLE)\s+(\S+)\s+-?\d+\s+-?\d+\s+-?\d+\s+-?\d+(.*)$/.exec(ls[line] ?? '');
  if (!m) return text;
  ls[line] = `${m[1]} ${m[2]} ${c.join(' ')}${m[3]}`;
  return join(ls);
}

/** Saca la figura de la línea `line` */
export function removeShape(text: string, line: number): string {
  const ls = lines(text);
  if (!/^(LINE|RECTANGLE|CIRCLE|TEXT)\s/.test(ls[line] ?? '')) return text;
  ls.splice(line, 1);
  return join(ls);
}

// --- textos del símbolo (TEXT x y alineación tamaño contenido; en el .asy, sin «;», spec §5.3) ----

export interface SymText {
  /** índice de la línea en el texto */
  line: number;
  x: number;
  y: number;
  align: string;
  size: number;
  text: string;
}

export function symTexts(text: string): SymText[] {
  const out: SymText[] = [];
  lines(text).forEach((l, i) => {
    const m = /^TEXT\s+(-?\d+)\s+(-?\d+)\s+(\S+)\s+(\d+)\s?(.*)$/.exec(l);
    if (m) out.push({ line: i, x: Number(m[1]), y: Number(m[2]), align: m[3], size: Number(m[4]), text: m[5] });
  });
  return out;
}

const textLine = (t: Omit<SymText, 'line'>) => `TEXT ${t.x} ${t.y} ${t.align} ${t.size} ${t.text.replace(/[\r\n]+/g, ' ')}`;

/** Agrega un texto detrás de las figuras (antes de los atributos y los pines) */
export function addText(text: string, t: Omit<SymText, 'line'>): string {
  const ls = lines(text);
  const last = Math.max(symShapes(text).at(-1)?.line ?? -1, symTexts(text).at(-1)?.line ?? -1);
  const at = last >= 0 ? last + 1 : Math.max(1, ls.findIndex((l) => /^SymbolType /.test(l)) + 1);
  ls.splice(at, 0, textLine(t));
  return join(ls);
}

/** Cambia el texto de la línea `line` (posición, alineación, tamaño o contenido) */
export function setText(text: string, line: number, patch: Partial<Omit<SymText, 'line'>>): string {
  const t = symTexts(text).find((x) => x.line === line);
  if (!t) return text;
  const ls = lines(text);
  ls[line] = textLine({ ...t, ...patch });
  return join(ls);
}

/** Agrega un pin para el puerto `name` en (x, y); SpiceOrder al final */
export function addPin(text: string, name: string, x: number, y: number): string {
  const ls = lines(text);
  const order = symPins(text).length + 1;
  ls.push(`PIN ${x} ${y} ${sideOf(x, y, symBody(text))} 8`, `PINATTR PinName ${name}`, `PINATTR SpiceOrder ${order}`);
  return join(ls);
}

/** Alineación del nombre del pin `index` (LEFT, RIGHT, TOP, BOTTOM; NONE lo oculta) */
export function setPinAlign(text: string, index: number, align: string): string {
  const ls = lines(text);
  const pin = symPins(text)[index];
  if (!pin) return text;
  const off = align === 'NONE' ? 0 : Number(/^PIN\s+\S+\s+\S+\s+\S+\s+(\S+)/.exec(ls[pin.line])?.[1]) || 8;
  ls[pin.line] = `PIN ${pin.x} ${pin.y} ${align} ${off}`;
  return join(ls);
}

/** Lado del cuerpo que le corresponde al pin `index` por su posición (para volver a mostrar su nombre) */
export const pinSide = (text: string, index: number) => {
  const p = symPins(text)[index];
  return p ? sideOf(p.x, p.y, symBody(text)) : 'LEFT';
};

/** Saca el pin `index` con sus PINATTR; los SpiceOrder mayores bajan uno */
export function removePin(text: string, index: number): string {
  const pins = symPins(text);
  const pin = pins[index];
  if (!pin) return text;
  const ls = lines(text);
  let end = pin.line + 1;
  while (end < ls.length && ls[end].startsWith('PINATTR')) end++;
  ls.splice(pin.line, end - pin.line);
  return join(
    ls.map((l) => {
      const m = /^PINATTR SpiceOrder (\d+)$/.exec(l);
      return m && Number(m[1]) > pin.order ? `PINATTR SpiceOrder ${Number(m[1]) - 1}` : l;
    }),
  );
}

/** Pin nuevo `name` en un lugar libre de la grilla, a la izquierda del cuerpo */
export function addFreePin(text: string, name: string, grid: number): string {
  const pins = symPins(text);
  const b = symBody(text);
  const x = b ? Math.floor((b.x1 - 1) / grid) * grid : -2 * grid;
  let y = b ? Math.ceil(b.y1 / grid) * grid : 0;
  while (pins.some((p) => p.x === x && p.y === y)) y += grid;
  return addPin(text, name, x, y);
}

// --- copiar y pegar ------------------------------------------------------------------------

/** Lo copiado del símbolo: las líneas de las figuras y textos, y las de cada pin (PIN y sus PINATTR) */
export interface SymClip {
  shapes: string[];
  pins: string[][];
}

/** Copia las figuras (por su línea) y los pines (por su índice) */
export function copySym(text: string, shapeLines: number[], pinIdx: number[]): SymClip {
  const ls = lines(text);
  const pins = symPins(text);
  return {
    shapes: shapeLines.filter((l) => ls[l] !== undefined).map((l) => ls[l]),
    pins: pinIdx.flatMap((i) => {
      const p = pins[i];
      if (!p) return [];
      let end = p.line + 1;
      while (end < ls.length && ls[end].startsWith('PINATTR')) end++;
      return [ls.slice(p.line, end)];
    }),
  };
}

/** Pega lo copiado corrido (dx, dy): las figuras detrás de las que hay; los pines al final, con un
 *  nombre libre (A → A_1) y el SpiceOrder siguiente. Devuelve el texto y qué quedó seleccionado */
export function pasteSym(text: string, clip: SymClip, dx: number, dy: number): { text: string; shapes: number[]; pins: number[] } {
  const shift = (l: string) =>
    l
      .replace(
        /^(LINE|RECTANGLE|CIRCLE)(\s+\S+\s+)(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/,
        (_, k: string, st: string, a: string, b: string, c: string, d: string) => `${k}${st}${+a + dx} ${+b + dy} ${+c + dx} ${+d + dy}`,
      )
      .replace(/^TEXT\s+(-?\d+)\s+(-?\d+)/, (_, a: string, b: string) => `TEXT ${+a + dx} ${+b + dy}`);
  let ls = lines(text);
  const last = Math.max(symShapes(text).at(-1)?.line ?? -1, symTexts(text).at(-1)?.line ?? -1);
  const at = last >= 0 ? last + 1 : Math.max(1, ls.findIndex((l) => /^SymbolType /.test(l)) + 1);
  ls = [...ls.slice(0, at), ...clip.shapes.map(shift), ...ls.slice(at)];
  const shapes = clip.shapes.map((_, i) => at + i);
  const names = new Set(symPins(text).map((p) => p.name.toLowerCase()));
  let order = Math.max(0, ...symPins(text).map((p) => p.order));
  const before = symPins(join(ls)).length;
  for (const block of clip.pins) {
    const base = /^PINATTR PinName (.*)$/m.exec(block.join('\n'))?.[1].trim() || 'p';
    let nm = base;
    for (let k = 1; names.has(nm.toLowerCase()); k++) nm = `${base}_${k}`;
    names.add(nm.toLowerCase());
    order++;
    ls.push(
      ...block.map((l) => {
        if (l.startsWith('PIN ')) return l.replace(/^PIN (-?\d+) (-?\d+)/, (_, x: string, y: string) => `PIN ${+x + dx} ${+y + dy}`);
        if (l.startsWith('PINATTR PinName')) return `PINATTR PinName ${nm}`;
        if (l.startsWith('PINATTR SpiceOrder')) return `PINATTR SpiceOrder ${order}`;
        return l;
      }),
    );
  }
  return { text: join(ls), shapes, pins: clip.pins.map((_, i) => before + i) };
}
