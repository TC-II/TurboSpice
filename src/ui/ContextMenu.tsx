// Menú flotante del botón derecho (#180): unas pocas acciones en el lugar del clic.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './icons.tsx';
import { useHostWindow } from './hostWindow.ts';
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
  /** submenú lateral de muestras de color («Color»): al elegir una se cierra el menú */
  swatches?: { colors: string[]; current: string; onPick(color: string): void };
}

const text = (it: ContextItem, v?: string) => (typeof it.label === 'function' ? it.label(v) : it.label);

function EditRow({ it, v, setV, onClose }: { it: ContextItem; v: string; setV(v: string): void; onClose(): void }) {
  const apply = () => {
    onClose();
    if (v.trim() && v !== it.edit!.value) it.edit!.onCommit(v.trim());
  };
  // el foco al campo con todo seleccionado: lo que se escriba reemplaza el valor
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const go = () => {
      input.current?.focus();
      input.current?.select();
    };
    go();
    const r = requestAnimationFrame(go);
    return () => cancelAnimationFrame(r);
  }, []);
  return (
    <div className="ctx-edit">
      <label>
        <span>{text(it)}</span>
        <input
          ref={input}
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

/** fila con un submenú de colores al costado (se abre con el mouse encima o con un clic); del otro lado si no entra */
function SwatchRow({ it, onClose }: { it: ContextItem; onClose(): void }) {
  const sw = it.swatches!;
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState(false);
  const fly = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = fly.current;
    if (!open || !el) return;
    const w = el.ownerDocument.defaultView ?? window;
    const r = el.getBoundingClientRect();
    // a la derecha si entra; si no, a la izquierda (si ahí tampoco, se queda a la derecha)
    const parent = el.parentElement!.getBoundingClientRect();
    setLeft(parent.right + r.width + 8 > w.innerWidth && parent.left - r.width - 8 >= 0);
  }, [open]);
  const cur = sw.current.toLowerCase();
  return (
    <div className="ctx-sub" onPointerEnter={() => setOpen(true)} onPointerLeave={() => setOpen(false)}>
      <button role="menuitem" aria-haspopup="menu" aria-expanded={open} className="ctx-sub-btn" disabled={it.disabled} onClick={() => setOpen((o) => !o)}>
        <span>{text(it)}</span>
        <span aria-hidden="true">▸</span>
      </button>
      {open && (
        <div ref={fly} className={`ctx-flyout${left ? ' left' : ''}`} role="menu" aria-label={text(it)}>
          {sw.colors.map((c) => (
            <button
              key={c}
              role="menuitemradio"
              aria-checked={c.toLowerCase() === cur}
              aria-label={c}
              title={c}
              className={`ctx-swatch${c.toLowerCase() === cur ? ' current' : ''}`}
              style={{ background: c }}
              onClick={() => {
                onClose();
                sw.onPick(c);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ContextMenu({ at, items, onClose }: { at: { x: number; y: number }; items: ContextItem[]; onClose(): void }) {
  const win = useHostWindow();
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  const editItem = items.find((it) => it.edit);
  const [edited, setEdited] = useState(editItem?.edit?.value ?? '');
  // que no se salga de la ventana
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = el.ownerDocument.defaultView ?? window;
    setPos({ x: Math.min(at.x, w.innerWidth - r.width - 8), y: Math.min(at.y, w.innerHeight - r.height - 8) });
  }, [at]);
  useEffect(() => {
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose());
    // (el clic que lo abrió no lo cierra)
    // (en captura: el esquemático detiene la propagación de sus clics)
    const tt = setTimeout(() => win.addEventListener('pointerdown', down, true), 0);
    win.addEventListener('keydown', key, true);
    return () => {
      clearTimeout(tt);
      win.removeEventListener('pointerdown', down, true);
      win.removeEventListener('keydown', key, true);
    };
  }, [onClose, win]);
  return (
    <div ref={box} className={`ctx-menu${editItem ? ' ctx-quick' : ''}`} role="menu" style={{ left: pos.x, top: pos.y }}>
      {items.map((it, i) =>
        it.edit ? (
          <EditRow key={i} it={it} v={edited} setV={setEdited} onClose={onClose} />
        ) : it.swatches ? (
          <SwatchRow key={i} it={it} onClose={onClose} />
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
