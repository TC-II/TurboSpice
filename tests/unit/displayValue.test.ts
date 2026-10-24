// Valores de R, C y L en el esquemático: prefijo SI y unidad (#73)
import { describe, expect, it } from 'vitest';
import { displayValue } from '../../src/schematic/geometry.ts';

describe('displayValue', () => {
  it('R con prefijo y Ω', () => {
    expect(displayValue('R', '10k')).toBe('10kΩ');
    expect(displayValue('R', '10Meg')).toBe('10MΩ');
    expect(displayValue('R', '4k7')).toBe('4.7kΩ');
    expect(displayValue('R', '470')).toBe('470Ω');
    expect(displayValue('R', '2.2')).toBe('2.2Ω');
  });
  it('M de SPICE es mili: queda a la vista', () => {
    expect(displayValue('R', '10M')).toBe('10mΩ');
  });
  it('C y L', () => {
    expect(displayValue('C', '1u')).toBe('1µF');
    expect(displayValue('C', '100n')).toBe('100nF');
    expect(displayValue('C', '4.7p')).toBe('4.7pF');
    expect(displayValue('L', '10m')).toBe('10mH');
  });
  it('expresiones, parámetros y otros componentes: tal cual', () => {
    expect(displayValue('R', '{R}')).toBe('{R}');
    expect(displayValue('R', 'R=V(a)/1m')).toBe('R=V(a)/1m');
    expect(displayValue('C', '1u Rser=1')).toBe('1u Rser=1');
    expect(displayValue('V', 'SINE(0 1 1k)')).toBe('SINE(0 1 1k)');
    expect(displayValue('V', 'DC 5')).toBe('DC 5');
    expect(displayValue('V', '{vcc}')).toBe('{vcc}');
    expect(displayValue('V', '5')).toBe('5V');
    expect(displayValue('V', '3.3')).toBe('3.3V');
    expect(displayValue('V', '100m')).toBe('100mV');
    expect(displayValue('I', '1m')).toBe('1mA');
    expect(displayValue('I', '2')).toBe('2A');
    // sin unidad duplicada
    expect(displayValue('V', '5V')).toBe('5V');
    expect(displayValue('V', '100mV')).toBe('100mV');
    expect(displayValue('I', '1mA')).toBe('1mA');
    expect(displayValue('D', '1N4148')).toBe('1N4148');
  });
});
