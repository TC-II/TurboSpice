// La escala de píxeles (devicePixelRatio) con la que dibujan los gráficos. uPlot la lee de la
// ventana principal y la guarda en su módulo; sólo la vuelve a leer cuando cambia la media query
// de resolución que arma. Con los resultados en otra ventana (otro monitor, otra escala) hay que
// dibujar con la de ésa: se intercepta matchMedia para tener esas queries y avisarles.
// (se importa antes que uPlot, en main.tsx)

const queries: MediaQueryList[] = [];
const own = window.matchMedia.bind(window);
window.matchMedia = (q: string) => {
  const mq = own(q);
  if (q.includes('dppx')) queries.push(mq);
  return mq;
};

// (según el navegador es propia de window o de Window.prototype)
const original = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');

/** Dibujar con la escala de `win` (null = la de la principal) */
export function setPixelRatioOf(win: Window | null) {
  if (win) Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => win.devicePixelRatio });
  else if (original) Object.defineProperty(window, 'devicePixelRatio', original);
  else delete (window as { devicePixelRatio?: number }).devicePixelRatio;
  // uPlot se vuelve a suscribir con una query nueva: las viejas ya no sirven
  queries.splice(0).forEach((mq) => mq.dispatchEvent(new Event('change')));
}
