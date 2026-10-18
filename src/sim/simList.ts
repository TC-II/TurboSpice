// Lista de simulaciones (#39): cada una es un comando de análisis con su nombre y la vista
// del visor (trazas, paneles, cursores, zoom y colores). En el .asc va sólo la activa como
// directiva (así LTspice lo abre igual) y la lista entera en un comentario ";.sims …" que
// TurboSpice no dibuja. Los resultados quedan en memoria (ver keepResult), no en el archivo.
import type { AscDoc, SchText } from '../asc/model.ts';
import { isHiddenText } from '../netlist/directives.ts';
import { parseSpiceNumber } from '../netlist/spicenum.ts';
import type { ComplexMode } from '../waveform/curves.ts';
import { si } from '../waveform/series.ts';
import type { Pane, PlotState } from '../waveform/view.ts';
import { ANALYSES, defaultAnalysis, formatAnalysis, parseAnalysis, type AnalysisKind, type Sweep } from './analyses.ts';
import { fromBase64, toBase64 } from './study.ts';

/** Lo que se veía de una simulación: se recupera al volver a elegirla */
export interface SimView {
  panes: Pane[];
  /** panel activo (donde van las trazas nuevas) */
  active?: number;
  /** plot de ngspice elegido ("tran1", "dc2"…) */
  plot?: string;
  mode?: ComplexMode;
  /** zoom y cursores */
  plotState?: PlotState;
}

export interface SimInstance {
  id: string;
  /** comando de análisis (".tran 10m", ".dc V1 0 5 0.1") */
  line: string;
  /** nombre puesto por el usuario; sin él se usa el automático (simName) */
  name?: string;
  view?: SimView;
}

export interface SimList {
  items: SimInstance[];
  /** id de la simulación que se está viendo ('' si no hay ninguna) */
  active: string;
}

/** Cuántas simulaciones puede tener la lista */
export const MAX_SIMS = 20;
/** Resultados de otras simulaciones (no la activa) que se conservan en memoria */
export const MAX_KEPT = 4;

export const emptySims = (): SimList => ({ items: [], active: '' });

