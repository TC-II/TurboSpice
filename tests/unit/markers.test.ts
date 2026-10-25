import { describe, expect, it } from 'vitest';
import { addMarker, asMarkers, crossings, delta, horizontalCuts, markerName, markerValue, pickCurve, remapPanes, verticalCuts, type Marker } from '../../src/waveform/markers.ts';

const xs = [0, 1, 2, 3, 4];
const up = { label: 'V(a)', y: [0, 1, 2, 3, 4], axis: 'y' as const };
const tri = { label: 'V(b)', y: [0, 2, 0, 2, 0], axis: 'y' as const };

describe('markers', () => {
  it('numera por tipo y A/D son únicos', () => {
    let list: Marker[] = [];
    list = addMarker(list, { kind: 'm', pane: 0, x: 1, trace: 'V(a)' }).list;
    list = addMarker(list, { kind: 'm', pane: 0, x: 2, trace: 'V(a)' }).list;
    list = addMarker(list, { kind: 'v', pane: 0, x: 2 }).list;
    list = addMarker(list, { kind: 'a', pane: 0, x: 1, trace: 'V(a)' }).list;
    list = addMarker(list, { kind: 'a', pane: 0, x: 3, trace: 'V(a)' }).list;
    expect(list.map(markerName)).toEqual(['M1', 'M2', 'V1', 'A']);
    expect(list.find((m) => m.kind === 'a')!.x).toBe(3);
  });
  it('cruces de un nivel', () => {
    expect(crossings(xs, tri.y, 1)).toEqual([0.5, 1.5, 2.5, 3.5]);
    expect(crossings(xs, tri.y, 2)).toEqual([1, 3]);
    expect(crossings(xs, tri.y, 5)).toEqual([]);
    expect(crossings(xs, [0, null, 2, 0, 2], 1)).toEqual([2.5, 3.5]);
  });
  it('cortes de líneas', () => {
    expect(verticalCuts(1.5, xs, [up, tri]).map((c) => c.y)).toEqual([1.5, 1]);
    expect(horizontalCuts(1, 'y', xs, [up, tri, { ...up, label: 'I', axis: 'i' }])).toEqual([
      { label: 'V(a)', x: 1 },
      ...[0.5, 1.5, 2.5, 3.5].map((x) => ({ label: 'V(b)', x })),
    ]);
  });
  it('valor y delta', () => {
    expect(markerValue({ kind: 'm', id: 1, pane: 0, x: 2.5, trace: 'V(a)' }, xs, [up])).toBe(2.5);
    expect(markerValue({ kind: 'm', id: 1, pane: 0, x: 2.5, trace: 'nada' }, xs, [up])).toBeNaN();
    expect(delta({ x: 1, y: 1 }, { x: 3, y: 5 })).toEqual({ dx: 2, dy: 4, slope: 2, inv: 0.5 });
  });
  it('curva bajo el mouse', () => {
    const toPy = (v: number) => 100 - v * 10;
    expect(pickCurve(xs, [up, tri], 1, 80, toPy)).toBe(1); // tri vale 2 (py 80)
    expect(pickCurve(xs, [up, tri], 1, 89, toPy)).toBe(0);
    expect(pickCurve(xs, [up, tri], 1, 0, toPy)).toBe(-1);
  });
  it('paneles: sacar e intercambiar', () => {
    const l: Marker[] = [
      { kind: 'v', id: 1, pane: 0, x: 1 },
      { kind: 'v', id: 2, pane: 1, x: 1 },
      { kind: 'v', id: 3, pane: 2, x: 1 },
    ];
    expect(remapPanes(l, { remove: 1 }).map((m) => [m.id, m.pane])).toEqual([[1, 0], [3, 1]]);
    expect(remapPanes(l, { swap: [0, 1] }).map((m) => m.pane)).toEqual([1, 0, 2]);
  });
  it('lee lo guardado y descarta lo inválido', () => {
    expect(asMarkers(undefined)).toEqual([]);
    expect(asMarkers([{ kind: 'h', id: 1, pane: 0, y: 2 }, { kind: 'm', id: 1, pane: 0, x: 1 }, { kind: 'z' }, null])).toEqual([{ kind: 'h', id: 1, pane: 0, y: 2, axis: 'y' }]);
  });
});
