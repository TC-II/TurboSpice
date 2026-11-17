// Eje logarítmico de uPlot con las marcas de logTicks (scales.ts): sin el filtro de uPlot, que
// decide los números por su cuenta, y con los números que pide cada tramo.
import uPlot from 'uplot';
import { logTicks, type LogTicks } from './scales.ts';
import { axisSpace, axisTicks, si } from './series.ts';

/**
 * splits, filter y values de un eje log horizontal o vertical. Las etiquetas quedan también en
 * data-ticks-<name> de la raíz de uPlot si se pasa `name` (el canvas no se puede leer en los e2e).
 */
export function logAxis(dir: 'x' | 'y', name?: string): Pick<uPlot.Axis, 'splits' | 'filter' | 'values'> {
  let last: LogTicks | null = null;
  return {
    splits: (u, _i, min, max) => {
      const box = dir === 'x' ? u.bbox.width : u.bbox.height;
      const px = box > 0 ? box / (uPlot.pxRatio || 1) : dir === 'x' ? u.width : u.height;
      // (horizontal: los números lineales pueden ser largos, «1.00012k»; vertical, lo que da la altura de una línea)
      last = dir === 'x' ? logTicks(min, max, px, 50, axisSpace(min, max)) : logTicks(min, max, px, 30);
      return last.ticks;
    },
    filter: (_u, splits) => splits,
    values: (u, tt) => {
      const r = last && last.ticks.length === tt.length ? last : null;
      const out = !r ? tt.map((v) => (v == null ? '' : si(v, 3))) : r.linear ? axisTicks(tt) : tt.map((v, i) => (r.labeled[i] && v != null ? si(v, 3) : ''));
      if (name) u.root.dataset[`ticks${name}`] = out.filter(Boolean).join('|');
      return out;
    },
  };
}
