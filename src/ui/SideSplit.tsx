// Divisor arrastrable entre una parte principal y la que tiene al costado o debajo (#336): el
// gráfico y el mapa de polos o el de Stability, los paneles y los cursores, el mapa y su tabla.
// Arrastrarlo cambia el tamaño de la parte que le sigue (su hermano siguiente en el DOM); el
// tamaño se recuerda por clave y orientación, y el doble click vuelve al tamaño de siempre.
import { useState, type CSSProperties } from 'react';
import { t } from '../i18n/i18n.ts';

const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // sin almacenamiento
  }
};

export type SplitDir = 'row' | 'column';

/** Tamaño recordado de una parte [px] (null: el del CSS) y su estilo de flex */
export function useSideSize(key: string, dir: SplitDir): { size: number | null; set(n: number | null): void; style?: CSSProperties; storageKey: string } {
  const storageKey = `turbospice.split.${key}.${dir}`;
  const row = dir === 'row';
  const [sizes, setSizes] = useState<Record<string, number | null>>({});
  const stored = storageKey in sizes ? sizes[storageKey] : Number(lsGet(storageKey)) || null;
  const set = (n: number | null) => {
    lsSet(storageKey, n === null ? null : String(Math.round(n)));
    setSizes((o) => ({ ...o, [storageKey]: n }));
  };
  // con flex-basis manda sobre el ancho (o alto) del CSS; en una ventana más chica que cuando se
  // eligió, a la parte principal le queda siempre algo
  const style: CSSProperties | undefined = stored
    ? row
      ? { flex: `0 1 ${stored}px`, width: 'auto', maxWidth: 'calc(100% - 160px)', minWidth: 140 }
      : { flex: `0 1 ${stored}px`, height: 'auto', maxHeight: 'calc(100% - 120px)', minHeight: 100 }
    : undefined;
  return { size: stored, set, style, storageKey };
}

export function SideSplit({ dir, onSize, min = 140, reserve = 160, label }: {
  /** 'row': la parte de al lado va a la derecha; 'column': va debajo */
  dir: SplitDir;
  /** el tamaño nuevo de la parte que sigue al divisor (null: volver al del CSS) */
  onSize(n: number | null): void;
  /** tamaño mínimo de esa parte [px] */
  min?: number;
  /** lo mínimo que le queda a la parte principal [px] */
  reserve?: number;
  label?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const row = dir === 'row';
  return (
    <div
      className={`side-split ${dir}${dragging ? ' dragging' : ''}`}
      role="separator"
      aria-orientation={row ? 'vertical' : 'horizontal'}
      aria-label={label}
      title={t('Drag to resize · double-click: default size')}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const el = e.currentTarget;
        const wrap = (el.parentElement as HTMLElement).getBoundingClientRect();
        const next = (el.nextElementSibling as HTMLElement | null)?.getBoundingClientRect();
        // distancia del puntero al borde de la parte: se conserva al arrastrar
        const off = next ? (row ? next.left - e.clientX : next.top - e.clientY) : 0;
        el.setPointerCapture(e.pointerId);
        setDragging(true);
        const total = row ? wrap.width : wrap.height;
        const move = (ev: PointerEvent) => {
          const n = row ? wrap.right - (ev.clientX + off) : wrap.bottom - (ev.clientY + off);
          onSize(Math.max(min, Math.min(total - reserve, n)));
        };
        const up = () => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          el.removeEventListener('pointercancel', up);
          setDragging(false);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
      }}
      onDoubleClick={() => onSize(null)}
    />
  );
}
