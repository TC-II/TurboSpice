import { describe, expect, it } from 'vitest';
import { mergeUserFiles, parseUserLibrary, pullUserLibrary, pushUserLibrary, userLibraryText, USER_LIBRARY_NAME } from '../../src/cloud/userLibrary.ts';
import type { UserFile } from '../../src/schematic/autosave.ts';
import type { DriveClient } from '../../src/cloud/drive.ts';

const f = (name: string, time: number, text = name): UserFile => ({ name, kind: 'model', text, time });

describe('My symbols and models en Drive', () => {
  it('ida y vuelta del JSON; rechaza lo que no es de TurboSpice', () => {
    const files = [f('a.lib', 1), { name: 'b.asy', kind: 'symbol', text: 'Version 4', time: 2 } as UserFile];
    expect(parseUserLibrary(userLibraryText(files))).toEqual(files);
    expect(parseUserLibrary('{"files":[]}')).toBeNull();
    expect(parseUserLibrary('no es json')).toBeNull();
  });

  it('une por nombre sin distinguir mayúsculas; gana el más nuevo', () => {
    const m = mergeUserFiles([f('A.lib', 5, 'drive'), f('x.lib', 1)], [f('a.lib', 9, 'local'), f('y.lib', 2)]);
    expect(m.map((x) => [x.name, x.text])).toEqual([['a.lib', 'local'], ['x.lib', 'x.lib'], ['y.lib', 'y.lib']]);
  });

  it('busca el archivo de nombre fijo y lo crea o lo reemplaza', async () => {
    const saved: [string, string, string | undefined][] = [];
    let stored: string | undefined;
    const drive = {
      find: async (name: string) => (stored && name === USER_LIBRARY_NAME ? [{ id: 'F1', name }] : []),
      download: async () => new TextEncoder().encode(stored!),
      save: async (name: string, bytes: Uint8Array, id?: string) => {
        saved.push([name, new TextDecoder().decode(bytes), id]);
        stored = new TextDecoder().decode(bytes);
        return { id: id ?? 'F1', name };
      },
    } as unknown as DriveClient;
    expect(await pullUserLibrary(drive)).toEqual({ files: null });
    expect(await pushUserLibrary(drive, [f('a.lib', 1)])).toBe('F1');
    expect(saved[0][0]).toBe(USER_LIBRARY_NAME);
    expect(saved[0][2]).toBeUndefined();
    expect(await pullUserLibrary(drive)).toEqual({ id: 'F1', files: [f('a.lib', 1)] });
    await pushUserLibrary(drive, [f('b.lib', 2)]);
    expect(saved[1][2]).toBe('F1');
  });
});
