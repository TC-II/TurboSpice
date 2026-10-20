import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { decode } from '../../src/asc/encoding.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { Library } from '../../src/library/library.ts';
import { replaceIdealDiodes } from '../../src/netlist/idealdiode.ts';
import { ltNetlist, ltNetlistText } from '../../src/netlist/ltnetlist.ts';
import { parseSpiceNumber } from '../../src/netlist/spicenum.ts';
import { patchModelFile, toNgspice } from '../../src/netlist/tongspice.ts';
import { compareNetlists, normalizeLtspice, readNet } from '../corpus/compare.mjs';

const FIX = join(__dirname, '..', 'fixtures', 'asc');
const fixtures = readdirSync(FIX).filter((f) => f.endsWith('.asc'));
const lib = new Library(buildBundle());
const readText = (p: string) => decode(new Uint8Array(readFileSync(p))).text;
const resolver = { resolve: (p: string) => lib.resolveModelFile(p), defines: (m: string) => lib.definesModel(m) };

function netFromAsc(src: string) {
  return ltNetlist(parseAsc(src), lib);
}

describe('netlist estilo LTspice', () => {
  it.each(fixtures)('%s: idéntica a la que genera LTspice (incluidos los nombres N001…)', (f) => {
    const ref = normalizeLtspice(readNet(join(FIX, f.replace(/\.asc$/, '.net'))));
    const ours = ltNetlistText(ltNetlist(parseAsc(readText(join(FIX, f))), lib));
    const r = compareNetlists(ref, ours);
    expect(r.reason ?? '').toBe('');
    expect(r.exact).toBe(true);
  });

  it('conexiones: T sobre el segmento, cruces sin conexión, tierra gana a la etiqueta', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
WIRE 16 0 16 16
WIRE -64 0 96 0
WIRE 0 -64 0 64
FLAG 96 0 out
FLAG -64 0 0
SYMBOL res 0 0 R0
SYMATTR InstName R1
SYMATTR Value 1k
`);
    // pin superior de R1 en (16,16) unido por cable a (16,0), que está sobre el cable horizontal
    expect(n.elements[0].nodes).toEqual(['0', 'NC_01']);
  });

  it('nombres §, sustrato del BJT y bulk del MOSFET', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
SYMBOL res 0 0 R0
SYMATTR InstName 5
SYMBOL npn 100 0 R0
SYMATTR InstName Q1
`);
    const text = ltNetlistText(n);
    expect(text).toContain('R§5 NC_01 NC_02 R');
    expect(text).toContain('Q1 NC_03 NC_04 NC_05 0 NPN');
    expect(text).toContain('.model NPN NPN');
  });
});

