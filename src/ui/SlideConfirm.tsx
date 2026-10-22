// Confirmación de borrado (#150, #151): hay que arrastrar el control de punta a punta. Si se
// suelta antes del final vuelve al principio; con el teclado, flecha derecha / Fin hasta 100.
import { useState } from 'react';
import { Modal } from '../schematic/dialogs.tsx';

export function SlideConfirm({ title, message, action = 'Deslizá para borrar', onConfirm, onClose }: {
  title: string;
  message: string;
  action?: string;
  onConfirm(): void;
  onClose(): void;
}) {
  const [v, setV] = useState(0);
  const release = () => {
    if (v >= 100) onConfirm();
    else setV(0);
  };
  return (
    <Modal title={title} onClose={onClose}>
      <p>{message}</p>
      <div className="slide-confirm" style={{ ['--slide' as string]: `${v}%` }}>
        <span className="slide-label">{v >= 100 ? 'Soltá para borrar' : action}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={v}
          aria-label={action}
          onChange={(e) => setV(Number(e.target.value))}
          onPointerUp={release}
          onKeyUp={(e) => (e.key === 'ArrowRight' || e.key === 'End' || e.key === 'ArrowUp') && v >= 100 && onConfirm()}
          onBlur={() => v < 100 && setV(0)}
        />
      </div>
      <div className="buttons">
        <button onClick={onClose} autoFocus>Cancelar</button>
      </div>
    </Modal>
  );
}
