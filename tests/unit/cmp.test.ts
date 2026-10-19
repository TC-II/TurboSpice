// Componentes de library/cmp: listas de las que se elige el valor, y su inclusión al simular.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import { CMP_FILES, cmpApply, cmpCell, cmpChoicesFor, parseCmp, stripLtspiceInfo, type CmpKind } from '../../src/library/cmp.ts';
import { Library } from '../../src/library/library.ts';
import { ltNetlist } from '../../src/netlist/ltnetlist.ts';
import { prepareSimulation, toNgspice } from '../../src/netlist/tongspice.ts';
import { decode } from '../../src/asc/encoding.ts';

const lib = new Library(buildBundle());
const CMP = join(__dirname, '..', '..', 'library', 'cmp');

describe('archivos de library/cmp', () => {
  it('cada archivo tiene sus dos ejemplos y se lee bien (texto plano, Windows-1252)', () => {
    for (const [kind, file] of Object.entries(CMP_FILES) as [CmpKind, string][]) {
      const text = decode(new Uint8Array(readFileSync(join(CMP, file)))).text;
      const parts = parseCmp(file, text);
      expect(parts.length, file).toBeGreaterThanOrEqual(2);
      expect(parts.every((p) => p.kind === kind && p.name.startsWith('TS_')), file).toBe(true);
      expect(text, file).toContain('placeholders');
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
    expect(names('QN', 'npn')).toEqual(['TS_NPN_GP']);
    expect(names('QP', 'pnp')).toEqual(['TS_PNP_GP']);
    expect(names('D', 'diode')).toEqual(['TS_D_SENAL', 'TS_D_SCHOTTKY']);
    expect(names('D', 'schottky')).toEqual(['TS_D_SCHOTTKY']);
    expect(names('D', 'zener')).toEqual([]);
    expect(names('JN', 'njf')).toEqual(['TS_NJF_GP']);
    expect(names('MP', 'pmos')).toEqual(['TS_PMOS_60V']);
    expect(names('MN', 'nmos4')).toEqual([]); // VDMOS es de 3 terminales
    expect(cmpChoicesFor('L', 'ind').map((c) => c.label)).toEqual(['Inductores', 'Ferrites']);
    expect(cmpChoicesFor('V', 'voltage')).toEqual([]);
  });

  it('elegir un pasivo pone su valor y los parásitos en SpiceLine', () => {
    const cap = lib.parts('cap').find((p) => p.name === 'TS_C_100u_ELEC')!;
    expect(cmpApply(cap)).toEqual({ Value: '100u', SpiceLine: 'Rser=150m Lser=5n Rpar=1Meg' });
    const bead = lib.parts('bead')[0];
    expect(cmpApply(bead)).toEqual({ Value: '1.2u', SpiceLine: 'Rser=150m Rpar=700 Cpar=1.2p' });
    expect(cmpApply(lib.parts('res')[0])).toEqual({ Value: '1k', SpiceLine: null });
    expect(cmpApply(lib.parts('bjt')[0])).toEqual({ Value: 'TS_NPN_GP', SpiceLine: null });
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
    const doc = asc('SYMBOL diode 0 0 R0\nSYMATTR InstName D1\nSYMATTR Value TS_D_SENAL\nSYMBOL npn 100 0 R0\nSYMATTR InstName Q1\nSYMATTR Value TS_NPN_GP\n');
    const ng = toNgspice(ltNetlist(doc, lib), 't', resolver);
    expect(ng.includes).toEqual(['cmp/standard.dio', 'cmp/standard.bjt']);
    expect(ng.warnings.filter((w) => /no se encontró/.test(w))).toEqual([]);
    const read = (rel: string) => decode(new Uint8Array(readFileSync(join(CMP, rel.replace(/^cmp\//, ''))))).text;
    const prep = prepareSimulation(ng, read);
    expect(prep.files['cmp/standard.dio']).toMatch(/\.model TS_D_SENAL D\(/);
    const models = (rel: string) => prep.files[rel].split(/\r?\n/).filter((l) => /^\.model/i.test(l)).join('\n');
    expect(models('cmp/standard.dio')).not.toMatch(/iave|vpk|mfg|type=/i);
    expect(models('cmp/standard.bjt')).not.toMatch(/vceo|icrating|mfg/i);
  });

  it('si el esquemático define el modelo, no se incluye el de la librería', () => {
    const doc = asc('SYMBOL diode 0 0 R0\nSYMATTR InstName D1\nSYMATTR Value TS_D_SENAL\nTEXT 0 200 Left 2 !.model TS_D_SENAL D(Is=1n)\n');
    expect(toNgspice(ltNetlist(doc, lib), 't', resolver).includes).toEqual([]);
  });

  it('stripLtspiceInfo sólo toca las líneas .model', () => {
    expect(stripLtspiceInfo('.model D1 D(Is=1n Iave=1 Vpk=50 mfg=X type=silicon)\nR1 a b 1k ; type=x\n+ Vpk=3')).toBe('.model D1 D(Is=1n)\nR1 a b 1k ; type=x\n+ Vpk=3');
    expect(stripLtspiceInfo('.model Q1 NPN(BF=100\n+ Vceo=40 Icrating=1)')).toBe('.model Q1 NPN(BF=100\n+)');
  });
});
