import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import { effectiveAttrs } from '../../src/asc/resolve.ts';
import { Library } from '../../src/library/library.ts';
import { ltNetlist } from '../../src/netlist/ltnetlist.ts';
import { toNgspice } from '../../src/netlist/tongspice.ts';
import { applyStudy, emptyStudy, measureLines, studyFromDoc, type Study, type StudyMeasure } from '../../src/sim/study.ts';
import { parseMeas } from '../../src/sim/meas.ts';

const lib = new Library(buildBundle());
// divisor resistivo con una fuente
const DOC = parseAsc(`Version 4
SHEET 1 880 680
WIRE 0 16 0 0
WIRE 0 0 96 0
WIRE 96 0 96 16
FLAG 0 96 0
FLAG 96 192 0
FLAG 96 96 out
SYMBOL voltage 0 0 R0
SYMATTR InstName V1
SYMATTR Value 1
SYMBOL res 80 0 R0
SYMATTR InstName R1
SYMATTR Value 1k
SYMBOL res 80 96 R0
SYMATTR InstName R2
SYMATTR Value 2k
TEXT 0 240 Left 2 !.tran 1m
`);
/** Tarjetas reconstruidas, sin los análisis (el .tran del documento) */
const cards = (doc: typeof DOC) => {
  const { analyses: _, ...rest } = studyFromDoc(doc, lib);
  return rest;
};
const value = (doc: typeof DOC, name: string) =>
  doc.symbols.map((s) => effectiveAttrs(s, lib.symbol(s.type))).find((a) => a.get('InstName') === name)?.get('Value');

