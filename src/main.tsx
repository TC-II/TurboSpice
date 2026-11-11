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
loadTranslations()
  .then(() => import('./App.tsx'))
  .then(({ App }) =>
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ErrorBoundary scope="app">
          <App />
        </ErrorBoundary>
      </StrictMode>,
    ),
  );
