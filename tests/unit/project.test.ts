import { describe, expect, it } from 'vitest';
import { emptyDoc, type AscDoc } from '../../src/asc/model.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';
import {
  activeAsc,
  mergeFiles,
  projectFileKind,
  applyValues,
  simsWithValue,
  valueChanges,
  addSim,
  duplicateSim,
  freeBenchName,
  lineOf,
  recordRun,
  removeSim,
  renameSim,
  selectSim,
  simLabel,
  storeActive,
  uniqueLabel,
  variantOf,
} from '../../src/project/project.ts';
import { asBenches, BENCHES, EMPTY_ASC, isDefaultBenchName, newProject, type Project } from '../../src/project/turbo.ts';

const asc = (line: string, wires = 1): string => {
  const d: AscDoc = {
    ...emptyDoc(),
    wires: Array.from({ length: wires }, (_, i) => ({ x1: 0, y1: i * 16, x2: 64, y2: i * 16 })),
    texts: [{ x: 0, y: 200, align: 'Left', size: 2, kind: 'directive', text: line }],
  };
  return serializeAsc(d);
};

// dos testbenches sin nombre propio: uno con .tran y uno sin nombre con .ac (el activo)
function twoSims(): Project {
  let p = storeActive(newProject('P'), asc('.tran 10m'));
  p = addSim(p, asc('.ac dec 10 1 1meg'))!.project;
  return p;
}

describe('testbenches (#180)', () => {
  it('un proyecto nuevo tiene un testbench vacío', () => {
    const p = newProject('P');
    expect(p.variants).toHaveLength(1);
    expect(p.variants[0].sims.map((s) => [s.name, s.asc])).toEqual([[undefined, EMPTY_ASC]]);
    expect(simLabel(p.variants[0].sims[0])).toBe('Sin análisis');
    expect(variantOf(p).activeSim).toBe(p.variants[0].sims[0].id);
    expect(freeBenchName(p)).toBe('Testbench 2');
  });

  it('el «Testbench N» por defecto de archivos viejos pasa a ser automático; los propios quedan', () => {
    const old: Project = { ...newProject('P'), variants: [{ id: BENCHES, name: 'P', base: EMPTY_ASC, activeSim: 'x1', sims: [
      { id: 'x1', name: 'Testbench 3', asc: asc('.tran 100m'), runs: [] },
      { id: 'x2', name: 'Mi bode', asc: asc('.ac dec 10 100 100k'), runs: [] },
    ] }] };
    const p = asBenches({ ...old, variants: [{ ...old.variants[0], id: 'v' }], activeVariant: 'v' });
    expect(p.variants[0].sims.map((s) => [s.name, simLabel(s)])).toEqual([[undefined, 'Tran 0 - 100m'], ['Mi bode', 'Mi bode']]);
    expect(isDefaultBenchName('Testbench 12')).toBe(true);
    expect(isDefaultBenchName('Testbench A')).toBe(false);
  });

  it('las variantes (versión 1) se aplanan: cada simulación es un testbench', () => {
    const v = (id: string, name: string, sims: string[]) => ({ id, name, base: asc(''), activeSim: sims.length ? `${id}s1` : '', sims: sims.map((l, i) => ({ id: `${id}s${i}`, asc: asc(l), runs: [] })) });
    const old: Project = { name: 'P', created: 0, modified: 0, files: [], activeVariant: 'b', variants: [v('a', 'Pasabajos', ['.tran 10m', '.ac dec 10 1 1meg']), v('b', 'Pasaaltos', ['.op']), v('c', 'Vacía', [])] };
    const p = asBenches(old);
    expect(p.variants).toHaveLength(1);
    expect(p.variants[0].id).toBe(BENCHES);
    // una variante con varias simulaciones es un grupo
    expect(p.variants[0].sims.map((s) => [s.name, s.group])).toEqual([[undefined, 'g_a'], [undefined, 'g_a'], ['Pasaaltos', undefined], ['Vacía', undefined]]);
    expect(p.groups).toEqual([{ id: 'g_a', name: 'Pasabajos' }]);
    // el activo es el de la variante activa
    expect(simOfActive(p)).toBe('bs0');
    expect(asBenches(p)).toBe(p);
  });
});

