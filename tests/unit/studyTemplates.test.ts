import { describe, expect, it } from 'vitest';
import { emptyStudy, measureLines, studyLines } from '../../src/sim/study.ts';
import { parseMeas } from '../../src/sim/meas.ts';
import { parseStep } from '../../src/netlist/step.ts';
import { compileBlocks } from '../../src/sim/studyBlocks.ts';
import { applyTemplate, blocksCanExpress, defaultOptions, STUDY_TEMPLATES, templateBlocks, type TemplateCircuit } from '../../src/sim/studyTemplates.ts';

// el filtro RC de los ejemplos
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
const base = () => ({ ...emptyStudy(), analyses: [{ enabled: true, line: '.tran 20m' }] });

describe('Plantillas del Estudio (#178)', () => {
  it('valores por defecto deducidos del circuito', () => {
    const o = defaultOptions(RC);
    expect([o.target, o.target2, o.signal, o.analysis, o.source]).toEqual(['R1', 'C1', 'V(out)', 'tran', 'V1']);
  });

  it('cada plantilla de tarjetas genera directivas válidas', () => {
    for (const tpl of STUDY_TEMPLATES.filter((x) => x.build)) {
      const st = applyTemplate(base(), tpl.id, RC, { ...defaultOptions(RC), specMin: '0.9', specMax: '1.1' });
      const { on } = studyLines(st);
      for (const l of on) {
        if (/^\.meas/i.test(l)) expect(typeof parseMeas(l), `${tpl.id}: ${l}`).not.toBe('string');
        if (/^\.step/i.test(l)) expect(typeof parseStep(l), `${tpl.id}: ${l}`).not.toBe('string');
      }
      expect(st.measures.length + st.sweeps.length + (st.analyses?.length ?? 0), tpl.id).toBeGreaterThan(0);
    }
  });

  it('barrido paramétrico: R1 en 500 1k 2k, medición y gráfico', () => {
    const st = applyTemplate(base(), 'sweep', RC, defaultOptions(RC));
    expect(st.sweeps[0]).toMatchObject({ target: { kind: 'component', name: 'R1' }, list: '500 1k 2k', original: '1k' });
    expect(measureLines(st.measures[0])).toEqual(['.meas tran m1 MAX V(out)']);
    expect(st.plot?.tran?.[0].traces.map((x) => x.expr)).toEqual(['V(out)']);
    expect(blocksCanExpress(st)).toBe(true);
  });

  it('Monte Carlo: tolerancias, 50 corridas y rendimiento', () => {
    const st = applyTemplate(base(), 'montecarlo', RC, { ...defaultOptions(RC), specMin: '0.9', specMax: '1.1' });
    expect(st.tolerance).toMatchObject({ mode: 'montecarlo', runs: '50' });
    expect(st.tolerance!.items.map((i) => `${i.component} ${i.tol}`)).toEqual(['R1 5', 'C1 10']);
    expect(st.measures[1].line).toBe('.meas tran yield PARAM (1+sgn(m1-0.9))/2*(1+sgn(1.1-m1))/2');
    expect(templateBlocks(base(), 'montecarlo', RC, defaultOptions(RC))).toBeNull();
  });

  it('serie de simulaciones: .op, .ac y .tran', () => {
    const st = applyTemplate(base(), 'series', RC, defaultOptions(RC));
    expect(st.analyses!.map((a) => a.line.split(' ')[0])).toEqual(['.tran', '.op', '.ac']);
    expect(Object.keys(st.plot ?? {}).sort()).toEqual(['ac', 'tran']);
  });

  it('los nombres de las mediciones no se repiten', () => {
    const once = applyTemplate(base(), 'sweep', RC, defaultOptions(RC));
    const twice = applyTemplate(once, 'sweep', RC, defaultOptions(RC));
    expect(twice.measures.map((m) => m.name)).toEqual(['m1', 'm2']);
  });

  it('búsqueda / ajuste: un programa de bloques que compila sin errores', () => {
    const ws = templateBlocks(base(), 'search', RC, { ...defaultOptions(RC), analysis: 'ac', goal: '1k' })!;
    const c = compileBlocks(ws, 'ac');
    expect(c.errors).toEqual([]);
    expect(c.ltspice).toBe(false);
    expect(c.study.custom?.body).toMatch(/repeat 12/);
    expect(c.study.custom?.body).toMatch(/alter r1 = \$ts_val/);
  });
});
