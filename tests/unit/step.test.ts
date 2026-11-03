import { describe, expect, it } from 'vitest';
import { parseStep, splitStepRuns, stepPlan, type Step, type StepPlan } from '../../src/netlist/step.ts';

const values = (line: string) => (parseStep(line) as Step).values;

describe('.step', () => {
  it('barridos lineales, logarítmicos y listas', () => {
    expect(values('.step param R 1k 3k 1k')).toEqual([1000, 2000, 3000]);
    expect(values('.step param A .1 .7 .1').map((v) => +v.toFixed(6))).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
    expect(values('.step NPN 2N2222(Vaf) 100 50 25')).toEqual([100, 75, 50]);
    expect(values('.step dec param I 1 100 2').map((v) => +v.toPrecision(6))).toEqual([1, 3.16228, 10, 31.6228, 100]);
    expect(values('.step oct param R 500 2000 1')).toEqual([500, 1000, 2000]);
    expect(values('.step param R list 1e308 22.22K 2.0202K')).toEqual([1e308, 22220, 2020.2]);
    expect(values('.step param load 200m 1A 200m').length).toBe(5);
    expect(values('.step temp -55 125 90')).toEqual([-55, 35, 125]);
  });

  it('reconoce el objetivo del barrido', () => {
    expect((parseStep('.step PARAM R list 1 2') as Step).target).toEqual({ kind: 'param', name: 'R' });
    expect((parseStep('.step oct param R 500 100K 10') as Step).target).toEqual({ kind: 'param', name: 'R' });
    expect((parseStep('.step Vin list 6 10') as Step).target).toEqual({ kind: 'source', name: 'Vin' });
    expect((parseStep('.step temp -55 125 5') as Step).target).toEqual({ kind: 'temp' });
    expect((parseStep('.step NPN 2N2222(Vaf) 100 50 25') as Step).target).toEqual({ kind: 'model', model: '2N2222', param: 'Vaf' });
    expect(typeof parseStep('.step param R 1')).toBe('string');
  });

  it('anida los .step: el primero varía más rápido', () => {
    const steps = ['.step param R list 1k 2k', '.step V1 0 5 5', '.step temp 0 50 50'].map((l) => parseStep(l) as Step);
    const plan = stepPlan(steps, (n) => (n.toLowerCase() === 'v1' ? 'V1' : undefined));
    if (typeof plan === 'string') throw new Error(plan);
    expect(plan.runs.map((r) => r.label)).toEqual([
      'R=1k V1=0 temp=0',
      'R=2k V1=0 temp=0',
      'R=1k V1=5 temp=0',
      'R=2k V1=5 temp=0',
      'R=1k V1=0 temp=50',
      'R=2k V1=0 temp=50',
      'R=1k V1=5 temp=50',
      'R=2k V1=5 temp=50',
    ]);
    expect(plan.runs[3].values).toEqual([2000, 5, 0]);
    expect(plan.names).toEqual(['R', 'V1', 'temp']);
    expect(plan.control.join('\n')).toBe(
      [
        '.control',
        'foreach ts_step2 0 50',
        '  foreach ts_step1 0 5',
        '    foreach ts_step0 1000 2000',
        '      alterparam R = $ts_step0',
        '      reset',
        '      alter v1 dc = $ts_step1',
        '      option temp = $ts_step2',
        '      run',
        '    end',
        '  end',
        'end',
        '.endc',
      ].join('\n'),
    );
    expect(stepPlan([parseStep('.step Vx 0 1 1') as Step], () => undefined)).toMatch(/no existe/);
  });
});

describe('splitStepRuns (#366: una netlist por corrida, para Icarus)', () => {
  const steps = [parseStep('.step param k list 1 2'), parseStep('.step temp 25 85 60')] as Step[];
  const plan = stepPlan(steps, () => undefined) as StepPlan;
  const net = ['* t', 'R1 a 0 {k}', '.param k=1', '.tran 1u', ...plan.control, '.end'].join('\n');
  const runs = splitStepRuns(net)!;
  it('una por corrida, en el orden de stepPlan (el primer .step, el más rápido)', () => {
    expect(runs).toHaveLength(plan.runs.length);
    expect(runs.map((r) => [/^\.param k=(\S+)$/m.exec(r)?.[1], /option temp = (\S+)/.exec(r)?.[1]])).toEqual([
      ['1', '25'],
      ['2', '25'],
      ['1', '85'],
      ['2', '85'],
    ]);
  });
  it('sin foreach, alterparam ni reset; el .param que había, con el valor de la corrida', () => {
    for (const r of runs) {
      expect(r).not.toMatch(/foreach|alterparam|^\s*reset|\$ts_step|^\s*end\s*$/m);
      expect(r.match(/^\.param k=/gm)).toHaveLength(1);
      expect(r).toMatch(/^\.control\n[\s\S]*^run$[\s\S]*^\.endc$/m);
    }
  });
  it('null sin .step', () => expect(splitStepRuns('* t\n.tran 1u\n.end')).toBeNull());
});