describe('Estudio: tarjetas ↔ directivas', () => {
  it('barridos: componente, parámetro, fuente, temperatura, modelo; activos y desactivados', () => {
    const st: Study = {
      ...emptyStudy(),
      sweeps: [
        { target: { kind: 'component', name: 'R1' }, mode: 'list', list: '1k 2k 5k', start: '', stop: '', step: '', enabled: true, original: '1k' },
        { target: { kind: 'source', name: 'V1' }, mode: 'lin', list: '', start: '0', stop: '5', step: '1', enabled: true },
        { target: { kind: 'temp' }, mode: 'lin', list: '', start: '-40', stop: '85', step: '25', enabled: false },
        { target: { kind: 'param', name: 'k' }, mode: 'dec', list: '', start: '1', stop: '100', step: '5', enabled: true },
        { target: { kind: 'model', model: '2N2222', param: 'BF' }, mode: 'list', list: '50 100', start: '', stop: '', step: '', enabled: true },
      ],
    };
    const doc = applyStudy(DOC, lib, st);
    expect(value(doc, 'R1')).toBe('{R1}');
    const dir = doc.texts.find((t) => t.kind === 'directive' && t.text.includes('.step'))!.text.split('\\n');
    expect(dir).toEqual(['.param R1=1k', '.step param R1 list 1k 2k 5k', '.step V1 0 5 1', '.step dec param k 1 100 5', '.step 2N2222(BF) list 50 100']);
    expect(doc.texts.find((t) => t.kind === 'comment')!.text).toBe('.step temp -40 85 25');
    expect(cards(doc)).toEqual({ ...st, sweeps: [st.sweeps[0], st.sweeps[1], st.sweeps[3], st.sweeps[4], st.sweeps[2]] });
    // al quitar el barrido del componente vuelve su valor original y desaparecen sus directivas
    const back = applyStudy(doc, lib, emptyStudy());
    expect(value(back, 'R1')).toBe('1k');
    expect(back.texts.map((t) => t.text)).toEqual(['.tran 1m']);
  });

  it('tolerancias: Monte Carlo (uniforme y normal) y caso peor', () => {
    const items = [
      { component: 'R1', tol: '5', dist: 'uniform' as const, original: '1k' },
      { component: 'R2', tol: '1', dist: 'gauss' as const, original: '2k' },
    ];
    const mc: Study = { ...emptyStudy(), tolerance: { enabled: true, mode: 'montecarlo', runs: '100', items } };
    const doc = applyStudy(DOC, lib, mc);
    expect(value(doc, 'R1')).toBe('{mc(1k,0.05)}');
    expect(value(doc, 'R2')).toBe('{2k*(1+gauss(0.01/3))}');
    expect(doc.texts.some((t) => t.text.includes('.step param run 1 100 1'))).toBe(true);
    expect(cards(doc)).toEqual(mc);
    const wc: Study = { ...emptyStudy(), tolerance: { enabled: true, mode: 'worst', runs: '4', items: items.map((i) => ({ ...i, dist: 'uniform' as const })) } };
    const doc2 = applyStudy(DOC, lib, wc);
    expect(value(doc2, 'R2')).toBe('{2k*(1+0.01*(2*binary(run,1)-1))}');
    expect(doc2.texts.find((t) => t.text.includes('binary'))!.text).toContain('.step param run 0 3 1');
    expect(cards(doc2)).toEqual(wc);
    expect(value(applyStudy(doc2, lib, emptyStudy()), 'R2')).toBe('2k');
  });

  it('mediciones: cada tipo genera .meas válidos y se reconoce de vuelta', () => {
    const ms: StudyMeasure[] = [
      { enabled: true, name: 'vmax', analysis: 'tran', kind: 'max', signal: 'V(out)', from: '1m', to: '2m' },
      { enabled: true, name: 'vrms', analysis: 'tran', kind: 'rms', signal: 'V(out)' },
      { enabled: true, name: 'v1m', analysis: 'tran', kind: 'at', signal: 'V(out)', at: '1m' },
      { enabled: true, name: 'tr', analysis: 'tran', kind: 'rise', signal: 'V(out)', level: '0.1', level2: '0.9' },
      { enabled: true, name: 'tf', analysis: 'tran', kind: 'fall', signal: 'V(out)', level: '0.9', level2: '0.1' },
      { enabled: true, name: 'td', analysis: 'tran', kind: 'delay', signal: 'V(in)', signal2: 'V(out)', level: '0.5', level2: '0.5' },
      { enabled: true, name: 'per', analysis: 'tran', kind: 'period', signal: 'V(out)', level: '0' },
      { enabled: true, name: 'f', analysis: 'tran', kind: 'freq', signal: 'V(out)', level: '0' },
      { enabled: true, name: 'g1k', analysis: 'ac', kind: 'gainAt', signal: 'V(out)', at: '1k' },
      { enabled: true, name: 'fc', analysis: 'ac', kind: 'f3db', signal: 'V(out)' },
      { enabled: true, name: 'fu', analysis: 'ac', kind: 'f0db', signal: 'V(out)' },
      { enabled: true, name: 'pm', analysis: 'ac', kind: 'phaseMargin', signal: 'V(out)' },
      { enabled: false, name: 'amax', analysis: 'ac', kind: 'max', signal: 'V(out)' },
      { enabled: true, name: 'n', analysis: 'noise', kind: 'noise', signal: 'V(onoise)', from: '10', to: '20k' },
      { enabled: true, name: 'x', analysis: 'tran', kind: 'raw', signal: '', line: '.meas tran x PARAM vmax*2' },
    ];
    for (const m of ms) for (const l of measureLines(m)) expect(typeof parseMeas(l), l).not.toBe('string');
    const st: Study = { ...emptyStudy(), measures: ms };
    const back = studyFromDoc(applyStudy(DOC, lib, st), lib);
    // las desactivadas quedan al final (texto comentado)
    expect(back.measures).toEqual([...ms.filter((m) => m.enabled), ...ms.filter((m) => !m.enabled)]);
  });

  it('archivo de LTspice con .step y .meas escritos a mano', () => {
    const doc = parseAsc(DOC_TEXT_WITH(`TEXT 0 300 Left 2 !.param R=1k\\n.step param R list 500 1k 2k\\n.meas tran tsub TRIG V(out) VAL=0.1 RISE=1 TARG V(out) VAL=0.9 RISE=1\\n.meas tran raro AVG V(out)*I(R1) FROM 1m TO 2m`));
    const st = studyFromDoc(doc, lib);
    expect(st.sweeps).toEqual([{ target: { kind: 'param', name: 'R' }, mode: 'list', list: '500 1k 2k', start: '', stop: '', step: '', enabled: true, original: undefined }]);
    expect(st.measures.map((m) => m.kind)).toEqual(['rise', 'avg']);
    expect(st.measures[1]).toMatchObject({ signal: 'V(out)*I(R1)', from: '1m', to: '2m' });
    // reaplicar sin cambios no altera lo que simula
    const again = applyStudy(doc, lib, st);
    const ng = (d: typeof doc) => toNgspice(ltNetlist(d, lib), 't', { resolve: () => undefined }).text.split('\n').filter((l) => !l.startsWith('*')).sort();
    expect(ng(again)).toEqual(ng(doc));
  });

  it('paso personalizado: bloque completo o combinado con los barridos', () => {
    const full: Study = { ...emptyStudy(), custom: { mode: 'full', body: 'run\nprint v(out)', before: '', after: '', final: '' } };
    const doc = applyStudy(DOC, lib, full);
    expect(doc.texts.find((t) => t.kind === 'comment')!.text).toBe('.control\\nrun\\nprint v(out)\\n.endc');
    expect(studyFromDoc(doc, lib).custom).toEqual(full.custom);
    expect(applyStudy(doc, lib, emptyStudy()).texts.some((t) => t.text.includes('.control'))).toBe(false);
    // combinado: los comandos van dentro de los bucles del .step
    const hooks: Study = {
      ...emptyStudy(),
      sweeps: [{ target: { kind: 'component', name: 'R1' }, mode: 'list', list: '1k 2k', start: '', stop: '', step: '', enabled: true, original: '1k' }],
      custom: { mode: 'hooks', body: '', before: 'echo empieza', after: 'print v(out)', final: 'echo fin' },
    };
    const d2 = applyStudy(DOC, lib, hooks);
    expect(cards(d2)).toEqual(hooks);
    const ng = toNgspice(ltNetlist(d2, lib), 't', { resolve: () => undefined });
    expect(ng.text).toContain('.control\nforeach ts_step0 1000 2000\n  alterparam R1 = $ts_step0\n  reset\n  echo empieza\n  run\n  print v(out)\nend\necho fin\n.endc');
    expect(ng.warnings).toEqual([]);
  });
});

