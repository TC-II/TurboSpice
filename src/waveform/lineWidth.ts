// Grosor de las trazas del visor (#311): se elige en Configuración y se guarda en el navegador
import { useEffect, useState } from 'react';

/** las opciones: la fina de siempre y dos apenas más gruesas */
export const TRACE_WIDTHS = [1.5, 2, 2.5] as const;
const KEY = 'turbospice.traceWidth';
const EVENT = 'turbospice-tracewidth';

export function traceWidth(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return (TRACE_WIDTHS as readonly number[]).includes(v) ? v : TRACE_WIDTHS[0];
  } catch {
    return TRACE_WIDTHS[0];
  }
}

export function setTraceWidth(w: number) {
  try {
    localStorage.setItem(KEY, String(w));
  } catch {
    // sin almacenamiento: vale sólo para esta sesión
  }
  current = w;
  window.dispatchEvent(new Event(EVENT));
}
let current: number | undefined;

/** el grosor actual; se actualiza al cambiarlo en Configuración */
export function useTraceWidth(): number {
  const [w, setW] = useState(() => current ?? traceWidth());
  useEffect(() => {
    const on = () => setW(current ?? traceWidth());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return w;
}
