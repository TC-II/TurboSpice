// uPlot y los visores que lo usan se cargan aparte (#195): recién hacen falta al simular. Se
// precargan cuando la app queda ociosa, así el primer gráfico no espera la descarga.
import { lazy } from 'react';

const plotPanel = () => import('./PlotPanel.tsx');
const plot = () => import('./Plot.tsx');

export const PlotPanel = lazy(() => plotPanel().then((m) => ({ default: m.PlotPanel })));
export const Plot = lazy(() => plot().then((m) => ({ default: m.Plot })));

/** Baja los visores cuando el navegador está ocioso (una sola vez) */
let preloaded = false;
export function preloadPlots(): void {
  if (preloaded) return;
  preloaded = true;
  const go = () => void Promise.all([plotPanel(), plot()]).catch(() => (preloaded = false));
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 5000 });
  else setTimeout(go, 2000);
}
