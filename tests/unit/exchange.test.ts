import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { emptyDoc, type AscDoc } from '../../src/asc/model.ts';
import { decode } from '../../src/asc/encoding.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';
import { Library } from '../../src/library/library.ts';
import { exportAllZip, exportVariantZip, importEntries, safeName, usedFiles } from '../../src/project/exchange.ts';
import { addSim, lineOf, renameSim, variantOf } from '../../src/project/project.ts';
import { newProject, type Project } from '../../src/project/turbo.ts';
import { crc32, makeZip, readZip } from '../../src/project/zip.ts';

const lib = new Library(buildBundle());
const asc = (line: string, type = 'res'): string => {
  const d: AscDoc = {
    ...emptyDoc(),
    symbols: [{ type, x: 0, y: 0, orient: 'R0', windows: new Map(), attrs: new Map([['InstName', 'X1'], ['Value', '1k']]) }],
    texts: [{ x: 0, y: 200, align: 'Left', size: 2, kind: 'directive', text: line }],
  };
  return serializeAsc(d);
};

function sample(): Project {
  let p = newProject('Filtro: RC');
  p = addSim(p, asc('.tran 10m'))!.project;
  p = addSim(p, asc('.ac dec 10 1 1meg\n.lib miop.sub', 'miop'))!.project;
  p = renameSim(p, variantOf(p).activeSim, 'Bode/fino');
  return {
    ...p,
    files: [
      { name: 'miop.asy', kind: 'symbol', text: 'Version 4\nSymbolType BLOCK\n' },
      { name: 'miop.sub', kind: 'model', text: '.subckt miop a b\n.ends\n' },
      { name: 'otro.lib', kind: 'model', text: '.model x d\n' },
    ],
  };
}

describe('zip', () => {
  it('ida y vuelta sin comprimir, con nombres UTF-8', async () => {
    const enc = new TextEncoder();
    const z = makeZip([{ path: 'Variante ñ/a.asc', data: enc.encode('hola') }, { path: 'b.txt', data: new Uint8Array() }]);
    const back = await readZip(z);
    expect(back.map((e) => [e.path, new TextDecoder().decode(e.data)])).toEqual([['Variante ñ/a.asc', 'hola'], ['b.txt', '']]);
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
  });

  it('lee archivos comprimidos con deflate', async () => {
    const text = 'Version 4\n'.repeat(50);
    const raw = new TextEncoder().encode(text);
    const comp = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    // zip armado a mano con el método 8
    const z = makeZip([{ path: 'x.asc', data: comp }]);
    const v = new DataView(z.buffer);
    const central = v.getUint32(z.length - 22 + 16, true);
    v.setUint16(8, 8, true);
    v.setUint16(central + 10, 8, true);
    v.setUint32(central + 24, raw.length, true);
    const [e] = await readZip(z);
    expect(new TextDecoder().decode(e.data)).toBe(text);
  });

  it('rechaza lo que no es un zip', async () => {
    await expect(readZip(new Uint8Array(40))).rejects.toThrow('No es un archivo .zip');
  });
});

describe('exportar e importar (#157)', () => {
  it('una variante: un .asc por simulación y sólo los archivos que usan', async () => {
    const p = sample();
    const z = exportVariantZip(p, p.activeVariant, lib);
    expect(z.name).toBe('Filtro_ RC - Variante 1.zip');
    const entries = await readZip(z.bytes);
    expect(entries.map((e) => e.path)).toEqual(['Transitorio 0–10 ms.asc', 'Bode_fino.asc', 'miop.asy', 'miop.sub']);
    expect(decode(entries[1].data).text).toContain('.ac dec 10 1 1meg');
  });

  it('todo: una carpeta por variante; importar el zip lo reconstruye', async () => {
    const p = sample();
    const z = exportAllZip({ ...p, variants: [...p.variants, { ...variantOf(p), id: 'v2', name: 'Con buffer' }] }, lib);
    const entries = await readZip(z.bytes);
    expect(entries.map((e) => e.path)).toEqual([
      'Variante 1/Transitorio 0–10 ms.asc',
      'Variante 1/Bode_fino.asc',
      'Variante 1/miop.asy',
      'Variante 1/miop.sub',
      'Con buffer/Transitorio 0–10 ms.asc',
      'Con buffer/Bode_fino.asc',
      'Con buffer/miop.asy',
      'Con buffer/miop.sub',
    ]);
    const r = importEntries(newProject('Otro'), entries, z.name);
    expect(r.variants).toEqual(['Variante 1 (2)', 'Con buffer']);
    const v = r.project.variants.find((x) => x.name === 'Con buffer')!;
    expect(v.sims.map((s) => [s.name, lineOf(s.asc)])).toEqual([
      ['Transitorio 0–10 ms', '.tran 10m'],
      ['Bode_fino', '.ac dec 10 1 1meg'],
    ]);
    expect(r.files.map((f) => f.name)).toEqual(['miop.asy', 'miop.sub', 'miop.asy', 'miop.sub']);
  });

  it('archivos sueltos: cada .asc es una variante', () => {
    const enc = new TextEncoder();
    const r = importEntries(newProject('P'), [
      { path: 'a.asc', data: enc.encode(asc('.op')) },
      { path: 'b.asc', data: enc.encode(asc('.tran 1m')) },
      { path: 'm.lib', data: enc.encode('.model q npn') },
      { path: 'leeme.pdf', data: new Uint8Array(3) },
    ]);
    expect(r.variants).toEqual(['a', 'b']);
    expect(r.project.variants.map((v) => v.sims.length)).toEqual([0, 1, 1]);
    expect(r.files.map((f) => f.name)).toEqual(['m.lib']);
  });

  it('nombres de archivo válidos y archivos usados', () => {
    expect(safeName('a/b:c*?"<>|. ')).toBe('a_b_c_');
    expect(usedFiles(sample().files, [asc('.op')]).map((f) => f.name)).toEqual([]);
  });
});
