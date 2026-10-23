// Menú flotante del botón derecho (#180): unas pocas acciones en el lugar del clic.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface ContextItem {
  label: string;
  title?: string;
  disabled?: boolean;
  onClick(): void;
}

export function ContextMenu({ at, items, onClose }: { at: { x: number; y: number }; items: ContextItem[]; onClose(): void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  // que no se salga de la ventana
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.min(at.x, window.innerWidth - r.width - 8), y: Math.min(at.y, window.innerHeight - r.height - 8) });
  }, [at]);
  useEffect(() => {
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose());
    // (el clic que lo abrió no lo cierra)
    const tt = setTimeout(() => window.addEventListener('pointerdown', down), 0);
    window.addEventListener('keydown', key, true);
    return () => {
      clearTimeout(tt);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key, true);
    };
  }, [onClose]);
  return (
    <div ref={box} className="ctx-menu" role="menu" style={{ left: pos.x, top: pos.y }}>
      {items.map((it, i) => (
        <button
          key={i}
          role="menuitem"
          disabled={it.disabled}
          title={it.title}
          onClick={() => {
            onClose();
            it.onClick();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