const simOfActive = (p: Project) => variantOf(p).activeSim;

describe('simulaciones', () => {
  it('cada una tiene su circuito; la nueva va después de la activa y queda activa', () => {
    let p = twoSims();
    const [a, b] = variantOf(p).sims;
    p = selectSim(p, a.id);
    const r = addSim(p, asc('.op'))!;
    expect(variantOf(r.project).sims.map((s) => s.id)).toEqual([a.id, r.id, b.id]);
    expect(variantOf(r.project).activeSim).toBe(r.id);
    expect(lineOf(activeAsc(variantOf(r.project)))).toBe('.op');
  });

  it('el circuito editado se guarda en la activa y no toca las otras', () => {
    let p = twoSims();
    const [a, b] = variantOf(p).sims;
    p = storeActive(p, asc('.ac dec 10 1 1meg', 3));
    expect(variantOf(p).sims.find((s) => s.id === b.id)!.asc).toContain('WIRE 0 32 64 32');
    expect(variantOf(p).sims.find((s) => s.id === a.id)!.asc).not.toContain('WIRE 0 32 64 32');
    expect(storeActive(p, variantOf(p).sims[1].asc)).toBe(p);
  });

  it('nombre automático, propio y copia', () => {
    let p = twoSims();
    const [a, b] = variantOf(p).sims;
    expect(simLabel(a)).toBe('Tran 0 - 10m');
    expect(simLabel(b)).toBe('AC 1Hz - 1MHz');
    // el automático sigue al análisis y a sus límites
    const a2 = variantOf(storeActive(selectSim(p, a.id), asc('.tran 100m'))).sims[0];
    expect(simLabel(a2)).toBe('Tran 0 - 100m');
    expect(simLabel(variantOf(storeActive(selectSim(p, a.id), asc('.op'))).sims[0])).toBe('.OP');
    p = renameSim(p, a.id, '  Arranque ');
    expect(simLabel(variantOf(p).sims[0])).toBe('Arranque');
    const d = duplicateSim(p, a.id)!;
    expect(variantOf(d.project).sims.map((s) => simLabel(s))).toEqual(['Arranque', 'Arranque (copia)', 'AC 1Hz - 1MHz']);
    // el nombre propio queda fijo aunque cambie el análisis
    expect(simLabel(variantOf(storeActive(selectSim(p, a.id), asc('.op'))).sims[0])).toBe('Arranque');
    // la copia de uno automático sigue siendo automática
    expect(variantOf(duplicateSim(p, b.id)!.project).sims[2].name).toBeUndefined();
    // sin nombre no: un testbench siempre tiene nombre
    expect(renameSim(p, a.id, '')).toBe(p);
  });

  it('borrar pasa al siguiente; el último no se borra', () => {
    let p = twoSims();
    const [a, b] = variantOf(p).sims;
    p = removeSim(selectSim(p, a.id), a.id);
    expect(variantOf(p).activeSim).toBe(b.id);
    expect(removeSim(p, b.id)).toBe(p);
    expect(lineOf(activeAsc(variantOf(p)))).toBe('.ac dec 10 1 1meg');
  });
});

describe('corridas', () => {
  it('una nueva si cambió el circuito; si no, sólo la fecha', () => {
    let p = twoSims();
    const id = variantOf(p).activeSim;
    p = recordRun(p, id, asc('.ac dec 10 1 1meg'), 1000).project;
    p = recordRun(p, id, asc('.ac dec 10 1 1meg'), 2000).project;
    expect(variantOf(p).sims[1].runs.map((r) => r.time)).toEqual([2000]);
    p = recordRun(p, id, asc('.ac dec 10 1 1meg', 2), 3000, '+W').project;
    expect(variantOf(p).sims[1].runs.map((r) => [r.time, r.summary])).toEqual([[2000, undefined], [3000, '+W']]);
  });
});

