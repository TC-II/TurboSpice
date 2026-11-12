// Cápsula del lápiz (F): arriba del esquemático mientras se dibuja a mano alzada. Lápiz, figuras
// (con el grosor, el color y el estilo de línea elegidos) o goma; los grosores del lápiz se ven sólo
// con el lápiz o una figura y los tamaños de la goma sólo con la goma. Lo elegido queda guardado
// en el navegador.
import { t } from '../i18n/i18n.ts';
import type { DrawnShapeKind } from '../asc/model.ts';
import type { Tool } from './editorTypes.ts';
import { ERASER_SIZES, PEN_COLORS, PEN_WIDTHS, setPenPrefs, usePenPrefs, type PenStyle } from './pen.ts';

const COLOR_LABELS = () => [t('Drawing color'), t('Red'), t('Orange'), t('Green'), t('Blue'), t('Purple')];

const SHAPES: { kind: DrawnShapeKind; label: () => string; key: string; d: string }[] = [
  { kind: 'LINE', label: () => t('Line'), key: 'J', d: 'M3.5 16.5l13-13' },
  { kind: 'RECTANGLE', label: () => t('Rectangle'), key: 'K', d: 'M3.5 5.5h13v9h-13z' },
  { kind: 'CIRCLE', label: () => t('Circle'), key: 'O', d: 'M10 3.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13z' },
  { kind: 'ARC', label: () => t('Arc'), key: 'U', d: 'M3.5 15a6.5 6.5 0 0 1 13 0' },
];

export function PenCapsule({
  tool,
  setTool,
  clearAll,
  hasStrokes,
  selected,
  restyle,
}: {
  tool: Tool;
  setTool(tt: Tool): void;
  clearAll(): void;
  hasStrokes: boolean;
  /** con Seleccionar y figuras elegidas: el estilo de la primera; grosor y color se aplican a todas */
  selected?: PenStyle;
  restyle(patch: Partial<PenStyle>): void;
}) {
  const pen = usePenPrefs();
  const erasing = tool.kind === 'eraser';
  const drawing = tool.kind === 'pencil' || tool.kind === 'shape';
  const editing = tool.kind === 'select' && !!selected;
  const curWidth = editing ? selected.width : pen.width;
  const curColor = editing ? (selected.color ?? '') : pen.color;
  // el estilo de línea (guiones) se conserva al cambiar de herramienta
  const style = tool.kind === 'pencil' || tool.kind === 'shape' ? tool.style : undefined;
  const styled = style ? { style } : {};
  const toPencil = (): Tool => ({ kind: 'pencil', ...styled });
  // grosor y color valen para lo que se está dibujando: sigue la figura elegida o pasa al lápiz
  const keepDrawing = (): Tool => (tool.kind === 'shape' ? { ...tool, pts: [] } : toPencil());
  return (
    <div className="pen-capsule" role="toolbar" aria-label={t('Pencil')} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <button className={tool.kind === 'pencil' ? 'active' : ''} aria-label={t('Pencil')} title={`${t('Pencil')} (F)`} onClick={() => setTool(toPencil())}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M3 17l1-4 9-9 3 3-9 9-4 1zM11.5 5.5l3 3" />
        </svg>
      </button>
      {(drawing || editing) &&
        PEN_WIDTHS.map((w, i) => (
          <button
            key={w}
            className={`pen-level${curWidth === w ? ' active' : ''}`}
            aria-label={t('Pencil thickness {n} of {total}', { n: i + 1, total: PEN_WIDTHS.length })}
            title={t('Pencil thickness {n} of {total}', { n: i + 1, total: PEN_WIDTHS.length })}
            onClick={() => (editing ? restyle({ width: w }) : (setPenPrefs({ width: w }), setTool(keepDrawing())))}
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
      {erasing &&
        ERASER_SIZES.map((r, i) => (
          <button
            key={r}
            className={`pen-level${pen.eraser === r ? ' active' : ''}`}
            aria-label={t('Eraser size {n} of {total}', { n: i + 1, total: ERASER_SIZES.length })}
            title={t('Eraser size {n} of {total}', { n: i + 1, total: ERASER_SIZES.length })}
            onClick={() => setPenPrefs({ eraser: r })}
          >
            <span className="pen-ring" style={{ width: 5 + 4 * i, height: 5 + 4 * i }} />
          </button>
        ))}
      <span className="pen-sep" />
      {SHAPES.map((s) => (
        <button
          key={s.kind}
          className={tool.kind === 'shape' && tool.shape === s.kind ? 'active' : ''}
          aria-label={s.label()}
          title={`${s.label()} (${s.key})`}
          onClick={() => setTool({ kind: 'shape', shape: s.kind, pts: [], ...styled })}
        >
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <path d={s.d} />
          </svg>
        </button>
      ))}
      <span className="pen-sep" />
      <button className={tool.kind === 'select' ? 'active' : ''} aria-label={t('Select')} title={`${t('Select')} (Esc)`} onClick={() => setTool({ kind: 'select' })}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M4.5 3v13l3.5-3.5 2.5 5 2-1-2.5-5h5z" />
        </svg>
      </button>
      <span className="pen-sep" />
      {PEN_COLORS.map((c, i) => (
        <button
          key={c || 'theme'}
          className={`pen-swatch${(drawing || editing) && curColor === c ? ' active' : ''}`}
          aria-label={COLOR_LABELS()[i]}
          title={COLOR_LABELS()[i]}
          onClick={() => (editing ? restyle({ color: c || undefined }) : (setPenPrefs({ color: c }), setTool(keepDrawing())))}
        >
          <span style={{ background: c ? `#${c}` : 'var(--sch-drawing)' }} />
        </button>
      ))}
      <span className="pen-sep" />
      <button
        className={(editing ? selected.smooth : pen.smooth) ? 'active' : ''}
        aria-pressed={editing ? !!selected.smooth : pen.smooth}
        title={t('Smooth: the stroke becomes a soft curve')}
        onClick={() => (editing ? restyle({ smooth: !selected.smooth }) : setPenPrefs({ smooth: !pen.smooth }))}
      >
        {t('Smooth')}
      </button>
      <button disabled={!hasStrokes} aria-label={t('Clear all')} title={t('Clear all: erase every freehand stroke (Ctrl+Z undoes it)')} onClick={clearAll}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M4 6h12M8 6V4h4v2M5.5 6l.8 10h7.4l.8-10M8.5 9v5M11.5 9v5" />
        </svg>
      </button>
    </div>
  );
}
