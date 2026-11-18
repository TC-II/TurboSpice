// E2E del editor de modelos: el flujo de crear un componente. Un modelo nuevo abre vacío con cómo
// empezar; con una plantilla queda listo (pines, parámetros y la línea de cada instancia); editar el
// netlist rehace el símbolo que nadie tocó y, en uno tocado, los pines siguen a sus nodos; los
// problemas se marcan en su línea y se arreglan con un clic; deshacer y rehacer; las teclas no llegan
// al esquemático de abajo; y «Colocar en el esquemático» lo pone en el testbench.
// Uso: node tests/e2e/models.mjs [url]   (con `npm run preview` corriendo)
import { frames, skipWelcome, launchBrowser, sampleUrl } from './lib.mjs';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await skipWelcome(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(process.env.STACK ? e.stack : e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed++;
};

await page.goto(sampleUrl(URL));
await page.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });
await page.locator('svg.editor .sym').first().waitFor();
const symbols = () => page.locator('svg.editor .sym').count();
const before = await symbols();

const steps = () => page.locator('.mdl-step').evaluateAll((bs) => bs.map((b) => b.className.replace('mdl-step ', '')).join(','));
const pins = () => page.locator('.mdl-pins tbody tr').evaluateAll((rs) => rs.map((r) => `${r.querySelector('input').value}:${r.querySelectorAll('select')[1].value}`).join(' '));
const instance = () => page.locator('.mdl-instance code').textContent();
const net = page.getByLabel('Netlist de AMP');
/** cambia el netlist como si se lo escribiera y espera a que se guarde */
const editNet = async (fn) => {
  await net.fill(fn(await net.inputValue()));
  await page.waitForTimeout(700);
  await frames(page);
};
const bar = page.locator('.mdl-bar');

// --- 1. crear: abre vacío, con cómo empezar ---------------------------------------------------
if (!(await page.locator('.project-tree').count())) await page.getByRole('button', { name: 'Panel del proyecto', exact: true }).click();
await page.locator('.tree-modules .tree-add[aria-haspopup]').click();
await page.getByRole('menuitem', { name: /Modelo/ }).click();
await page.locator('.modal input').fill('AMP');
await page.keyboard.press('Enter');
await page.locator('.model-editor').waitFor();
await page.getByRole('heading', { name: 'Empezá tu componente' }).waitFor();
check((await steps()) === 'pending,pending,pending', `un modelo nuevo abre vacío, con los pasos por hacer (${await steps()})`);
check((await page.getByRole('button', { name: 'Colocar en el esquemático' }).isDisabled()) === true, 'sin netlist no se puede colocar');

// --- 2. una plantilla: queda listo ---------------------------------------------------------------
await page.getByRole('button', { name: 'Amplificador (comportamental)' }).click();
await frames(page);
check((await steps()) === 'ok,ok,ok', `con una plantilla los tres pasos quedan listos (${await steps()})`);
check((await pins()) === 'in:0 out:1', `un pin por nodo del .subckt (${await pins()})`);
check((await instance()) === 'XU1 in out AMP gain=10 rout=1', `la línea de cada instancia (${await instance()})`);
check((await page.locator('.ne-k').count()) > 0 && (await page.locator('.ne-n', { hasText: 'AMP' }).count()) > 0, 'el netlist se ve resaltado');

// --- 3. un nodo más: el símbolo que nadie tocó se rehace -------------------------------------------
await editNet((v) => v.replace('AMP in out params:', 'AMP in out en params:'));
check((await pins()) === 'in:0 out:1 en:2', `un nodo nuevo suma su pin al símbolo generado (${await pins()})`);

// --- 4. símbolo tocado: los pines siguen a sus nodos ------------------------------------------------
await page.getByLabel('Nombre del pin 1', { exact: true }).fill('IN');
await page.keyboard.press('Enter');
await frames(page);
await editNet((v) => v.replace('AMP in out', 'AMP in aux out'));
check((await pins()) === 'IN:0 out:2 en:3', `insertar un nodo no desconecta los pines de los otros (${await pins()})`);
check((await steps()) === 'ok,warning,ok', `el nodo sin pin es un aviso del paso Pines (${await steps()})`);
check((await page.locator('.mdl-panel .mdl-problems').textContent()).includes('aux'), 'el aviso nombra el nodo');
await page.getByRole('button', { name: 'Agregar los pines' }).click();
await frames(page);
check((await pins()) === 'IN:0 out:2 en:3 aux:1' && (await steps()) === 'ok,ok,ok', `«Agregar los pines» lo arregla (${await pins()})`);
// un pin a otro nodo: se intercambia con el que estaba
await page.getByLabel('Nodo del pin 3', { exact: true }).selectOption('0');
await frames(page);
check((await pins()) === 'IN:3 out:2 en:0 aux:1', `elegir el nodo de un pin intercambia con el que estaba (${await pins()})`);

