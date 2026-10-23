// Bloques de #179: cada uno compila a líneas de .control
import { describe, expect, it } from 'vitest';
import { blockDefinitions, compileBlocks, toolbox, type BlockJson, type WorkspaceJson } from '../../src/sim/studyBlocks.ts';
import { blockResultsFromLog, measCsv } from '../../src/sim/measResults.ts';
import { defaultOptions, montecarloBlocks, templateBlocks, type TemplateCircuit } from '../../src/sim/studyTemplates.ts';
import { emptyStudy } from '../../src/sim/study.ts';

const variables = ['x', 'm', 'ms', 'r', 'k'].map((n) => ({ name: n, id: `v_${n}` }));
const v = (n: string) => ({ id: `v_${n}` });
const num = (n: number): BlockJson => ({ type: 'math_number', fields: { NUM: n } });
const get = (n: string): BlockJson => ({ type: 'variables_get', fields: { VAR: v(n) } });
const link = (...list: BlockJson[]): BlockJson => {
  for (let i = list.length - 2; i >= 0; i--) list[i].next = { block: list[i + 1] };
  return list[0];
};
const ws = (...tops: BlockJson[]): WorkspaceJson => ({ blocks: { languageVersion: 0, blocks: tops.map((b, i) => ({ ...b, x: 0, y: i * 100 })) }, variables });
/** Cuerpo del .control (sin la marca) de un programa */
const lines = (...list: BlockJson[]) => {
  const r = compileBlocks(ws(link(...list)), 'tran');
  return { errors: r.errors, body: r.study.custom!.body.split('\n').slice(1) };
};
const one = (b: BlockJson) => lines(b).body;

