// Historial de corridas de una simulación (#152): columna a la derecha del esquemático. Arriba,
// el circuito actual (sin simular); debajo, cada vez que se simuló, la más nueva primero, con su
// resumen de cambios contra la anterior. Con clic o ↑/↓ el esquemático muestra esa corrida (sólo
// lectura); Restore la trae al presente y Clonar la hace una simulación nueva.
import { useEffect, useRef } from 'react';
import { Icon } from '../ui/icons.tsx';
import type { Run } from './turbo.ts';

/** '' = el circuito actual */
export type HistoryPick = string;

const when = (t: number) => {
  const d = new Date(t);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return sameDay ? `Hoy ${time}` : `${d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' })} ${time}`;
};

export function HistoryPanel({ sim, runs, picked, currentChanges, onPick, onRestore, onClone, onClose }: {
  /** nombre de la simulación */
  sim: string;
  /** la más vieja primero, como en el proyecto */
  runs: Run[];
  picked: HistoryPick;
  /** resumen de lo que cambió el circuito actual desde la última corrida */
  currentChanges?: string;
  onPick(id: HistoryPick): void;
  onRestore(id: string): void;
  onClone(id: string): void;
  onClose(): void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const items: HistoryPick[] = ['', ...runs.filter((r) => !r.damaged).map((r) => r.id).reverse()];
  useEffect(() => list.current?.focus(), []);
  // la elegida, a la vista
  useEffect(() => {
    list.current?.querySelector(`[data-id="${picked || 'current'}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [picked]);
  // la elegida al momento (varias flechas seguidas antes de volver a dibujar avanzan todas)
  const cur = useRef(picked);
  cur.current = picked;
  const move = (d: number) => {
    const i = items.indexOf(cur.current);
    const next = items[Math.min(items.length - 1, Math.max(0, i + d))];
    if (next !== undefined && next !== cur.current) {
      cur.current = next;
      onPick(next);
    }
  };
  const shown = [...runs].reverse();
  return (
    <aside className="history-panel" aria-label={`Historial de ${sim}`}>
      <header>
        <Icon name="clock" size={16} />
        <span className="history-title" title={sim}>{sim}</span>
        <button className="close" onClick={onClose} aria-label="Cerrar el historial" title="Cerrar el historial (Esc)">
          <Icon name="close" size={14} />
        </button>
      </header>
      <div
        className="history-list"
        role="listbox"
        aria-label="Corridas"
        aria-activedescendant={`hist-${picked || 'current'}`}
        tabIndex={0}
        ref={list}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'ArrowDown') e.preventDefault(), move(1);
          else if (e.key === 'ArrowUp') e.preventDefault(), move(-1);
          else if (e.key === 'Home') e.preventDefault(), onPick('');
          else if (e.key === 'End') e.preventDefault(), onPick(items[items.length - 1]);
          else if (e.key === 'Escape') e.preventDefault(), picked ? onPick('') : onClose();
          else if (e.key === 'Enter' && picked) e.preventDefault(), onRestore(picked);
        }}
      >
        <div id="hist-current" data-id="current" role="option" aria-selected={!picked} className={`history-item current${!picked ? ' picked' : ''}`} onClick={() => onPick('')}>
          <span className="history-when">Actual (sin simular)</span>
          <span className="history-sum">{currentChanges && currentChanges !== 'sin cambios' ? currentChanges : runs.length ? 'igual a la última corrida' : 'todavía no se simuló'}</span>
        </div>
        {shown.map((r, i) => {
          const first = i === shown.length - 1;
          return (
            <div
              key={r.id}
              id={`hist-${r.id}`}
              data-id={r.id}
              role="option"
              aria-selected={picked === r.id}
              aria-disabled={r.damaged}
              className={`history-item${picked === r.id ? ' picked' : ''}${r.damaged ? ' damaged' : ''}`}
              title={r.damaged ? 'Esta corrida está dañada en el archivo: no se puede ver' : new Date(r.time).toLocaleString()}
              onClick={() => !r.damaged && onPick(r.id)}
            >
              <span className="history-when">{when(r.time)}</span>
              <span className="history-sum">{r.damaged ? 'dañada' : r.summary || (first ? 'primera corrida' : 'sin cambios')}</span>
              {picked === r.id && (
                <span className="history-actions">
                  <button className="primary" onClick={(e) => (e.stopPropagation(), onRestore(r.id))} title="Traer este circuito al presente: pasa a ser el actual (Ctrl+Z lo deshace)">
                    Restore
                  </button>
                  <button onClick={(e) => (e.stopPropagation(), onClone(r.id))} title="Una simulación nueva con este circuito">
                    Clonar
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="history-hint">↑/↓ para recorrer · Enter: Restore · Esc: volver al actual</p>
    </aside>
  );
}
