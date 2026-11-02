// Comentario que se escribe en el lugar, sobre el esquemático (T, o click en uno seleccionado).
import { useEffect, useRef } from 'react';
import { fontSize, baselineOffset } from './geometry.ts';
import { type InlineText } from './editorTypes.ts';

export function InlineEditor({ it, onChange, onDone }: { it: InlineText; onChange(v: string): void; onDone(save: boolean): void }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // (después del click que lo abrió)
    const id = requestAnimationFrame(() => {
      ta.current?.focus();
      ta.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, []);
  const fs = fontSize(it.size);
  const lines = it.value.split('\n');
  // con caja fija se escribe dentro de la caja, partiendo las líneas como al dibujarlo
  const w = it.box ? it.box.w + fs * 0.2 : (Math.max(4, ...lines.map((l) => l.length)) + 2) * fs * 0.6;
  const h = it.box ? it.box.h + fs * 0.4 : lines.length * fs * 1.2 + fs * 0.4;
  const x = it.align === 'Right' ? it.x - w : it.align === 'Center' ? it.x - w / 2 : it.x;
  // (la primera línea donde la dibuja AlignedText: su celda va de 0.8 fs arriba a 0.2 fs abajo de la línea base)
  const y = it.box ? it.y - fs / 2 - fs * 0.2 : it.align === 'Bottom' ? it.y + baselineOffset('Bottom', fs) + fs * 0.4 - h : it.y + baselineOffset(it.align, fs) - fs * 0.8 - fs * 0.2;
  return (
    <foreignObject x={x} y={y} width={w} height={h} className="inline-text">
      <textarea
        ref={ta}
        value={it.value}
        spellCheck={false}
        wrap={it.box ? 'soft' : 'off'}
        style={{ fontSize: fs, lineHeight: 1.2, textAlign: it.align === 'Right' ? 'right' : it.align === 'Center' ? 'center' : 'left' }}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onDone(true)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onDone(false);
          } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onDone(true);
          }
        }}
      />
    </foreignObject>
  );
}
