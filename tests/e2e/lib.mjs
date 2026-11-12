// Utilidades comunes de los e2e.

/** Los e2e verifican la interfaz en español (#72; por defecto es inglés) */
export const spanishUi = (target) => target.addInitScript(() => localStorage.setItem('turbospice.lang', 'es'));
/** Evita el diálogo de bienvenida de la primera visita (y deja la interfaz en español) */
export const skipWelcome = async (target) => {
  await spanishUi(target);
  await target.addInitScript(() => localStorage.setItem('turbospice.welcomed', '1'));
};
/** La URL que abre el proyecto de muestra (el pasabajos RC) del que parten los e2e: la primera
 *  visita abre un proyecto vacío */
export const sampleUrl = (url) => `${url}${url.includes('?') ? '&' : '?'}example=${encodeURIComponent('Sample Project.turbo')}`;
/** Ver › Mostrar directivas (#48): para los tests que leen el .tran dibujado */
/** Proyecto nuevo con el botón Nuevo de la barra; si no entra (a 1280 px el grupo Archivo es el
 *  primero en pasar a «Más herramientas»), desde ese desplegable */
export async function newProject(page) {
  const button = page.getByRole('toolbar', { name: 'Herramientas' }).getByRole('button', { name: 'Nuevo', exact: true });
  if (await button.count()) return button.click();
  await page.getByRole('button', { name: 'Más herramientas' }).click();
  await page.getByRole('menuitem', { name: 'Nuevo', exact: true }).click();
}
export const showSimCommand = (target) => target.addInitScript(() => localStorage.setItem('turbospice.showSimCommand', '1'));

/** Recorre un desplegable ya abierto: los submenús con hover, el último ítem con click */
async function pick(page, path) {
  for (const [i, label] of path.entries()) {
    const menus = page.getByRole('menu');
    const item = menus
      .getByRole('menuitem', { name: label, exact: true })
      .or(menus.getByRole('menuitemcheckbox', { name: label, exact: true }))
      .last();
    if (i < path.length - 1) await item.hover();
    else {
      await item.click();
      // las simulaciones de la lista esperan un momento por si es un doble clic (renombrar, #151)
      await page.waitForTimeout(300);
    }
  }
}

/** Elige un ítem del menú principal (el botón junto al nombre): menu(page, 'Ejemplos', 'Bode RLC') */
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
  await page.getByRole('button', { name: 'Nueva simulación', exact: true }).click();
  await pick(page, [label]);
}

/** Abre el comando de simulación (el diálogo completo), opcionalmente en un tipo de análisis */
export async function simCommand(page, label) {
  await simType(page, 'Comando de simulación…');
  if (label) await page.locator('.analysis-list button', { hasText: label }).first().click();
}

/** Abre un ejemplo (una variante de tests/e2e/fixtures/Examples.turbo, fuera del menú) y espera a que esté cargado */
export async function openExample(page, name) {
  const variant = name.replace(/\.asc$/, '');
  const { readFileSync } = await import('node:fs');
  const buffer = readFileSync(new URL('./fixtures/Examples.turbo', import.meta.url));
  await page.locator('input[type=file][accept*=".turbo"]').first().setInputFiles({ name: 'Examples.turbo', mimeType: 'application/json', buffer });
  await page.waitForFunction(() => document.querySelector('.capsule-project')?.textContent === 'Examples');
  // el testbench se elige en el panel del proyecto (y el panel queda como estaba)
  const closed = !(await page.locator('.project-tree').count());
  if (closed) await page.getByRole('button', { name: 'Panel del proyecto', exact: true }).click();
  await page.locator('button.tree-name', { hasText: new RegExp(`^${variant.replace(/[.()]/g, '\\$&')}$`) }).click();
  if (closed) {
    await page.getByRole('button', { name: 'Panel del proyecto', exact: true }).click();
    await page.locator('.project-tree').waitFor({ state: 'detached' });
    // (el esquemático se reacomoda al cerrarse el panel)
    await steady(page);
  }

  await page.waitForFunction((v) => document.querySelector('.capsule-project')?.textContent === 'Examples' && document.querySelector('.proj-capsule')?.dataset.bench === v, variant);
  // (el esquemático nuevo se encuadra después de abrirlo: hasta que se quede quieto, un click por
  // coordenadas cae en otro lado; en la CI, más lenta, el doble click en Q1 no abría la tabla)
  await steady(page);
}

/** Borrar con el control deslizante (#150, #151): lo lleva hasta el final con el teclado */
export async function slideToDelete(page) {
  const slider = page.locator('.slide-confirm input[type=range]');
  await slider.focus();
  await slider.press('End');
  await page.locator('.slide-confirm').waitFor({ state: 'detached', timeout: 5000 });
}

/** El navegador de los e2e: Chrome/Chromium (CHROMIUM=ruta) o, con BROWSER=firefox, el Firefox de
 * Playwright (`npx playwright@<versión de playwright-core> install firefox`) */
// (también `npm run e2e --browser=firefox`, que es lo que hace `npm run e2e:firefox`)
export const FIREFOX = (process.env.BROWSER ?? process.env.npm_config_browser) === 'firefox';
export async function launchBrowser() {
  const { chromium, firefox } = await import('playwright-core');
  return FIREFOX ? firefox.launch() : chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
}

// --- Esperas por condición (fase 4.2 de la auditoría): en vez de pausas fijas ---

/** Espera a que el navegador pinte `n` cuadros: lo que React y uPlot redibujan tras un evento ya está en el DOM */
export const frames = (page, n = 2) =>
  page.evaluate(
    (k) =>
      new Promise((done) => {
        const step = (i) => (i ? requestAnimationFrame(() => step(i - 1)) : done());
        step(k);
      }),
    n,
  );

/**
 * Reintenta `fn` (async, devuelve algo «verdadero» cuando se cumple) hasta que se cumpla o pase `timeout`.
 * Devuelve el último valor: se usa dentro de un check, `check(await until(() => …), '…')`.
 */
export async function until(fn, timeout = 5000) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Espera a que el autoguardado en el navegador termine (data-autosave="saved" en <html>, ver App.tsx) */
export async function autosaved(page) {
  await frames(page);
  await page.waitForFunction(() => document.documentElement.dataset.autosave === 'saved', null, { timeout: 10000 });
}

/** Espera a que el esquemático deje de reacomodarse (el viewBox igual en tres lecturas seguidas): al abrir o cerrar paneles se reajusta un instante después */
export async function steady(page, timeout = 3000) {
  const view = () => page.locator('svg.editor').getAttribute('viewBox');
  const end = Date.now() + timeout;
  let last = await view();
  for (let same = 0; same < 3 && Date.now() < end; ) {
    await new Promise((r) => setTimeout(r, 50));
    const v = await view();
    same = v === last ? same + 1 : 0;
    last = v;
  }
}
