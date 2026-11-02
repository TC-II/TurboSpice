// E2E de subcircuitos del proyecto (#180, #199): el mismo divisor como subcircuito (Módulo nuevo ›
// Subcircuito) da la misma simulación; colocarlo dos veces, bajar a una instancia, subir al mismo
// lugar y medir adentro (tensiones, corrientes, punto de operación y flechas de corriente).
// Uso: node tests/e2e/hierarchy.mjs [url]   (con `npm run preview` corriendo)
import { readFileSync } from 'node:fs';
import { frames, steady, menu, skipWelcome, launchBrowser, FIREFOX, sampleUrl } from './lib.mjs';

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

await page.goto(sampleUrl(URL));
await page.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });
await page.locator('svg.editor .sym').first().waitFor();

const svg = page.locator('svg.editor');
const simulate = async () => {
  await page.getByLabel('Correr', { exact: true }).click();
  await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
  // (al abrirse los resultados el esquemático se reacomoda)
  await steady(page);
};
const annotations = () => page.locator('.op-annotation').allTextContents();
const showOp = async () => {
  const b = page.getByRole('button', { name: 'Anotar OP', exact: true });
  if (!(await b.getAttribute('class'))?.includes('active')) await b.click();
  await frames(page);
};
/** el subcircuito que se está editando (la franja «Editor de subcircuito»), o '' arriba */
const editing = async () => ((await page.locator('.sub-hint-name').count()) ? (await page.locator('.sub-hint-name').textContent()).trim() : '');

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
await frames(page);
await simulate();
await showOp();
const before = (await annotations()).sort();
check(before.includes('2V') && before.includes('1mA'), `antes: el punto de operación del divisor (${before.join(', ')})`);

// --- el mismo divisor como subcircuito DIV (Módulo nuevo › Subcircuito), con el puerto «in» ---
await page.keyboard.press('Escape');
// (el panel del proyecto, con los testbenches y los módulos)
if (!(await page.locator('.project-tree').count())) await page.getByRole('button', { name: 'Panel del proyecto', exact: true }).click();
await page.locator('.tree-modules .tree-add[aria-haspopup]').click();
await page.getByRole('menuitem', { name: /Subcircuito/ }).click();
await page.locator('.new-module input').fill('DIV');
await page.keyboard.press('Enter');
await page.locator('.sub-hint-name', { hasText: 'DIV' }).waitFor();
const div = `Version 4
SHEET 1 880 680
FLAG 128 16 in
IOPIN 128 16 BiDir
FLAG 128 96 mid
FLAG 128 144 mid
FLAG 128 224 0
SYMBOL res 112 0 R0
SYMATTR InstName R1
SYMATTR Value 1k
SYMBOL res 112 128 R0
SYMATTR InstName R2
SYMATTR Value 2k
`;
// (el subcircuito nuevo trae los puertos in y out de ejemplo: se reemplaza todo)
await svg.click({ position: { x: 5, y: 5 } });
await page.keyboard.press('Control+a');
await page.keyboard.press('Delete');
await page.evaluate((t) => navigator.clipboard.writeText(t), div);
await page.keyboard.press('Control+v');
await page.keyboard.press('Escape');
await frames(page);
// arriba, la instancia U1 en lugar de R1 y R2 (el pin «in» del símbolo generado queda en x − 32)
await page.locator('.project-tree .tree-row[data-bench] .tree-name').first().click();
await page.waitForFunction(() => !document.querySelector('.sub-simbar'));
const parent = `Version 4
SHEET 1 880 680
FLAG 0 16 in
FLAG 0 96 0
FLAG 128 48 in
SYMBOL voltage 0 0 R0
SYMATTR InstName V1
SYMATTR Value 3
SYMBOL DIV 160 48 R0
SYMATTR InstName U1
TEXT 0 300 Left 2 !.tran 1m
`;
await svg.click({ position: { x: 5, y: 5 } });
await page.keyboard.press('Control+a');
await page.keyboard.press('Delete');
await page.evaluate((t) => navigator.clipboard.writeText(t), parent);
await page.keyboard.press('Control+v');
await page.keyboard.press('Escape');
await frames(page);
check((await page.locator('svg.editor .sym').count()) === 2, 'arriba quedan V1 y una instancia de DIV');
await simulate();
await showOp();
const top = (await annotations()).sort();
check(top.includes('3V') && before.filter((x) => x === '3V').length === top.filter((x) => x === '3V').length, `después: arriba las mismas tensiones (${top.join(', ')})`);

