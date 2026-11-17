import { describe, expect, it } from 'vitest';
import { driveChanged } from '../../src/app/useDrive.ts';
import { fetchExample } from '../../src/app/projectFiles.ts';

describe('driveChanged (conflicto al guardar en Drive)', () => {
  it('misma versión: sin conflicto', () => expect(driveChanged('abc', 'abc')).toBe(false));
  it('otra versión: conflicto', () => expect(driveChanged('abc', 'def')).toBe(true));
  it('sin versión conocida (reciente que no se pudo descargar): se pregunta en vez de pisar', () => {
    expect(driveChanged(undefined, 'def')).toBe(true);
    expect(driveChanged('', 'def')).toBe(true);
  });
  it('Drive sin versión: nada que comparar', () => expect(driveChanged(undefined, undefined)).toBe(false));
  it('versión numérica de las versiones viejas: no se compara', () => expect(driveChanged('12', 'def')).toBe(false));
});

describe('fetchExample', () => {
  it('devuelve los bytes si está', async () => {
    const get = (async () => new Response(new Uint8Array([1, 2, 3]))) as typeof fetch;
    expect([...(await fetchExample('a.turbo', get))]).toEqual([1, 2, 3]);
  });
  it('un 404 es un error, no un proyecto', async () => {
    const get = (async () => new Response('<html>', { status: 404 })) as typeof fetch;
    await expect(fetchExample('a.turbo', get)).rejects.toThrow('404');
  });
  it('sin red, el error sale para mostrarlo', async () => {
    const get = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    await expect(fetchExample('a.turbo', get)).rejects.toThrow('Failed to fetch');
  });
});
