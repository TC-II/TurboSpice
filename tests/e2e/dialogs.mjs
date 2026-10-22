// E2E de los diálogos de componentes: en R, L y C la tabla de fabricante va en «Avanzado» (#70);
// en las fuentes se elige si se ven el nombre y el valor (#71).
// Uso: node tests/e2e/dialogs.mjs [url] [carpeta-capturas]   (con `npm run preview` corriendo)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { openExample, skipWelcome } from './lib.mjs';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const OUT = process.argv[3] ?? 'test-results';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await skipWelcome(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed++;
};

await page.goto(URL);
await page.locator('[aria-label="Simular"]:enabled').waitFor({ timeout: 30000 });
// el pasabajos RC sin historial de corridas (Sample Project, el que abre, tiene corridas)
await openExample(page, 'RC Filter');
await page.locator('svg.editor .sym').first().waitFor();
const sym = (name) =>
  page.locator('svg.editor .symbols .sym').filter({ has: page.locator('text.win', { hasText: new RegExp(`^${name}$`) }) }).locator('.body');
const edit = async (name) => {
  const b = await sym(name).boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { button: 'right' });
  await page.locator('[role=dialog]').waitFor();
};
const dialog = page.locator('[role=dialog]');

// --- #70: resistencia: la tabla está escondida en «Avanzado» ---
await edit('R1');
const adv = dialog.locator('details', { hasText: 'modelo de fabricante' });
check((await adv.count()) === 1, 'R: hay un «Avanzado: modelo de fabricante»');
check(!(await adv.evaluate((d) => d.open)) && (await dialog.locator('.parts-table').count()) === 0, 'R: cerrado y sin la tabla a la vista');
await adv.locator('summary').click();
const shownTable = await dialog.locator('.parts-table tbody tr').first().waitFor({ timeout: 3000 }).then(() => true, () => false);
check(shownTable, 'R: al abrirlo aparece la tabla');
await page.screenshot({ path: `${OUT}/dialogs-res.png` });
await page.keyboard.press('Escape');
// un C elegido de la tabla deja sus parásitos en SpiceLine: al reabrirlo, «Avanzado» ya está abierto
await edit('C1');
await dialog.locator('details', { hasText: 'modelo de fabricante' }).locator('summary').click();
await dialog.locator('.parts-table tbody tr').first().click();
await dialog.getByRole('button', { name: 'Aceptar' }).click();
await edit('C1');
check(await dialog.locator('details', { hasText: 'modelo de fabricante' }).evaluate((d) => d.open), 'C con un modelo de la tabla: se abre ya desplegado');
await page.keyboard.press('Escape');

// --- #71: fuente: mostrar u ocultar el nombre y el valor ---
// rótulos de todo el esquemático (el de V1 puede estar oculto: no se lo busca por nombre)
const labels = () => page.locator('svg.editor .symbols text.win').allTextContents();
const before = await labels();
await edit('V1');
const show = dialog.getByRole('group', { name: 'Mostrar en el esquemático' });
check((await show.count()) === 1, `V: «Mostrar: Nombre · Valor» en el pie (${await show.textContent()})`);
await page.screenshot({ path: `${OUT}/dialogs-source.png` });
check(await show.getByLabel('Nombre').isChecked() && (await show.getByLabel('Valor').isChecked()), 'V: los dos marcados (se ven)');
await show.getByLabel('Valor').uncheck();
await dialog.getByRole('button', { name: 'Aceptar' }).click();
const after = await labels();
check(after.length === before.length - 1 && after.includes('V1') && !after.some((t) => t.startsWith('PULSE')), `V: al aceptar se oculta el valor (${before.join(' | ')} → ${after.join(' | ')})`);
// (con el valor oculto, se abre desde el cuerpo de la fuente: el de abajo a la izquierda)
const v1 = page.locator('svg.editor .symbols .sym').filter({ has: page.locator('text.win', { hasText: /^V1$/ }) });
const v1Box = await v1.locator('.body').boundingBox();
const openV1 = async () => {
  await page.mouse.click(v1Box.x + v1Box.width / 2, v1Box.y + v1Box.height / 2, { button: 'right' });
  await dialog.waitFor();
};
await openV1();
check(!(await show.getByLabel('Valor').isChecked()), 'V: al reabrir, Valor queda desmarcado');
await show.getByLabel('Valor').check();
await show.getByLabel('Nombre').uncheck();
await dialog.getByRole('button', { name: 'Aceptar' }).click();
const after2 = await labels();
check(!after2.includes('V1') && after2.some((t) => t.startsWith('PULSE')) && after2.length === before.length - 1, `V: se puede ocultar el nombre y volver a mostrar el valor (${after2.join(' | ')})`);
await page.keyboard.press('Control+z');
check((await labels()).join() === after.join(), 'Ctrl+Z deshace en un paso');

// (la simulación automática del ejemplo se aborta al editar: no es un error)
const real = errors.filter((e) => !/Simulación abortada/.test(e));
check(!real.length, `sin errores en la página${real.length ? `: ${real.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} fallo(s)` : '\ntodo ok');
process.exit(failed ? 1 : 0);
