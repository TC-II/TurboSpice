// E2E de las plantillas del Estudio (#178): barrido paramétrico, Monte Carlo (reproducible con
// semilla fija), serie de simulaciones y búsqueda / ajuste con bloques, sobre el filtro RC.
// Uso: node tests/e2e/templates.mjs [url] [carpeta-capturas]   (con `npm run preview` corriendo)
import { mkdirSync } from 'node:fs';
import { launchBrowser, openExample, resultsMenu, skipWelcome } from './lib.mjs';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const OUT = process.argv[3] ?? 'test-results';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await skipWelcome(context);
const page = await context.newPage();
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

/** Abre el filtro RC limpio y el Estudio, y elige una plantilla */
async function template(name) {
  await openExample(page, 'RC Filter');
  await page.locator('svg.editor .sym').first().waitFor();
  await page.keyboard.press('Alt+e');
  await page.getByLabel('Plantillas', { exact: true }).selectOption({ label: name });
  const title = name.replace(' (bloques)', '');
  check(await page.locator('.study-template legend', { hasText: title }).isVisible(), `${title}: el asistente aparece`);
}
const simulate = async () => {
  await page.getByRole('button', { name: 'Simular' }).click();
  await page.locator('.status.ok, .status.err').waitFor({ timeout: 60000 });
  return (await page.locator('.status.err').count()) === 0;
};
const measRows = async () => {
  await resultsMenu(page, /^Mediciones/);
  return page.locator('.meas-table tbody tr').allTextContents();
};

// --- barrido paramétrico ---
await template('Barrido paramétrico');
check((await page.getByLabel('Qué variar', { exact: true }).last().inputValue()) === 'R1' && (await page.getByLabel('Señal a medir').inputValue()) === 'V(out)', 'deduce R1 y V(out) del circuito');
await page.getByRole('button', { name: 'Insertar' }).click();
check((await page.getByLabel('Valores').inputValue()) === '500 1k 2k', 'barrido de R1 en 500 1k 2k');
await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
check(await simulate(), 'barrido: simula sin errores');
const sweepRows = await measRows();
check(sweepRows.length === 3, `barrido: una medición por corrida (${sweepRows.join(' | ')})`);
await page.getByRole('button', { name: 'Ocultar resultados' }).click();

// --- Monte Carlo ---
await template('Monte Carlo');
await page.getByLabel('Especificación: mínimo').fill('0.99');
await page.getByLabel('Especificación: máximo').fill('1.1');
await page.getByRole('button', { name: 'Insertar' }).click();
check(await page.getByText('50 corridas en total').isVisible(), 'Monte Carlo: 50 corridas');
await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
check(await simulate(), 'Monte Carlo: simula sin errores');
const mc1 = await measRows();
const vals = (await page.locator('.meas-table tbody tr td:nth-child(2)').allTextContents()).map(parseFloat);
const yields = (await page.locator('.meas-table tbody tr td:nth-child(3)').allTextContents()).map(parseFloat);
check(mc1.length === 50 && Math.max(...vals) > Math.min(...vals), `Monte Carlo: 50 corridas distintas (${Math.min(...vals)} … ${Math.max(...vals)})`);
check(yields.every((y) => y === 0 || y === 1 || y === 0.5), `rendimiento: 1 o 0 por corrida (${[...new Set(yields)].join(', ')})`);
check((await page.locator('.histogram').count()) >= 1, 'Monte Carlo: histograma');
await page.screenshot({ path: `${OUT}/template-montecarlo.png` });
await page.getByRole('button', { name: 'Ocultar resultados' }).click();
check(await simulate(), 'Monte Carlo: simula otra vez');
const mc2 = await measRows();
check(JSON.stringify(mc1) === JSON.stringify(mc2), 'Monte Carlo con semilla fija: reproducible');
await page.getByRole('button', { name: 'Ocultar resultados' }).click();

// --- serie de simulaciones ---
await template('Serie de simulaciones');
await page.getByRole('button', { name: 'Insertar' }).click();
for (const k of ['Simulación 1', 'Simulación 2', 'Simulación 3']) check((await page.locator('.study-card', { hasText: k }).count()) === 1, `serie: tarjeta ${k}`);
await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
check(await simulate(), 'serie: simula sin errores');
const plots = await page.locator('select[aria-label="Plot"] option').allTextContents();
check(['tran', 'ac', 'op'].every((k) => plots.some((p) => p.startsWith(k))), `serie: un resultado por análisis (${plots.join(', ')})`);
const serRows = await measRows();
check(serRows.length >= 2, `serie: mediciones de cada análisis (${serRows.join(' | ')})`);
await page.getByRole('button', { name: 'Ocultar resultados' }).click();

// --- búsqueda / ajuste (bloques): R1 para que el máximo de V(out) a los 5 ms sea 0.9 ---
await template('Búsqueda / ajuste (bloques)');
await page.getByLabel('Valor buscado de la medición').fill('0.9');
await page.getByRole('button', { name: 'Insertar' }).click();
await page.locator('.study-blocks .blocklySvg').waitFor({ timeout: 20000 });
check(/\.control/.test(await page.locator('.modal .hint').last().textContent()), 'búsqueda: se arma con bloques (.control)');
await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
check(await simulate(), 'búsqueda: simula sin errores');
await resultsMenu(page, 'Log');
const log = await page.locator('.results-body pre').textContent();
if (process.env.DEBUG) console.log(log);
const found = /valor encontrado:[\s\S]*?mid = (\S+)[\s\S]*?m = (\S+)/.exec(log);
// (el máximo es el del segundo pulso, a los 15 ms: el capacitor no se descarga del todo)
check(found && Math.abs(parseFloat(found[2]) - 0.9) < 0.005 && parseFloat(found[1]) > 1000 && parseFloat(found[1]) < 5000, `búsqueda: R1 = ${found?.[1]} lleva la medición a 0.9 (${found?.[2]})`);

await page.getByRole('button', { name: 'Ocultar resultados' }).click();

// --- el resto: cada una se inserta y simula sin errores ---
for (const name of ['Barrido anidado', 'Barrido de temperatura', 'Peor caso / esquinas', 'Medición vs. parámetro', 'Respuesta al escalón', 'Respuesta en frecuencia', 'Distorsión', 'Impedancias / PSRR / CMRR']) {
  await template(name);
  await page.getByRole('button', { name: 'Insertar' }).click();
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  check(await simulate(), `${name}: simula sin errores`);
  if (name === 'Respuesta al escalón') {
    const rows = (await measRows()).join(' | ');
    check(/vfinal/.test(await page.locator('.meas-table thead').textContent()) && !/—/.test(rows), `escalón: valor final, sobrepico, subida y establecimiento (${rows})`);
  }
  if (name === 'Peor caso / esquinas') check((await measRows()).length === 4, 'peor caso: 4 esquinas (R1 y C1)');
  if (name === 'Distorsión') {
    await resultsMenu(page, 'Log');
    check(/THD/i.test(await page.locator('.results-body pre').textContent()), 'distorsión: la THD en el Log');
  }
  if (await page.getByRole('button', { name: 'Ocultar resultados' }).count()) await page.getByRole('button', { name: 'Ocultar resultados' }).click();
}
check(errors.length === 0, `sin errores de consola${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} fallo(s)` : '\nE2E plantillas OK');
process.exit(failed ? 1 : 0);
