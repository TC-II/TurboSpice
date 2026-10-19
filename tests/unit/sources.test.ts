// Ventana de fuentes (#47): leer y escribir el valor de V/I con la sintaxis de LTspice.
import { describe, expect, it } from 'vitest';
import { emptySource, engNumber, parseSource, pulseDuty, solvePulse, spiceNumber, waveAt, writeSource } from '../../src/sim/sources.ts';
import { sourceSyntax } from '../../src/netlist/tongspice.ts';
import { csvPoints } from '../../src/schematic/SourceDialog.tsx';

const read = (Value: string, Value2?: string, SpiceLine?: string) => parseSource({ Value, Value2, SpiceLine });
/** escribir lo leído da los mismos atributos (normalizados a la forma de LTspice) */
const roundTrip = (Value: string, Value2?: string, SpiceLine?: string) => {
  const s = read(Value, Value2, SpiceLine);
  expect(s, Value).not.toBeNull();
  return writeSource(s!);
};

describe('leer el valor de una fuente', () => {
  it('valores DC (con unidad, negativos, parámetros)', () => {
    for (const v of ['10', '5V', '-12', '1m', '550µ', '{Vcc}']) expect(read(v)).toMatchObject({ kind: 'dc', dc: v });
    expect(read('""')).toMatchObject({ kind: 'dc', dc: '' });
  });

  it('formas de onda con sus parámetros', () => {
    expect(read('SINE(0 1 1k)')).toMatchObject({ kind: 'sine', args: ['0', '1', '1k'] });
    expect(read('sine(10 .01 10MEG) ac 1')).toMatchObject({ kind: 'sine', args: ['10', '.01', '10MEG'], acMag: '1' });
    expect(read('PULSE(0 1 0 1u 1u 5m 10m)')).toMatchObject({ kind: 'pulse', args: ['0', '1', '0', '1u', '1u', '5m', '10m'] });
    expect(read('EXP(0 1 0 1m 5m 1m)')).toMatchObject({ kind: 'exp', args: ['0', '1', '0', '1m', '5m', '1m'] });
    expect(read('SFFM(0 0.1 10.7meg 50 5k)')).toMatchObject({ kind: 'sffm', args: ['0', '0.1', '10.7meg', '50', '5k'] });
    expect(read('SINE({dc} {sqrt(2)*ac} {fi})')).toMatchObject({ kind: 'sine', args: ['{dc}', '{sqrt(2)*ac}', '{fi}'] });
  });

  it('AC en Value2 (como lo guarda LTspice) o en el mismo Value', () => {
    expect(read('SINE(0 1 1k)', 'AC 1')).toMatchObject({ kind: 'sine', acMag: '1', acPhase: '' });
    expect(read('PULSE(0 1 0 1n 1n 5u 10u) AC 1')).toMatchObject({ kind: 'pulse', acMag: '1' });
    expect(read('1', 'AC 2 45')).toMatchObject({ kind: 'dc', dc: '1', acMag: '2', acPhase: '45' });
  });

  it('sólo AC es la pestaña AC', () => {
    expect(read('AC 1')).toMatchObject({ kind: 'ac', acMag: '1', dc: '' });
    expect(read('', 'AC 1 90')).toMatchObject({ kind: 'ac', acMag: '1', acPhase: '90' });
  });

  it('PWL entre paréntesis, sin paréntesis y repetido', () => {
    expect(read('PWL(0 0 1m 1 2m 0)')?.points).toEqual([['0', '0'], ['1m', '1'], ['2m', '0']]);
    expect(read('PWL 0 0 1n 1m 10n 1m 11n 0')?.points).toEqual([['0', '0'], ['1n', '1m'], ['10n', '1m'], ['11n', '0']]);
    expect(read('PWL REPEAT FOREVER (0 0 1m 1) ENDREPEAT')).toMatchObject({ kind: 'pwl', repeat: true, points: [['0', '0'], ['1m', '1']] });
  });

  it('parásitos de SpiceLine y la bandera load', () => {
    expect(read('SINE(0 1 1k)', undefined, 'Rser=1 Cpar=1n')?.params).toEqual([['Rser', '1'], ['Cpar', '1n']]);
    expect(read('1m', undefined, 'load')?.params).toEqual([['load', null]]);
  });

  it('lo que no sabe editar devuelve null (se edita como texto)', () => {
    for (const v of ['wavefile="dingdong.wav" chan=1', 'PWL file=dac_ramp2.txt', 'TBL(-1 1 -2 2)', 'PWL(0 0 repeat forever (0.5u 200) endrepeat', 'PULSE(0 1) SINE(0 1 1k)'])
      expect(read(v), v).toBeNull();
    expect(read('0', '0 40u')).toBeNull();
  });
});

