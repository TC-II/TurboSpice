// E2E de subcircuitos del proyecto (#180, #199): convertir la selección en subcircuito da la misma
// simulación, colocarlo dos veces, bajar a una instancia, migas, subir al mismo lugar y medir
// adentro (tensiones, corrientes, punto de operación y flechas de corriente).
// Uso: node tests/e2e/hierarchy.mjs [url]   (con `npm run preview` corriendo)
import { readFileSync } from 'node:fs';
import { skipWelcome, launchBrowser, FIREFOX } from './lib.mjs';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
if (!FIREFOX) await context.grantPermissions(['clipboard-read', 'clipboard-write']);
await skipWelcome(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(process.env.STACK ? e.stack : e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed++;
};

await page.goto(URL);
await page.locator('[aria-label="Simular"]:enabled').waitFor({ timeout: 30000 });
await page.locator('svg.editor .sym').first().waitFor();

const svg = page.locator('svg.editor');
const at = async (x, y) => {
  const b = await svg.boundingBox();
  const [vx, vy, vw, vh] = (await svg.getAttribute('viewBox')).split(' ').map(Number);
  return { x: b.x + ((x - vx) / vw) * b.width, y: b.y + ((y - vy) / vh) * b.height };
};
const simulate = async () => {
  await page.getByRole('button', { name: 'Simular' }).click();
  await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
  await page.waitForTimeout(400);
};
const annotations = () => page.locator('.op-annotation').allTextContents();
const showOp = async () => {
  const b = page.getByRole('button', { name: 'Anotar OP', exact: true });
  if (!(await b.getAttribute('class'))?.includes('active')) await b.click();
  await page.waitForTimeout(200);
};
const crumbs = async () => ((await page.locator('.hier-crumbs').count()) ? (await page.locator('.hier-crumbs').textContent()).trim() : '');

// V1 = 3 V → R1 1k → mid → R2 2k → tierra (sólo etiquetas)
const flat = `Version 4
SHEET 1 880 680
FLAG 0 16 in
FLAG 0 96 0
FLAG 128 16 in
FLAG 128 96 mid
FLAG 128 144 mid
FLAG 128 224 0
SYMBOL voltage 0 0 R0
SYMATTR InstName V1
SYMATTR Value 3
SYMBOL res 112 0 R0
SYMATTR InstName R1
SYMATTR Value 1k
SYMBOL res 112 128 R0
SYMATTR InstName R2
SYMATTR Value 2k
TEXT 0 300 Left 2 !.tran 1m
`;
await page.getByRole('button', { name: 'Nuevo' }).click();
await page.evaluate((t) => navigator.clipboard.writeText(t), flat);
await page.keyboard.press('Control+v');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await simulate();
await showOp();
const before = (await annotations()).sort();
check(before.includes('2V') && before.includes('1mA'), `antes: el punto de operación del divisor (${before.join(', ')})`);

// --- convertir la selección (R1, R2 y sus etiquetas) en subcircuito ---
await page.keyboard.press('Escape');
const a = await at(96, -16);
const b = await at(176, 240);
await page.mouse.move(a.x, a.y);
await page.mouse.down();
await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
await page.mouse.move(b.x, b.y, { steps: 5 });
await page.mouse.up();
await page.keyboard.press('Alt+b');
await page.locator('.modal input').fill('DIV');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check((await page.locator('svg.editor .sym').count()) === 2, 'la selección quedó reemplazada por una instancia');
await simulate();
await showOp();
const top = (await annotations()).sort();
check(top.includes('3V') && before.filter((x) => x === '3V').length === top.filter((x) => x === '3V').length, `después: arriba las mismas tensiones (${top.join(', ')})`);

// --- colocarlo dos veces ---
await page.evaluate((t) => navigator.clipboard.writeText(t), 'Version 4\nSHEET 1 880 680\nSYMBOL DIV 480 0 R0\nSYMATTR InstName X9\n');
await page.keyboard.press('Control+v');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check((await page.locator('svg.editor .sym').count()) === 3, 'el subcircuito se colocó dos veces');
await simulate();
await showOp();

// --- bajar a la primera instancia (doble clic), migas y valores en contexto ---
await page.keyboard.press('Escape');
const viewTop = await svg.getAttribute('viewBox');
const inst = page.locator('svg.editor .sym').nth(1);
const ib = await inst.boundingBox();
await page.mouse.dblclick(ib.x + ib.width / 2, ib.y + ib.height / 2);
await page.waitForTimeout(600);
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
const c1 = await crumbs();
check(/›\s*\w+ \(DIV\)/.test(c1), `migas al bajar: ${c1}`);
await showOp();
const inside = (await annotations()).sort();
check(['1mA', '2V', '3V'].every((v) => inside.includes(v)), `adentro: el punto de operación de la instancia (${inside.join(', ')})`);
check(JSON.stringify([...new Set(before)].sort()) === JSON.stringify([...new Set([...top, ...inside])].sort()), 'convertir en subcircuito da la misma simulación (los mismos valores, arriba y adentro)');
check((await page.locator('.current-arrow').count()) > 0, 'adentro: flechas de corriente en los pines');
// la punta de prueba mide la corriente de un componente de adentro
await page.locator('button[aria-label="Medir"]').click();
const r = page.locator('svg.editor .sym').first();
const rb = await r.locator('.body').first().boundingBox();
await page.mouse.click(rb.x + rb.width / 2, rb.y + rb.height / 2);
await page.waitForTimeout(400);
const chips = await page.locator('.trace-chip .name').allTextContents();
check(chips.some((c) => /^I\(x\w*\.r\d\)$/i.test(c)), `adentro: la punta de prueba mide la corriente (${chips.join(', ')})`);

// --- ciclos (#199): no se puede pegar DIV adentro de DIV ---
await page.keyboard.press('Escape');
const nIn = await page.locator('svg.editor .sym').count();
await page.evaluate((t) => navigator.clipboard.writeText(t), 'Version 4\nSHEET 1 880 680\nSYMBOL DIV 480 0 R0\nSYMATTR InstName X8\n');
await page.keyboard.press('Control+v');
await page.waitForTimeout(300);
check((await page.locator('svg.editor .sym').count()) === nIn && (await page.getByText('DIV no puede contenerse a sí mismo').count()) > 0, 'no deja colocar el subcircuito adentro de sí mismo');

// --- subir: al mismo lugar y zoom ---
await page.keyboard.press('Alt+ArrowUp');
await page.waitForTimeout(600);
check((await crumbs()) === '' || !/DIV/.test(await crumbs()), 'Alt+↑ vuelve al testbench');
check((await svg.getAttribute('viewBox')) === viewTop, 'y al mismo lugar y zoom');

// --- instancias desactualizadas o sin cablear (#199): X9 quedó con su pin suelto ---
{
  const w = await page.locator('.project-tree .tree-warn', { hasText: 'X9' }).allTextContents();
  check(w.length === 1 && /el pin in no está conectado/.test(w[0]) && !(await page.locator('.project-tree .tree-warn', { hasText: 'U1' }).count()), `el panel marca la instancia sin cablear (${w.join(' | ')})`);
}

// --- arrastrar el subcircuito desde el panel al esquemático (#199) ---
{
  const n0 = await page.locator('svg.editor .sym').count();
  const sb = await svg.boundingBox();
  const src = await page.locator('.project-tree .tree-row .tree-name', { hasText: 'DIV' }).first().boundingBox();
  await page.mouse.move(src.x + 20, src.y + src.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 10 });
  await page.mouse.move(sb.x + sb.width - 120, sb.y + sb.height - 120, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  check((await page.locator('svg.editor .sym').count()) === n0 + 1, 'arrastrar DIV desde el panel lo coloca en el esquemático');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
}

// --- exportar como netlist .sub (#199) ---
await page.locator('.project-tree .tree-row', { hasText: 'DIV' }).first().hover();
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.getByRole('button', { name: 'Exportar DIV como .sub' }).click()]);
const subText = readFileSync(await dl.path(), 'utf8');
check(dl.suggestedFilename() === 'DIV.sub' && /^\.subckt DIV in\b/m.test(subText) && /^\.ends DIV$/m.test(subText) && /^R1 /m.test(subText), `exportar DIV como .sub (${subText.split('\n').filter((l) => l.startsWith('.subckt')).join(' | ')})`);

// --- aviso al editar un subcircuito usado en varios testbenches (#199) ---
await page.locator('.project-tree .tree-row', { hasText: 'Testbench 1' }).first().hover();
await page.getByRole('button', { name: 'Duplicar Testbench 1' }).click();
await page.waitForTimeout(500);
if (await page.locator('.modal input').count()) await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
const inst2 = await page.locator('svg.editor .sym').nth(1).boundingBox();
await page.mouse.dblclick(inst2.x + inst2.width / 2, inst2.y + inst2.height / 2);
await page.waitForTimeout(600);
const r2 = await page.locator('svg.editor .sym').nth(1).locator('.body').first().boundingBox();
await page.mouse.click(r2.x + r2.width / 2, r2.y + r2.height / 2);
await page.keyboard.press('Control+r');
await page.waitForTimeout(300);
check((await page.getByText('DIV se usa en 2 testbenches').count()) > 0, 'la primera edición de un subcircuito usado en 2 testbenches avisa');
await page.keyboard.press('Control+z');
await page.keyboard.press('Alt+ArrowUp');

check(!errors.length, `sin errores en la página${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} fallo(s)` : '\nE2E jerarquía OK');
process.exit(failed ? 1 : 0);
