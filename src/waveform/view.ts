// Vista de resultados: qué trazas se grafican, en qué panel y con qué color. Se puede
// recordar por tipo de análisis; se guarda dentro del .asc (";.plot …") y va y viene con el
// .plt de LTspice.
import { readData, writeData } from '../asc/dataText.ts';
import type { AscDoc } from '../asc/model.ts';
import { isDigitalExpr, type Radix } from './digital.ts';

export interface Trace {
  /** expresión con nombres de LTspice: "V(out)", "I(R1)", "V(out)/V(in)" */
  expr: string;
  /** color CSS; si falta se usa la paleta por posición */
  color?: string;
  hidden?: boolean;
  /** bus digital (#209): cómo se muestra su valor */
  radix?: Radix;
  /** traza de espectro (#236, #260): la FFT de la expresión del transitorio, con su ventana y rango */
  fft?: PaneFft;
}

/** FFT de una traza (#236): ventana y rango de tiempo usado (sin rango = todo) */
export interface PaneFft {
  window: 'rect' | 'hann' | 'hamming' | 'blackman' | 'flattop';
  from?: number;
  to?: number;
}

export interface Pane {
  traces: Trace[];
  /** panel digital (#209): un carril por traza Dig(…); no comparte ejes con las analógicas */
  digital?: boolean;
  /** @deprecated (#245) la FFT era del panel; ahora va en cada traza. Sólo se lee de vistas viejas */
  fft?: PaneFft;
}

/** Tipo de un panel según sus trazas (#260): de espectro si tiene FFT, null si está vacío */
export const paneKind = (p: Pane): 'fft' | 'time' | null => (p.traces.length ? (p.traces.some((tt) => tt.fft) ? 'fft' : 'time') : null);
export const isFftPane = (p: Pane | undefined) => !!p && paneKind(p) === 'fft';
/** ¿La traza puede ir a ese panel? Uno vacío acepta cualquiera; si no, del mismo tipo */
export const acceptsTrace = (p: Pane, tt: Trace) => {
  const k = paneKind(p);
  // lo digital no comparte ejes con lo analógico (#209); un panel vacío acepta cualquiera
  if (p.traces.length && !!p.digital !== isDigitalExpr(tt.expr)) return false;
  return k === null || k === (tt.fft ? 'fft' : 'time');
};

export const sameFft = (a?: PaneFft, b?: PaneFft) => (!a || !b ? !a && !b : a.window === b.window && a.from === b.from && a.to === b.to);
/** Identidad de una traza (#260): la expresión y, si es FFT, su ventana y rango */
export const sameTrace = (a: Trace, b: Trace) => sameExpr(a.expr, b.expr) && sameFft(a.fft, b.fft);

/** Paneles por tipo de análisis ("tran", "ac", "dc", "noise"…) */
export type PlotView = Record<string, Pane[]>;

export type CursorKey = 'a' | 'b';
export interface Cursors {
  a?: number;
  b?: number;
  /** traza (etiqueta de la curva) que sigue cada cursor */
  ta?: string;
  tb?: string;
  /** último cursor movido: el que mueven las flechas */
  sel?: CursorKey;
}

/** Cursor que ubica un click fuera de las líneas (#234): el primero pone A, el segundo B y
 *  los siguientes mueven el más cercano. `toB` (Shift o click derecho) fuerza el B.
 *  `dist` mide la distancia en el gráfico (en px, para que valga también en escala log). */
export function cursorForClick(c: Cursors, x: number, toB = false, dist: (v: number) => number = (v) => Math.abs(v - x)): CursorKey {
  if (toB) return 'b';
  if (c.a === undefined) return 'a';
  if (c.b === undefined) return 'b';
  return dist(c.b) < dist(c.a) ? 'b' : 'a';
}

/** Estado del visor que no son las trazas: zoom y cursores (vale para un eje X) */
export interface PlotState {
  /** nombre del eje X ("time", "frequency"…) en el que valen el zoom y los cursores */
  scale?: string;
  xRange: [number, number] | null;
  /** eje Y fijado por un zoom a recuadro, por panel */
  yRanges?: Record<number, [number, number]>;
  cursors: Cursors;
  cursorMode: boolean;
}

/** Paleta por defecto (se distingue en fondo claro y oscuro) */
export const PALETTE = ['#2f9e44', '#1c7ed6', '#e03131', '#0c8599', '#ae3ec9', '#868e96', '#e8590c', '#5c940d', '#c2255c', '#1864ab'];

export const traceColor = (t: Trace, i: number) => t.color ?? PALETTE[i % PALETTE.length];

/**
 * Paneles con el color de cada traza fijo (las que no tienen toman el que muestran por su
 * posición): así, al quitar una, las demás no cambian de color.
 */
export function colorize(panes: Pane[]): Pane[] {
  if (panes.every((p) => p.traces.every((t) => t.color))) return panes;
  return panes.map((p) => (p.traces.every((t) => t.color) ? p : { ...p, traces: p.traces.map((t, i) => (t.color ? t : { ...t, color: traceColor(t, i) })) }));
}