describe('traducción a ngspice', () => {
  const ng = (src: string) => toNgspice(netFromAsc(src), 't', resolver);

  it('hace explícito el 1 mΩ serie de los inductores y expande Rser/Cpar', () => {
    const r = ng(`Version 4
SHEET 1 880 680
SYMBOL ind 0 0 R0
SYMATTR InstName L1
SYMATTR Value 10m
SYMBOL cap 100 0 R0
SYMATTR InstName C1
SYMATTR Value 1u
SYMATTR SpiceLine Rser=2 Cpar=1p
`);
    expect(r.text).toContain('L1 NC_01 L1__s 10m');
    expect(r.text).toContain('R__L1 L1__s NC_02 1m');
    expect(r.text).toContain('C1 NC_03 C1__s 1u');
    expect(r.text).toContain('R__C1 C1__s NC_04 2');
    expect(r.text).toContain('C__C1_par NC_03 NC_04 1p');
  });

  it('.tran de un argumento y .step como bucle en .control', () => {
    const r = ng(`Version 4
SHEET 1 880 680
TEXT 0 0 Left 2 !.tran 10m\\n.step param R 1k 3k 1k
`);
    expect(r.text).toContain('.tran 0.00001 10m');
    expect(r.text).toContain('.param R=1000');
    expect(r.text).toContain('.control\nforeach ts_step0 1000 2000 3000\n  alterparam R = $ts_step0\n  reset\n  run\nend\n.endc');
    expect(r.steps!.runs.map((x) => x.label)).toEqual(['R=1k', 'R=2k', 'R=3k']);
    expect(r.warnings).toEqual([]);
  });

  it('avisa los componentes sin valor', () => {
    const r = ng(`Version 4
SHEET 1 880 680
SYMBOL res 0 0 R0
SYMATTR InstName R1
SYMBOL diode 100 0 R0
SYMATTR InstName D1
`);
    expect(r.warnings).toContain('R1 no tiene valor asignado');
    expect(r.warnings.join()).not.toMatch(/D1/);
  });

  it('adapta archivos de modelos de LTspice', () => {
    const lib = `.SUBCKT OA 1 2 3\n.param r 20\nE1 3 0 1 2 {Avol}\n.end OA\n`;
    const out = patchModelFile(lib, new Map([['oa', new Map([['avol', '1Meg']])]]));
    expect(out).toContain('.SUBCKT OA 1 2 3 params: avol=1Meg');
    expect(out).toContain('.param r=20');
    expect(out).toContain('.ends OA');
  });

  it('parámetros de instancia con espacios alrededor del = ("K = 1")', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
SYMBOL TCLib\\\\Gain_Block 0 0 R0
SYMATTR InstName U1
SYMATTR SpiceLine K = 1
`);
    const r = toNgspice(n, 't', resolver);
    expect(r.subcktParams.get('gain_block')?.get('k')).toBe('1');
  });

  it('fuentes B: sin espacio entre la función y el paréntesis ("LIMIT (")', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
SYMBOL bi 0 0 R0
SYMATTR InstName B1
SYMATTR Value I=LIMIT ( -V(a) , 1 , -1 ) * U (V(a))
`);
    expect(toNgspice(n, 't', resolver).text).toContain('I=LIMIT( -V(a) , 1 , -1 ) * U(V(a))');
  });

  it('fuentes B: round, buf, inv e hypot fuera de llaves (ngspice no las tiene)', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
SYMBOL bv 0 0 R0
SYMATTR InstName B2
SYMATTR Value V=u(time*1200-round(time*1200))+buf(V(a))
`);
    const t = toNgspice(n, 't', resolver).text;
    expect(t).toContain('V=u(time*1200-(sgn(time*1200)*floor(abs(time*1200)+0.5)))+((V(a)) > 0.5 ? 1 : 0)');
  });

  it('fuentes B: log y sqrt de negativos acotados como en LTspice', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
SYMBOL bv 0 0 R0
SYMATTR InstName B3
SYMATTR Value V=120+250*log10(1+V(p)/0.0035)+sqrt(V(q))
`);
    expect(toNgspice(n, 't', resolver).text).toContain('V=120+250*log10(max(1+V(p)/0.0035,1e-100))+sqrt(max(V(q),0))');
  });

  it('.tran 0 {expresión}: el paso también es expresión', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
TEXT 0 0 Left 2 !.tran 0 {6/fz}
`);
    expect(toNgspice(n, 't', resolver).text).toContain('.tran {(6/fz)/1000} {6/fz}');
  });

  it('directivas con comentario ";" a mitad de línea', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
TEXT 0 0 Left 2 !.step param prb list -1 1 ; set prb=0 to turn off probe
TEXT 0 0 Left 2 !.tran 1m ; corto
`);
    const r = toNgspice(n, 't', resolver);
    expect(r.warnings.join()).not.toMatch(/inválidos/);
    expect(r.text).toContain('.tran 0.000001 1m');
    expect(r.text).not.toContain('corto');
  });

  it('.param con espacios dentro de la expresión → entre llaves', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
TEXT 0 0 Left 2 !.param Kb=1 + 2 c=0.5\\n.param Kc = c / 2\\n.param a=1 b=2 d={x * 2}
`);
    const t = toNgspice(n, 't', resolver).text;
    expect(t).toContain('.param Kb={1 + 2} c=0.5');
    expect(t).toContain('.param Kc={c / 2}');
    expect(t).toContain('.param a=1 b=2 d={x * 2}');
  });

  it('reemplaza diodos ideales de LTspice por fuentes B', () => {
    const r = replaceIdealDiodes('D1 a k di\n.model di D(Ron=1 Vfwd=0.5)');
    expect(r.text).toContain('BD1 a k I=(V(a,k)>=0.5) ? (0.5/1e12+(V(a,k)-0.5)/1) : (V(a,k)/1e12)');
    expect(r.models).toEqual(['di']);
  });
});

describe('números SPICE', () => {
  it.each([
    ['1k', 1e3],
    ['4.7u', 4.7e-6],
    ['10meg', 1e7],
    ['1µ', 1e-6],
    ['2M', 2e-3],
    ['5V', 5],
    ['1e-3', 1e-3],
  ])('%s', (s, v) => expect(parseSpiceNumber(s)).toBeCloseTo(v, 15));
  it('expresiones no son números', () => expect(parseSpiceNumber('{a*2}')).toBeNaN());
});

describe('modelos ako:', () => {
  it('hereda los parámetros del modelo base y cambia los indicados', async () => {
    const { collectModels, replaceAko } = await import('../../src/netlist/ako.ts');
    const lib = '.model TIP32C PNP(IS=1e-13 BF=50 VAF=100\n+ RB=1)\n.model D1N D(IS=1e-14)';
    const net = '.model TIP32Cm AKO: TIP32C (Bf=20)\n.MODEL QP AKO:TIP32Cm PNP(VAF=50)\n.model X ako:D1N N=2\n.model Y ako:NADA (BF=1)';
    const r = replaceAko(net, collectModels(lib));
    expect(r.text.split('\n').filter((l) => !l.startsWith('*'))).toEqual([
      '.model TIP32Cm PNP(IS=1e-13 VAF=100 RB=1 Bf=20)',
      '.model QP PNP(IS=1e-13 RB=1 Bf=20 VAF=50)',
      '.model X D(IS=1e-14 N=2)',
    ]);
    expect(r.warnings).toEqual(['Y: no se encontró el modelo base NADA (ako:)']);
  });
});

describe('símbolos y bloques del usuario', () => {
  it('símbolo de un .subckt y jerarquía con un .asc como bloque', async () => {
    const { makeSymbol, subcktPins, schematicPorts } = await import('../../src/library/makeSymbol.ts');
    const { Library } = await import('../../src/library/library.ts');
    const { buildBundle } = await import('../../scripts/build-library.mjs');
    const mine = new Library(buildBundle());
    expect(subcktPins('* x\n.SUBCKT amp in out\n+ vcc 0 params: G=10\n.ends', 'AMP')).toEqual(['in', 'out', 'vcc', '0']);
    // bloque "div": divisor resistivo con puertos in/out
    const block = `Version 4\nSHEET 1 880 680\nWIRE 16 96 16 112\nFLAG 16 16 in\nIOPIN 16 16 In\nFLAG 16 112 out\nIOPIN 16 112 Out\nFLAG 16 192 0\nSYMBOL res 0 0 R0\nSYMATTR InstName R1\nSYMATTR Value 1k\nSYMBOL res 0 96 R0\nSYMATTR InstName R2\nSYMATTR Value {R}\nTEXT 0 240 Left 2 !.param R=2k\n`;
    mine.addSchematic('div.asc', block);
    const ports = schematicPorts(parseAsc(block).flags);
    expect(ports).toEqual(['in', 'out']);
    mine.addSymbol('div', makeSymbol({ name: 'div', pins: ports, block: true }));
    const top = parseAsc(`Version 4\nSHEET 1 880 680\nFLAG -32 0 a\nFLAG 32 0 b\nSYMBOL div 0 0 R0\nSYMATTR InstName X1\nTEXT 0 100 Left 2 !.op\n`);
    const lt = ltNetlist(top, mine);
    expect(lt.warnings).toEqual([]);
    const text = ltNetlistText(lt);
    expect(text).toContain('X1 a b div');
    expect(text).toContain('.subckt div in out\nR1 in out 1k\nR2 out 0 {R}');
    const ng = toNgspice(lt, 't', { resolve: () => undefined });
    expect(ng.text).toMatch(/\.subckt div in out\nR1 in out 1k\nR2 out 0 \{R\}\n\.param R=2k\n\.ends div/);
  });
});

describe('funciones aleatorias (Monte Carlo)', () => {
  it('mc, flat y gauss de LTspice → unif, aunif y agauss de ngspice', async () => {
    const { translateRandom } = await import('../../src/netlist/tongspice.ts');
    expect(translateRandom('{mc(1k, tol)}')).toBe('{unif(1k, tol)}');
    expect(translateRandom('{1k*(1+gauss(tol/3))}')).toBe('{1k*(1+agauss(0, tol/3, 1))}');
    expect(translateRandom('{flat(1)+mc(max(1,2), 0.1)}')).toBe('{aunif(0, 1)+unif(max(1,2), 0.1)}');
    // ya en sintaxis de ngspice: no se toca
    expect(translateRandom('{gauss(1k, 0.1, 3)}')).toBe('{gauss(1k, 0.1, 3)}');
  });
});

describe('funciones de LTspice que numparam no conoce (#56)', () => {
  it('u, uramp, buf, inv, round y hypot entre llaves', async () => {
    const { translateFunctions } = await import('../../src/netlist/tongspice.ts');
    expect(translateFunctions('AC {u(P)}')).toBe('AC {((P) > 0 ? 1 : 0)}');
    expect(translateFunctions('AC {U (-P)}')).toBe('AC {((-P) > 0 ? 1 : 0)}');
    expect(translateFunctions('{u(-(P-1))}')).toBe('{((-(P-1)) > 0 ? 1 : 0)}');
    expect(translateFunctions('{2*u(P)+uramp(x)}')).toBe('{2*((P) > 0 ? 1 : 0)+max((x), 0)}');
    expect(translateFunctions('{u(uramp(x)-1)}')).toBe('{((max((x), 0)-1) > 0 ? 1 : 0)}');
    expect(translateFunctions('{buf(a)+inv(b)}')).toBe('{((a) > 0.5 ? 1 : 0)+((b) > 0.5 ? 0 : 1)}');
    expect(translateFunctions('{round(x)}')).toBe('{(sgn(x)*floor(abs(x)+0.5))}');
    expect(translateFunctions('{hypot(a, b)}')).toBe('{sqrt(pow(a,2)+pow(b,2))}');
  });

  it('no toca identificadores que contienen u ni las fuentes B sin llaves', async () => {
    const { translateFunctions } = await import('../../src/netlist/tongspice.ts');
    expect(translateFunctions('{mu(x)*Vout}')).toBe('{mu(x)*Vout}');
    expect(translateFunctions('{my_u(x)}')).toBe('{my_u(x)}');
    expect(translateFunctions('V=u(time-1)*{u(P)}')).toBe('V=u(time-1)*{((P) > 0 ? 1 : 0)}');
    expect(translateFunctions('{u(1, 2)}')).toBe('{u(1, 2)}');
  });

  it('.param y .func se traducen enteras (sin llaves)', async () => {
    const { translateFunctions } = await import('../../src/netlist/tongspice.ts');
    expect(translateFunctions('.param a=u(P) b={uramp(P)}')).toBe('.param a=((P) > 0 ? 1 : 0) b={max((P), 0)}');
    expect(translateFunctions('.func u(x)=uramp(x)')).toBe('.func u(x)=max((x), 0)');
  });

  it('en la netlist: valores de elementos y .param, con mc() también', async () => {
    const lt = ltNetlist(
      parseAsc(
        `Version 4\nSHEET 1 880 680\nFLAG 0 0 a\nFLAG 0 96 0\nSYMBOL current 0 0 R0\nSYMATTR InstName I1\nSYMATTR Value 0\nSYMATTR Value2 AC {u(P)*mc(1,0.1)}\nTEXT 0 200 Left 2 !.param P=uramp(-1)\nTEXT 0 240 Left 2 !.ac dec 1 1 10\n`,
      ),
      lib,
    );
    const ng = toNgspice(lt, 't', { resolve: () => undefined });
    expect(ng.text).toContain('AC {((P) > 0 ? 1 : 0)*unif(1,0.1)}');
    expect(ng.text).toContain('.param P={max((-1), 0)}');
  });
});
