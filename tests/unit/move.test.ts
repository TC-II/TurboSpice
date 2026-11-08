import { describe, expect, it } from 'vitest';
import { dropMove } from '../../src/schematic/SchematicEditor.tsx';

describe('soltar con M / S (#222)', () => {
  for (const stretch of [false, true]) {
    it(`un solo click suelta y termina (${stretch ? 'S' : 'M'})`, () => {
      const tool = { kind: 'move' as const, stretch, refs: [{ kind: 'symbol' as const, index: 0 }], start: { x: 0, y: 0 } };
      const r = dropMove(tool, 'doc');
      expect(r.commit).toBe('doc');
      expect(r.selection).toEqual([]);
      expect(r.tool).toEqual({ kind: 'move', stretch, refs: null, start: null });
    });
  }
  it('Ctrl+V: soltar lo pegado vuelve a seleccionar y deja seleccionado lo que no es cable', () => {
    const refs = [
      { kind: 'symbol' as const, index: 2 },
      { kind: 'wire' as const, index: 5 },
    ];
    const r = dropMove({ kind: 'move', stretch: false, refs, start: { x: 0, y: 0 }, base: { symbols: [] } as never }, 'doc');
    expect(r.commit).toBe('doc');
    expect(r.tool).toEqual({ kind: 'select' });
    expect(r.selection).toEqual([{ kind: 'symbol', index: 2 }]);
  });
  it('sin fantasma no confirma nada', () => {
    const r = dropMove({ kind: 'move', stretch: false, refs: [], start: { x: 0, y: 0 } }, null);
    expect(r.commit).toBeNull();
  });
});