/** Color para una traza nueva: el de la misma expresión en otro panel, o el primero libre */
export function colorFor(panes: Pane[], expr: string): string {
  const all = panes.flatMap((p) => p.traces.map((t, i) => ({ expr: t.expr, color: traceColor(t, i).toLowerCase() })));
  const same = all.find((t) => sameExpr(t.expr, expr));
  if (same) return same.color;
  const used = new Set(all.map((t) => t.color));
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[all.length % PALETTE.length];
}

/**
 * Agrega una traza al panel `i`. Si ya está en ese panel no hace nada (no se quita: eso es a
 * mano); si está en otro, queda en los dos con el mismo color.
 */
export function addTraceTo(panes: Pane[], i: number, expr: string): Pane[] {
  let k = Math.max(0, Math.min(i, panes.length - 1));
  let base = panes.length ? panes : emptyPanes();
  // en un panel de FFT no (#260), y una señal digital sólo en uno digital (#209): al primer panel
  // que la acepte, o a uno nuevo
  const tt: Trace = { expr };
  if (!acceptsTrace(base[k], tt)) {
    k = base.findIndex((p) => acceptsTrace(p, tt));
    if (k < 0) {
      base = [...base, { traces: [] }];
      k = base.length - 1;
    }
  }
  // un panel vacío toma el tipo de la primera traza
  if (!base[k].traces.length && !!base[k].digital !== isDigitalExpr(expr))
    base = base.map((p, n) => (n !== k ? p : isDigitalExpr(expr) ? { ...p, digital: true } : (({ digital: _, ...rest }) => rest)(p)));
  if (base[k].traces.some((t) => !t.fft && sameExpr(t.expr, expr))) return base === panes ? panes : base;
  const color = colorFor(base, expr);
  return base.map((p, j) => (j === k ? { ...p, traces: [...p.traces, { expr, color }] } : p));
}

/** Tipo de análisis de un plot de ngspice ("tran3" → "tran", "op vs R" → "op") */
export const plotKind = (name: string) => /^([a-z]+)/i.exec(name)?.[1].toLowerCase() ?? name;

export const emptyPanes = (): Pane[] => [{ traces: [] }];

/** ¿La traza ya está en algún panel? (comparación sin espacios ni mayúsculas) */
export const sameExpr = (a: string, b: string) => a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase();

// --- dentro del .asc -----------------------------------------------------------------

/** Vista válida a partir de un JSON cualquiera (link viejo, IndexedDB, .asc); null si no hay */
export function asPlotView(v: unknown): PlotView | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: PlotView = {};
  for (const [kind, panes] of Object.entries(v as Record<string, unknown>)) {
    if (!Array.isArray(panes)) continue;
    out[kind] = panes.map((p) => {
      // (vistas de #245: la FFT del panel pasa a cada una de sus trazas)
      const paneFft = asFft(p?.fft).fft;
      return {
        traces: (Array.isArray(p?.traces) ? (p.traces as unknown[]) : [])
          .filter((t): t is Trace => !!t && typeof (t as Trace).expr === 'string')
          .map((t) => {
            const fft = asFft(t.fft).fft ?? paneFft;
            return { expr: t.expr, ...(typeof t.color === 'string' ? { color: t.color } : {}), ...(t.hidden ? { hidden: true } : {}), ...(fft ? { fft } : {}) };
          }),
      };
    });
  }
  return Object.keys(out).length ? out : null;
}

const FFT_WINDOWS = ['rect', 'hann', 'hamming', 'blackman', 'flattop'];
function asFft(v: unknown): { fft?: PaneFft } {
  const f = v as PaneFft | undefined;
  if (!f || typeof f !== 'object' || !FFT_WINDOWS.includes(f.window)) return {};
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  return { fft: { window: f.window, ...(num(f.from) ? { from: f.from } : {}), ...(num(f.to) ? { to: f.to } : {}) } };
}

/** Vista guardada en el documento (comentario ";.plot …"), o null */
export const viewFromDoc = (doc: AscDoc): PlotView | null => asPlotView(readData(doc, 'plot'));

/** Documento con la vista guardada (una vista vacía saca el comentario) */
export const withView = (doc: AscDoc, view: PlotView): AscDoc => writeData(doc, 'plot', Object.keys(view).length ? view : undefined);

// --- "plot" del bloque .control ------------------------------------------------------

const PLOT_OPTS = /^(xlimit|ylimit|xindices|xlog|ylog|loglog|xdelta|ydelta|xcompress|xlabel|ylabel|title|samep|linear|linplot|combplot|pointplot|nogrid|retraceplot|vs)$/i;

/**
 * Paneles pedidos con "plot" en un bloque .control: un panel por línea; cada argumento,
 * una traza ("v(out)" → "V(out)", "out" → "V(out)").
 */