describe('Bloques del Estudio (#179)', () => {
  it('correr análisis con sus parámetros', () => {
    expect(one({ type: 'ts_op' })).toEqual(['op', 'set ts_plot_op = $curplot']);
    expect(one({ type: 'ts_tran', fields: { TSTOP: '10m', TSTEP: '1u', TSTART: '', UIC: false } })[0]).toBe('tran 1u 10m');
    expect(one({ type: 'ts_tran', fields: { TSTOP: '10m', TSTEP: '', TSTART: '', UIC: true } })[0]).toBe('tran 0.00001 10m 0 uic');
    expect(one({ type: 'ts_ac', fields: { MODE: 'dec', POINTS: '20', FSTART: '1', FSTOP: '1meg' } })).toEqual(['ac dec 20 1 1meg', 'set ts_plot_ac = $curplot']);
    expect(one({ type: 'ts_dc', fields: { SOURCE: 'V1', START: '0', STOP: '5', STEP: '0.1' } })[0]).toBe('dc v1 0 5 0.1');
    expect(one({ type: 'ts_noise', fields: { OUT: 'V(out)', SOURCE: 'V1', MODE: 'dec', POINTS: '10', FSTART: '1', FSTOP: '1meg' } })[0]).toBe('noise v(out) v1 dec 10 1 1meg');
    expect(one({ type: 'ts_tf', fields: { OUT: 'V(out)', SOURCE: 'V1' } })[0]).toBe('tf v(out) v1');
    expect(one({ type: 'ts_reset' })).toEqual(['reset']);
    expect(one({ type: 'ts_option', fields: { NAME: 'reltol', VALUE: '1e-4' } })).toEqual(['option reltol = 1e-4']);
    expect(one({ type: 'ts_option', fields: { NAME: 'method', VALUE: 'gear' } })).toEqual(['option method = gear']);
    expect(one({ type: 'ts_setplot', fields: { ANALYSIS: 'ac' } })).toEqual(['setplot $ts_plot_ac']);
  });

  it('validación: falta la fuente, un número o un campo', () => {
    expect(lines({ type: 'ts_dc', fields: { SOURCE: '', START: '0', STOP: '5', STEP: '0.1' } }).errors).toHaveLength(1);
    expect(lines({ type: 'ts_ac', fields: { MODE: 'dec', POINTS: 'x', FSTART: '1', FSTOP: '' } }).errors).toHaveLength(2);
    expect(lines({ type: 'ts_altermod', fields: { MODEL: '', PARAM: 'is' }, inputs: { VALUE: { block: num(1) } } }).errors).toHaveLength(1);
    expect(lines({ type: 'ts_command', fields: { TEXT: ' ' } }).errors).toHaveLength(1);
  });

  it('circuito: modelo, instancia, fuente, temperatura, semilla y aleatorios', () => {
    expect(one({ type: 'ts_altermod', fields: { MODEL: 'DMOD', PARAM: 'IS' }, inputs: { VALUE: { block: num(1e-12) } } })).toEqual(['let ts_tmp = 1e-12', 'set ts_val = "$&ts_tmp"', 'altermod dmod is = $ts_val']);
    expect(one({ type: 'ts_alter_inst', fields: { INST: 'Q1', PARAM: 'area' }, inputs: { VALUE: { block: num(2) } } }).at(-1)).toBe('alter @q1[area] = $ts_val');
    expect(one({ type: 'ts_source', fields: { WHAT: 'acmag', SOURCE: 'V1' }, inputs: { VALUE: { block: num(2) } } }).at(-1)).toBe('alter v1 acmag = $ts_val');
    expect(one({ type: 'ts_temp', inputs: { VALUE: { block: num(85) } } })).toEqual(['let ts_tmp = 85', 'set ts_val = "$&ts_tmp"', 'option temp = $ts_val']);
    expect(one({ type: 'ts_seed', fields: { SEED: 7 } })).toEqual(['setseed 7']);
    const rnd = (DIST: string): BlockJson => ({ type: 'variables_set', fields: { VAR: v('x') }, inputs: { VALUE: { block: { type: 'ts_random', fields: { DIST, TOL: 6 }, inputs: { NOM: { block: num(1000) } } } } } });
    expect(one(rnd('uniform'))[0]).toBe('let ts_tmp = (1000 * (1 + 0.06 * sunif(0)))');
    expect(one(rnd('gauss'))[0]).toBe('let ts_tmp = (1000 * (1 + 0.02 * sgauss(0)))');
  });

  it('medidas: sobrepico, establecimiento, slew rate, margen de ganancia y valores de un vector', () => {
    const more = (KIND: string, A = '') => one({ type: 'ts_measure_more', fields: { KIND, SIGNAL: 'V(out)', A, VAR: v('m') } });
    expect(more('overshoot')).toEqual(['setplot $ts_plot_tran', 'let ts_y = v(out)', 'let ts_final = ts_y[length(ts_y)-1]', 'let ts_tmp = 100*(vecmax(ts_y)-ts_final)/ts_final', 'set v_m = "$&ts_tmp"']);
    expect(more('settle', '5')).toContain('let ts_lim = 0.05*abs(ts_final)');
    expect(more('settle')).toContain('meas tran ts_settle when ts_err=$&ts_lim cross=last');
    expect(more('slew')).toContain('let ts_tmp = vecmax(abs(deriv(v(out))))');
    expect(more('gainMargin')).toContain('meas ac ts_g180 find ts_gdb at=$&ts_f180');
    const vec = (FN: string, ANALYSIS: string, SIGNAL = 'V(out)') => one({ type: 'ts_vector', fields: { FN, SIGNAL, ANALYSIS, VAR: v('m') } });
    expect(vec('first', 'op', 'I(V1)')).toEqual(['setplot $ts_plot_op', 'let ts_tmp = i(v1)[0]', 'set v_m = "$&ts_tmp"']);
    expect(vec('last', 'tran')[1]).toBe('let ts_tmp = v(out)[length(v(out))-1]');
    expect(vec('max', 'ac')[1]).toBe('let ts_tmp = vecmax(mag(v(out)))');
    expect(vec('mean', 'dc')[1]).toBe('let ts_tmp = mean(v(out))');
  });

  it('listas y estadística: se inicializan vacías y se acumulan', () => {
    const r = lines(
      { type: 'ts_list_add', fields: { LIST: v('ms') }, inputs: { VALUE: { block: get('m') } } },
      { type: 'variables_set', fields: { VAR: v('k') }, inputs: { VALUE: { block: { type: 'ts_list_length', fields: { LIST: v('ms') } } } } },
      { type: 'variables_set', fields: { VAR: v('x') }, inputs: { VALUE: { block: { type: 'ts_list_item', fields: { INDEX: 2, LIST: v('ms') } } } } },
      { type: 'ts_list_stat', fields: { STAT: 'yield', LIST: v('ms'), A: '0.9', B: '1.1k', VAR: v('r') } },
      { type: 'ts_list_stat', fields: { STAT: 'stddev', LIST: v('ms'), A: '', B: '', VAR: v('r') } },
      { type: 'ts_list_new', fields: { LIST: v('ms') } },
    );
    expect(r.errors).toEqual([]);
    expect(r.body[0]).toBe('set v_ms = ( )');
    expect(r.body).toContain('set v_ms = ( $v_ms $ts_val )');
    expect(r.body).toContain('let ts_tmp = $#v_ms');
    expect(r.body).toContain('let ts_tmp = $v_ms[2]');
    expect(r.body).toContain('  let ts_tmp = 100*mean((ts_vec ge 0.9) and (ts_vec le 1100))');
    expect(r.body).toContain('  compose ts_vec values $v_ms');
    expect(r.body).toContain('  let ts_tmp = stddev(ts_vec)');
    expect(r.body.at(-1)).toBe('set v_ms = ( )');
  });

  it('mostrar: tabla, histograma, lista contra lista y texto unido', () => {
    expect(one({ type: 'ts_table_row', fields: { COLS: 'x m' } })).toEqual(['echo TS-ROW x= $v_x m= $v_m']);
    expect(one({ type: 'ts_histogram', fields: { LIST: v('ms') } }).at(-1)).toBe('echo TS-HIST ms $v_ms');
    expect(one({ type: 'ts_plot_lists', fields: { Y: v('ms'), X: v('x') } }).at(-1)).toBe('echo TS-XYL ms x @ $v_x @ $v_ms');
    const join: BlockJson = { type: 'text_join', extraState: { itemCount: 3 }, inputs: { ADD0: { block: { type: 'text', fields: { TEXT: 'm =' } } }, ADD1: { block: get('m') }, ADD2: { block: num(2) } } };
    expect(one({ type: 'ts_print', inputs: { VALUE: { block: join } } })).toEqual(['let ts_j2 = 2', 'echo "m = $v_m $&ts_j2"']);
  });

  it('control: mientras / hasta, salir del bucle y funciones propias', () => {
    const cond: BlockJson = { type: 'logic_compare', fields: { OP: 'LT' }, inputs: { A: { block: get('k') }, B: { block: num(3) } } };
    expect(one({ type: 'controls_whileUntil', fields: { MODE: 'WHILE' }, inputs: { BOOL: { block: cond }, DO: { block: { type: 'controls_flow_statements', fields: { FLOW: 'BREAK' } } } } })).toEqual(['while ($v_k lt 3)', '  break', 'end']);
    expect(one({ type: 'controls_whileUntil', fields: { MODE: 'UNTIL' }, inputs: { BOOL: { block: cond } } })[0]).toBe('while (not ($v_k lt 3))');
    const def: BlockJson = { type: 'procedures_defnoreturn', fields: { NAME: 'medir' }, extraState: { params: [{ name: 'x', id: 'v_x' }] }, inputs: { STACK: { block: { type: 'ts_op' } } } };
    const call: BlockJson = { type: 'procedures_callnoreturn', extraState: { name: 'medir', params: ['x'] }, inputs: { ARG0: { block: num(5) } } };
    const r = compileBlocks(ws(def, call), 'tran');
    expect(r.errors).toEqual([]);
    expect(r.study.custom!.body.split('\n').slice(1)).toEqual(['let ts_tmp = 5', 'set v_x = "$&ts_tmp"', 'op', 'set ts_plot_op = $curplot']);
    const self: BlockJson = { ...def, inputs: { STACK: { block: { ...call } } } };
    expect(compileBlocks(ws(self, call), 'tran').errors).toHaveLength(1);
  });

  it('escape: comando y expresión libres', () => {
    expect(one({ type: 'ts_command', fields: { TEXT: 'fourier 1k v(out)' } })).toEqual(['fourier 1k v(out)']);
    expect(one({ type: 'variables_set', fields: { VAR: v('x') }, inputs: { VALUE: { block: { type: 'ts_expr', fields: { TEXT: '2*pi*1k' } } } } })[0]).toBe('let ts_tmp = (2*pi*1k)');
  });

  it('cada bloque de la caja de herramientas tiene definición (o es de Blockly)', () => {
    const defs = new Set(blockDefinitions().map((d) => (d as { type: string }).type));
    const types = JSON.stringify(toolbox()).match(/"type":"(ts_\w+)"/g)!.map((s) => s.slice(8, -1));
    for (const tt of types) expect(defs.has(tt), tt).toBe(true);
  });

  it('tabla, histograma y listas desde el log', () => {
    const { table, plots } = blockResultsFromLog(['TS-ROW vop= 0.5 fc= 159.2', 'TS-ROW vop= 0.6 fc= 1.2e3', 'TS-HIST ms 1 2 3', 'TS-XYL y x @ 2 1 @ 20 10']);
    expect(table!.names).toEqual(['vop', 'fc', 'ms']);
    expect(table!.rows).toHaveLength(5);
    expect(table!.rows[1].values.get('fc')).toEqual({ value: 1200 });
    expect(Array.from(plots[0].vectors[0].real)).toEqual([1, 2]);
    expect(Array.from(plots[0].vectors[1].real)).toEqual([10, 20]);
    expect(measCsv(table!).split('\n')[0]).toBe('run,vop,fc,ms');
    expect(measCsv(table!).split('\n')[1]).toBe('1,0.5,159.2,');
  });
});

