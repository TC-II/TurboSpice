// Punta de prueba sobre un punto de operación (#228): al hacer clic en un cable o un componente
// se anota su valor del OP en el esquemático y queda fijo (se acumulan; otro clic lo quita)

export type OpPinTarget = { net?: string; symbol?: number; pin?: number };

/** clave del elemento anotado: la red (sin distinguir mayúsculas), el componente o el pin de un transistor */
export function opPinKey(target: OpPinTarget): string | undefined {
  if (target.net) return target.net === '0' ? undefined : `n:${target.net.toLowerCase()}`;
  if (target.symbol !== undefined) return target.pin !== undefined ? `s:${target.symbol}:${target.pin}` : `s:${target.symbol}`;
  return undefined;
}

/** agrega el elemento a los fijados, o lo quita si ya estaba */
export function toggleOpPin(pins: ReadonlySet<string>, target: OpPinTarget): Set<string> {
  const next = new Set(pins);
  const k = opPinKey(target);
  if (!k) return next;
  if (next.has(k)) next.delete(k);
  else next.add(k);
  return next;
}

/** si la anotación del elemento se muestra: todas con «Anotar el punto de operación», si no las fijadas */
export function opPinShown(pins: ReadonlySet<string> | undefined, target: OpPinTarget): boolean {
  if (!pins) return true;
  const k = opPinKey(target);
  return !!k && pins.has(k);
}

// Etiquetas del OP movibles y persistentes (#306): por documento, sólo en la sesión (no van al .asc)
export interface OpTags {
  /** fijadas con la punta de prueba */
  pins: ReadonlySet<string>;
  /** corridas a mano: desplazamiento desde su lugar automático (en unidades del esquemático) */
  moved: ReadonlyMap<string, { dx: number; dy: number }>;
  /** borradas con Delete: no se muestran hasta volver a activar «Anotar el OP» */
  hidden: ReadonlySet<string>;
}

export const noOpTags = (): OpTags => ({ pins: new Set(), moved: new Map(), hidden: new Set() });

/** si se muestra la etiqueta: con «Anotar el OP» todas menos las borradas; si no, las fijadas y las movidas */
export function opTagVisible(tags: OpTags, key: string | undefined, showOp: boolean): boolean {
  if (!key || tags.hidden.has(key)) return false;
  return showOp || tags.pins.has(key) || tags.moved.has(key);
}

/** punta de prueba: fija la etiqueta (y la vuelve a mostrar si estaba borrada) o la quita */
export function toggleOpTag(tags: OpTags, target: OpPinTarget): OpTags {
  const k = opPinKey(target);
  if (!k) return tags;
  if (tags.pins.has(k) || (tags.moved.has(k) && !tags.hidden.has(k))) return hideOpTag(tags, k, false);
  const hidden = new Set(tags.hidden);
  hidden.delete(k);
  return { ...tags, pins: new Set(tags.pins).add(k), hidden };
}

/** mueve la etiqueta (el desplazamiento se acumula) */
export function moveOpTag(tags: OpTags, key: string, dx: number, dy: number): OpTags {
  const prev = tags.moved.get(key) ?? { dx: 0, dy: 0 };
  return { ...tags, moved: new Map(tags.moved).set(key, { dx: prev.dx + dx, dy: prev.dy + dy }) };
}

/** Delete: la etiqueta deja de mostrarse (pierde la fijación y la posición); `hide` la oculta
 * también de la anotación completa hasta volver a activarla */
export function hideOpTag(tags: OpTags, key: string, hide = true): OpTags {
  const pins = new Set(tags.pins);
  pins.delete(key);
  const moved = new Map(tags.moved);
  moved.delete(key);
  return { pins, moved, hidden: hide ? new Set(tags.hidden).add(key) : tags.hidden };
}

/** al volver a activar «Anotar el OP» reaparecen las borradas */
export const unhideOpTags = (tags: OpTags): OpTags => (tags.hidden.size ? { ...tags, hidden: new Set() } : tags);