describe('escribir con la sintaxis de LTspice', () => {
  it('la forma de onda va en Value, el AC en Value2 y los parásitos en SpiceLine', () => {
    expect(roundTrip('SINE(0 1 1k)', 'AC 1', 'Rser=1')).toEqual({ Value: 'SINE(0 1 1k)', Value2: 'AC 1', SpiceLine: 'Rser=1' });
    // el AC escrito dentro de Value pasa a Value2
    expect(roundTrip('PULSE(0 1 0 1n 1n 5u 10u) AC 1')).toEqual({ Value: 'PULSE(0 1 0 1n 1n 5u 10u)', Value2: 'AC 1', SpiceLine: null });
    expect(roundTrip('5V')).toEqual({ Value: '5V', Value2: null, SpiceLine: null });
    expect(roundTrip('AC 1')).toEqual({ Value: 'AC 1', Value2: null, SpiceLine: null });
    expect(roundTrip('1m', undefined, 'load')).toEqual({ Value: '1m', Value2: null, SpiceLine: 'load' });
  });

  it('parámetros vacíos: los del final no se escriben, los del medio valen 0', () => {
    const s = { ...emptySource('pulse'), args: ['0', '1', '', '', '', '5m', '10m', ''] };
    expect(writeSource(s).Value).toBe('PULSE(0 1 0 0 0 5m 10m)');
    expect(writeSource({ ...emptySource('sine'), args: ['0', '1', '1k', '', '', '', ''] }).Value).toBe('SINE(0 1 1k)');
  });

  it('DC para .op junto con una forma de onda, y PWL repetido', () => {
    expect(writeSource({ ...emptySource('sine'), args: ['0', '1', '1k'], dc: '2' }).Value).toBe('DC 2 SINE(0 1 1k)');
    expect(read('DC 2 SINE(0 1 1k)')).toMatchObject({ kind: 'sine', dc: '2' });
    const p = writeSource({ ...emptySource('pwl'), points: [['0', '0'], ['1m', '1']], repeat: true }).Value;
    expect(p).toBe('PWL REPEAT FOREVER (0 0 1m 1) ENDREPEAT');
    expect(read(p)).toMatchObject({ repeat: true });
  });

  it('cambiar de tipo conserva AC y parásitos', () => {
    const s = read('SINE(0 1 1k)', 'AC 1', 'Rser=1')!;
    expect(writeSource({ ...s, kind: 'dc', dc: '3' })).toEqual({ Value: '3', Value2: 'AC 1', SpiceLine: 'Rser=1' });
  });
});

describe('números y campos vinculados del pulso', () => {
  it('sufijos de SPICE', () => {
    expect(spiceNumber('4k7')).toBeCloseTo(4700);
    expect(spiceNumber('10u')).toBeCloseTo(1e-5);
    expect(spiceNumber('1Meg')).toBe(1e6);
    expect(spiceNumber('1M')).toBe(1e-3);
    expect(spiceNumber('550µ')).toBeCloseTo(550e-6);
    expect(spiceNumber('{R}')).toBeNaN();
    expect(engNumber(0.0047)).toBe('4.7m');
    expect(engNumber(1 / 3e-3)).toBe('333');
  });

  it('ciclo útil a mitad de las rampas; los dos fijos definen el tercero', () => {
    expect(pulseDuty(4e-3, 10e-3, 1e-3, 1e-3)).toBeCloseTo(0.5);
    // período y ciclo útil fijos: al agregar rampas se acorta Ton
    expect(solvePulse(['per', 'duty'], { ton: 5e-3, per: 10e-3, duty: 0.5, tr: 1e-3, tf: 1e-3 }).ton).toBeCloseTo(4e-3);
    // Ton y ciclo útil fijos: las rampas cambian el período (y la frecuencia)
    expect(solvePulse(['ton', 'duty'], { ton: 4e-3, per: 0, duty: 0.5, tr: 2e-3, tf: 2e-3 }).per).toBeCloseTo(12e-3);
    expect(solvePulse(['ton', 'per'], { ton: 4e-3, per: 10e-3, duty: 0, tr: 0, tf: 0 }).duty).toBeCloseTo(0.4);
  });

  it('vista previa: valores de la forma de onda', () => {
    const pulse = read('PULSE(0 1 1m 1u 1u 2m 5m)')!;
    expect(waveAt(pulse, 0.5e-3)).toBe(0);
    expect(waveAt(pulse, 2e-3)).toBe(1);
    expect(waveAt(pulse, 4e-3)).toBe(0);
    expect(waveAt(read('SINE(1 2 1k)')!, 0.25e-3)).toBeCloseTo(3);
    expect(waveAt(read('PWL(0 0 1m 2)')!, 0.5e-3)).toBeCloseTo(1);
  });
});

describe('traducción a ngspice e importación de puntos', () => {
  it('el PWL repetido de LTspice es PWL(…) r=0 en ngspice', () => {
    expect(sourceSyntax('V', 'PWL REPEAT FOREVER (0 0 1m 1) ENDREPEAT')).toBe('PWL(0 0 1m 1) r=0');
    expect(sourceSyntax('I', 'pwl repeat forever (0 0 1m 1) endrepeat AC 1')).toBe('PWL(0 0 1m 1) r=0 AC 1');
    expect(sourceSyntax('R', 'PWL REPEAT FOREVER (0 0) ENDREPEAT')).toBe('PWL REPEAT FOREVER (0 0) ENDREPEAT');
  });

  it('CSV: tiempo y valor por línea; se saltan encabezados y líneas vacías', () => {
    expect(csvPoints('t,v\n0,0\n1m;1\n\n2e-3\t0.5\nfin')).toEqual([['0', '0'], ['1m', '1'], ['2e-3', '0.5']]);
  });
});
