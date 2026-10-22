import { describe, expect, it } from 'vitest';
import { emptyDoc, type AscDoc } from '../../src/asc/model.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';
import {
  activeAsc,
  applyValues,
  simsWithValue,
  valueChanges,
  addSim,
  blankVariant,
  cloneVariant,
  duplicateSim,
  lineOf,
  recordRun,
  removeSim,
  removeVariant,
  renameSim,
  renameVariant,
  selectSim,
  simLabel,
  storeActive,
  uniqueLabel,
  variantOf,
} from '../../src/project/project.ts';
import { newProject, type Project } from '../../src/project/turbo.ts';

const asc = (line: string, wires = 1): string => {
  const d: AscDoc = {
    ...emptyDoc(),
    wires: Array.from({ length: wires }, (_, i) => ({ x1: 0, y1: i * 16, x2: 64, y2: i * 16 })),
    texts: [{ x: 0, y: 200, align: 'Left', size: 2, kind: 'directive', text: line }],
  };
  return serializeAsc(d);
};

function twoSims(): Project {
  let p = newProject('P');
  p = addSim(p, asc('.tran 10m'))!.project;
  p = addSim(p, asc('.ac dec 10 1 1meg'))!.project;
  return p;
}

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
    const [a] = variantOf(p).sims;
    expect(simLabel(a)).toBe('Transitorio 0–10 ms');
    p = renameSim(p, a.id, '  Arranque ');
    expect(simLabel(variantOf(p).sims[0])).toBe('Arranque');
    const d = duplicateSim(p, a.id)!;
    expect(variantOf(d.project).sims.map((s) => simLabel(s))).toEqual(['Arranque', 'Arranque (copia)', 'AC 1 Hz–1 MHz']);
    expect(simLabel(variantOf(duplicateSim(d.project, a.id)!.project).sims[1])).toBe('Arranque (copia) (2)');
    p = renameSim(p, a.id, '');
    expect(variantOf(p).sims[0].name).toBeUndefined();
  });

  it('borrar pasa a la siguiente; la última deja su circuito en la base', () => {
    let p = twoSims();
    const [a, b] = variantOf(p).sims;
    p = removeSim(selectSim(p, a.id), a.id);
    expect(variantOf(p).activeSim).toBe(b.id);
    p = removeSim(p, b.id);
    expect(variantOf(p).activeSim).toBe('');
    expect(variantOf(p).base).toContain('WIRE');
    expect(lineOf(variantOf(p).base)).toBe('');
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

describe('variantes', () => {
  it('clonar copia todo con ids nuevos; vacía no trae nada', () => {
    let p = twoSims();
    p = recordRun(p, variantOf(p).activeSim, asc('.ac dec 10 1 1meg'), 1).project;
    const src = variantOf(p);
    const c = cloneVariant(p, src.id);
    const v = variantOf(c.project);
    expect(v.name).toBe('Variante 1 (copia)');
    expect(v.sims.map((s) => s.asc)).toEqual(src.sims.map((s) => s.asc));
    expect(v.sims[1].runs).toHaveLength(1);
    expect(v.sims.some((s) => src.sims.some((x) => x.id === s.id))).toBe(false);
    expect(v.activeSim).toBe(v.sims[1].id);
    const b = blankVariant(c.project);
    expect(variantOf(b.project).sims).toEqual([]);
    expect(variantOf(b.project).name).toBe('Variante 1 (2)');
  });

  it('renombrar y borrar (nunca la última)', () => {
    let p = cloneVariant(twoSims(), twoSims().variants[0].id).project;
    p = cloneVariant(p, p.variants[0].id).project;
    p = renameVariant(p, p.variants[0].id, 'Pasabajos');
    expect(p.variants[0].name).toBe('Pasabajos');
    expect(renameVariant(p, p.variants[0].id, '  ')).toBe(p);
    const only = newProject('x');
    expect(removeVariant(only, only.variants[0].id)).toBe(only);
    const active = p.activeVariant;
    p = removeVariant(p, active);
    expect(p.variants.some((v) => v.id === active)).toBe(false);
    expect(p.variants.some((v) => v.id === p.activeVariant)).toBe(true);
  });

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
    let p = newProject('P');
    p = addSim(p, withR('1k'))!.project;
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
