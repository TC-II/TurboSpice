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
