// Idioma de la interfaz (#72). La app es nativa en inglés: el texto de cada t() es la clave y el
// texto en inglés a la vez; el español sale de es.ts y, si falta una traducción, se ve en inglés.
// El idioma se fija al cargar la página (los textos de nivel de módulo y los bloques de Blockly se
// arman una sola vez): cambiarlo guarda todo y recarga (setLang + location.reload, ver App).
//   t('Saved to Google Drive: {name}', { name })
import { es } from './es.ts';

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
  const s = lang === 'es' ? (es[key] ?? key) : key;
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;
}
