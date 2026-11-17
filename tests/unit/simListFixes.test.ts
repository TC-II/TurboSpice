import { describe, expect, it } from 'vitest';
import { isSingularLine, missingSources } from '../../src/sim/simList.ts';

describe('missingSources', () => {
  const have = ['V1', 'r1', 'I§2'];
  it('un .dc con una fuente que no existe', () => {
    expect(missingSources('.dc V1-11 0 5 0.1', have)).toEqual(['V1-11']);
    expect(missingSources('.dc V1 0 5 0.1', have)).toEqual([]);
    expect(missingSources('.dc v1 0 5 0.1 I2 0 1 0.5', have)).toEqual([]);
    expect(missingSources('.dc V1 0 5 0.1 V9 0 1 0.5', have)).toEqual(['V9']);
  });
  it('no bloquea el barrido de una resistencia que existe, de temp ni de un parámetro', () => {
    expect(missingSources('.dc R1 1k 10k 1k', have)).toEqual([]);
    expect(missingSources('.dc temp 0 100 10', have)).toEqual([]);
    expect(missingSources('.dc param x 0 5 1', have)).toEqual([]);
  });
  it('.noise y .tf', () => {
    expect(missingSources('.noise V(out) Vin dec 10 1 1k', have)).toEqual(['Vin']);
    expect(missingSources('.noise V(out) V1 dec 10 1 1k', have)).toEqual([]);
    expect(missingSources('.tf V(out) Vx', have)).toEqual(['Vx']);
    expect(missingSources('.tf V(out) V1', have)).toEqual([]);
    expect(missingSources('.tran 1m', have)).toEqual([]);
  });
});

describe('isSingularLine', () => {
  it('el aviso de ngspice sí, otras líneas con la palabra no', () => {
    expect(isSingularLine('Warning: singular matrix:  check nodes a and b')).toBe(true);
    expect(isSingularLine('matrix is nearly singular')).toBe(true);
    expect(isSingularLine('Circuit: Singular value decomposition.asc')).toBe(false);
    expect(isSingularLine('Error on line 3')).toBe(false);
  });
});
