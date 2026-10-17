import { useCallback, useState } from 'react';

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

const LIMIT = 200;

/** Estado con deshacer/rehacer. `preview` cambia el presente sin generar historia (arrastres). */
export function useHistory<T>(initial: T) {
  const [h, setH] = useState<History<T>>({ past: [], present: initial, future: [] });

  const commit = useCallback((next: T) => {
    setH((s) => (next === s.present ? s : { past: [...s.past, s.present].slice(-LIMIT), present: next, future: [] }));
  }, []);
  const reset = useCallback((next: T) => setH({ past: [], present: next, future: [] }), []);
  const undo = useCallback(
    () => setH((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s)),
    [],
  );
  const redo = useCallback(
    () => setH((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s)),
    [],
  );

  /** Restaura un historial completo (autoguardado) */
  const restore = useCallback((next: History<T>) => setH(next), []);

  return {
    value: h.present,
    state: h,
    commit,
    reset,
    restore,
    undo,
    redo,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
    version: h.past.length,
  };
}
