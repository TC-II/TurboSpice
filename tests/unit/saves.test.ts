// Señales guardadas: todo o sólo lo elegido (#314)
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { Library } from '../../src/library/library.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { addSubckt } from '../../src/project/subckt.ts';
import { newProject } from '../../src/project/turbo.ts';
import { buildSimulation } from '../../src/sim/schematicSim.ts';
import { elementRefs, toggleRefs, savableSignals, saveRefs, saveSelection, setSaveSelection, textRefs } from '../../src/sim/saves.ts';
import { visibleText } from '../../src/schematic/geometry.ts';

const lib = new Library(buildBundle());

const BUF = `Version 4
SHEET 1 880 680
WIRE -128 0 -96 0
WIRE 96 0 128 0
FLAG -128 0 in
IOPIN -128 0 In
FLAG 128 0 out
IOPIN 128 0 Out
SYMBOL res -96 16 R270
SYMATTR InstName R1
SYMATTR Value 1k
SYMBOL res 16 16 R270
SYMATTR InstName R2
SYMATTR Value 1k
`;

const TB = (extra = '') => `Version 4
SHEET 1 880 680
WIRE -128 0 -200 0
FLAG -200 80 0
FLAG -128 0 a
FLAG 128 0 0
SYMBOL voltage -200 -16 R0
SYMATTR InstName V1
SYMATTR Value SINE(0 1 1k)
SYMBOL BUF 0 0 R0
SYMATTR InstName U1
TEXT 0 100 Left 2 !.tran 1m
${extra}`;

const build = async (asc: string, traces: string[] = []) => {
  const p = addSubckt(newProject('P'), 'BUF', BUF);
  lib.setProjectFiles(p.files);
  try {
    return await buildSimulation(parseAsc(asc), lib, 't', traces);
  } finally {
    lib.setProjectFiles([]);
  }
};

describe('señales guardadas (#314)', () => {
  it('lee las referencias de un .save de LTspice', () => {
    expect(saveRefs('.save V(out) V(a, b) I(R1) Ic(Q1) @Q1[gm]')).toEqual(['V(out)', 'V(a,b)', 'I(R1)', 'Ic(Q1)', '@Q1[gm]']);
    expect(saveSelection([{ kind: 'directive', text: '.tran 1m\\n.save V(out)' }])).toEqual(['V(out)']);
    // .save all o nada: se guarda todo
    expect(saveSelection([{ kind: 'directive', text: '.save all' }])).toBeNull();
    expect(saveSelection([{ kind: 'comment', text: '.save V(out)' }])).toBeNull();
    expect(textRefs('.meas tran x max V(out)-I(R1)*2 trig Ic(Q1)')).toEqual(['V(out)', 'I(R1)', 'Ic(Q1)']);
  });

  it('se escribe en el esquemático como directiva oculta y se saca al volver a «todo»', () => {
    const doc = parseAsc(TB());
    const sel = setSaveSelection(doc, ['V(a)', 'I(V1)']);
    expect(saveSelection(sel.texts)).toEqual(['V(a)', 'I(V1)']);
    const t = sel.texts.find((x) => x.text.startsWith('.save'))!;
    expect(t.kind).toBe('directive');
    expect(visibleText(t, false)).toBeNull();
    expect(setSaveSelection(sel, null).texts).toHaveLength(doc.texts.length);
  });

  it('por defecto, todo con savecurrents', async () => {
    const b = await build(TB());
    expect(b.netlist).toMatch(/\.options savecurrents/);
    expect(b.netlist).not.toMatch(/^\.save /m);
  });

  it('con lo elegido: .save traducido, sin savecurrents, y lo que usan las trazas', async () => {
    const b = await build(TB('TEXT 0 140 Left 2 !.save V(a) I(V1) I(x_u1.r1)\nTEXT 0 180 Left 2 !.meas tran m max V(x_u1.n001)\n'), ['V(x_u1.out)']);
    expect(b.netlist).not.toMatch(/savecurrents/);
    const save = /^\.save (.*)$/m.exec(b.netlist)![1].split(' ');
    expect(save).toEqual(expect.arrayContaining(['a', 'v1#branch', '@r.x_u1.r1[i]', 'x_u1.out', 'x_u1.n001']));
    // el .save de LTspice no llega tal cual
    expect(b.netlist).not.toMatch(/\.save V\(a\)/i);
  });

  it('lista las señales por jerarquía, sin los puertos de las instancias', async () => {
    const b = await build(TB());
    const s = savableSignals(b);
    expect(s.filter((x) => !x.group).map((x) => x.ref)).toEqual(expect.arrayContaining(['V(a)', 'I(V1)']));
    const inner = s.filter((x) => x.group === 'X_U1').map((x) => x.ref);
    expect(inner).toEqual(expect.arrayContaining(['I(X_U1.R1)', 'I(X_U1.R2)']));
    expect(inner.some((r) => /^V\(x_u1\.(in|out)\)$/i.test(r))).toBe(false);
  });

  it('marcar desde el esquemático agrega o saca las referencias', () => {
    expect(elementRefs('Q1', 'Q')).toEqual(['Ic(Q1)', 'Ib(Q1)', 'Ie(Q1)']);
    expect(elementRefs('U1', 'X')).toEqual([]);
    expect(toggleRefs(['V(a)'], ['I(R1)'])).toEqual(['V(a)', 'I(R1)']);
    expect(toggleRefs(['V(a)', 'I(R1)'], ['i(r1)'])).toEqual(['V(a)']);
    expect(toggleRefs(null, ['V(a)'])).toBeNull();
  });
});
