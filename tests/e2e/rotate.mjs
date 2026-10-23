// E2E de rotar/espejar (#37): Ctrl+R / Ctrl+E sobre un componente colocado no lo hace
// "viajar" y, mientras se lo arrastra, el fantasma gira en el acto sin mover el mouse.
// Uso: node tests/e2e/rotate.mjs [url] [carpeta-capturas]   (con `npm run preview` corriendo)
import { mkdirSync, readFileSync } from 'node:fs';
import { skipWelcome, launchBrowser } from './lib.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import { activeAsc, variantOf } from '../../src/project/project.ts';
import { parseTurbo } from '../../src/project/turbo.ts';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const OUT = process.argv[3] ?? 'test-results';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
await skipWelcome(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
await page.addInitScript(() => {
  delete window.showSaveFilePicker;
  delete window.showOpenFilePicker;
});

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed++;
};

await page.goto(URL);
await page.getByRole('button', { name: 'Nuevo' }).click();
const svg = page.locator('svg.editor');
const at = async (x, y) => {
  const box = await svg.boundingBox();
  const [vx, vy, vw, vh] = (await svg.getAttribute('viewBox')).split(' ').map(Number);
  return { x: box.x + ((x - vx) / vw) * box.width, y: box.y + ((y - vy) / vh) * box.height };
};
const click = async (x, y) => {
  const p = await at(x, y);
  await page.mouse.click(p.x, p.y);
};
let saves = 0;
const saved = async () => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')]);
  const path = `${OUT}/rotate-${saves++}.turbo`;
  await download.saveAs(path);
  // Ctrl+S guarda el proyecto (.turbo): el circuito es el de la variante activa
  return parseAsc(activeAsc(variantOf((await parseTurbo(readFileSync(path, 'utf8'))).project))).symbols.map((s) => `${s.type} ${s.x} ${s.y} ${s.orient}`);
};
const body = (i) => page.locator('svg.editor .symbols > g .body').nth(i).getAttribute('transform');
const keys = async (k, n) => {
  for (let i = 0; i < n; i++) await page.keyboard.press(k);
};

// R (cantidad impar de tramos entre pines) y C (par), con el cursor en el centro del dibujo
await page.keyboard.press('r');
await click(0, 0);
await page.keyboard.press('Escape');
await page.keyboard.press('c');
await click(160, 0);
await page.keyboard.press('Escape');
const ref = await saved();
check(ref.length === 2, `componentes colocados: ${ref.join(' | ')}`);

for (const [i, [x, y]] of [[0, 0], [160, 0]].entries()) {
  await click(x, y);
  await keys('Control+r', 1);
  const r1 = (await saved())[i];
  check(r1 !== ref[i], `Ctrl+R rota ${ref[i]} → ${r1}`);
  await keys('Control+r', 3);
  check((await saved())[i] === ref[i], `${ref[i]}: 4 rotaciones lo dejan exactamente donde estaba`);
  await keys('Control+e', 2);
  check((await saved())[i] === ref[i], `${ref[i]}: 2 espejados lo dejan exactamente donde estaba`);
  await keys('Control+r', 2);
  await keys('Control+e', 1);
  await keys('Control+r', 2);
  await keys('Control+e', 1);
  check((await saved())[i] === ref[i], `${ref[i]}: rotar y espejar combinados vuelven al inicio`);
  await page.keyboard.press('Escape');
}

// Arrastrar R1 y rotar sin soltar ni mover el mouse: el fantasma gira en el acto
{
  const a = await at(0, 0);
  const b = await at(96, 64);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  const before = await body(0);
  await page.keyboard.press('Control+r');
  await page.waitForTimeout(100);
  const after = await body(0);
  check(after !== before, `Ctrl+R durante el arrastre actualiza el fantasma (${before} → ${after})`);
  await page.keyboard.press('Control+e');
  await page.waitForTimeout(100);
  const mirrored = await body(0);
  check(mirrored !== after, `Ctrl+E durante el arrastre actualiza el fantasma (${after} → ${mirrored})`);
  await page.mouse.up();
  const s = await saved();
  check(s[0] !== ref[0] && s[0].endsWith('M90'), `al soltar queda movido, rotado y espejado: ${s[0]}`);
  // la rotación durante el arrastre usa el mismo punto fijo: el resultado es el desplazamiento
  // del componente original rotado y espejado en el lugar
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  check((await saved())[0] === ref[0], `Ctrl+Z vuelve al original: ${ref[0]}`);
}

await page.screenshot({ path: `${OUT}/rotate.png` });
check(errors.length === 0, `sin errores en la página${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} fallo(s)` : '\nE2E rotar/espejar OK');
process.exit(failed ? 1 : 0);