export function controlPlots(control: string): Pane[] {
  const panes: Pane[] = [];
  for (const raw of control.split(/\r?\n/)) {
    const m = /^\s*plot\s+(.*)$/i.exec(raw);
    if (!m) continue;
    const args = m[1].match(/(?:[^\s(]+|\([^)]*\))+/g) ?? [];
    const traces: Trace[] = [];
    for (let k = 0; k < args.length; k++) {
      const a = args[k];
      if (PLOT_OPTS.test(a)) {
        // opciones con valores: xlimit a b, ylimit a b, xlabel "x"…
        if (/^(xlimit|ylimit)$/i.test(a)) k += 2;
        else if (/^(xlabel|ylabel|title|xdelta|ydelta|xcompress|xindices)$/i.test(a)) k += 1;
        else if (/^vs$/i.test(a)) k += 1;
        continue;
      }
      if (/^"/.test(a)) continue;
      traces.push({ expr: /^[A-Za-z_][\w.]*$/.test(a) && !/^(time|frequency)$/i.test(a) ? `V(${a})` : a.replace(/^v\(/i, 'V(').replace(/^i\(/i, 'I(') });
    }
    if (traces.length) panes.push({ traces });
  }
  return panes;
}

// --- .plt de LTspice -------------------------------------------------------------------
// [Transient Analysis]
// {
//    Npanes: 2
//    {
//       traces: 2 {524290,0,"V(out)"} {34603011,0,"I(R1)"}
//       X: ('m',0,0,0.002,0.02)
//       ...
//    },
//    { ... }
// }
// El número de cada traza codifica el color en los bits bajos (2, 3, 4… = 1ª, 2ª, 3ª
// traza de la paleta de LTspice) y el eje en los altos (0x80000 tensión, 0x100000 corriente).

const SECTIONS: [string, string][] = [
  ['tran', 'Transient Analysis'],
  ['ac', 'AC Analysis'],
  ['dc', 'DC transfer characteristic'],
  ['noise', 'Noise Spectral Density - (V/Hz½ or A/Hz½)'],
  ['tf', 'Transfer Function'],
  ['op', 'Operating Point'],
];

// Paleta por defecto de LTspice (índices 2, 3, 4…), aproximada
const LT_COLORS = ['#00a000', '#0000ff', '#ff0000', '#00a0a0', '#ff00ff', '#808080', '#808000', '#008080', '#800080', '#000080'];

export function parsePlt(text: string): PlotView {
  const view: PlotView = {};
  const re = /^\[([^\]]+)\]\s*\{([\s\S]*?)^\}/gm;
  for (const m of text.replace(/\r\n?/g, '\n').matchAll(re)) {
    const title = m[1].trim().toLowerCase();
    const kind = SECTIONS.find(([, t]) => title.startsWith(t.toLowerCase().slice(0, 12)))?.[0] ?? null;
    if (!kind) continue;
    const panes: Pane[] = [];
    for (const line of m[2].split('\n')) {
      const t = /^\s*traces:\s*\d+\s*(.*)$/.exec(line);
      if (!t) continue;
      const traces: Trace[] = [];
      for (const tr of t[1].matchAll(/\{(\d+),\d+,"((?:[^"\\]|\\.)*)"\}/g)) {
        const code = Number(tr[1]);
        const idx = (code & 0xffff) - 2;
        traces.push({ expr: tr[2], ...(idx >= 0 && idx < LT_COLORS.length && idx !== traces.length ? { color: LT_COLORS[idx] } : {}) });
      }
      panes.push({ traces });
    }
    if (panes.length) view[kind] = panes;
  }
  return view;
}

const isCurrent = (expr: string) => /^I[a-z]?\(/i.test(expr.trim());

export function serializePlt(view: PlotView): string {
  const out: string[] = [];
  for (const [kind, title] of SECTIONS) {
    // (LTspice no tiene trazas de FFT en el .plt del transitorio)
    const panes = view[kind]?.map((p) => ({ ...p, traces: p.traces.filter((t) => !t.fft) })).filter((p) => p.traces.length);
    if (!panes?.length) continue;
    out.push(`[${title}]`, '{', `   Npanes: ${panes.length}`);
    panes.forEach((p, pi) => {
      const traces = p.traces
        .map((t, i) => {
          // (la paleta propia sigue el orden de la de LTspice)
          const c = t.color?.toLowerCase();
          const color = c ? [LT_COLORS.indexOf(c), PALETTE.indexOf(c)].find((k) => k >= 0) ?? i : i;
          const axis = kind === 'ac' ? 0 : isCurrent(t.expr) ? 0x2100000 : 0x80000;
          return `{${axis + 2 + color},0,"${t.expr}"}`;
        })
        .join(' ');
      out.push('   {', `      traces: ${p.traces.length} ${traces}`, '   }' + (pi < panes.length - 1 ? ',' : ''));
    });
    out.push('}');
  }
  return out.join('\r\n') + '\r\n';
}
