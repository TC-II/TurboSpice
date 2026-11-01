// Idioma de la interfaz (#72). La app es nativa en inglés: el texto de cada t() es la clave y el
// texto en inglés a la vez; el español sale de es.ts y, si falta una traducción, se ve en inglés.
// El idioma se fija al cargar la página (los textos de nivel de módulo y los bloques de Blockly se
// arman una sola vez): cambiarlo guarda todo y recarga (setLang + location.reload, ver App).
//   t('Saved to Google Drive: {name}', { name })

export type Lang = 'en' | 'es';
export const LANGS: Lang[] = ['en', 'es'];
const KEY = 'turbospice.lang';

function stored(): Lang {
  try {
    return localStorage.getItem(KEY) === 'es' ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

let lang: Lang = stored();
/** Las traducciones al español: van en un chunk aparte y se bajan sólo si hacen falta */
let es: Record<string, string> = {};

/**
 * Carga las traducciones del idioma elegido. main.tsx la espera antes de importar la app (que
 * arma textos a nivel de módulo) y tests/setup-i18n.ts antes de los tests.
 */
export async function loadTranslations(): Promise<void> {
  if (lang === 'es' && !Object.keys(es).length) es = (await import('./es.ts')).es;
}
if (typeof document !== 'undefined') document.documentElement.lang = lang;

export const getLang = () => lang;

/** Idioma para fechas y números (toLocaleString): el de la interfaz, no el del navegador */
export const locale = () => (lang === 'es' ? 'es-AR' : 'en-US');

/** Cambia el idioma (y lo recuerda, salvo `persist: false`, que usan los tests) */
export function setLang(l: Lang, persist = true) {
  lang = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  if (!persist) return;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    // sin almacenamiento: vale para esta página
  }
}

/** Texto en el idioma elegido; `{nombre}` se reemplaza por params.nombre (si está) */
export function t(key: string, params?: Record<string, unknown>): string {
  // «Run|verb»: el mismo texto en inglés con otra traducción; lo de después de | no se muestra
  const s = lang === 'es' ? (es[key] ?? key.replace(/\|\w+$/, '')) : key.replace(/\|\w+$/, '');
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;
}
