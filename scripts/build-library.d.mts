// Tipos de scripts/build-library.mjs para importarlo desde TypeScript (tests y scripts .ts)
import type { LibraryBundle } from '../src/library/library.ts';

export { scanModels } from '../src/library/library.ts';
export declare const MIN_SKIN_STROKE: number;
export declare function normalizeSkin(svg: string): { viewBox: string; body: string };
/** El bundle completo: todas las listas de library/cmp (el sitio separa las de pasivos) y todos los skins */
export declare function buildBundle(): LibraryBundle & Required<Pick<LibraryBundle, 'cmp' | 'skinSets'>>;
