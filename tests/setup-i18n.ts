// Los tests unitarios fijan el idioma (#72): los mensajes que verifican están en español.
// Los que prueban el inglés lo cambian con setLang('en', false).
import { setLang } from '../src/i18n/i18n.ts';

setLang('es', false);
