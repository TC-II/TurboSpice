import { parseAnalysis } from '../../src/sim/analyses.ts';
import { describe, expect, it } from 'vitest';
import { emptyDoc, type AscDoc } from '../../src/asc/model.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';
import { isDataText } from '../../src/asc/dataText.ts';
import { findAnalysis, setAnalysisLine } from '../../src/schematic/directivesEdit.ts';
import {
  activeSim,
  addSim,
  analysisDetail,
  analysisProblem,
  reuseLine,
  analysisLabel,
  pzLogErrors,
  pzProblem,
  defaultLine,
  duplicateSim,
  emptySims,
  followLine,
  keepResult,
  removeSim,
  renameSim,
  selectSim,
  setSimView,
  simName,
  simsFromLine,
  takeSims,
  withSims,
} from '../../src/sim/simList.ts';

const docWith = (line: string): AscDoc => ({ ...emptyDoc(), texts: [{ x: 0, y: 0, align: 'Left', size: 2, kind: 'directive', text: line }] });

describe('nombre automático de una simulación', () => {
  it('es legible, con unidades', () => {
    expect(analysisLabel('.tran 10m')).toBe('Tran 0 - 10m');
    expect(analysisLabel('.tran 0 20m 5m 1u')).toBe('Tran 5m - 20m');
    expect(analysisLabel('.tran 100m')).toBe('Tran 0 - 100m');
    expect(analysisLabel('.ac dec 10 100 100k')).toBe('AC 100Hz - 100KHz');
    expect(analysisLabel('.noise V(out) V1 dec 10 1 1meg')).toBe('Ruido 1Hz - 1MHz');
    expect(analysisLabel('.pz in 0 out 0 vol pz')).toBe('Polos y ceros');
    expect(analysisLabel('.ac dec 100 1 1meg')).toBe('AC 1Hz - 1MHz');
    expect(analysisLabel('.dc V1 0 5 0.1')).toBe('Barrido DC');
    expect(analysisLabel('.dc V1 0 5 0.1 I2 1m 3m 1m')).toBe('Barrido DC');
    expect(analysisLabel('.op')).toBe('.OP');
    expect(analysisLabel('.tf V(out) V1')).toBe('Transferencia V(out)/V1');
    expect(analysisLabel('.tran {T}')).toBe('Tran 0 - {T}');
  });
  it('un comando que no se entiende queda como está', () => {
    expect(analysisLabel('.tran 1m steady')).toBe('.tran 1m steady');
  });
  it('el nombre propio tiene prioridad', () => {
    const r = simsFromLine('.op');
    const named = renameSim(r, r.active, '  Polarización ');
    expect(simName(named.items[0])).toBe('Polarización');
    expect(simName(renameSim(named, r.active, '').items[0])).toBe('.OP');
  });
});

describe('lista de simulaciones', () => {
  it('agrega, duplica, elige y borra', () => {
    let l = simsFromLine('.dc V1 0 5 0.1');
    const a = l.active;
    l = addSim(l, '.dc V1 0 2 0.01');
    const b = l.active;
    expect(l.items.map((s) => s.line)).toEqual(['.dc V1 0 5 0.1', '.dc V1 0 2 0.01']);
    expect(b).not.toBe(a);
    l = setSimView(l, b, { panes: [{ traces: [{ expr: 'V(out)', color: '#f00' }] }] });
    l = duplicateSim(l, b);
    const c = l.active;
    expect(l.items.length).toBe(3);
    expect(activeSim(l)?.view?.panes[0].traces[0].color).toBe('#f00');
    // la copia es independiente
    l.items[2].view!.panes[0].traces[0].color = '#00f';
    expect(l.items[1].view?.panes[0].traces[0].color).toBe('#f00');
    l = selectSim(l, a);
    expect(l.active).toBe(a);
    expect(selectSim(l, 'no-existe')).toBe(l);
    l = selectSim(l, b);
    l = removeSim(l, b);
    expect(l.active).toBe(c);
    l = removeSim(l, c);
    expect(l.active).toBe(a);
    expect(removeSim(l, a)).toEqual(emptySims());
  });
  it('no tiene límite', () => {
    let l = emptySims();
    for (let i = 0; i < 50; i++) l = addSim(l, `.tran ${i + 1}m`);
    expect(l.items.length).toBe(50);
    expect(duplicateSim(l, l.active).items.length).toBe(51);
  });
  it('sigue al comando del esquemático', () => {
    let l = followLine(emptySims(), '.tran 1m');
    expect(l.items.map((s) => s.line)).toEqual(['.tran 1m']);
    const first = l.active;
    expect(followLine(l, '.tran 1m')).toBe(l);
    expect(followLine(l, null)).toBe(l);
    l = addSim(l, '.ac dec 10 1 1k');
    // editar el comando cambia el de la activa
    l = followLine(l, '.ac dec 10 1 10k');
    expect(activeSim(l)?.line).toBe('.ac dec 10 1 10k');
    // volver al de otra (p. ej. al deshacer) la elige
    l = followLine(l, '.tran 1m');
    expect(l.active).toBe(first);
    expect(l.items.length).toBe(2);
  });
  it('comando para una simulación nueva con las fuentes y redes del circuito', () => {
    const info = { nets: ['N001', 'in', 'out'], sources: ['V1', 'V2'] };
    expect(defaultLine('dc', info)).toBe('.dc V1 0 5 0.1');
    expect(defaultLine('tf', info)).toBe('.tf V(out) V1');
    expect(defaultLine('pz', info)).toBe('.pz in 0 out 0 vol pz');
    expect(defaultLine('tran', info)).toBe('.tran 10m');
  });
});

