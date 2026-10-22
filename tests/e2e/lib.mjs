// Utilidades comunes de los e2e.

/** Los e2e verifican la interfaz en español (#72; por defecto es inglés) */
export const spanishUi = (target) => target.addInitScript(() => localStorage.setItem('turbospice.lang', 'es'));
/** Evita el diálogo de bienvenida de la primera visita (y deja la interfaz en español) */
export const skipWelcome = async (target) => {
  await spanishUi(target);
  await target.addInitScript(() => localStorage.setItem('turbospice.welcomed', '1'));
};
/** Ver › Mostrar el comando de simulación (#48): para los tests que leen el .tran dibujado */
export const showSimCommand = (target) => target.addInitScript(() => localStorage.setItem('turbospice.showSimCommand', '1'));

/** Recorre un desplegable ya abierto: los submenús con hover, el último ítem con click */
async function pick(page, path) {
  for (const [i, label] of path.entries()) {
    const menus = page.getByRole('menu');
    const item = menus.getByRole('menuitem', { name: label, exact: true }).or(menus.getByRole('menuitemcheckbox', { name: label, exact: true })).last();
    if (i < path.length - 1) await item.hover();
    else {
      await item.click();
      // las simulaciones de la lista esperan un momento por si es un doble clic (renombrar, #151)
      await page.waitForTimeout(300);
    }
  }
}

/** Elige un ítem del menú principal (el botón junto al nombre): menu(page, 'Archivo', 'Ejemplos', 'Bode RLC') */
export async function menu(page, ...path) {
  await page.getByRole('button', { name: 'Menú', exact: true }).click();
  await pick(page, path);
}

/** Elige un ítem de la flecha de Resultados: resultsMenu(page, 'Exportar', 'Trazas a CSV'), resultsMenu(page, 'Log') */
export async function resultsMenu(page, ...path) {
  await page.getByRole('button', { name: 'Más vistas de resultados', exact: true }).click();
  await pick(page, path);
}
/** Vista elegida en el panel de resultados ('' = el gráfico; si no, el nombre junto al botón) */
export const resultsView = async (page) => ((await page.locator('.results-bar .results-view').count()) ? page.locator('.results-bar .results-view').textContent() : '');

/** Elige un ítem de la flecha de Simular: una simulación guardada (por su nombre) o un tipo de
 * análisis (crea una simulación nueva, con sus parámetros en la barra) */
export async function simType(page, label) {
  await page.getByRole('button', { name: 'Tipo de simulación', exact: true }).click();
  await pick(page, [label]);
}

/** Abre el comando de simulación (el diálogo completo), opcionalmente en un tipo de análisis */
export async function simCommand(page, label) {
  await simType(page, 'Comando de simulación…');
  if (label) await page.locator('.analysis-list button', { hasText: label }).first().click();
}

/** Abre un ejemplo y espera a que esté cargado (nombre en la barra, sin cambios) */
export async function openExample(page, name) {
  await menu(page, 'Archivo', 'Ejemplos', name.replace(/\.asc$/, ''));
  // el .asc se abre como un proyecto con su nombre (la cápsula «Proyecto · Variante», #150)
  const project = name.replace(/\.asc$/, '');
  await page.waitForFunction((f) => document.querySelector('.capsule-project')?.textContent === f, project);
}

/** Borrar con el control deslizante (#150, #151): lo lleva hasta el final con el teclado */
export async function slideToDelete(page) {
  const slider = page.locator('.slide-confirm input[type=range]');
  await slider.focus();
  await slider.press('End');
  await page.locator('.slide-confirm').waitFor({ state: 'detached', timeout: 5000 });
}
