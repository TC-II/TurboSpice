// E2E de funciones de interfaz, por issue: nombres de redes (#15), compartir (#1), autoguardado
// (#5), punto de operación (#2), elegir en el esquemático (#13), .step (#7), visor de resultados
// (#3), vista recordada (#14), exportaciones (#12), expandir esquemático/resultados (#24) y
// colapsar los resultados sin perderlos (#36).
// Uso: node tests/e2e/features.mjs [url] [carpeta-capturas]   (con `npm run preview` corriendo)
import { mkdirSync, readFileSync } from 'node:fs';
import { menu, openExample, resultsMenu, resultsView, simCommand, simType, skipWelcome, spanishUi, launchBrowser, FIREFOX } from './lib.mjs';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const OUT = process.argv[3] ?? 'test-results';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1600, height: 800 }, acceptDownloads: true });
// (Firefox no tiene esos permisos: el portapapeles anda sin pedirlos)
if (!FIREFOX) await context.grantPermissions(['clipboard-read', 'clipboard-write']);
await skipWelcome(context);
const page = await context.newPage();
const errors = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(process.env.STACK ? e.stack : e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  p.on('dialog', (d) => d.accept());
};
watch(page);

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed++;
};

await page.goto(URL);
await page.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });
await page.locator('svg.editor .sym').first().waitFor(); // Sample Project: el pasabajos RC

// --- #38: barra de herramientas y menú colapsado ---
check((await page.getByRole('menubar').count()) === 0, 'no queda barra de menús');
await page.getByRole('button', { name: 'Menú', exact: true }).click();
check((await page.getByRole('menu', { name: 'Menú' }).getByRole('menuitem').allTextContents()).join() === 'Archivo▸,Editar▸,Dibujar▸,Simular▸,Ver▸,Configuración▸,Ayuda▸,Acerca de TurboSpice', 'el botón junto al nombre despliega todos los menús');
await page.keyboard.press('ArrowRight');
check(await page.getByRole('menu', { name: 'Archivo' }).isVisible(), 'con el teclado se abre el submenú (flecha derecha)');
await page.keyboard.press('Escape');
check((await page.getByRole('menu').count()) === 0, 'Esc cierra el menú');
const toolbarNames = await page.getByRole('toolbar', { name: 'Herramientas' }).getByRole('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
check(
  toolbarNames.slice(0, 17).join() === 'Menú,Nuevo,Guardar,Exportar a PDF,Abrir,Deshacer,Rehacer,Seleccionar,Cable,Componente,Tierra,Etiqueta,Texto,Figuras,Directiva,Ajustar,Mover' && toolbarNames.includes('Borrar'),
  `orden de la barra (${toolbarNames.join(', ')})`,
);
check(!toolbarNames.includes('Estudio…') && !toolbarNames.includes('.control…') && !toolbarNames.includes('Panel de resultados'), 'Estudio, .control y Resultados no tienen botón propio en la barra');
const simNames = await page.getByRole('toolbar', { name: 'Simulación' }).getByRole('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
check(
  simNames.slice(0, 7).join() === 'Panel del proyecto,Nombre del proyecto,Nombre del testbench,Nueva simulación,Correr,Medir,Redes' || simNames.join().includes('Panel del proyecto,') && /Nueva simulación,Correr,Medir,Redes,Anotar OP/.test(simNames.join()),
  `segunda barra: árbol, cápsula, Nueva simulación, Correr, Medir, Redes, Anotar OP (${simNames.join(', ')})`,
);
check(!toolbarNames.includes('Medir') && !toolbarNames.includes('Redes'), 'Medir y Redes ya no están en la primera barra');
check((await page.locator('.appbar h1 + nav, .appbar > h1:first-child').count()) > 0, 'la primera línea empieza con el logo');
const views = page.getByRole('navigation', { name: 'Vistas' });
check((await views.getByRole('button').allTextContents()).join() === 'Esquemático,Resultados' && (await views.getByRole('button', { name: 'Resultados' }).isDisabled()), 'arriba, Esquemático y Resultados (deshabilitado sin resultados)');
await page.getByRole('button', { name: 'Nueva simulación', exact: true }).click();
const simMenu = await page.getByRole('menu').locator('[role^=menuitem]').allTextContents();
await page.keyboard.press('Escape');
check(
  simMenu.includes('Barrido DC') && simMenu.includes('Comando de simulación…A') && simMenu.includes('Directiva SPICE….') && simMenu.includes('Estudio…Alt+E') && !simMenu.some((x) => /Nueva|Duplicar|Renombrar/.test(x)),
  `desplegable de Simular: tipos, comandos y análisis programados (${simMenu.join(' | ')})`,
);
await page.getByRole('button', { name: 'Texto', exact: true }).click();
check(await page.locator('.modal .seg input[type=radio]').nth(1).isChecked(), 'Texto abre el diálogo de comentario');
await page.keyboard.press('Escape');
// en ancho de celular la barra no desborda: los grupos que no entran van a "Más herramientas"
await page.setViewportSize({ width: 375, height: 760 });
await page.waitForTimeout(300);
const overflow = await page.evaluate(() => [document.documentElement.scrollWidth, document.querySelector('.appbar .iconbar').scrollWidth, document.querySelector('.appbar').scrollWidth]);
check(overflow.every((w) => w <= 375), `en 375 px no hay desborde (${overflow.join(', ')})`);
await page.getByRole('button', { name: 'Más herramientas' }).click();
await page.getByRole('menu').getByRole('menuitemcheckbox', { name: 'Cable', exact: true }).click();
check(await page.locator('svg.editor.tool-wire').isVisible(), 'desde "Más herramientas" se elige el cable');
await page.keyboard.press('Escape');
await page.setViewportSize({ width: 1600, height: 800 });
await page.waitForTimeout(300);
await page.keyboard.press('Home');

// --- #15: nombres de redes temporales ---
const names = () => page.locator('.net-name text').allTextContents();
await page.getByRole('button', { name: 'Redes' }).click();
check((await names()).sort().join() === 'N001,out', `muestra el nombre de cada red (${(await names()).join(', ')})`);
check((await page.locator('.net-name.auto').count()) === 1, 'las redes sin etiqueta se distinguen');
await page.keyboard.press('Alt+n');
check((await page.locator('.net-name').count()) === 0, 'Alt+N las oculta');
check(!(await page.locator('.capsule-dirty').count()), 'mostrarlas no modifica el documento');
await page.keyboard.press('Alt+n');
await page.locator('.net-name.auto').click();
await page.locator('.modal input').fill('in');
await page.keyboard.press('Enter');
check((await names()).sort().join() === 'in,out', `click en N001 le pone nombre con una etiqueta (${(await names()).join(', ')})`);
check((await page.locator('.flags .flagname', { hasText: 'in' }).count()) === 1, 'y la etiqueta queda en el esquemático');
await page.screenshot({ path: `${OUT}/net-names.png` });
await page.keyboard.press('Control+z');
await page.getByRole('button', { name: 'Redes' }).click();

// --- #1: compartir con un link ---
await openExample(page, 'RLC Bode');
await page.locator('svg.editor .sym').first().waitFor();
await page.getByRole('button', { name: 'Compartir' }).click();
const link = await page.locator('.modal input[aria-label="Enlace"]').inputValue();
check(/#c=[\w-]+&n=Examples\.asc$/.test(link), `genera el link (${link.length} caracteres)`);
check((await page.locator('.modal').innerText()).match(/comprimido en [\d.,]+ bytes/) !== null, 'el diálogo dice cuántos bytes ocupa el circuito comprimido');
check(await page.locator('.modal .hint.ok').filter({ hasText: 'Link copiado en portapapeles' }).count() === 1 || (await page.locator('.modal').innerText()).includes('Ctrl+C'), 'confirma que se copió el link (o pide copiarlo)');
check(await page.getByRole('button', { name: 'Descargar .asc' }).count() === 0, 'sin opción de descargar el .asc');
await page.getByRole('button', { name: 'Listo', exact: true }).click();
// Exportar a PDF: la vista actual del esquemático, en una pestaña para imprimir
const [pdfTab] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: 'Exportar a PDF' }).click()]);
const pdfSyms = await pdfTab.locator('svg g').count().catch(() => 0);
check(pdfSyms > 0, `Exportar a PDF abre la vista actual del esquemático para imprimir (${pdfSyms} grupos)`);
await pdfTab.close();
const other = await context.newPage();
watch(other);
await other.goto(link);
await other.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });
await other.locator('svg.editor .sym').first().waitFor();
check((await other.locator('.capsule-project').textContent()) === 'Examples', 'el link abre el circuito con su nombre');
check(!(await other.evaluate(() => location.hash)), 'y limpia el hash');
const symsA = await page.locator('svg.editor .sym').count();
check((await other.locator('svg.editor .sym').count()) === symsA, 'con los mismos componentes');
await other.getByRole('button', { name: 'Correr' }).click();
await other.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
check((await other.locator('.status.ok').count()) === 1, 'y simula');
await other.close();

// --- #5: autoguardado y recientes ---
const flags = () => page.locator('.flags .flag').count();
const before = await flags();
const box = await page.locator('svg.editor').boundingBox();
await page.keyboard.press('g');
await page.mouse.click(box.x + 60, box.y + 60);
await page.keyboard.press('Escape');
check((await flags()) === before + 1, 'agrega una tierra');
await page.waitForTimeout(1200); // autoguardado
await page.reload();
await page.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });
await page.locator('svg.editor .sym').first().waitFor();
check((await flags()) === before + 1, 'al recargar se recupera el trabajo sin guardar');
check((await page.locator('.capsule-project').textContent()) === 'Examples' && (await page.locator('.capsule-dirty').count()) === 1, 'con su nombre y marcado como modificado');
// la pila de deshacer no se guarda (#154): después de recargar empieza vacía
await page.keyboard.press('Control+z');
check((await flags()) === before + 1, 'la pila de deshacer empieza vacía después de recargar');
await page.getByRole('button', { name: 'Menú', exact: true }).click();
await page.getByRole('menu').getByRole('menuitem', { name: 'Archivo', exact: true }).hover();
await page.getByRole('menu').getByRole('menuitem', { name: 'Recientes' }).hover();
const recents = await page.getByRole('menu', { name: 'Recientes' }).getByRole('menuitem').allTextContents();
await page.keyboard.press('Escape');
check(recents.includes('Examples'), `recientes: ${recents.join(', ')}`);

