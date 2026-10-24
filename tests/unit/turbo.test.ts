import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
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
    expect(json.version).toBe(2);
    // sin nombre propio no se guarda `name`: el automático sigue al análisis
    expect(json.testbenches.map((b: { name?: string }) => b.name)).toEqual([undefined, 'AC']);
    const runs = json.testbenches[0].runs;
    expect(runs[0].asc).toBe(runs[2].asc);
    expect(runs[0].time).toBe('2026-10-22T15:00:00.000Z');
    for (const [h, t] of Object.entries(json.blobs)) expect(await hashText(t as string)).toBe(h);
  });

  it('un blob corrupto sólo daña lo que lo usa', async () => {
    const json = JSON.parse(await serializeTurbo(sample()));
    const r2 = json.testbenches[0].runs[1].asc;
    json.blobs[r2] = json.blobs[r2].replace('20m', '30m');
    const { project, warnings } = await parseTurbo(JSON.stringify(json));
    const runs = project.variants[0].sims[0].runs;
    expect(runs.map((r) => !!r.damaged)).toEqual([false, true, false]);
    expect(runs[0].asc).toContain('.tran 10m');
    expect(project.variants[0].sims[1].asc).toContain('.ac dec');
    expect(warnings).toEqual(['«Tran 0 - 10m»: una corrida del historial está dañada']);
    // al volver a guardar, la dañada no se escribe
    const again = JSON.parse(await serializeTurbo(project));
    expect(again.testbenches[0].runs.map((r: { id: string }) => r.id)).toEqual(['r1', 'r3']);
  });

  it('sin el circuito actual se recupera el de la última corrida sana', async () => {
    const json = JSON.parse(await serializeTurbo(sample()));
    const sim = json.testbenches[0];
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
    await expect(parseTurbo('{"format":"turbospice","version":2,"testbenches":[]}')).rejects.toThrow('no tiene testbenches');
  });

  it('el testbench activo inexistente vuelve al primero', async () => {
    const json = JSON.parse(await serializeTurbo(sample()));
    json.activeTestbench = 'nada';
    const { project } = await parseTurbo(JSON.stringify(json));
    expect(project.activeVariant).toBe(project.variants[0].id);
    expect(project.variants[0].activeSim).toBe(project.variants[0].sims[0].id);
  });

  it('un .turbo de la versión 1 (variantes) se abre como testbenches', async () => {
    const a = serializeAsc(docWith('.tran 10m'));
    const h = await hashText(a);
    const v1 = { format: 'turbospice', version: 1, name: 'Viejo', created: '', modified: '', files: [], activeVariant: 'v2', blobs: { [h]: a },
      variants: [{ id: 'v1', name: 'Uno', base: h, activeSim: '', sims: [] }, { id: 'v2', name: 'Dos', base: h, activeSim: 's1', sims: [{ id: 's1', current: h, runs: [] }] }] };
    const { project, warnings } = await parseTurbo(JSON.stringify(v1));
    expect(warnings).toEqual([]);
    expect(project.variants[0].sims.map((s) => s.name)).toEqual(['Uno', 'Dos']);
    expect(project.variants[0].activeSim).toBe('s1');
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

  it('sin comando de análisis: un testbench con el circuito', () => {
    const p = projectFromAsc({ ...emptyDoc(), wires: [{ x1: 0, y1: 0, x2: 16, y2: 0 }] }, 'x.asc');
    expect(p.variants[0].sims.map((s) => s.name)).toEqual(['x']);
    expect(p.variants[0].sims[0].asc).toContain('WIRE 0 0 16 0');
  });

  it('proyecto nuevo: un testbench vacío', () => {
    const p = newProject('Sin título');
    expect(p.variants).toHaveLength(1);
    expect(p.variants[0].sims).toHaveLength(1);
    expect(p.activeVariant).toBe(p.variants[0].id);
  });
});

// Guardado riguroso: lo que se guarda y se vuelve a abrir es exactamente lo mismo, y guardar dos
// veces seguidas da el mismo archivo (si no, Drive y el disco verían cambios donde no los hay)
describe('.turbo: ida y vuelta de todos los ejemplos', () => {
  const dir = 'public/examples';
  const turbos = readdirSync(dir).filter((f) => f.endsWith('.turbo'));
  const ascs = readdirSync('examples').filter((f) => f.endsWith('.asc'));

  it.each(turbos)('%s: abrir → guardar → abrir da el mismo proyecto, y guardar es estable', async (f) => {
    const { project, warnings } = await parseTurbo(readFileSync(`${dir}/${f}`, 'utf8'));
    expect(warnings).toEqual([]);
    const once = await serializeTurbo(project);
    const back = await parseTurbo(once);
    expect(back.warnings).toEqual([]);
    expect(back.project).toEqual(project);
    expect(await serializeTurbo(back.project)).toBe(once);
  });

  it.each(ascs)('%s como proyecto: ida y vuelta sin pérdidas', async (f) => {
    const p = projectFromAsc(parseAscText(readFileSync(`examples/${f}`, 'latin1')), f);
    const { project } = await parseTurbo(await serializeTurbo(p));
    expect(project).toEqual(p);
  });

  it('nombres con acentos, comillas, emojis y caracteres de control en el texto', async () => {
    const p = sample();
    p.name = 'Filtro d\'O «ñ» "x" 🎛️ \ /';
    p.variants[0].sims[0].name = 'Testbench — 2 <a>&';
    p.variants[0].name = p.name;
    p.files.push({ name: 'ü.lib', kind: 'model', text: '* línea con \t tab y \u0000 nulo\n.model D1 D(Is=1e-14)\n' });
    const { project } = await parseTurbo(await serializeTurbo(p));
    expect(project).toEqual(p);
  });

  it('un archivo cortado a la mitad (subida interrumpida) no se abre como si estuviera bien', async () => {
    const text = await serializeTurbo(sample());
    for (const cut of [1, 0.5, 0.9, 0.99].map((x) => Math.floor(text.length * x) - 1)) {
      await expect(parseTurbo(text.slice(0, cut))).rejects.toThrow();
    }
  });
});
