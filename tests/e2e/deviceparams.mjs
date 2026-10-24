// E2E de los parámetros de dispositivo (#202): @Q1[gm] e Ic(Q1) en el visor, guardados con .save
// al simular de nuevo, con su unidad y ofrecidos en la caja de trazas.
// Uso: node tests/e2e/deviceparams.mjs [url]   (con `npm run preview` corriendo)
import { openExample, skipWelcome, launchBrowser } from './lib.mjs';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await skipWelcome(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed++;
};
const simulate = async () => {
  await page.getByRole('button', { name: 'Correr' }).click();
  await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
  await page.waitForTimeout(300);
};
const names = () => page.locator('.trace-chip .name').allTextContents();
const add = async (expr) => {
  await page.getByLabel('Expresión').fill(expr);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
};

await page.goto(URL);
await page.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });
await openExample(page, 'Common Emitter');
await page.locator('svg.editor .sym').first().waitFor();
await simulate();

const options = await page.locator('#trace-names option').evaluateAll((os) => os.map((o) => o.value));
check(['@Q1[gm]', '@Q1[gpi]', '@Q1[cpi]', '@Q1[vbe]'].every((o) => options.includes(o)), 'la caja de trazas ofrece los parámetros de Q1');

await add('@Q1[gm]');
check((await names()).includes('@Q1[gm]'), `@Q1[gm] se agrega aunque no esté guardado (${await names()})`);
const msg = await page.locator('.message, .status-msg, [role=status]').allTextContents();
check(msg.some((m) => /no se guardó en esta simulación/.test(m)), `avisa que se guarda al simular de nuevo (${msg.join(' | ')})`);
await add('Ic(Q1)');
await simulate();
check((await names()).join() === '@Q1[gm],Ic(Q1)', `trazas: ${await names()}`);
check((await page.locator('.trace-chip.bad').count()) === 0, 'al simular de nuevo @Q1[gm] e Ic(Q1) tienen datos');

// gm sola en un panel: el eje en siemens
for (const n of ['Ic(Q1)']) await page.locator('.trace-chip', { hasText: n }).locator('.x').click();
check((await names()).join() === '@Q1[gm]', `queda sólo gm (${await names()})`);
const cb = await page.locator('.pane-chart').first().boundingBox();
await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
await page.waitForTimeout(200);
const val = await page.locator('.trace-chip .val').first().textContent();
// Ic ≈ 1.4 mA → gm = Ic/VT ≈ 54 mS
check(/^\s*[\d.]+mS\s*$/.test(val ?? ''), `gm en siemens (${val})`);
const v = parseFloat(val ?? '');
check(v > 30 && v < 90, `gm ≈ Ic/VT (${val})`);

check(errors.length === 0, `sin errores de consola${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} fallo(s)` : '\nE2E parámetros de dispositivo OK');
process.exit(failed ? 1 : 0);
