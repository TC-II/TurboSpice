// Rótulos de los componentes (#28): mover, ocultar, alinear, volver a la posición por defecto,
// rotar/espejar.
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { ORIENTS } from '../../src/asc/model.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { effectiveWindows, makeExplicit } from '../../src/asc/resolve.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';
import { ALIGNS, localAlign, transformAlign } from '../../src/asc/transform.ts';
import { Library } from '../../src/library/library.ts';
import { patchLabels, setWindow, transformItems } from '../../src/schematic/edit.ts';

const lib = new Library(buildBundle());
const lines = (t: string) => t.split(/\r\n|\r|\n/).filter((l) => l.trim());
const save = (doc: ReturnType<typeof parseAsc>) => lines(serializeAsc(makeExplicit(doc, lib).doc));
const R1 = 'Version 4\nSHEET 1 880 680\nSYMBOL res 96 96 R0\nSYMATTR InstName R1\nSYMATTR Value 1k\n';

describe('rótulos de componentes', () => {
  it('un rótulo movido se guarda como WINDOW explícito y se vuelve a leer igual', () => {
    const doc = setWindow(parseAsc(R1), 0, 3, { x: 40, y: 24, align: 'Left', size: 2 });
    const out = save(doc);
    expect(out).toContain('WINDOW 3 40 24 Left 2');
    const again = parseAsc(out.join('\n'));
    expect(effectiveWindows(again.symbols[0], lib.symbol('res'), lib.windowDefaults).get(3)).toEqual({ x: 40, y: 24, align: 'Left', size: 2 });
  });

  it('"Por defecto" deja el .asc como si nunca se hubiera movido', () => {
    const moved = setWindow(parseAsc(R1), 0, 3, { x: 40, y: 24, align: 'Right', size: 4 });
    const reset = patchLabels(moved, [0], new Map([[3, { reset: true }]]), lib);
    expect(save(reset)).toEqual(save(parseAsc(R1)));
    // también sobre un archivo guardado "todo explícito" (WINDOW de todos los rótulos)
    const explicit = parseAsc(save(moved).join('\n'));
    expect(save(patchLabels(explicit, [0], new Map([[3, { reset: true }]]), lib))).toEqual(save(parseAsc(R1)));
  });

  it('ocultar el valor se guarda como WINDOW 3 … Invisible y mostrarlo recupera la alineación', () => {
    const hidden = patchLabels(parseAsc(R1), [0], new Map([[3, { visible: false }]]), lib);
    expect(save(hidden)).toContain('WINDOW 3 36 76 Invisible 2');
    const shown = patchLabels(hidden, [0], new Map([[3, { visible: true }]]), lib);
    expect(save(shown)).toEqual(save(parseAsc(R1)));
  });

  it('alineación (como se ve) y tamaño, también para varios componentes a la vez', () => {
    const doc = parseAsc(`${R1}SYMBOL res 256 96 R90\nSYMATTR InstName R2\n`);
    const out = patchLabels(doc, [0, 1], new Map([[3, { align: 'Right', size: 3 }]]), lib);
    expect(out.symbols[0].windows.get(3)).toMatchObject({ align: 'Right', size: 3 });
    // en R90 el WINDOW guarda la alineación local que se ve como "Right"
    const w = out.symbols[1].windows.get(3)!;
    expect(transformAlign(w.align, 'R90')).toBe('Right');
    expect(w.size).toBe(3);
  });

  it('localAlign es la inversa de transformAlign en todas las orientaciones', () => {
    for (const o of ORIENTS) for (const a of ALIGNS) expect(localAlign(transformAlign(a, o), o)).toBe(a);
  });

  it('al rotar: los rótulos por defecto pasan a los de la nueva orientación, los movidos y ocultos se conservan', () => {
    const base = parseAsc(save(parseAsc(R1)).join('\n')); // todo explícito, como al abrir un archivo guardado
    const rotated = transformItems(base, [{ kind: 'symbol', index: 0 }], 'rotate', lib);
    expect(rotated.symbols[0].orient).toBe('R90');
    expect(rotated.symbols[0].windows.size).toBe(0);
    expect(save(rotated)).toContain('WINDOW 0 0 56 VBottom 2');

    const moved = setWindow(base, 0, 3, { x: 40, y: 24, align: 'Left', size: 2 });
    const hidden = patchLabels(moved, [0], new Map([[0, { visible: false }]]), lib);
    const r = transformItems(hidden, [{ kind: 'symbol', index: 0 }], 'rotate', lib).symbols[0];
    expect(r.windows.get(3)).toEqual({ x: 40, y: 24, align: 'Left', size: 2 });
    expect(r.windows.get(0)).toEqual({ x: 0, y: 56, align: 'Invisible', size: 2 });

    const m = transformItems(moved, [{ kind: 'symbol', index: 0 }], 'mirror', lib).symbols[0];
    expect(m.orient).toBe('M0');
    expect(m.windows.get(3)).toEqual({ x: 40, y: 24, align: 'Left', size: 2 });
  });
});

