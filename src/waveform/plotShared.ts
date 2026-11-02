// Constantes y formatos que comparten el visor, sus paneles y sus tablas.
import uPlot from 'uplot';
import type { Curve, PaneData } from './curves.ts';
import { si, siFixed } from './series.ts';

/** frecuencia de un polo o un cero (.pz) para marcar en el eje de frecuencia */
export interface PzMark {
  f: number;
  kind: 'pole' | 'zero';
}

export type Range = [number, number];
/** distancia (px) a la línea de un cursor para tomarlo y arrastrarlo */
export const GRAB = 6;
// px que tiene que moverse el botón derecho para panear en vez de hacer clic
export const PAN_SLOP = 4;

export const MAX_ROWS = 16;
/** desde cuántos puntos se decima lo que se le pasa a uPlot (con menos, van todos) */
export const DECIMATE_FROM = 20_000;

/** Rango de un eje Y; uno fijo si no hay datos finitos o son constantes */
export const safeRange: uPlot.Range.Function = (_u, min, max) => {
  if (min == null || max == null || !Number.isFinite(min) || !Number.isFinite(max)) return [-1, 1];
  if (min === max) return [min - (Math.abs(min) || 1) * 0.1, max + (Math.abs(max) || 1) * 0.1];
  return uPlot.rangeNum(min, max, 0.1, true);
};
export const fmt = (v: number, unit = '') => (Number.isFinite(v) ? `${si(v, 4)}${unit}` : '—');
/** Lecturas que cambian con el mouse (cursores, leyenda): siempre del mismo ancho, sin parpadeo */
export const fix = (v: number, unit = '') => `${siFixed(v)}${Number.isFinite(v) ? unit : ' '.repeat(unit.length)}`;
export const allFinite = (y: Float64Array) => {
  for (let i = 0; i < y.length; i++) if (!Number.isFinite(y[i])) return false;
  return true;
};
export const xUnit = (xName: string | undefined) => (xName === 'time' ? 's' : xName === 'frequency' ? 'Hz' : '');
/** fase de la misma traza y corrida (Bode), para la lectura de un cursor en magnitud */
export const phaseOf = (d: PaneData, c: Curve) => (c.axis === 'ph' ? undefined : d.curves.find((o) => o.axis === 'ph' && o.trace === c.trace && o.run === c.run));
/** franjas de los ejes que responden a la rueda y al arrastre (px): sólo las marcas y los números
 * (abajo) y la columna de números (a los costados), no toda la caja del eje */
export const AXIS_X_BAND = 28;
export const AXIS_Y_BAND = 44;
