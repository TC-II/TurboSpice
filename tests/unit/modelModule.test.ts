import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { Library } from '../../src/library/library.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { ltNetlist, ltNetlistText } from '../../src/netlist/ltnetlist.ts';
import {
  addModelModule,
  libForPins,
  subcktForPins,
  setAttrSize,
  subcktAfterPins,
  adoptModelSymbol,
  pinsMismatch,
  updateModelPins,
  attrVisible,
  modelParams,
  setAttrVisible,
  setModelParams,
  subcktParams,
  extractModel,
  extractSubckt,
  modelInfo,
  renameModelIn,
  renameSubcktIn,
  setSubcktPins,
  syncModelAttrs,
  modelModuleFile,
  modelModules,
  modelSymbolText,
  removeModelModule,
  renameModelModule,
  setPinAttr,
  setSymAttr,
  symAttr,
} from '../../src/project/modelModule.ts';
import { symPins } from '../../src/project/symbolEdit.ts';
import { newProject, serializeTurbo, parseTurbo } from '../../src/project/turbo.ts';
import { subcktFilesFor } from '../../src/project/exchange.ts';

const lib = new Library(buildBundle());

describe('módulos de tipo Modelo', () => {
  it('reconoce .subckt (pines y params) y .model (pines y prefijo por tipo)', () => {
    expect(modelInfo('.subckt amp in out params: g=2\nE1 out 0 in 0 {g}\n.ends')).toMatchObject({ kind: 'subckt', name: 'amp', prefix: 'X', pins: ['in', 'out'], params: [['g', '2']] });
    expect(modelInfo('.model 1N4148 D(Is=2.52n)')).toMatchObject({ kind: 'model', name: '1N4148', prefix: 'D', pins: ['A', 'K'] });
    expect(modelInfo('.model Q1 NPN(Bf=100)').pins).toEqual(['C', 'B', 'E']);
  });

  it('crea el archivo y el símbolo con ModelFile, y se netlista', () => {
    const p = addModelModule(newProject('x'), 'MYAMP', '.subckt MYAMP in out\nR1 in out 1k\n.ends MYAMP\n');
    expect(modelModules(p)).toHaveLength(1);
    const sym = modelSymbolText(p, 'MYAMP')!;
    expect(symAttr(sym, 'ModelFile')).toBe('MYAMP.lib');
    expect(symAttr(sym, 'Prefix')).toBe('X');
    expect(symPins(sym).map((x) => x.name)).toEqual(['in', 'out']);
    lib.setProjectFiles(p.files);
    const pin = symPins(sym);
    const asc = `Version 4\nSHEET 1 880 680\nSYMBOL MYAMP 0 0 R0\nSYMATTR InstName X1\nFLAG ${pin[0].x} ${pin[0].y} a\nFLAG ${pin[1].x} ${pin[1].y} b\n`;
    const text = ltNetlistText(ltNetlist(parseAsc(asc), lib));
    expect(text).toMatch(/^X1 a b MYAMP/m);
    expect(text).toContain('.lib MYAMP.lib');
    lib.setProjectFiles([]);
  });

  it('un .model usa SpiceModel y el prefijo de su tipo', () => {
    const p = addModelModule(newProject('x'), 'DX', '.model DX D(Is=1e-14)\n');
    const sym = modelSymbolText(p, 'DX')!;
    expect(symAttr(sym, 'Prefix')).toBe('D');
    expect(symAttr(sym, 'SpiceModel')).toBe('DX');
    expect(symAttr(sym, 'Value')).toBe('');
  });

  it('Prefix y SpiceModel salen del netlist; Value no repite el nombre', () => {
    const p = addModelModule(newProject('x'), 'M1');
    const sym = modelSymbolText(p, 'M1')!;
    expect(symAttr(sym, 'Prefix')).toBe('X');
    expect(symAttr(sym, 'SpiceModel')).toBe('M1');
    expect(symAttr(sym, 'Value')).toBe('');
    // uno viejo con Value = nombre: pasa a SpiceModel y el rótulo muestra SpiceModel
    const old = setSymAttr(setSymAttr(sym, 'SpiceModel', ''), 'Value', 'M1').replace(/^WINDOW 38 /m, 'WINDOW 3 ');
    const s2 = syncModelAttrs(old, '.subckt M1 in out\n.ends M1\n');
    expect(symAttr(s2, 'SpiceModel')).toBe('M1');
    expect(symAttr(s2, 'Value')).toBe('');
    expect(s2).toMatch(/^WINDOW 38 /m);
  });

  it('cambia los nodos de la línea .subckt y conserva los params', () => {
    const t = '* x\n.subckt A in out\n+ params: G=1\nR1 in out 1k\n.ends A\n';
    expect(setSubcktPins(t, ['in', 'out', 'p3'])).toBe('* x\n.subckt A in out p3 params: G=1\nR1 in out 1k\n.ends A\n');
  });

  it('saca un .subckt o un .model de un archivo y lo renombra', () => {
    const lib = '.subckt B a b\nR1 a b 1\n.ends B\n.subckt A x y\nC1 x y 1n\n.ends A\n.model DD D(Is=1\n+ N=2)\n';
    expect(renameSubcktIn(extractSubckt(lib, 'A')!, 'A', 'M')).toBe('.subckt M x y\nC1 x y 1n\n.ends M');
    expect(renameModelIn(extractModel(lib, 'DD')!, 'DD', 'M')).toBe('.model M D(Is=1\n+ N=2)');
  });

  it('edita atributos y pines, renombra, borra y se guarda en el .turbo', async () => {
    let p = addModelModule(newProject('x'), 'M1');
    let sym = setSymAttr(modelSymbolText(p, 'M1')!, 'SpiceLine2', 'foo=1');
    sym = setPinAttr(sym, 0, 'SpiceOrder', '2');
    expect(symAttr(sym, 'SpiceLine2')).toBe('foo=1');
    expect(symPins(sym)[0].order).toBe(2);
    expect(symAttr(setSymAttr(sym, 'SpiceLine2', ''), 'SpiceLine2')).toBe('');
    p = renameModelModule(p, 'M1', 'M2', (a) => a);
    expect(modelModuleFile(p, 'M2')?.name).toBe('M2.lib');
    expect(symAttr(modelSymbolText(p, 'M2')!, 'ModelFile')).toBe('M2.lib');
    const back = (await parseTurbo(await serializeTurbo(p))).project;
    expect(modelModuleFile(back, 'M2')?.module).toBe('model');
    expect(modelModules(removeModelModule(back, 'M2'))).toHaveLength(0);
  });
});

