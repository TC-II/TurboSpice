// Confirmación de borrado (#150, #151): hay que arrastrar el control de punta a punta. Si se
// suelta antes del final vuelve al principio; con el teclado, flecha derecha / Fin hasta 100.
import { useRef, useState, type ReactNode } from 'react';
import { Modal } from '../schematic/dialogs.tsx';
import { t } from '../i18n/i18n.ts';

export function SlideConfirm({ title, message, action = t('Slide to delete'), releaseLabel = t('Release to delete'), extra, onConfirm, onClose }: {
  title: string;
  message: string;
  action?: string;
  /** el rótulo cuando el control llegó al final */
  releaseLabel?: string;
  /** botones además de Cancelar (p. ej. ir a la alternativa recomendada) */
  extra?: ReactNode;
  onConfirm(): void;
  onClose(): void;
}) {
  const [v, setV] = useState(0);
  const [dragging, setDragging] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x0: number; v0: number } | null>(null);
  const KNOB = 40;
  const release = () => {
    drag.current = null;
    setDragging(false);
    if (v >= 100) onConfirm();
    else setV(0);
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current || !track.current) return;
    const range = track.current.clientWidth - KNOB;
    const nv = drag.current.v0 + ((e.clientX - drag.current.x0) / range) * 100;
    setV(Math.max(0, Math.min(100, nv)));
  };
  return (
    <Modal title={title} onClose={onClose}>
      <p>{message}</p>
      <div className={`slide-confirm${dragging ? ' dragging' : ''}`} ref={track} style={{ ['--slide-f' as string]: v / 100 }}>
        <span className="slide-label">{v >= 100 ? releaseLabel : action}</span>
        <div
          className="slide-knob"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x0: e.clientX, v0: v }; setDragging(true); }}
          onPointerMove={move}
          onPointerUp={release}
          onPointerCancel={release}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={v}
          aria-label={action}
          onChange={(e) => setV(Number(e.target.value))}
          tabIndex={0}
          onKeyUp={(e) => (e.key === 'ArrowRight' || e.key === 'End' || e.key === 'ArrowUp') && v >= 100 && onConfirm()}
          onBlur={() => v < 100 && setV(0)}
        />
      </div>
      <div className="buttons">
        <button onClick={onClose} autoFocus>{t('Cancel')}</button>
        {extra}
      </div>
    </Modal>
  );
}
