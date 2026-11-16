// Reenumerar componentes: orden de lectura, por clicks, y los nombres propios no se tocan
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import type { AscDoc } from '../../src/asc/model.ts';
import { Library } from '../../src/library/library.ts';
import { placeSymbol } from '../../src/schematic/edit.ts';
import { applyRenumber, finishRenumber, renumberAll } from '../../src/schematic/renumber.ts';

const lib = new Library(buildBundle());
const names = (d: AscDoc) => d.symbols.map((s) => s.attrs.get('InstName'));
const rename = (d: AscDoc, i: number, n: string): AscDoc => ({
  ...d,
  symbols: d.symbols.map((s, j) => (j === i ? { ...s, attrs: new Map(s.attrs).set('InstName', n) } : s)),
});

// R1 abajo a la derecha, R2 arriba a la derecha, R3 arriba a la izquierda, C1 abajo a la izquierda
function sample(): AscDoc {
  let d = parseAsc('Version 4\nSHEET 1 880 680\n');
  for (const [type, x, y] of [
    ['res', 400, 400],
    ['res', 400, 0],
    ['res', 0, 16],
    ['cap', 0, 400],
  ] as const)
    d = placeSymbol(d, type, { x, y }, 'R0', lib);
  return d;
}

describe('reenumerar componentes', () => {
  it('ordena de izquierda a derecha y de arriba hacia abajo, por letra', () => {
    const d = sample();
    expect(names(d)).toEqual(['R1', 'R2', 'R3', 'C1']);
    expect(names(renumberAll(d, lib))).toEqual(['R3', 'R2', 'R1', 'C1']);
  });

  it('no toca los nombres propios ni repite uno ocupado', () => {
    let d = rename(sample(), 2, 'RL');
    d = rename(d, 3, 'R_2');
    expect(names(renumberAll(d, lib))).toEqual(['R2', 'R1', 'RL', 'R_2']);
    // un nombre propio con forma de otra letra (una resistencia llamada C1) no se reutiliza
    const c = rename(sample(), 2, 'C1');
    expect(names(renumberAll(c, lib))).toEqual(['R2', 'R1', 'C1', 'C2']);
  });

  it('por clicks: los que faltan quedan como R? y al terminar siguen en orden de lectura', () => {
    const d = sample();
    expect(names(applyRenumber(d, [0], lib, true))).toEqual(['R1', 'R?', 'R?', 'C?']);
    expect(names(finishRenumber(d, [0], lib))).toEqual(['R1', 'R3', 'R2', 'C1']);
  });
});
