import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { compactTurbo, readShareHash, shareHash } from '../../src/schematic/share.ts';
import { parseTurbo, serializeTurbo } from '../../src/project/turbo.ts';

const turbo = readFileSync('public/examples/Sample Project.turbo');

describe('links de Compartir', () => {
  it('ida y vuelta de un .turbo: mismos circuitos y corridas, hashes verificados', async () => {
    const { project } = await parseTurbo(turbo.toString('utf8'));
    const text = await serializeTurbo(project);
    const hash = await shareHash(new TextEncoder().encode(text), 'Sample Project.turbo');
    expect(hash).toMatch(/&z=1&k=1&/);
    const r = await readShareHash(`#${hash}`);
    expect(r?.name).toBe('Sample Project.turbo');
    const back = await parseTurbo(new TextDecoder().decode(r!.bytes));
    expect(back.warnings).toEqual([]);
    const strip = (s: string) => JSON.parse(s, (k, v) => (['id', 'activeTestbench', 'group', 'created', 'modified'].includes(k) ? undefined : v));
    expect(strip(await serializeTurbo(back.project))).toEqual(strip(text));
  });

  it('el link no lleva hashes, ids largos ni fechas del proyecto', () => {
    const c = compactTurbo(turbo.toString('utf8'));
    expect(c).not.toMatch(/sha256:|"created"|"modified"|vmvjpk/);
  });

  it('un .asc va tal cual', async () => {
    const asc = Buffer.from('Version 4\r\nSHEET 1 880 680\r\n');
    const hash = await shareHash(asc, 'a.asc');
    expect(hash).not.toMatch(/k=1/);
    expect(Buffer.from((await readShareHash(`#${hash}`))!.bytes).equals(asc)).toBe(true);
  });

  it('más corto que deflate solo', async () => {
    const plain = deflateRawSync(turbo, { level: 9 }).length;
    const hash = await shareHash(turbo, 'x');
    expect(hash.split('&')[0].length - 2).toBeLessThan((plain * 4) / 3);
  });

  it('abre links viejos (deflate sin diccionario)', async () => {
    const asc = Buffer.from('Version 4\r\nSHEET 1 880 680\r\n');
    const c = deflateRawSync(asc).toString('base64url');
    const r = await readShareHash(`#c=${c}&n=a.asc`);
    expect(Buffer.from(r!.bytes).equals(asc)).toBe(true);
  });

  it('rechaza una versión desconocida', async () => {
    await expect(readShareHash('#c=AAAA&z=9')).rejects.toThrow();
  });
});
