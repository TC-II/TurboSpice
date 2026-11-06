// La ventana donde vive un componente: la principal, o la ventana aparte de los resultados
// (DetachedWindow), que se dibuja con un portal desde la misma app. Los listeners «globales»
// (soltar un arrastre, Esc, clic afuera de un menú) y los portales tienen que ir a ésa.
import { createContext, useContext } from 'react';

// (null = la principal; no se lee `window` al importar: los tests corren sin DOM)
export const HostWindow = createContext<Window | null>(null);

export const useHostWindow = () => useContext(HostWindow) ?? window;
