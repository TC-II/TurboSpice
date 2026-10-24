import { describe, expect, it } from 'vitest';
import { addPin, addShape, moveParamWindow, removeShape, resizeBody, setShape, setSymParams, symParamWindow, symPins, symShapes } from '../../src/project/symbolEdit.ts';
import { addFlag, setFlagName } from '../../src/schematic/edit.ts';
import { emptyDoc } from '../../src/asc/model.ts';

const asy = 'Version 4\nSymbolType BLOCK\nRECTANGLE Normal -48 -32 48 32\nPIN -48 0 LEFT 8\nPINATTR PinName in\nPINATTR SpiceOrder 1\n';

describe('dibujo del símbolo del subcircuito', () => {
  it('agrega, mueve y borra figuras sin tocar los pines', () => {
    let s = addShape(asy, 'LINE', [-10, 3, 7, -5]);
    expect(symShapes(s).map((x) => x.kind)).toEqual(['RECTANGLE', 'LINE']);
    const line = symShapes(s)[1].line;
    s = setShape(s, line, [1, 2, 3, 4]);
    expect(symShapes(s)[1].coords).toEqual([1, 2, 3, 4]);
    expect(symPins(s)).toHaveLength(1);
    s = removeShape(s, line);
    expect(symShapes(s)).toHaveLength(1);
    expect(removeShape(s, symPins(s)[0].line)).toBe(s);
  });

  it('agrega un pin con su orden y el lado más cercano', () => {
    const s = addPin(asy, 'out', 48, 16);
    const p = symPins(s)[1];
    expect(p).toMatchObject({ name: 'out', x: 48, y: 16, align: 'RIGHT', order: 2 });
  });

  it('etiquetas con puerto: se crean y se cambian', () => {
    let d = addFlag(emptyDoc(), { x: 0, y: 0 }, 'a', 'In');
    expect(d.flags[0].ioPin).toBe('In');
    d = setFlagName(d, 0, 'b');
    expect(d.flags[0]).toMatchObject({ name: 'b', ioPin: 'In' });
    d = setFlagName(d, 0, 'b', '');
    expect(d.flags[0].ioPin).toBeUndefined();
    d = setFlagName(d, 0, 'b', 'Out');
    expect(d.flags[0].ioPin).toBe('Out');
  });
});

describe('rótulo de los parámetros del símbolo (WINDOW 39)', () => {
  it('se mueve, se conserva al cambiar parámetros y no sigue al cuerpo si se lo movió', () => {
    let s = setSymParams(asy, [['G', '1']]);
    expect(symParamWindow(s)).toEqual({ x: 0, y: 56, align: 'Top', size: 2 });
    // sin mover, sigue al cuerpo
    expect(symParamWindow(resizeBody(s, { x1: -48, y1: -32, x2: 48, y2: 64 }))?.y).toBe(88);
    s = moveParamWindow(s, 64, -48);
    expect(symParamWindow(s)).toEqual({ x: 64, y: -48, align: 'Top', size: 2 });
    s = setSymParams(s, [['G', '2'], ['R', '1k']]);
    expect(symParamWindow(s)).toMatchObject({ x: 64, y: -48 });
    expect(symParamWindow(resizeBody(s, { x1: -48, y1: -32, x2: 48, y2: 64 }))).toMatchObject({ x: 64, y: -48 });
  });
});
