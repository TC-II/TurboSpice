// E2E del visor: el divisor entre paneles cambia su altura (también la del panel digital, cuyos
// carriles se estiran), doble clic los iguala, y el orden de las trazas de un panel (el de dibujo:
// la última queda encima) se cambia arrastrando una sobre otra o con «Traer al frente».
// Uso: node tests/e2e/panes.mjs [url]   (con `npm run preview` corriendo)
import { skipWelcome, launchBrowser } from './lib.mjs';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await skipWelcome(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed++;
};
const heights = () => page.locator('.panes > .pane').evaluateAll((ps) => ps.map((p) => Math.round(p.getBoundingClientRect().height)));
const chips = (i = 0) => page.locator('.panes > .pane').nth(i).locator('.trace-chip .name').allTextContents();

await page.goto(URL);
await page.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });
// el ejemplo de simulación mixta: un panel analógico (V(vin), V(out), V(int)) y uno digital
await page.getByRole('button', { name: 'Menú', exact: true }).click();
await page.getByRole('menu').getByRole('menuitem', { name: 'Ejemplos' }).hover();
await page.getByRole('menu', { name: 'Ejemplos' }).getByRole('menuitem', { name: 'ADC sigma-delta' }).click();
await page.waitForTimeout(2000);
await page.getByRole('button', { name: 'Correr', exact: true }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 120000 });
await page.waitForTimeout(800);
check((await page.locator('.panes > .pane').count()) === 2 && (await page.locator('.pane-split').count()) === 1, 'dos paneles con un divisor entre ellos');

// --- altura de los paneles ---
const h0 = await heights();
const split = await page.locator('.pane-split').boundingBox();
const lanes0 = (await page.locator('.digital-lanes svg').boundingBox()).height;
await page.mouse.move(split.x + split.width / 2, split.y + 3);
await page.mouse.down();
await page.mouse.move(split.x + split.width / 2, split.y - 120, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(300);
const h1 = await heights();
check(h1[0] < h0[0] - 80 && h1[1] > h0[1] + 80, `arrastrar el divisor hacia arriba achica el de arriba y agranda el digital (${h0} → ${h1})`);
check((await page.locator('.digital-lanes svg').boundingBox()).height > lanes0 + 60, 'los carriles digitales se estiran para llenar su panel');
await page.locator('.pane-split').dblclick();
await page.waitForTimeout(300);
const h2 = await heights();
check(Math.abs(h2[0] - h0[0]) < 4 && Math.abs(h2[1] - h0[1]) < 4, `doble clic en el divisor vuelve al reparto de antes (${h2})`);
await page.locator('.pane-split').focus();
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(200);
check((await heights())[0] < h2[0], 'con el teclado (↑/↓) también');

// --- orden de las trazas (de dibujo) ---
check((await chips()).join() === 'V(vin),V(out),V(int)', `orden inicial (${await chips()})`);
await page.locator('.trace-chip', { hasText: 'V(vin)' }).dragTo(page.locator('.trace-chip', { hasText: 'V(int)' }));
await page.waitForTimeout(300);
check((await chips()).join() === 'V(out),V(int),V(vin)', `arrastrar V(vin) sobre V(int) la pasa a ese lugar (${await chips()})`);
check((await page.locator('.panes > .pane').count()) === 2, 'y no la saca del panel');
await page.locator('.trace-chip', { hasText: 'V(out)' }).click({ button: 'right' });
await page.getByRole('menuitem', { name: 'Traer al frente' }).click();
await page.waitForTimeout(300);
check((await chips()).join() === 'V(int),V(vin),V(out)', `«Traer al frente» la manda al final, encima de las demás (${await chips()})`);
await page.locator('.trace-chip', { hasText: 'V(out)' }).click({ button: 'right' });
await page.getByRole('menuitem', { name: 'Enviar atrás' }).click();
await page.waitForTimeout(300);
check((await chips()).join() === 'V(out),V(int),V(vin)', `«Enviar atrás» la manda al principio (${await chips()})`);

// --- se guarda con la vista ---
const h3 = await heights();
await page.waitForTimeout(1500); // autoguardado
await page.reload();
await page.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });
await page.getByRole('button', { name: 'Correr', exact: true }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 120000 });
await page.waitForTimeout(800);
const h4 = await heights();
check((await chips()).join() === 'V(out),V(int),V(vin)' && Math.abs(h4[0] - h3[0]) < 6, `después de recargar sigue el orden y la altura (${await chips()} · ${h3} → ${h4})`);

check(errors.length === 0, `sin errores de consola${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
if (failed) {
  console.log(`\n${failed} chequeo(s) fallaron`);
  process.exit(1);
}
console.log('\nE2E paneles OK');
