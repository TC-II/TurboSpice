// Botón de la barra del proyecto (#150, #180): «Proyecto · Workbench», con el ícono del panel del
// proyecto. Muestra los nombres y, si hay cambios sin guardar, un punto naranja; al tocarlo abre o
// cierra el panel. El nombre del proyecto se renombra con el lápiz que aparece al pasar el mouse (o
// con doble click en el nombre), como en el árbol; en el panel se renombran, eligen, crean y borran
// los testbenches.
import { Icon } from '../ui/icons.tsx';
import { useState } from 'react';
import { t } from '../i18n/i18n.ts';
import { NameInput } from '../ui/EditableName.tsx';

export function ProjectCapsule({
  project,
  workbench,
  bench,
  dirty,
  open,
  onToggle,
  onRename,
}: {
  project: string;
  /** workbench del testbench que se ve (sin workbench: se muestra el testbench) */
  workbench?: string;
  /** testbench que se ve */
  bench: string;
  dirty: boolean;
  /** el panel del proyecto está abierto */
  open: boolean;
  onToggle(): void;
  onRename(name: string): void;
}) {
  const [renaming, setRenaming] = useState(false);
  if (renaming)
    return (
      <div className={`proj-capsule${open ? ' on' : ''}`} data-bench={bench}>
        <Icon name="tree" />
        <NameInput
          value={project}
          label={t('Project name')}
          onDone={(n) => {
            setRenaming(false);
            if (n && n !== project) onRename(n);
          }}
        />
      </div>
    );
  const where = workbench ? `${workbench} › ${bench}` : bench;
  // toda la cápsula abre o cierra el panel (con el teclado, el botón del ícono); el lápiz, no
  return (
    <div className={`proj-capsule${open ? ' on' : ''}`} data-bench={bench} onClick={onToggle} title={t('Project panel: testbenches and subcircuits')}>
      <button className="capsule-toggle" aria-pressed={open} aria-label={t('Project panel')}>
        <Icon name="tree" />
      </button>
      <span className="capsule-names">
        <span className="capsule-project" title={t('{project} (double-click to rename)', { project })} onDoubleClick={() => setRenaming(true)}>
          {project}
        </span>
        <button
          className="capsule-edit"
          onClick={(e) => {
            e.stopPropagation();
            setRenaming(true);
          }}
          title={t('Rename the project')}
          aria-label={t('Rename the project')}
        >
          <Icon name="edit" size={13} />
        </button>
        <span className="capsule-dot">·</span>
        <span className="capsule-variant" title={where}>
          {workbench ?? bench}
        </span>
        {dirty && (
          <span className="capsule-dirty" title={t('There are unsaved changes')}>
            •
          </span>
        )}
      </span>
      {/* sólo indica que se abre (abajo) o se cierra (arriba) */}
      <svg className={`capsule-arrow${open ? ' up' : ''}`} viewBox="0 0 20 5" width="20" height="5" aria-hidden="true">
        <path d="M1 0.75l9 3.5 9-3.5" />
      </svg>
    </div>
  );
}
