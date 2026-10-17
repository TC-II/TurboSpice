// E2E de los menús de simulación: comando de análisis, bloque .control con barrido
// superpuesto, selección de la tierra y miniaturas del selector de componentes.
// Uso: node tests/e2e/simulation.mjs [url] [carpeta-capturas]   (con `npm run preview` corriendo)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const OUT = process.argv[3] ?? 'test-results';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
await page.getByText('Listo').waitFor({ timeout: 30000 });
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
await page.getByRole('button', { name: 'Simulación…' }).click();
check((await page.locator('.field', { hasText: 'Tiempo final' }).locator('input').inputValue()) === '20m', 'el menú lee la directiva existente (.tran 20m)');
await page.getByRole('button', { name: 'AC (Bode)' }).click();
check((await page.locator('.sim-preview code').textContent()) === '.ac dec 100 1 1meg', 'AC: vista previa de la directiva');
await page.getByRole('button', { name: 'Transitorio' }).click();
await page.locator('.field', { hasText: 'Tiempo final' }).locator('input').fill('6m');
await page.locator('.field', { hasText: 'Paso máximo' }).locator('input').fill('10u');
check((await page.locator('.sim-preview code').textContent()) === '.tran 0 6m 0 10u', 'Transitorio con paso máximo');
await page.getByRole('button', { name: 'Aceptar' }).click();
check((await page.locator('.texts .directive').first().textContent()) === '.tran 0 6m 0 10u', 'reemplaza la directiva en el esquemático');

// --- Bloque .control con barrido ---
await page.getByRole('button', { name: '.control…' }).click();
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

check(errors.length === 0, `sin errores de consola${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} fallo(s)` : '\nE2E simulación OK');
process.exit(failed ? 1 : 0);
