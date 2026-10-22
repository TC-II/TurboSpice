// Menús desplegables (el menú principal colapsado, la flecha de Simular, …) con submenús,
// atajos visibles y manejo de teclado.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { NameInput } from './EditableName.tsx';
import { Icon, type IconName } from './icons.tsx';

/** Botón chico a la derecha de un ítem (duplicar, borrar, historial…) */
export interface MenuAction {
  icon: IconName;
  label: string;
  onClick(): void;
}

export type MenuItem =
  | {
      label: string;
      shortcut?: string;
      onClick(): void;
      disabled?: boolean;
      checked?: boolean;
      title?: string;
      /** doble clic en el ítem: renombrarlo (sin repetir los `taken`) */
      rename?: { taken: string[]; onRename(name: string): void };
      actions?: MenuAction[];
    }
  | { label: string; items: MenuItem[]; disabled?: boolean }
  | 'sep';

export interface MenuDef {
  label: string;
  items: MenuItem[];
}

/** Botón que despliega una lista de menú */
export function MenuButton({ items, label, title, className, disabled, openRef, children }: {
  items: MenuItem[];
  /** Nombre accesible del botón y de la lista */
  label: string;
  title?: string;
  className?: string;
  disabled?: boolean;
  /** para desplegarlo desde otro botón */
  openRef?: { current: (() => void) | null };
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  if (openRef) openRef.current = () => setOpen(true);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // que no llegue a los atajos del editor (Esc también deselecciona)
        e.stopPropagation();
        setOpen(false);
        btn.current?.focus();
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
    <div className="menu-top" ref={root}>
      <button
        ref={btn}
        className={`${className ?? ''}${open ? ' open' : ''}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children}
      </button>
      {open && <MenuList items={items} close={() => setOpen(false)} label={label} autoFocus />}
    </div>
  );
}

/** Menú principal colapsado: un botón junto al nombre de la app con todos los menús como submenús */
export function AppMenu({ menus }: { menus: MenuDef[] }) {
  return (
    <MenuButton
      items={menus.map((m) => ({ label: m.label, items: m.items }))}
      label="Menú"
      title={`Menú: ${menus.map((m) => m.label).join(', ')}`}
      className="app-menu-btn"
    >
      <Icon name="menu" />
    </MenuButton>
  );
}

function MenuList({ items, close, label, autoFocus, onBack }: {
  items: MenuItem[];
  close(): void;
  label: string;
  autoFocus?: boolean;
  /** En un submenú: volver al ítem que lo abrió (flecha izquierda) */
  onBack?(): void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [sub, setSub] = useState<{ i: number; focus: boolean } | null>(null);
  useEffect(() => {
    if (autoFocus) list.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [autoFocus]);
  // que no se salga de la ventana: la lista principal se corre a la izquierda y los submenús
  // se abren del otro lado (en pantallas angostas van debajo de su ítem, ver el CSS)
  const isSub = !!onBack;
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // el ancho del documento, no innerWidth: en el celular la lista desbordada agranda la ventana
    const over = r.right - (document.documentElement.clientWidth - 8);
    if (over <= 0 || getComputedStyle(el).position !== 'absolute') return;
    if (isSub) el.classList.add('flip');
    else el.style.left = `${-Math.min(over, Math.max(0, r.left - 8))}px`;
  }, [isSub]);
  // si algún ítem se marca, todos dejan lugar para la marca (quedan alineados)
  const checks = items.some((it) => it !== 'sep' && !('items' in it) && it.checked !== undefined);
  const buttons = () => [...(list.current?.querySelectorAll<HTMLButtonElement>(':scope > .menu-item > button:not(:disabled)') ?? [])];
  const move = (d: number) => {
    const btns = buttons();
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    btns[(i + d + btns.length) % btns.length]?.focus();
  };
  const focusItem = (i: number) => list.current?.querySelector<HTMLButtonElement>(`:scope > .menu-item[data-i="${i}"] > button`)?.focus();
  // sólo con mouse: en pantallas táctiles el submenú se abre y se cierra tocando el ítem
  const mouse = (e: React.PointerEvent) => e.pointerType === 'mouse';
  const lastPointer = useRef('mouse');
  // con doble clic para renombrar, el clic espera un momento por si viene el segundo
  const [editing, setEditing] = useState<number | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(clickTimer.current), []);
  return (
    <div
      className="menu-list"
      role="menu"
      aria-label={label}
      ref={list}
      onKeyDown={(e) => {
        // las teclas de un submenú no deben mover el foco del menú que lo contiene
        const handled = () => (e.preventDefault(), e.stopPropagation());
        if (e.key === 'ArrowDown') handled(), move(1);
        else if (e.key === 'ArrowUp') handled(), move(-1);
        else if (e.key === 'ArrowLeft' && onBack) handled(), onBack();
      }}
    >
      {items.map((it, i) =>
        it === 'sep' ? (
          <div key={i} className="menu-sep" role="separator" />
        ) : 'items' in it ? (
          <div
            key={i}
            data-i={i}
            className="menu-item has-sub"
            onPointerEnter={(e) => mouse(e) && setSub({ i, focus: false })}
            onPointerLeave={(e) => mouse(e) && setSub(null)}
          >
            <button
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={sub?.i === i}
              aria-label={it.label}
              disabled={it.disabled || !it.items.length}
              onPointerDown={(e) => (lastPointer.current = e.pointerType)}
              // con mouse ya se abrió al pasar por encima: el click no lo cierra
              onClick={() => setSub(sub?.i === i && lastPointer.current !== 'mouse' ? null : { i, focus: false })}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  setSub({ i, focus: true });
                }
              }}
            >
              <span>
                {checks && <span className="check-mark" />}
                {it.label}
              </span>
              <span className="sc">▸</span>
            </button>
            {sub?.i === i && (
              <MenuList
                items={it.items}
                close={close}
                label={it.label}
                autoFocus={sub.focus}
                onBack={() => {
                  setSub(null);
                  focusItem(i);
                }}
              />
            )}
          </div>
        ) : (
          <div key={i} data-i={i} className={`menu-item${it.actions?.length ? ' with-actions' : ''}`}>
            {editing === i && it.rename ? (
              <div className="menu-rename">
                {checks && <span className="check-mark">{it.checked ? '✓' : ''}</span>}
                <NameInput
                  value={it.label}
                  taken={it.rename.taken}
                  label={`Nombre de ${it.label}`}
                  onDone={(n) => {
                    setEditing(null);
                    if (n) it.rename!.onRename(n);
                  }}
                />
              </div>
            ) : (
              <button
                role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={it.checked}
                aria-label={it.label}
                aria-keyshortcuts={it.shortcut}
                disabled={it.disabled}
                title={it.title ?? (it.rename ? 'Doble clic para renombrar' : undefined)}
                onClick={() => {
                  clearTimeout(clickTimer.current);
                  const go = () => {
                    close();
                    it.onClick();
                  };
                  if (it.rename) clickTimer.current = setTimeout(go, 250);
                  else go();
                }}
                onDoubleClick={
                  it.rename
                    ? () => {
                        clearTimeout(clickTimer.current);
                        setEditing(i);
                      }
                    : undefined
                }
              >
                <span>
                  {checks && <span className="check-mark">{it.checked ? '✓' : ''}</span>}
                  {it.label}
                </span>
                {it.shortcut && <span className="sc">{it.shortcut}</span>}
              </button>
            )}
            {!!it.actions?.length && (
              <span className="menu-actions">
                {it.actions.map((a) => (
                  <button
                    key={a.label}
                    className="icon-btn"
                    aria-label={a.label}
                    title={a.label}
                    onClick={(e) => {
                      e.stopPropagation();
                      clearTimeout(clickTimer.current);
                      close();
                      a.onClick();
                    }}
                  >
                    <Icon name={a.icon} size={14} />
                  </button>
                ))}
              </span>
            )}
          </div>
        ),
      )}
    </div>
  );
}