let seq = 0;
const newId = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`;

export const activeSim = (l: SimList) => l.items.find((x) => x.id === l.active);

// --- nombre automático -----------------------------------------------------------------

/** "10m" con unidad "s" → "10 ms"; las expresiones ({R}) quedan como están */
function quantity(v: string, unit: string): string {
  const n = parseSpiceNumber(v);
  if (!Number.isFinite(n)) return v;
  if (n === 0) return '0';
  const t = si(n);
  return `${t.replace(/[a-zµ]+$/i, '')} ${t.replace(/^[^a-zµ]+/i, '')}${unit}`;
}
const range = (a: string, b: string, unit: string) => `${quantity(a || '0', unit)}–${quantity(b, unit)}`;
const sweepRange = (s: Sweep) => range(s.start, s.stop, 'Hz');
const volts = (n: string) => (/^[vi]\s*\(/i.test(n) ? n : `V(${n})`);

/** Nombre legible de un comando de análisis: "Transitorio 0–10 ms", "Barrido DC V1 0–5 V" */
export function analysisLabel(line: string): string {
  const a = parseAnalysis(line);
  if (!a) return line.trim();
  const label = ANALYSES.find((x) => x.kind === a.kind)!.label;
  switch (a.kind) {
    case 'tran':
      return `${label} ${range(a.tstart, a.tstop, 's')}`;
    case 'ac':
      return `AC ${sweepRange(a.sweep)}`;
    case 'dc':
      return `${label} ${a.sweeps
        .filter((s) => s.src)
        .map((s) => `${s.src} ${range(s.start, s.stop, /^i/i.test(s.src) ? 'A' : 'V')}`)
        .join(' · ')}`;
    case 'noise':
      return `${label} ${volts(a.out)} ${sweepRange(a.sweep)}`;
    case 'op':
      return label;
    case 'tf':
      return `Transferencia ${volts(a.out)}/${a.src}`;
    case 'sens':
      return `${label} ${volts(a.out)}${a.ac ? ` ${sweepRange(a.sweep)}` : ''}`;
    case 'pz':
      return `${label} ${a.inP}→${a.outP}`;
    case 'disto':
    case 'sp':
      return `${label} ${sweepRange(a.sweep)}`;
  }
}

export const simName = (s: SimInstance) => s.name || analysisLabel(s.line);

// --- operaciones sobre la lista ------------------------------------------------------------

const replace = (l: SimList, id: string, f: (s: SimInstance) => SimInstance): SimList => ({
  ...l,
  items: l.items.map((s) => (s.id === id ? f(s) : s)),
});

/** Agrega una simulación con ese comando y la deja activa (si la lista no está llena) */
export function addSim(l: SimList, line: string): SimList {
  if (l.items.length >= MAX_SIMS) return l;
  const s: SimInstance = { id: newId(), line };
  return { items: [...l.items, s], active: s.id };
}

/** Copia de una simulación (con su vista), a continuación de ella y activa */
export function duplicateSim(l: SimList, id: string): SimList {
  const i = l.items.findIndex((s) => s.id === id);
  if (i < 0 || l.items.length >= MAX_SIMS) return l;
  const src = l.items[i];
  const copy: SimInstance = { ...structuredClone(src), id: newId(), ...(src.name ? { name: `${src.name} (copia)` } : {}) };
  return { items: [...l.items.slice(0, i + 1), copy, ...l.items.slice(i + 1)], active: copy.id };
}

/** Saca una simulación; si era la activa, pasa a la siguiente (o a la anterior) */
export function removeSim(l: SimList, id: string): SimList {
  const i = l.items.findIndex((s) => s.id === id);
  if (i < 0) return l;
  const items = l.items.filter((s) => s.id !== id);
  const active = l.active !== id ? l.active : (items[i] ?? items[i - 1])?.id ?? '';
  return { items, active };
}

/** Nombre propio (vacío: vuelve al automático) */
export const renameSim = (l: SimList, id: string, name: string): SimList =>
  replace(l, id, ({ name: _, ...s }) => (name.trim() ? { ...s, name: name.trim() } : s));

export const selectSim = (l: SimList, id: string): SimList => (l.items.some((s) => s.id === id) ? { ...l, active: id } : l);

export const setSimView = (l: SimList, id: string, view: SimView): SimList => replace(l, id, (s) => ({ ...s, view }));

/**
 * Sigue al comando de análisis del esquemático (editado a mano, con el diálogo o con la barra):
 * si coincide con el de otra simulación se pasa a ella (p. ej. al deshacer un cambio de
 * simulación); si no, cambia el de la activa. Sin simulaciones, se crea la primera.
 */
export function followLine(l: SimList, line: string | null): SimList {
  if (line === null) return l;
  const cur = activeSim(l);
  if (cur?.line === line) return l;
  const other = l.items.find((s) => s.line === line);
  if (other) return { ...l, active: other.id };
  if (!cur) return addSim(l, line);
  return replace(l, cur.id, (s) => ({ ...s, line }));
}

const AUTO_NET = /^(N\d{3,}|NC_\d+)$/;

/**
 * Comando para una simulación nueva de ese tipo, con la primera fuente del circuito y la red
 * "out" (o la primera con nombre) donde hacen falta
 */
export function defaultLine(kind: AnalysisKind, info: { nets: string[]; sources: string[] }): string {
  const a = defaultAnalysis(kind);
  const src = info.sources[0] ?? '';
  const named = info.nets.filter((n) => !AUTO_NET.test(n));
  const out = named.find((n) => /^out$/i.test(n)) ?? named[named.length - 1] ?? info.nets[0] ?? '';
  const inp = named.find((n) => /^in$/i.test(n)) ?? named[0] ?? '';
  switch (a.kind) {
    case 'dc':
      a.sweeps[0].src = src;
      break;
    case 'noise':
    case 'tf':
      a.out = out;
      a.src = src;
      break;
    case 'sens':
      a.out = out;
      break;
    case 'pz':
      a.inP = inp;
      a.outP = out;
      break;
  }
  return formatAnalysis(a);
}

/** Lista con una sola simulación: la del comando del esquemático (o vacía) */
export const simsFromLine = (line: string | null): SimList => (line ? addSim(emptySims(), line) : emptySims());

// --- resultados en memoria --------------------------------------------------------------------

/**
 * Guarda los resultados de una simulación que deja de verse. Se conservan los de las últimas
 * `max` (las que se vieron más recientemente); devuelve los ids descartados.
 */
export function keepResult<T>(kept: Map<string, T>, id: string, value: T, max = MAX_KEPT): string[] {
  kept.delete(id);
  kept.set(id, value);
  const dropped: string[] = [];
  for (const k of kept.keys()) {
    if (kept.size <= max) break;
    kept.delete(k);
    dropped.push(k);
  }
  return dropped;
}

// --- en el .asc --------------------------------------------------------------------------------

/** Comentario del .asc con la lista de simulaciones (base64 del JSON) */
export const SIMS_MARK = '.sims ';
export const isSimsText = (t: SchText) => t.kind === 'comment' && t.text.startsWith(SIMS_MARK);

/**
 * ¿Hay una lista que guardar? (varias simulaciones o un nombre propio). Con una sola, el .asc
 * queda como siempre: su vista va en el autoguardado (el estilo en el .asc es #26).
 */
const worthSaving = (l: SimList) => l.items.length > 1 || l.items.some((s) => s.name);

/** El documento con la lista en su comentario (reemplaza el anterior; sin lista, lo saca) */
export function withSims(doc: AscDoc, l: SimList): AscDoc {
  const texts = doc.texts.filter((t) => !isSimsText(t));
  if (worthSaving(l)) {
    const shown = texts.filter((t) => !isHiddenText(t));
    const y = shown.length ? Math.max(...shown.map((t) => t.y + t.text.split('\\n').length * 24)) + 48 : 0;
    texts.push({ x: shown[0]?.x ?? 0, y, align: 'Left', size: 0, kind: 'comment', text: SIMS_MARK + toBase64(JSON.stringify(l)) });
  } else if (texts.length === doc.texts.length) return doc;
  return { ...doc, texts };
}

const validList = (v: unknown): v is SimList => {
  const l = v as SimList;
  return (
    !!l &&
    typeof l.active === 'string' &&
    Array.isArray(l.items) &&
    l.items.every((s) => s && typeof s.id === 'string' && typeof s.line === 'string' && (!s.view || Array.isArray(s.view.panes)))
  );
};

/**
 * Separa la lista guardada en el documento. La activa es la del comando del esquemático (por
 * si el archivo se editó en LTspice): si no está en la lista, cambia el comando de la activa.
 */
export function takeSims(doc: AscDoc, line: string | null): { doc: AscDoc; sims: SimList } {
  const t = doc.texts.find(isSimsText);
  if (!t) return { doc, sims: simsFromLine(line) };
  const clean = { ...doc, texts: doc.texts.filter((x) => x !== t) };
  let sims: SimList | null = null;
  try {
    const v: unknown = JSON.parse(fromBase64(t.text.slice(SIMS_MARK.length).trim()));
    if (validList(v)) sims = v.items.some((s) => s.id === v.active) ? v : { ...v, active: v.items[0]?.id ?? '' };
  } catch {
    // lista ilegible: queda sólo la del comando
  }
  return { doc: clean, sims: sims ? followLine(sims, line) : simsFromLine(line) };
}
