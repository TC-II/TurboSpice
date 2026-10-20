// Componentes de library/cmp: listas de las que se elige el valor, y su inclusión al simular.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import { CMP_FILES, cmpApply, cmpCell, cmpChoicesFor, compareCells, parseCmp, stripLtspiceInfo, type CmpKind } from '../../src/library/cmp.ts';
import { Library } from '../../src/library/library.ts';
import { ltNetlist } from '../../src/netlist/ltnetlist.ts';
import { prepareSimulation, toNgspice } from '../../src/netlist/tongspice.ts';
import { decode } from '../../src/asc/encoding.ts';

const lib = new Library(buildBundle());
const CMP = join(__dirname, '..', '..', 'library', 'cmp');

describe('archivos de library/cmp', () => {
  it('cada archivo tiene componentes y se lee bien (texto plano, Windows-1252)', () => {
    for (const [kind, file] of Object.entries(CMP_FILES) as [CmpKind, string][]) {
      const text = decode(new Uint8Array(readFileSync(join(CMP, file)))).text;
      const parts = parseCmp(file, text);
      expect(parts.length, file).toBeGreaterThanOrEqual(2);
      expect(parts.every((p) => p.kind === kind), file).toBe(true);
      expect(lib.parts(kind).map((p) => p.name)).toEqual(parts.map((p) => p.name));
    }
  });

  it('lee .model con parámetros, banderas y continuaciones "+"', () => {
    const [m] = parseCmp('standard.mos', '* c\n.model X1 VDMOS(pchan Kp=12\n+ Vto=-2 mfg=Acme_Corp)');
    expect(m).toMatchObject({ name: 'X1', type: 'VDMOS' });
    expect(m.flags.has('pchan')).toBe(true);
    expect(m.params.get('vto')).toBe('-2');
    expect(cmpCell(m, 'mfg')).toBe('Acme Corp');
    expect(cmpCell(m, '@channel')).toBe('P');
    const [c] = parseCmp('standard.cap', 'CX C=1u V=16 type=X7R ; comentario');
    expect(c).toMatchObject({ name: 'CX', type: '' });
    expect(c.params.get('c')).toBe('1u');
  });
});

describe('qué lista ve cada símbolo', () => {
  const names = (prefix: string, sym: string) =>
    cmpChoicesFor(prefix, sym).flatMap((c) => lib.parts(c.kind).filter(c.accept).map((p) => p.name));
  it('por polaridad, canal y tipo de diodo', () => {
    const npn = names('QN', 'npn');
    expect(npn).toContain('BC547C');
    expect(npn).not.toContain('BC557C');
    expect(names('QP', 'pnp')).toContain('BC557C');
    expect(names('D', 'diode')).toContain('1N4148');
    const sch = names('D', 'schottky');
    expect(sch.length).toBeGreaterThan(0);
    expect(sch).not.toContain('1N4148');
    expect(names('D', 'zener')).toContain('1N750');
    expect(names('JN', 'njf')).toContain('J201');
    expect(names('JN', 'njf')).not.toContain('2N5462');
    const pmos = names('MP', 'pmos');
    expect(pmos).toContain('IRF9640');
    expect(pmos).not.toContain('IRF740');
    expect(names('MN', 'nmos4')).toEqual([]); // VDMOS es de 3 terminales
    expect(cmpChoicesFor('L', 'ind').map((c) => c.label)).toEqual(['Inductores', 'Ferrites']);
    expect(cmpChoicesFor('V', 'voltage')).toEqual([]);
  });

  it('elegir un pasivo pone su valor y los parásitos en SpiceLine', () => {
    const [cap] = parseCmp('standard.cap', 'CE C=100u V=25 Irms=350m Rser=150m Lser=5n Rpar=1Meg type=X mfg=Y');
    expect(cmpApply(cap)).toEqual({ Value: '100u', SpiceLine: 'Rser=150m Lser=5n Rpar=1Meg' });
    const [bead] = parseCmp('standard.bead', 'FB Z100M=600 Idc=500m Rdc=150m L=1.2u Rpar=700 Cpar=1.2p mfg=Y');
    expect(cmpApply(bead)).toEqual({ Value: '1.2u', SpiceLine: 'Rser=150m Rpar=700 Cpar=1.2p' });
    const [res] = parseCmp('standard.res', 'R1 R=1k tol=1% P=0.25');
    expect(cmpApply(res)).toEqual({ Value: '1k', SpiceLine: null });
    expect(cmpApply(lib.parts('bjt').find((p) => p.name === 'BC547C')!)).toEqual({ Value: 'BC547C', SpiceLine: null });
  });
});

