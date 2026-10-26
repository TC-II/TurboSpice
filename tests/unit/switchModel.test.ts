// Switch nativo (#307): la ventana lee y escribe el .model SW del esquemático
import { describe, expect, it } from 'vitest';
import { parseAsc } from '../../src/asc/parse.ts';
import { findSwModel, setSwModel } from '../../src/schematic/switchModel.ts';

const doc = (directive?: string) =>
  parseAsc(`Version 4\nSHEET 1 880 680\nSYMBOL sw 0 0 R0\nSYMATTR InstName S1\nSYMATTR Value SW\n${directive ? `TEXT 0 200 Left 2 !${directive}\n` : ''}`);

describe('.model del switch nativo', () => {
  it('lo encuentra entre las líneas de una directiva', () => {
    const f = findSwModel(doc('.tran 1m\\n.model SW SW(Ron=1 Roff=1Meg Vt=.5 Vh=0)'), 'sw');
    expect(f?.line).toBe(1);
    expect(f?.params).toEqual([['Ron', '1'], ['Roff', '1Meg'], ['Vt', '.5'], ['Vh', '0']]);
    expect(findSwModel(doc('.model SW VSWITCH'), 'SW')?.params).toEqual([]);
    expect(findSwModel(doc(), 'SW')).toBeNull();
  });
  it('reemplaza la línea o agrega una directiva nueva', () => {
    const d = setSwModel(doc('.tran 1m\\n.model SW SW(Ron=1)'), 'SW', [['Ron', '1m'], ['Vt', '1']], { x: 0, y: 0 });
    expect(d.texts.map((t) => t.text)).toEqual(['.tran 1m\\n.model SW SW(Ron=1m Vt=1)']);
    const n = setSwModel(doc(), 'SW', [['Ron', '1m']], { x: 5, y: 6 });
    expect(n.texts).toEqual([{ x: 5, y: 6, align: 'Left', size: 2, kind: 'directive', text: '.model SW SW(Ron=1m)' }]);
  });
});
