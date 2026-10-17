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
