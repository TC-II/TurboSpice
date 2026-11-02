// E2E del panel de señales guardadas (#314, #364): a la derecha de la simulación, sin nada
// marcado al empezar, se eligen con la punta de prueba en el esquemático (un cable, su tensión;
// un componente, su corriente; otro click lo desmarca) y cada fila resalta su red o su componente
// (y al revés).
// Uso: node tests/e2e/saves.mjs [url] [carpeta-capturas]   (con `npm run preview` corriendo)
import { mkdirSync } from 'node:fs';
import { frames, launchBrowser, showSimCommand, simType, skipWelcome, steady, until, sampleUrl } from './lib.mjs';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const OUT = process.argv[3] ?? 'test-results';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await skipWelcome(page);
// (para esperar el .tran del circuito que se suelta)
await showSimCommand(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed++;
};

await page.goto(sampleUrl(URL));
await page.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });
await page.locator('svg.editor .sym').first().waitFor(); // Sample Project: el pasabajos RC

const svg = page.locator('svg.editor');
const at = async (x, y) => {
  const box = await svg.boundingBox();
  const [vx, vy, vw, vh] = (await svg.getAttribute('viewBox')).split(' ').map(Number);
  return { x: box.x + ((x - vx) / vw) * box.width, y: box.y + ((y - vy) / vh) * box.height };
};
const panel = page.locator('.saves-panel');
const row = (ref) => panel.locator(`.saves-row[data-ref="${ref}"]`);
const checked = () => panel.locator('.saves-row input:checked').count();
/** el centro del dibujo de un componente (lejos de sus pines: la punta de prueba elige el cuerpo) */
const symbolCenter = async (inst) => {
  const i = await page.locator('svg.editor .symbols > g').evaluateAll((gs, name) => gs.findIndex((g) => [...g.querySelectorAll('text')].some((t) => t.textContent === name)), inst);
  const b = await page.locator('svg.editor .symbols > g').nth(i).locator('path, rect, line, polyline').first().boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

// --- se abre a la derecha, guardando todo y sin nada marcado ---
await simType(page, 'Señales guardadas…');
await panel.waitFor();
const pb = await panel.boundingBox();
const eb = await svg.boundingBox();
check(pb.x >= eb.x + eb.width - 2, 'el panel queda a la derecha del esquemático (no es un diálogo)');
check((await page.locator('.modal').count()) === 0, 'sin diálogo modal');
check(await panel.getByRole('radio', { name: /^Todo:/ }).isChecked(), 'con el circuito guardando todo, empieza en «Todo»');
await panel.getByRole('radio', { name: 'Sólo las señales elegidas' }).click();
await row('V(out)').waitFor();
check((await panel.locator('.saves-row').count()) >= 5 && (await checked()) === 0, `por defecto no se marca ninguna (${await checked()} marcadas)`);

// --- con la punta de prueba: un cable, su tensión; un componente, sus corrientes ---
await panel.getByRole('button', { name: 'Elegir en el esquemático' }).click();
check((await panel.locator('.saves-pick').getAttribute('aria-pressed')) === 'true', 'el botón deja la punta de prueba eligiendo');
const out = await at(272, -32);
await page.mouse.click(out.x, out.y);
await until(async () => (await checked()) === 1);
check(await row('V(out)').locator('input').isChecked(), 'click en el cable «out» marca V(out)');
const r1 = await symbolCenter('R1');
await page.mouse.click(r1.x, r1.y);
await until(async () => (await checked()) === 2);
check(await row('I(R1)').locator('input').isChecked(), 'click en R1 marca I(R1)');
check(/^2 elegidas/.test((await panel.locator('.saves-count').textContent()).trim()), `cuenta las elegidas (${await panel.locator('.saves-count').textContent()})`);
await page.mouse.click(r1.x, r1.y);
await until(async () => (await checked()) === 1);
check(!(await row('I(R1)').locator('input').isChecked()), 'otro click en R1 la desmarca');
// lo elegido está en el esquemático (como .save): se deshace con Ctrl+Z
await page.keyboard.press('Control+z');
await until(async () => (await checked()) === 2);
check(await row('I(R1)').locator('input').isChecked(), 'Ctrl+Z vuelve a marcarla (está en el .asc)');
await page.screenshot({ path: `${OUT}/senales-panel.png` });

// --- resaltado: la fila resalta su red o su componente, y el esquemático resalta la fila ---
await row('V(out)').hover();
await frames(page);
check((await page.locator('svg.editor .net-hl:not(.flight) line').count()) > 0, 'pasar sobre V(out) resalta su red');
await row('I(R1)').hover();
await frames(page);
check((await page.locator('svg.editor .symbols > g.hover').count()) === 1, 'pasar sobre I(R1) resalta R1');
const n1 = await at(0, -16);
await page.mouse.move(n1.x, n1.y);
await frames(page);
check(((await panel.locator('.saves-row.hl').allTextContents()).map((s) => s.trim())).join() === 'V(N001)', `pasar sobre el cable resalta su fila (${(await panel.locator('.saves-row.hl').allTextContents()).join()})`);
await page.mouse.move(r1.x, r1.y);
await frames(page);
check(((await panel.locator('.saves-row.hl').allTextContents()).map((s) => s.trim())).join() === 'I(R1)', 'y sobre R1, la suya');

// --- al simular queda en gris y la punta de prueba grafica; un click en el panel lo reactiva ---
await page.getByRole('button', { name: 'Correr', exact: true }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
await steady(page);
check((await panel.getAttribute('class')).includes('inactive'), 'al simular, el panel queda en gris');
const out2 = await at(272, -32);
await page.mouse.click(out2.x, out2.y);
await until(async () => (await page.locator('.trace-chip .name').count()) === 1);
check((await page.locator('.trace-chip .name').allTextContents()).join() === 'V(out)' && (await checked()) === 2, `la punta de prueba grafica V(out) sin cambiar lo elegido (${(await page.locator('.trace-chip .name').allTextContents()).join()})`);
await panel.locator('.saves-title').click();
check(!(await panel.getAttribute('class')).includes('inactive') && (await panel.locator('.saves-pick').getAttribute('aria-pressed')) === 'true', 'un click en el panel lo reactiva, eligiendo con la punta de prueba');
await page.mouse.click(out2.x, out2.y);
await until(async () => (await checked()) === 1);
check(!(await row('V(out)').locator('input').isChecked()), 'y la punta vuelve a elegir (desmarca V(out))');
await page.screenshot({ path: `${OUT}/senales-despues.png` });

// --- «Todo» lo vuelve a guardar todo; se cierra con la cruz ---
await panel.getByRole('radio', { name: /^Todo:/ }).click();
check((await panel.locator('.saves-row').count()) === 0, '«Todo» saca la lista');
await panel.getByRole('button', { name: 'Cerrar las señales guardadas' }).click();
check((await panel.count()) === 0, 'la cruz cierra el panel');

// --- #363: un transitorio frenado por memoria ofrece elegir; el panel dice cuántas entran y avisa
// en rojo si se pasa ---
const longAsc = ['Version 4', 'SHEET 1 880 680', 'WIRE 0 16 80 16', 'WIRE 80 16 160 16', 'WIRE 0 96 80 96', 'WIRE 80 96 160 96', 'WIRE 160 80 160 96', 'FLAG 0 96 0',
  'SYMBOL voltage 0 0 R0', 'SYMATTR InstName V1', 'SYMATTR Value PULSE(0 1 0 10n 10n 0.5u 1u)',
  'SYMBOL res 64 0 R0', 'SYMATTR InstName R1', 'SYMATTR Value 1k',
  'SYMBOL cap 144 16 R0', 'SYMATTR InstName C1', 'SYMATTR Value 1n',
  'TEXT 0 160 Left 2 !.tran 0 1.2'].join('\n') + '\n';
await page.evaluate((t) => {
  const dt = new DataTransfer();
  dt.items.add(new File([t], 'Largo.asc'));
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
}, longAsc);
await page.locator('.texts .directive', { hasText: '.tran 0 1.2' }).waitFor();
await page.getByRole('button', { name: 'Correr', exact: true }).click();
const choose = page.getByRole('button', { name: /^Elegir señales \(hasta \d+\)$/ });
await choose.waitFor({ timeout: 60000 });
const fit = Number(/\d+/.exec(await choose.textContent())[0]);
await choose.click();
await panel.waitFor();
check(await panel.getByRole('radio', { name: 'Sólo las señales elegidas' }).isChecked() && (await panel.locator('.saves-pick').getAttribute('aria-pressed')) === 'true', '«Elegir señales» abre el panel para elegir, con la punta de prueba');
await row('I(C1)').waitFor();
check((await checked()) === 0, 'sin nada marcado');
check((await panel.locator('.saves-count').textContent()).startsWith(`0 elegidas de ${fit} como máximo`), `dice cuántas entran (${await panel.locator('.saves-count').textContent()})`);
await panel.getByRole('button', { name: 'Todas las corrientes' }).click();
await until(async () => (await checked()) === 3);
check(fit < 3 && (await panel.locator('.saves-count.saves-over').count()) === 1, `con más de ${fit}, avisa en rojo (${await panel.locator('.saves-count').textContent()})`);
await page.screenshot({ path: `${OUT}/senales-freno.png` });

check(errors.length === 0, `sin errores de consola${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} fallo(s)` : '\nE2E señales guardadas OK');
process.exit(failed ? 1 : 0);
