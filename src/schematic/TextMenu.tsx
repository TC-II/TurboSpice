// Menú del botón derecho de un comentario: tamaño de letra y justificación (las del TEXT del .asc)
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SchText } from '../asc/model.ts';
import { t } from '../i18n/i18n.ts';
import { TEXT_ALIGNS, TEXT_SIZES, fontIndex } from './geometry.ts';

const alignLabel = (a: string) =>
  ({
    Left: t('Left'),
    Center: t('Center'),
    Right: t('Right'),
    Top: t('Top'),
    Bottom: t('Bottom'),
    VLeft: t('Vertical left'),
    VCenter: t('Vertical center'),
    VRight: t('Vertical right'),
    VTop: t('Vertical top'),
    VBottom: t('Vertical bottom'),
  })[a] ?? a;

export function TextMenu({ at, text, onChange, onEdit, onDialog, onDelete, onClose }: {
  at: { x: number; y: number };
  text: SchText;
  onChange(patch: Partial<SchText>): void;
  /** escribir en el lugar */
  onEdit(): void;
  /** el diálogo completo (permite pasarlo a directiva) */
  onDialog(): void;
  onDelete(): void;
  onClose(): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect();
    if (r) setPos({ x: Math.min(at.x, window.innerWidth - r.width - 8), y: Math.min(at.y, window.innerHeight - r.height - 8) });
  }, [at]);
  useEffect(() => {
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose());
    const tt = setTimeout(() => window.addEventListener('pointerdown', down, true), 0);
    window.addEventListener('keydown', key, true);
    return () => {
      clearTimeout(tt);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [onClose]);
  const act = (f: () => void) => () => {
    onClose();
    f();
  };
  const aligns = TEXT_ALIGNS.includes(text.align) ? TEXT_ALIGNS : [text.align, ...TEXT_ALIGNS];
  return (
    <div ref={box} className="ctx-menu text-menu" role="menu" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      <label className="ctx-edit">
        <span>{t('Size')}</span>
        <select value={fontIndex(text.size)} onChange={(e) => onChange({ size: Number(e.target.value) })}>
          {TEXT_SIZES.map((f, i) => (
            <option key={i} value={i}>{`${f}×`}</option>
          ))}
        </select>
      </label>
      <label className="ctx-edit">
        <span>{t('Alignment')}</span>
        <select value={text.align} onChange={(e) => onChange({ align: e.target.value })}>
          {aligns.map((a) => (
            <option key={a} value={a}>{alignLabel(a)}</option>
          ))}
        </select>
      </label>
      <button type="button" role="menuitem" onClick={act(onEdit)}>{t('Edit text')}</button>
      <button type="button" role="menuitem" onClick={act(onDialog)}>{t('Text properties…')}</button>
      <button type="button" role="menuitem" onClick={act(onDelete)}>{t('Delete')}</button>
    </div>
  );
}
