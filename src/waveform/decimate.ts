// Decimación para el gráfico: uPlot recorre todos los puntos en cada cuadro (rueda, paneo,
// cursores) aunque en una columna de píxeles entren miles. Acá se le pasa sólo lo que se ve y, si
// hay más puntos que columnas, por cada columna el primero, el mínimo, el máximo y el último de cada
// curva: uPlot dibuja una columna así (la línea vertical de mín a máx, entrando y saliendo por el
// primero y el último), así que el dibujo es el mismo.

/** Puntos por bloque de las tablas de mínimos y máximos */
const BLOCK = 16;

export interface Decimator {
  /**
   * Datos para uPlot de lo que se ve en [lo, hi] en un área de `cols` píxeles que empieza en el
   * píxel `offset` del canvas: [x, ...ys]. Las columnas son las de uPlot, que redondea la posición de
   * cada punto al píxel entero (cortan en los medios píxeles). Incluye el punto anterior y el
   * siguiente al rango (las líneas llegan a los bordes) y el primero y el último de todos (así la
   * autoescala de uPlot, p. ej. el doble click, sigue viendo el rango completo).
   */
  view(lo: number, hi: number, cols: number, log?: boolean, offset?: number): Float64Array[];
}

/** Primer índice con xs[i] >= v (xs creciente) */
function lowerBound(xs: Float64Array, v: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Mínimos y máximos por bloque de BLOCK puntos */
function blocks(y: Float64Array): { min: Float64Array; max: Float64Array } {
  const n = Math.ceil(y.length / BLOCK);
  const min = new Float64Array(n);
  const max = new Float64Array(n);
  for (let b = 0; b < n; b++) {
    let lo = Infinity;
    let hi = -Infinity;
    const end = Math.min(y.length, (b + 1) * BLOCK);
    for (let k = b * BLOCK; k < end; k++) {
      const v = y[k];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[b] = lo;
    max[b] = hi;
  }
  return { min, max };
}

/**
 * Decimador para curvas que comparten el eje X (creciente) y sin valores no finitos (con huecos
 * no sirve: el mínimo y el máximo de una columna los saltearían).
 */
export function decimator(x: Float64Array, ys: Float64Array[]): Decimator {
  const tables = ys.map(blocks);
  const n = x.length;

  /** Mínimo y máximo de y en [a, b) */
  const range = (s: number, a: number, b: number): [number, number] => {
    const y = ys[s];
    const t = tables[s];
    let lo = Infinity;
    let hi = -Infinity;
    let k = a;
    // hasta el borde del primer bloque, bloques enteros y lo que queda del último
    const firstFull = Math.ceil(a / BLOCK) * BLOCK;
    for (; k < Math.min(b, firstFull); k++) {
      if (y[k] < lo) lo = y[k];
      if (y[k] > hi) hi = y[k];
    }
    for (; k + BLOCK <= b; k += BLOCK) {
      const bi = k / BLOCK;
      if (t.min[bi] < lo) lo = t.min[bi];
      if (t.max[bi] > hi) hi = t.max[bi];
    }
    for (; k < b; k++) {
      if (y[k] < lo) lo = y[k];
      if (y[k] > hi) hi = y[k];
    }
    return [lo, hi];
  };

  return {
    view(lo, hi, cols, log = false, offset = 0) {
      cols = Math.max(1, cols);
      if (!n) return [x, ...ys];
      // el anterior y el siguiente a lo visible
      const start = Math.max(0, lowerBound(x, lo) - 1);
      const end = Math.min(n, lowerBound(x, hi) + 1 + (x[lowerBound(x, hi)] === hi ? 1 : 0));
      const all = end - start <= 4 * cols || !(hi > lo) || (log && !(lo > 0));
      // (a lo sumo 4 por columna, más el anterior, el siguiente, el primero y el último)
      const cap = (all ? end - start : 4 * (Math.ceil(cols) + 2)) + 4;
      const ox = new Float64Array(cap);
      const oy = ys.map(() => new Float64Array(cap));
      let o = 0;
      const raw = (k: number) => {
        ox[o] = x[k];
        for (let s = 0; s < ys.length; s++) oy[s][o] = ys[s][k];
        o++;
      };
      if (start > 0) raw(0);
      if (all) {
        for (let k = start; k < end; k++) raw(k);
      } else {
        // borde de una columna a r píxeles del comienzo del área (en décadas si el eje es logarítmico)
        const [a0, a1] = log ? [Math.log10(lo), Math.log10(hi)] : [lo, hi];
        const edge = (r: number) => {
          const v = a0 + ((a1 - a0) * r) / cols;
          return log ? 10 ** v : v;
        };
        // el primer borde: el medio píxel siguiente al comienzo
        const r0 = (((0.5 - offset) % 1) + 1) % 1;
        let k = start;
        // el anterior y el siguiente al rango van solos (caen afuera)
        if (x[k] < lo) raw(k++);
        const last = x[end - 1] > hi ? end - 1 : end;
        for (let r = r0; k < last; r++) {
          const b = r >= cols ? last : Math.min(last, Math.max(k, lowerBound(x, edge(r))));
          if (b - k <= 4) {
            for (; k < b; k++) raw(k);
            continue;
          }
          // primero, mínimo, máximo y último: los del medio en x intermedios (son de la misma columna)
          const xa = x[k];
          const xb = x[b - 1];
          ox[o] = xa;
          ox[o + 1] = xa + (xb - xa) / 3;
          ox[o + 2] = xa + ((xb - xa) * 2) / 3;
          ox[o + 3] = xb;
          for (let s = 0; s < ys.length; s++) {
            const [mn, mx] = range(s, k, b);
            const y = oy[s];
            y[o] = ys[s][k];
            y[o + 1] = mn;
            y[o + 2] = mx;
            y[o + 3] = ys[s][b - 1];
          }
          o += 4;
          k = b;
        }
        if (last < end) raw(last);
      }
      if (end < n) raw(n - 1);
      return [ox.subarray(0, o), ...oy.map((y) => y.subarray(0, o))];
    },
  };
}