// --- #2: punto de operación con el mouse ---
const svg = page.locator('svg.editor');
const at = async (x, y) => {
  const b = await svg.boundingBox();
  const [vx, vy, vw, vh] = (await svg.getAttribute('viewBox')).split(' ').map(Number);
  return { x: b.x + ((x - vx) / vw) * b.width, y: b.y + ((y - vy) / vh) * b.height };
};
await openExample(page, 'Common Emitter');
await page.locator('svg.editor .sym').first().waitFor();
await page.getByRole('button', { name: 'Correr' }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
await page.waitForTimeout(300);
const q1 = await at(236, 208);
await page.mouse.move(q1.x, q1.y);
const tip = await page.locator('.bias-tip').textContent().catch(() => '');
check(/Q1/.test(tip) && /Ic = 1\.41\dmA/.test(tip) && /Región: activa directa/.test(tip), `hover sobre Q1: ${tip}`);
{
  // #53: en un transistor la punta de prueba mide la corriente de cada pin; el cuerpo no mide
  const names = () => page.locator('.trace-chip .name').allTextContents();
  const n0 = (await names()).length;
  await page.mouse.click(q1.x, q1.y);
  await page.waitForTimeout(200);
  check((await names()).length === n0, 'click en el cuerpo de Q1 no mide');
  for (const [x, y] of [[256, 164], [196, 208], [256, 252]]) {
    const pin = await at(x, y);
    await page.mouse.click(pin.x, pin.y);
    await page.waitForTimeout(200);
  }
  const got = (await names()).slice(n0);
  check(got.join() === 'Ic(Q1),Ib(Q1),Ie(Q1)', `colector, base y emisor miden Ic, Ib e Ie (${got})`);
  check((await page.locator('.trace-chip.bad').count()) === 0, 'y las tres tienen datos');
  for (let k = 0; k < got.length; k++) await page.locator('.trace-chip .x').last().click();
}
const outW = await at(320, 128);
await page.mouse.move(outW.x, outW.y);
const tipOut = await page.locator('.bias-tip').textContent().catch(() => '');
check(/V\(out\)5\.35\dV/.test(tipOut), `hover sobre la red out: ${tipOut}`);
// FFT (#21): la salida del amplificador tiene la fundamental en 1 kHz
await page.mouse.click(outW.x, outW.y);
await page.getByRole('button', { name: 'FFT…' }).click();
await page.getByLabel('Traza para la FFT').selectOption('V(out)');
await page.getByRole('button', { name: 'Calcular' }).click();
const fftInfo = await page.locator('.plot-info').textContent();
check(/fundamental 1kHz/.test(fftInfo) && /THD \d+\.\d+ %/.test(fftInfo), `FFT y THD de V(out): ${fftInfo}`);
check((await page.getByRole('combobox', { name: 'Plot' }).inputValue()).startsWith('fft V(out)'), 'la FFT queda como un plot más');
await page.getByRole('combobox', { name: 'Plot' }).selectOption('tran1');
check((await page.locator('.trace-chip .name').allTextContents()).join() === 'V(out)', 'al volver al transitorio se recuperan sus trazas');
// #193: con zoom en un tramo chico las marcas del eje Y no se repiten
{
  const cb = await page.locator('.pane-chart').first().boundingBox();
  const y = cb.y + cb.height / 2;
  await page.mouse.move(cb.x + cb.width * 0.5, y);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width * 0.5 + 30, y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const yt = (await page.locator('.pane-chart .uplot').first().getAttribute('data-ticks-y'))?.split('|') ?? [];
  check(yt.length >= 2 && new Set(yt).size === yt.length, `con zoom las marcas del eje Y son todas distintas (${yt.join(' ')})`);
  await page.getByRole('button', { name: /Zoom|Ver todo|Fit/i }).first().click().catch(() => {});
}
// #200 y #201: recuadro en X e Y, zoom sólo en X o sólo en Y, y el Y no se reajusta con el zoom en X
{
  const plot = page.locator('.pane-chart .uplot').first();
  const over = plot.locator('.u-over');
  await page.getByRole('button', { name: 'Ajustar a la vista', exact: true }).last().click();
  await page.waitForTimeout(200);
  const rng = async () => {
    const [x, y] = await Promise.all([plot.getAttribute('data-range-x'), plot.getAttribute('data-range-y')]);
    const [x0, x1] = x.split('|').map(Number);
    const [y0, y1] = y.split('|').map(Number);
    return { x: [x0, x1], y: [y0, y1], key: `${x}#${y}` };
  };
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const drag = async (fx0, fy0, fx1, fy1) => {
    const b = await over.boundingBox();
    await page.mouse.move(b.x + b.width * fx0, b.y + b.height * fy0);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * fx1, b.y + b.height * fy1, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  };
  const full = await rng();
  // recuadro: el rango de X e Y pasa a ser el recuadro (ocupa todo el gráfico)
  const b = await over.boundingBox();
  const at = async (fx, fy) => {
    // valor bajo un punto del gráfico, por la escala lineal de los rangos visibles
    const r = await rng();
    return [r.x[0] + (r.x[1] - r.x[0]) * fx, r.y[1] - (r.y[1] - r.y[0]) * fy];
  };
  const [bx0, by0] = await at(0.3, 0.2);
  const [bx1, by1] = await at(0.6, 0.7);
  await drag(0.3, 0.2, 0.6, 0.7);
  const box = await rng();
  const near = (a, b, ref) => Math.abs(a - b) < Math.abs(ref) * 0.02 + 1e-12;
  check(near(box.x[0], bx0, full.x[1] - full.x[0]) && near(box.x[1], bx1, full.x[1] - full.x[0]), `arrastrar un recuadro: X pasa al recuadro (${full.x} → ${box.x})`);
  check(near(box.y[0], by1, full.y[1] - full.y[0]) && near(box.y[1], by0, full.y[1] - full.y[0]), `arrastrar un recuadro: Y pasa al recuadro (${full.y} → ${box.y})`);
  // rueda: sólo X; el Y fijado por el recuadro queda
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(300);
  const w = await rng();
  check(!same(w.x, box.x) && same(w.y, box.y), `la rueda cambia sólo X y el Y fijado no se reajusta (${box.y} = ${w.y})`);
  // vuelta a ver todo: doble click; luego zoom en X sin recuadro previo: el Y tampoco se reajusta
  await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(300);
  const back = await rng();
  check(back.key === full.key, 'doble click: vuelve a ver todo (X e Y)');
  await drag(0.4, 0.4, 0.5, 0.4 + 5 / b.height);
  const hx = await rng();
  check(!same(hx.x, full.x) && same(hx.y, full.y), `arrastre casi horizontal: zoom sólo en X, el Y sigue (${full.y} = ${hx.y})`);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(300);
  check(same((await rng()).y, full.y), 'zoom en X con la rueda: el Y no se reajusta solo (#200)');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  check((await rng()).key === full.key, 'Espacio: vuelve a ver todo');
  await drag(0.5, 0.2, 0.5 + 5 / b.width, 0.7);
  const vy = await rng();
  check(same(vy.x, full.x) && !same(vy.y, full.y), `arrastre casi vertical: zoom sólo en Y, el X sigue (${full.y} → ${vy.y})`);
  await page.keyboard.press('Shift+Z');
  await page.waitForTimeout(300);
  check((await rng()).key === full.key, 'Shift+Z deshace el zoom en Y');
  await page.keyboard.down('Shift');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(300);
  const sw = await rng();
  check(same(sw.x, full.x) && !same(sw.y, full.y), `Shift+rueda: zoom sólo en Y (${full.y} → ${sw.y})`);
  await page.mouse.move(b.x - 25, b.y + b.height / 2);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(300);
  check(same((await rng()).x, full.x) && !same((await rng()).y, sw.y), 'rueda sobre el eje Y: zoom sólo en Y');
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
}
await page.getByRole('button', { name: 'Anotar OP' }).click();
const ann = await page.locator('.op-annotation').allTextContents();
check(ann.includes('1.415mA') && ann.includes('12V'), `anota el punto de operación (${ann.length} valores)`);
await page.screenshot({ path: `${OUT}/bias.png` });
await page.keyboard.press('Escape');
await page.keyboard.press('g');
const free = await at(560, 400);
await page.mouse.click(free.x, free.y);
await page.keyboard.press('Escape');
await page.mouse.move(q1.x, q1.y);
check((await page.locator('.bias-tip').count()) === 0 && (await page.locator('.op-annotation').count()) === 0, 'al editar el circuito los valores dejan de mostrarse');

// --- #13: elegir nodos y fuentes en el esquemático desde el menú de simulación ---
await page.keyboard.press('Control+z'); // sacar la tierra agregada
await simCommand(page, 'Ruido');
check(await page.locator('.analysis-list button.active', { hasText: 'Ruido' }).isVisible(), 'el comando de simulación se abre en el tipo elegido');
await page.getByRole('button', { name: 'Elegir Nodo de salida en el esquemático' }).click();
check(await page.locator('.pick-banner').isVisible(), 'el diálogo se oculta y pide elegir una red');
const outPick = await at(320, 128);
await page.mouse.move(outPick.x, outPick.y);
await page.mouse.click(outPick.x, outPick.y);
const outVal = await page.locator('.field', { hasText: 'Nodo de salida' }).locator('input').inputValue();
check(outVal === 'out', `click en el cable completa el nodo (${outVal})`);
await page.getByRole('button', { name: 'Elegir Fuente de entrada en el esquemático' }).click();
const rcBody = await at(256, 48); // una resistencia no es una fuente: no se elige
await page.mouse.click(rcBody.x, rcBody.y);
check(await page.locator('.pick-banner').isVisible(), 'una resistencia no se puede elegir como fuente');
const vin = await at(-80, 272);
await page.mouse.click(vin.x, vin.y);
const srcVal = await page.locator('.field', { hasText: 'Fuente de entrada' }).locator('input').inputValue();
check(srcVal === 'Vin', `click en la fuente la elige (${srcVal})`);
await page.getByRole('button', { name: 'Elegir Referencia en el esquemático' }).click();
await page.keyboard.press('Escape');
check(await page.locator('.modal').isVisible(), 'Esc cancela la elección y vuelve al diálogo');
check(/^\.noise V\(out\) Vin /.test(await page.locator('.sim-preview code').textContent()), `directiva: ${await page.locator('.sim-preview code').textContent()}`);
await page.getByRole('button', { name: 'Cancelar' }).click();

// --- #7: .step ---
await openExample(page, 'RC Sweep (.step)');
await page.locator('svg.editor .sym').first().waitFor();
await page.getByRole('button', { name: 'Correr' }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
check((await resultsView(page)) === 'Mediciones', 'con .meas y nada graficado, abre en Mediciones');
await page.locator('.results-panel').getByRole('button', { name: 'Resultados', exact: true }).click();
const stepPlots = await page.locator('select[aria-label="Plot"] option').allTextContents();
check(stepPlots.join() === 'tran1 (R=500),tran2 (R=1k),tran3 (R=2k),meas vs R', `una corrida por paso (${stepPlots.join(', ')})`);
await page.waitForTimeout(300);
const outStep = await at(288, -32);
await page.mouse.click(outStep.x, outStep.y);
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Medidas' }).click();
const series = await page.locator('.readout tbody tr td:first-child').allTextContents();
check(series.join() === 'V(out) · R=500,V(out) · R=1k,V(out) · R=2k', `cada paso identificado con su valor (${series.join(', ')})`);
await page.getByRole('button', { name: 'Medidas' }).click();
await page.screenshot({ path: `${OUT}/step.png` });
// .meas por corrida (#20): tiempo de subida 10-90 % = 2.2·RC
await resultsMenu(page, /^Mediciones/);
const measRows = await page.locator('.meas-table tbody tr').allTextContents();
check(
  measRows.length === 3 && /R=500.*1\.09\d*m/.test(measRows[0]) && /R=1k.*2\.19\d*m/.test(measRows[1]) && /R=2k.*4\.39\d*m/.test(measRows[2]),
  `tiempo de subida por paso = 2.2·RC (${measRows.join(' | ')})`,
);
check((await page.locator('.meas-table tfoot tr').count()) === 4, 'con media, σ, mínimo y máximo');
await page.locator('.results-panel').getByRole('button', { name: 'Resultados', exact: true }).click();
await page.getByRole('combobox', { name: 'Plot' }).selectOption('meas vs R');
await page.getByLabel('Expresión').fill('trise');
await page.keyboard.press('Enter');
await page.getByRole('button', { name: 'Medidas' }).click();
const vsR = await page.locator('.readout tbody tr').first().locator('td').allTextContents();
check(vsR[0] === 'trise' && /^1\.09\d*m @ 500$/.test(vsR[1]) && /^4\.39\d*m @ 2k$/.test(vsR[2]), `medición en función del parámetro barrido (${vsR.slice(0, 3).join(', ')})`);
await page.getByRole('button', { name: 'Medidas' }).click();

// --- #3, #14, #12: visor de resultados, vista recordada y exportaciones ---
const downloaded = async (action) => {
  const [d] = await Promise.all([page.waitForEvent('download'), action()]);
  return { name: d.suggestedFilename(), text: readFileSync(await d.path(), 'utf8') };
};
await page.setViewportSize({ width: 1600, height: 1100 }); // lugar para dos paneles sin scroll
await openExample(page, 'RLC Bode');
await page.locator('svg.editor .sym').first().waitFor();
await page.getByRole('button', { name: 'Correr' }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
await page.waitForTimeout(300);
const outAc = await at(272, -32);
await page.mouse.click(outAc.x, outAc.y);
await page.getByRole('button', { name: 'Medidas' }).click();
const rowNames = () => page.locator('.readout tbody tr td:first-child').allTextContents();
check((await rowNames()).join() === 'V(out),V(out) (fase)', `Bode: magnitud y fase a la vez (${await rowNames()})`);
const peak = await page.locator('.readout tbody tr').first().locator('td').nth(2).textContent();
// f0 = 5.03 kHz; con Q ≈ 3.2 el máximo de |V(out)| cae en f0·√(1−1/2Q²) ≈ 4.9 kHz
check(/@ 4\.9\d*k|@ 4\.89\d*k/.test(peak), `pico de resonancia cerca de 4.9 kHz (${peak})`);
await page.getByRole('button', { name: 'Medidas' }).click();

// #51: el "+" del borde inferior del último panel agrega uno debajo (y queda activo)
await page.locator('.pane').last().hover({ position: { x: 200, y: 5 } });
await page.getByRole('button', { name: 'Agregar panel' }).click();
check((await page.locator('.pane').count()) === 2, 'el + del borde agrega un panel debajo');
await page.getByLabel('Expresión').fill('V(out)/V(n001)');
await page.keyboard.press('Enter');
const paneChips = (i) => page.locator('.pane').nth(i).locator('.trace-chip .name').allTextContents();
check((await paneChips(1)).join() === 'V(out)/V(n001)', `expresión en el panel nuevo (${await paneChips(1)})`);
await page.getByLabel('Expresión').fill('V(nada)');
await page.keyboard.press('Enter');
check(/no existe/.test(await page.locator('.expr-form .hint.warn').textContent()), 'una expresión inválida avisa y no se agrega');
await page.getByLabel('Expresión').fill('');
await page.locator('.pane').nth(1).locator('.trace-chip').dragTo(page.locator('.pane').nth(0).locator('.pane-chart'));
check((await paneChips(0)).join() === 'V(out),V(out)/V(n001)', `arrastrar una traza la pasa a otro panel (${await paneChips(0)})`);
await page.getByRole('button', { name: 'Quitar panel' }).nth(1).click();
check((await page.locator('.pane').count()) === 1, 'se puede quitar un panel');
{
  // #51: la punta de prueba no des-plotea; los colores no cambian al quitar una traza
  const swatches = () => page.locator('.pane').first().locator('.trace-chip .swatch').evaluateAll((l) => l.map((e) => getComputedStyle(e).backgroundColor));
  const [cOut, cDiv] = await swatches();
  await page.mouse.click(outAc.x, outAc.y);
  await page.waitForTimeout(200);
  check((await paneChips(0)).join() === 'V(out),V(out)/V(n001)', `volver a medir un nodo ya graficado no lo quita (${await paneChips(0)})`);
  await page.locator('.trace-chip .x').first().click();
  check((await swatches()).join() === cDiv, `al quitar V(out) la otra conserva su color (${await swatches()} vs ${cDiv})`);
  await page.mouse.click(outAc.x, outAc.y);
  await page.waitForTimeout(200);
  check((await swatches()).join() === `${cDiv},${cOut}`, 'V(out) vuelve con su color (el que quedó libre)');
  const rb = await page.locator('.results-panel').boundingBox();
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  check((await paneChips(0)).join() === 'V(out),V(out)/V(n001)', 'Ctrl+Z vuelve a como estaba');
  // con el foco en la caja de trazas, la punta de prueba escribe en ella
  await page.getByLabel('Expresión').click();
  await page.mouse.click(outAc.x, outAc.y);
  check((await page.getByLabel('Expresión').inputValue()) === 'V(out)' && (await paneChips(0)).length === 2, 'con el foco en la caja, click en un nodo escribe su nombre');
  await page.getByLabel('Expresión').fill('');
  await page.getByLabel('Expresión').blur();
}

await page.getByRole('button', { name: 'Cursores' }).click();
const cb = await page.locator('.pane-chart').first().boundingBox();
{
  // #51: con los resultados abajo, cursores y medidas van a la derecha de los paneles
  const panesBox = await page.locator('.plot-main > .panes').boundingBox();
  const ro = page.locator('.plot-main.beside > .readouts');
  check((await ro.count()) === 1 && (await ro.boundingBox()).x >= panesBox.x + panesBox.width - 1, 'cursores a la derecha de los paneles');
}
{
  // #51: antes de fijarlo, el cursor A sigue al mouse (línea y tabla preliminares)
  const cp = await page.locator('.pane-chart').first().boundingBox();
  await page.mouse.move(cp.x + cp.width * 0.3, cp.y + cp.height / 2, { steps: 3 });
  await page.waitForTimeout(150);
  const h1 = await page.locator('.readout td.preview').textContent();
  await page.mouse.move(cp.x + cp.width * 0.6, cp.y + cp.height / 2, { steps: 3 });
  await page.waitForTimeout(150);
  const h2 = await page.locator('.readout td.preview').textContent();
  check(!!h1 && h1 !== h2, `cursor A preliminar sigue al mouse (${h1} → ${h2})`);
}
await page.mouse.click(cb.x + cb.width * 0.3, cb.y + cb.height / 2);
await page.waitForTimeout(400); // que no cuente como doble click
// al aparecer la tabla de cursores el gráfico se achica: volver a medirlo
const cb2 = await page.locator('.pane-chart').first().boundingBox();
// #234: el segundo click (izquierdo) fija el B
await page.mouse.click(cb2.x + cb2.width * 0.7, cb2.y + cb2.height / 2);
await page.waitForTimeout(100);
const head = await page.locator('.readout thead').textContent();
const dxRow = await page.locator('.readout tr.dx').textContent();
check(/Trace|Traza/.test(head) && /A − B/.test(head) && !/\(/.test(head) && /Hz/.test(dxRow), `cursores A y B con Δ y 1/Δ en la fila del tiempo (${head} | ${dxRow})`);
await page.screenshot({ path: `${OUT}/plot-panel.png` });
// #30: el gráfico no se recrea por estado ajeno a los datos (marca en el canvas de uPlot)
const canvas = page.locator('.pane-chart canvas').first();
await canvas.evaluate((c) => (c.dataset.e2e = 'mismo'));
await page.locator('.trace-chip').first().hover();
await page.locator('.pane-chart').first().hover();
await page.locator('.pane').first().click({ position: { x: 5, y: 5 } });
check((await canvas.evaluate((c) => c.dataset.e2e).catch(() => undefined)) === 'mismo', 'el gráfico no se recrea al pasar por una traza ni al activar el panel');
// clicks seguidos y rápidos (sin esperar el doble click) cerca del A mueven siempre el A (el más cercano)
// (el lugar del valor queda reservado: sin cursor dice "—")
const cursorHead = async (k) => {
  const v = (await page.locator(`.readout tr.dx td.x${k.toLowerCase()}`).textContent())?.trim();
  return v && v !== '—' ? v : undefined;
};
const headA = () => cursorHead('A');
const headB = () => cursorHead('B');
const bBefore = await headB();
let placed = 0;
let lastA = await headA();
for (let k = 0; k < 20; k++) {
  const r = await page.locator('.pane-chart').first().boundingBox();
  await page.mouse.click(r.x + r.width * (0.1 + 0.01 * k), r.y + r.height * 0.4);
  const now = await headA();
  if (now && now !== lastA) placed++;
  lastA = now;
}
check(placed === 20 && (await headB()) === bBefore, `20 clicks seguidos mueven siempre el cursor A (${placed}/20) y no el B`);
// arrastrar el cursor B actualiza la tabla en vivo
const rb = await page.locator('.pane-chart').first().boundingBox();
await page.mouse.click(rb.x + rb.width * 0.8, rb.y + rb.height / 2); // el más cercano: B
const b0 = await headB();
const dx0 = await page.locator('.readout tr.dx').textContent();
await page.mouse.move(rb.x + rb.width * 0.8, rb.y + rb.height / 2);
await page.mouse.down();
await page.mouse.move(rb.x + rb.width * 0.6, rb.y + rb.height / 2, { steps: 8 });
const bMid = await headB();
await page.mouse.move(rb.x + rb.width * 0.5, rb.y + rb.height / 2, { steps: 4 });
await page.mouse.up();
const b1 = await headB();
check(b0 !== bMid && bMid !== b1 && lastA === (await headA()) && dx0 !== (await page.locator('.readout tr.dx').textContent()), `arrastrar el cursor B lo mueve en vivo (${b0} → ${bMid} → ${b1}), A queda`);
// flechas: punto a punto; borrar e intercambiar
await page.keyboard.press('ArrowRight');
check((await headB()) !== b1, `flecha → mueve el cursor B un punto (${await headB()})`);
await page.getByLabel('Traza del cursor A').selectOption({ index: 1 });
check(/followed/.test((await page.locator('.readout tbody tr').first().getAttribute('class')) ?? ''), 'el cursor A sigue una traza');
const [a2, b2] = [await headA(), await headB()];
await page.getByRole('button', { name: 'A ⇄ B' }).click();
check((await headA()) === b2 && (await headB()) === a2, 'intercambiar A y B');
await page.getByRole('button', { name: 'Borrar B' }).click();
check((await headB()) === undefined && (await headA()) === b2, 'borrar el cursor B');
await page.getByRole('button', { name: 'Cursores' }).click();

const csv = await downloaded(() => resultsMenu(page, 'Exportar', 'Trazas a CSV'));
check(csv.text.startsWith('frequency,V(out),V(out) (fase),V(out)/V(n001),V(out)/V(n001) (fase)\n'), `CSV (${csv.name}): ${csv.text.split('\n')[0]}`);
const png = await downloaded(() => resultsMenu(page, 'Exportar', 'Gráfico a PNG'));
check(png.name === 'Examples.png' && png.text.length > 1000, 'gráfico a PNG');

// #51: ya no hay "Recordar vista" (la vista se guarda siempre con la simulación)
check((await page.getByRole('button', { name: /Recordar vista|Vista recordada/ }).count()) === 0, 'sin botón Recordar vista');
await page.getByRole('button', { name: 'Correr' }).click();
await page.waitForTimeout(500);
check((await paneChips(0)).join() === 'V(out),V(out)/V(n001)', `al volver a simular se conserva la vista (${await paneChips(0)})`);
const plt = await downloaded(() => resultsMenu(page, 'Exportar', 'Vista a .plt (LTspice)'));
check(plt.name === 'Examples.plt' && plt.text.includes('[AC Analysis]') && plt.text.includes('"V(out)/V(n001)"'), `vista a .plt de LTspice (${plt.name})`);
await page.locator('input[type=file][accept=".plt"]').setInputFiles({
  name: 'x.plt',
  mimeType: 'text/plain',
  buffer: Buffer.from('[AC Analysis]\r\n{\r\n   Npanes: 2\r\n   {\r\n      traces: 1 {524290,0,"V(out)"}\r\n   },\r\n   {\r\n      traces: 1 {524291,0,"V(n002)"}\r\n   }\r\n}\r\n'),
});
await page.locator('.pane').nth(1).waitFor();
check((await page.locator('.pane').count()) === 2 && (await paneChips(1)).join() === 'V(n002)', `importar un .plt de LTspice aplica sus paneles (${await paneChips(0)} | ${await paneChips(1)})`);
await page.getByRole('button', { name: 'Compartir' }).click();
const viewLink = await page.locator('.modal input[aria-label="Enlace"]').inputValue();
check(!viewLink.includes('&v='), 'el link ya no lleva la vista aparte (va dentro del .asc)');
await page.getByRole('button', { name: 'Listo', exact: true }).click();
{
  // #26: el link (o el .asc) abierto en otro navegador trae la vista y se aplica al simular
  const other = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await skipWelcome(other);
  const op = await other.newPage();
  watch(op);
  await op.goto(viewLink);
  await op.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });
  await op.locator('svg.editor .sym').first().waitFor();
  check((await op.locator('svg.editor text', { hasText: '.plot ' }).count()) === 0, 'el comentario ;.plot no se dibuja');
  await op.getByRole('button', { name: 'Correr' }).click();
  await op.locator('.pane').nth(1).waitFor({ timeout: 30000 });
  const chips = (i) => op.locator('.pane').nth(i).locator('.trace-chip .name').allTextContents();
  check((await op.locator('.pane').count()) === 2 && (await chips(1)).join() === 'V(n002)', `en otro navegador, el link trae la vista (${await chips(0)} | ${await chips(1)})`);
  await other.close();
}

const svgOut = await downloaded(() => menu(page, 'Archivo', 'Exportar esquemático a SVG'));
check(svgOut.name === 'Examples.svg' && svgOut.text.includes('<svg') && svgOut.text.includes('>R1<') && !svgOut.text.includes('class='), `esquemático a SVG autónomo (${svgOut.text.length} bytes)`);
const net = await downloaded(() => menu(page, 'Archivo', 'Exportar netlist de LTspice (.net)'));
check(/^R1 N002 N001 10$/m.test(net.text) && net.text.includes('.backanno'), `netlist de LTspice (.net): ${net.text.split('\n')[1]}`);
await resultsMenu(page, 'Netlist');
const cir = await downloaded(() => resultsMenu(page, 'Exportar', 'Netlist .cir (ngspice)'));
check(cir.text.includes('.ac dec 100 100 100k'), 'netlist de ngspice (.cir)');
await page.locator('.results-panel').getByRole('button', { name: 'Resultados', exact: true }).click();

// .pz en el plano s
await simCommand(page, 'Polos y ceros');
const pzField = (label) => page.locator('.field', { hasText: label }).locator('input');
await pzField('Entrada +').fill('N001');
await pzField('Entrada −').fill('0');
await pzField('Salida +').fill('out');
await pzField('Salida −').fill('0');
await page.getByRole('button', { name: 'Aceptar' }).click();
await page.getByRole('button', { name: 'Correr' }).click();
await page.locator('.pz-plane').waitFor({ timeout: 30000 });
const pzRows = await page.locator('.pz-view tbody tr').allTextContents();
check(pzRows.length === 2 && pzRows.every((r) => /polo/.test(r) && /5\.03\d*kHz/.test(r) && /3\.16/.test(r)), `.pz: dos polos con f0 = 5.03 kHz y Q = 3.16 (${pzRows.join(' | ')})`);
await page.screenshot({ path: `${OUT}/pz.png` });

// #31: con .ac y ;.pz el mapa de polos y ceros se abre solo; con .step se superponen las corridas
const rlcAsc = (extra, r = '10') =>
  [
    'Version 4', 'SHEET 1 880 680', 'WIRE 0 16 0 -32', 'WIRE 0 -32 16 -32', 'WIRE 96 -32 112 -32', 'WIRE 192 -32 256 -32',
    'FLAG 256 -32 out', 'FLAG 0 96 0', 'FLAG 192 32 0',
    'SYMBOL voltage 0 0 R0', 'SYMATTR InstName V1', 'SYMATTR Value AC 1',
    'SYMBOL res 112 -48 R90', 'SYMATTR InstName R1', `SYMATTR Value ${r}`,
    'SYMBOL ind 208 -48 R90', 'SYMATTR InstName L1', 'SYMATTR Value 1m',
    'SYMBOL cap 176 -32 R0', 'SYMATTR InstName C1', 'SYMATTR Value 1u',
    'TEXT 0 160 Left 2 !.ac dec 100 100 100k', 'TEXT 0 192 Left 2 ;.pz N001 0 out 0 vol pz',
    ...extra.map((t, i) => `TEXT 0 ${224 + 32 * i} Left 2 ${t}`),
  ].join('\n') + '\n';
const pzp = await context.newPage();
watch(pzp);
await pzp.goto(URL);
await pzp.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });
const dropAsc = (name, text) =>
  pzp.evaluate(([n, t]) => {
    const dt = new DataTransfer();
    dt.items.add(new File([t], n));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, [name, text]);
await dropAsc('RLC pz.asc', rlcAsc([]));
await pzp.waitForFunction(() => document.querySelector('.capsule-project')?.textContent === 'RLC pz');
await pzp.getByRole('button', { name: 'Correr' }).click();
await pzp.locator('.pz-plane').waitFor({ timeout: 30000 });
check((await pzp.getByRole('combobox', { name: 'Plot' }).inputValue()) === 'pz1', 'con .ac y .pz se abre el mapa de polos y ceros');
const pole = await pzp.locator('.pz-plane path.pole').first().boundingBox();
await pzp.mouse.move(pole.x + pole.width / 2, pole.y + pole.height / 2);
const pzTip = await pzp.locator('.pz-tip').textContent().catch(() => '');
check(/5\.03\d*kHz/.test(pzTip) && /Q = 3\.16/.test(pzTip) && /ζ = 0\.158/.test(pzTip) && /τ = /.test(pzTip), `hover sobre un polo: f₀, Q, ζ, τ (${pzTip})`);
check((await pzp.locator('.pz-table tr.hl').count()) === 1, 'el polo bajo el mouse se resalta en la tabla');
const span0 = await pzp.locator('.pz-plane text').allTextContents();
await pzp.mouse.wheel(0, -400);
await pzp.waitForTimeout(100);
check((await pzp.locator('.pz-plane text').allTextContents()).join() !== span0.join(), 'zoom con la rueda (cambia la escala)');
await pzp.locator('.pz-view').getByRole('button', { name: 'Ajustar' }).click();
const [pzDl] = await Promise.all([pzp.waitForEvent('download'), pzp.getByRole('combobox', { name: 'Exportar polos y ceros' }).selectOption('csv')]);
const pzCsv = { name: pzDl.suggestedFilename(), text: readFileSync(await pzDl.path(), 'utf8') };
check(pzCsv.name === 'RLC pz.csv' && pzCsv.text.split('\n').filter(Boolean).length === 3 && pzCsv.text.startsWith('corrida,tipo'), `tabla de polos y ceros a CSV (${pzCsv.name})`);
await pzp.getByRole('combobox', { name: 'Plot' }).selectOption('ac1');
await pzp.locator('.pz-view.compact .pz-plane').waitFor();
await pzp.getByLabel('Expresión', { exact: true }).fill('V(out)');
await pzp.getByRole('button', { name: 'Agregar traza', exact: true }).click();
await pzp.locator('.pane-chart').first().waitFor();
check((await pzp.getByRole('checkbox', { name: 'Polos y ceros' }).isChecked()) && (await pzp.locator('.pz-view.compact path.pole').count()) === 2, 'en el Bode, el mapa de polos y ceros al lado');
await pzp.screenshot({ path: `${OUT}/pz-bode.png` });
await dropAsc('RLC pz step.asc', rlcAsc(['!.step param R list 10 20 40'], '{R}'));
await pzp.waitForFunction(() => document.querySelector('.capsule-project')?.textContent === 'RLC pz step');
await pzp.getByRole('button', { name: 'Correr' }).click();
await pzp.locator('.pz-legend li').first().waitFor({ timeout: 30000 });
const legend = await pzp.locator('.pz-legend li').allTextContents();
check(legend.length === 3 && /R=20/.test(legend[1]), `.pz con .step: corridas superpuestas con leyenda (${legend.join(', ')})`);
check((await pzp.locator('.pz-table tbody tr').count()) === 6, 'dos polos por corrida');
await pzp.screenshot({ path: `${OUT}/pz-step.png` });
await pzp.close();
await page.keyboard.press('Control+z');
await page.getByRole('button', { name: 'Correr' }).click();
await page.locator('.pane-chart').first().waitFor({ timeout: 30000 });
await page.getByRole('combobox', { name: 'Vista' }).selectOption('smith');
check((await page.locator('.smith polyline.trace').count()) === 2, 'carta de Smith con las trazas complejas');
await page.screenshot({ path: `${OUT}/smith.png` });
await page.getByRole('combobox', { name: 'Vista' }).selectOption('bode');

// --- #4: interfaz ---
await page.setViewportSize({ width: 1600, height: 800 });
// #36: los resultados no se cierran, se colapsan y se vuelven a mostrar intactos
const resultsState = async () =>
  JSON.stringify({
    // (con un solo plot no hay desplegable)
    plots: await page.locator('select[aria-label="Plot"]').count(),
    vista: await page.getByRole('combobox', { name: 'Vista' }).inputValue(),
    trazas: await page.locator('.trace-chip .name').allTextContents(),
    paneles: await page.locator('.pane').count(),
  });
const shownBefore = await resultsState();
check((await page.getByRole('button', { name: 'Cerrar resultados' }).count()) === 0, 'no hay botón para cerrar (descartar) los resultados');
await page.keyboard.press('Control+1');
check(
  !(await page.locator('.results-panel').isVisible()) && (await page.getByRole('button', { name: 'Mostrar resultados' }).isVisible()),
  'ocultar resultados colapsa el panel y deja la pestaña para mostrarlos',
);
const viewBtn = (name) => page.getByRole('navigation', { name: 'Vistas' }).getByRole('button', { name, exact: true });
check((await viewBtn('Resultados').getAttribute('aria-pressed')) === 'false', 'arriba, Resultados queda apagado');
await viewBtn('Resultados').click();
await page.locator('.results-panel').waitFor();
check((await resultsState()) === shownBefore, `al mostrarlos de nuevo, los resultados siguen intactos (${shownBefore})`);
// #55: un click siempre suma. Con las dos vistas, click en una la deja a pantalla completa…
await viewBtn('Resultados').click();
check((await page.locator('.workspace.expand-results').count()) === 1 && (await viewBtn('Esquemático').getAttribute('aria-pressed')) === 'false', 'con las dos, click en Resultados la deja a pantalla completa');
await viewBtn('Resultados').click();
check((await page.locator('.workspace.expand-results').count()) === 1, 'otro click en la que está sola no cambia nada');
// …y click en la que no se ve la agrega en pantalla partida
await viewBtn('Esquemático').click();
check((await page.locator('.workspace').getAttribute('class')) === 'workspace', 'click en Esquemático (oculto) vuelve a pantalla partida');
await viewBtn('Esquemático').click();
check((await page.locator('.workspace.expand-schematic').count()) === 1 && (await viewBtn('Resultados').getAttribute('aria-pressed')) === 'false', 'click en Esquemático lo deja a pantalla completa');
const blue = await viewBtn('Esquemático').evaluate((b) => getComputedStyle(b).backgroundColor);
const dark = await viewBtn('Resultados').evaluate((b) => getComputedStyle(b).backgroundColor);
check(blue !== dark, `la vista que se muestra se distingue por color (${blue} / ${dark})`);
await viewBtn('Resultados').click();
check((await page.locator('.workspace').getAttribute('class')) === 'workspace', 'con los dos prendidos, pantalla partida');
await page.getByRole('button', { name: 'Resultados al costado' }).click();
check((await page.locator('.workspace.side').count()) === 1 && (await page.getByRole('button', { name: 'Resultados al costado' }).getAttribute('aria-pressed')) === 'true', 'el botón de disposición pone los resultados al costado');
await page.getByRole('button', { name: 'Resultados abajo' }).click();
check((await page.locator('.workspace.side').count()) === 0, 'y el otro, abajo');
await menu(page, 'Ver', 'Panel de resultados');
check(!(await page.locator('.results-panel').isVisible()), 'Ver › Panel de resultados también los colapsa');
await page.getByRole('button', { name: 'Mostrar resultados' }).click();
check((await resultsState()) === shownBefore, 'y la pestaña del borde los vuelve a mostrar');
await page.keyboard.press('Control+1');
await page.keyboard.press('?');
check(await page.getByRole('dialog', { name: 'Atajos de teclado' }).isVisible(), '"?" muestra los atajos');
await page.keyboard.press('Escape');
const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
await page.getByRole('button', { name: 'Cambiar tema' }).click();
const t1 = await theme();
await page.getByRole('button', { name: 'Cambiar tema' }).click();
const t2 = await theme();
await page.getByRole('button', { name: 'Cambiar tema' }).click();
check(t1 === 'light' && t2 === 'dark' && (await theme()) === null, `tema claro → oscuro → automático (${t1}, ${t2})`);

// copiar y pegar
const syms = () => page.locator('svg.editor .symbols .sym').count();
const nSyms = await syms();
await page.keyboard.press('Escape');
const r1 = await at(88, -32);
await page.mouse.click(r1.x, r1.y);
await page.keyboard.press('Control+c');
const dest = await at(480, 160);
await page.mouse.move(dest.x, dest.y);
await page.keyboard.press('Control+v');
// con los resultados colapsados (no descartados) el pegado puede tardar un poco más en dibujarse
await page.waitForFunction((n) => document.querySelectorAll('svg.editor .symbols .sym').length === n, nSyms + 1, { timeout: 3000 }).catch(() => {});
check((await syms()) === nSyms + 1, 'Ctrl+C / Ctrl+V pega una copia');
check((await page.locator('svg.editor .sym.sel text.win').allTextContents()).includes('R2'), 'la copia recibe un nombre nuevo (R2)');
await page.keyboard.press('Control+a');
check((await page.locator('svg.editor .sym.sel').count()) === nSyms + 1, 'Ctrl+A selecciona todo');
await page.keyboard.press('Control+z');

// mover un rótulo
await page.mouse.click(r1.x, r1.y);
const label = page.locator('svg.editor .sym.sel text.win', { hasText: /^R1$/ });
const y0 = Number(await label.getAttribute('y'));
const lp = await at(88, -56);
const lq = await at(88, -88);
await page.mouse.move(lp.x, lp.y);
await page.mouse.down();
await page.mouse.move(lq.x, lq.y, { steps: 5 });
await page.mouse.up();
const y1 = Number(await page.locator('svg.editor .sym text.win', { hasText: /^R1$/ }).getAttribute('y'));
check(y1 === y0 - 32, `arrastrar el rótulo de un componente seleccionado lo mueve (${y0} → ${y1})`);
check((await syms()) === nSyms, 'sin mover el componente');
await page.keyboard.press('Control+z');

// valores amigables: 4k7
await page.mouse.dblclick(r1.x, r1.y);
await page.locator('.modal label.attr-row input:not([type=checkbox])').nth(1).fill('4k7');
check((await page.locator('.modal .attrs small').textContent()) === '4.7kΩ', 'el diálogo interpreta 4k7');
await page.keyboard.press('Enter');
check((await page.locator('svg.editor .sym text.win', { hasText: '4.7k' }).count()) === 1, 'y lo guarda como 4.7k (compatible con LTspice)');

// panel de problemas con link al componente
await page.keyboard.press('r');
const free2 = await at(400, 64);
await page.mouse.click(free2.x, free2.y);
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Correr' }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
await resultsMenu(page, /^Problemas/);
const prob = page.locator('.problems li', { hasText: 'R2 no tiene valor asignado' });
check((await prob.count()) === 1, 'Problemas lista el componente sin valor');
await prob.getByRole('button', { name: 'ver en el esquemático' }).click();
check((await page.locator('svg.editor .sym.sel text.win').allTextContents()).includes('R2'), 'y el link lo selecciona en el esquemático');

// resultados al costado
await menu(page, 'Ver', 'Resultados al costado');
check(await page.locator('.workspace.side .results-panel').isVisible(), 'resultados al costado');
await page.screenshot({ path: `${OUT}/side.png` });

// --- #24: expandir esquemático / resultados (al costado y abajo) ---
const splitter = page.locator('.splitter');
const rect = (sel) => page.locator(sel).boundingBox();
for (const where of ['al costado', 'abajo']) {
  const dim = where === 'abajo' ? 'height' : 'width';
  const before = (await rect('.results-panel'))[dim];
  check(!(await page.getByRole('button', { name: 'Expandir resultados' }).isVisible()), `${where}: los botones no se ven sin hover`);
  await splitter.hover();
  check(await page.getByRole('button', { name: 'Expandir esquemático' }).isVisible(), `${where}: el hover sobre el divisor muestra los botones`);
  await page.screenshot({ path: `${OUT}/expand-${where === 'abajo' ? 'bottom' : 'side'}.png` });
  await page.getByRole('button', { name: 'Expandir resultados' }).click();
  check(!(await page.locator('.canvas-wrap').isVisible()) && (await rect('.results-panel'))[dim] > before + 100, `${where}: Expandir resultados oculta el esquemático`);
  await page.getByRole('button', { name: 'Mostrar esquemático' }).click();
  check(Math.abs((await rect('.results-panel'))[dim] - before) < 2, `${where}: restaurar vuelve al mismo tamaño (${before})`);
  await page.keyboard.press('Control+1');
  check(!(await page.locator('.results-panel').isVisible()) && (await page.getByRole('button', { name: 'Mostrar resultados' }).isVisible()), `${where}: Ctrl+1 deja sólo el esquemático, con pestaña para restaurar`);
  await page.keyboard.press('Control+0');
  check(Math.abs((await rect('.results-panel'))[dim] - before) < 2, `${where}: Ctrl+0 restaura`);
  await page.keyboard.press('Control+2');
  check(!(await page.locator('.canvas-wrap').isVisible()), `${where}: Ctrl+2 deja sólo los resultados`);
  await page.keyboard.press('Control+0');
  const ws = (await rect('.workspace'))[dim];
  await splitter.dblclick({ position: { x: 1, y: 1 } });
  check(Math.abs((await rect('.results-panel'))[dim] - ws / 2) < 4, `${where}: doble click en el divisor lleva a 50 %`);
  await splitter.dblclick({ position: { x: 1, y: 1 } });
  check(Math.abs((await rect('.results-panel'))[dim] - before) < 2, `${where}: otro doble click vuelve a la división guardada`);
  if (where === 'al costado') await menu(page, 'Ver', 'Resultados al costado'), await page.waitForTimeout(500);
}
// simular con el esquemático expandido muestra los resultados
await page.keyboard.press('Control+1');
await page.getByRole('button', { name: 'Correr' }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
await page.locator('.results-panel').waitFor({ timeout: 10000 });
check(await page.locator('.results-panel').isVisible(), 'simular con el esquemático expandido muestra los resultados');

// --- #11: símbolos, modelos y bloques del usuario ---
await menu(page, 'Archivo', 'Mis símbolos y modelos…');
const block = 'Version 4\nSHEET 1 880 680\nWIRE 16 96 16 112\nFLAG 16 16 in\nIOPIN 16 16 In\nFLAG 16 112 out\nIOPIN 16 112 Out\nFLAG 16 192 0\nSYMBOL res 0 0 R0\nSYMATTR InstName R1\nSYMATTR Value 1k\nSYMBOL res 0 96 R0\nSYMATTR InstName R2\nSYMATTR Value {R}\nTEXT 0 240 Left 2 !.param R=2k\n';
const libText = '* amplificador de ganancia 3\n.subckt amp3 in out\nE1 out 0 in 0 3\n.ends amp3\n';
await page.getByLabel('Archivos de símbolos y modelos').setInputFiles([
  { name: 'div.asc', mimeType: 'text/plain', buffer: Buffer.from(block) },
  { name: 'amps.lib', mimeType: 'text/plain', buffer: Buffer.from(libText) },
]);
await page.getByRole('button', { name: 'Crear símbolo de bloque' }).click();
await page.getByRole('button', { name: 'Crear símbolo de amp3' }).click();
const ufText = await page.locator('.modal').textContent();
check(/✓ símbolo de bloque/.test(ufText) && /✓ amp3/.test(ufText) && /div\.asy/.test(ufText) && /amp3\.asy/.test(ufText), 'agregar un bloque .asc y un .lib, y crear sus símbolos');
await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
await page.keyboard.press('p');
await page.locator('.modal input').fill('amp3');
check((await page.locator('.picker-list li', { hasText: 'Mis símbolos' }).filter({ hasText: 'amp3' }).count()) === 1, 'los símbolos propios aparecen en el buscador');
await page.keyboard.press('Escape');
// circuito que usa los dos: V1=3 → div (2 V) → amp3 (6 V)
const top = 'Version 4\nSHEET 1 880 680\nWIRE -96 -16 -96 0\nWIRE -96 0 -32 0\nWIRE 32 0 96 0\nWIRE 160 0 224 0\nFLAG -96 64 0\nFLAG 32 0 b\nFLAG 224 0 c\nSYMBOL voltage -96 -32 R0\nSYMATTR InstName V1\nSYMATTR Value 3\nSYMBOL div 0 0 R0\nSYMATTR InstName X1\nSYMBOL amp3 128 0 R0\nSYMATTR InstName X2\nTEXT -96 128 Left 2 !.op\n';
await page.getByRole('button', { name: 'Nuevo' }).click();
await page.evaluate((t) => navigator.clipboard.writeText(t), top);
await page.keyboard.press('Control+v');
await page.getByRole('button', { name: 'Correr' }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
const opRows = await page.locator('.result-table tbody tr').allTextContents();
check(opRows.includes('V(b)2') && opRows.includes('V(c)6'), `jerarquía y subcircuito propio simulan (${opRows.filter((r) => /^V\((b|c)\)/.test(r)).join(', ')})`);
await resultsMenu(page, 'Netlist');
check((await page.locator('.results-body pre').textContent()).includes('.subckt div in out'), 'el bloque es un .subckt en la netlist');
await page.keyboard.press('Control+1');

// --- #16-#20: Estudio (barrido + medición + tolerancias, ver código) ---
await openExample(page, 'RC Filter');
await page.locator('svg.editor .sym').first().waitFor();
await page.keyboard.press('Alt+e');
await page.getByRole('button', { name: '+ Barrido' }).click();
await page.getByRole('button', { name: 'Elegir Componente en el esquemático' }).click();
const rcR1 = await at(120, -32);
await page.mouse.click(rcR1.x, rcR1.y);
check((await page.locator('.modal').getByLabel('Componente', { exact: true }).inputValue()) === 'R1', 'barrido: el componente se elige con un click');
check(await page.getByText('Valor original: 1k').isVisible(), 'y se toma su valor original');
await page.getByLabel('Valores').fill('500 1k 2k');
await page.getByRole('button', { name: '+ Medición' }).click();
await page.getByLabel('Qué medir').selectOption('rise');
await page.getByRole('button', { name: 'Elegir Señal en el esquemático' }).click();
const rcOut = await at(272, -32);
await page.mouse.click(rcOut.x, rcOut.y);
await page.getByLabel('Desde el nivel').fill('0.1');
await page.getByLabel('Hasta el nivel').fill('0.9');
check((await page.locator('.study-line').last().textContent()) === '.meas tran m1 TRIG V(out) VAL=0.1 RISE=1 TARG V(out) VAL=0.9 RISE=1', 'medición: genera el .meas');
check(await page.getByText('3 corridas en total').isVisible(), 'muestra el total de corridas');
await page.getByRole('button', { name: 'Ver código' }).click();
const code = await page.getByLabel('Código del estudio').inputValue();
check(code.startsWith('.param R1=1k\n.step param R1 list 500 1k 2k\n.meas tran m1'), `ver código (${code.split('\n').length} líneas)`);
await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
check((await page.locator('svg.editor .sym text.win', { hasText: '{R1}' }).count()) === 1, 'R1 pasa a valer {R1}');
await page.getByRole('button', { name: 'Correr' }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
await resultsMenu(page, /^Mediciones/);
const studyRows = await page.locator('.meas-table tbody tr').allTextContents();
check(studyRows.length === 3 && /R1=1k.*2\.19\d*m/.test(studyRows[1]), `simula el estudio (${studyRows.join(' | ')})`);
// reabrir: las tarjetas se reconstruyen desde las directivas; agregar tolerancias Monte Carlo
await page.keyboard.press('Alt+e');
// (la tarjeta de simulación del .tran, el barrido y la medición)
check((await page.locator('.study-card').count()) === 3 && (await page.getByLabel('Valores').inputValue()) === '500 1k 2k', 'al reabrir, las tarjetas se reconstruyen');
await page.getByLabel('Activar Barrido de R1').uncheck();
await page.getByRole('button', { name: '+ Tolerancias' }).click();
await page.getByRole('button', { name: 'Todos los capacitores 10 %' }).click();
await page.getByLabel('Corridas').fill('30');
check(await page.getByText('30 corridas en total').isVisible(), 'el barrido desactivado no cuenta');
await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
check((await page.locator('svg.editor .sym text.win', { hasText: '{mc(1u,0.1)}' }).count()) === 1, 'C1 con tolerancia: {mc(1u,0.1)}');
check((await page.locator('svg.editor .texts .comment', { hasText: '.step param R1 list 500 1k 2k' }).count()) === 1, 'el barrido desactivado queda como comentario');
await page.getByRole('button', { name: 'Correr' }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
await resultsMenu(page, /^Mediciones/);
const mcRows = await page.locator('.meas-table tbody tr').allTextContents();
const tvals = (await page.locator('.meas-table tbody tr td:nth-child(2)').allTextContents()).map((t) => parseFloat(t));
const spread = Math.max(...tvals) - Math.min(...tvals);
check(mcRows.length === 30 && spread > 0.05 && Math.min(...tvals) > 1.9 && Math.max(...tvals) < 2.5, `Monte Carlo: 30 corridas distintas dentro de ±10 % (${Math.min(...tvals)}m … ${Math.max(...tvals)}m)`);
check((await page.locator('.histogram').count()) === 1, 'histograma de la medición');
await page.screenshot({ path: `${OUT}/montecarlo.png` });
// "Ver código" editado a mano vuelve a ser tarjetas
await page.keyboard.press('Alt+e');
await page.getByRole('button', { name: 'Ver código' }).click();
const code2 = (await page.getByLabel('Código del estudio').inputValue()).replace(';.step param R1 list 500 1k 2k', '.step param R1 list 1k 3k');
await page.getByLabel('Código del estudio').fill(code2);
await page.getByRole('button', { name: 'Aplicar código' }).click();
await page.keyboard.press('Alt+e');
check((await page.getByLabel('Valores').inputValue()) === '1k 3k' && (await page.getByLabel('Activar Barrido de R1').isChecked()), 'el código editado a mano vuelve a ser tarjetas');
await page.keyboard.press('Escape');

// --- #25: simulaciones y gráfico desde el Estudio (.tran y .ac, barrer R1, f −3 dB, dos paneles) ---
await openExample(page, 'RC Filter');
await page.locator('svg.editor .sym').first().waitFor();
await page.keyboard.press('Alt+e');
await page.getByRole('button', { name: '+ Simulación' }).click();
check((await page.locator('.study-line', { hasText: '.ac dec 100 1 1meg' }).count()) === 1, 'agregar un .ac junto al .tran');
check(await page.getByText('cada una corre .tran, .ac').isVisible(), 'el resumen muestra qué análisis corren');
await page.getByRole('button', { name: '+ Barrido' }).click();
await page.locator('.study-card').last().getByLabel('Componente', { exact: true }).fill('R1');
await page.locator('.study-card').last().getByLabel('Valores').fill('1k 2k');
await page.getByRole('button', { name: '+ Medición' }).click();
await page.locator('.study-card').last().getByLabel('Análisis de la medición').selectOption('ac');
await page.locator('.study-card').last().getByLabel('Qué medir').selectOption('f3db');
await page.locator('.study-card').last().getByLabel('Señal', { exact: true }).fill('V(out)');
await page.getByRole('button', { name: '+ Gráfico' }).click();
await page.getByRole('button', { name: '+ Panel de Transitorio' }).click();
await page.getByRole('button', { name: '+ Señal', exact: true }).click();
await page.getByLabel('Señal 1 del panel 1', { exact: true }).fill('V(out)');
await page.getByLabel('Análisis del gráfico').selectOption('ac');
await page.getByRole('button', { name: '+ Panel de AC (Bode)' }).click();
await page.getByRole('button', { name: '+ Señal', exact: true }).click();
await page.getByLabel('Señal 1 del panel 1', { exact: true }).fill('V(out)');
await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
// #48: el comando de simulación no se dibuja (se configura en la barra de Simular)…
check((await page.locator('svg.editor .texts text', { hasText: /^\.(tran|ac) / }).count()) === 0, 'el comando de simulación no se ve en el esquemático');
// …salvo con Ver › Mostrar las directivas en el esquemático
await menu(page, 'Ver', 'Mostrar las directivas en el esquemático');
check((await page.locator('svg.editor .texts .directive', { hasText: '.tran 20m' }).count()) === 1, 'el .tran sigue siendo la directiva (la que corre LTspice)');
check((await page.locator('svg.editor .texts .ngspice', { hasText: 'análisis adicionales' }).count()) === 1, 'el .ac queda como comentario que sólo corre TurboSpice');
await menu(page, 'Ver', 'Mostrar las directivas en el esquemático');
check((await page.locator('svg.editor .texts text', { hasText: /^\.(tran|ac) / }).count()) === 0, 'y se vuelve a ocultar');
await page.getByRole('button', { name: 'Correr' }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
const studyPlots = await page.locator('select[aria-label="Plot"] option').allTextContents();
check(studyPlots.some((p) => /^tran/.test(p)) && studyPlots.some((p) => /^ac/.test(p)), `corren el .tran y el .ac con el barrido (${studyPlots.join(', ')})`);
for (const p of [studyPlots.find((x) => /^tran/.test(x)), studyPlots.find((x) => /^ac/.test(x))]) {
  await page.getByRole('combobox', { name: 'Plot' }).selectOption(p);
  check((await paneChips(0)).join() === 'V(out)', `${p}: aparece el gráfico definido en el Estudio`);
}
await resultsMenu(page, /^Mediciones/);
const fcRows = await page.locator('.meas-table tbody tr').allTextContents();
check(fcRows.length === 2, `la medición de f −3 dB, una por corrida (${fcRows.join(' | ')})`);
// al reabrir se reconstruyen las tarjetas de simulación y de gráfico
await page.keyboard.press('Alt+e');
check((await page.locator('.study-card', { hasText: 'Simulación 2: AC (Bode)' }).count()) === 1 && (await page.locator('.study-card', { hasText: 'Gráfico' }).count()) === 1, 'al reabrir, vuelven las tarjetas de simulación y de gráfico');
await page.keyboard.press('Escape');

// --- #23: Estudio con bloques ---
await openExample(page, 'RC Filter');
await page.locator('svg.editor .sym').first().waitFor();
await page.keyboard.press('Alt+e');
// tarjetas → "abrir en bloques"
await page.getByRole('button', { name: '+ Barrido' }).click();
const lastCard = page.locator('.study-card').last();
await lastCard.getByLabel('Componente', { exact: true }).fill('R1');
await lastCard.getByLabel('Valores').fill('500 2k');
await page.getByRole('button', { name: 'Bloques' }).click();
await page.locator('.study-blocks .blocklySvg').waitFor({ timeout: 20000 });
// Blockly dibuja los espacios como U+00A0
const blockText = async () => (await page.locator('.study-blocks .blocklyWorkspace .blocklyText').allTextContents()).map((t) => t.replace(/\u00a0/g, ' '));
const blockTexts = await blockText();
check(blockTexts.some((t) => /Para cada valor/.test(t)) && blockTexts.some((t) => /Simular/.test(t)), 'las tarjetas se abren como bloques');
check(/\.step y \.meas/.test(await page.locator('.modal .hint').last().textContent()), 'un barrido simple sigue siendo compatible con LTspice');
// programa con lógica: medir, condición y gráfico x-y → .control
const prog = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'ts_for_list', x: 20, y: 20,
        fields: { VAR: { id: 'vR' }, TARGET: 'component:R1', VALUES: '500 1k 2k' },
        inputs: { DO: { block: { type: 'ts_simulate', next: { block: {
          type: 'ts_measure', fields: { KIND: 'rise', SIGNAL: 'V(out)', A: '0.1', B: '0.9', VAR: { id: 'vT' } },
          next: { block: {
            type: 'controls_if',
            inputs: {
              IF0: { block: { type: 'logic_compare', fields: { OP: 'GT' }, inputs: { A: { block: { type: 'variables_get', fields: { VAR: { id: 'vT' } } } }, B: { block: { type: 'math_number', fields: { NUM: 0.003 } } } } } },
              DO0: { block: { type: 'ts_message', fields: { TEXT: 'R1 demasiado grande' } } },
            },
            next: { block: { type: 'ts_plot_xy', fields: { Y: { id: 'vT' }, X: { id: 'vR' } } } },
          } },
        } } } } },
      },
    ],
  },
  variables: [{ name: 'R', id: 'vR' }, { name: 'trise', id: 'vT' }],
};
await page.locator('.study-blocks').evaluate((el, json) => el.loadProgram(json), prog);
check(/\.control/.test(await page.locator('.modal .hint').last().textContent()), 'con lógica se guarda como .control');
await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
await page.getByRole('button', { name: 'Correr' }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
check((await page.getByRole('combobox', { name: 'Plot' }).inputValue()) === 'trise vs R', 'el gráfico trise vs R aparece solo');
await page.getByRole('button', { name: 'Medidas' }).click();
const xyRow = await page.locator('.readout tbody tr').first().locator('td').allTextContents();
check(xyRow[0] === 'trise' && /^1\.09\d*m @ 500$/.test(xyRow[1]) && /^4\.39\d*m @ 2k$/.test(xyRow[2]), `trise en función de R (${xyRow.slice(0, 3).join(', ')})`);
await page.getByRole('button', { name: 'Medidas' }).click();
await resultsMenu(page, 'Log');
const logText = await page.locator('.results-body pre').textContent();
check((logText.match(/R1 demasiado grande/g) ?? []).length === 1, 'la condición se evalúa en cada corrida (un solo mensaje)');
// #49: un log más alto que el panel se puede scrollear hasta el final (no queda recortado)
{
  const log = page.locator('.results-body pre');
  const p = await log.boundingBox();
  await page.mouse.move(p.x + 40, p.y + 20);
  // varias ruedas: Firefox anima el scroll y acota cada evento
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 5000);
  await page.waitForTimeout(1000);
  const s = await log.evaluate((el) => {
    const body = el.parentElement.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { tall: el.scrollHeight > el.clientHeight, end: el.scrollTop + el.clientHeight >= el.scrollHeight - 1, inside: r.bottom <= body.bottom + 1 };
  });
  check(s.tall && s.end && s.inside, `el log se scrollea con la rueda hasta el final (${JSON.stringify(s)})`);
}
// los bloques quedan guardados en el .asc y se recuperan
await page.keyboard.press('Alt+e');
await page.locator('.study-blocks .blocklySvg').waitFor({ timeout: 20000 });
const again = await blockText();
check(again.some((t) => /R1 demasiado grande/.test(t)), 'al reabrir, el programa de bloques se recupera');
await page.screenshot({ path: `${OUT}/blocks.png` });
await page.keyboard.press('Escape');

// --- #179: bloques de análisis, listas, tabla e histograma ---
{
  const runProgram = async (json) => {
    await openExample(page, 'RC Filter');
    await page.locator('svg.editor .sym').first().waitFor();
    await page.keyboard.press('Alt+e');
    await page.getByRole('button', { name: 'Bloques' }).click();
    await page.locator('.study-blocks .blocklySvg').waitFor({ timeout: 20000 });
    await page.locator('.study-blocks').evaluate((el, j) => el.loadProgram(j), json);
    await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
    await page.getByRole('button', { name: 'Correr' }).click();
    await page.locator('.status.ok, .status.err').waitFor({ timeout: 60000 });
  };
  const v = (n) => ({ id: `v_${n}` });
  const get = (n) => ({ type: 'variables_get', fields: { VAR: v(n) } });
  const link = (...l) => {
    for (let i = l.length - 2; i >= 0; i--) l[i].next = { block: l[i + 1] };
    return { ...l[0], x: 20, y: 20 };
  };
  const vars = ['vop', 'fc', 'peak', 'm', 'ms', 'yield'].map((n) => ({ name: n, id: `v_${n}` }));
  // el ejemplo no tiene "AC 1": se lo pone el programa
  const ac1 = () => ({ type: 'ts_source', fields: { WHAT: 'acmag', SOURCE: 'V1' }, inputs: { VALUE: { block: { type: 'math_number', fields: { NUM: 1 } } } } });
  // op + ac + tran en secuencia, una medida de cada uno y una tabla
  await runProgram({
    blocks: { languageVersion: 0, blocks: [link(
      ac1(),
      { type: 'ts_op' },
      { type: 'ts_vector', fields: { FN: 'first', SIGNAL: 'V(out)', ANALYSIS: 'op', VAR: v('vop') } },
      { type: 'ts_ac', fields: { MODE: 'dec', POINTS: '50', FSTART: '1', FSTOP: '1meg' } },
      { type: 'ts_measure', fields: { KIND: 'f3db', SIGNAL: 'V(out)', A: '', B: '', VAR: v('fc') } },
      { type: 'ts_tran', fields: { TSTOP: '10m', TSTEP: '', TSTART: '', UIC: false } },
      { type: 'ts_vector', fields: { FN: 'max', SIGNAL: 'V(out)', ANALYSIS: 'tran', VAR: v('peak') } },
      { type: 'ts_table_row', fields: { COLS: 'vop fc peak' } },
    )] },
    variables: vars,
  });
  const head = await page.locator('.meas-panel thead th').allTextContents();
  const row = await page.locator('.meas-panel tbody tr').first().locator('td').allTextContents();
  check(head.join() === 'vop,fc,peak' && /^15[89]/.test(row[1]) && /^9\d\d/.test(row[2]), `op + ac + tran en secuencia, con la tabla de medidas (${head} | ${row})`);
  // Monte Carlo de 100 corridas: lista, histograma y rendimiento
  const rnd = (nom, tol) => ({ type: 'ts_random', fields: { DIST: 'uniform', TOL: tol }, inputs: { NOM: { block: { type: 'math_number', fields: { NUM: nom } } } } });
  await runProgram({
    blocks: { languageVersion: 0, blocks: [link(
      ac1(),
      { type: 'ts_seed', fields: { SEED: 1 } },
      { type: 'ts_repeat', fields: { TIMES: 100 }, inputs: { DO: { block: link(
        { type: 'ts_set', fields: { TARGET: 'component:R1' }, inputs: { VALUE: { block: rnd(1000, 5) } } },
        { type: 'ts_set', fields: { TARGET: 'component:C1' }, inputs: { VALUE: { block: rnd(1e-7, 10) } } },
        { type: 'ts_ac', fields: { MODE: 'dec', POINTS: '50', FSTART: '10', FSTOP: '1meg' } },
        { type: 'ts_measure', fields: { KIND: 'f3db', SIGNAL: 'V(out)', A: '', B: '', VAR: v('m') } },
        { type: 'ts_list_add', fields: { LIST: v('ms') }, inputs: { VALUE: { block: get('m') } } },
      ) } } },
      { type: 'ts_histogram', fields: { LIST: v('ms') } },
      { type: 'ts_list_stat', fields: { STAT: 'yield', LIST: v('ms'), A: '1.5k', B: '1.7k', VAR: v('yield') } },
      { type: 'ts_print', inputs: { VALUE: { block: get('yield') } } },
    )] },
    variables: vars,
  });
  const mcRows = await page.locator('.meas-panel tbody tr').count();
  const hist = await page.locator('.meas-panel .histogram rect').count();
  check(mcRows === 100 && hist > 0, `Monte Carlo de 100 corridas con histograma (${mcRows} filas, ${hist} barras)`);
  await page.screenshot({ path: `${OUT}/blocks-montecarlo.png` });
  await resultsMenu(page, 'Log');
  const y = /yield = ([\d.]+)/.exec(await page.locator('.results-body pre').textContent());
  check(!!y && Number(y[1]) > 0 && Number(y[1]) <= 100, `rendimiento del Monte Carlo en el Log (${y?.[1]} %)`);
}

// --- #47: ventana de configuración de fuentes ---
await openExample(page, 'RC Filter');
await page.locator('svg.editor .sym').first().waitFor();
{
  // cuerpo de V1 (se recalcula: al simular se abre el panel de resultados y cambia la vista)
  // (Esc: después de simular queda la herramienta de medir y el doble click sólo edita al seleccionar)
  // después de simular se abre el panel de resultados y la vista se reajusta un instante después:
  // si el doble click cae antes, se reintenta con las coordenadas ya reajustadas
  const openV1 = async () => {
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Escape');
      const p = await at(0, 56);
      await page.mouse.dblclick(p.x, p.y);
      if (await page.getByRole('dialog', { name: 'Fuente de tensión V1' }).waitFor({ timeout: 2000 }).then(() => true, () => false)) return;
      await page.waitForTimeout(500);
    }
  };
  await openV1();
  const sd = page.getByRole('dialog', { name: 'Fuente de tensión V1' });
  check(await sd.waitFor({ timeout: 5000 }).then(() => true, () => false), 'doble click en una fuente abre su ventana');
  const field = (n) => sd.getByLabel(n, { exact: true });
  check((await sd.getByRole('tab', { selected: true }).textContent()) === 'Pulso', 'reconoce el PULSE del ejemplo');
  const pulseVals = [await field('Ton').inputValue(), await field('Período').inputValue(), await field('Frecuencia').inputValue(), await field('DC').inputValue()];
  check(pulseVals.join() === '5m,10m,100,50', `cada parámetro en su campo; frecuencia y DC calculados (${pulseVals})`);
  await field('DC').fill('25');
  // el DC cuenta las rampas (Trise = Tfall = 1µ): 25 % de 10 ms es Ton + 1µ (9ec9945)
  check((await field('Ton').inputValue()) === '2.499m', `con período y DC fijos, el DC recalcula Ton (${await field('Ton').inputValue()})`);
  await sd.getByRole('tab', { name: 'Seno' }).click();
  await field('Amplitud').fill('2');
  await field('Frecuencia').fill('2k');
  check((await field('Período').inputValue()) === '500u', `el período sigue a la frecuencia (${await field('Período').inputValue()})`);
  await sd.getByText(/^Avanzado/).click();
  await field('Amplitud AC').fill('1');
  const line = await sd.locator('.src-line').textContent();
  check(line === 'SINE(0 2 2k) AC 1', `la línea resultante con la sintaxis de LTspice (${line})`);
  await sd.getByRole('button', { name: 'Aceptar' }).click();
  // (el valor de una fuente que no es DC no se dibuja, #147: se lee al reabrir su ventana)
  await openV1();
  check((await sd.locator('.src-line').textContent()) === 'SINE(0 2 2k) AC 1', 'Aceptar escribe la forma de onda en el componente');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Correr', exact: true }).click();
  await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
  check((await page.locator('.status.ok').count()) === 1, 'y simula');
  // un valor que el formulario no sabe editar se edita como texto, sin perderlo
  await openV1();
  await sd.getByText(/^Avanzado/).click();
  await sd.getByRole('button', { name: 'Editar como texto' }).click();
  await sd.getByLabel('Valor de la fuente').fill('wavefile="x.wav" chan=0');
  await sd.getByRole('button', { name: 'Aceptar' }).click();
  await openV1();
  check((await sd.getByLabel('Valor de la fuente').inputValue()) === 'wavefile="x.wav" chan=0' && (await sd.getByText('el formulario no sabe editar').count()) === 1, 'lo que no reconoce abre como texto');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
}

// --- library/cmp: el valor de un transistor, resistor… se elige de una tabla ---
await openExample(page, 'Common Emitter');
await page.locator('svg.editor .sym').first().waitFor();
{
  const open = async (x, y) => {
    await page.keyboard.press('Escape');
    const p = await at(x, y);
    await page.mouse.dblclick(p.x, p.y);
  };
  await open(236, 208); // Q1
  const dlg = page.getByRole('dialog');
  const table = dlg.locator('.parts-table');
  check(await table.waitFor({ timeout: 5000 }).then(() => true, () => false), 'doble click en un transistor muestra la tabla de la librería');
  const heads = await table.locator('th').allTextContents();
  check(heads[0] === 'Nombre' && heads.some((h) => h.startsWith('Vceo')) && heads.some((h) => h.startsWith('Fabricante')), `con los parámetros relevantes en columnas (${heads.join(', ')})`);
  const rowNames = () => table.locator('tbody tr:not(.empty) td:first-child').allTextContents();
  const npns = await rowNames();
  check(npns.includes('BC547C') && !npns.includes('BC557C'), `sólo los NPN para un npn (${npns.length} filas)`);
  await dlg.getByLabel('Buscar en la librería').fill('zzz');
  check((await table.locator('tr.empty').count()) === 1, 'la búsqueda filtra');
  await dlg.getByLabel('Buscar en la librería').fill('BC547C');
  await table.locator('tbody tr', { has: page.locator('td:first-child', { hasText: /^BC547C$/ }) }).click();
  check((await dlg.locator('label', { hasText: /^Value/ }).locator('input').first().inputValue()) === 'BC547C', 'click en una fila pone el valor');
  await dlg.getByRole('button', { name: 'Cancelar' }).click();
  // un resistor: doble click en la fila elige y acepta
  await open(256, 48); // RC
  await page.getByRole('dialog').getByText('Avanzado: modelo de fabricante').click();
  await page.getByRole('dialog').getByLabel('Buscar en la librería').fill('TS_R_4k7');
  await page.getByRole('dialog').locator('.parts-table tbody tr', { hasText: 'TS_R_4k7_5%' }).dblclick();
  check((await page.getByRole('dialog').count()) === 0 && (await page.locator('svg.editor .sym text', { hasText: '4.7k' }).count()) >= 1, 'doble click en una fila elige y acepta (RC = 4.7k)');
  await page.keyboard.press('Control+z');
}

// primera visita: sin pantalla de bienvenida, abre el proyecto de muestra; "Acerca de" directo en el menú
const fresh = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await spanishUi(fresh);
const fp = await fresh.newPage();
await fp.goto(URL);
await fp.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });
check((await fp.getByRole('dialog').count()) === 0, 'la primera visita no abre ningún diálogo');
check((await fp.locator('.capsule-project').textContent()) === 'Sample Project', `la primera visita abre el proyecto de muestra (${await fp.locator('.capsule-project').textContent()})`);
await menu(fp, 'Acerca de TurboSpice');
check(await fp.getByRole('dialog', { name: 'Acerca de TurboSpice' }).waitFor({ timeout: 5000 }).then(() => true, () => false), 'Menú › Acerca de abre el diálogo');
await fp.keyboard.press('Escape');
await menu(fp, 'Archivo', 'Ejemplos', 'Common Emitter');
await fp.locator('svg.editor .sym').first().waitFor();
await fp.waitForTimeout(500);
check((await fp.locator('.capsule').textContent()) === 'Examples·Common Emitter', `abre el ejemplo desde el menú (${await fp.locator('.capsule').textContent()})`);
await fresh.close();

check(errors.length === 0, `sin errores de consola${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} fallo(s)` : '\nE2E funciones OK');
process.exit(failed ? 1 : 0);