function DOC_TEXT_WITH(extra: string) {
  return `Version 4
SHEET 1 880 680
WIRE 0 16 0 0
WIRE 0 0 96 0
WIRE 96 0 96 16
FLAG 0 96 0
FLAG 96 192 0
FLAG 96 96 out
SYMBOL voltage 0 0 R0
SYMATTR InstName V1
SYMATTR Value 1
SYMBOL res 80 0 R0
SYMATTR InstName R1
SYMATTR Value {R}
SYMBOL res 80 96 R0
SYMATTR InstName R2
SYMATTR Value 2k
TEXT 0 240 Left 2 !.tran 1m
${extra}
`;
}

describe('vista de ploteo dentro del .asc (;.plot)', () => {
  it('va y viene con el archivo, no cambia la netlist y sobrevive al Estudio', async () => {
    const { serializeAsc } = await import('../../src/asc/serialize.ts');
    const { asPlotView, viewFromDoc, withView } = await import('../../src/waveform/view.ts');
    const { ltNetlistText } = await import('../../src/netlist/ltnetlist.ts');
    const view = { tran: [{ traces: [{ expr: 'V(out)', color: '#e03131' }] }, { traces: [{ expr: 'I(R1)', hidden: true }] }], ac: [{ traces: [{ expr: 'V(out)/V(in)' }] }] };
    expect(viewFromDoc(DOC)).toBeNull();
    const doc = withView(DOC, view);
    const text = serializeAsc(doc);
    expect(text).toMatch(/^TEXT -?\d+ \d+ Left 0 ;\.plot [A-Za-z0-9+/=]+$/m);
    const back = parseAsc(text);
    expect(viewFromDoc(back)).toEqual(view);
    // como en LTspice, el comentario queda como "* .plot …" en la netlist y no se ejecuta
    const net = ltNetlistText(ltNetlist(back, lib)).split('\n');
    expect(net.filter((l) => !l.startsWith('* .plot ')).join('\n')).toBe(ltNetlistText(ltNetlist(DOC, lib)));
    expect(toNgspice(ltNetlist(back, lib), 't', { resolve: () => undefined }).text).not.toMatch(/^\.plot/m);
    // reemplazar la vista no agrega otro texto; una vista vacía lo saca
    const other = withView(back, { dc: [{ traces: [{ expr: 'V(out)' }] }] });
    expect(other.texts.length).toBe(back.texts.length);
    expect(withView(other, {}).texts).toEqual(DOC.texts);
    // el Estudio no la pisa
    const st = applyStudy(back, lib, { ...emptyStudy(), measures: [{ enabled: true, name: 'm', analysis: 'tran', kind: 'max', signal: 'V(out)' }] });
    expect(viewFromDoc(st)).toEqual(view);
    // JSON ajeno (links viejos, IndexedDB): se valida
    expect(asPlotView({ tran: [{ traces: [{ expr: 'V(a)', x: 1 }, { nada: 1 }] }], ac: 'x' })).toEqual({ tran: [{ traces: [{ expr: 'V(a)' }] }] });
    expect(asPlotView(null)).toBeNull();
  });
});

