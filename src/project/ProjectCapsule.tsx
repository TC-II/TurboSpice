// Botón de la barra del proyecto (#150, #180): «Proyecto · Testbench», con el ícono del panel del
// proyecto. Sólo muestra los nombres y, si hay cambios sin guardar, un punto naranja; al tocarlo
// abre o cierra el panel; doble click en el nombre del proyecto lo renombra (en el panel se renombran, eligen, crean y borran los testbenches).
import { Icon } from '../ui/icons.tsx';
import { useState } from 'react';
import { t } from '../i18n/i18n.ts';
import { NameInput } from '../ui/EditableName.tsx';

export function ProjectCapsule({ project, bench, dirty, open, onToggle, onRename }: {
  project: string;
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
      <div className={`proj-capsule${open ? ' on' : ''}`}>
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
  return (
    <button className={`proj-capsule${open ? ' on' : ''}`} onClick={onToggle} aria-pressed={open} aria-label={t('Project panel')} title={t('Project panel: testbenches and subcircuits')}>
      <Icon name="tree" />
      <span className="capsule-names">
        <span className="capsule-project" title={t('{project} (double-click to rename)', { project })} onDoubleClick={(e) => { e.stopPropagation(); setRenaming(true); }}>{project}</span>
        <span className="capsule-dot">·</span>
        <span className="capsule-variant">{bench}</span>
        {dirty && <span className="capsule-dirty" title={t('There are unsaved changes')}>•</span>}
      </span>
      {/* sólo indica que se abre (abajo) o se cierra (arriba) */}
      <svg className={`capsule-arrow${open ? ' up' : ''}`} viewBox="0 0 20 5" width="20" height="5" aria-hidden="true">
        <path d="M1 0.75l9 3.5 9-3.5" />
      </svg>
    </button>
  );
}
