// Editor de modelos: lo que lee del netlist, cómo conecta el símbolo, los problemas que marca y las
// operaciones de cada paso del flujo (empezar, conectar, parámetros), sin la interfaz.
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { Library } from '../../src/library/library.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { ltNetlist, ltNetlistText } from '../../src/netlist/ltnetlist.ts';
import {
  addDeclaredParams,
  addMissingPins,
  addNodeFor,
  addPinFor,
  analyzeModel,
  applyFix,
  connectPin,
  declareParam,
  diagnosticText,
  followNodes,
  fromTemplate,
  generatedSymbol,
  isGenerated,
  mapNodes,
  normalizeModel,
  parseModel,
  placePin,
  removePin,
  renamePin,
  setParams,
  setPinLabel,
  TEMPLATES,
  chooseDefinition,
  type ModelState,
} from '../../src/project/modelEdit.ts';
import { addModelModule, modelSymbolText, setSymAttr, symAttr } from '../../src/project/modelModule.ts';
import { symBody, symPins } from '../../src/project/symbolEdit.ts';
import { newProject } from '../../src/project/turbo.ts';

const lib = new Library(buildBundle());
const codes = (text: string) => parseModel(text).diagnostics.map((d) => d.code);
const pinsOf = (sym: string) => symPins(sym).map((p) => `${p.name}:${p.order}`);
/** el símbolo de un módulo nuevo con este netlist */
const start = (text: string, name = 'M'): ModelState => ({ text, sym: generatedSymbol(name, text) });
/** un cambio con su normalización (lo que hace el editor en cada paso) */
const edit = (prev: ModelState, next: Partial<ModelState>, name = 'M') => normalizeModel({ ...prev, ...next }, name, prev);
const sym = (ps: [string, number, number][]) => 'Version 4\nSymbolType CELL\n' + ps.map(([n, o, y]) => `PIN 0 ${y} LEFT 8\nPINATTR PinName ${n}\nPINATTR SpiceOrder ${o}`).join('\n') + '\n';

describe('leer el netlist', () => {
  it('encuentra los .subckt y .model de arriba, con nodos, parámetros y líneas', () => {
    const { defs, diagnostics } = parseModel('* lib\n.subckt AMP in out\n+ params: G = 2 R={2 * k}\nE1 out 0 in 0 {G}\n.subckt INNER a\n.ends INNER\n.ends AMP\n.model DX D(Is=1n)\n');
    expect(diagnostics).toEqual([]);
    expect(defs.map((d) => [d.kind, d.name, d.line, d.end, d.nodes.join(' ')])).toEqual([
      ['subckt', 'AMP', 2, 7, 'in out'],
      ['model', 'DX', 8, 8, 'A K'],
    ]);
    expect(defs[0].params).toEqual([
      ['G', '2'],
      ['R', '{2 * k}'],
    ]);
  });

  it('ignora los comentarios (*, ;, $ y //)', () => {
    expect(parseModel('.subckt A in out ; entrada y salida\n.ends A $ fin\n').defs[0].nodes).toEqual(['in', 'out']);
    expect(parseModel('* .subckt B x\n.subckt A x // nodo\n.ends\n').defs.map((d) => d.name)).toEqual(['A']);
  });

  it('marca cada problema en su línea', () => {
    expect(codes('.subckt A in out\nR1 in out 1k\n')).toEqual(['no-ends']);
    expect(parseModel('.subckt A in out\nR1 in out 1k\n').diagnostics[0]).toMatchObject({ line: 1, fixes: [{ kind: 'add-ends', name: 'A' }] });
    expect(codes('.ends\n')).toEqual(['stray-ends']);
    expect(codes('.subckt A x\n.ends B\n')).toEqual(['ends-name']);
    expect(codes('.subckt A x x\n.ends A\n')).toEqual(['dup-node']);
    expect(codes('.subckt A x 0\n.ends A\n')).toEqual(['ground-node']);
    expect(codes('.subckt A\n.ends A\n')).toEqual(['no-nodes']);
    expect(codes('.subckt A x\n.ends A\n.model A D\n')).toEqual(['dup-def']);
    expect(codes('.model X1 FOO(a=1)\n')).toEqual(['unknown-type']);
    expect(codes('.model\n')).toEqual(['no-type']);
    expect(codes('.subckt A x\n.ends A\nR1 a b 1k\n')).toEqual(['top-element']);
    expect(codes('R1 a b 1k\n')).toEqual(['no-def', 'top-element']);
    expect(codes('.subckt A x\n.ends A\n.tran 1m\n')).toEqual(['top-command']);
    expect(codes('* sólo un comentario\n.param k=2\n')).toEqual(['no-def']);
    expect(codes('')).toEqual([]);
  });

  it('cada problema tiene su texto', () => {
    const all = ['.subckt A x x 0\nR1 a b 1\n.tran 1\n.ends B\n.ends\n.model\n.model Z FOO\n.subckt A\n'];
    for (const d of parseModel(all[0]).diagnostics) expect(diagnosticText(d)).toBeTruthy();
  });
});

