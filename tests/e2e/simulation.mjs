// E2E de los menús de simulación: comando de análisis, bloque .control con barrido
// superpuesto, selección de la tierra, miniaturas del selector de componentes y lista de
// simulaciones (#39).
// Uso: node tests/e2e/simulation.mjs [url] [carpeta-capturas]   (con `npm run preview` corriendo)
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { menu, openExample, simCommand, simType, skipWelcome } from './lib.mjs';
import { decode } from '../../src/asc/encoding.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { takeSims } from '../../src/sim/simList.ts';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const OUT = process.argv[3] ?? 'test-results';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await skipWelcome(page);
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
await page.locator('[aria-label="Simular"]:enabled').waitFor({ timeout: 30000 });
await page.locator('svg.editor .sym').first().waitFor(); // ejemplo "Filtro RC"

const svg = page.locator('svg.editor');
const at = async (x, y) => {
  const box = await svg.boundingBox();
  const [vx, vy, vw, vh] = (await svg.getAttribute('viewBox')).split(' ').map(Number);
  return { x: box.x + ((x - vx) / vw) * box.width, y: box.y + ((y - vy) / vh) * box.height };
};

// --- Selector de componentes con miniaturas ---
await page.keyboard.press('F2');
await page.locator('.modal input').fill('npn');
check((await page.locator('.picker-list svg.thumb .sym').count()) >= 3, 'el selector muestra miniaturas de los símbolos');
check((await page.locator('.picker-preview svg.big .sym').count()) === 1, 'y una vista previa grande');
await page.keyboard.press('Escape');

