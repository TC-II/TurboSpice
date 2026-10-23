// Cápsula de la barra superior (#150, #180): «Proyecto · Testbench». Cada parte se renombra con
// doble clic. Los testbenches se eligen, crean, duplican y borran en el panel del proyecto.
import { EditableName } from '../ui/EditableName.tsx';
import { t } from '../i18n/i18n.ts';

export function ProjectCapsule({ project, bench, taken, dirty, onRenameProject, onRenameBench }: {
  project: string;
  /** testbench que se ve */
  bench: string;
  /** nombres de los otros testbenches (no se pueden repetir) */
  taken: string[];
  dirty: boolean;
  onRenameProject(name: string): void;
  onRenameBench(name: string): void;
}) {
  return (
    <div className="capsule">
      <span className="capsule-names">
        <EditableName value={project} onRename={onRenameProject} label={t('Project name')} className="capsule-project" title={t('Project «{project}» (double-click to rename)', { project })} />
        <span className="capsule-dot">·</span>
        <EditableName value={bench} taken={taken} onRename={onRenameBench} label={t('Testbench name')} className="capsule-variant" title={t('Testbench «{name}» (double-click to rename)', { name: bench })} />
        {dirty && <span className="capsule-dirty" title={t('There are unsaved changes')}>•</span>}
      </span>
    </div>
  );
}
