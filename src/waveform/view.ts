// Vista de resultados: qué trazas se grafican, en qué panel y con qué color. Se puede
// recordar por tipo de análisis; se guarda dentro del .asc (";.plot …") y va y viene con el
// .plt de LTspice.
import { readData, writeData } from '../asc/dataText.ts';
import type { AscDoc } from '../asc/model.ts';

export interface Trace {
  /** expresión con nombres de LTspice: "V(out)", "I(R1)", "V(out)/V(in)" */
  expr: string;
  /** color CSS; si falta se usa la paleta por posición */
  color?: string;
  hidden?: boolean;
}

export interface Pane {
  traces: Trace[];
}

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
    out[kind] = panes.map((p) => ({
      traces: (Array.isArray(p?.traces) ? (p.traces as unknown[]) : [])
        .filter((t): t is Trace => !!t && typeof (t as Trace).expr === 'string')
        .map((t) => ({ expr: t.expr, ...(typeof t.color === 'string' ? { color: t.color } : {}), ...(t.hidden ? { hidden: true } : {}) })),
    }));
  }
  return Object.keys(out).length ? out : null;
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
    const panes = view[kind]?.filter((p) => p.traces.length);
    if (!panes?.length) continue;
    out.push(`[${title}]`, '{', `   Npanes: ${panes.length}`);
    panes.forEach((p, pi) => {
      const traces = p.traces
        .map((t, i) => {
          const color = t.color ? Math.max(0, LT_COLORS.indexOf(t.color)) : i;
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
