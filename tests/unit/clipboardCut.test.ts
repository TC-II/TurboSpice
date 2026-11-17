// Cortar borra sin depender del documento de antes del await del portapapeles
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAsc } from '../../src/asc/parse.ts';
import { buildBundle } from '../../scripts/build-library.mjs';
import { Library } from '../../src/library/library.ts';
import { clipboardActions, type ClipboardDeps } from '../../src/app/clipboard.ts';

const lib = new Library(buildBundle());
afterEach(() => vi.unstubAllGlobals());

describe('cortar', () => {
  it('borra antes de esperar al portapapeles, aunque éste tarde o falle', async () => {
    const doc = parseAsc('Version 4\nSHEET 1 880 680\nWIRE 0 0 64 0\nWIRE 0 32 64 32\n');
    let release!: () => void;
    vi.stubGlobal('navigator', { clipboard: { writeText: () => new Promise<void>((_, rej) => (release = () => rej(new Error('denegado')))) } });
    const commit = vi.fn();
    const deps = { doc, lib, selection: [{ kind: 'wire', index: 0 }], setSelection: vi.fn(), commit } as unknown as ClipboardDeps;
    const done = clipboardActions(deps).copySelection(true);
    // el portapapeles sigue pendiente y el borrado ya se hizo, sobre el documento actual
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0][0].wires).toHaveLength(1);
    release();
    await done;
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
