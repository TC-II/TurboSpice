import { describe, expect, it } from 'vitest';
import { emptyDoc, type AscDoc, type SchText } from '../../src/asc/model.ts';
import { findAnalysis, removeAnalysis, setAnalysisLine } from '../../src/schematic/directivesEdit.ts';
import { visibleText } from '../../src/schematic/geometry.ts';
import { EXTRA_ANALYSES } from '../../src/netlist/directives.ts';
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

describe('comando de simulación oculto en el esquemático (#48)', () => {
  const comment = (s: string): SchText => ({ ...text(s), kind: 'comment' });

  it('no se dibuja el comando de análisis, salvo con Ver › Mostrar el comando', () => {
    for (const s of ['.tran 20m', '.ac dec 100 100 100k', '.dc V1 0 5 0.1', '.op', '.noise V(out) V1 dec 10 1 1k', '.tf V(out) V1']) {
      expect(visibleText(text(s), false), s).toBeNull();
      expect(visibleText(text(s), true)?.text).toBe(s);
    }
    // los de ngspice se guardan como comentario y también se ocultan
    expect(visibleText(comment('.pz in 0 out 0 vol pz'), false)).toBeNull();
    expect(visibleText(comment(`${EXTRA_ANALYSES}\\n.ac dec 10 1 1k`), false)).toBeNull();
  });

  it('junto con otras directivas se oculta sólo esa línea', () => {
    expect(visibleText(text('.param R=1k\\n.tran 20m\\n.step param R list 1k 2k'), false)?.text).toBe('.param R=1k\\n.step param R list 1k 2k');
  });

  it('las demás directivas y los comentarios comunes se siguen viendo', () => {
    for (const s of ['.param R=1k', '.model D1 D', '.meas tran t1 FIND V(out) AT 1m']) expect(visibleText(text(s), false)?.text).toBe(s);
    // un comentario que menciona .tran no se ejecuta: es texto del usuario
    expect(visibleText(comment('.tran 1m es lo que usé'), false)?.text).toBe('.tran 1m es lo que usé');
  });

  it('el comando nuevo va debajo del circuito, no encima', () => {
    const d: AscDoc = { ...emptyDoc(), wires: [{ x1: -64, y1: 0, x2: 160, y2: 0 }, { x1: 160, y1: 0, x2: 160, y2: 240 }] };
    const t = setAnalysisLine(d, '.tran 1m').texts[0];
    expect(t.y).toBeGreaterThan(240);
    expect(t.x).toBe(-64);
  });
});
