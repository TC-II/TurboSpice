/**
 * Reindexado de lo que se guarda por número de panel (zoom en Y, zoom de DFT, markers…) cuando
 * los paneles cambian de lugar: una sola regla para todos los mapas, así ninguno queda corrido.
 */

/** insertar un panel nuevo en `insert` (los de ahí en adelante bajan), quitar uno o intercambiar dos */
export type PaneOp = { insert: number } | { remove: number } | { swap: [number, number] };

/** Índice nuevo del panel `i` tras la operación; null si ese panel se quitó */
export function movePane(i: number, op: PaneOp): number | null {
  if ('insert' in op) return i >= op.insert ? i + 1 : i;
  if ('remove' in op) return i === op.remove ? null : i > op.remove ? i - 1 : i;
  const [a, b] = op.swap;
  return i === a ? b : i === b ? a : i;
}

/** Mapa por panel después de la operación (lo del panel quitado se descarta) */
export function remapRecord<T>(rec: Record<number, T>, op: PaneOp): Record<number, T> {
  const out: Record<number, T> = {};
  for (const [k, v] of Object.entries(rec)) {
    const n = movePane(+k, op);
    if (n !== null) out[n] = v;
  }
  return out;
}

/** Lista de elementos con `pane` (markers) después de la operación */
export function remapList<T extends { pane: number }>(list: T[], op: PaneOp): T[] {
  return list.flatMap((m) => {
    const n = movePane(m.pane, op);
    return n === null ? [] : [n === m.pane ? m : { ...m, pane: n }];
  });
}
