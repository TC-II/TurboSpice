// Explorador de componentes (F2): carpetas primero, después los sueltos y al final el contenido de
// las subcarpetas; Characters sólo entrando a mano.
import { describe, expect, it } from 'vitest';
import { pickerItems, type PickerItem } from '../../src/schematic/dialogs.tsx';

const PATHS = [
  'Digital/and',
  'Misc/DIAC',
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
  it('en la raíz: carpetas, sueltos y después el contenido de las carpetas, sin Characters', () => {
    expect(show(pickerItems(PATHS, '', '', desc))).toEqual([
      '[Digital]', '[Misc]', '[TCLib]',
      'bi', 'res', 'zener',
      'Digital/and', 'Misc/DIAC', 'TCLib/OA_Ideal', 'TCLib/Special/arrow',
    ]);
  });

  it('dentro de una carpeta: subir, subcarpetas (Characters incluida) y sueltos', () => {
    expect(show(pickerItems(PATHS, 'TCLib/Special', '', desc))).toEqual(['..', '[TCLib/Special/Characters]', 'TCLib/Special/arrow']);
    expect(show(pickerItems(PATHS, 'TCLib/Special/Characters', '', desc))).toEqual(['..', 'TCLib/Special/Characters/Goku']);
  });

  it('la búsqueda recorre toda la librería salvo Characters', () => {
    expect(show(pickerItems(PATHS, '', 'res', desc))).toEqual(['res']);
    expect(show(pickerItems(PATHS, '', 'goku', desc))).toEqual([]);
    expect(show(pickerItems(PATHS, 'TCLib/Special/Characters', 'goku', desc))).toEqual(['TCLib/Special/Characters/Goku']);
  });
});
