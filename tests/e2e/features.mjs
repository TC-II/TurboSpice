// E2E de funciones de interfaz: nombres de redes temporales (#15) y las que se agreguen.
// Uso: node tests/e2e/features.mjs [url] [carpeta-capturas]   (con `npm run preview` corriendo)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const OUT = process.argv[3] ?? 'test-results';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await context.newPage();
const errors = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  p.on('dialog', (d) => d.accept());
};
watch(page);

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed++;
};

await page.goto(URL);
await page.getByText('Listo').waitFor({ timeout: 30000 });
await page.locator('svg.editor .sym').first().waitFor(); // ejemplo "Filtro RC"

// --- #15: nombres de redes temporales ---
const names = () => page.locator('.net-name text').allTextContents();
await page.getByRole('button', { name: 'Redes' }).click();
check((await names()).sort().join() === 'N001,out', `muestra el nombre de cada red (${(await names()).join(', ')})`);
check((await page.locator('.net-name.auto').count()) === 1, 'las redes sin etiqueta se distinguen');
await page.keyboard.press('Alt+n');
check((await page.locator('.net-name').count()) === 0, 'Alt+N las oculta');
check(!(await page.locator('.filename').textContent()).includes('•'), 'mostrarlas no modifica el documento');
await page.keyboard.press('Alt+n');
await page.locator('.net-name.auto').click();
await page.locator('.modal input').fill('in');
await page.keyboard.press('Enter');
check((await names()).sort().join() === 'in,out', `click en N001 le pone nombre con una etiqueta (${(await names()).join(', ')})`);
check((await page.locator('.flags .flagname', { hasText: 'in' }).count()) === 1, 'y la etiqueta queda en el esquemático');
await page.screenshot({ path: `${OUT}/net-names.png` });
await page.keyboard.press('Control+z');
await page.getByRole('button', { name: 'Redes' }).click();

// --- #1: compartir con un link ---
await page.getByRole('combobox', { name: 'Ejemplos' }).selectOption('Bode RLC.asc');
await page.locator('svg.editor .sym').first().waitFor();
await page.getByRole('button', { name: 'Compartir' }).click();
const link = await page.locator('.modal input[aria-label="Link"]').inputValue();
check(/#c=[\w-]+&n=Bode%20RLC\.asc$/.test(link), `genera el link (${link.length} caracteres)`);
await page.getByRole('button', { name: 'Listo', exact: true }).click();
const other = await context.newPage();
watch(other);
await other.goto(link);
await other.getByText('Listo').waitFor({ timeout: 30000 });
await other.locator('svg.editor .sym').first().waitFor();
check((await other.locator('.filename').textContent()) === 'Bode RLC.asc', 'el link abre el circuito con su nombre');
check(!(await other.evaluate(() => location.hash)), 'y limpia el hash');
const symsA = await page.locator('svg.editor .sym').count();
check((await other.locator('svg.editor .sym').count()) === symsA, 'con los mismos componentes');
await other.getByRole('button', { name: 'Simular' }).click();
await other.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
check((await other.locator('.status.ok').count()) === 1, 'y simula');
await other.close();

// --- #5: autoguardado y recientes ---
const flags = () => page.locator('.flags .flag').count();
const before = await flags();
const box = await page.locator('svg.editor').boundingBox();
await page.keyboard.press('g');
await page.mouse.click(box.x + 60, box.y + 60);
await page.keyboard.press('Escape');
check((await flags()) === before + 1, 'agrega una tierra');
await page.waitForTimeout(1200); // autoguardado
await page.reload();
await page.getByText('Listo').waitFor({ timeout: 30000 });
await page.locator('svg.editor .sym').first().waitFor();
check((await flags()) === before + 1, 'al recargar se recupera el trabajo sin guardar');
check((await page.locator('.filename').textContent()) === 'Bode RLC.asc •', 'con su nombre y marcado como modificado');
await page.keyboard.press('Control+z');
check((await flags()) === before, 'y se puede deshacer lo anterior a la recarga');
const recents = await page.locator('select[aria-label="Recientes"] option').allTextContents();
check(recents.includes('Bode RLC'), `recientes: ${recents.slice(1).join(', ')}`);

check(errors.length === 0, `sin errores de consola${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} fallo(s)` : '\nE2E funciones OK');
process.exit(failed ? 1 : 0);