describe('rótulos y parámetros del símbolo de un modelo', () => {
  it('ocultar un rótulo conserva su posición', () => {
    const s = 'Version 4\nSymbolType CELL\nWINDOW 0 24 16 Bottom 2\nSYMATTR Prefix X\n';
    const off = setAttrVisible(s, 'InstName', false);
    expect(off).toContain('WINDOW 0 24 16 Invisible 2');
    expect(attrVisible(off, 'InstName')).toBe(false);
    expect(setAttrVisible(off, 'InstName', true, 'Bottom')).toContain('WINDOW 0 24 16 Bottom 2');
  });

  it('reparte los parámetros en Value, Value2, SpiceLine y SpiceLine2', () => {
    const s = setModelParams('Version 4\nSymbolType CELL\nSYMATTR Prefix X\n', [
      ['a', '1'],
      ['b', '2'],
      ['c', '3'],
      ['d', '4'],
      ['e', '5'],
    ]);
    expect(symAttr(s, 'Value')).toBe('a=1');
    expect(symAttr(s, 'Value2')).toBe('b=2');
    expect(symAttr(s, 'SpiceLine')).toBe('c=3');
    expect(symAttr(s, 'SpiceLine2')).toBe('d=4 e=5');
    expect(
      modelParams(s)
        .map(([k]) => k)
        .join(''),
    ).toBe('abcde');
    expect(attrVisible(s, 'Value2')).toBe(true);
  });

  it('lee los params: de la línea .subckt', () => {
    expect(subcktParams('.subckt A in out\n+ params: G=1 R={2*k}\nR1 in out {R}\n.ends A\n', 'A')).toEqual([
      ['G', '1'],
      ['R', '{2*k}'],
    ]);
  });
});