// --- Tierra: se selecciona haciendo click sobre su dibujo y se arrastra ---
const gnd = await at(96, 44); // barras inferiores de la tierra de C1 (conectada en 96,32)
await page.mouse.click(gnd.x, gnd.y);
check((await page.locator('.flags .flag.sel').count()) === 1, 'click sobre el dibujo de la tierra la selecciona');
const to = await at(96, 76);
await page.mouse.move(gnd.x, gnd.y);
await page.mouse.down();
await page.mouse.move(to.x, to.y, { steps: 5 });
await page.mouse.up();
const wires = await page.locator('.wires line').evaluateAll((ls) => ls.map((l) => [l.getAttribute('x1'), l.getAttribute('y1'), l.getAttribute('x2'), l.getAttribute('y2')].join(',')));
check(wires.some((w) => w === '96,32,96,64' || w === '96,64,96,32'), `al arrastrarla queda conectada con un cable (${wires.join(' ')})`);
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
const free = await at(400, 120);
await page.mouse.click(free.x, free.y);
check((await page.locator('.texts .ngspice').count()) === 1, 'el bloque .control queda en el esquemático (comentario activo)');
await page.getByRole('button', { name: 'Simular' }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
const plots = await page.locator('select[aria-label="Plot"] option').allTextContents();
check(plots.join() === 'tran1,tran2,tran3', `el barrido genera tres corridas (${plots.join(', ')})`);
await page.waitForTimeout(300);
const out = await at(128, -32);
await page.mouse.click(out.x, out.y);
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Medidas' }).click();
const legend = await page.locator('.readout tbody tr').count();
check(legend === 3, `las tres corridas de V(out) se superponen (${legend} curvas)`);
check((await page.getByText('Superponer las 3 corridas').count()) === 1, 'opción para superponer corridas');
await page.screenshot({ path: `${OUT}/simulation.png` });

// --- #39: varias simulaciones; cada una conserva su gráfico ---
await openExample(page, 'Filtro RC');
const directive = () => page.locator('.texts .directive').first().textContent();
const chipNames = () => page.locator('.trace-chip .name').allTextContents();
const simulate = async () => {
  await page.getByRole('button', { name: 'Simular', exact: true }).click();
  await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
  await page.waitForTimeout(300);
};
const probe = async (x, y) => {
  const p = await at(x, y);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(200);
};
await simType(page, 'Barrido DC');
check(!(await page.locator('.modal').count()), 'un tipo nuevo no abre el diálogo: los parámetros van en la barra');
check((await directive()) === '.dc V1 0 5 0.1', `nueva simulación DC con la fuente del circuito (${await directive()})`);
check((await page.locator('.simbar .sb-name').textContent()) === 'Barrido DC V1 0–5 V', 'la barra muestra su nombre');
check((await page.locator('.simbar .sim-state.idle').count()) === 1, 'el cuadrado de estado arranca sin correr');
await simulate();
check((await page.locator('.simbar .sim-state.ok').count()) === 1, 'y al simular queda listo');
await probe(128, -32); // red out
check((await chipNames()).join() === 'V(out)', `primera DC: V(out) (${(await chipNames()).join()})`);
// otra del mismo tipo con otros parámetros, desde la barra
await menu(page, 'Simular', 'Barrido DC');
await page.getByLabel('Fin 1').fill('2');
await page.getByLabel('Incremento 1').fill('0.01');
await page.getByLabel('Incremento 1').press('Enter');
check((await directive()) === '.dc V1 0 2 0.01', `los parámetros de la barra van al esquemático (${await directive()})`);
check((await page.locator('.results-panel').count()) === 0, 'la nueva simulación arranca sin resultados');
await simulate();
await probe(0, -16); // red N001 (V1–R1)
check((await chipNames()).join() === 'V(N001)', `segunda DC: V(N001) (${(await chipNames()).join()})`);
// simulaciones listadas en el menú Simular (✓ la activa)
const items = async () => {
  await page.getByRole('button', { name: 'Menú', exact: true }).click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Simular', exact: true }).hover();
  const t = (await page.getByRole('menu').getByRole('menuitemcheckbox').allTextContents()).filter((x) => /Barrido DC/.test(x));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  return t;
};
const listed = await items();
check(listed.length === 2 && listed[1].startsWith('✓'), `el menú lista las dos y marca la activa (${listed.join(' | ')})`);
// alternar: cada una conserva sus trazas y sus resultados (sin volver a simular)
await menu(page, 'Simular', 'Barrido DC V1 0–5 V');
check((await directive()) === '.dc V1 0 5 0.1', 'al elegir la primera, su comando vuelve al esquemático');
check((await chipNames()).join() === 'V(out)', `la primera conserva su gráfico (${(await chipNames()).join()})`);
// máximo de la traza (tabla de Medidas): 5 V en la primera, 2 V en la segunda
const maxOf = async () => {
  await page.getByRole('button', { name: 'Medidas' }).click();
  const t = await page.locator('.readout tbody tr td').nth(2).textContent();
  await page.getByRole('button', { name: 'Medidas' }).click();
  return t;
};
check((await maxOf()).startsWith('5 @'), `con sus resultados en memoria, sin volver a simular (máximo ${await maxOf()})`);
// (también desde la flecha del botón Simular)
await simType(page, 'Barrido DC V1 0–2 V');
check((await chipNames()).join() === 'V(N001)', `la segunda conserva el suyo (${(await chipNames()).join()})`);
check((await maxOf()).startsWith('2 @'), `y sus resultados (máximo ${await maxOf()})`);
// el archivo guarda la lista (en un comentario que TurboSpice no dibuja) y la activa como directiva
await page.evaluate(() => delete window.showSaveFilePicker);
const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')]);
const savedText = decode(new Uint8Array(readFileSync(await download.path()))).text;
check(/^TEXT .* !\.dc V1 0 2 0\.01$/m.test(savedText) && /^TEXT .* ;\.sims \S+$/m.test(savedText), 'el .asc guardado tiene la activa y la lista');
const reopened = takeSims(parseAsc(savedText), '.dc V1 0 2 0.01').sims;
const views = reopened.items.map((s) => s.view?.panes.flatMap((p) => p.traces.map((t) => t.expr)).join());
// (la primera es el .tran del ejemplo, sin trazas)
check(views.join(' | ') === ' | V(out) | V(N001)', `la lista del archivo conserva la vista de cada una (${views.join(' | ')})`);
// y el autoguardado también: al recargar sigue la lista
await page.waitForTimeout(1000); // autoguardado
await page.reload();
await page.locator('[aria-label="Simular"]:enabled').waitFor({ timeout: 30000 });
check((await items()).length === 2, 'al recargar se recupera la lista');
// renombrar: click en el nombre de la barra
await page.locator('.simbar .sb-name').click();
await page.getByLabel('Nombre de la simulación').fill('Curva corta');
await page.getByLabel('Nombre de la simulación').press('Enter');
check((await page.locator('.simbar .sb-name').textContent()) === 'Curva corta', 'click en el nombre la renombra');
await page.getByRole('button', { name: 'Borrar simulación' }).click();
check((await directive()) === '.dc V1 0 5 0.1', 'la × borra la activa y pasa a la otra');
// al lado de la fuente, elegirla en el esquemático (como en el menú completo)
await page.getByRole('button', { name: 'Elegir Fuente 1 en el esquemático' }).click();
check(await page.locator('.pick-banner').isVisible(), 'el botón de la fuente pide elegirla en el esquemático');
await page.locator('.pick-banner').getByRole('button', { name: 'Cancelar' }).click();
// borrar hasta la última: la barra queda vacía y Simular despliega el menú para elegir
while (await page.getByRole('button', { name: 'Borrar simulación' }).count()) await page.getByRole('button', { name: 'Borrar simulación' }).click();
check((await page.locator('.simbar .sb-name').count()) === 0 && (await page.locator('.simbar').textContent()).includes('Seleccionar tipo de simulación') && (await page.locator('.texts .directive', { hasText: /^\.(tran|ac|dc)\b/ }).count()) === 0, 'se puede borrar la única: la barra pide elegir un tipo y sale su comando del esquemático');
await page.getByRole('button', { name: 'Simular', exact: true }).click();
check(await page.getByRole('menu', { name: 'Tipo de simulación' }).isVisible(), 'sin simulación, Simular despliega el menú');
await page.keyboard.press('Escape');
await page.screenshot({ path: `${OUT}/simulaciones.png` });

check(errors.length === 0, `sin errores de consola${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} fallo(s)` : '\nE2E simulación OK');
process.exit(failed ? 1 : 0);
