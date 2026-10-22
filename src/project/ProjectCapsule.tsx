// Cápsula de la barra superior (#150): «Proyecto · Variante» con una flecha, como Simular. Cada
// parte se renombra con doble clic. La flecha despliega Clone Current | Blank y la lista de
// variantes: clic para pasar a una, doble clic para renombrarla, duplicar y borrar a la derecha.
import { useEffect, useRef, useState } from 'react';
import { EditableName, NameInput } from '../ui/EditableName.tsx';
import { Icon } from '../ui/icons.tsx';

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
        <EditableName value={project} onRename={onRenameProject} label="Nombre del proyecto" className="capsule-project" title={`Proyecto «${project}» (doble clic para renombrar)`} />
        <span className="capsule-dot">·</span>
        <EditableName
          value={cur.name}
          taken={others(cur.id)}
          onRename={(n) => onRenameVariant(cur.id, n)}
          label="Nombre de la variante"
          className="capsule-variant"
          title={`Variante «${cur.name}» (doble clic para renombrar)`}
        />
        {dirty && <span className="capsule-dirty" title="Hay cambios sin guardar">•</span>}
      </span>
      <button ref={btn} className={`capsule-caret${open ? ' open' : ''}`} aria-label="Variantes" aria-haspopup="menu" aria-expanded={open} title="Variantes del proyecto" onClick={() => setOpen(!open)}>
        <Icon name="caret" size={14} />
      </button>
      {open && (
        <div className="capsule-pop" role="menu" aria-label="Variantes">
          <div className="capsule-split" role="group" aria-label="Variante nueva">
            <button onClick={act(onClone)} title="Copia de esta variante (circuito, simulaciones e historial) con otro nombre">
              Clone Current
            </button>
            <button onClick={act(onBlank)} title="Variante vacía: sin circuito ni simulaciones">
              Blank
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
                      label={`Nombre de ${v.name}`}
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
                    title={`${v.name} · ${v.sims === 1 ? '1 simulación' : `${v.sims} simulaciones`} (doble clic para renombrar)`}
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
                <button className="icon-btn" aria-label={`Duplicar ${v.name}`} title="Duplicar" onClick={act(() => onDuplicate(v.id))}>
                  <Icon name="copy" size={14} />
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Borrar ${v.name}`}
                  title={variants.length > 1 ? 'Borrar' : 'Es la única variante'}
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
