// Cápsula del lápiz (F): arriba del esquemático mientras se dibuja a mano alzada. Lápiz o goma,
// grosor, color y trazo suave; lo elegido queda guardado en el navegador.
import { t } from '../i18n/i18n.ts';
import type { Tool } from './editorTypes.ts';
import { ERASER_SIZES, PEN_COLORS, PEN_WIDTHS, setPenPrefs, usePenPrefs } from './pen.ts';

const COLOR_LABELS = () => [t('Drawing color'), t('Red'), t('Orange'), t('Green'), t('Blue'), t('Purple')];

export function PenCapsule({ tool, setTool }: { tool: Tool; setTool(tt: Tool): void }) {
  const pen = usePenPrefs();
  const erasing = tool.kind === 'eraser';
  return (
    <div className="pen-capsule" role="toolbar" aria-label={t('Pencil')} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <button className={erasing ? '' : 'active'} aria-label={t('Pencil')} title={`${t('Pencil')} (F)`} onClick={() => setTool({ kind: 'pencil' })}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M3 17l1-4 9-9 3 3-9 9-4 1zM11.5 5.5l3 3" />
        </svg>
      </button>
      {PEN_WIDTHS.map((w, i) => (
        <button
          key={w}
          className={`pen-level${pen.width === w ? (erasing ? ' chosen' : ' active') : ''}`}
          aria-label={t('Pencil thickness {n} of {total}', { n: i + 1, total: PEN_WIDTHS.length })}
          title={t('Pencil thickness {n} of {total}', { n: i + 1, total: PEN_WIDTHS.length })}
          onClick={() => (setPenPrefs({ width: w }), setTool({ kind: 'pencil' }))}
        >
          <span className="pen-dot" style={{ width: 2 + 2 * i, height: 2 + 2 * i }} />
        </button>
      ))}
      <span className="pen-sep" />
      <button className={erasing ? 'active' : ''} aria-label={t('Eraser')} title={`${t('Eraser: drag over a stroke to erase pieces of it')} (Shift+F)`} onClick={() => setTool({ kind: 'eraser' })}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M7 17h10M3.5 12.5l8-8 5 5-7.5 7.5H7.5z M7.5 8.5l5 5" />
        </svg>
      </button>
      {ERASER_SIZES.map((r, i) => (
        <button
          key={r}
          className={`pen-level${pen.eraser === r ? (erasing ? ' active' : ' chosen') : ''}`}
          aria-label={t('Eraser size {n} of {total}', { n: i + 1, total: ERASER_SIZES.length })}
          title={t('Eraser size {n} of {total}', { n: i + 1, total: ERASER_SIZES.length })}
          onClick={() => (setPenPrefs({ eraser: r }), setTool({ kind: 'eraser' }))}
        >
          <span className="pen-ring" style={{ width: 5 + 4 * i, height: 5 + 4 * i }} />
        </button>
      ))}
      <span className="pen-sep" />
      {PEN_COLORS.map((c, i) => (
        <button
          key={c || 'theme'}
          className={`pen-swatch${!erasing && pen.color === c ? ' active' : ''}`}
          aria-label={COLOR_LABELS()[i]}
          title={COLOR_LABELS()[i]}
          onClick={() => (setPenPrefs({ color: c }), setTool({ kind: 'pencil' }))}
        >
          <span style={{ background: c ? `#${c}` : 'var(--sch-drawing)' }} />
        </button>
      ))}
      <span className="pen-sep" />
      <button className={pen.smooth ? 'active' : ''} aria-pressed={pen.smooth} title={t('Smooth: the stroke becomes a soft curve')} onClick={() => setPenPrefs({ smooth: !pen.smooth })}>
        {t('Smooth')}
      </button>
    </div>
  );
}