const RC: TemplateCircuit = {
  components: [
    { name: 'V1', prefix: 'V', value: 'PULSE(0 1 0 1u 1u 5m 10m)' },
    { name: 'R1', prefix: 'R', value: '1k' },
    { name: 'C1', prefix: 'C', value: '1µ' },
  ],
  sources: ['V1'],
  nets: ['0', 'in', 'out'],
  params: [],
  analysis: 'tran',
};

describe('Plantillas armadas con los bloques nuevos (#179)', () => {
  it('Monte Carlo: 100 corridas, lista, histograma y rendimiento', () => {
    const c = compileBlocks(montecarloBlocks(RC, { ...defaultOptions(RC), specMin: '0.9', specMax: '1.1' }), 'tran');
    expect(c.errors).toEqual([]);
    const body = c.study.custom!.body;
    expect(body).toMatch(/^repeat 100$/m);
    expect(body).toMatch(/let ts_tmp = \(1000 \* \(1 \+ 0\.05 \* sunif\(0\)\)\)/);
    expect(body).toMatch(/echo TS-HIST ms \$v_ms/);
    expect(body).toMatch(/100\*mean\(\(ts_vec ge 0\.9\) and \(ts_vec le 1\.1\)\)/);
  });

  it('serie de simulaciones: op + ac + tran, una medida en cada una y la tabla', () => {
    const base = { ...emptyStudy(), analyses: [{ enabled: true, line: '.tran 20m' }] };
    const c = compileBlocks(templateBlocks(base, 'series', RC, defaultOptions(RC))!, 'tran');
    expect(c.errors).toEqual([]);
    const body = c.study.custom!.body.split('\n');
    expect(body.filter((l) => /^(op|ac|tran)\b/.test(l)).map((l) => l.split(' ')[0])).toEqual(['op', 'ac', 'tran']);
    expect(body.some((l) => /^meas ac fc/.test(l))).toBe(true);
    expect(body.at(-1)).toBe('echo TS-ROW vop= $v_vop fc= $v_fc peak= $v_peak');
    expect(Object.keys(c.study.plot ?? {}).sort()).toEqual(['ac', 'tran']);
  });
});
