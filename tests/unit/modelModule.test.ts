import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { Library } from '../../src/library/library.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { ltNetlist, ltNetlistText } from '../../src/netlist/ltnetlist.ts';
import { addModelModule, modelInfo, modelModuleFile, modelModules, modelSymbolText, removeModelModule, renameModelModule, setPinAttr, setSymAttr, symAttr } from '../../src/project/modelModule.ts';
import { symPins } from '../../src/project/symbolEdit.ts';
import { newProject, serializeTurbo, parseTurbo } from '../../src/project/turbo.ts';

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

  it('un .model usa Value y el prefijo de su tipo', () => {
    const p = addModelModule(newProject('x'), 'DX', '.model DX D(Is=1e-14)\n');
    const sym = modelSymbolText(p, 'DX')!;
    expect(symAttr(sym, 'Prefix')).toBe('D');
    expect(symAttr(sym, 'Value')).toBe('DX');
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
