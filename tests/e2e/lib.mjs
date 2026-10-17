// Utilidades comunes de los e2e.

/** Evita el diálogo de bienvenida de la primera visita */
export const skipWelcome = (target) => target.addInitScript(() => localStorage.setItem('turbospice.welcomed', '1'));

/** Elige un ítem de la barra de menús: menu(page, 'Archivo', 'Ejemplos', 'Bode RLC') */
export async function menu(page, ...path) {
  await page.getByRole('menubar').getByRole('menuitem', { name: path[0], exact: true }).click();
  for (const [i, label] of path.slice(1).entries()) {
    const menus = page.getByRole('menu');
    const item = menus.getByRole('menuitem', { name: label, exact: true }).or(menus.getByRole('menuitemcheckbox', { name: label, exact: true })).last();
    if (i < path.length - 2) await item.hover();
    else await item.click();
  }
}

export const openExample = (page, name) => menu(page, 'Archivo', 'Ejemplos', name.replace(/\.asc$/, ''));
