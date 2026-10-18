// Utilidades comunes de los e2e.

/** Evita el diálogo de bienvenida de la primera visita */
export const skipWelcome = (target) => target.addInitScript(() => localStorage.setItem('turbospice.welcomed', '1'));

/** Recorre un desplegable ya abierto: los submenús con hover, el último ítem con click */
async function pick(page, path) {
  for (const [i, label] of path.entries()) {
    const menus = page.getByRole('menu');
    const item = menus.getByRole('menuitem', { name: label, exact: true }).or(menus.getByRole('menuitemcheckbox', { name: label, exact: true })).last();
    if (i < path.length - 1) await item.hover();
    else await item.click();
  }
}

/** Elige un ítem del menú principal (el botón junto al nombre): menu(page, 'Archivo', 'Ejemplos', 'Bode RLC') */
export async function menu(page, ...path) {
  await page.getByRole('button', { name: 'Menú', exact: true }).click();
  await pick(page, path);
}

/** Elige un tipo de análisis en la flecha de Simular (abre el menú de simulación en ese tipo) */
export async function simType(page, label) {
  await page.getByRole('button', { name: 'Tipo de simulación', exact: true }).click();
  await pick(page, [label]);
}

/** Abre un ejemplo y espera a que esté cargado (nombre en la barra, sin cambios) */
export async function openExample(page, name) {
  await menu(page, 'Archivo', 'Ejemplos', name.replace(/\.asc$/, ''));
  const file = name.endsWith('.asc') ? name : `${name}.asc`;
  await page.waitForFunction((f) => document.querySelector('.filename')?.textContent === f, file);
}
