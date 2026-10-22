import { describe, expect, it } from 'vitest';
import { emptyDoc, type AscDoc } from '../../src/asc/model.ts';
import { parseAsc as parseAscText } from '../../src/asc/parse.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';
import { findAnalysis } from '../../src/schematic/directivesEdit.ts';
import { addSim, renameSim, withSims } from '../../src/sim/simList.ts';
import { hashText, isTurboText, newProject, parseTurbo, projectFromAsc, serializeTurbo, type Project } from '../../src/project/turbo.ts';

const docWith = (line: string): AscDoc => ({
  ...emptyDoc(),
  wires: [{ x1: 0, y1: 0, x2: 64, y2: 0 }],
  texts: [{ x: 0, y: 200, align: 'Left', size: 2, kind: 'directive', text: line }],
});

/** Proyecto con dos simulaciones y un historial con corridas repetidas */
function sample(): Project {
  const p = projectFromAsc(docWith('.tran 10m'), 'Filtro RC.asc');
  const v = p.variants[0];
  const a = serializeAsc(docWith('.tran 10m'));
  const b = serializeAsc(docWith('.tran 20m'));
  v.sims[0].runs = [
    { id: 'r1', time: Date.parse('2026-10-22T15:00:00Z'), asc: a },
    { id: 'r2', time: Date.parse('2026-10-22T15:05:00Z'), asc: b, summary: 'R1 1k→2k2' },
    { id: 'r3', time: Date.parse('2026-10-22T15:10:00Z'), asc: a },
  ];
  v.sims.push({ id: 's2', name: 'AC', asc: serializeAsc(docWith('.ac dec 10 1 1meg')), runs: [] });
  p.files = [{ name: 'mio.sub', kind: 'model', text: '.subckt mio a b\nR1 a b 1k\n.ends\n' }];
  return p;
}

describe('.turbo', () => {
  it('ida y vuelta sin pérdidas', async () => {
    const p = sample();
    const text = await serializeTurbo(p);
    expect(isTurboText(text)).toBe(true);
    const { project, warnings } = await parseTurbo(text);
    expect(warnings).toEqual([]);
    expect(project).toEqual(p);
  });

  it('cada .asc está una sola vez en los blobs', async () => {
    const json = JSON.parse(await serializeTurbo(sample()));
    // base = actual de la 1.ª = corridas r1 y r3; r2; la de AC
    expect(Object.keys(json.blobs)).toHaveLength(3);
    const runs = json.variants[0].sims[0].runs;
    expect(runs[0].asc).toBe(runs[2].asc);
    expect(runs[0].time).toBe('2026-10-22T15:00:00.000Z');
    for (const [h, t] of Object.entries(json.blobs)) expect(await hashText(t as string)).toBe(h);
  });

  it('un blob corrupto sólo daña lo que lo usa', async () => {
    const json = JSON.parse(await serializeTurbo(sample()));
    const r2 = json.variants[0].sims[0].runs[1].asc;
    json.blobs[r2] = json.blobs[r2].replace('20m', '30m');
    const { project, warnings } = await parseTurbo(JSON.stringify(json));
    const runs = project.variants[0].sims[0].runs;
    expect(runs.map((r) => !!r.damaged)).toEqual([false, true, false]);
    expect(runs[0].asc).toContain('.tran 10m');
    expect(project.variants[0].sims[1].asc).toContain('.ac dec');
    expect(warnings).toEqual(['«Variante 1»: una corrida del historial está dañada']);
    // al volver a guardar, la dañada no se escribe
    const again = JSON.parse(await serializeTurbo(project));
    expect(again.variants[0].sims[0].runs.map((r: { id: string }) => r.id)).toEqual(['r1', 'r3']);
  });

  it('sin el circuito actual se recupera el de la última corrida sana', async () => {
    const json = JSON.parse(await serializeTurbo(sample()));
    const sim = json.variants[0].sims[0];
    sim.current = 'sha256:no-existe';
    sim.runs[2].asc = 'sha256:tampoco';
    const { project, warnings } = await parseTurbo(JSON.stringify(json));
    expect(project.variants[0].sims[0].asc).toContain('.tran 20m');
    expect(warnings.some((w) => /circuito actual está dañado; se recuperó el de la última corrida/.test(w))).toBe(true);
  });

  it('rechaza lo que no es un .turbo', async () => {
    await expect(parseTurbo('Version 4\nSHEET 1 0 0')).rejects.toThrow('no es JSON');
    await expect(parseTurbo('{"format":"otro"}')).rejects.toThrow('No es un archivo de TurboSpice');
    await expect(parseTurbo('{"format":"turbospice","version":99,"variants":[{}]}')).rejects.toThrow('versión más nueva');
    await expect(parseTurbo('{"format":"turbospice","version":1,"variants":[]}')).rejects.toThrow('no tiene variantes');
  });

  it('la simulación o variante activa inexistente vuelve a una válida', async () => {
    const json = JSON.parse(await serializeTurbo(sample()));
    json.activeVariant = 'nada';
    json.variants[0].activeSim = 'nada';
    const { project } = await parseTurbo(JSON.stringify(json));
    expect(project.activeVariant).toBe(project.variants[0].id);
    expect(project.variants[0].activeSim).toBe('');
  });
});

describe('proyecto desde un .asc', () => {
  it('una simulación por cada análisis de la lista ;.sims, con su nombre', () => {
    let l = addSim({ items: [], active: '' }, '.tran 10m');
    l = addSim(l, '.ac dec 10 1 1meg');
    l = renameSim(l, l.active, 'Bode');
    const p = projectFromAsc(withSims(docWith('.ac dec 10 1 1meg'), l), 'Filtro RC.asc');
    expect(p.name).toBe('Filtro RC');
    const v = p.variants[0];
    expect(v.sims.map((s) => s.name)).toEqual([undefined, 'Bode']);
    expect(v.sims.map((s) => findAnalysis(parseAscText(s.asc))?.value)).toEqual(['.tran 10m', '.ac dec 10 1 1meg']);
    expect(v.activeSim).toBe(v.sims[1].id);
    // el .asc de cada simulación ya no lleva la lista
    expect(v.sims.every((s) => !s.asc.includes(';.sims'))).toBe(true);
  });

  it('sin comando de análisis: sólo la base', () => {
    const p = projectFromAsc({ ...emptyDoc(), wires: [{ x1: 0, y1: 0, x2: 16, y2: 0 }] }, 'x.asc');
    expect(p.variants[0].sims).toEqual([]);
    expect(p.variants[0].base).toContain('WIRE 0 0 16 0');
  });

  it('proyecto nuevo: una variante vacía', () => {
    const p = newProject('Sin título');
    expect(p.variants).toHaveLength(1);
    expect(p.activeVariant).toBe(p.variants[0].id);
  });
});