describe('al simular', () => {
  const asc = (body: string) => parseAsc(`Version 4\nSHEET 1 880 680\n${body}`);
  const resolver = {
    resolve: (p: string) => lib.resolveModelFile(p),
    defines: (m: string) => lib.definesModel(m),
    cmpFile: (m: string) => lib.cmpFileDefining(m),
  };

  it('un modelo de library/cmp se incluye solo y sin los informativos de LTspice', () => {
    const doc = asc('SYMBOL diode 0 0 R0\nSYMATTR InstName D1\nSYMATTR Value 1N4148\nSYMBOL npn 100 0 R0\nSYMATTR InstName Q1\nSYMATTR Value BC547C\n');
    const ng = toNgspice(ltNetlist(doc, lib), 't', resolver);
    expect(ng.includes).toEqual(['cmp/standard.dio', 'cmp/standard.bjt']);
    expect(ng.warnings.filter((w) => /no se encontró/.test(w))).toEqual([]);
    const read = (rel: string) => decode(new Uint8Array(readFileSync(join(CMP, rel.replace(/^cmp\//, ''))))).text;
    const prep = prepareSimulation(ng, read);
    expect(prep.files['cmp/standard.dio']).toMatch(/\.model 1N4148 D\(/);
    const models = (rel: string) => prep.files[rel].split(/\r?\n/).filter((l) => /^\.model/i.test(l)).join('\n');
    expect(models('cmp/standard.dio')).not.toMatch(/iave|vpk|mfg|type=/i);
    expect(models('cmp/standard.bjt')).not.toMatch(/vceo|icrating|mfg/i);
  });

  it('si el esquemático define el modelo, no se incluye el de la librería', () => {
    const doc = asc('SYMBOL diode 0 0 R0\nSYMATTR InstName D1\nSYMATTR Value 1N4148\nTEXT 0 200 Left 2 !.model 1N4148 D(Is=1n)\n');
    expect(toNgspice(ltNetlist(doc, lib), 't', resolver).includes).toEqual([]);
  });

  it('stripLtspiceInfo sólo toca las líneas .model', () => {
    expect(stripLtspiceInfo('.model D1 D(Is=1n Iave=1 Vpk=50 mfg=X type=silicon)\nR1 a b 1k ; type=x\n+ Vpk=3')).toBe('.model D1 D(Is=1n)\nR1 a b 1k ; type=x\n+ Vpk=3');
    expect(stripLtspiceInfo('.model Q1 NPN(BF=100\n+ Vceo=40 Icrating=1)')).toBe('.model Q1 NPN(BF=100\n+)');
  });
});

describe('compareCells (orden de la tabla, #69)', () => {
  const sorted = (xs: string[], dir: 1 | -1) => [...xs].sort((a, b) => compareCells(a, b, dir));
  it('números con sufijo SPICE, por valor', () => {
    expect(sorted(['4.7k', '100', '1meg', '220n', '1k'], 1)).toEqual(['220n', '100', '1k', '4.7k', '1meg']);
    expect(sorted(['4.7k', '100', '1meg'], -1)).toEqual(['1meg', '4.7k', '100']);
  });
  it('texto con números adentro en orden natural', () => {
    expect(sorted(['BC5470', 'bc547', '2N3904', 'BC337'], 1)).toEqual(['2N3904', 'BC337', 'bc547', 'BC5470']);
  });
  it('las vacías al final en los dos sentidos', () => {
    expect(sorted(['', '2', '1'], 1)).toEqual(['1', '2', '']);
    expect(sorted(['', '2', '1'], -1)).toEqual(['2', '1', '']);
  });
});
