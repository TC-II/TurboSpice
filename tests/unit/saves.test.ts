// Señales guardadas: todo o sólo lo elegido (#314)
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { Library } from '../../src/library/library.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { addSubckt } from '../../src/project/subckt.ts';
import { newProject } from '../../src/project/turbo.ts';
import { buildSimulation } from '../../src/sim/schematicSim.ts';
import { elementRefs, toggleRefs, savableSignals, saveRefs, saveSelection, setSaveSelection, textRefs } from '../../src/sim/saves.ts';
import { digitalNodes } from '../../src/sim/saves.ts';
import { mergeEvents, sampleEvents } from '../../src/waveform/series.ts';
import { traceResolver } from '../../src/sim/traces.ts';
import { DIGITAL_TYPE } from '../../src/engine/ngspice.ts';
import { evalTrace } from '../../src/waveform/expr.ts';
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

  it('los nodos digitales elegidos van en un comentario aparte y el motor lee sólo esos', () => {
    const doc = setSaveSelection(parseAsc(TB()), ['V(a)', 'Dig(x1.q_3_d)']);
    const c = doc.texts.find((x) => x.kind === 'comment' && x.text.startsWith('.save'))!;
    expect(c.text).toBe('.save Dig(x1.q_3_d)');
    expect(visibleText(c, false)).toBeNull();
    expect(saveSelection(doc.texts)).toEqual(['V(a)', 'Dig(x1.q_3_d)']);
    // sólo digitales: sin directiva .save analógica
    const only = setSaveSelection(parseAsc(TB()), ['Dig(q)']);
    expect(only.texts.some((x) => x.kind === 'directive' && x.text.startsWith('.save'))).toBe(false);
    expect(saveSelection(only.texts)).toEqual(['Dig(q)']);
    expect(digitalNodes('Dig(x1.d[1:0])')).toEqual(expect.arrayContaining(['x1.d_0_d', 'x1.d_1_d']));
  });

  it('un nodo digital queda en sus cambios y V() lo lleva a la grilla', () => {
    const time = Float64Array.of(0, 1, 2, 3, 4);
    const plot = { name: 'tran1', vectors: [
      { name: 'time', type: 1, real: time },
      { name: 'q', type: DIGITAL_TYPE, real: Float64Array.of(0, 1), x: Float64Array.of(0, 2.5) },
    ] };
    const r = traceResolver(null, plot);
    const dig = evalTrace('Dig(q)', { resolve: r, scale: time, scaleName: 'time' });
    expect([...dig.x!]).toEqual([0, 2.5]);
    expect([...evalTrace('V(q)', { resolve: r, scale: time, scaleName: 'time' }).re]).toEqual([0, 0, 0, 1, 1]);
    expect([...evalTrace('Dig(q)*2', { resolve: r, scale: time, scaleName: 'time' }).re]).toEqual([0, 0, 0, 2, 2]);
    expect([...sampleEvents(Float64Array.of(0, 2), Float64Array.of(1, 0), Float64Array.of(1, 2, 3))]).toEqual([1, 0, 0]);
    expect([...mergeEvents([{ x: Float64Array.of(0, 2), y: Float64Array.of(0, 1) }, { x: Float64Array.of(0, 1), y: Float64Array.of(1, 0) }]).x]).toEqual([0, 1, 2]);
  });
});
