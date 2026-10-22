// E2E de las figuras de LTspice (#60): LINE, RECTANGLE, CIRCLE y ARC se ven, se eligen, se
// mueven, rotan, borran, se les cambia el estilo de línea, y se dibujan círculos y arcos.
// Uso: node tests/e2e/shapes.mjs [url] [carpeta-capturas]   (con `npm run preview` corriendo)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { menu, skipWelcome } from './lib.mjs';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const OUT = process.argv[3] ?? 'test-results';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await skipWelcome(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed++;
};

const ASC = [
  'Version 4',
  'SHEET 1 880 680',
  'WIRE 0 160 160 160',
  'FLAG 0 160 0',
  'LINE Normal 0 0 128 0',
  'RECTANGLE Normal 160 -64 288 64 2',
  'CIRCLE Normal 320 -64 448 64',
  'ARC Normal 480 -64 608 64 608 0 544 -64 1',
  '',
].join('\r\n');

await page.goto(URL);
await page.locator('[aria-label="Simular"]:enabled').waitFor({ timeout: 30000 });
await page.evaluate((asc) => {
  const dt = new DataTransfer();
  dt.items.add(new File([asc], 'figuras.asc', { type: 'text/plain' }));
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
}, ASC);
await page.waitForFunction(() => document.querySelector('.capsule-project')?.textContent === 'figuras');

const svg = page.locator('svg.editor');
const shapes = svg.locator('.shapes > *');
const at = async (x, y) => {
  const b = await svg.boundingBox();
  const [vx, vy, vw, vh] = (await svg.getAttribute('viewBox')).split(' ').map(Number);
  return { x: b.x + ((x - vx) / vw) * b.width, y: b.y + ((y - vy) / vh) * b.height };
};
const click = async (x, y, o) => {
  const p = await at(x, y);
  await page.mouse.click(p.x, p.y, o);
};
const sel = () => svg.locator('.shapes > .sel').count();
const attr = (i, a) => shapes.nth(i).getAttribute(a);

// ajustar la vista al circuito
const center = await svg.boundingBox();
await page.mouse.move(center.x + center.width / 2, center.y + center.height / 2);
await page.keyboard.press('Space');
await page.waitForTimeout(150);
check((await shapes.count()) === 4, 'se dibujan las 4 figuras');
const style = await shapes.evaluateAll((els) => els.map((e) => [getComputedStyle(e).stroke, getComputedStyle(e).strokeDasharray]));
check(style.every(([s]) => s !== 'none' && !/rgba\(0, 0, 0, 0\)/.test(s)), 'las figuras tienen trazo visible');
check(style[1][1].startsWith('2') && style[3][1].startsWith('10') && style[0][1] === 'none', 'estilos de línea: puntos, guiones, sólida');

// --- elegir por el trazo, no por el interior ---
await click(64, 1);
check((await sel()) === 1 && (await shapes.nth(0).getAttribute('class')) === 'sel', 'click en la línea la elige');
await click(224, 0);
check((await sel()) === 0, 'click dentro del rectángulo no lo elige');
await click(448, 0);
check((await shapes.nth(2).getAttribute('class')) === 'sel', 'click en el borde del círculo lo elige');

// --- borrar y deshacer ---
await page.keyboard.press('Delete');
check((await shapes.count()) === 3, 'Supr borra la figura elegida');
await page.keyboard.press('Control+z');
check((await shapes.count()) === 4, 'se deshace');

// --- mover arrastrando ---
await click(160, 0);
const from = await at(160, 0);
const to = await at(160 + 32, 32);
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.mouse.move(to.x, to.y, { steps: 6 });
await page.mouse.up();
check((await attr(1, 'x')) === '192' && (await attr(1, 'y')) === '-32', 'el rectángulo se arrastra');
await page.keyboard.press('Control+z');

// --- recuadro: toca el trazo del arco y del círculo, no la línea ---
await page.keyboard.press('Escape');
const b1 = await at(430, -100);
const b2 = await at(500, 100);
await page.mouse.move(b1.x, b1.y);
await page.mouse.down();
await page.mouse.move(b2.x, b2.y, { steps: 6 });
await page.mouse.up();
check((await sel()) === 2, 'el recuadro elige círculo y arco');

// --- rotar 4 veces vuelve al mismo lugar ---
const d0 = await attr(3, 'd');
for (let i = 0; i < 4; i++) await page.keyboard.press('Control+r');
check((await attr(3, 'd')) === d0, 'Ctrl+R ×4 vuelve al lugar');
await page.keyboard.press('Control+r');
check((await attr(3, 'd')) !== d0, 'Ctrl+R rota el arco');
await page.keyboard.press('Control+z');

// --- estilo de línea con doble click ---
await page.keyboard.press('Escape');
const lp = await at(64, 0);
await page.mouse.dblclick(lp.x, lp.y);
const modal = page.locator('.modal');
check((await modal.getAttribute('aria-label')) === 'Estilo de línea', 'doble click abre el estilo de línea');
await modal.getByText('Raya y punto').click();
await modal.getByRole('button', { name: 'Aceptar' }).click();
check((await attr(0, 'stroke-dasharray')) === '10 5 2 5', 'la línea queda raya y punto');

// --- dibujar un círculo y un arco desde el menú (en el lugar libre bajo las figuras) ---
await menu(page, 'Dibujar', 'Círculo');
await click(480, 128);
await click(544, 192);
check((await svg.locator('.shapes ellipse').count()) === 2, 'Dibujar › Círculo agrega un círculo');
await menu(page, 'Dibujar', 'Arco');
await click(576, 128);
await click(640, 192);
await click(640, 160); // inicio: a la derecha
await click(608, 128); // fin: arriba (antihorario: el cuarto de arriba a la derecha)
check((await svg.locator('.shapes path').count()) === 2, 'Dibujar › Arco agrega un arco con 4 clicks');
await page.keyboard.press('Escape');

await page.keyboard.press('Space');
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/shapes.png` });

// (al abrir un archivo se aborta la simulación automática del anterior: no es un error)
const real = errors.filter((e) => !/Simulación abortada/.test(e));
check(!real.length, `sin errores en la consola${real.length ? `: ${real.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} fallaron` : '\ntodo ok');
process.exit(failed ? 1 : 0);