describe('símbolo y netlist de un modelo', () => {
  it('los pines van a los nodos por SpiceOrder, no por nombre (como OA_Ideal: 1 2 5)', () => {
    const sym =
      'SymbolType CELL\nPIN 0 0 NONE 0\nPINATTR PinName In+\nPINATTR SpiceOrder 1\nPIN 0 16 NONE 0\nPINATTR PinName In-\nPINATTR SpiceOrder 2\nPIN 0 32 NONE 0\nPINATTR PinName OUT\nPINATTR SpiceOrder 5\n';
    expect(pinsMismatch(sym, ['1', '2', '3', '4', '5'])).toBe(false);
    expect(pinsMismatch(sym, ['1', '2', '3', '4'])).toBe(true);
    const up = updateModelPins(sym, ['a', 'b', 'c'], 16);
    expect(symPins(up).map((p) => `${p.name}:${p.order}`)).toEqual(['In+:1', 'In-:2', 'c:3']);
  });

  it('importar un .asy trae todo, salvo SpiceModel y ModelFile', () => {
    const asy = 'Version 4\nSymbolType BLOCK\nWINDOW 0 8 -8 Left 2\nSYMATTR Prefix U\nSYMATTR SpiceModel otro\nSYMATTR Value G=1\nSYMATTR ModelFile x.lib\n';
    const s = adoptModelSymbol(asy, 'SYMATTR SpiceModel M1\n', 'M1');
    expect(symAttr(s, 'Prefix')).toBe('U');
    expect(symAttr(s, 'Value')).toBe('G=1');
    expect(symAttr(s, 'SpiceModel')).toBe('M1');
    expect(symAttr(s, 'ModelFile')).toBe('M1.lib');
    expect(s).toMatch(/^SymbolType CELL/m);
    expect(s).toMatch(/^WINDOW 0 8 -8 Left 2/m);
  });

  it('SpiceModel sigue al .subckt renombrado en el netlist', () => {
    expect(symAttr(syncModelAttrs('SYMATTR SpiceModel A\n', '.subckt B x y\n.ends B\n'), 'SpiceModel')).toBe('B');
    expect(symAttr(syncModelAttrs('SYMATTR SpiceModel B\n', '.subckt A x\n.ends A\n.subckt B x y\n.ends B\n'), 'SpiceModel')).toBe('B');
  });
});

describe('pines del símbolo y nodos del .subckt', () => {
  const sym = (ps: [string, number, number][]) => ps.map(([n, o, y]) => `PIN 0 ${y} LEFT 8\nPINATTR PinName ${n}\nPINATTR SpiceOrder ${o}`).join('\n') + '\n';
  const net = '.subckt M a b\nR1 a b 1k\nC1 b 0 {a}\n.ends M\n';

  it('agregar, sacar y renombrar un pin cambia el .subckt', () => {
    const two = sym([
      ['a', 1, 0],
      ['b', 2, 16],
    ]);
    expect(
      subcktAfterPins(
        net,
        'M',
        two,
        sym([
          ['a', 1, 0],
          ['b', 2, 16],
          ['c', 3, 32],
        ]),
      ),
    ).toMatch(/^\.subckt M a b c$/m);
    expect(subcktAfterPins(net, 'M', two, sym([['b', 1, 16]]))).toMatch(/^\.subckt M b$/m);
    const ren = subcktAfterPins(
      net,
      'M',
      two,
      sym([
        ['in', 1, 0],
        ['b', 2, 16],
      ]),
    );
    expect(ren).toBe('.subckt M in b\nR1 in b 1k\nC1 b 0 {a}\n.ends M\n');
  });

  it('renombrar un pin renombra el nodo de su posición aunque se llamara distinto (sin tocar valores)', () => {
    const t = '.subckt OA 1 2\nE1 1 2 0 0 1\n.ends OA\n';
    expect(
      subcktAfterPins(
        t,
        'OA',
        sym([
          ['In+', 1, 0],
          ['In-', 2, 16],
        ]),
        sym([
          ['Vp', 1, 0],
          ['In-', 2, 16],
        ]),
      ),
    ).toBe('.subckt OA Vp 2\nE1 Vp 2 0 0 1\n.ends OA\n');
    // como en la foto: in+ out in- → A B C
    const d = '.subckt Dif in+ out in-\nE1 out 0 in+ in- 1\n.ends Dif\n';
    expect(
      subcktAfterPins(
        d,
        'Dif',
        sym([
          ['in+', 1, 0],
          ['out', 2, 16],
        ]),
        sym([
          ['A', 1, 0],
          ['out', 2, 16],
        ]),
      ),
    ).toBe('.subckt Dif A out in-\nE1 out 0 A in- 1\n.ends Dif\n');
  });

  it('Prefix sale de lo que define el netlist', () => {
    expect(symAttr(syncModelAttrs('SYMATTR Prefix X\nSYMATTR SpiceModel DX\n', '.model DX D(Is=1)\n'), 'Prefix')).toBe('D');
    expect(symAttr(syncModelAttrs('SYMATTR Prefix U\nSYMATTR SpiceModel A\n', '.subckt A x\n.ends A\n'), 'Prefix')).toBe('X');
  });

  it('ocultar es Invisible; el tamaño 0 sigue visible', () => {
    const s = 'SymbolType CELL\nWINDOW 3 -176 37 Left 0\nSYMATTR Value Av=1\n';
    expect(attrVisible(s, 'Value')).toBe(true);
    const off = setAttrVisible(s, 'Value', false);
    expect(off).toContain('WINDOW 3 -176 37 Invisible 0');
    expect(setAttrVisible(off, 'Value', true, 'Right')).toContain('WINDOW 3 -176 37 Right 0');
    expect(setAttrSize(s, 'Value', 3)).toContain('WINDOW 3 -176 37 Left 3');
  });
});

