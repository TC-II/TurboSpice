import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { GRID, ORIENTS } from '../../src/asc/model.ts';
import { toWorld } from '../../src/asc/transform.ts';
import { Library } from '../../src/library/library.ts';
import { localBox, placementOrigin } from '../../src/schematic/geometry.ts';

const bundle = buildBundle();
const lib = new Library(bundle);
const types = Object.keys(bundle.symbols).map((p) => p.replace(/\.asy$/i, ''));

describe('colocación centrada en el cursor', () => {
  it.each(types)('%s: centro bajo el cursor y pines en la grilla, en las 8 orientaciones', (type) => {
    const def = lib.symbol(type);
    if (!def || (!def.shapes.length && !def.pins.length)) return;
    const b = localBox(def);
    const onGrid = def.pins.every((p) => (p.x - def.pins[0].x) % GRID === 0 && (p.y - def.pins[0].y) % GRID === 0);
    const at = { x: 160, y: -96 };
    for (const orient of ORIENTS) {
      const o = placementOrigin(def, orient, at);
      const inst = { ...o, orient };
      const c = toWorld(inst, (b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2);
      expect(Math.abs(c.x - at.x)).toBeLessThanOrEqual(GRID / 2);
      expect(Math.abs(c.y - at.y)).toBeLessThanOrEqual(GRID / 2);
      if (onGrid) {
        for (const p of def.pins) {
          const w = toWorld(inst, p.x, p.y);
          expect(Math.abs(w.x % GRID) + Math.abs(w.y % GRID)).toBe(0);
        }
      }
    }
  });
});
