// Menú flotante del botón derecho (#180): unas pocas acciones en el lugar del clic.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './icons.tsx';
import { t } from '../i18n/i18n.ts';

export interface ContextItem {
  /** con una función, el texto sigue al valor que se escribe en la fila editable */
  label: string | ((edited?: string) => string);
  /** lo que se ve en el botón; el texto completo (`label`) pasa al tooltip */
  short?: string;
  title?: string;
  disabled?: boolean;
  /** se dibuja como botón (p. ej. «Propagar») */
  primary?: boolean;
  /** recibe el valor escrito en la fila editable, aún sin aplicar */
  onClick(edited?: string): void;
  /** campo editable en el propio menú («R1 = [valor]»): Enter o el tick lo aplican */
  edit?: { value: string; onCommit(value: string): void };
}

const text = (it: ContextItem, v?: string) => (typeof it.label === 'function' ? it.label(v) : it.label);

function EditRow({ it, v, setV, onClose }: { it: ContextItem; v: string; setV(v: string): void; onClose(): void }) {
  const apply = () => {
    onClose();
    if (v.trim() && v !== it.edit!.value) it.edit!.onCommit(v.trim());
  };
  return (
    <div className="ctx-edit">
      <label>
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
            apply();
          }}
        />
      </label>
      <button type="button" className="ctx-ok" aria-label={t('OK')} title={t('OK')} onClick={apply}>
        <Icon name="check" size={14} />
      </button>
    </div>
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
    <div ref={box} className={`ctx-menu${editItem ? ' ctx-quick' : ''}`} role="menu" style={{ left: pos.x, top: pos.y }}>
      {items.map((it, i) =>
        it.edit ? (
          <EditRow key={i} it={it} v={edited} setV={setEdited} onClose={onClose} />
        ) : (
        <button
          key={i}
          role="menuitem"
          disabled={it.disabled}
          title={it.short ? text(it, editItem ? edited.trim() || editItem.edit!.value : undefined) : it.title}
          className={it.primary ? 'ctx-primary' : undefined}
          onClick={() => {
            onClose();
            it.onClick(editItem ? edited : undefined);
          }}
        >
          {it.short ?? text(it, editItem ? edited.trim() || editItem.edit!.value : undefined)}
        </button>
        ),
      )}
    </div>
  );
}
