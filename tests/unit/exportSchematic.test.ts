import { describe, expect, it } from 'vitest';
import { SHEET_GRID, sheetBox } from '../../src/schematic/exportSchematic.ts';

describe('hoja de export (#326)', () => {
  it('ajusta la caja hacia afuera a la grilla de 16 y suma una celda por lado', () => {
    expect(sheetBox({ x: 3, y: -5, w: 100, h: 40 })).toEqual({ x: -16, y: -32, w: 144, h: 96 });
  });

  it('una caja ya en la grilla sólo suma el margen', () => {
    expect(sheetBox({ x: 0, y: 0, w: 64, h: 32 })).toEqual({ x: -16, y: -16, w: 96, h: 64 });
  });

  it('el tamaño es siempre múltiplo de la grilla', () => {
    for (const b of [{ x: -7.5, y: 12.25, w: 33.3, h: 0.1 }, { x: 1000.4, y: -999.9, w: 1, h: 1 }]) {
      const s = sheetBox(b);
      for (const v of [s.x, s.y, s.w, s.h]) expect(Math.abs(v % SHEET_GRID)).toBe(0);
      expect(s.x).toBeLessThanOrEqual(b.x - SHEET_GRID);
      expect(s.x + s.w).toBeGreaterThanOrEqual(b.x + b.w + SHEET_GRID);
    }
  });
});
