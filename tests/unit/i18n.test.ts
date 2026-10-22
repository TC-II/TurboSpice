import { afterEach, describe, expect, it } from 'vitest';
import { es } from '../../src/i18n/es.ts';
import { getLang, setLang, t } from '../../src/i18n/i18n.ts';

afterEach(() => setLang('es', false));

describe('idioma de la interfaz (#72)', () => {
  it('en inglés la clave es el texto, con sus parámetros', () => {
    setLang('en', false);
    expect(getLang()).toBe('en');
    expect(t('Saved to Google Drive: {name}', { name: 'x.turbo' })).toBe('Saved to Google Drive: x.turbo');
  });

  it('en español usa es.ts; lo que falta se ve en inglés', () => {
    setLang('es', false);
    expect(t('Simulate')).toBe('Simular');
    expect(t('Saved to Google Drive: {name}', { name: 'x.turbo' })).toBe('Guardado en Google Drive: x.turbo');
    expect(t('A text nobody translated')).toBe('A text nobody translated');
  });

  it('las llaves que no son parámetros quedan como están', () => {
    setLang('en', false);
    expect(t('Use it in a value as {nombre}')).toBe('Use it in a value as {nombre}');
    expect(t('Original value: {original} (becomes {{name}})', { original: '1k', name: 'R' })).toBe('Original value: 1k (becomes {R})');
  });

  it('cada traducción tiene los mismos parámetros que su texto en inglés', () => {
    const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const bad = Object.entries(es).filter(([en, sp]) => params(en).join() !== params(sp).join());
    expect(bad).toEqual([]);
  });

  it('ninguna traducción está vacía', () => {
    expect(Object.entries(es).filter(([, sp]) => !sp.trim())).toEqual([]);
  });
});
