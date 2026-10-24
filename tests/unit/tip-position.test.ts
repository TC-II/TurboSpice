import { describe, expect, it } from 'vitest';
import { tipStyle } from '../../src/schematic/SchematicEditor.tsx';

describe('posición de la cápsula del probe (#249)', () => {
  it('queda a 16 px abajo a la derecha del cursor', () => {
    expect(tipStyle({ x: 100, y: 50, w: 800, h: 600 })).toEqual({ left: 116, right: undefined, top: 66, bottom: undefined });
  });
  it('se da vuelta cerca de los bordes', () => {
    const s = tipStyle({ x: 790, y: 590, w: 800, h: 600 });
    expect(s.right).toBe(26);
    expect(s.bottom).toBe(26);
  });
});