describe('nombres', () => {
  it('nombres únicos', () => {
    expect(uniqueLabel('A', ['a'])).toBe('A (2)');
    expect(uniqueLabel('A (2)', ['A', 'a (2)'])).toBe('A (3)');
    expect(uniqueLabel('B', ['A'])).toBe('B');
  });
});

describe('aviso de valores', () => {
  const withR = (value: string, line = '.tran 10m'): string =>
    serializeAsc({
      ...emptyDoc(),
      symbols: [{ type: 'res', x: 0, y: 0, orient: 'R0', windows: new Map(), attrs: new Map([['InstName', 'R1'], ['Value', value]]) }],
      texts: [{ x: 0, y: 200, align: 'Left', size: 2, kind: 'directive', text: line }],
    });
  it('detecta el cambio, encuentra las otras simulaciones y lo aplica', () => {
    let p = storeActive(newProject('P'), withR('1k'));
    p = addSim(p, withR('1k', '.ac dec 10 1 1meg'))!.project;
    p = addSim(p, withR('4k7', '.op'))!.project;
    const [a, b] = variantOf(p).sims;
    p = selectSim(p, a.id);
    const prev = parseAsc(withR('1k'));
    const next = parseAsc(withR('2k2'));
    const ch = valueChanges(prev, next);
    expect(ch).toEqual([{ inst: 'R1', from: '1k', to: '2k2' }]);
    expect(simsWithValue(variantOf(p), ch[0])).toEqual([b.id]);
    expect(applyValues(parseAsc(b.asc), ch).symbols[0].attrs.get('Value')).toBe('2k2');
    expect(valueChanges(prev, prev)).toEqual([]);
  });
});

describe('archivos del proyecto', () => {
  const f = (name: string, text: string) => ({ name, kind: 'model' as const, text });
  it('igual no pregunta; distinto pregunta y respeta la respuesta', async () => {
    const files = [f('a.lib', 'x')];
    const asked: string[] = [];
    const ask = (c: 'replace' | 'keep' | 'rename') => async (n: string) => (asked.push(n), c);
    expect((await mergeFiles(files, [f('A.lib', 'x')], ask('keep'))).added).toEqual([]);
    expect(asked).toEqual([]);
    expect((await mergeFiles(files, [f('a.lib', 'y')], ask('replace'))).files).toEqual([f('a.lib', 'y')]);
    expect((await mergeFiles(files, [f('a.lib', 'y')], ask('keep'))).files).toEqual(files);
    const r = await mergeFiles(files, [f('a.lib', 'y'), f('b.sub', 'z')], ask('rename'));
    expect(r.files.map((x) => x.name)).toEqual(['a.lib', 'a (2).lib', 'b.sub']);
    expect(r.added).toEqual(['a (2).lib', 'b.sub']);
  });
  it('tipo por extensión', () => {
    expect(projectFileKind('x.ASY')).toBe('symbol');
    expect(projectFileKind('x.sub')).toBe('model');
    expect(projectFileKind('x.asc')).toBeNull();
  });
});