describe('el símbolo frente al netlist', () => {
  it('un pin por SpiceOrder; avisa los nodos sin pin y los pines sueltos o repetidos', () => {
    const a = analyzeModel({
      text: '.subckt OA 1 2 3 4 5\n.ends OA\n',
      sym: setSymAttr(
        sym([
          ['In+', 1, 0],
          ['In-', 2, 16],
          ['OUT', 5, 32],
          ['X', 9, 48],
          ['Y', 1, 64],
        ]),
        'SpiceModel',
        'OA',
      ),
    });
    expect(a.pins.map((p) => [p.name, p.node, p.problem])).toEqual([
      ['In+', 0, undefined],
      ['In-', 1, undefined],
      ['OUT', 4, undefined],
      ['X', undefined, 'unconnected'],
      ['Y', 0, 'duplicate'],
    ]);
    expect(a.free).toEqual([2, 3]);
    // 3 y 4 son huecos antes del último pin (OUT, el 5): quedan flotando
    expect(a.diagnostics.map((d) => d.code)).toEqual(['free-nodes', 'pin-unconnected', 'pin-duplicate']);
    for (const d of a.diagnostics) expect(diagnosticText(d)).toBeTruthy();
  });

  it('avisa los parámetros que el .subckt no declara', () => {
    const s = setParams(start('.subckt A in out params: G=1\n.ends A\n'), [
      ['G', '2'],
      ['K', '3'],
    ]);
    const a = analyzeModel(s);
    expect(a.declared).toEqual([['G', '1']]);
    expect(a.diagnostics.map((d) => [d.code, d.args.name])).toEqual([['param-undeclared', 'K']]);
  });

  it('la línea de cada instancia es la que escribe el netlister', () => {
    const text = '.subckt AMP in out ctl params: G=1\nE1 out 0 in 0 {G}\n.ends AMP\n';
    let p = addModelModule(newProject('x'), 'AMP', text);
    const full: ModelState = { text, sym: setParams({ text, sym: modelSymbolText(p, 'AMP')! }, [['G', '5']]).sym };
    // sin el último pin la línea tiene un nodo menos que el .subckt: es un error
    const short = removePin(full, 2);
    expect(analyzeModel(short).instance).toBe('XU1 in out AMP G=5');
    expect(analyzeModel(short).diagnostics.map((d) => [d.code, d.severity, d.args.nodes])).toEqual([['free-nodes-end', 'error', 'ctl']]);
    // sin uno del medio, su nodo queda NC (flotando): un aviso
    const s = removePin(full, 1);
    expect(analyzeModel(s).instance).toBe('XU1 in NC ctl AMP G=5');
    expect(analyzeModel(s).diagnostics.map((d) => [d.code, d.severity])).toEqual([['free-nodes', 'warning']]);
    p = { ...p, files: p.files.map((f) => (f.kind === 'symbol' ? { ...f, text: s.sym } : f)) };
    lib.setProjectFiles(p.files);
    const pin = symPins(s.sym);
    const asc = `Version 4\nSHEET 1 880 680\nSYMBOL AMP 0 0 R0\nSYMATTR InstName U1\nFLAG ${pin[0].x} ${pin[0].y} in\nFLAG ${pin[1].x} ${pin[1].y} ctl\n`;
    const net = ltNetlistText(ltNetlist(parseAsc(asc), lib)).split('\n')[0];
    lib.setProjectFiles([]);
    expect(
      net
        .replace('§', '')
        .replace(/ ;§.*$/, '')
        .replace(/MP_\d+/, 'NC'),
    ).toBe('XU1 in NC ctl AMP G=5');
  });

  it('un .model usa el prefijo y los terminales de su dispositivo', () => {
    const a = analyzeModel(start('.model QX NPN(Bf=100)\n'));
    expect(a.nodes).toEqual(['C', 'B', 'E']);
    expect(a.instance).toBe('Q1 C B E QX');
    expect(analyzeModel(fromTemplate(start(''), 'nmos', 'MX')).instance).toBe('M1 D G S B MX W=10u L=1u');
  });
});

