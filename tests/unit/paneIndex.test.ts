import { describe, expect, it } from 'vitest';
import { movePane, remapList, remapRecord } from '../../src/waveform/paneIndex.ts';

describe('reindexado por panel', () => {
  const rec = { 0: 'a', 1: 'b', 3: 'd' };
  it('quitar: descarta el panel y sube los de abajo', () => {
    expect(remapRecord(rec, { remove: 1 })).toEqual({ 0: 'a', 2: 'd' });
    expect(movePane(1, { remove: 1 })).toBeNull();
  });
  it('insertar: baja los que están en el lugar y después', () => {
    expect(remapRecord(rec, { insert: 1 })).toEqual({ 0: 'a', 2: 'b', 4: 'd' });
    expect(remapRecord(rec, { insert: 4 })).toEqual(rec);
  });
  it('intercambiar: sólo los dos paneles', () => {
    expect(remapRecord(rec, { swap: [1, 3] })).toEqual({ 0: 'a', 3: 'b', 1: 'd' });
  });
  it('lista con pane (markers)', () => {
    const l = [{ pane: 0 }, { pane: 2 }];
    expect(remapList(l, { insert: 0 })).toEqual([{ pane: 1 }, { pane: 3 }]);
    expect(remapList(l, { remove: 0 })).toEqual([{ pane: 1 }]);
  });
});
