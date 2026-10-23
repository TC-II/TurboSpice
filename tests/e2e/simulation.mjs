// E2E de los menús de simulación: comando de análisis, bloque .control con barrido
// superpuesto, selección de la tierra, miniaturas del selector de componentes y lista de
// simulaciones (#39).
// Uso: node tests/e2e/simulation.mjs [url] [carpeta-capturas]   (con `npm run preview` corriendo)
import { mkdirSync, readFileSync } from 'node:fs';
import { menu, openExample, resultsMenu, showSimCommand, simCommand, simType, skipWelcome, slideToDelete, launchBrowser } from './lib.mjs';
import { lineOf, simOf, variantOf } from '../../src/project/project.ts';
import { parseTurbo } from '../../src/project/turbo.ts';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const OUT = process.argv[3] ?? 'test-results';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await skipWelcome(page);
// los checks comparan la barra de Simular con el comando dibujado en el esquemático
await showSimCommand(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed++;
};

await page.goto(URL);
await page.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });
await page.locator('svg.editor .sym').first().waitFor(); // Sample Project: el pasabajos RC

const svg = page.locator('svg.editor');
const at = async (x, y) => {
  const box = await svg.boundingBox();
  const [vx, vy, vw, vh] = (await svg.getAttribute('viewBox')).split(' ').map(Number);
  return { x: box.x + ((x - vx) / vw) * box.width, y: box.y + ((y - vy) / vh) * box.height };
};

// --- Selector de componentes con miniaturas ---
await page.keyboard.press('p');
await page.locator('.modal input').fill('npn');
check((await page.locator('.picker-list svg.thumb .sym').count()) >= 3, 'el selector muestra miniaturas de los símbolos');
check((await page.locator('.picker-preview svg.big .sym').count()) === 1, 'y una vista previa grande');
await page.keyboard.press('Escape');

// --- Tierra: se selecciona haciendo click sobre su dibujo y se arrastra ---
const gnd = await at(240, 124); // barras inferiores de la tierra de C1 (conectada en 240,112)
await page.mouse.click(gnd.x, gnd.y);
check((await page.locator('.flags .flag.sel').count()) === 1, 'click sobre el dibujo de la tierra la selecciona');
const to = await at(240, 156);
await page.mouse.move(gnd.x, gnd.y);
await page.mouse.down();
await page.mouse.move(to.x, to.y, { steps: 5 });
await page.mouse.up();
const wires = await page.locator('.wires line').evaluateAll((ls) => ls.map((l) => [l.getAttribute('x1'), l.getAttribute('y1'), l.getAttribute('x2'), l.getAttribute('y2')].join(',')));
check(wires.some((w) => /^240,(80|112),240,144$|^240,144,240,(80|112)$/.test(w)), `al arrastrarla queda conectada con un cable (${wires.join(' ')})`);
await page.keyboard.press('Control+z');

// --- Comando de simulación ---
await simCommand(page, 'Transitorio');
check((await page.locator('.field', { hasText: 'Tiempo final' }).locator('input').inputValue()) === '20m', 'el menú lee la directiva existente (.tran 20m)');
await page.locator('.analysis-list').getByRole('button', { name: 'AC (Bode)' }).click();
check((await page.locator('.sim-preview code').textContent()) === '.ac dec 100 1 1meg', 'AC: vista previa de la directiva');
await page.locator('.analysis-list').getByRole('button', { name: 'Transitorio' }).click();
await page.locator('.field', { hasText: 'Tiempo final' }).locator('input').fill('6m');
await page.locator('.field', { hasText: 'Paso máximo' }).locator('input').fill('10u');
check((await page.locator('.sim-preview code').textContent()) === '.tran 0 6m 0 10u', 'Transitorio con paso máximo');
await page.getByRole('button', { name: 'Aceptar' }).click();
check((await page.locator('.texts .directive').first().textContent()) === '.tran 0 6m 0 10u', 'reemplaza la directiva en el esquemático');

