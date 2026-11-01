import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadTranslations } from './i18n/i18n.ts';
import { ErrorBoundary } from './ui/ErrorBoundary.tsx';
import './styles.css';

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
