// Categorías del buscador de componentes: todo símbolo de la biblioteca está en alguna (salvo las
// carpetas ocultas) y lo que nombra la clasificación existe.
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../scripts/build-library.mjs';
import { BASICS, CATEGORIES, MINE, classify } from '../../src/library/categories.ts';
import { Library, PROJECT_DIR, USER_DIR } from '../../src/library/library.ts';

const paths = new Library(buildBundle()).symbolPaths();
const cls = classify(paths);
const HIDDEN = /^(OpAmps|TCLib\/Special\/Characters)\//;

describe('categorías del buscador', () => {
  it('todo símbolo de la biblioteca está en alguna categoría (salvo las carpetas ocultas)', () => {
    expect(paths.filter((p) => !HIDDEN.test(p) && !cls.placements(p).length)).toEqual([]);
  });

  it('las carpetas ocultas no están en ninguna', () => {
    expect(paths.filter((p) => HIDDEN.test(p) && cls.placements(p).length)).toEqual([]);
  });

  it('cada ruta o patrón de la clasificación existe en la biblioteca', () => {
    const have = new Set(paths);
    const missing = CATEGORIES.flatMap((c) =>
      c.subs.flatMap((s) => s.items.filter((i) => (i.includes('*') ? !paths.some((p) => new RegExp(`^${i.replace(/\*/g, '[^/]*')}$`).test(p)) : !have.has(i))).map((i) => `${c.id}/${s.id}: ${i}`)),
    );
    expect(missing).toEqual([]);
  });

  it('ids únicos (en categorías y, dentro de cada una, en subcategorías)', () => {
    const ids = CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CATEGORIES) expect(new Set(c.subs.map((s) => s.id)).size).toBe(c.subs.length);
  });

  it('la categoría principal no es Básicos: un resistor es de Pasivos', () => {
    expect(cls.placements('res')[0].cat.id).toBe(BASICS);
    expect(cls.primary('res')?.cat.id).toBe('passives');
    expect(cls.primary('TCLib/PLL/RBS')?.sub.id).toBe('signals');
    expect(cls.placements('TCLib/PLL/RBS').map((w) => `${w.cat.id}/${w.sub.id}`)).toEqual(['sources/signals', 'analog/pll']);
  });

  it('el orden curado pone a Básicos primero', () => {
    expect(cls.order('res')).toBeLessThan(cls.order('res2'));
    expect(cls.order('TCLib/OA_Ideal')).toBeLessThan(cls.order('Misc/EuropeanResistor'));
  });

  it('Mis componentes: los del proyecto y los del usuario, y sólo si hay alguno', () => {
    expect(cls.categories.some((c) => c.id === MINE)).toBe(false);
    const mine = classify([...paths, `${PROJECT_DIR}/filtro`, `${USER_DIR}/ldo`]);
    expect(mine.categories.at(-1)?.id).toBe(MINE);
    expect(mine.sections(MINE).map((s) => s.paths)).toEqual([[`${PROJECT_DIR}/filtro`], [`${USER_DIR}/ldo`]]);
    expect(mine.primary(`${USER_DIR}/ldo`)?.cat.id).toBe(MINE);
  });
});