// --- Bloque .control con barrido ---
await menu(page, 'Simular', 'Bloque .control…');
await page.locator('.modal textarea').fill('');
await page.getByRole('button', { name: /Barrer un componente/ }).click();
await page.getByRole('button', { name: 'Aceptar' }).click();
const free = await at(128, 48); // lugar libre dentro del circuito (siempre visible)
await page.mouse.click(free.x, free.y);
check((await page.locator('.texts .ngspice').count()) === 1, 'el bloque .control queda en el esquemático (comentario activo)');
await page.getByRole('button', { name: 'Correr' }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
const plots = await page.locator('select[aria-label="Plot"] option').allTextContents();
check(plots.join() === 'tran1,tran2,tran3', `el barrido genera tres corridas (${plots.join(', ')})`);
await page.waitForTimeout(300);
const out = await at(272, -32);
await page.mouse.click(out.x, out.y);
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Medidas' }).click();
const legend = await page.locator('.readout tbody tr').count();
check(legend === 3, `las tres corridas de V(out) se superponen (${legend} curvas)`);
check((await page.getByText('Superponer las 3 corridas').count()) === 1, 'opción para superponer corridas');
await page.screenshot({ path: `${OUT}/simulation.png` });

// --- #197: un .control a mano con su propio análisis lo avisa en Problemas ---
await menu(page, 'Simular', 'Bloque .control…');
await page.locator('.modal textarea').fill('tran 1u 1m\n');
await page.getByRole('button', { name: 'Aceptar' }).click();
await page.getByRole('button', { name: 'Correr', exact: true }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
await resultsMenu(page, /^Problemas/);
const own = await page.locator('.problems li', { hasText: 'corre su propio análisis (tran)' }).count();
check(own === 1, 'Problemas avisa que el .control corre su propio análisis, no la configuración');
await menu(page, 'Simular', 'Bloque .control…');
await page.locator('.modal textarea').fill('print v(out)\n');
await page.getByRole('button', { name: 'Aceptar' }).click();
await page.getByRole('button', { name: 'Correr', exact: true }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
await resultsMenu(page, /^Problemas/);
const none = await page.locator('.problems li', { hasText: 'no se simula nada' }).count();
check(none === 1, 'y que un .control sin run ni análisis no simula nada');

// --- #180: testbenches, cada uno con su esquemático y su simulación; cada uno conserva su gráfico ---
await openExample(page, 'RC Filter');
const directive = () => page.locator('.texts .directive').first().textContent();
const chipNames = () => page.locator('.trace-chip .name').allTextContents();
const simulate = async () => {
  await page.getByRole('button', { name: 'Correr', exact: true }).click();
  await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
  await page.waitForTimeout(300);
};
const probe = async (x, y) => {
  const p = await at(x, y);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(200);
};
const benchName = () => page.locator('.capsule-variant').textContent();
await simType(page, 'Barrido DC');
// RC Filter ya tiene su simulación: elegir otro tipo crea otro testbench (mismo circuito, mismo grupo)
check(/^Testbench d+$/.test(await benchName()), `un tipo nuevo crea otro testbench, con nombre consecutivo (${await benchName()})`);
await page.locator('.capsule-variant').dblclick();
await page.getByLabel('Nombre del testbench').fill('DC');
await page.getByLabel('Nombre del testbench').press('Enter');
check(!(await page.locator('.modal').count()), 'un tipo nuevo no abre el diálogo: los parámetros van en la barra');
check((await directive()) === '.dc V1 0 5 0.1', `elegir un tipo configura la simulación del testbench, con la fuente del circuito (${await directive()})`);
check((await benchName()) === 'DC', `la barra muestra el nombre del testbench (${await benchName()})`);
check((await page.locator('.simbar .sim-state.idle').count()) === 1, 'el cuadrado de estado arranca sin correr');
await simulate();
check((await page.locator('.simbar .sim-state.ok').count()) === 1, 'y al simular queda listo');
await probe(272, -32); // red out
check((await chipNames()).join() === 'V(out)', `primer testbench: V(out) (${(await chipNames()).join()})`);
// otro testbench: copia del actual, con otros parámetros desde la barra
if (!(await page.locator('.project-tree').count())) await page.getByRole('button', { name: 'Panel del proyecto', exact: true }).click();
// (las acciones del testbench aparecen al pasar el mouse por su fila)
await page.locator('.project-tree .tree-name').filter({ hasText: /^DC$/ }).hover();
await page.getByRole('button', { name: 'Duplicar DC', exact: true }).click();
await page.waitForTimeout(300);
check((await benchName()) === 'DC (copia)', `la copia es otro testbench (${await benchName()})`);
// aplicar un campo y escribir enseguida en el siguiente: la línea aplicada vuelve a la barra un
// render después y no debe pisar lo que se está escribiendo (fallaba en CI)
const directiveIs = (t) =>
  page.waitForFunction((t) => document.querySelector('.texts .directive')?.textContent === t, t, { timeout: 5000 }).catch(() => {});
await page.getByLabel('Fin 1').fill('2');
await page.getByLabel('Fin 1').press('Enter');
await directiveIs('.dc V1 0 2 0.1');
await page.getByLabel('Incremento 1').fill('0.01');
await page.getByLabel('Incremento 1').press('Enter');
await directiveIs('.dc V1 0 2 0.01');
check((await directive()) === '.dc V1 0 2 0.01', `los parámetros de la barra van al esquemático (${await directive()})`);
check((await page.locator('.results-panel').count()) === 0, 'el testbench nuevo arranca sin resultados');
await simulate();
await probe(0, -16); // red N001 (V1–R1)
// (la copia trae la vista del original: V(out), y se le suma V(N001))
check((await chipNames()).join() === 'V(out),V(N001)', `segundo testbench: V(out) de la copia y V(N001) (${(await chipNames()).join()})`);
// testbenches en el panel del proyecto (● el activo, #180)
const openPanel = async () => {
  if (!(await page.locator('.project-tree').count())) await page.getByRole('button', { name: 'Panel del proyecto', exact: true }).click();
};
const benchRows = () => page.locator('.project-tree .tree-row[data-bench] .tree-name');
const items = async () => {
  await openPanel();
  return (await benchRows().allTextContents()).map((x) => x.trim()).filter((x) => /^DC( \(copia\))?$/.test(x));
};
const goBench = async (name) => {
  await openPanel();
  const names = (await benchRows().allTextContents()).map((x) => x.trim());
  await benchRows().nth(names.indexOf(name)).click();
  await page.waitForTimeout(300);
};
const listed = await items();
const activeRow = (await page.locator('.project-tree .tree-row[data-bench].active .tree-name').textContent())?.trim();
check(listed.length === 2 && activeRow === listed[1], `el panel lista los dos y marca el activo (${listed.join(' | ')}; activo ${activeRow})`);
// los testbenches arrancan plegados (una línea) y están adentro de un grupo
check((await page.locator('.project-tree .tree-row.tree-sub').count()) === 0, 'los testbenches arrancan plegados');
check((await page.locator('.project-tree .tree-group').count()) >= 1 && !(await page.getByText('Testbenches', { exact: true }).count()), 'hay al menos un grupo y no está el título Testbenches');
// las flechas recorren los testbenches
await benchRows().filter({ hasText: /^DC$/ }).click();
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(300);
check((await benchName()) === 'DC (copia)', `↓ en el panel pasa al siguiente testbench (${await benchName()})`);
await page.keyboard.press('ArrowRight');
check((await page.locator('.project-tree .tree-row.tree-sub').count()) === 2, '→ lo despliega: simulación y parámetros (plegados)');
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(300);
check((await benchName()) === 'DC', `↑ vuelve al anterior (${await benchName()})`);
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(300);
check(!(await page.getByRole('button', { name: 'Nueva simulación', exact: true }).count()) || !(await (async () => {
  await page.getByRole('button', { name: 'Nueva simulación', exact: true }).click();
  const has = (await page.getByRole('menu').locator('[role^=menuitem]').allTextContents()).some((x) => x === 'DC');
  await page.keyboard.press('Escape');
  return has;
})()), 'el desplegable de Simular ya no lista testbenches');
// alternar: cada uno conserva sus trazas y sus resultados (sin volver a simular)
await goBench('DC');
check((await directive()) === '.dc V1 0 5 0.1', 'al elegir el primero, su comando vuelve al esquemático');
check((await chipNames()).join() === 'V(out)', `el primero conserva su gráfico (${(await chipNames()).join()})`);
// máximo de la traza (tabla de Medidas): 5 V en el primero, 2 V en el segundo
const maxOf = async () => {
  await page.getByRole('button', { name: 'Medidas' }).click();
  const t = await page.locator('.readout tbody tr td').nth(2).textContent();
  await page.getByRole('button', { name: 'Medidas' }).click();
  return t;
};
check((await maxOf()).startsWith('5 @'), `con sus resultados en memoria, sin volver a simular (máximo ${await maxOf()})`);
// (también desde el panel, con el otro)
await goBench('DC (copia)');
check((await chipNames()).join() === 'V(out),V(N001)', `el segundo conserva el suyo (${(await chipNames()).join()})`);
check((await maxOf()).startsWith('2 @'), `y sus resultados (máximo ${await maxOf()})`);
// el proyecto guardado (.turbo, #149) tiene los testbenches, el activo y la vista de cada uno
await page.evaluate(() => delete window.showSaveFilePicker);
const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')]);
check(download.suggestedFilename() === 'Examples.turbo', `se guarda como proyecto (${download.suggestedFilename()})`);
const saved = variantOf((await parseTurbo(readFileSync(await download.path(), 'utf8'))).project);
const rc = saved.sims.filter((s) => /^DC/.test(s.name ?? ''));
check(rc.length === 2 && lineOf(simOf(saved).asc) === '.dc V1 0 2 0.01', 'el .turbo guardado tiene los dos testbenches y el activo');
const views = rc.map((s) => s.view?.panes.flatMap((p) => p.traces.map((t) => t.expr)).join() ?? '');
check(views.join(' | ') === 'V(out) | V(out),V(N001)', `el archivo conserva la vista de cada uno (${views.join(' | ')})`);
// y el autoguardado también: al recargar sigue la lista
await page.waitForTimeout(1000); // autoguardado
await page.reload();
await page.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });
check((await items()).length === 2, 'al recargar se recuperan los testbenches');
// renombrar: doble click en el nombre de la cápsula
await page.locator('.capsule-variant').dblclick();
await page.getByLabel('Nombre del testbench').fill('Curva corta');
await page.getByLabel('Nombre del testbench').press('Enter');
check((await benchName()) === 'Curva corta', 'click en el nombre lo renombra');
await page.getByRole('button', { name: 'Borrar simulación' }).click();
await slideToDelete(page);
check((await benchName()) !== 'Curva corta' && (await items()).length === 1, 'la × borra el activo (deslizando) y pasa a otro');
await goBench('DC');
check((await directive()) === '.dc V1 0 5 0.1', 'el otro testbench sigue con su simulación');
// al lado de la fuente, elegirla en el esquemático (como en el menú completo)
await page.getByRole('button', { name: 'Elegir Fuente 1 en el esquemático' }).click();
check(await page.locator('.pick-banner').isVisible(), 'el botón de la fuente pide elegirla en el esquemático');
await page.locator('.pick-banner').getByRole('button', { name: 'Cancelar' }).click();
// un testbench nuevo está vacío y sin simulación: Simular despliega el menú para elegir el tipo
await openPanel();
await page.locator('.project-tree .tree-group .tree-add').first().click();
await page.getByRole('button', { name: 'Aceptar' }).click();
check((await page.locator('svg.editor .symbols > g').count()) === 0 && (await page.locator('.texts .directive', { hasText: /^\.(tran|ac|dc)\b/ }).count()) === 0, 'el testbench nuevo arranca vacío y sin simulación');
await page.getByRole('button', { name: 'Correr', exact: true }).click();
check(await page.getByRole('menu', { name: 'Nueva simulación' }).isVisible(), 'sin simulación, Simular despliega el menú');
await page.keyboard.press('Escape');
await page.screenshot({ path: `${OUT}/simulaciones.png` });

check(errors.length === 0, `sin errores de consola${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} fallo(s)` : '\nE2E simulación OK');
process.exit(failed ? 1 : 0);
