// La punta en un cable de bus sin nombre (N001 entre pines de 16 bits): es un bus, no V(N001)
import { describe, expect, it } from 'vitest';
import { implicitBus } from '../../src/app/useProbe.ts';
import type { LtNetlist } from '../../src/netlist/ltnetlist.ts';

const lt = (nets: { name: string; bits: string[] }[]) => ({ conn: { nets } }) as unknown as LtNetlist;
const bits = (n: string, w: number) => Array.from({ length: w }, (_, i) => `${n}[${w - 1 - i}]`);

describe('implicitBus', () => {
  it('una red sin nombre entre pines de bus es el bus entero', () => {
    expect(implicitBus(lt([{ name: 'N001', bits: bits('N001', 16) }]), 'N001')).toBe('N001[15:0]');
    expect(implicitBus(lt([{ name: 'N001', bits: bits('N001', 16) }]), 'n001')).toBe('n001[15:0]');
  });
  it('un cable común no es un bus', () => {
    expect(implicitBus(lt([{ name: 'vin', bits: ['vin'] }]), 'vin')).toBeNull();
    expect(implicitBus(lt([]), 'N002')).toBeNull();
  });
  it('una red unida a los bits de otro bus no se inventa un rango', () => {
    expect(implicitBus(lt([{ name: 'N003', bits: ['x[3]', 'x[2]'] }]), 'N003')).toBeNull();
  });
});
