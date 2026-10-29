import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import { Library } from '../../src/library/library.ts';
import { ltNetlist, ltNetlistText } from '../../src/netlist/ltnetlist.ts';
import { toNgspice } from '../../src/netlist/tongspice.ts';
import { findAnalysis, findControl, replaceAnalysis } from '../../src/schematic/directivesEdit.ts';
import { ANALYSES, defaultAnalysis, formatAnalysis, parseAnalysis, validateAnalysis } from '../../src/sim/analyses.ts';
import { controlBlock, controlBody } from '../../src/sim/controlSnippets.ts';

const lib = new Library(buildBundle());

describe('comandos de análisis', () => {
  it.each([
    '.tran 10m',
    '.tran 0 10m 1m 1u',
    '.tran 1u 10m 0 0 uic',
    '.tran 0 10m 0 1u startup',
    '.tran 10m uic startup',
    '.ac dec 100 1 1meg',
    '.ac lin 50 1k 2k',
    '.dc V1 0 5 0.1',
    '.dc V1 0 10 0.5 I1 1m 5m 1m',
    '.noise V(out) V1 dec 20 10 10meg',
    '.noise V(out,ref) V1 oct 10 1 1k',
    '.op',
    '.tf V(out) V1',
    '.sens V(out)',
    '.sens V(out) ac dec 10 1 1k',
    '.pz in 0 out 0 vol pz',
    '.disto dec 10 1k 100k 0.9',
    '.sp dec 10 1meg 1g 1',
  ])('%s: leer → generar da la misma línea', (line) => {
    const a = parseAnalysis(line);
    expect(a).not.toBeNull();
    expect(formatAnalysis(a!)).toBe(line);
  });

  it('las opciones que el formulario no maneja no se interpretan', () => {
    expect(parseAnalysis('.tran 10m steady')).toBeNull();
    // a un .ac le falta el fin: se lee con esa caja vacía (en rojo en la barra)
    expect(parseAnalysis('.ac dec 10 1')).toMatchObject({ kind: 'ac', sweep: { points: '10', start: '1', stop: '' } });
  });

  it('todos los análisis por defecto (salvo los que piden nodos) son válidos', () => {
    for (const { kind } of ANALYSES) {
      const errs = validateAnalysis(defaultAnalysis(kind));
      if (['dc', 'noise', 'tf', 'sens', 'pz', 'stb'].includes(kind)) expect(errs.length).toBeGreaterThan(0);
      else expect(errs).toEqual([]);
    }
    expect(validateAnalysis({ ...defaultAnalysis('tran'), tstop: 'abc' } as never)).toHaveLength(1);
  });
});

const ASC = (texts: string) => `Version 4
SHEET 1 880 680
WIRE 16 16 0 16
FLAG 16 96 0
FLAG 0 16 in
SYMBOL res 0 0 R0
SYMATTR InstName R1
SYMATTR Value 1k
${texts}`;

describe('directivas de ngspice guardadas como comentario', () => {
  it('se ejecutan en ngspice y quedan como comentario en la netlist de LTspice', () => {
    const doc = parseAsc(ASC('TEXT 0 200 Left 2 ;.control\\nrun\\nprint mean(v(in))\\n.endc\nTEXT 0 260 Left 2 ;.pz in 0 in 0 vol pz\nTEXT 0 300 Left 2 ;.step param R 1 2 1\n'));
    const ng = toNgspice(ltNetlist(doc, lib), 't', { resolve: () => undefined });
    expect(ng.text).toContain('.control\nrun\nprint mean(v(in))\n.endc');
    expect(ng.text).toMatch(/^\.pz in 0 in 0 vol pz$/m);
    // un comentario común sigue siendo comentario
    expect(ng.text).toContain('* .step param R 1 2 1');
    const lt = ltNetlistText(ltNetlist(doc, lib));
    expect(lt).toContain('* .control');
    expect(lt).toContain('* .pz in 0 in 0 vol pz');
  });

  it('ubica y reemplaza el análisis y el bloque .control', () => {
    const doc = parseAsc(ASC('TEXT 0 200 Left 2 !.param k=1\\n.tran 10m\nTEXT 0 260 Left 2 ;.control\\nrun\\n.endc\n'));
    const found = findAnalysis(doc)!;
    expect(found).toEqual({ text: 0, line: 1, value: '.tran 10m' });
    // mismo tipo: se reemplaza la línea
    expect(replaceAnalysis(doc, found, '.ac dec 10 1 1k', false).texts[0].text).toBe('.param k=1\\n.ac dec 10 1 1k');
    // pasa a ser de ngspice: sale del texto y queda como comentario aparte
    const pz = replaceAnalysis(doc, found, '.pz in 0 in 0 vol pz', true);
    expect(pz.texts[0].text).toBe('.param k=1');
    expect(pz.texts.at(-1)).toMatchObject({ kind: 'comment', text: '.pz in 0 in 0 vol pz' });
    expect(findControl(doc)).toBe(1);
    expect(controlBody(doc.texts[1].text.split('\\n').join('\n'))).toBe('run');
    expect(controlBlock('run\nlet x = 1')).toBe('.control\nrun\nlet x = 1\n.endc');
  });
});
