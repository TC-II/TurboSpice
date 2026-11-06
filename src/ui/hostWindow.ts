// La ventana donde vive un componente: la principal, o la ventana aparte de los resultados
// (DetachedWindow), que se dibuja con un portal desde la misma app. Los listeners «globales»
// (soltar un arrastre, Esc, clic afuera de un menú) y los portales tienen que ir a ésa.
import { createContext, useContext } from 'react';

// (null = la principal; no se lee `window` al importar: los tests corren sin DOM)
export const HostWindow = createContext<Window | null>(null);

export const useHostWindow = () => useContext(HostWindow) ?? window;

/**
 * La ventana de un elemento. Para lo que se crea con su constructor (ResizeObserver): el de la
 * principal no se entera de los cambios de tamaño en la otra ventana.
 */
export const winOf = (el: Element) => (el.ownerDocument.defaultView ?? window) as typeof window;
