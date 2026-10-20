// E2E de la colocación y la navegación (#61–#65): la vista previa tiene la apariencia final
// (con InstName), el botón derecho arrastra la vista, el buscador (P) no se mueve, el botón de
// figuras de la barra y los atajos O, U, I.
// Uso: node tests/e2e/placing.mjs [url]   (con `npm run preview` corriendo)
import { chromium } from 'playwright-core';
import { skipWelcome } from './lib.mjs';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';

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
const svg = page.locator('svg.editor');
const box = await svg.boundingBox();
const mid = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.75 };

// --- #61: la vista previa se ve como el componente colocado, con su nombre ---
await page.mouse.move(mid.x, mid.y);
await page.keyboard.press('r');
await page.mouse.move(mid.x + 8, mid.y + 8);
const ghost = page.locator('svg.editor .placing');
const nextR = await page.evaluate(() => {
  const used = [...document.querySelectorAll('svg.editor .symbols text.win')].map((t) => t.textContent);
  for (let i = 1; ; i++) if (!used.includes(`R${i}`)) return `R${i}`;
});
check((await ghost.locator('.sym text.win').allTextContents()).includes(nextR), `la resistencia por colocar muestra su nombre (${nextR})`);
check((await page.locator('svg.editor .ghost').count()) === 0, 'sin gris: no se dibuja como fantasma');
const color = await page.evaluate(() => [
  getComputedStyle(document.querySelector('svg.editor .placing .sym')).color,
  getComputedStyle(document.querySelector('svg.editor .symbols .sym')).color,
  getComputedStyle(document.querySelector('svg.editor .placing .sym')).opacity,
]);
check(color[0] === color[1] && color[2] === '1', `mismo color que los colocados (${color.join(' / ')})`);
await page.keyboard.press('Escape');
await page.keyboard.press('g');
await page.mouse.move(mid.x, mid.y);
check((await ghost.locator('.flag').count()) === 1, 'la tierra por colocar usa el mismo dibujo que las colocadas');
await page.keyboard.press('Escape');

// --- #65: I, O y U ---
await page.keyboard.press('i');
await page.mouse.move(mid.x + 8, mid.y);
check((await ghost.locator('.sym text.win').allTextContents()).some((t) => /^I\d+$/.test(t)), 'I: fuente de corriente');
await page.keyboard.press('Escape');
for (const k of ['o', 'u']) {
  await page.keyboard.press(k);
  check((await svg.getAttribute('class')).includes('tool-shape'), `${k.toUpperCase()}: dibuja una figura`);
  await page.keyboard.press('Escape');
}

// --- #62: arrastrar con el botón derecho mueve la vista; un click derecho sigue editando ---
const vb = () => svg.getAttribute('viewBox');
const before = await vb();
await page.mouse.move(mid.x, mid.y);
await page.mouse.down({ button: 'right' });
await page.mouse.move(mid.x + 60, mid.y + 30, { steps: 5 });
await page.mouse.up({ button: 'right' });
const after = await vb();
check(after !== before && before.split(' ')[2] === after.split(' ')[2], 'botón derecho + arrastrar desplaza la vista (sin zoom)');
check((await page.locator('[role=dialog]').count()) === 0, 'arrastrar con el derecho no abre ningún diálogo');
const body = await page.locator('svg.editor .symbols .sym .body').first().boundingBox();
await page.mouse.click(body.x + body.width / 2, body.y + body.height / 2, { button: 'right' });
check((await page.locator('[role=dialog]').count()) === 1, 'click derecho (sin arrastrar) sobre un componente lo edita');
await page.keyboard.press('Escape');

// --- #63: la caja del buscador queda en el mismo lugar ---
await page.keyboard.press('p');
const input = page.locator('.picker input');
const tops = [];
for (const q of ['', 'res', 'zzzzqq', 'npn']) {
  await input.fill(q);
  tops.push((await input.boundingBox()).y);
}
check(tops.every((t) => t === tops[0]), `la caja de búsqueda no se mueve (${tops.join(', ')})`);
await page.keyboard.press('Escape');

// --- #64: botón de figuras en la barra, después de Texto ---
const names = await page.getByRole('toolbar', { name: 'Herramientas' }).getByRole('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
check(names.indexOf('Figuras') === names.indexOf('Texto') + 1 && names.indexOf('Directiva') === names.indexOf('Figuras') + 1, 'Figuras entre Texto y Directiva');
await page.getByRole('button', { name: 'Figuras' }).click();
const items = await page.getByRole('menu').getByRole('menuitem').allTextContents();
check(['Línea', 'Rectángulo', 'Círculo', 'Arco', 'Estilo de línea'].every((l) => items.some((t) => t.includes(l))), `el menú tiene las figuras (${items.join(' | ')})`);
await page.getByRole('menuitem', { name: /Círculo/ }).click();
check((await svg.getAttribute('class')).includes('tool-shape'), 'elegir Círculo empieza a dibujarlo');

check(!errors.length, `sin errores en la página${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} fallo(s)` : '\ntodo ok');
process.exit(failed ? 1 : 0);