// --- colocarlo dos veces ---
await page.evaluate((t) => navigator.clipboard.writeText(t), 'Version 4\nSHEET 1 880 680\nSYMBOL DIV 480 0 R0\nSYMATTR InstName X9\n');
await page.keyboard.press('Control+v');
await page.keyboard.press('Escape');
await frames(page);
check((await page.locator('svg.editor .sym').count()) === 3, 'el subcircuito se colocó dos veces');
await simulate();
await showOp();

// --- bajar a la primera instancia (doble clic), migas y valores en contexto ---
await page.keyboard.press('Escape');
const viewTop = await svg.getAttribute('viewBox');
const inst = page.locator('svg.editor .sym').nth(1);
const ib = await inst.boundingBox();
await page.mouse.dblclick(ib.x + ib.width / 2, ib.y + ib.height / 2);
await frames(page);
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
check((await editing()) === 'DIV', `doble clic en la instancia: se edita DIV adentro (${await editing()})`);
await showOp();
const inside = (await annotations()).sort();
check(
  ['1mA', '2V', '3V'].every((v) => inside.includes(v)),
  `adentro: el punto de operación de la instancia (${inside.join(', ')})`,
);
check(
  JSON.stringify([...new Set(before)].sort()) === JSON.stringify([...new Set([...top, ...inside].filter((v) => !/^I = /.test(v)))].sort()),
  'como subcircuito da la misma simulación (los mismos valores, arriba y adentro)',
);
check((await page.locator('.current-arrow').count()) > 0, 'adentro: flechas de corriente en los pines');
// la punta de prueba mide la corriente de un componente de adentro
await page.locator('button[aria-label="Medir"]').click();
const r = page.locator('svg.editor .sym').first();
const rb = await r.locator('.body').first().boundingBox();
await page.mouse.click(rb.x + rb.width / 2, rb.y + rb.height / 2);
await frames(page);
// (mientras se edita el subcircuito no se ve el panel de resultados: la traza se mira al subir)

// --- ciclos (#199): no se puede pegar DIV adentro de DIV ---
await page.keyboard.press('Escape');
const nIn = await page.locator('svg.editor .sym').count();
await page.evaluate((t) => navigator.clipboard.writeText(t), 'Version 4\nSHEET 1 880 680\nSYMBOL DIV 480 0 R0\nSYMATTR InstName X8\n');
await page.keyboard.press('Control+v');
await frames(page);
check((await page.locator('svg.editor .sym').count()) === nIn && (await page.getByText('DIV no puede contenerse a sí mismo').count()) > 0, 'no deja colocar el subcircuito adentro de sí mismo');

// --- subir: al mismo lugar y zoom ---
await page.keyboard.press('Alt+ArrowUp');
await frames(page);
check((await editing()) === '', 'Alt+↑ vuelve al testbench');
const chips = await page.locator('.trace-chip .name').allTextContents();
check(
  chips.some((c) => /^I\(x\w*\.r1\)$/i.test(c)),
  `la punta de prueba adentro midió la corriente de R1 (${chips.join(', ')})`,
);
check((await svg.getAttribute('viewBox')) === viewTop, 'y al mismo lugar y zoom');

// --- instancias desactualizadas o sin cablear (#199): X9 quedó con su pin suelto ---
{
  const w = await page.locator('.project-tree .tree-warn', { hasText: 'X9' }).allTextContents();
  check(
    w.length === 1 && /el pin in no está conectado/.test(w[0]) && !(await page.locator('.project-tree .tree-warn', { hasText: 'U1' }).count()),
    `el panel marca la instancia sin cablear (${w.join(' | ')})`,
  );
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
  await frames(page);
  check((await page.locator('svg.editor .sym').count()) === n0 + 1, 'arrastrar DIV desde el panel lo coloca en el esquemático');
  await page.keyboard.press('Control+z');
  await frames(page);
}