// --- 5. deshacer y rehacer (netlist y símbolo juntos) ------------------------------------------------
await bar.getByRole('button', { name: 'Deshacer (Ctrl+Z)' }).click();
await frames(page);
check((await pins()) === 'IN:0 out:2 en:3 aux:1', `deshacer vuelve al paso anterior (${await pins()})`);
await bar.getByRole('button', { name: 'Rehacer (Ctrl+Y)' }).click();
await frames(page);
check((await pins()) === 'IN:3 out:2 en:0 aux:1', `rehacer lo vuelve a aplicar (${await pins()})`);
// con el foco fuera de los campos, Ctrl+Z es el deshacer del modelo (no el del esquemático)
await page.locator('.mdl-tabs [role=tab]').first().focus();
await page.keyboard.press('Control+z');
await frames(page);
check((await pins()) === 'IN:0 out:2 en:3 aux:1', `Ctrl+Z deshace en el modelo (${await pins()})`);

// --- 6. un problema del netlist: marcado en su línea, con su arreglo ------------------------------------
await editNet((v) => v.replace(/\.ends AMP\r?\n?/, ''));
const problems = page.locator('.mdl-netlist .mdl-problems');
check((await problems.textContent()).includes('le falta su .ends') && (await page.locator('.ne-gutter .error').count()) === 1, 'el .ends que falta se marca en su línea');
check((await steps()).startsWith('error'), `el paso Netlist queda con error (${await steps()})`);
await page.getByRole('button', { name: 'Agregar .ends AMP' }).click();
await frames(page);
check((await page.locator('.mdl-netlist .mdl-problems').count()) === 0 && (await net.inputValue()).trimEnd().endsWith('.ends AMP'), '«Agregar .ends AMP» lo arregla');

// --- 7. las teclas no llegan al esquemático de abajo: una «r» en el editor no elige la resistencia ----
await page.locator('.mdl-tabs [role=tab]').first().focus();
await page.keyboard.press('r');
await bar.getByRole('button', { name: 'Cerrar', exact: true }).click();
await frames(page);
check((await page.locator('.model-editor').count()) === 0, '«Cerrar» vuelve al testbench');
const box = await page.locator('svg.editor').boundingBox();
const spot = { x: box.x + box.width * 0.75, y: box.y + box.height * 0.25 };
await page.mouse.click(spot.x, spot.y);
await frames(page);
check((await symbols()) === before, `una «r» en el editor no llega al esquemático (${before} → ${await symbols()})`);

// --- 8. al volver a abrirlo está como quedó ------------------------------------------------------------
const row = page.locator('.tree-modules .tree-row', { hasText: 'AMP' });
await row.locator('.tree-name').click();
await page.locator('.model-editor').waitFor();
await frames(page);
check((await pins()) === 'IN:0 out:2 en:3 aux:1' && (await steps()) === 'ok,ok,ok', `al volver a abrirlo está como quedó (${await pins()})`);

// --- 9. colocarlo -------------------------------------------------------------------------------------
await page.getByRole('button', { name: 'Colocar en el esquemático' }).click();
await frames(page);
check((await page.locator('.model-editor').count()) === 0, '«Colocar en el esquemático» cierra el editor');
await page.mouse.move(spot.x, spot.y);
await frames(page);
await page.mouse.click(spot.x, spot.y);
await page.keyboard.press('Escape');
await frames(page);
check((await symbols()) === before + 1, `queda colocado en el testbench (${before} → ${await symbols()})`);
check((await row.textContent()).includes('usado en 1'), 'el módulo dice que se usa');

check(!errors.length, `sin errores en la página${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} fallo(s)` : '\nE2E modelos OK');
process.exit(failed ? 1 : 0);
