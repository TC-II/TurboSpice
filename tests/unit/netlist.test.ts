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
import { replaceLaplaceLines } from '../../src/netlist/laplace.ts';
import { translateDigital } from '../../src/netlist/digital.ts';
import { fixFloatingNodes, floatingNodes } from '../../src/netlist/floating.ts';
import { ngNodeName, patchModelFile, prepareSimulation, toNgspice } from '../../src/netlist/tongspice.ts';
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

  it('Misc\\jumper une las redes de sus dos pines y no genera línea', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
FLAG -32 64 out
FLAG -32 144 0
FLAG 32 144 0
SYMBOL Misc\\\\jumper 0 0 R0
SYMATTR InstName J1
SYMBOL res -48 48 R0
SYMATTR InstName R1
SYMATTR Value 1k
SYMBOL res 16 48 R0
SYMATTR InstName R2
SYMATTR Value 2k
`);
    expect(n.elements.map((e) => `${e.name} ${e.nodes.join(' ')}`)).toEqual(['R1 out 0', 'R2 out 0']);
  });

  it('redes sin cables (pines que se tocan): P001, P002… con contador aparte, en el orden de los símbolos (#109)', () => {
    // medido con LTspice -netlist: dos pilas de resistencias sin cable y un par unido con cable
    const text = ltNetlistText(
      netFromAsc(`Version 4
SHEET 1 880 680
WIRE 16 96 116 96
SYMBOL res 400 400 R0
SYMATTR InstName R1
SYMBOL res 400 480 R0
SYMATTR InstName R2
SYMBOL res 0 0 R0
SYMATTR InstName R3
SYMBOL res 100 0 R0
SYMATTR InstName R4
SYMBOL res 0 200 R0
SYMATTR InstName R5
SYMBOL res 0 280 R0
SYMATTR InstName R6
`),
    );
    expect(text).toMatch(/^R1 NC_01 P001 R$/m);
    expect(text).toMatch(/^R2 P001 NC_02 R$/m);
    expect(text).toMatch(/^R3 NC_03 N001 R$/m);
    expect(text).toMatch(/^R4 NC_04 N001 R$/m);
    expect(text).toMatch(/^R5 NC_05 P002 R$/m);
    expect(text).toMatch(/^R6 P002 NC_06 R$/m);
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

  it('quita los parámetros de la base de datos de LTspice que ngspice no conoce (tol, pwr, V, Irms…)', () => {
    const r = ng(`Version 4
SHEET 1 880 680
SYMBOL res 0 0 R0
SYMATTR InstName R1
SYMATTR Value 10k
SYMATTR SpiceLine tol=1 pwr=0.1 tc1=0.001
SYMBOL cap 100 0 R0
SYMATTR InstName C1
SYMATTR Value 1u
SYMATTR SpiceLine V=10 Irms=1 mfg="x" Rser=2
SYMBOL ind 200 0 R0
SYMATTR InstName L1
SYMATTR Value 1m
SYMATTR SpiceLine Ipk=1 tol=5
`);
    expect(r.text).toMatch(/^R1 \S+ \S+ 10k tc1=0.001$/m);
    expect(r.text).not.toMatch(/tol=|pwr=|Irms|Ipk|V=10|mfg/i);
    expect(r.text).toContain('R__C1 C1__s');
  });

  it('capacitor: quita "electrolytic" (con o sin comilla), MTBF y ppPkg', () => {
    const r = ng(`Version 4
SHEET 1 880 680
SYMBOL cap 0 0 R0
SYMATTR InstName C1
SYMATTR Value 470u
SYMATTR SpiceLine electrolytic" MTBF=2000 ppPkg=1 Rser=0.1
`);
    expect(r.text).toMatch(/^C1 \S+ C1__s 470u$/m);
    expect(r.text).not.toMatch(/electrolytic|mtbf|pppkg/i);
  });

  it('fuente B: quita tripdv/tripdt, Rpar/Cpar en paralelo y table() → pwl()', () => {
    const r = ng(`Version 4
SHEET 1 880 680
SYMBOL bv 0 0 R0
SYMATTR InstName B1
SYMATTR Value V=table(V(a), 0,0, 1,2) * 2 tripdv=1u tripdt=1p Rpar={1/g} Cpar=1p
`);
    expect(r.text).toMatch(/^B1 (\S+) (\S+) V=pwl\(V\(a\),0,0,1,2\) \* 2$/m);
    expect(r.text).toMatch(/^R__B1_par \S+ \S+ \{1\/g\}$/m);
    expect(r.text).toMatch(/^C__B1_par \S+ \S+ 1p$/m);
    expect(r.text).not.toMatch(/tripd/i);
  });

  const bsrc = (value: string) =>
    ng(`Version 4
SHEET 1 880 680
SYMBOL bv 0 0 R0
SYMATTR InstName B1
SYMATTR Value ${value}
`).text;

  it('fuente B: idt/sdt con ic y reset → C de 1 F cargado por una fuente B de corriente', () => {
    const t = bsrc('V=2*idt(V(a),1,V(r))+sdt(1)');
    expect(t).toMatch(/^B1 \S+ \S+ V=2\*V\(B1__idt0\)\+V\(B1__sdt2\)$/m);
    expect(t).toMatch(/^C__B1__idt0 B1__idt0 0 1$/m);
    expect(t).toMatch(/^B__B1__idt0 0 B1__idt0 I=\(\(time > 0\) && !\(\(V\(r\)\) > 0\.5\)\) \? \(V\(a\)\) : 1e6\*\(\(1\)-V\(B1__idt0\)\)$/m);
    expect(t).toMatch(/^B__B1__sdt2 0 B1__sdt2 I=\(time > 0\) \? \(1\) : 1e6\*\(\(0\)-V\(B1__sdt2\)\)$/m);
  });

  it('fuente B: idtmod → integral con módulo y offset a la salida; idt anidada', () => {
    expect(bsrc('V=idtmod(V(f),0,1,-0.5)')).toMatch(/V=\(\(-0\.5\)\+V\(B1__idtmod0\)-\(1\)\*floor\(V\(B1__idtmod0\)\/\(1\)\)\)$/m);
    const t = bsrc('V=idt(idt(1))');
    expect(t).toMatch(/^B__B1__idt2 0 B1__idt2 I=\(time > 0\) \? \(V\(B1__idt0\)\) : /m);
  });

  it('fuente B: delay constante → línea ideal; variable → code model delay con aviso', () => {
    const t = bsrc('I=delay(V(x),{Trep})');
    expect(t).toMatch(/^B1 \S+ \S+ I=V\(B1__delay0\)$/m);
    expect(t).toMatch(/^B__B1__delay0 B1__delay0_in 0 V=V\(x\)$/m);
    expect(t).toMatch(/^T__B1__delay0 B1__delay0_in 0 B1__delay0 0 Z0=1 TD=\{Trep\}$/m);
    expect(t).toMatch(/^R__B1__delay0 B1__delay0 0 1$/m);
    const v = ng(`Version 4
SHEET 1 880 680
SYMBOL bv 0 0 R0
SYMATTR InstName B1
SYMATTR Value V=delay(V(in),V(td))
`);
    expect(v.text).toMatch(/^A__B1__delay0 B1__delay0_in B1__delay0 B1__delay0_t B1__delay0_m$/m);
    // delmax = min(tmax, tstop): ngspice lo recorta al final de la simulación (#131)
    expect(v.text).toMatch(/^\.model B1__delay0_m delay\(delmin=0 delmax=\{min\(1e30,dly_tstop\)\} has_delay_cnt=true\)$/m);
    expect(v.text).toContain('V=(V(td))/(min(1e30,dly_tstop))');
    const prep = prepareSimulation({ ...v, text: `${v.text.replace(/\.end\s*$/, '')}.tran 1u 20m
.end` }, () => '');
    expect(prep.netlist).toMatch(/^\.param dly_tstop=20m$/m);
    expect(v.warnings.some((w) => /delay\(\) con retardo variable/.test(w))).toBe(true);
  });

  it('archivo de modelos: idt/rand de las fuentes B con los auxiliares adentro del .subckt', () => {
    const t = patchModelFile('.subckt a in out\nB_s out 0 V=idt(V(in))/{T}\nB2 x 0 V=rand(time)\n.ends a', new Map());
    expect(t).toMatch(/^B_s out 0 V=V\(B_s__idt0\)\/\{T\}\nC__B_s__idt0 B_s__idt0 0 1\nB__B_s__idt0 0 B_s__idt0 I=/m);
    expect(t).not.toMatch(/rand\(/);
    expect(t).toMatch(/\.ends a$/);
  });

  it('fuente B: rand/random/white → hash pseudoaleatorio de floor(x)', () => {
    const t = bsrc('V=rand(time*10)>.5+white(time)');
    expect(t).not.toMatch(/\b(rand|white|random)\(/);
    expect(t).toMatch(/sin\(\(floor\(time\*10\)\)\*12\.9898/);
  });

  it('resistencia de comportamiento "R= expr" → r={expr} (sigue siendo R)', () => {
    const r = ng(`Version 4
SHEET 1 880 680
SYMBOL res 0 0 R0
SYMATTR InstName R5
SYMATTR Value R= -1000*(V(Vx))**3 + 3400*(V(Vx))**2+200
`);
    expect(r.text).toMatch(/^R5 \S+ \S+ r=\{-1000\*\(V\(Vx\)\)\*\*3 \+ 3400\*\(V\(Vx\)\)\*\*2\+200\}$/m);
    expect(r.names.get('R5')).toBe('R5');
  });

  it('.ic con corrientes de inductor: I(L1)=x pasa a IC= del inductor y V() queda en .ic', () => {
    const r = ng(`Version 4
SHEET 1 880 680
SYMBOL ind 0 0 R0
SYMATTR InstName L§N2
SYMATTR Value 1m
SYMBOL ind 100 0 R0
SYMATTR InstName L2
SYMATTR Value 1m
SYMATTR SpiceLine Rser=2
TEXT 0 200 Left 2 !.ic I(N2)=0 V(a)=1 I(L2)=0.5
TEXT 0 240 Left 2 !.ic I(L9)=3
`);
    expect(r.text).toMatch(/^L_N2 \S+ \S+ 1m ic=0$/m);
    expect(r.text).toMatch(/^L2 \S+ \S+ 1m ic=0.5$/m);
    expect(r.text).toContain('.ic V(a)=1');
    expect(r.text).not.toMatch(/^\.ic.*I\(/m);
  });

  it('.tran con una SINE: paso máximo T/8.7 como LTspice (#101)', () => {
    const sch = (tran: string, sine = 'SINE(0 1 1k)') => ng(`Version 4
SHEET 1 880 680
SYMBOL voltage 0 0 R0
SYMATTR InstName V1
SYMATTR Value ${sine}
TEXT 0 200 Left 2 !${tran}
`).text;
    expect(sch('.tran 0.003 3')).toContain('.tran 0.003 3 0 0.000114942528736');
    expect(sch('.tran 0.003 3 0 1')).toContain('.tran 0.003 3 0 0.000114942528736');
    expect(sch('.tran 0.003 3 0 1u')).toContain('.tran 0.003 3 0 1u');
    // tstop corto: tstop/1024
    expect(sch('.tran 30m')).toContain('.tran 0.00003 30m 0 0.000029296875');
    // arranca después de tstop: sólo tstop/1024; frecuencia con parámetros: no cambia
    expect(sch('.tran 3', 'SINE(0 1 1k 5)')).toContain('.tran 0.003 3 0 0.0029296875');
    expect(sch('.tran 3', 'SINE(0 1 {f})')).toMatch(/^\.tran 0\.003 3$/m);
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

  it('#197: avisa cuando un .control a mano no corre la configuración del testbench', () => {
    const ctl = (body: string) =>
      ng(`Version 4
SHEET 1 880 680
TEXT 0 0 Left 2 !.tran 10m
TEXT 0 100 Left 2 ;.control\\n${body}\\n.endc
`).warnings;
    expect(ctl('run\\nprint v(1)')).toEqual([]);
    expect(ctl('tran 1u 1m\\nac dec 10 1 1k')).toEqual(['El bloque .control corre su propio análisis (tran, ac), no la configuración de simulación del testbench']);
    expect(ctl('run\\nac dec 10 1 1k')).toEqual(['El bloque .control corre la configuración de simulación y además su propio análisis (ac)']);
    expect(ctl('* tran 1u 1m\\nprint v(1)')).toEqual(['El bloque .control no tiene "run" ni un comando de análisis: no se simula nada']);
    // con secciones (código propio del Estudio) TurboSpice agrega el run: sin aviso
    expect(ctl('* antes de cada corrida\\n* después de cada corrida\\nprint v(1)')).toEqual([]);
    // programa de bloques sin Simular
    expect(ctl('* bloques\\necho hola')).toEqual(['El programa de bloques no tiene el bloque Simular: no se simula nada']);
    expect(ctl('* bloques\\nrun')).toEqual([]);
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
    expect(toNgspice(n, 't', resolver).text).toContain('I=LIMIT( -V(a) , 1 , -1 ) * ((V(a)) > 0 ? 1 : 0)');
  });

  it('fuentes B: round, buf, inv e hypot fuera de llaves (ngspice no las tiene)', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
SYMBOL bv 0 0 R0
SYMATTR InstName B2
SYMATTR Value V=u(time*1200-round(time*1200))+buf(V(a))
`);
    const t = toNgspice(n, 't', resolver).text;
    expect(t).toContain('V=((time*1200-(sgn(time*1200)*floor(abs(time*1200)+0.5))) > 0 ? 1 : 0)+((V(a)) > 0.5 ? 1 : 0)');
  });

  it('fuentes B: u(x) es 0 en x = 0 (la u() de ngspice vale 0,5) (#128)', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
SYMBOL bv 0 0 R0
SYMATTR InstName B6
SYMATTR Value V=u(ddt(u(V(a))))
`);
    expect(toNgspice(n, 't', resolver).text).toContain('V=((ddt(((V(a)) > 0 ? 1 : 0))) > 0 ? 1 : 0)');
  });

  it('fuentes B: if(x,y,z) es y si x >= 0,5 y si no z (#129)', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
SYMBOL bv 0 0 R0
SYMATTR InstName B1
SYMATTR Value V=if(sin(2*pi*time)+.5,2,-2)
`);
    expect(toNgspice(n, 't', resolver).text).toContain('V=((sin(2*pi*time)+.5) >= 0.5 ? (2) : (-2))');
  });

  it('table/tbl fuera de las fuentes B: cadena de ternarios con interpolación lineal (#130)', async () => {
    const { translateFunctions } = await import('../../src/netlist/tongspice.ts');
    const f = translateFunctions('.FUNC RT(x) table(x, 1,1, 2,3, 4,4)').replace(/^\.func RT\(x\) /i, '');
    // numparam tiene ?: como JavaScript: se evalúa igual
    const rt = new Function('x', `return ${f}`) as (x: number) => number;
    expect([0, 1, 1.5, 2, 3, 4, 9].map(rt)).toEqual([1, 1, 2, 3, 3.5, 4, 4]);
    expect(translateFunctions('{TBL(T, 0,34k, 25,10k, 50,3.55k)}')).toMatch(/^\{\(\(T\) <= \(0\) \? \(34k\)/);
    expect(translateFunctions('{table(x, 1,2,3)}')).toBe('{table(x, 1,2,3)}');
  });

  it('fuentes B: tbl() como table(); con puntos que no son literales, ternarios (pwl sólo admite literales)', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
SYMBOL bi 0 0 R0
SYMATTR InstName B1
SYMATTR Value I=tbl(V(s),-1,-2,0,0,1,2)
SYMBOL bi 100 0 R0
SYMATTR InstName B2
SYMATTR Value I=tbl(V(s),-vc,-Fc,0,0,vc,Fc)
`);
    const t = toNgspice(n, 't', resolver).text;
    expect(t).toContain('I=pwl(V(s),-1,-2,0,0,1,2)');
    expect(t).toMatch(/I=\(\(V\(s\)\) <= \(-vc\) \? \(-Fc\)/);
  });

  it('I1 a b TBL(v1 i1 …): corriente tabulada de su propia tensión → fuente B (#130)', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
FLAG 0 0 s
FLAG 0 96 0
SYMBOL current 0 0 R0
SYMATTR InstName Ifric
SYMATTR Value TBL(-1 -2 0 0 {vc} 3)
`);
    const t = toNgspice(n, 't', resolver);
    expect(t.text).toMatch(/^B_Ifric \S+ \S+ I=\(\(V\(\S+,\S+\)\) <= \(-1\) \? \(-2\)/m);
    expect(t.names.get('Ifric')).toBe('B_Ifric');
  });

  it('fuentes B escritas como directiva o en un archivo de modelos, también con "+" (#130)', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
TEXT 0 0 Left 2 !Bvco a 0 V=1/64*TABLE(V(c), 0, 700, 1, 855)\\nBr b 0 V=Round(V(c))*2
`);
    const t = toNgspice(n, 't', resolver).text;
    expect(t).toContain('Bvco a 0 V=1/64*pwl(V(c),0,700,1,855)');
    expect(t).toContain('Br b 0 V=(sgn(V(c))*floor(abs(V(c))+0.5))*2');
    const m = patchModelFile('.subckt s p n\nB1 p n I=TABLE(V(p,n), 0,0, 1,2,\n+ 2,5)\n.ends s', new Map());
    expect(m).toContain('B1 p n I=pwl(V(p,n),0,0,1,2,2,5)');
  });

  it('un nodo llamado Temp/temper se renombra (temp y temper son variables de las fuentes B de ngspice) (#104)', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
FLAG 0 16 Temp
FLAG 0 96 0
SYMBOL bv 0 0 R0
SYMATTR InstName B3
SYMATTR Value V= 800k * V(Temp) + 200
TEXT 0 200 Left 2 !.ic V(temp)=1
`);
    const t = toNgspice(n, 't', resolver).text;
    expect(t).toMatch(/^B3 \S+ \S+ V= 800k \* V\(Temp_\) \+ 200$/m);
    expect(t).toContain('.ic V(temp_)=1');
    expect(ngNodeName('Temper')).toBe('Temper_');
    expect(ngNodeName('temperature')).toBe('temperature');
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

  it('.meas en dos renglones con "+": la continuación no queda suelta', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
TEXT 0 0 Left 2 !.meas ac pm find V(a)\\n+ when mag(V(a))=1\\n.ac dec 10 1 1k
`);
    const r = toNgspice(n, 't', resolver);
    expect(r.text).not.toMatch(/^\+/m);
    expect(r.measures).toContain('.meas ac pm find V(a) when mag(V(a))=1');
  });

  it('K con inductores cuyo InstName no empieza con L (L§N2)', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
SYMBOL ind 0 0 R0
SYMATTR InstName N2
SYMATTR Value 1m
SYMBOL ind 100 0 R0
SYMATTR InstName L1
SYMATTR Value 1m
TEXT 0 200 Left 2 !K1 N2 L1 1
`);
    const t = toNgspice(n, 't', resolver);
    expect(t.text).toContain(`K1 ${t.names.get('L§N2')} ${t.names.get('L1')} 1`);
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

  it('.model ako: con el modelo base en library/cmp incluye su archivo', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
SYMBOL zener 0 0 R0
SYMATTR InstName D1
SYMATTR Value Dz
TEXT 0 200 Left 2 !.model Dz ako: 1N750 (bv=4.3)
`);
    const t = toNgspice(n, 't', { ...resolver, cmpFile: (m: string) => lib.cmpFileDefining(m) });
    expect(t.includes).toContain(lib.cmpFileDefining('1N750'));
  });

  it('.tran startup: rampa de 20 µs sólo en las fuentes V/I de DC puro', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
FLAG 0 0 a
FLAG 0 100 0
FLAG 200 0 s
FLAG 200 100 0
FLAG 400 0 i
FLAG 400 100 0
FLAG 600 0 d
FLAG 600 100 0
SYMBOL voltage 0 0 R0
SYMATTR InstName V1
SYMATTR Value 5 Rser=1
SYMBOL voltage 200 0 R0
SYMATTR InstName V2
SYMATTR Value SINE(1 2 10k)
SYMBOL current 400 0 R0
SYMATTR InstName I1
SYMATTR Value {2*x}
SYMBOL voltage 600 0 R0
SYMATTR InstName V3
SYMATTR Value DC 4 AC 1
TEXT 0 200 Left 2 !.tran 0 100u 0 0.1u startup
`);
    const r = toNgspice(n, 't', resolver);
    expect(r.text).toMatch(/^V1 \S+ \S+ DC 5 PWL\(0 0 20u 5\)$/m);
    expect(r.text).toMatch(/^V2 \S+ \S+ SINE\(1 2 10k\)$/m);
    expect(r.text).toMatch(/^I1 \S+ \S+ DC \{2\*x\} PWL\(0 0 20u \{2\*x\}\)$/m);
    expect(r.text).toMatch(/^V3 \S+ \S+ DC 4 AC 1 PWL\(0 0 20u 4\)$/m);
    expect(r.text).toMatch(/^\.tran 1e-7 100u 0 9\.765625e-8$/m);
    expect(r.warnings.join()).not.toContain('startup');
  });

  it('.tran sin startup: las fuentes DC no cambian', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
FLAG 0 0 a
FLAG 0 100 0
SYMBOL voltage 0 0 R0
SYMATTR InstName V1
SYMATTR Value 5
TEXT 0 200 Left 2 !.tran 100u
`);
    expect(toNgspice(n, 't', resolver).text).toMatch(/^V1 \S+ \S+ 5$/m);
  });

  it('IC= de capacitor flotante e inductor sin uic → fuente B que sólo actúa en el punto de operación', () => {
    const asc = (tran: string) => `Version 4
SHEET 1 880 680
SYMBOL cap 0 16 R0
SYMATTR InstName C1
SYMATTR Value 1u IC=2
SYMBOL ind 200 16 R0
SYMATTR InstName L1
SYMATTR Value 1m IC={i0}
TEXT 0 200 Left 2 !${tran}
`;
    const t = toNgspice(netFromAsc(asc('.tran 5m')), 't', resolver).text;
    expect(t).toMatch(/^B__C1_ic (\S+) (\S+) I=\(time > 0\) \? 0 : 1e6\*\(V\(\1,\2\)-\(2\)\)$/m);
    expect(t).toMatch(/^L1 \S+ L1__ic 1m /m);
    expect(t).toMatch(/^R__L1 L1__s \S+ 1m$/m);
    expect(t).toMatch(/^B__L1_ic L1__ic L1__s V=\(time > 0\) \? 0 : 1e6\*\(\(\{i0\}\)-I\(L1\)\)$/m);
    // con uic ngspice ya usa los IC= de los elementos
    const u = toNgspice(netFromAsc(asc('.tran 0 5m 0 1u uic')), 't', resolver).text;
    expect(u).not.toContain('B__');
  });

  it('IC= sin uic: inductores acoplados con K quedan como antes; un parámetro sin llaves va entre llaves', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
SYMBOL ind 200 16 R0
SYMATTR InstName L1
SYMATTR Value 1m IC=1
SYMBOL cap 0 16 R0
SYMATTR InstName C1
SYMATTR Value 1u IC=Vinic
TEXT 0 200 Left 2 !.tran 5m\\nK1 L1 L2 1
`);
    const t = toNgspice(n, 't', resolver).text;
    expect(t).not.toContain('B__L1_ic');
    expect(t).toMatch(/^B__C1_ic .* 1e6\*\(V\(\S+\)-\(\{Vinic\}\)\)$/m);
  });

  it('IC= de un capacitor a tierra → .ic (LTspice lo usa sin uic)', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
FLAG 16 80 0
FLAG 16 16 b
FLAG 116 16 0
FLAG 116 80 c
SYMBOL cap 0 16 R0
SYMATTR InstName C1
SYMATTR Value 1u IC=1
SYMBOL cap 100 16 R0
SYMATTR InstName C2
SYMATTR Value 1u ic={x/2}
`);
    const t = toNgspice(n, 't', resolver).text;
    expect(t).toContain('.ic V(b)=1');
    expect(t).toContain('.ic V(c)={-(x/2)}');
  });

  it('valores con llaves en parte del token: "2*{a}" y "Freq=1/{2*pi*f}"', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
SYMBOL res 0 0 R0
SYMATTR InstName R1
SYMATTR Value 2*{a}
SYMBOL voltage 100 0 R0
SYMATTR InstName V1
SYMATTR Value PULSE(0 {V} 1n 1n 1n {ton} {tp})
`);
    const t = toNgspice(n, 't', resolver).text;
    expect(t).toMatch(/^R1 \S+ \S+ \{2\*a\}$/m);
    expect(t).toContain('PULSE(0 {V} 1n 1n 1n {ton} {tp})');
  });

  it('.param con notación RKM (1K94) y llaves sueltas en la expresión', () => {
    const n = netFromAsc(`Version 4
SHEET 1 880 680
TEXT 0 0 Left 2 !.param R_CROSSOVER=1K94\\n.param ton=(1/(2*{f}))\\n.param tp= 2*{ton}
`);
    const t = toNgspice(n, 't', resolver).text;
    expect(t).toContain('.param R_CROSSOVER=1.94K');
    expect(t).toContain('.param ton={(1/(2*f))}');
    expect(t).toContain('.param tp={2*ton}');
  });

  it('reemplaza diodos ideales de LTspice por fuentes B', () => {
    const r = replaceIdealDiodes('D1 a k di\n.model di D(Ron=1 Vfwd=0.5)');
    expect(r.text).toContain('BD1 a k I=(V(a,k)>=0.5) ? (0.5/1e12+(V(a,k)-0.5)/1) : (V(a,k)/1e12)');
    expect(r.models).toEqual(['di']);
    // Ron=0: LTspice conduce como 1 mΩ (medido con -b), no divide por 0 (#127)
    expect(replaceIdealDiodes('D1 a k di\n.model di D(Ron=0 Roff=1G)').text).toContain('(V(a,k)-0)/1m)');
    expect(replaceIdealDiodes('D1 a k di\n.model di D(Ron={r})').text).toContain('/(max(r, 1m)))');
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
    // .asy de bloque sin Prefix (LTspice_cmosedu): LTspice lo instancia igual, como X§<InstName> (#127)
    const sym = makeSymbol({ name: 'div', pins: ports, block: true });
    expect(sym).toMatch(/SYMATTR Prefix/);
    mine.addSymbol('div', sym.replace(/^SYMATTR Prefix.*\r?\n/m, ''));
    const lt2 = ltNetlist(top, mine);
    expect(lt2.warnings).toEqual([]);
    expect(ltNetlistText(lt2)).toContain('X§X1 a b div');
    // parámetros de instancia (SpiceLine): el nombre del bloque va antes, con "params:"
    const top3 = parseAsc(`Version 4\nSHEET 1 880 680\nFLAG -32 0 a\nFLAG 32 0 b\nSYMBOL div 0 0 R0\nSYMATTR InstName X1\nSYMATTR SpiceLine R=5k\nTEXT 0 100 Left 2 !.op\n`);
    const lt3 = ltNetlist(top3, mine);
    expect(ltNetlistText(lt3)).toContain('X§X1 a b div params: R=5k');
    // el bloque no es un modelo que falte
    expect(toNgspice(lt3, 't', { resolve: () => undefined, defines: () => false }).warnings).toEqual([]);
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
    expect(translateFunctions('.param p=if(x,2,3)')).toBe('.param p=((x) >= 0.5 ? (2) : (3))');
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

describe('Laplace en E/G/B → s_xfer', () => {
  const sym = (type: string, name: string, value: string) => `Version 4
SHEET 1 880 680
SYMBOL ${type} 0 0 R0
SYMATTR InstName ${name}
SYMATTR Value ${value}
`;
  const ng = (type: string, name: string, value: string) => toNgspice(netFromAsc(sym(type, name, value)), 't', resolver);

  it('E con transferencia propia y parámetros: coeficientes como expresiones de numparam', () => {
    const t = ng('e', 'E1', 'Laplace=(s/ {w0})/(s/{w0}+1)').text;
    expect(t).toMatch(/^E__E1_in E1__in 0 \S+ \S+ 1$/m);
    expect(t).toContain('A__E1 E1__in E1__r E1__lap');
    expect(t).toContain('.model E1__lap s_xfer(num_coeff=[{1/(w0)} 0] den_coeff=[{1/(w0)} 1])');
    expect(t).toMatch(/^E1 \S+ \S+ E1__r 0 1$/m);
  });

  it('productos de factores, potencias s**2 y s^2, y polos en el origen', () => {
    expect(ng('e', 'E1', 'Laplace=1/((s+0.01)^2)').text).toContain('s_xfer(num_coeff=[1] den_coeff=[1 0.02 0.0001])');
    expect(ng('e', 'E1', 'laplace = 1/(1+1*s+s**2)').text).toContain('den_coeff=[1 1 1]');
    expect(ng('g', 'G1', 'Laplace=2/s*1/(1+s/4)').text).toContain('s_xfer(num_coeff=[2] den_coeff=[0.25 1 0])');
  });

  it('fuente B con entrada explícita y la forma Laplace(…) sin "="', () => {
    const t = ng('bv', 'B1', 'V=V(a)-V(b) Laplace(1/(1+s*2))').text;
    expect(t).toContain('B__B1_in B1__in 0 V=V(a)-V(b)');
    expect(t).toContain('den_coeff=[2 1]');
    expect(t).toMatch(/^B1 \S+ \S+ V=V\(B1__r\)$/m);
  });

  it('numerador de mayor grado: la parte polinomial va con derivadores', () => {
    const t = ng('e', 'E1', 'Laplace=(1+3*s)*(1+2*s)/(1+s)').text;
    // (6s²+5s+1)/(s+1) = 6s - 1 + 2/(s+1)
    expect(t).toContain('s_xfer(num_coeff=[2] den_coeff=[1 1])');
    expect(t).toContain('C__E1_d1 E1__in E1__d1c 1');
    expect(t).toContain('B__E1_y E1__y 0 V=V(E1__r)+(-1)*V(E1__in)+6*V(E1__d1)');
  });

  it('llaves en parte de la expresión, cache= y ganancia antes de Laplace', () => {
    expect(ng('e', 'E1', 'Laplace={w0/Q}*s /(s*s  + {w0/Q}*s + {w0*w0}) cache=2').text).toContain(
      's_xfer(num_coeff=[{(w0)*(1/(Q))} 0] den_coeff=[1 {(w0)*(1/(Q))} {(w0)*(w0)}])',
    );
    expect(ng('e', 'E1', '2 Laplace=1/(1+s)').text).toContain('s_xfer(num_coeff=[2] den_coeff=[1 1])');
  });

  it('en archivos de modelos (TCLib/fdnr.lib: G1 1 2 1 2 Laplace=(s^2)*{D})', () => {
    const t = replaceLaplaceLines('.subckt FDNR 1 2 D=1\nG1 1 2 1 2 Laplace=(s^2)*{D}\n.ends', []);
    expect(t).toContain('E__G1_in G1__in 0 1 2 1');
    expect(t).toContain('B__G1_y G1__y 0 V={D}*V(G1__d2)');
    expect(t).toContain('G1 1 2 G1__y 0 1');
  });

  it('coeficientes de órdenes muy distintos: s escalada con denormalized_freq', () => {
    expect(ng('e', 'E1', 'Laplace=1/(1+s/1e6)**2').text).toContain('s_xfer(num_coeff=[0.5] den_coeff=[0.5 1 0.5] denormalized_freq=1000000)');
  });

  it('sin s: ganancia constante', () => {
    expect(ng('e', 'E1', 'Laplace=DIAM*DIAM*5e6').text).toContain(' {((DIAM)*(DIAM))*5000000}');
  });

  it('lo que no es racional en s se avisa', () => {
    const r = ng('e', 'E1', 'Laplace=exp(-.001*s)/(1+.001*s)**2');
    expect(r.warnings.join('\n')).toMatch(/E1: la transferencia .* no es un cociente de polinomios en s \(exp\(\) de s\)/);
    expect(ng('e', 'E1', 'Laplace=1e-6*s**{alpha}').warnings.join('\n')).toMatch(/no es un cociente/);
  });
});

describe('nodos flotantes (como LTspice: gmin en el último nodo creado de cada grupo)', () => {
  it('entrada de E abierta, capacitores en serie y fuente entre capacitores', () => {
    const net = [
      'V1 1 0 1', 'E1 out 0 in 0 10', 'R1 out 0 1k',
      'C1 1 2 1u', 'C2 2 0 3u',
      'C3 1 3 1u', 'R3 3 4 1k', 'C4 4 0 1u',
      'C5 1 a 1u', 'V3 a b 5', 'C6 b 0 1u',
      'L1 1 5 1m', 'I1 0 5 1m', 'D1 5 0 dmod', '.model dmod D',
      '.op', '.end',
    ].join('\n');
    // los mismos nodos que nombra LTspice en "WARNING: Node … is floating"
    expect(floatingNodes(net, {})).toEqual(['in', '2', '4', 'b']);
    const fixed = fixFloatingNodes(net, {}).text.split('\n');
    expect(fixed).toContain('R__float1 in 0 1e12');
    expect(fixed.at(-1)).toBe('.end');
  });

  it('nodos internos de subcircuitos (de la netlist o de un archivo incluido), con nombre aplanado', () => {
    const lib = ['.subckt Gyr V1+ V1- V2+ V2- PARAMS: R=1', 'Rin V1+ I1in 1m', 'VI1 I1in I1out 0', 'HV1 I1out V1- VI2 {-R}',
      'Rout V2+ I2in 1m', 'VI2 I2in I2out 0', 'HV2 I2out V2- VI1 {R}', '.ends Gyr'].join('\n');
    const net = ['X_U1 N014 N016 N010 N005 gyr R=1', 'X_U2 N010 N005 N011 N006 gyr R=1', 'V1 N016 0 1', 'R1 N011 0 1',
      '.subckt div a', 'C1 a m 1u', 'C2 m 0 1u', '.ends', 'XD N016 div', '.include gyr.lib', '.op', '.end'].join('\n');
    expect(floatingNodes(net, { 'gyr.lib': lib })).toEqual(['x_u2.i1out', 'xd.m']);
  });

  it('no toca circuitos con camino a tierra (transistores, MOSFET de 3 y 4 terminales, subcircuitos desconocidos)', () => {
    const net = ['V1 1 0 5', 'Q1 1 2 3 npn', 'R1 3 0 1k', 'C1 2 0 1n', 'M1 1 4 5 5 nm', 'M2 1 4 6 nm', 'R2 6 0 1', 'R4 4 0 1',
      'C5 5 0 1n', 'X1 7 8 nada', 'C7 1 7 1n', '.model npn NPN', '.model nm VDMOS', '.end'].join('\n');
    expect(floatingNodes(net, {})).toEqual([]);
    expect(fixFloatingNodes(net, {}).text).toBe(net);
  });
});

describe('compuertas digitales de LTspice (A: AND, OR, XOR, BUF; #106)', () => {
  // el XOR tiene las entradas 16 más a la izquierda
  const gate = (type: string, spiceLine = '', x = type === 'xor' ? 16 : 0) =>
    netFromAsc(`Version 4
SHEET 1 880 680
WIRE -32 32 -64 32
WIRE -32 48 -64 48
FLAG -64 32 a
FLAG -64 48 b
FLAG 32 48 q
SYMBOL Digital\\${type} ${x} 0 R0
SYMATTR InstName A1
${spiceLine ? `SYMATTR SpiceLine ${spiceLine}` : ''}
`);
  const ng = (lt: ReturnType<typeof netFromAsc>) => toNgspice(lt, 't', resolver).text;

  it('línea A como LTspice: 8 nodos, los pines sueltos y los que el símbolo no tiene van a 0', () => {
    expect(ltNetlistText(gate('and', 'Vhigh=5 Td=1n'))).toMatch(/^A1 a b 0 0 0 0 q 0 AND Vhigh=5 Td=1n$/m);
    expect(ltNetlistText(gate('inv'))).toMatch(/^A1 0 0 0 0 0 0 0 0 BUF$/m);
    // los NC_xx no se gastan en la compuerta
    const r = netFromAsc('Version 4\nSHEET 1 880 680\nSYMBOL Digital\\and 96 0 R0\nSYMATTR InstName A1\nSYMBOL res 300 0 R0\nSYMATTR InstName R1\n');
    expect(ltNetlistText(r)).toMatch(/^R1 NC_01 NC_02 R$/m);
  });

  it('AND: producto de las entradas conectadas (las de 0 no participan), umbral (Vhigh+Vlow)/2 respecto de com', () => {
    const t = ng(gate('and', 'Vhigh=5'));
    expect(t).toMatch(/^B_A1__x A1__x 0 V=min\(max\(\(V\(a,0\)-\(\{5\}\+\{0\}\)\/2\)\*1e4\+0\.5,0\),1\)\*min\(max\(\(V\(b,0\)/m);
    expect(t).toMatch(/^B_A1__q q 0 V=\{0\}\+\(\{5\}-\{0\}\)\*V\(A1__x\)$/m);
    expect(t).not.toMatch(/^A1 /m);
    expect(t).toMatch(/^R_A1__i1 a 0 1e12$/m);
  });

  it('OR, XOR (exactamente una alta) y AND sin entradas (= 1)', () => {
    expect(ng(gate('or'))).toMatch(/V=1-\(1-min\(.*\)\)\*\(1-min\(.*\)\)$/m);
    const x = ng(gate('xor')).split('\n').find((l) => l.startsWith('B_A1__x'))!;
    expect(x.match(/\*\(1-min\(/g)?.length).toBe(2);
    expect(ng(netFromAsc('Version 4\nSHEET 1 880 680\nFLAG 32 48 q\nSYMBOL Digital\\and 0 0 R0\nSYMATTR InstName A1\n'))).toMatch(/^B_A1__x A1__x 0 V=1$/m);
  });

  it('Td inercial (línea T + retención), Trise/Tfall con slew (uno toma el otro), Tau RC, Rout/Cout', () => {
    const t = ng(gate('and', 'Td=2n Trise=10n Tau=1n Rout=10 Cout=1p'));
    expect(t).toMatch(/^T_A1__d A1__x 0 A1__d 0 Z0=1 TD=\{2n\}$/m);
    expect(t).toMatch(/^B_A1__h 0 A1__h I=\(abs\(V\(A1__x\)-V\(A1__d\)\)<0\.5\) \? \(V\(A1__x\)-V\(A1__h\)\) : 0$/m);
    expect(t).toMatch(/^A_A1__s A1__h A1__s A1__sm$/m);
    expect(t).toMatch(/^\.model A1__sm slew\(rise_slope=\{1\/\(10n\)\} fall_slope=\{1\/\(10n\)\}\)$/m);
    expect(t).toMatch(/^C_A1__t A1__t 0 \{1n\}$/m);
    expect(t).toMatch(/^C_A1__h A1__h 0 \{\(2n\)\/100\}$/m);
    expect(t).toMatch(/^B_A1__q A1__q 0 V=.*min\(max\(V\(A1__t\),0\),1\)$/m);
    expect(t).toMatch(/^R_A1__q A1__q q \{10\}$/m);
    expect(t).toMatch(/^C_A1__q q 0 \{1p\}$/m);
  });

  it('buf: Q y _Q complementaria; los modelos que no son compuertas quedan como estaban', () => {
    const t = ng(netFromAsc('Version 4\nSHEET 1 880 680\nFLAG 64 48 q\nFLAG 64 80 qb\nFLAG 0 64 a\nSYMBOL Digital\\buf 0 0 R0\nSYMATTR InstName A1\n'));
    expect(t).toMatch(/^B_A1__qb qb 0 V=\{1\}-\(\{1\}-\{0\}\)\*V\(A1__x\)$/m);
    expect(t).toMatch(/^B_A1__q q 0 /m);
    const w: string[] = [];
    expect(translateDigital('A1', ['a', '0', '0', '0', '0', '0', 'q', '0'], 'DFLOP', w)).toBeUndefined();
    // parámetros sin "=" (como en TCLib/Charge_Pump.lib)
    const l = translateDigital('A4', ['u', '0', '0', '0', 'd', '0', 'c', '0'], 'AND Vhigh {Vcc} Trise 1n Tfall 2n', w)!;
    expect(l).toContain('.model A4__sm slew(rise_slope={1/(1n)} fall_slope={1/(2n)})');
    expect(l).toContain('B_A4__q c 0 V={0}+({Vcc}-{0})*min(max(V(A4__s),0),1)');
  });
});
