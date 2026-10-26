// Un rótulo oculto («Invisible» no guarda la alineación) vuelve a verse girado como el componente,
// no con 'Left' sin girar (un C en R90 mostraba su SpiceLine en vertical)
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { Library } from '../../src/library/library.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { patchLabels } from '../../src/schematic/edit.ts';
import { labelRows } from '../../src/schematic/dialogs.tsx';

const lib = new Library(buildBundle());
const cap = (orient: string) =>
  parseAsc(`Version 4\nSHEET 1 880 680\nSYMBOL cap 0 0 ${orient}\nSYMATTR InstName C1\nSYMATTR Value 1u\nSYMATTR SpiceLine IC=1\n`);

describe('rótulo oculto que se vuelve a mostrar', () => {
  for (const [orient, local] of [['R0', 'Left'], ['R90', 'VTop']] as const) {
    it(`${orient}: con la orientación del valor`, () => {
      let d = cap(orient);
      d = patchLabels(d, [0], new Map([[39, { visible: true, create: { x: 56, y: 32, align: local, size: 2 } }]]), lib);
      d = patchLabels(d, [0], new Map([[39, { visible: false }]]), lib);
      d = patchLabels(d, [0], new Map([[39, { visible: true }]]), lib);
      const rows = labelRows(d.symbols[0], lib.symbol('cap'), lib.windowDefaults);
      expect(d.symbols[0].windows.get(39)?.align).toBe(local);
      expect(rows.find((r) => r.win === 39)?.align).toBe(rows.find((r) => r.win === 3)?.align);
    });
  }
});
