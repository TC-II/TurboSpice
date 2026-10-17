// Barra de menús (Archivo, Editar, …) con submenús, atajos visibles y manejo de teclado.
import { useEffect, useRef, useState } from 'react';

export type MenuItem =
  | { label: string; shortcut?: string; onClick(): void; disabled?: boolean; checked?: boolean; title?: string }
  | { label: string; items: MenuItem[]; disabled?: boolean }
  | 'sep';

export interface MenuDef {
  label: string;
  items: MenuItem[];
}

export function MenuBar({ menus }: { menus: MenuDef[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const down = (e: PointerEvent) => !bar.current?.contains(e.target as Node) && setOpen(null);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(null);
      }
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);

  return (
    <div className="menubar" ref={bar} role="menubar">
      {menus.map((m, i) => (
        <div key={m.label} className="menu-top">
          <button
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === i}
            className={open === i ? 'open' : ''}
            onClick={() => setOpen(open === i ? null : i)}
            onPointerEnter={() => open !== null && setOpen(i)}
          >
            {m.label}
          </button>
          {open === i && <MenuList items={m.items} close={() => setOpen(null)} label={m.label} autoFocus />}
        </div>
      ))}
    </div>
  );
}

function MenuList({ items, close, label, autoFocus }: { items: MenuItem[]; close(): void; label: string; autoFocus?: boolean }) {
  const list = useRef<HTMLDivElement>(null);
  const [sub, setSub] = useState<number | null>(null);
  useEffect(() => {
    if (autoFocus) list.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [autoFocus]);
  const move = (e: React.KeyboardEvent, d: number) => {
    const btns = [...(list.current?.querySelectorAll<HTMLButtonElement>(':scope > .menu-item > button:not(:disabled)') ?? [])];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    btns[(i + d + btns.length) % btns.length]?.focus();
    e.preventDefault();
  };
  return (
    <div
      className="menu-list"
      role="menu"
      aria-label={label}
      ref={list}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') move(e, 1);
        else if (e.key === 'ArrowUp') move(e, -1);
      }}
    >
      {items.map((it, i) =>
        it === 'sep' ? (
          <div key={i} className="menu-sep" role="separator" />
        ) : 'items' in it ? (
          <div key={i} className="menu-item has-sub" onPointerEnter={() => setSub(i)} onPointerLeave={() => setSub(null)}>
            <button role="menuitem" aria-haspopup="menu" aria-label={it.label} disabled={it.disabled || !it.items.length} onClick={() => setSub(sub === i ? null : i)}>
              <span>{it.label}</span>
              <span className="sc">▸</span>
            </button>
            {sub === i && <MenuList items={it.items} close={close} label={it.label} />}
          </div>
        ) : (
          <div key={i} className="menu-item">
            <button
              role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={it.checked}
              aria-label={it.label}
              aria-keyshortcuts={it.shortcut}
              disabled={it.disabled}
              title={it.title}
              onClick={() => {
                close();
                it.onClick();
              }}
            >
              <span>
                {it.checked !== undefined && <span className="check-mark">{it.checked ? '✓' : ''}</span>}
                {it.label}
              </span>
              {it.shortcut && <span className="sc">{it.shortcut}</span>}
            </button>
          </div>
        ),
      )}
    </div>
  );
}
