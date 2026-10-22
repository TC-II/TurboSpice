// Cápsula de la barra superior (#150): «Proyecto · Variante» con una flecha, como Simular. Cada
// parte se renombra con doble clic. La flecha despliega New Variant | Clone current y la lista de
// variantes: clic para pasar a una, doble clic para renombrarla, duplicar y borrar a la derecha.
import { useEffect, useRef, useState } from 'react';
import { EditableName, NameInput } from '../ui/EditableName.tsx';
import { Icon } from '../ui/icons.tsx';
import { t } from '../i18n/i18n.ts';

export interface CapsuleVariant {
  id: string;
  name: string;
  /** cuántas simulaciones tiene (se muestra en la lista) */
  sims: number;
}

export function ProjectCapsule({ project, variants, active, dirty, onRenameProject, onRenameVariant, onSelect, onClone, onBlank, onDuplicate, onDelete }: {
  project: string;
  variants: CapsuleVariant[];
  active: string;
  dirty: boolean;
  onRenameProject(name: string): void;
  onRenameVariant(id: string, name: string): void;
  onSelect(id: string): void;
  onClone(): void;
  onBlank(): void;
  onDuplicate(id: string): void;
  onDelete(id: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(clickTimer.current), []);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editing) {
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
  }, [open, editing]);
  const cur = variants.find((v) => v.id === active) ?? variants[0];
  const others = (id: string) => variants.filter((v) => v.id !== id).map((v) => v.name);
  const act = (f: () => void) => () => {
    setOpen(false);
    f();
  };

  return (
    <div className="capsule" ref={root}>
      <span className="capsule-names">
        <EditableName value={project} onRename={onRenameProject} label={t('Project name')} className="capsule-project" title={t('Project «{project}» (double-click to rename)', { project })} />
        <span className="capsule-dot">·</span>
        <EditableName
          value={cur.name}
          taken={others(cur.id)}
          onRename={(n) => onRenameVariant(cur.id, n)}
          label={t('Variant name')}
          className="capsule-variant"
          title={t('Variant «{name}» (double-click to rename)', { name: cur.name })}
        />
        {dirty && <span className="capsule-dirty" title={t('There are unsaved changes')}>•</span>}
      </span>
      <button ref={btn} className={`capsule-caret${open ? ' open' : ''}`} aria-label={t('Variants')} aria-haspopup="menu" aria-expanded={open} title={t('Project variants')} onClick={() => setOpen(!open)}>
        <Icon name="caret" size={14} />
      </button>
      {open && (
        <div className="capsule-pop" role="menu" aria-label={t('Variants')}>
          <div className="capsule-split" role="group" aria-label={t('New variant')}>
            <button onClick={act(onBlank)} title={t('Empty variant: no circuit or simulations')}>
              {t('New Variant')}
            </button>
            <button onClick={act(onClone)} title={t('Copy of this variant (circuit, simulations and history) with another name')}>
              {t('Clone current')}
            </button>
          </div>
          <ul className="capsule-list">
            {variants.map((v) => (
              <li key={v.id} className={`capsule-row${v.id === active ? ' active' : ''}`}>
                {editing === v.id ? (
                  <span className="capsule-row-name">
                    <NameInput
                      value={v.name}
                      taken={others(v.id)}
                      label={t('Name of {name}', { name: v.name })}
                      onDone={(n) => {
                        setEditing(null);
                        if (n) onRenameVariant(v.id, n);
                      }}
                    />
                  </span>
                ) : (
                  <button
                    className="capsule-row-name"
                    role="menuitemradio"
                    aria-checked={v.id === active}
                    title={t('{name} · {p1} (double-click to rename)', { name: v.name, p1: v.sims === 1 ? t('1 simulation') : t('{sims} simulations', { sims: v.sims }) })}
                    onClick={() => {
                      clearTimeout(clickTimer.current);
                      clickTimer.current = setTimeout(act(() => onSelect(v.id)), 250);
                    }}
                    onDoubleClick={() => {
                      clearTimeout(clickTimer.current);
                      setEditing(v.id);
                    }}
                  >
                    <span className="check-mark">{v.id === active ? '✓' : ''}</span>
                    <span className="capsule-row-label">{v.name}</span>
                    <span className="sc">{v.sims}</span>
                  </button>
                )}
                <button className="icon-btn" aria-label={t('Duplicate {name}', { name: v.name })} title={t('Duplicate')} onClick={act(() => onDuplicate(v.id))}>
                  <Icon name="copy" size={14} />
                </button>
                <button
                  className="icon-btn"
                  aria-label={t('Delete {name}', { name: v.name })}
                  title={variants.length > 1 ? t('Delete') : t('It\'s the only variant')}
                  disabled={variants.length === 1}
                  onClick={act(() => onDelete(v.id))}
                >
                  <Icon name="trash" size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
