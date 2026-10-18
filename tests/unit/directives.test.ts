import { describe, expect, it } from 'vitest';
import { emptyDoc, type AscDoc, type SchText } from '../../src/asc/model.ts';
import { findAnalysis, removeAnalysis } from '../../src/schematic/directivesEdit.ts';
import { ANALYSES } from '../../src/sim/analyses.ts';

const text = (t: string, y = 0): SchText => ({ x: 0, y, align: 'Left', size: 2, kind: 'directive', text: t });
const doc = (...texts: SchText[]): AscDoc => ({ ...emptyDoc(), texts });

describe('removeAnalysis (borrar la única simulación)', () => {
  it('saca el texto si sólo tenía el comando', () => {
    const d = removeAnalysis(doc(text('.tran 1m'), text('.model D1 D', 40)));
    expect(d.texts.map((t) => t.text)).toEqual(['.model D1 D']);
    expect(findAnalysis(d)).toBeNull();
  });

  it('en un texto de varias líneas saca sólo esa línea', () => {
    const d = removeAnalysis(doc(text('.param R=1k\\n.ac dec 10 1 1k')));
    expect(d.texts.map((t) => t.text)).toEqual(['.param R=1k']);
  });

  it('sin comando no cambia nada', () => {
    const d = doc(text('.param R=1k'));
    expect(removeAnalysis(d)).toBe(d);
  });
});

describe('tipos de análisis', () => {
  it('en el orden del menú: transitorio, AC, polarización, barrido DC, ruido…', () => {
    expect(ANALYSES.map((a) => a.kind)).toEqual(['tran', 'ac', 'op', 'dc', 'noise', 'tf', 'sens', 'pz', 'disto', 'sp']);
  });
});
