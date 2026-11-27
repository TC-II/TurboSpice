import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { circuitInfoOf } from '../../src/app/circuitInfo.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { Library } from '../../src/library/library.ts';
import { connectivity } from '../../src/netlist/connectivity.ts';

const lib = new Library(buildBundle());
// 74HC00 y 74LS00 a transistores: VCC alimenta la red vcc (los pines Vcc), VIN y VIOUT son entradas
const EXAMPLE = readFileSync(new URL('../../examples/logic/nand_hc_ls.asc', import.meta.url), 'utf8');
const supplies = (asc: string) => {
  const doc = parseAsc(asc);
  return circuitInfoOf(
    connectivity(doc, (t) => lib.symbol(t)),
    doc,
    lib,
  ).supplies;
};

describe('circuitInfo', () => {
  it('la alimentación: por el nombre de la fuente, el de su red o un pin Vcc al que llega', () => {
    expect(supplies(EXAMPLE)).toEqual(['VCC']);
    const v1 = EXAMPLE.replace('InstName VCC', 'InstName V1');
    expect(supplies(v1)).toEqual(['V1']);
    // (sin la etiqueta vcc: la red llega a los pines Vcc de los integrados)
    expect(supplies(v1.replace(/^FLAG (\d+ \d+) vcc$/gm, 'FLAG $1 p'))).toEqual(['V1']);
  });
});
