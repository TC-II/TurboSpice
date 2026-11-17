// Pila de diálogos abiertos: con varios apilados, Escape sólo cierra el de más arriba
const stack: symbol[] = [];

/** Registra un diálogo visible; devuelve la función que lo saca de la pila */
export function pushModal(id: symbol): () => void {
  stack.push(id);
  return () => {
    const i = stack.indexOf(id);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** ¿Es `id` el diálogo de más arriba? */
export const isTopModal = (id: symbol): boolean => stack[stack.length - 1] === id;