describe('los pines siguen a sus nodos', () => {
  it('aparea los nodos: iguales, movidos y renombrados en su lugar', () => {
    expect(mapNodes(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual([0, 1, 2]);
    expect(mapNodes(['a', 'b', 'c'], ['a', 'x', 'b', 'c'])).toEqual([0, 2, 3]);
    expect(mapNodes(['a', 'b', 'c'], ['a', 'c'])).toEqual([0, -1, 1]);
    expect(mapNodes(['a', 'b', 'c'], ['b', 'a', 'c'])).toEqual([1, 0, 2]);
    expect(mapNodes(['in', 'out'], ['inp', 'out'])).toEqual([0, 1]);
    expect(mapNodes(['a', 'b'], ['x', 'y', 'z'])).toEqual([-1, -1]);
  });

  it('insertar, sacar, mover o renombrar un nodo no desconecta los pines de un símbolo dibujado', () => {
    const s = sym([
      ['In+', 1, 0],
      ['In-', 2, 16],
      ['OUT', 3, 32],
    ]);
    expect(pinsOf(followNodes(s, ['p', 'n', 'o'], ['p', 'n', 'vcc', 'o']))).toEqual(['In+:1', 'In-:2', 'OUT:4']);
    expect(pinsOf(followNodes(s, ['p', 'n', 'o'], ['p', 'o']))).toEqual(['In+:1', 'In-:4', 'OUT:2']);
    expect(pinsOf(followNodes(s, ['p', 'n', 'o'], ['n', 'p', 'o']))).toEqual(['In+:2', 'In-:1', 'OUT:3']);
    // el pin que se llamaba como su nodo lo sigue en el nombre; los otros no
    expect(
      pinsOf(
        followNodes(
          sym([
            ['IN', 1, 0],
            ['Q', 2, 16],
          ]),
          ['in', 'b'],
          ['inp', 'bb'],
        ),
      ),
    ).toEqual(['inp:1', 'Q:2']);
  });

  it('el símbolo que nadie tocó se rehace con el netlist; el dibujado sólo reacomoda sus pines', () => {
    let s = start('');
    expect(symPins(s.sym)).toHaveLength(0);
    s = edit(s, { text: '.subckt M a b c\n.ends M\n' });
    expect(pinsOf(s.sym)).toEqual(['a:1', 'b:2', 'c:3']);
    s = edit(s, { text: '.subckt M a b c d\n.ends M\n' });
    expect(pinsOf(s.sym)).toEqual(['a:1', 'b:2', 'c:3', 'd:4']);
    expect(isGenerated(s.sym, 'M', s.text)).toBe(true);
    // se mueve un pin: ya es un dibujo propio
    s = { ...s, sym: s.sym.replace('PIN -32 16 LEFT 8', 'PIN -32 48 LEFT 8') };
    s = edit(s, { text: '.subckt M a x b c d\n.ends M\n' });
    expect(pinsOf(s.sym)).toEqual(['a:1', 'b:3', 'c:4', 'd:5']);
    expect(s.sym).toContain('PIN -32 48 LEFT 8');
  });

  it('SpiceModel sigue a la definición renombrada (la del mismo lugar) y Prefix a su tipo', () => {
    const lib2 = '.subckt A x\n.ends A\n.subckt B x y\n.ends B\n';
    let s = chooseDefinition(start(lib2), 'B');
    s = normalizeModel(s, 'M', start(lib2));
    expect(symAttr(s.sym, 'SpiceModel')).toBe('B');
    expect(pinsOf(s.sym)).toEqual(['x:1', 'y:2']);
    s = edit(s, { text: lib2.replace(/B/g, 'C') });
    expect(symAttr(s.sym, 'SpiceModel')).toBe('C');
    s = edit(s, { text: '.model C D(Is=1n)\n' });
    expect(symAttr(s.sym, 'Prefix')).toBe('D');
    expect(symAttr(s.sym, 'ModelFile')).toBe('M.lib');
  });

  it('vaciar el netlist no toca el símbolo (y volver a escribir lo rehace)', () => {
    let s = start('.subckt M a b\n.ends M\n');
    s = edit(s, { text: '' });
    expect(pinsOf(s.sym)).toEqual(['a:1', 'b:2']);
    s = edit(s, { text: '.subckt OTHER p q r\n.ends OTHER\n' });
    expect(symAttr(s.sym, 'SpiceModel')).toBe('OTHER');
    expect(pinsOf(s.sym)).toEqual(['p:1', 'q:2', 'r:3']);
  });
});

describe('operaciones de cada paso', () => {
  const opamp = (): ModelState => ({
    text: '.subckt OA inp inn vp vn out\n.ends OA\n',
    sym: setSymAttr(
      sym([
        ['In+', 1, 0],
        ['In-', 2, 16],
        ['OUT', 5, 32],
      ]),
      'SpiceModel',
      'OA',
    ),
  });

  it('conectar un pin a otro nodo intercambia con el que estaba ahí', () => {
    let s = connectPin(opamp(), 0, 1);
    expect(pinsOf(s.sym)).toEqual(['In+:2', 'In-:1', 'OUT:5']);
    s = connectPin(s, 2, 2);
    expect(pinsOf(s.sym)).toEqual(['In+:2', 'In-:1', 'OUT:3']);
    s = connectPin(s, 2, null);
    expect(analyzeModel(s).pins[2].problem).toBe('unconnected');
    // conectar el suelto a un nodo ocupado: el que estaba queda suelto
    s = connectPin(s, 2, 0);
    expect(analyzeModel(s).pins.map((p) => p.problem ?? p.node)).toEqual([1, 'unconnected', 0]);
  });

  it('agrega los pines que faltan en el borde del cuerpo, con su SpiceOrder', () => {
    const s = start('.subckt M a b c d\n.ends M\n');
    // un símbolo al que le sacaron los pines de c y d
    const drawn: ModelState = { ...s, sym: removePin(removePin(s, 3), 2).sym };
    expect(analyzeModel(drawn).free).toEqual([2, 3]);
    const full = addMissingPins(drawn);
    expect(pinsOf(full.sym)).toEqual(['a:1', 'b:2', 'c:3', 'd:4']);
    const ps = symPins(full.sym);
    const b = symBody(full.sym)!;
    expect(ps[2].x).toBe(b.x2);
    expect(ps.every((p) => p.y % 16 === 0 && p.y < b.y2)).toBe(true);
    expect(analyzeModel(full).diagnostics).toEqual([]);
    // uno solo, y sin repetir nombres
    expect(pinsOf(addPinFor({ ...drawn, sym: renamePin(drawn, 0, 'c').sym }, 2).sym)).toEqual(['c:1', 'b:2', 'c_2:3']);
  });

  it('agranda el cuerpo si no hay lugar y baja los rótulos de abajo', () => {
    const s = generatedSymbol('M', '.subckt M a b\n.ends M\n');
    const before = symBody(s)!;
    const out = placePin(s, 'c', 'LEFT');
    expect(symBody(out)!.y2).toBeGreaterThan(before.y2);
    expect(Number(/^WINDOW 38 \S+ (\S+)/m.exec(out)![1])).toBeGreaterThan(symBody(out)!.y2);
  });

  it('sacar un pin no corre a los otros de nodo', () => {
    expect(pinsOf(removePin(opamp(), 1).sym)).toEqual(['In+:1', 'OUT:5']);
  });

  it('un pin suelto puede agregar su nodo al .subckt', () => {
    const s = addNodeFor(
      {
        text: '.subckt A in out params: G=1\n.ends A\n',
        sym: setSymAttr(
          sym([
            ['in', 1, 0],
            ['out', 2, 16],
            ['en', 7, 32],
          ]),
          'SpiceModel',
          'A',
        ),
      },
      2,
    );
    expect(s.text).toBe('.subckt A in out en params: G=1\n.ends A\n');
    expect(analyzeModel(s).diagnostics).toEqual([]);
  });

  it('nombre y lado del rótulo de cada pin', () => {
    let s = renamePin(opamp(), 0, ' V p ');
    expect(symPins(s.sym)[0].name).toBe('Vp');
    expect(renamePin(s, 0, '   ')).toBe(s);
    s = setPinLabel(s, 0, 'NONE');
    expect(symPins(s.sym)[0].align).toBe('NONE');
  });

  it('parámetros: tomar los del .subckt y declarar los que faltan en su línea', () => {
    let s = start('.subckt A in out params: G=1 R=1k\n.ends A\n');
    s = setParams(s, [['K', '2']]);
    s = addDeclaredParams(s);
    expect(analyzeModel(s).params).toEqual([
      ['K', '2'],
      ['G', '1'],
      ['R', '1k'],
    ]);
    s = declareParam(s, 'K');
    expect(s.text).toBe('.subckt A in out params: G=1 R=1k K=2\n.ends A\n');
    expect(analyzeModel(s).diagnostics).toEqual([]);
    // sin params: en la línea (y con un comentario al final)
    const s2 = declareParam(setParams(start('.subckt B x ; nodo\n.ends B\n'), [['T', '{2*k}']]), 'T');
    expect(s2.text).toBe('.subckt B x params: T={2*k} ; nodo\n.ends B\n');
  });

  it('los arreglos de cada problema lo resuelven', () => {
    let s: ModelState = {
      text: '.subckt A in out\n',
      sym: setSymAttr(
        sym([
          ['in', 1, 0],
          ['zz', 6, 16],
        ]),
        'SpiceModel',
        'A',
      ),
    };
    for (let k = 0; k < 6; k++) {
      const d = analyzeModel(s).diagnostics.find((x) => x.fixes?.length);
      if (!d) break;
      s = applyFix(s, d.fixes![0]);
    }
    expect(analyzeModel(s).diagnostics).toEqual([]);
    expect(s.text).toBe('.subckt A in out\n.ends A\n');
    expect(pinsOf(s.sym)).toEqual(['in:1', 'out:2']);
  });

  it('cada plantilla da un modelo sin problemas, con el nombre del módulo', () => {
    for (const tpl of TEMPLATES) {
      const s = normalizeModel(fromTemplate(start('', 'NEW'), tpl.id, 'NEW'), 'NEW', start('', 'NEW'));
      const a = analyzeModel(s);
      expect(a.diagnostics, tpl.id).toEqual([]);
      expect(a.used?.name).toBe('NEW');
      expect(a.free).toEqual([]);
      expect(symAttr(s.sym, 'SpiceModel')).toBe('NEW');
    }
  });
});