describe('importar un símbolo actualiza el .subckt', () => {
  it('los nodos pasan a llamarse como los pines (línea y cuerpo) y se agregan los que faltan', () => {
    const net = '.subckt M a b\nR1 a b 1k\n.ends M\n';
    const sym = 'PIN 0 0 LEFT 8\nPINATTR PinName In+\nPINATTR SpiceOrder 1\nPIN 0 16 LEFT 8\nPINATTR PinName In-\nPINATTR SpiceOrder 2\nPIN 0 32 LEFT 8\nPINATTR PinName OUT\nPINATTR SpiceOrder 5\n';
    expect(subcktForPins(net, 'M', sym)).toBe('.subckt M In+ In- n3 n4 OUT\nR1 In+ In- 1k\n.ends M\n');
  });
});

describe('renombrar nodos numéricos (OA_Ideal)', () => {
  it('cambia los nodos, no los valores que valen lo mismo', () => {
    const net = '.SUBCKT OA 1   2   3   4   5\nE1 N001 0 1 2 1\nRF1 N002 N001 1\nE3 5 0 N002 0 {Av}\nX1 1 5 sub G=1\n.ends OA\n';
    const sym = 'PIN 0 0 LEFT 8\nPINATTR PinName In+\nPINATTR SpiceOrder 1\nPIN 0 16 LEFT 8\nPINATTR PinName In-\nPINATTR SpiceOrder 2\nPIN 0 32 LEFT 8\nPINATTR PinName OUT\nPINATTR SpiceOrder 5\n';
    expect(subcktForPins(net, 'OA', sym)).toBe('.SUBCKT OA In+   In-   3   4   OUT\nE1 N001 0 In+ In- 1\nRF1 N002 N001 1\nE3 OUT 0 N002 0 {Av}\nX1 In+ OUT sub G=1\n.ends OA\n');
  });
});

describe('Update pins in .lib y exportar un modelo', () => {
  it('renombra los nodos como los pines y saca los que quedan después del último pin', () => {
    const net = '.subckt M a b c\nR1 a b 1k\n.ends M\n';
    const sym = 'PIN 0 0 LEFT 8\nPINATTR PinName in\nPINATTR SpiceOrder 1\nPIN 0 16 LEFT 8\nPINATTR PinName out\nPINATTR SpiceOrder 2\n';
    expect(libForPins(net, 'M', sym)).toBe('.subckt M in out\nR1 in out 1k\n.ends M\n');
  });

  it('el .zip de un modelo lleva su .lib y su .asy', () => {
    const p = addModelModule(newProject('x'), 'M1');
    expect(
      subcktFilesFor(p, 'M1')
        .map((f) => f.name)
        .sort(),
    ).toEqual(['M1.asy', 'M1.lib']);
  });
});
