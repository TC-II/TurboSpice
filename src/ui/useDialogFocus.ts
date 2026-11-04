// Foco de los diálogos modales (WCAG 2.4.3 y 2.1.2): al abrir, el foco entra al diálogo; Tab y
// Shift+Tab dan la vuelta adentro sin pasar a la app de atrás; al cerrar, vuelve a donde estaba
// (en general, el botón que lo abrió).
import { useEffect, useState, type RefObject } from 'react';

const FOCUSABLE = ['a[href]', 'button:not(:disabled)', 'input:not(:disabled):not([type=hidden])', 'select:not(:disabled)', 'textarea:not(:disabled)', '[tabindex]:not([tabindex="-1"])'].join(',');

/** diálogos abiertos, el último arriba: sólo ese maneja Tab */
const open: HTMLElement[] = [];

/** lo que se puede enfocar con Tab dentro de `box`, en orden (sin lo oculto) */
export function focusables(box: HTMLElement): HTMLElement[] {
  return [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
}

/** el destino de Tab (o Shift+Tab) si hay que corregirlo para no salir de `box`; null si no */
export function trapTarget(box: HTMLElement, active: Element | null, back: boolean): HTMLElement | null {
  const els = focusables(box);
  if (!els.length) return box;
  const first = els[0];
  const last = els[els.length - 1];
  if (!active || !box.contains(active)) return back ? last : first;
  if (back && (active === first || active === box)) return last;
  if (!back && active === last) return first;
  return null;
}

function onKey(e: KeyboardEvent) {
  const box = open[open.length - 1];
  if (e.key !== 'Tab' || !box) return;
  const to = trapTarget(box, document.activeElement, e.shiftKey);
  if (!to) return;
  e.preventDefault();
  to.focus();
}

/**
 * Hace modal al diálogo `box` mientras `active` (p. ej. no mientras está oculto para elegir algo
 * en el esquemático). `box` tiene que tener tabIndex={-1} para poder recibir el foco si no hay
 * otra cosa enfocada adentro.
 */
export function useDialogFocus(box: RefObject<HTMLElement | null>, active = true) {
  // quién tenía el foco antes de abrir: se lee en el primer render, antes de cualquier autoFocus
  const [opener] = useState(() => (typeof document === 'undefined' ? null : document.activeElement));
  useEffect(() => {
    const el = box.current;
    if (!active || !el) return;
    open.push(el);
    if (open.length === 1) document.addEventListener('keydown', onKey);
    // (los autoFocus de adentro corren antes o después; si ninguno tomó el foco, lo toma la caja)
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    return () => {
      open.splice(open.indexOf(el), 1);
      if (!open.length) document.removeEventListener('keydown', onKey);
    };
  }, [box, active]);
  useEffect(
    () => () => {
      // al cerrar, si el foco quedó en la nada (el diálogo ya no está), vuelve al que lo abrió;
      // si la app lo llevó a otro lado a propósito, se respeta
      const now = document.activeElement;
      if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected && (!now || now === document.body)) opener.focus({ preventScroll: true });
    },
    [opener],
  );
}
