import { describe, expect, it } from 'vitest';
import { DISPLAY_PREFIXES, formatSi, LTSPICE_PREFIXES, parseDisplayNumber, parseSpiceNumber, SPICE_PREFIXES, spiceSuffix } from '../../src/netlist/spicenum.ts';
import { parseExpr } from '../../src/waveform/expr.ts';
import { engNumber } from '../../src/sim/sources.ts';
import { engValue } from '../../src/sim/studyTemplates.ts';
import { siValue } from '../../src/netlist/step.ts';
import { si } from '../../src/waveform/series.ts';

describe('prefijos SI: una sola implementación', () => {
  it('formatSi con cada tabla', () => {
    expect(formatSi(4.7e6, 4, SPICE_PREFIXES)).toBe('4.7Meg');
    expect(formatSi(4.7e6, 4, DISPLAY_PREFIXES)).toBe('4.7M');
    expect(formatSi(2.2e-6, 4, SPICE_PREFIXES)).toBe('2.2u');
    expect(formatSi(2.2e-6, 4, LTSPICE_PREFIXES)).toBe('2.2µ');
    expect(formatSi(-0.0047, 4, DISPLAY_PREFIXES)).toBe('-4.7m');
    expect(formatSi(3e12, 4, SPICE_PREFIXES)).toBe('3T');
    expect(formatSi(5e-17, 4, SPICE_PREFIXES)).toBe('0.05f');
    expect(formatSi(0, 4, SPICE_PREFIXES)).toBe('0');
  });

  it('el redondeo que llega a 1000 pasa al prefijo siguiente', () => {
    expect(formatSi(0.99997, 4, DISPLAY_PREFIXES)).toBe('1');
    expect(formatSi(999999.9, 6, LTSPICE_PREFIXES)).toBe('1Meg');
    expect(siValue(0.9999999)).toBe('1');
  });

  it('las funciones de cada lugar usan su tabla', () => {
    expect(si(1e6)).toBe('1M'); // visor
    expect(siValue(1e6)).toBe('1Meg'); // pasos de .step, como LTspice
    expect(engValue(1e6)).toBe('1Meg'); // tarjetas del Estudio (van a SPICE)
    expect(engNumber(1e6)).toBe('1Meg'); // diálogo de fuentes (va a SPICE)
    expect(engNumber(2e12)).toBe('2T');
    expect(engNumber(1e-20)).toBe('0');
  });

  it('lo que se escribe para SPICE se vuelve a leer igual', () => {
    for (const x of [1e-15, 4.7e-12, 2.2e-9, 1e-6, 3.3e-3, 1, 4.7e3, 1e6, 2.2e9, 1e12]) {
      expect(parseSpiceNumber(engValue(x)) / x).toBeCloseTo(1, 9);
      expect(parseSpiceNumber(siValue(x)) / x).toBeCloseTo(1, 9);
    }
  });

  it('dos convenciones para «M»: mili en SPICE, mega en el visor', () => {
    expect(parseSpiceNumber('10M')).toBeCloseTo(10e-3);
    expect(parseDisplayNumber('10M')).toBe(10e6);
    expect(parseSpiceNumber('10meg')).toBe(10e6);
    expect(parseDisplayNumber('10meg')).toBe(10e6);
    expect(parseDisplayNumber(si(4.7e6))).toBe(4.7e6);
  });

  it('sufijos SPICE: meg, mil, µ y μ', () => {
    expect(spiceSuffix('meg')).toBe(1e6);
    expect(spiceSuffix('mil')).toBe(25.4e-6);
    expect(spiceSuffix('µ')).toBe(1e-6);
    expect(spiceSuffix('μ')).toBe(1e-6);
    expect(spiceSuffix('V')).toBeUndefined();
  });

  it('las expresiones del visor leen los números como SPICE', () => {
    const num = (s: string) => {
      const n = parseExpr(s);
      return n.t === 'num' ? n.v : NaN;
    };
    expect(num('2.2meg')).toBe(2.2e6);
    expect(num('7μ')).toBeCloseTo(7e-6);
    expect(num('8mil')).toBeCloseTo(8 * 25.4e-6);
    expect(num('2.5ms')).toBeCloseTo(2.5e-3);
    expect(num('5V')).toBe(5);
  });
});
