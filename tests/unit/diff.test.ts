import { describe, expect, it } from 'vitest';
import { emptyDoc, type AscDoc, type SymbolInst } from '../../src/asc/model.ts';
import { diffCircuits } from '../../src/project/diff.ts';
import { getLang, setLang } from '../../src/i18n/i18n.ts';

const sym = (inst: string, value: string, x = 0, type = 'res'): SymbolInst => ({ type, x, y: 0, orient: 'R0', windows: new Map(), attrs: new Map([['InstName', inst], ['Value', value]]) });
const doc = (symbols: SymbolInst[], wires = [{ x1: 0, y1: 0, x2: 64, y2: 0 }], text = '.tran 10m'): AscDoc => ({
  ...emptyDoc(),
  symbols,
  wires,
  texts: [{ x: 0, y: 200, align: 'Left', size: 2, kind: 'directive', text }],
});

describe('cambios entre corridas', () => {
  it('agregados, quitados y valores', () => {
    const a = doc([sym('R1', '1k'), sym('R2', '10k')]);
    const b = doc([sym('R1', '2k2'), sym('C3', '1u', 0, 'cap')]);
    const d = diffCircuits(a, b);
    expect(d.summary).toBe('+C3, −R2, R1 1k→2k2');
    expect([...d.symbols]).toEqual([[0, 'changed'], [1, 'added']]);
    expect(d.removed.symbols.map((s) => s.attrs.get('InstName'))).toEqual(['R2']);
    expect(d.same).toBe(false);
  });

  it('renombrar es quitar y agregar; mover se marca', () => {
    expect(diffCircuits(doc([sym('R1', '1k')]), doc([sym('R5', '1k')])).summary).toBe('+R5, −R1');
    expect(diffCircuits(doc([sym('R1', '1k')]), doc([sym('R1', '1k', 32)])).summary).toBe('R1 movido');
  });

  it('el resumen sigue al idioma de la interfaz', () => {
    const before = getLang();
    setLang('en', false);
    try {
      expect(diffCircuits(doc([sym('R1', '1k')]), doc([sym('R1', '1k', 32)])).summary).toBe('R1 moved');
    } finally {
      setLang(before, false);
    }
  });

  it('cables por segmento, sin importar el sentido', () => {
    const a = doc([], [{ x1: 0, y1: 0, x2: 64, y2: 0 }]);
    expect(diffCircuits(a, doc([], [{ x1: 64, y1: 0, x2: 0, y2: 0 }])).same).toBe(true);
    const d = diffCircuits(a, doc([], [{ x1: 0, y1: 0, x2: 64, y2: 0 }, { x1: 0, y1: 0, x2: 0, y2: 64 }]));
    expect(d.summary).toBe('+1 cable');
    expect([...d.wires.keys()]).toEqual([1]);
    expect(diffCircuits(doc([], []), a).summary).toBe('+1 cable');
    expect(diffCircuits(a, doc([], [])).removed.wires).toHaveLength(1);
  });

  it('directivas', () => {
    const d = diffCircuits(doc([]), doc([], undefined, '.tran 20m'));
    expect(d.summary).toBe('directivas');
    expect([...d.texts]).toEqual([[0, 'changed']]);
  });
});
