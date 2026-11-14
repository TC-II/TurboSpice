import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadTranslations } from './i18n/i18n.ts';
import { ErrorBoundary } from './ui/ErrorBoundary.tsx';
import '@fontsource-variable/ibm-plex-sans/wght.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-ext-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-ext-500.css';
import './styles.css';
// (antes que uPlot)
import './ui/pixelRatio.ts';

// las traducciones (si la interfaz no está en inglés) antes que la app: hay textos que se arman
// al importar los módulos
// pantalla de arranque fallido de index.html (sin ella, p. ej. en los tests, no hace nada)
const boot = (window as { __turboBoot?: { ok(): void; fail(err: unknown): void } }).__turboBoot;
const RELOADED = 'turbospice.bootReload';

// Un chunk que no baja suele ser un index viejo en caché tras un deploy (los archivos con hash del
// build anterior ya no existen): se recarga una sola vez; si vuelve a fallar, se muestra el error.
function failed(err: unknown) {
  try {
    if (!sessionStorage.getItem(RELOADED)) {
      sessionStorage.setItem(RELOADED, '1');
      location.reload();
      return;
    }
  } catch {}
  boot?.fail(err);
}

window.addEventListener('vite:preloadError', (ev) => {
  ev.preventDefault();
  failed((ev as Event & { payload?: unknown }).payload);
});

loadTranslations()
  .then(() => import('./App.tsx'))
  .then(({ App }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ErrorBoundary scope="app">
          <App />
        </ErrorBoundary>
      </StrictMode>,
    );
    boot?.ok();
    try {
      sessionStorage.removeItem(RELOADED);
    } catch {}
  })
  .catch(failed);
