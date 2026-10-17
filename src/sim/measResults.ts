// Resultados de los .meas de una simulación: una fila por corrida (plot), estadísticas y un
// plot "medición vs. parámetro" cuando hay un barrido.
import type { SimPlot } from '../engine/ngspice.ts';
import { STEP_SCALE } from '../waveform/series.ts';
import { evalMeasures, parseMeas, type MeasDef, type MeasResult } from './meas.ts';
import type { BuiltSimulation } from './schematicSim.ts';
import { traceResolver } from './traces.ts';

export interface MeasRow {
  plot: string;
  /** etiqueta de la corrida (paso de .step) */
  label?: string;
  /** valores de los parámetros barridos en esta corrida */
  stepValues?: number[];
  values: Map<string, MeasResult>;
}

export interface MeasTable {
  names: string[];
  rows: MeasRow[];
  /** líneas .meas que no se pudieron interpretar */
  errors: string[];
}

const isRun = (p: SimPlot) => /^[a-z]+\d+$/i.test(p.name);

export function measureResults(built: BuiltSimulation, plots: SimPlot[], labels: Map<string, string>): MeasTable | null {
  if (!built.ng.measures.length) return null;
  const defs: MeasDef[] = [];
  const errors: string[] = [];
  for (const l of built.ng.measures) {
    const d = parseMeas(l);
    if (typeof d === 'string') errors.push(`${l}: ${d}`);
    else defs.push(d);
  }
  const steps = built.ng.steps;
  const rows: MeasRow[] = [];
  // índice de corrida por tipo de análisis (tran1, tran2… ↔ paso 1, 2…)
  const seen = new Map<string, number>();
  for (const p of plots.filter(isRun)) {
    const kind = /^([a-z]+)/i.exec(p.name)![1];
    const i = seen.get(kind) ?? 0;
    seen.set(kind, i + 1);
    const run = steps && steps.runs.length === plots.filter((x) => isRun(x) && x.name.startsWith(kind)).length ? steps.runs[i] : undefined;
    const vars = Object.fromEntries((steps?.names ?? []).map((n, k) => [n.toLowerCase(), run?.values[k] ?? NaN]).filter(([, v]) => Number.isFinite(v)));
    const values = evalMeasures(defs, p, traceResolver(built, p), vars);
    if (values.size) rows.push({ plot: p.name, label: labels.get(p.name), stepValues: run?.values, values });
  }
  const names = [...new Set(defs.map((d) => d.name))].filter((n) => rows.some((r) => r.values.has(n)));
  return { names, rows, errors };
}

export const measNumber = (r: MeasResult | undefined) => (!r || 'error' in r ? NaN : r.im !== undefined ? Math.hypot(r.value, r.im) : r.value);

/** Plot con cada medición en función del (único) parámetro barrido, para graficarlas */
export function measSweepPlot(table: MeasTable, built: BuiltSimulation): SimPlot | null {
  const steps = built.ng.steps;
  if (!steps || steps.names.length !== 1 || table.rows.length < 2) return null;
  const rows = table.rows.filter((r) => r.stepValues);
  if (rows.length < 2) return null;
  const order = rows.map((_, i) => i).sort((a, b) => rows[a].stepValues![0] - rows[b].stepValues![0]);
  const vectors = [
    { name: steps.names[0], type: STEP_SCALE, real: Float64Array.from(order, (i) => rows[i].stepValues![0]) },
    ...table.names.map((n) => ({ name: n, type: 0, real: Float64Array.from(order, (i) => measNumber(rows[i].values.get(n))) })),
  ];
  return { name: `meas vs ${steps.names[0]}`, vectors };
}

export interface Stats {
  n: number;
  mean: number;
  sigma: number;
  min: number;
  max: number;
}

export function columnStats(values: number[]): Stats | null {
  const v = values.filter(Number.isFinite);
  if (!v.length) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sigma = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1)) : 0;
  return { n: v.length, mean, sigma, min: Math.min(...v), max: Math.max(...v) };
}

/** Histograma con `bins` intervalos iguales entre mín y máx */
export function histogram(values: number[], bins = 12): { from: number; to: number; count: number }[] {
  const v = values.filter(Number.isFinite);
  if (!v.length) return [];
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const w = (hi - lo) / bins || 1;
  const out = Array.from({ length: bins }, (_, i) => ({ from: lo + i * w, to: lo + (i + 1) * w, count: 0 }));
  for (const x of v) out[Math.min(bins - 1, Math.floor((x - lo) / w))].count++;
  return out;
}

