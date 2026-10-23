import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { Library } from '../../src/library/library.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { serializeAsc } from '../../src/asc/serialize.ts';
import { pinPoints } from '../../src/schematic/geometry.ts';
import { addSubckt, storeSubckt, updateSymbol } from '../../src/project/subckt.ts';
import { staleInstances } from '../../src/project/staleInstances.ts';
import { newProject, type Project } from '../../src/project/turbo.ts';

const lib = new Library(buildBundle());

const BUF = `Version 4
SHEET 1 880 680
FLAG -128 0 in
IOPIN -128 0 In
FLAG 128 0 out
IOPIN 128 0 Out
SYMBOL res -96 16 R270
SYMATTR InstName R1
SYMATTR Value 1k
`;

/** testbench con U1 y una etiqueta en cada pin */
function withBench(): Project {
  const p0 = addSubckt(newProject('P'), 'BUF', BUF);
  lib.setProjectFiles(p0.files);
  const d = parseAsc('Version 4\nSHEET 1 880 680\nSYMBOL BUF 0 0 R0\nSYMATTR InstName U1\n');
  pinPoints(d.symbols[0], lib.symbol('BUF')).forEach((q, i) => d.flags.push({ x: q.x, y: q.y, name: `n${i}` }));
  return { ...p0, variants: p0.variants.map((v) => ({ ...v, sims: v.sims.map((s) => ({ ...s, asc: serializeAsc(d) })) })) };
}
const label = () => 'TB';
const changePorts = (p: Project, edit: (d: ReturnType<typeof parseAsc>) => void) => {
  const d = parseAsc(BUF);
  edit(d);
  const q = updateSymbol(storeSubckt(p, 'BUF', serializeAsc(d)), 'BUF');
  lib.setProjectFiles(q.files);
  return q;
};

describe('instancias desactualizadas (#199)', () => {
  it('conectada: sin problemas', () => {
    expect(staleInstances(withBench(), 'BUF', lib, label)).toEqual([]);
    lib.setProjectFiles([]);
  });

  it('un puerto nuevo queda marcado como pin sin conectar', () => {
    const p = changePorts(withBench(), (d) => d.flags.push({ x: 0, y: -64, name: 'vdd', ioPin: 'In' }));
    const s = staleInstances(p, 'BUF', lib, label);
    expect(s.map((x) => [x.inst, x.unconnected])).toEqual([['U1', ['vdd']]]);
    lib.setProjectFiles([]);
  });

  it('un puerto quitado deja su etiqueta suelta sobre el símbolo', () => {
    const p = changePorts(withBench(), (d) => {
      d.flags = d.flags.filter((f) => f.name !== 'in');
    });
    const s = staleInstances(p, 'BUF', lib, label);
    expect(s).toHaveLength(1);
    expect(s[0].dangling).toBe(1);
    lib.setProjectFiles([]);
  });
});
