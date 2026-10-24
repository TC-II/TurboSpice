// Barra de herramientas por grupos de íconos. Si falta lugar, los grupos pasan (de derecha a
// izquierda) a un desplegable "Más herramientas"; lo que va en `fixed` queda siempre a la vista
// y lo que va en `after` (a la derecha) ocupa el lugar que sobra, con un mínimo reservado.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './icons.tsx';
import { MenuButton, type MenuItem } from './Menu.tsx';
import { t } from '../i18n/i18n.ts';

export interface ToolDef {
  icon: IconName;
  /** Nombre accesible del botón (y del ítem en el desplegable) */
  label: string;
  /** Tooltip, sin el atajo */
  title: string;
  shortcut?: string;
  /** sin `items`: lo que hace el botón */
  onClick?(): void;
  /** el botón despliega este mini menú (p.ej. las figuras) */
  items?: MenuItem[];
  /** Sólo en las herramientas con estado: si está activa */
  active?: boolean;
  disabled?: boolean;
}

export interface ToolGroup {
  id: string;
  label: string;
  tools: ToolDef[];
}

export const toolTitle = (tt: { title: string; shortcut?: string }) => (tt.shortcut ? `${tt.title} (${tt.shortcut})` : tt.title);

export function ToolButton({ tool }: { tool: ToolDef }) {
  if (tool.items)
    return (
      <MenuButton items={tool.items} label={tool.label} title={toolTitle(tool)} className={tool.active ? 'active' : ''} disabled={tool.disabled}>
        <Icon name={tool.icon} />
      </MenuButton>
    );
  return (
    <button className={tool.active ? 'active' : ''} aria-label={tool.label} aria-keyshortcuts={tool.shortcut} title={toolTitle(tool)} onClick={tool.onClick} disabled={tool.disabled}>
      <Icon name={tool.icon} />
    </button>
  );
}

/** Ancho que se reserva para el botón "Más herramientas" */
const MORE_W = 38;
/** Ancho mínimo que se reserva para lo de la derecha (`after`) */
const AFTER_MIN = 480;

/** Cuántos grupos (de izquierda a derecha) entran en `avail`; si no entran todos, se reserva
 * lugar para el botón "Más herramientas" */
export function groupsThatFit(widths: number[], avail: number, moreW = MORE_W): number {
  if (widths.reduce((a, b) => a + b, 0) <= avail) return widths.length;
  let used = moreW;
  let n = 0;
  while (n < widths.length && used + widths[n] <= avail) used += widths[n++];
  return n;
}

export function Toolbar({ label, groups, lead, fixed, after }: { label: string; groups: ToolGroup[]; lead?: ReactNode; fixed?: ReactNode; after?: ReactNode }) {
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
      const fixedW = (el.querySelector<HTMLElement>(':scope > .fixed')?.offsetWidth ?? 0) + (el.querySelector<HTMLElement>(':scope > .lead')?.offsetWidth ?? 0);
      // ancho natural de lo de la derecha (sin achicarse)
      // lo de la derecha se achica (sus campos pasan a más filas) hasta su mínimo
      const afterW = el.querySelector(':scope > .bar-after') ? AFTER_MIN : 0;
      const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - fixedW - afterW;
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
    ...g.tools.map((tt): MenuItem =>
      tt.items
        ? { label: tt.label, items: tt.items, disabled: tt.disabled }
        : { label: tt.label, shortcut: tt.shortcut, title: tt.title, onClick: tt.onClick ?? (() => {}), disabled: tt.disabled, checked: tt.active },
    ),
  ]);

  return (
    <div className="iconbar" role="toolbar" aria-label={label} ref={bar}>
      {lead && <div className="group lead">{lead}</div>}
      {groups.slice(0, shown).map((g) => (
        <div key={g.id} className="group" role="group" aria-label={g.label} data-group={g.id}>
          {g.tools.map((tt) => (
            <ToolButton key={tt.label} tool={tt} />
          ))}
        </div>
      ))}
      {hidden.length > 0 && (
        <div className="group more">
          <MenuButton items={moreItems} label={t('More tools')} title={t('More tools: {p0}', { p0: hidden.map((g) => g.label.toLowerCase()).join(', ') })}>
            <Icon name="more" />
          </MenuButton>
        </div>
      )}
      {fixed && <div className="group fixed">{fixed}</div>}
      {after && <div className="bar-after">{after}</div>}
    </div>
  );
}