describe('resultados en memoria', () => {
  it('se conservan los de las últimas vistas', () => {
    const kept = new Map<string, number>();
    expect(keepResult(kept, 'a', 1, 2)).toEqual([]);
    keepResult(kept, 'b', 2, 2);
    keepResult(kept, 'a', 3, 2); // "a" pasa a ser la más reciente
    expect(keepResult(kept, 'c', 4, 2)).toEqual(['b']);
    expect([...kept.entries()]).toEqual([
      ['a', 3],
      ['c', 4],
    ]);
  });
});

describe('lista en el .asc', () => {
  it('va en un comentario oculto y vuelve igual', () => {
    let l = simsFromLine('.dc V1 0 5 0.1');
    l = addSim(l, '.dc V1 0 2 0.01');
    l = renameSim(l, l.active, 'Fino');
    l = setSimView(l, l.active, {
      panes: [{ traces: [{ expr: 'V(out)' }] }],
      plot: 'dc1',
      plotState: { scale: 'v-sweep', xRange: [0.5, 1.5], cursors: { a: 1, ta: 'V(out)' }, cursorMode: true },
    });
    const doc = setAnalysisLine(docWith('.dc V1 0 5 0.1'), '.dc V1 0 2 0.01');
    const saved = withSims(doc, l);
    const hidden = saved.texts.filter(isDataText);
    expect(hidden.length).toBe(1);
    expect(hidden[0].text.startsWith('.sims ')).toBe(true);
    // ida y vuelta por el archivo
    const back = parseAsc(serializeAsc(saved));
    const t = takeSims(back, findAnalysis(back)?.value ?? null);
    expect(t.sims).toEqual(l);
    expect(t.doc.texts.some(isDataText)).toBe(false);
    // guardar de nuevo reemplaza el comentario anterior
    expect(withSims(saved, l).texts.filter(isDataText).length).toBe(1);
  });
  it('una sola simulación sin nada propio no agrega nada', () => {
    const doc = docWith('.tran 1m');
    const one = simsFromLine('.tran 1m');
    expect(withSims(doc, one)).toBe(doc);
    expect(withSims(doc, setSimView(one, one.active, { panes: [{ traces: [{ expr: 'V(out)' }] }] }))).toBe(doc);
  });
  it('si el archivo se editó en LTspice, la activa toma su comando', () => {
    let l = simsFromLine('.tran 1m');
    l = addSim(l, '.tran 2m');
    const saved = withSims(docWith('.tran 2m'), l);
    const edited = { ...saved, texts: saved.texts.map((t) => (t.text === '.tran 2m' ? { ...t, text: '.tran 3m' } : t)) };
    const { sims } = takeSims(edited, '.tran 3m');
    expect(sims.items.map((s) => s.line)).toEqual(['.tran 1m', '.tran 3m']);
    // y elige la que coincide
    expect(activeSim(takeSims(edited, '.tran 1m').sims)?.line).toBe('.tran 1m');
  });
  it('sin lista (o ilegible), una simulación con el comando del esquemático', () => {
    expect(takeSims(docWith('.op'), '.op').sims.items.map((s) => s.line)).toEqual(['.op']);
    const bad = { ...docWith('.op'), texts: [...docWith('.op').texts, { x: 0, y: 0, align: 'Left', size: 0, kind: 'comment' as const, text: '.sims ###' }] };
    const t = takeSims(bad, '.op');
    expect(t.sims.items.length).toBe(1);
    expect(t.doc.texts.length).toBe(1);
  });
});

