// Lista de simulaciones (#39): cada una es un comando de análisis con su nombre y la vista
// del visor (trazas, paneles, cursores, zoom y colores). En el .asc va sólo la activa como
// directiva (así LTspice lo abre igual) y la lista entera en un comentario ";.sims …" que
// TurboSpice no dibuja (asc/dataText.ts). Los resultados quedan en memoria (ver keepResult),
// no en el archivo.
import { isDataTextOf, readData, writeData } from '../asc/dataText.ts';
import type { AscDoc } from '../asc/model.ts';
import { parseSpiceNumber } from '../netlist/spicenum.ts';
import type { ComplexMode } from '../waveform/curves.ts';
import { si } from '../waveform/series.ts';
import type { Pane, PlotState } from '../waveform/view.ts';
import { ANALYSES, defaultAnalysis, formatAnalysis, parseAnalysis, validateAnalysis, type AnalysisKind, type Sweep } from './analyses.ts';
import { t } from '../i18n/i18n.ts';
import { isComplexLine } from './complexSim.ts';

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
  const tt = si(n);
  return `${tt.replace(/[a-zµ]+$/i, '')} ${tt.replace(/^[^a-zµ]+/i, '')}${unit}`;
}
const range = (a: string, b: string, unit: string) => `${quantity(a || '0', unit)}–${quantity(b, unit)}`;
const sweepRange = (s: Sweep) => range(s.start, s.stop, 'Hz');
const volts = (n: string) => (/^[vi]\s*\(/i.test(n) ? n : `V(${n})`);

/** "100m" → "100m", "1e5" → "100K" (prefijo SI, k en mayúscula); las expresiones ({R}) quedan como están */
function compact(v: string): string {
  const n = parseSpiceNumber(v);
  if (!Number.isFinite(n)) return v;
  return si(n).replace(/k$/, 'K');
}
/** "1Hz - 1MHz" */
const freqs = (s: Sweep) => `${compact(s.start)}Hz - ${compact(s.stop)}Hz`;

/**
 * Nombre automático de un testbench según su análisis: "Tran 0 - 100m", "AC 100Hz - 100KHz",
 * ".OP", "DC Sweep", "Noise 1Hz - 1MHz", "Poles and Zeros"… Se recalcula al cambiar el análisis o
 * sus límites mientras el testbench no tenga nombre propio.
 */
export function analysisLabel(line: string): string {
  // el Studio o un .control (#241)
  if (isComplexLine(line)) return t('Complex simulation');
  const a = parseAnalysis(line);
  if (!a) return line.trim();
  const label = ANALYSES.find((x) => x.kind === a.kind)!.label;
  switch (a.kind) {
    case 'tran':
      return `Tran ${compact(a.tstart || '0')} - ${compact(a.tstop)}`;
    case 'ac':
      return `AC ${freqs(a.sweep)}`;
    case 'dc':
      return t('DC Sweep');
    case 'noise':
      return `${label} ${freqs(a.sweep)}`;
    case 'op':
      return '.OP';
    case 'tf':
      return t('Transfer {p0}/{src}', { p0: volts(a.out), src: a.src });
    case 'sens':
      return `${label} ${volts(a.out)}${a.ac ? ` ${sweepRange(a.sweep)}` : ''}`;
    case 'pz':
      return t('Poles and Zeros');
    case 'disto':
    case 'sp':
      return `${label} ${sweepRange(a.sweep)}`;
    case 'stb':
      return `${t('Stability')} ${a.probe}${a.mode ? ` ${a.mode.toUpperCase()}` : ''} ${freqs(a.sweep)}`;
  }
}

/** un .pz al que le faltan nodos (sin entrada o salida elegidas queda ".pz  0  0 vol pz") */
const PZ_INCOMPLETE = /^\s*\.pz\b/i;
const SWEEP_TYPE: Record<string, string> = { dec: 'pts/dec', oct: 'pts/oct', lin: 'pts' };
const sweepDetail = (s: Sweep) => `${sweepRange(s)}, ${s.points} ${SWEEP_TYPE[s.type] ?? s.type}`;

/**
 * Descripción completa de un análisis (la fila de la simulación en el panel del proyecto):
 * "Transient 0–20 ms, max step 1 µs", "AC (Bode) 10 Hz–100 kHz, 100 pts/dec",
 * "DC sweep V1 0–5 V step 100 mV", "Poles and zeros V(in)→V(out)"…
 */
export function analysisDetail(line: string): string {
  if (isComplexLine(line)) return t('Complex simulation');
  const a = parseAnalysis(line);
  if (!a && PZ_INCOMPLETE.test(line)) return `${ANALYSES.find((x) => x.kind === 'pz')!.label} (${t('input and output not chosen')})`;
  if (!a) return line.trim();
  const label = ANALYSES.find((x) => x.kind === a.kind)!.label;
  switch (a.kind) {
    case 'tran':
      return [
        `${label} ${range(a.tstart, a.tstop, 's')}`,
        ...(a.tmax ? [t('max step {v}', { v: quantity(a.tmax, 's') })] : []),
        ...(a.uic ? ['UIC'] : []),
        ...(a.startup ? ['startup'] : []),
      ].join(', ');
    case 'ac':
      return `${label} ${sweepDetail(a.sweep)}`;
    case 'dc': {
      const sw = a.sweeps.filter((x) => x.src).map((x) => {
        const u = /^i/i.test(x.src) ? 'A' : 'V';
        return `${x.src} ${range(x.start, x.stop, u)}${x.step ? ` ${t('step {v}', { v: quantity(x.step, u) })}` : ''}`;
      });
      return sw.length ? `${label} ${sw.join(' · ')}` : `${label} (${t('no source chosen')})`;
    }
    case 'noise':
      return `${label} ${volts(a.out)}${a.src ? ` / ${a.src}` : ''}, ${sweepDetail(a.sweep)}`;
    case 'op':
      return label;
    case 'tf':
      return `${label} ${volts(a.out)} / ${a.src}`;
    case 'sens':
      return `${label} ${volts(a.out)}${a.ac ? ` ${sweepDetail(a.sweep)}` : ''}`;
    case 'pz': {
      const node = (p: string, n: string) => (n && n !== '0' ? `V(${p},${n})` : `V(${p})`);
      if (!a.inP || !a.outP || a.inP === '0' || a.outP === '0') return `${label} (${t('input and output not chosen')})`;
      const what = { pz: t('poles and zeros'), pol: t('poles'), zer: t('zeros') }[a.which];
      return `${label} ${node(a.inP, a.inN)}→${node(a.outP, a.outN)}${a.which !== 'pz' ? `, ${t('only {what}', { what })}` : ''}`;
    }
    case 'disto':
      return `${label} ${sweepDetail(a.sweep)}`;
    case 'sp':
      return `${label} ${sweepDetail(a.sweep)}${a.noise ? `, ${t('with noise')}` : ''}`;
    case 'stb':
      return `${label} ${a.probe || `(${t('no probe chosen')})`}${a.mode ? ` ${a.mode.toUpperCase()}` : ''}, ${a.method === 'gft' ? 'GFT' : 'Tian'}, ${sweepDetail(a.sweep)}`;
  }
}

export const simName = (s: SimInstance) => s.name || analysisLabel(s.line);

// --- operaciones sobre la lista ------------------------------------------------------------

const replace = (l: SimList, id: string, f: (s: SimInstance) => SimInstance): SimList => ({
  ...l,
  items: l.items.map((s) => (s.id === id ? f(s) : s)),
});

/** Agrega una simulación con ese comando y la deja activa */
export function addSim(l: SimList, line: string): SimList {
  const s: SimInstance = { id: newId(), line };
  return { items: [...l.items, s], active: s.id };
}

/** Copia de una simulación (con su vista), a continuación de ella y activa */
export function duplicateSim(l: SimList, id: string): SimList {
  const i = l.items.findIndex((s) => s.id === id);
  if (i < 0) return l;
  const src = l.items[i];
  const copy: SimInstance = { ...structuredClone(src), id: newId(), ...(src.name ? { name: t('{name} (copy)', { name: src.name }) } : {}) };
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
  // (la tierra no es una salida ni una entrada)
  const named = info.nets.filter((n) => !AUTO_NET.test(n) && n !== '0');
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

/**
 * Comando para una simulación nueva a partir del de otro testbench del mismo tipo: se conservan sus
 * valores (tiempos, barridos), pero las redes y fuentes que no están en este circuito (o que
 * faltaban) pasan a las de `defaultLine`; si no, una línea rota se copiaba a todas las nuevas
 */
export function reuseLine(line: string, kind: AnalysisKind, info: { nets: string[]; sources: string[] }): string {
  const fresh = parseAnalysis(defaultLine(kind, info));
  const a = parseAnalysis(line);
  if (!a || !fresh || a.kind !== kind || fresh.kind !== kind) return defaultLine(kind, info);
  const net = (v: string, d: string) => (v && (v === '0' || info.nets.some((n) => n.toLowerCase() === v.toLowerCase())) ? v : d);
  const src = (v: string, d: string) => (v && info.sources.some((n) => n.toLowerCase() === v.toLowerCase()) ? v : d);
  switch (a.kind) {
    case 'dc': {
      const f = fresh as typeof a;
      const sweeps = a.sweeps.map((s, i) => ({ ...s, src: src(s.src, i ? '' : f.sweeps[0].src) })).filter((s, i) => i === 0 || s.src);
      return formatAnalysis({ ...a, sweeps });
    }
    case 'noise': {
      const f = fresh as typeof a;
      return formatAnalysis({ ...a, out: net(a.out, f.out), ref: a.ref && net(a.ref, ''), src: src(a.src, f.src) });
    }
    case 'tf': {
      const f = fresh as typeof a;
      return formatAnalysis({ ...a, out: net(a.out, f.out), src: src(a.src, f.src) });
    }
    case 'sens': {
      const f = fresh as typeof a;
      return formatAnalysis({ ...a, out: net(a.out, f.out) });
    }
    case 'pz': {
      const f = fresh as typeof a;
      return formatAnalysis({ ...a, inP: net(a.inP, f.inP), inN: net(a.inN, '0'), outP: net(a.outP, f.outP), outN: net(a.outN, '0') });
    }
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
// La lista va en el comentario ";.sims …" (asc/dataText.ts) sólo en el archivo que se guarda: en
// el documento que se edita no está (cambiar de vista no es un paso de deshacer). La vista
// recordada por tipo de análisis (";.plot …", #14/#26) es aparte y vale para todas: es la que
// se reaplica al simular; la de cada simulación es lo último que se vio en ella.

/**
 * ¿Hay una lista que guardar? (varias simulaciones o un nombre propio). Con una sola, el .asc
 * queda como siempre: su vista va en el autoguardado.
 */
const worthSaving = (l: SimList) => l.items.length > 1 || l.items.some((s) => s.name);

/** El documento con la lista en su comentario (reemplaza el anterior; sin lista, lo saca) */
export const withSims = (doc: AscDoc, l: SimList): AscDoc => writeData(doc, 'sims', worthSaving(l) ? l : undefined);

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
  if (!doc.texts.some((tt) => isDataTextOf(tt, 'sims'))) return { doc, sims: simsFromLine(line) };
  const v = readData(doc, 'sims');
  const sims = validList(v) ? (v.items.some((s) => s.id === v.active) ? v : { ...v, active: v.items[0]?.id ?? '' }) : null;
  return { doc: writeData(doc, 'sims', undefined), sims: sims ? followLine(sims, line) : simsFromLine(line) };
}

// --- polos y ceros: errores explicados ---------------------------------------------------------

/**
 * Por qué no se puede correr un .pz sin llamar a ngspice: sin nodo de entrada o de salida (p. ej.
 * una simulación nueva en un circuito sin redes con nombre), ngspice sólo dice "Error on line N"
 */
export function pzProblem(line: string): string | undefined {
  const a = parseAnalysis(line);
  if (a?.kind !== 'pz' && !(!a && PZ_INCOMPLETE.test(line))) return undefined;
  // el nodo + en tierra es lo que queda en la barra al borrar el nodo: no elegido
  if (!a || a.kind !== 'pz' || !a.inP || !a.outP || a.inP === '0' || a.outP === '0')
    return t('Poles and zeros: the input and output nodes are not chosen. Pick them in the simulation bar (the input is the node where the signal enters, the output the one you measure), or name the nets (e.g. "in" and "out").');
  if (a.inP.toLowerCase() === (a.inN || '0').toLowerCase())
    return t('Poles and zeros: the input is between {p} and {n}, the same node. Choose as input the node where the signal enters.', { p: a.inP, n: a.inN || '0' });
  return undefined;
}

/**
 * Qué le falta a un análisis para poder correr (la fuente, un nodo, un valor), dicho para el
 * usuario; sin esto ngspice sólo diría "Error on line N"
 */
export function analysisProblem(line: string): string | undefined {
  const pz = pzProblem(line);
  if (pz) return pz;
  const a = parseAnalysis(line);
  if (!a) return undefined;
  const errs = validateAnalysis(a);
  if (!errs.length) return undefined;
  const label = ANALYSES.find((x) => x.kind === a.kind)!.label;
  return t('{analysis}: {problems}. Complete the boxes marked in red in the simulation bar.', { analysis: label, problems: errs.join('; ') });
}

/** Lo que ngspice escribe en el log de un .pz que falla, explicado */
export function pzLogErrors(log: string[]): string[] {
  const out: string[] = [];
  if (log.some((l) => /input is shorted/i.test(l)))
    out.push(t('Poles and zeros: the input is shorted. Its two nodes are the same net, or a wire or a voltage source joins them directly. Choose as input the node where the signal enters, on the circuit side.'));
  if (log.some((l) => /pz.*(no convergence|failed to converge)|pole-zero.*(failed|no convergence)/i.test(l)))
    out.push(t('Poles and zeros: the search did not converge. Check that the input and output are connected through the circuit.'));
  return out;
}