// --- exportar como netlist .sub (#199) ---
await page.locator('.project-tree .tree-row', { hasText: 'DIV' }).first().hover();
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.getByRole('button', { name: 'Exportar DIV como .sub' }).click()]);
const subText = readFileSync(await dl.path(), 'utf8');
check(
  dl.suggestedFilename() === 'DIV.sub' && /^\.subckt DIV in\b/m.test(subText) && /^\.ends DIV$/m.test(subText) && /^R1 /m.test(subText),
  `exportar DIV como .sub (${subText
    .split('\n')
    .filter((l) => l.startsWith('.subckt'))
    .join(' | ')})`,
);

// --- copiar a Mis símbolos y modelos (#199, #171) ---
await page.locator('.project-tree .tree-row', { hasText: 'DIV' }).first().hover();
await page.getByRole('button', { name: 'Copiar DIV a Mis símbolos y modelos' }).click();
check((await page.getByText('Copiado a Mis símbolos y modelos: DIV.asc, DIV.asy').count()) > 0, 'copiar DIV a Mis símbolos y modelos');
await menu(page, 'Archivos y bibliotecas', 'Mis símbolos y modelos…');
const mine = await page.locator('.modal').textContent();
check(/DIV\.asc/.test(mine) && /DIV\.asy/.test(mine), 'y aparece en Mis símbolos y modelos');
await page.getByRole('button', { name: 'Cerrar', exact: true }).click();

// --- aviso al editar un subcircuito usado en varios testbenches (#199) ---
// (los testbenches son las simulaciones del workbench: se duplica la que hay)
await page.locator('.project-tree .tree-row[data-bench]', { hasText: 'Tran 0 - 1m' }).first().hover();
await page.getByRole('button', { name: 'Duplicar Tran 0 - 1m' }).click();
await frames(page);
if (await page.locator('.modal input').count()) await page.keyboard.press('Enter');
await frames(page);
await page.keyboard.press('Escape');
const inst2 = await page.locator('svg.editor .sym').nth(1).boundingBox();
await page.mouse.dblclick(inst2.x + inst2.width / 2, inst2.y + inst2.height / 2);
await frames(page);
const r2 = await page.locator('svg.editor .sym').nth(1).locator('.body').first().boundingBox();
await page.mouse.click(r2.x + r2.width / 2, r2.y + r2.height / 2);
await page.keyboard.press('Control+r');
await frames(page);
check((await page.getByText('DIV se usa en 2 testbenches').count()) > 0, 'la primera edición de un subcircuito usado en 2 testbenches avisa');
await page.keyboard.press('Control+z');
await page.keyboard.press('Alt+ArrowUp');

// --- un .asy existente como símbolo y el puerto de cada pin (#199) ---
await page.locator('.tree-modules .tree-add[aria-haspopup]').click();
await page.getByRole('menuitem', { name: /Subcircuito/ }).click();
await page.locator('.new-module input').fill('AMP');
await page.keyboard.press('Enter');
await frames(page);
await page.getByRole('button', { name: 'Importar de uno existente…' }).click();
await page.locator('.modal input').fill('xtal');
await frames(page);
await page.keyboard.press('Enter');
await frames(page);
const symLines = await page.locator('.sym-pane .sym-shapes line').count();
// (los pines de xtal no muestran su nombre: el puerto de cada uno está en «Puerto de cada pin»)
const pinNames = () => page.locator('.sym-assign select').evaluateAll((ss) => ss.map((s) => s.value));
// (xtal: 4 líneas y un rectángulo, que se dibuja con 4 más)
check(symLines === 8 && JSON.stringify(await pinNames()) === '["in","out"]', `usar xtal como símbolo de AMP (${symLines} líneas, pines ${(await pinNames()).join(', ')})`);
await page.locator('.sym-assign summary').click();
await page.getByLabel('Puerto del pin 1').selectOption('out');
await frames(page);
check(JSON.stringify(await pinNames()) === '["out","in"]', `cambiar el puerto de un pin los intercambia (${(await pinNames()).join(', ')})`);
await page.keyboard.press('Alt+ArrowUp');

check(!errors.length, `sin errores en la página${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} fallo(s)` : '\nE2E jerarquía OK');
process.exit(failed ? 1 : 0);
