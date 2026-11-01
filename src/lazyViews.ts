// Vistas que se abren a pedido: van en chunks aparte y se bajan la primera vez que se muestran
// (el editor de símbolos y de modelos al entrar a un módulo, el tutorial al abrirlo).
import { lazy } from 'react';

export const SymbolEditor = lazy(() => import('./project/SymbolEditor.tsx').then((m) => ({ default: m.SymbolEditor })));
export const ModelEditor = lazy(() => import('./project/ModelEditor.tsx').then((m) => ({ default: m.ModelEditor })));
export const Tutorial = lazy(() => import('./tutorial/Tutorial.tsx').then((m) => ({ default: m.Tutorial })));
