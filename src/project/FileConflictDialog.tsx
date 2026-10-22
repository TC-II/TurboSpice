// Un archivo que llega con el nombre de uno del proyecto pero otro contenido (#155): se elige
// reemplazar, mantener el existente o agregar el nuevo con otro nombre.
import { Modal } from '../schematic/dialogs.tsx';
import type { FileConflict } from './project.ts';
import { t } from '../i18n/i18n.ts';

export function FileConflictDialog({ name, onChoose }: { name: string; onChoose(c: FileConflict): void }) {
  return (
    <Modal title={t('Duplicate file')} onClose={() => onChoose('keep')}>
      <p>
        {t('The project already has a')}{' '}<code>{name}</code> {t('with different content. What should we do with the new one?')}
      </p>
      <div className="buttons">
        <button onClick={() => onChoose('keep')} autoFocus>{t('Keep the existing one')}</button>
        <button onClick={() => onChoose('rename')}>{t('Add it with another name')}</button>
        <button className="primary" onClick={() => onChoose('replace')}>{t('Replace')}</button>
      </div>
    </Modal>
  );
}
