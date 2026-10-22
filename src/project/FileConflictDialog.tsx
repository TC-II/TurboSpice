// Un archivo que llega con el nombre de uno del proyecto pero otro contenido (#155): se elige
// reemplazar, mantener el existente o agregar el nuevo con otro nombre.
import { Modal } from '../schematic/dialogs.tsx';
import type { FileConflict } from './project.ts';

export function FileConflictDialog({ name, onChoose }: { name: string; onChoose(c: FileConflict): void }) {
  return (
    <Modal title="Archivo repetido" onClose={() => onChoose('keep')}>
      <p>
        El proyecto ya tiene un <code>{name}</code> con otro contenido. ¿Qué hacemos con el nuevo?
      </p>
      <div className="buttons">
        <button onClick={() => onChoose('keep')} autoFocus>Mantener el existente</button>
        <button onClick={() => onChoose('rename')}>Agregarlo con otro nombre</button>
        <button className="primary" onClick={() => onChoose('replace')}>Reemplazar</button>
      </div>
    </Modal>
  );
}
