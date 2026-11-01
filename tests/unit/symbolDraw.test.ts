import { describe, expect, it } from 'vitest';
import { addPin, addShape, addText, copySym, pasteSym, setText, symTexts, moveParamWindow, removeShape, resizeBody, setShape, setSymParams, symParamWindow, symPins, symShapes } from '../../src/project/symbolEdit.ts';
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

describe('copiar y pegar en el símbolo', () => {
  it('pega figuras corridas y pines con nombre libre y el SpiceOrder siguiente', () => {
    const s = 'Version 4\nSymbolType CELL\nLINE Normal 0 0 16 16\nPIN -32 0 LEFT 8\nPINATTR PinName A\nPINATTR SpiceOrder 1\n';
    const clip = copySym(s, [2], [0]);
    const r = pasteSym(s, clip, 16, 16);
    expect(symShapes(r.text).map((x) => x.coords.join(' '))).toEqual(['0 0 16 16', '16 16 32 32']);
    expect(symPins(r.text).map((p) => `${p.name}:${p.order}@${p.x},${p.y}`)).toEqual(['A:1@-32,0', 'A_1:2@-16,16']);
    expect(r.shapes).toEqual([3]);
    expect(r.pins).toEqual([1]);
  });
});

describe('textos del símbolo (TEXT del .asy)', () => {
  it('lee, agrega, cambia, borra y pega textos', () => {
    let s = 'Version 4\nSymbolType CELL\nLINE Normal 0 0 16 16\nTEXT 4 32 Left 0 Vdd\nPIN -32 0 LEFT 8\nPINATTR PinName A\nPINATTR SpiceOrder 1\n';
    expect(symTexts(s)).toEqual([{ line: 3, x: 4, y: 32, align: 'Left', size: 0, text: 'Vdd' }]);
    s = addText(s, { x: 3, y: 105, align: 'Left', size: 0, text: 'Gnd' });
    expect(s.split('\n')[4]).toBe('TEXT 3 105 Left 0 Gnd');
    s = setText(s, 3, { text: 'V+', size: 2 });
    expect(symTexts(s)[0]).toMatchObject({ text: 'V+', size: 2, x: 4 });
    const r = pasteSym(s, copySym(s, [3], []), 16, 16);
    expect(symTexts(r.text).map((x) => `${x.text}@${x.x},${x.y}`)).toContain('V+@20,48');
    expect(symTexts(removeShape(s, 3)).map((x) => x.text)).toEqual(['Gnd']);
  });
});
