// Buscador de componentes (P): la búsqueda en toda la biblioteca, con su orden, y el recorrido por
// carpetas de «Todos» (carpetas primero, después los sueltos y al final el contenido de las
// subcarpetas; Characters y los OpAmps sin modelo sólo entrando a mano).
import { describe, expect, it } from 'vitest';
import { classify, type Category } from '../../src/library/categories.ts';
import { folderItems, matchSpans, searchLibrary, searchRank, type FolderItem } from '../../src/schematic/pickerModel.ts';

const PATHS = ['Digital/and', 'Misc/DIAC', 'OpAmps/opamp', 'TCLib/OA_Ideal', 'TCLib/Special/Characters/Goku', 'TCLib/Special/arrow', 'bi', 'res', 'zener'];
const show = (items: FolderItem[]) => items.map((it) => (it.kind === 'up' ? '..' : it.kind === 'dir' ? `[${it.path}]` : it.path));

describe('«Todos»: por carpetas', () => {
  it('en la raíz: carpetas, sueltos y después el contenido de las carpetas, sin Characters ni OpAmps (su carpeta, al fondo)', () => {
    expect(show(folderItems(PATHS, ''))).toEqual(['[Digital]', '[Misc]', '[TCLib]', 'bi', 'res', 'zener', 'Digital/and', 'Misc/DIAC', 'TCLib/OA_Ideal', 'TCLib/Special/arrow', '[OpAmps]']);
  });

  it('dentro de una carpeta: subir, subcarpetas, sueltos y Characters al fondo', () => {
    expect(show(folderItems(PATHS, 'TCLib/Special'))).toEqual(['..', 'TCLib/Special/arrow', '[TCLib/Special/Characters]']);
    expect(show(folderItems(PATHS, 'TCLib/Special/Characters'))).toEqual(['..', 'TCLib/Special/Characters/Goku']);
  });
});

// una clasificación chica: Básicos con res y zener; Pasivos; Semiconductores; un PDK
const CATS: Category[] = [
  { id: 'basics', label: 'Basics', subs: [{ id: 'b', label: 'Passives', items: ['res', 'zener'] }] },
  { id: 'passives', label: 'Passives', subs: [{ id: 'r', label: 'Resistors', items: ['res', 'res2', 'EuropeanResistor'] }] },
  { id: 'semis', label: 'Semiconductors', subs: [{ id: 'd', label: 'Diodes', items: ['zener', 'pnp', 'pnp4', 'lpnp'] }] },
  { id: 'regs', label: 'Analog', subs: [{ id: 'g', label: 'Regulators', items: ['TCLib/Regulators/7805'] }] },
  { id: 'pdk', label: 'PDK', subs: [{ id: 's', label: 'sky130 · Resistors', items: ['sky130/res_*'] }] },
];

describe('búsqueda', () => {
  const lib = ['EuropeanResistor', 'Misc/DIAC', 'OpAmps/opamp', 'TCLib/Regulators/7805', 'TCLib/Special/Characters/Goku', 'lpnp', 'pnp', 'pnp4', 'res', 'res2', 'sky130/res_high_po', 'zener'];
  const cls = classify(lib, CATS);
  const desc = (p: string) => (p === 'res' ? 'Resistor' : p === 'TCLib/Special/Characters/Goku' ? 'Goku' : p === 'zener' ? 'Zener diode' : '');
  const find = (q: string, narrow: string | null = null, dir = '') => searchLibrary(lib, q, desc, cls, narrow, dir).paths;

  it('ordena por nombre: igual, empieza con, contiene; después carpeta, categoría y descripción', () => {
    expect(find('pnp')).toEqual(['pnp', 'pnp4', 'lpnp']);
    expect(searchRank('Misc/DIAC', '', ['misc'])).toBe(3);
    expect(searchRank('7805', '', ['regul'], 'Analog Regulators')).toBe(4);
    expect(searchRank('zener', 'Zener diode', ['diode'])).toBe(5);
    expect(searchRank('res', 'Resistor', ['res', 'xyz'])).toBe(Infinity);
  });

  it('encuentra por el nombre de la categoría (en el idioma de la interfaz)', () => {
    expect(find('regulators')).toEqual(['TCLib/Regulators/7805']);
    expect(find('diodes')).toEqual(['zener', 'pnp', 'pnp4', 'lpnp']);
  });

  it('los empates van en el orden curado (Básicos primero) y el PDK al final', () => {
    // res2 y EuropeanResistor contienen «res»; sky130/res_high_po empieza con «res», pero es del PDK
    expect(find('res')).toEqual(['res', 'res2', 'EuropeanResistor', 'sky130/res_high_po']);
  });

  it('acotada a una categoría: sólo los suyos; acotada al PDK, el PDK no va al final', () => {
    expect(find('res', 'passives')).toEqual(['res', 'res2', 'EuropeanResistor']);
    expect(find('res', 'pdk')).toEqual(['sky130/res_high_po']);
  });

  it('cuenta los resultados por categoría (sin acotar)', () => {
    const r = searchLibrary(lib, 'res', desc, cls, 'pdk');
    expect(Object.fromEntries(r.counts)).toEqual({ basics: 1, passives: 3, pdk: 1 });
  });

  it('no busca en las carpetas ocultas salvo que se las esté mirando en «Todos»', () => {
    expect(find('goku')).toEqual([]);
    expect(find('opamp')).toEqual([]);
    expect(find('goku', null, 'TCLib/Special/Characters')).toEqual(['TCLib/Special/Characters/Goku']);
  });

  it('npn2, npn3 y pnp2 no salen al buscar (sí en «Todos»)', () => {
    const all = [...lib, 'npn', 'npn2', 'npn3'];
    expect(searchLibrary(all, 'np', desc, classify(all, CATS)).paths).toEqual(['npn', 'pnp', 'pnp4', 'lpnp']);
    expect(show(folderItems(['npn', 'npn2'], ''))).toEqual(['npn', 'npn2']);
  });
});

describe('resaltado', () => {
  it('marca lo que coincide con cada palabra', () => {
    expect(matchSpans('OA_Ideal', ['ide'])).toEqual([
      { text: 'OA_', hit: false },
      { text: 'Ide', hit: true },
      { text: 'al', hit: false },
    ]);
    expect(matchSpans('res', [])).toEqual([{ text: 'res', hit: false }]);
  });
});
