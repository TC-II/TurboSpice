import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';
import { Library } from '../../src/library/library.ts';
import { ltNetlist } from '../../src/netlist/ltnetlist.ts';
import { controlRunWarnings, controlUsesRun, toNgspice } from '../../src/netlist/tongspice.ts';
import { lineOf } from '../../src/project/project.ts';
import { findAnalysis, setAnalysisLine } from '../../src/schematic/directivesEdit.ts';
import { COMPLEX_LINE, controlText, hasParkedControl, isComplex, parkControl, simLine, unparkControl } from '../../src/sim/complexSim.ts';
import { analysisLabel } from '../../src/sim/simList.ts';

const lib = new Library(buildBundle());

const ASC = (texts: string) => `Version 4
SHEET 1 880 680
WIRE 16 16 0 16
FLAG 16 96 0
FLAG 0 16 in
SYMBOL res 0 0 R0
SYMATTR InstName R1
SYMATTR Value 1k
${texts}`;

const OWN = 'TEXT 0 260 Left 2 ;.control\\ntran 1u 1m\\nprint v(in)\\n.endc\n';
const TRAN = 'TEXT 0 200 Left 2 !.tran 10m\n';
const ng = (asc: string) => toNgspice(ltNetlist(parseAsc(asc), lib), 't', { resolve: () => undefined });

describe('Complex simulation (#241)', () => {
  it('un .control que decide la simulación hace Complex al testbench', () => {
    const doc = parseAsc(ASC(TRAN + OWN));
    expect(isComplex(doc)).toBe(true);
    expect(simLine(doc)).toBe(COMPLEX_LINE);
    expect(lineOf(ASC(TRAN + OWN))).toBe(COMPLEX_LINE);
    expect(analysisLabel(COMPLEX_LINE)).toBe('Simulación compleja');
    expect(controlText(doc)).toBe('.control\ntran 1u 1m\nprint v(in)\n.endc');
    // sin .control: el análisis de siempre
    expect(simLine(parseAsc(ASC(TRAN)))).toBe('.tran 10m');
  });

  it('un .control con marcas de sección no es Complex (se combina con el análisis)', () => {
    const hooks = 'TEXT 0 260 Left 2 ;.control\\n* después de cada corrida\\nprint v(in)\\n.endc\n';
    expect(simLine(parseAsc(ASC(TRAN + hooks)))).toBe('.tran 10m');
  });

  it('el .control sin run reemplaza al análisis del testbench en la netlist', () => {
    const r = ng(ASC(TRAN + OWN));
    expect(r.text).toMatch(/^\* \.tran 10m$/m);
    expect(r.text).not.toMatch(/^\.tran 10m$/m);
    expect(r.text).toContain('.control\ntran 1u 1m\nprint v(in)\n.endc');
    expect(r.warnings.join()).not.toMatch(/own analysis/);
  });

  it('con run el análisis del testbench se emite (es lo que corre run)', () => {
    const r = ng(ASC(TRAN + 'TEXT 0 260 Left 2 ;.control\\nrun\\n.endc\n'));
    expect(r.text).toMatch(/^\.tran \S+ 10m$/m);
    expect(controlUsesRun(['  run ; comentario'])).toBe(true);
    expect(controlUsesRun(['tran 1u 1m'])).toBe(false);
    expect(controlRunWarnings(['tran 1u 1m'], false)).toEqual([]);
  });

  it('pasar a un análisis simple y volver no pierde el .control', () => {
    const doc = parseAsc(ASC(TRAN + OWN));
    const simple = setAnalysisLine(parkControl(doc), '.ac dec 10 1 1k');
    expect(isComplex(simple)).toBe(false);
    expect(hasParkedControl(simple)).toBe(true);
    expect(simLine(simple)).toBe('.ac dec 10 1 1k');
    // guardado en el .asc y leído de vuelta
    const reread = parseAsc(serializeAsc(simple));
    expect(hasParkedControl(reread)).toBe(true);
    // el .control guardado no se ejecuta
    expect(ng(serializeAsc(simple)).text).not.toContain('.endc');
    const back = unparkControl(reread);
    expect(isComplex(back)).toBe(true);
    expect(hasParkedControl(back)).toBe(false);
    expect(controlText(back)).toBe(controlText(doc));
    // el análisis simple elegido queda (para LTspice y para volver a él)
    expect(findAnalysis(back)?.value).toBe('.ac dec 10 1 1k');
  });

  it('sin .control guardado, parkControl/unparkControl no cambian nada', () => {
    const doc = parseAsc(ASC(TRAN));
    expect(parkControl(doc)).toBe(doc);
    expect(unparkControl(doc)).toBe(doc);
  });
});
