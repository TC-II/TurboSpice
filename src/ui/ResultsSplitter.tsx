// Divisor entre el esquemático y los resultados: arrastrar para cambiar el tamaño, doble click
// alterna con 50 %, y botones flotantes (o Ctrl+1 / Ctrl+2 / Ctrl+0) para expandir uno de los
// dos paneles a toda la ventana y restaurar la división anterior. Expandir el esquemático es
// también la forma de colapsar los resultados (#36): no hay forma de descartarlos.
import { useEffect, useRef, useState } from 'react';

/** Panel expandido a toda la ventana ('' = dividido) */
export type Expanded = '' | 'schematic' | 'results';

const EXPAND_KEY = 'turbospice.resultsExpand';

/**
 * Colapsar u ocultar los resultados = expandir el esquemático (queda la pestaña en el borde
 * para volver a mostrarlos). Los resultados no se descartan: sólo se reemplazan al simular.
 */
export const toggleResults = (e: Expanded): Expanded => (e === 'schematic' ? '' : 'schematic');

/** El lienzo del esquemático cambia de tamaño (o vuelve a verse): hay que reajustar la vista */
export const refitsSchematic = (from: Expanded, to: Expanded) => from !== to && to !== 'results';

const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // sin almacenamiento
  }
};

const isTyping = (e: KeyboardEvent) =>
  e.target instanceof HTMLInputElement ||
  e.target instanceof HTMLTextAreaElement ||
  e.target instanceof HTMLSelectElement ||
  (e.target instanceof HTMLElement && e.target.isContentEditable);

/**
 * Estado expandido/dividido, recordado entre visitas, con los atajos Ctrl+1 (sólo esquemático),
 * Ctrl+2 (sólo resultados) y Ctrl+0 (ambos). `enabled` = hay resultados y no hay diálogo abierto.
 */
export function useExpanded(enabled: boolean): [Expanded, (e: Expanded) => void] {
  const [expanded, setState] = useState<Expanded>(() => {
    const v = lsGet(EXPAND_KEY);
    return v === 'schematic' || v === 'results' ? v : '';
  });
  const set = (e: Expanded) => {
    lsSet(EXPAND_KEY, e);
    setState(e);
  };
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || isTyping(e)) return;
      const to = ({ '1': 'schematic', '2': 'results', '0': '' } as Record<string, Expanded>)[e.key];
      if (to === undefined) return;
      e.preventDefault();
      set(to);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return [expanded, set];
}

export function ResultsSplitter({
  side,
  sizeKey,
  setSize,
  expanded,
  setExpanded,
}: {
  /** resultados al costado (divisor vertical) */
  side: boolean;
  /** clave de localStorage del tamaño (turbospice.resultsH / resultsW) */
  sizeKey: string;
  setSize: (f: (h: number) => number) => void;
  expanded: Expanded;
  setExpanded: (e: Expanded) => void;
}) {
  // en táctil no hay hover: los botones se muestran un rato al tocar el divisor
  const [touched, setTouched] = useState(false);
  const [dragging, setDragging] = useState(false);
  const touchTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(touchTimer.current), []);
  // tamaño anterior al último doble click (para volver de 50 %)
  const before = useRef(0);

  const save = (h: number) => (lsSet(sizeKey, String(h)), h);
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();

  const btn = (to: Expanded, label: string, glyph: string, key: string) => (
    <button
      type="button"
      className="split-btn"
      aria-label={label}
      title={`${label} (Ctrl+${key})`}
      onPointerDown={stop}
      onDoubleClick={stop}
      onClick={(e) => {
        e.stopPropagation();
        setTouched(false);
        setExpanded(to);
      }}
    >
      {glyph}
    </button>
  );

  if (expanded) {
    // pestaña en el borde para restaurar la división (mismo tamaño que antes)
    return (
      <div className={`splitter expanded ${expanded}`} role="separator" aria-orientation={side ? 'vertical' : 'horizontal'}>
        <div className="split-actions">
          {btn('', expanded === 'schematic' ? 'Mostrar resultados' : 'Mostrar esquemático', expanded === 'schematic' ? (side ? '◀' : '▲') : side ? '▶' : '▼', '0')}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`splitter${touched ? ' touched' : ''}${dragging ? ' dragging' : ''}`}
      role="separator"
      aria-orientation={side ? 'vertical' : 'horizontal'}
      title="Arrastrar para cambiar el tamaño de los resultados; doble click alterna con 50 %"
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse') {
          setTouched(true);
          window.clearTimeout(touchTimer.current);
          touchTimer.current = window.setTimeout(() => setTouched(false), 4000);
        }
        const el = e.currentTarget as HTMLElement;
        const wrap = (el.parentElement as HTMLElement).getBoundingClientRect();
        // distancia del puntero al borde del panel: se conserva al arrastrar, así al soltar
        // el puntero sigue sobre el divisor
        const panel = (el.nextElementSibling as HTMLElement | null)?.getBoundingClientRect();
        const off = panel ? (side ? panel.left - e.clientX : panel.top - e.clientY) : 0;
        el.setPointerCapture(e.pointerId);
        setDragging(true);
        const move = (ev: PointerEvent) =>
          setSize(() =>
            side
              ? Math.min(wrap.width - 240, Math.max(280, wrap.right - (ev.clientX + off)))
              : Math.min(wrap.height - 120, Math.max(140, wrap.bottom - (ev.clientY + off))),
          );
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          setDragging(false);
          setSize(save);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
      onDoubleClick={(e) => {
        const el = e.currentTarget;
        const wrap = (el.parentElement as HTMLElement).getBoundingClientRect();
        const panel = (el.nextElementSibling as HTMLElement | null)?.getBoundingClientRect();
        const half = Math.round((side ? wrap.width : wrap.height) / 2);
        const now = panel ? Math.round(side ? panel.width : panel.height) : 0;
        if (Math.abs(now - half) <= 2 && before.current) setSize(() => save(before.current));
        else {
          before.current = now;
          setSize(() => save(half));
        }
      }}
    >
      <div className="split-actions">
        {btn('schematic', 'Expandir esquemático', side ? '▶' : '▼', '1')}
        {btn('results', 'Expandir resultados', side ? '◀' : '▲', '2')}
      </div>
    </div>
  );
}