describe('grupos y propagar valores (#180)', () => {
  const withR = (value: string, line: string): string =>
    serializeAsc({
      ...emptyDoc(),
      symbols: [{ type: 'res', x: 0, y: 0, orient: 'R0', windows: new Map(), attrs: new Map([['InstName', 'R1'], ['Value', value]]) }],
      texts: [{ x: 0, y: 200, align: 'Left', size: 2, kind: 'directive', text: line }],
    });
  it('propaga sólo dentro del grupo y a los que tienen el componente', async () => {
    const { addGroup, setBenchGroup, groupPeersWith, propagateAttrs, removeGroup } = await import('../../src/project/project.ts');
    let p = storeActive(newProject('P'), withR('1k', '.tran 1m'));
    const a = variantOf(p).sims[0].id;
    const b = addSim(p, withR('1k', '.ac dec 10 1 1k'))!;
    p = b.project;
    const c = addSim(p, withR('1k', '.op'))!;
    p = c.project;
    const g = addGroup(p, 'Filtro');
    p = setBenchGroup(setBenchGroup(g.project, a, g.id), b.id, g.id);
    expect(groupPeersWith(p, a, 'R1', 'res')).toEqual([b.id]);
    p = propagateAttrs(p, [b.id], 'R1', 'res', new Map([['InstName', 'R1'], ['Value', '2k2']]));
    const val = (id: string) => parseAsc(variantOf(p).sims.find((s) => s.id === id)!.asc).symbols[0].attrs.get('Value');
    expect([val(b.id), val(c.id)]).toEqual(['2k2', '1k']);
    // el último grupo no se saca; con otro, sus testbenches pasan a ése
    expect(removeGroup(p, g.id)).toBe(p);
    const h = addGroup(p, 'Otro');
    p = removeGroup(h.project, g.id);
    expect(variantOf(p).sims.filter((s) => s.group === h.id).map((s) => s.id)).toEqual([a, b.id]);
    expect(groupPeersWith(p, a, 'R1', 'res')).toEqual([b.id]);
  });
  it('placeBench: reordena dentro del grupo y mueve entre grupos (#218)', async () => {
    const { withGroups, addGroup, placeBench } = await import('../../src/project/project.ts');
    let p = withGroups(storeActive(newProject('P'), withR('1k', '.tran 1m')));
    const g1 = p.groups[0].id;
    const a = variantOf(p).sims[0].id;
    const b = addSim(p, withR('1k', '.op'))!;
    const c = addSim(b.project, withR('1k', '.op'))!;
    p = withGroups(c.project);
    const order = (q: typeof p) => variantOf(q).sims.map((s) => s.id);
    expect(order(p)).toEqual([a, b.id, c.id]);
    p = placeBench(p, c.id, g1, a);
    expect(order(p)).toEqual([c.id, a, b.id]);
    p = placeBench(p, c.id, g1); // al final del grupo
    expect(order(p)).toEqual([a, b.id, c.id]);
    expect(placeBench(p, c.id, g1)).toBe(p); // sin cambios
    expect(placeBench(p, a, g1, a)).toBe(p);
    const g2 = addGroup(p, 'Otro');
    p = placeBench(g2.project, a, g2.id);
    expect(variantOf(p).sims.find((s) => s.id === a)!.group).toBe(g2.id);
    p = placeBench(p, b.id, g2.id, a);
    expect(order(p)).toEqual([c.id, b.id, a]);
    expect(variantOf(p).sims.filter((s) => s.group === g2.id).map((s) => s.id)).toEqual([b.id, a]);
  });
  it('withGroups: todo testbench queda en un grupo (crea «Group 1» si no hay)', async () => {
    const { withGroups, addGroup } = await import('../../src/project/project.ts');
    const p = withGroups(newProject('P'));
    expect(p.groups.map((g) => g.name)).toHaveLength(1);
    expect(variantOf(p).sims.every((s) => s.group === p.groups[0].id)).toBe(true);
    expect(withGroups(p)).toBe(p);
    // los nuevos caen en el grupo del activo
    const g = addGroup(p, 'B');
    const q = addSim(g.project, EMPTY_ASC)!.project;
    expect(variantOf(q).sims.at(-1)!.group).toBe(p.groups[0].id);
  });

  it('parámetros y variables del testbench', async () => {
    const { benchParams, benchVariables, setBenchParams } = await import('../../src/schematic/benchParams.ts');
    const d = parseAsc(withR('{R}', '.tran 1m\\n.param R=1k C=1n\\n.step param G list 1 2'));
    expect(benchParams(d)).toEqual([['R', '1k'], ['C', '1n']]);
    expect(benchVariables(d).map((v) => v.name)).toEqual(['G']);
    const e = setBenchParams(d, [['R', '2k']]);
    expect(benchParams(e)).toEqual([['R', '2k']]);
    expect(e.texts.some((tt) => tt.text.includes('.tran 1m') && !tt.text.includes('.param'))).toBe(true);
  });
});
