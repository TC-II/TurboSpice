// Barra de estado bajo el esquemático y la ayuda de cada herramienta
import { useEffect, useState, type MutableRefObject, type ReactNode } from 'react';
import type { Point } from '../asc/model.ts';
import type { ItemRef } from '../schematic/geometry.ts';
import type { Tool } from '../schematic/SchematicEditor.tsx';
import { t } from '../i18n/i18n.ts';
import { useEvent } from './useEvent.ts';

export type Hover = { ref: ItemRef | null; at: Point } | null;

/** Barra de estado de abajo: lo que hay bajo el mouse (con su propio estado, #187) */
/** Barra de estado bajo el esquemático: la ayuda a la izquierda y los avisos a la derecha (#229: sin ventanas emergentes) */
export function HintBar({
  sink,
  text,
  message,
  onDismiss,
  offers,
}: {
  sink: MutableRefObject<((h: Hover) => void) | undefined>;
  text(hover: Hover): string;
  message?: string;
  onDismiss(): void;
  offers?: ReactNode;
}) {
  const [hover, setHover] = useState<Hover>(null);
  useEffect(() => {
    sink.current = setHover;
    return () => {
      sink.current = undefined;
    };
  }, [sink]);
  const error = !!message && /could not|couldn't|failed|error|no se pudo|falló/i.test(message);
  // los avisos se van solos; los largos y los errores duran más para poder leerlos
  const ms = message ? Math.min(45000, Math.max(error ? 30000 : 18000, message.length * 210)) : 0;
  const dismiss = useEvent(onDismiss);
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(dismiss, ms);
    return () => clearTimeout(id);
  }, [message, ms, dismiss]);
  return (
    <div className="hint-bar">
      <span className="hint-text">{text(hover)}</span>
      {offers}
      {message && (
        <span className={error ? 'status-msg error' : 'status-msg'} role="status" title={message} onClick={onDismiss}>
          {message}
        </span>
      )}
      {message && (
        // cuánto le queda al aviso: el aro se vacía desde las 12 en sentido antihorario (key: reinicia con cada aviso)
        <svg key={message} className={error ? 'status-timer error' : 'status-timer'} viewBox="0 0 12 12" aria-hidden="true">
          <circle className="track" cx="6" cy="6" r="4.5" />
          <circle className="left" cx="6" cy="6" r="4.5" pathLength={100} style={{ animationDuration: `${ms}ms` }} />
        </svg>
      )}
    </div>
  );
}

export function toolHint(tt: Tool): string {
  switch (tt.kind) {
    case 'select':
      return '';
    case 'wire':
      return tt.start ? t('Click to fix the segment (Ctrl: straight line) · right-click or Esc to finish') : t('Click to start the wire');
    case 'place':
      return t('Placing {type} · Ctrl+R rotate · Ctrl+E mirror · Esc to finish', { type: tt.type });
    case 'flag':
      return tt.name === '0' ? t('Click to place ground · Esc to finish') : t('Click to place the label "{name}"', { name: tt.name });
    case 'text':
      return t('Click to place the text');
    case 'comment':
      return t('Click where the comment goes and type · Enter or click outside to finish · Shift+Enter for a new line · Esc to cancel');
    case 'delete':
      return t('Click an element to delete it · drag a box to delete everything inside · Esc to finish');
    case 'probe':
      return t('Click a wire to see its voltage or a component for its current · Esc to edit');
    case 'move':
      return tt.refs
        ? t('Click to drop{p0} · right-click or Esc cancels', { p0: tt.stretch ? t(' (wires stretch)') : '' })
        : t('{p0}: click an element or drag a box to choose · Esc to finish', { p0: t('Move (without stretching wires)') });
    case 'shape': {
      const n = tt.pts.length;
      if (tt.shape === 'ARC' && n >= 2) return t('{p0} · right-click cancels', { p0: n === 2 ? t("Click the arc's start point") : t('Click the end point (counterclockwise)') });
      if (n) return t('Click to finish{p0} · right-click cancels', { p0: tt.shape === 'ARC' ? t(" the arc's box") : '' });
      const what = { LINE: t('the line'), RECTANGLE: t('the rectangle'), CIRCLE: t('the circle (its box)'), ARC: t("the arc (its ellipse's box)") }[tt.shape];
      return t('Click to start {what} · Draw › Line style · Esc to finish', { what });
    }
    case 'pencil':
      return t('Drag to draw freehand · Esc to finish');
    case 'zoom':
      return t('Drag a box to zoom (click: zoom in) · Shift+Z: previous zoom');
    case 'pick':
      return tt.what === 'net'
        ? t('Click a wire or pin to choose its net · Esc cancels')
        : tt.what === 'source'
          ? t('Click a V or I source to choose it · Esc cancels')
          : tt.what === 'probe'
            ? t('Click a loop probe (LoopProbe or LoopProbe_Dif) to choose it · Esc cancels')
            : t('Click a component to choose it · Esc cancels');
  }
}
