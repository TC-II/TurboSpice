// Una función estable que llama siempre a la última versión de `fn` (lo que en React 19 es
// useEffectEvent). Sirve para que un efecto corra sólo cuando cambia lo que lo dispara y, al
// correr, use lo del último render, sin silenciar react-hooks/exhaustive-deps
import { useCallback, useRef } from 'react';

export function useEvent<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  // (en el render, como los fileRef.current = file de la app: un efecto de este render ya la ve)
  ref.current = fn;
  return useCallback((...args: A) => ref.current(...args), []);
}
