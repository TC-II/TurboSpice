// Menú flotante del botón derecho (#180): unas pocas acciones en el lugar del clic.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface ContextItem {
  /** con una función, el texto sigue al valor que se escribe en la fila editable */
  label: string | ((edited?: string) => string);
  title?: string;
  disabled?: boolean;
  /** se dibuja como botón (p. ej. «Propagar») */
  primary?: boolean;
  /** recibe el valor escrito en la fila editable, aún sin aplicar */
  onClick(edited?: string): void;
  /** campo editable en el propio menú («R1 = [valor]»): Enter lo aplica */
  edit?: { value: string; onCommit(value: string): void };
}

const text = (it: ContextItem, v?: string) => (typeof it.label === 'function' ? it.label(v) : it.label);

function EditRow({ it, v, setV, onClose }: { it: ContextItem; v: string; setV(v: string): void; onClose(): void }) {
  return (
    <label className="ctx-edit" title={it.title}>
      <span>{text(it)}</span>
      <input
        autoFocus
        value={v}
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          onClose();
          if (v.trim() && v !== it.edit!.value) it.edit!.onCommit(v.trim());
        }}
      />
    </label>
  );
}

export function ContextMenu({ at, items, onClose }: { at: { x: number; y: number }; items: ContextItem[]; onClose(): void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  const editItem = items.find((it) => it.edit);
  const [edited, setEdited] = useState(editItem?.edit?.value ?? '');
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
    // (en captura: el esquemático detiene la propagación de sus clics)
    const tt = setTimeout(() => window.addEventListener('pointerdown', down, true), 0);
    window.addEventListener('keydown', key, true);
    return () => {
      clearTimeout(tt);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [onClose]);
  return (
    <div ref={box} className="ctx-menu" role="menu" style={{ left: pos.x, top: pos.y }}>
      {items.map((it, i) =>
        it.edit ? (
          <EditRow key={i} it={it} v={edited} setV={setEdited} onClose={onClose} />
        ) : (
        <button
          key={i}
          role="menuitem"
          disabled={it.disabled}
          title={it.title}
          className={it.primary ? 'ctx-primary' : undefined}
          onClick={() => {
            onClose();
            it.onClick(editItem ? edited : undefined);
          }}
        >
          {text(it, editItem ? edited.trim() || editItem.edit!.value : undefined)}
        </button>
        ),
      )}
    </div>
  );
}
