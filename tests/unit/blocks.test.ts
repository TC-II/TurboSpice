import { describe, expect, it } from 'vitest';
import { compileBlocks, studyToBlocks, type BlockJson, type WorkspaceJson } from '../../src/sim/studyBlocks.ts';
import { emptyStudy, type Study } from '../../src/sim/study.ts';

const vars = [
  { name: 'R', id: 'vR' },
  { name: 'tsub', id: 'vT' },
];
const loop = (body: BlockJson): BlockJson => ({
  type: 'ts_for_list',
  x: 10,
  y: 10,
  fields: { VAR: { id: 'vR' }, TARGET: 'component:R1', VALUES: '1k 2k' },
  inputs: { DO: { block: body } },
});
const measure: BlockJson = { type: 'ts_measure', fields: { KIND: 'rise', SIGNAL: 'V(out)', A: '0.1', B: '0.9', VAR: { id: 'vT' } } };
const ws = (top: BlockJson): WorkspaceJson => ({ blocks: { languageVersion: 0, blocks: [top] }, variables: vars });

describe('Estudio con bloques', () => {
  it('"barrer → simular → medir" se vuelve tarjetas (compatible con LTspice)', () => {
    const plot: BlockJson = { type: 'ts_plot_xy', fields: { Y: { id: 'vT' }, X: { id: 'vR' } } };
    const r = compileBlocks(ws(loop({ type: 'ts_simulate', next: { block: { ...measure, next: { block: plot } } } })), 'tran');
    expect(r.ltspice).toBe(true);
    expect(r.study.sweeps).toEqual([{ target: { kind: 'component', name: 'R1' }, mode: 'list', list: '1k 2k', start: '', stop: '', step: '', enabled: true }]);
    expect(r.study.measures).toEqual([{ enabled: true, name: 'tsub', analysis: 'tran', kind: 'rise', signal: 'V(out)', level: '0.1', level2: '0.9' }]);
    expect(r.study.custom).toBeNull();
  });

  it('con lógica genera un .control', () => {
    const cond: BlockJson = {
      type: 'controls_if',
      inputs: {
        IF0: {
          block: {
            type: 'logic_compare',
            fields: { OP: 'GT' },
            inputs: { A: { block: { type: 'variables_get', fields: { VAR: { id: 'vT' } } } }, B: { block: { type: 'math_number', fields: { NUM: 0.001 } } } },
          },
        },
        DO0: { block: { type: 'ts_message', fields: { TEXT: 'R1 demasiado grande' } } },
      },
    };
    const plot: BlockJson = { type: 'ts_plot_xy', fields: { Y: { id: 'vT' }, X: { id: 'vR' } } };
    const r = compileBlocks(ws(loop({ type: 'ts_simulate', next: { block: { ...measure, next: { block: { ...cond, next: { block: plot } } } } } })), 'tran');
    expect(r.ltspice).toBe(false);
    expect(r.errors).toEqual([]);
    expect(r.study.custom!.body).toBe(
      [
        '* bloques',
        '* grafico 1 R tsub',
        'foreach v_R 1000 2000',
        '  alter r1 = $v_R',
        '  run',
        '  meas tran tsub TRIG v(out) VAL=0.1 RISE=1 TARG v(out) VAL=0.9 RISE=1',
        '  set v_tsub = "$&tsub"',
        '  if ($v_tsub gt 0.001)',
        '    echo "R1 demasiado grande"',
        '  end',
        '  echo "TS-XY 1" $v_R $v_tsub',
        'end',
      ].join('\n'),
    );
  });

  it('mediciones de AC con ayuda de let (f a −3 dB, margen de fase)', () => {
    const m = (kind: string, id: string): BlockJson => ({ type: 'ts_measure', fields: { KIND: kind, SIGNAL: 'V(out)', A: '', B: '', VAR: { id } } });
    const prog: BlockJson = { type: 'ts_simulate', next: { block: { ...m('f3db', 'vA'), next: { block: { ...m('phaseMargin', 'vB'), next: { block: { type: 'ts_message', fields: { TEXT: 'x' } } } } } } } };
    const r = compileBlocks({ blocks: { blocks: [prog] }, variables: [{ name: 'fc', id: 'vA' }, { name: 'pm', id: 'vB' }] }, 'ac');
    expect(r.study.custom!.body.split('\n')).toEqual([
      '* bloques',
      'run',
      'meas ac fc_max MAX vm(out)',
      'let fc_lim = fc_max/sqrt(2)',
      'meas ac fc WHEN vm(out)=fc_lim FALL=last',
      'set v_fc = "$&fc"',
      'meas ac pm_ph FIND vp(out) WHEN vm(out)=1 FALL=1',
      'let pm = 180+pm_ph*180/pi',
      'set v_pm = "$&pm"',
      'echo "x"',
    ]);
  });

  it('tarjetas → bloques → tarjetas', () => {
    const st: Study = {
      ...emptyStudy(),
      sweeps: [
        { target: { kind: 'component', name: 'R1' }, mode: 'list', list: '1k 2k', start: '', stop: '', step: '', enabled: true, original: '1k' },
        { target: { kind: 'temp' }, mode: 'lin', list: '', start: '0', stop: '50', step: '25', enabled: true },
      ],
      measures: [{ enabled: true, name: 'fc', analysis: 'ac', kind: 'f3db', signal: 'V(out)' }],
    };
    const back = compileBlocks(studyToBlocks(st), 'ac');
    expect(back.ltspice).toBe(true);
    expect(back.study.sweeps).toEqual(st.sweeps.map(({ original: _, ...s }) => s));
    expect(back.study.measures).toEqual(st.measures);
  });

  it('"Graficar señal" arma la vista de resultados (no cambia el programa)', () => {
    const sig = (SIGNAL: string, PANE: number, ANALYSIS: string, COLOR = 'auto'): BlockJson => ({ type: 'ts_plot_signal', fields: { SIGNAL, PANE, COLOR, ANALYSIS } });
    const chainOf = (...bs: BlockJson[]) => bs.reduceRight<BlockJson | undefined>((next, b) => ({ ...b, ...(next ? { next: { block: next } } : {}) }), undefined)!;
    const r = compileBlocks(ws(chainOf(loop(chainOf({ type: 'ts_simulate' }, measure)), sig('V(out)', 1, 'tran', '#e03131'), sig('V(in)', 2, 'tran'), sig('V(out)/V(in)', 1, 'ac'))), 'tran');
    expect(r.ltspice).toBe(true);
    expect(r.study.plot).toEqual({ tran: [{ traces: [{ expr: 'V(out)', color: '#e03131' }] }, { traces: [{ expr: 'V(in)' }] }], ac: [{ traces: [{ expr: 'V(out)/V(in)' }] }] });
    // y vuelve a bloques
    const back = compileBlocks(studyToBlocks({ ...emptyStudy(), plot: r.study.plot }), 'tran');
    expect(back.study.plot).toEqual(r.study.plot);
    expect(compileBlocks(ws(loop({ type: 'ts_simulate' })), 'tran').study.plot).toBeUndefined();
  });
});