describe('Estudio: análisis y gráfico', () => {
  it('el primero activo es la directiva, los demás un comentario que sólo corre TurboSpice', async () => {
    const { EXTRA_ANALYSES } = await import('../../src/netlist/directives.ts');
    const { OFF_ANALYSES } = await import('../../src/sim/study.ts');
    const { viewFromDoc } = await import('../../src/waveform/view.ts');
    const analyses = [
      { enabled: true, line: '.tran 2m' },
      { enabled: true, line: '.ac dec 50 10 100k' },
      { enabled: false, line: '.pz in 0 out 0 vol pz' },
      { enabled: false, line: '.op' },
    ];
    const plot = { tran: [{ traces: [{ expr: 'V(out)' }] }], ac: [{ traces: [{ expr: 'V(out)' }] }] };
    const st: Study = { ...emptyStudy(), analyses, plot, measures: [{ enabled: true, name: 'fc', analysis: 'ac', kind: 'f3db', signal: 'V(out)' }] };
    const doc = applyStudy(DOC, lib, st);
    const texts = doc.texts.filter((t) => !t.text.startsWith('.plot '));
    // LTspice ve un solo análisis: la directiva (en el lugar del .tran anterior)
    expect(texts.filter((t) => t.kind === 'directive').map((t) => t.text)).toEqual(['.tran 2m', '.meas ac fc_max MAX mag(V(out))\\n.meas ac fc WHEN mag(V(out))=fc_max/sqrt(2) FALL=last']);
    expect(doc.texts.find((t) => t.text === '.tran 2m')).toMatchObject({ x: 0, y: 240 });
    expect(texts.filter((t) => t.kind === 'comment').map((t) => t.text)).toEqual([`${EXTRA_ANALYSES}\\n.ac dec 50 10 100k`, `${OFF_ANALYSES}\\n.pz in 0 out 0 vol pz\\n.op`]);
    // al reabrir se reconstruyen las tarjetas de simulación y de gráfico
    const back = studyFromDoc(doc, lib);
    expect(back.analyses).toEqual(analyses);
    expect(back.plot).toEqual(plot);
    expect(viewFromDoc(doc)).toEqual(plot);
    // ngspice corre los dos activos; el .pz desactivado no
    const ng = toNgspice(ltNetlist(doc, lib), 't', { resolve: () => undefined }).text.split('\n');
    expect(ng).toContain('.ac dec 50 10 100k');
    expect(ng.some((l) => /^\.tran /.test(l))).toBe(true);
    expect(ng.some((l) => /^\.(pz|op)\b/.test(l))).toBe(false);
    // sin cambios en los análisis, el documento no se toca
    const sorted = (d: typeof DOC) => [...d.texts].sort((x, y) => x.text.localeCompare(y.text));
    expect(sorted(applyStudy(doc, lib, back))).toEqual(sorted(doc));
    // volver a uno solo deja el esquemático como antes
    const one = applyStudy(doc, lib, { ...emptyStudy(), analyses: [{ enabled: true, line: '.tran 1m' }], plot: {} });
    expect(one.texts).toEqual(DOC.texts);
  });

  it('un análisis que LTspice no tiene como principal queda como comentario de ngspice', () => {
    const doc = applyStudy(DOC, lib, { ...emptyStudy(), analyses: [{ enabled: true, line: '.pz in 0 out 0 vol pz' }] });
    expect(doc.texts.map((t) => [t.kind, t.text])).toEqual([['comment', '.pz in 0 out 0 vol pz']]);
    expect(studyFromDoc(doc, lib).analyses).toEqual([{ enabled: true, line: '.pz in 0 out 0 vol pz' }]);
  });
});
