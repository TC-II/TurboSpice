// Autoguardado: si el almacenamiento falla, saveProjectSession lo informa (false) en vez de callar
import { describe, expect, it } from 'vitest';
import { saveProjectSession } from '../../src/schematic/autosave.ts';

describe('saveProjectSession', () => {
  it('devuelve false cuando IndexedDB no está disponible', async () => {
    expect((globalThis as { indexedDB?: unknown }).indexedDB).toBeUndefined();
    expect(await saveProjectSession({ name: 'x.turbo', turbo: '', dirty: false, time: 1 })).toBe(false);
  });
});