describe('comando de análisis en el esquemático', () => {
  it('reemplaza el que hay o agrega uno', () => {
    expect(findAnalysis(setAnalysisLine(docWith('.tran 1m'), '.ac dec 10 1 1k'))?.value).toBe('.ac dec 10 1 1k');
    const added = setAnalysisLine(emptyDoc(), '.op');
    expect(added.texts.map((t) => [t.kind, t.text])).toEqual([['directive', '.op']]);
    // los de ngspice van como comentario
    expect(setAnalysisLine(docWith('.tran 1m'), '.pz in 0 out 0 vol pz').texts[0].kind).toBe('comment');
    const d = docWith('.op');
    expect(setAnalysisLine(d, '.op')).toBe(d);
  });
});

describe('descripción completa y errores de polos y ceros', () => {
  it('la descripción tiene más detalle que el nombre', () => {
    expect(analysisDetail('.dc V1 0 5 0.1')).toBe('Barrido DC V1 0–5 V paso 100 mV');
    expect(analysisDetail('.ac dec 100 10 100k')).toBe('AC (Bode) 10 Hz–100 kHz, 100 pts/dec');
    expect(analysisDetail('.tran 0 20m 0 1u')).toBe('Transitorio 0–20 ms, paso máx. 1 µs');
    expect(analysisDetail('.pz in 0 out 0 vol pz')).toBe('Polos y ceros V(in)→V(out)');
    expect(analysisDetail('.pz  0  0 vol pz')).toBe('Polos y ceros (sin entrada ni salida elegidas)');
  });
  it('un .pz sin nodos no llega a ngspice y explica por qué', () => {
    expect(pzProblem('.pz  0  0 vol pz')).toMatch(/no están elegidos/);
    expect(pzProblem('.pz 0 0 0 0 vol pz')).toMatch(/no están elegidos/);
    expect(pzProblem('.pz in in out 0 vol pz')).toMatch(/mismo nodo/);
    expect(pzProblem('.pz in 0 out 0 vol pz')).toBeUndefined();
    expect(pzProblem('.tran 1m')).toBeUndefined();
  });
  it('un .pz con nodos vacíos se sigue leyendo (la barra muestra sus campos)', () => {
    expect(parseAnalysis('.pz  0  0 vol pz')).toMatchObject({ kind: 'pz', inP: '', inN: '0', outP: '', outN: '0' });
    expect(parseAnalysis('.pz in 0  0 vol pol')).toMatchObject({ inP: 'in', outP: '', which: 'pol' });
    expect(parseAnalysis('.pz in 0 out 0 vol pz')).toMatchObject({ inP: 'in', outP: 'out' });
  });
  it('"Input is shorted" del log se explica', () => {
    expect(pzLogErrors(['doAnalyses: Input is shorted', 'run simulation(s) aborted'])[0]).toMatch(/cortocircuito/);
    expect(pzLogErrors(['ok'])).toEqual([]);
  });
});

describe('análisis incompletos', () => {
  it('se leen con los campos que faltan vacíos (la barra muestra sus cajas)', () => {
    expect(parseAnalysis('.tf V()')).toEqual({ kind: 'tf', out: '', src: '' });
    expect(parseAnalysis('.tf V(out)')).toEqual({ kind: 'tf', out: 'out', src: '' });
    expect(parseAnalysis('.dc  0 5 0.1')).toMatchObject({ kind: 'dc', sweeps: [{ src: '', start: '0', stop: '5', step: '0.1' }] });
    expect(parseAnalysis('.noise V()  dec 20 1 1meg')).toMatchObject({ kind: 'noise', out: '', src: '', sweep: { points: '20', start: '1', stop: '1meg' } });
    expect(parseAnalysis('.sens V()')).toMatchObject({ kind: 'sens', out: '' });
    expect(parseAnalysis('.ac dec 100')).toMatchObject({ kind: 'ac', sweep: { points: '100', start: '', stop: '' } });
    expect(parseAnalysis('.tran')).toMatchObject({ kind: 'tran', tstop: '' });
    expect(parseAnalysis('.tran 1m steady')).toBeNull();
  });
  it('al correr se dice qué falta', () => {
    expect(analysisProblem('.tf V()')).toMatch(/Función de transferencia DC.*salida.*fuente/i);
    expect(analysisProblem('.tf V(out) V1')).toBeUndefined();
    expect(analysisProblem('.dc  0 5 0.1')).toMatch(/fuente/);
  });
  it('una simulación nueva toma los valores de otra, pero las redes y fuentes de este circuito', () => {
    const info = { nets: ['0', 'Vx'], sources: ['V1'] };
    expect(reuseLine('.tf V()', 'tf', info)).toBe('.tf V(Vx) V1');
    expect(reuseLine('.tf V(out) V9', 'tf', info)).toBe('.tf V(Vx) V1');
    expect(reuseLine('.dc V9 0 2 0.01', 'dc', info)).toBe('.dc V1 0 2 0.01');
    expect(reuseLine('.noise V(out) V9 dec 7 1 1k', 'noise', info)).toBe('.noise V(Vx) V1 dec 7 1 1k');
  });
});
