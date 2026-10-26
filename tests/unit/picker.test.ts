// Explorador de componentes (F2): carpetas primero, después los sueltos y al final el contenido de
// las subcarpetas; Characters sólo entrando a mano.
import { describe, expect, it } from 'vitest';
import { pickerItems, searchRank, type PickerItem } from '../../src/schematic/dialogs.tsx';

const PATHS = [
  'Digital/and',
  'Misc/DIAC',
  'OpAmps/opamp',
  'TCLib/OA_Ideal',
  'TCLib/Special/Characters/Goku',
  'TCLib/Special/arrow',
  'bi',
  'res',
  'zener',
];
const desc = (p: string) => (p === 'res' ? 'Resistor' : p === 'TCLib/Special/Characters/Goku' ? 'Goku' : '');
const show = (items: PickerItem[]) => items.map((it) => (it.kind === 'up' ? '..' : it.kind === 'dir' ? `[${it.path}]` : it.path));

describe('explorador de componentes', () => {
  it('en la raíz: carpetas, sueltos y después el contenido de las carpetas, sin Characters ni OpAmps (su carpeta, al fondo)', () => {
    expect(show(pickerItems(PATHS, '', '', desc))).toEqual([
      '[Digital]', '[Misc]', '[TCLib]',
      'bi', 'res', 'zener',
      'Digital/and', 'Misc/DIAC', 'TCLib/OA_Ideal', 'TCLib/Special/arrow',
      '[OpAmps]',
    ]);
  });

  it('dentro de una carpeta: subir, subcarpetas, sueltos y Characters al fondo', () => {
    expect(show(pickerItems(PATHS, 'TCLib/Special', '', desc))).toEqual(['..', 'TCLib/Special/arrow', '[TCLib/Special/Characters]']);
    expect(show(pickerItems(PATHS, 'TCLib/Special/Characters', '', desc))).toEqual(['..', 'TCLib/Special/Characters/Goku']);
  });

  it('la búsqueda ordena por nombre: igual, empieza con, contiene; la descripción al final', () => {
    const paths = ['EuropeanPolcap', 'lpnp', 'pnp', 'pnp2', 'polcap', 'zener'];
    const d = (p: string) => (p.endsWith('olcap') ? 'Polarized capacitor (with a zener-like note)' : '');
    expect(show(pickerItems(paths, '', 'pnp', d))).toEqual(['pnp', 'pnp2', 'lpnp']);
    expect(show(pickerItems(paths, '', 'ze', d))).toEqual(['zener', 'EuropeanPolcap', 'polcap']);
    expect(searchRank('Misc/DIAC', '', ['misc'])).toBe(3);
    expect(searchRank('res', 'Resistor', ['res', 'xyz'])).toBe(Infinity);
  });

  it('la búsqueda recorre toda la librería salvo Characters', () => {
    expect(show(pickerItems(PATHS, '', 'res', desc))).toEqual(['res']);
    expect(show(pickerItems(PATHS, '', 'goku', desc))).toEqual([]);
    expect(show(pickerItems(PATHS, '', 'opamp', desc))).toEqual([]);
    expect(show(pickerItems(PATHS, 'TCLib/Special/Characters', 'goku', desc))).toEqual(['TCLib/Special/Characters/Goku']);
  });
});
