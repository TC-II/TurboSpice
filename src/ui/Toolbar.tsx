// Barra de herramientas por grupos de íconos. Si falta lugar, los grupos pasan (de derecha a
// izquierda) a un desplegable "Más herramientas"; lo que va en `fixed` queda siempre a la vista.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './icons.tsx';
import { MenuButton, type MenuItem } from './Menu.tsx';

export interface ToolDef {
  icon: IconName;
  /** Nombre accesible del botón (y del ítem en el desplegable) */
  label: string;
  /** Tooltip, sin el atajo */
  title: string;
  shortcut?: string;
  onClick(): void;
  /** Sólo en las herramientas con estado: si está activa */
  active?: boolean;
  disabled?: boolean;
}

export interface ToolGroup {
  id: string;
  label: string;
  tools: ToolDef[];
}

export const toolTitle = (t: { title: string; shortcut?: string }) => (t.shortcut ? `${t.title} (${t.shortcut})` : t.title);

export function ToolButton({ tool }: { tool: ToolDef }) {
  return (
    <button className={tool.active ? 'active' : ''} aria-label={tool.label} aria-keyshortcuts={tool.shortcut} title={toolTitle(tool)} onClick={tool.onClick} disabled={tool.disabled}>
      <Icon name={tool.icon} />
    </button>
  );
}

/** Ancho que se reserva para el botón "Más herramientas" */
const MORE_W = 38;

/** Cuántos grupos (de izquierda a derecha) entran en `avail`; si no entran todos, se reserva
 * lugar para el botón "Más herramientas" */
export function groupsThatFit(widths: number[], avail: number, moreW = MORE_W): number {
  if (widths.reduce((a, b) => a + b, 0) <= avail) return widths.length;
  let used = moreW;
  let n = 0;
  while (n < widths.length && used + widths[n] <= avail) used += widths[n++];
  return n;
}

export function Toolbar({ label, groups, fixed, after }: { label: string; groups: ToolGroup[]; fixed: ReactNode; after?: ReactNode }) {
  const bar = useRef<HTMLDivElement>(null);
  // ancho de cada grupo la última vez que se vio (los ocultos no se pueden medir)
  const widths = useRef(new Map<string, number>());
  const [shown, setShown] = useState(groups.length);

  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const fit = () => {
      for (const g of el.querySelectorAll<HTMLElement>(':scope > [data-group]')) widths.current.set(g.dataset.group!, g.offsetWidth);
      const cs = getComputedStyle(el);
      const fixedW = el.querySelector<HTMLElement>(':scope > .fixed')?.offsetWidth ?? 0;
      const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - fixedW;
      setShown(groupsThatFit(groups.map((g) => widths.current.get(g.id) ?? 0), avail));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  });

  const hidden = groups.slice(shown);
  const moreItems: MenuItem[] = hidden.flatMap((g, i) => [
    ...(i ? ['sep' as const] : []),
    ...g.tools.map((t) => ({ label: t.label, shortcut: t.shortcut, title: t.title, onClick: t.onClick, disabled: t.disabled, checked: t.active })),
  ]);

  return (
    <div className="iconbar" role="toolbar" aria-label={label} ref={bar}>
      {groups.slice(0, shown).map((g) => (
        <div key={g.id} className="group" role="group" aria-label={g.label} data-group={g.id}>
          {g.tools.map((t) => (
            <ToolButton key={t.label} tool={t} />
          ))}
        </div>
      ))}
      {hidden.length > 0 && (
        <div className="group more">
          <MenuButton items={moreItems} label="Más herramientas" title={`Más herramientas: ${hidden.map((g) => g.label.toLowerCase()).join(', ')}`}>
            <Icon name="more" />
          </MenuButton>
        </div>
      )}
      <div className="group fixed">{fixed}</div>
      {after}
    </div>
  );
}
