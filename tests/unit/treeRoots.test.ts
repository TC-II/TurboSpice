import { describe, expect, it } from 'vitest';
import { treeRoots } from '../../src/project/treeRoots.ts';

const s = (name: string, ...children: string[]) => ({ name, children });
const names = (l: { name: string }[]) => l.map((x) => x.name);

describe('treeRoots', () => {
  it('sin ciclos: los que no usa nadie', () => {
    expect(names(treeRoots([s('A', 'B'), s('B', 'C'), s('C'), s('D')]))).toEqual(['A', 'D']);
  });
  it('A usa a A: no desaparece', () => {
    expect(names(treeRoots([s('A', 'a')]))).toEqual(['A']);
  });
  it('A→B→A: una raíz del ciclo', () => {
    expect(names(treeRoots([s('A', 'B'), s('B', 'A')]))).toEqual(['A']);
  });
  it('un ciclo colgado de una raíz normal no suma raíces', () => {
    expect(names(treeRoots([s('R', 'A'), s('A', 'B'), s('B', 'A')]))).toEqual(['R']);
  });
  it('un ciclo aparte de una raíz normal suma la suya', () => {
    expect(names(treeRoots([s('R', 'X'), s('X'), s('A', 'B'), s('B', 'A')]))).toEqual(['R', 'A']);
  });
});
