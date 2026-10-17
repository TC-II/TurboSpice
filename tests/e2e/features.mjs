// E2E de funciones de interfaz, por issue: nombres de redes (#15), compartir (#1), autoguardado
// (#5), punto de operación (#2), elegir en el esquemático (#13), .step (#7), visor de resultados
// (#3), vista recordada (#14) y exportaciones (#12).
// Uso: node tests/e2e/features.mjs [url] [carpeta-capturas]   (con `npm run preview` corriendo)
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const OUT = process.argv[3] ?? 'test-results';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await context.newPage();
const errors = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(e.message));
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
await page.getByText('Listo').waitFor({ timeout: 30000 });
await page.locator('svg.editor .sym').first().waitFor(); // ejemplo "Filtro RC"

// --- #15: nombres de redes temporales ---
const names = () => page.locator('.net-name text').allTextContents();
await page.getByRole('button', { name: 'Redes' }).click();
check((await names()).sort().join() === 'N001,out', `muestra el nombre de cada red (${(await names()).join(', ')})`);
check((await page.locator('.net-name.auto').count()) === 1, 'las redes sin etiqueta se distinguen');
await page.keyboard.press('Alt+n');
check((await page.locator('.net-name').count()) === 0, 'Alt+N las oculta');
check(!(await page.locator('.filename').textContent()).includes('•'), 'mostrarlas no modifica el documento');
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
await page.getByRole('combobox', { name: 'Ejemplos' }).selectOption('Bode RLC.asc');
await page.locator('svg.editor .sym').first().waitFor();
await page.getByRole('button', { name: 'Compartir' }).click();
const link = await page.locator('.modal input[aria-label="Link"]').inputValue();
check(/#c=[\w-]+&n=Bode%20RLC\.asc$/.test(link), `genera el link (${link.length} caracteres)`);
await page.getByRole('button', { name: 'Listo', exact: true }).click();
const other = await context.newPage();
watch(other);
await other.goto(link);
await other.getByText('Listo').waitFor({ timeout: 30000 });
await other.locator('svg.editor .sym').first().waitFor();
check((await other.locator('.filename').textContent()) === 'Bode RLC.asc', 'el link abre el circuito con su nombre');
check(!(await other.evaluate(() => location.hash)), 'y limpia el hash');
const symsA = await page.locator('svg.editor .sym').count();
check((await other.locator('svg.editor .sym').count()) === symsA, 'con los mismos componentes');
await other.getByRole('button', { name: 'Simular' }).click();
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
await page.getByText('Listo').waitFor({ timeout: 30000 });
await page.locator('svg.editor .sym').first().waitFor();
check((await flags()) === before + 1, 'al recargar se recupera el trabajo sin guardar');
check((await page.locator('.filename').textContent()) === 'Bode RLC.asc •', 'con su nombre y marcado como modificado');
await page.keyboard.press('Control+z');
check((await flags()) === before, 'y se puede deshacer lo anterior a la recarga');
const recents = await page.locator('select[aria-label="Recientes"] option').allTextContents();
check(recents.includes('Bode RLC'), `recientes: ${recents.slice(1).join(', ')}`);

// --- #2: punto de operación con el mouse ---
const svg = page.locator('svg.editor');
const at = async (x, y) => {
  const b = await svg.boundingBox();
  const [vx, vy, vw, vh] = (await svg.getAttribute('viewBox')).split(' ').map(Number);
  return { x: b.x + ((x - vx) / vw) * b.width, y: b.y + ((y - vy) / vh) * b.height };
};
await page.getByRole('combobox', { name: 'Ejemplos' }).selectOption('Emisor común.asc');
await page.locator('svg.editor .sym').first().waitFor();
await page.getByRole('button', { name: 'Simular' }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
await page.waitForTimeout(300);
const q1 = await at(236, 208);
await page.mouse.move(q1.x, q1.y);
const tip = await page.locator('.bias-tip').textContent().catch(() => '');
check(/Q1/.test(tip) && /Ic = 1\.41\dmA/.test(tip) && /Región: activa directa/.test(tip), `hover sobre Q1: ${tip}`);
const outW = await at(280, 160);
await page.mouse.move(outW.x, outW.y);
const tipOut = await page.locator('.bias-tip').textContent().catch(() => '');
check(/V\(out\)5\.35\dV/.test(tipOut), `hover sobre la red out: ${tipOut}`);
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
await page.getByRole('button', { name: 'Simulación…' }).click();
await page.getByRole('button', { name: 'Ruido' }).click();
await page.getByRole('button', { name: 'Elegir Nodo de salida en el esquemático' }).click();
check(await page.locator('.pick-banner').isVisible(), 'el diálogo se oculta y pide elegir una red');
const outPick = await at(280, 160);
await page.mouse.move(outPick.x, outPick.y);
await page.mouse.click(outPick.x, outPick.y);
const outVal = await page.locator('.field', { hasText: 'Nodo de salida' }).locator('input').inputValue();
check(outVal === 'out', `click en el cable completa el nodo (${outVal})`);
await page.getByRole('button', { name: 'Elegir Fuente de entrada en el esquemático' }).click();
const rcBody = await at(256, 96); // una resistencia no es una fuente: no se elige
await page.mouse.click(rcBody.x, rcBody.y);
check(await page.locator('.pick-banner').isVisible(), 'una resistencia no se puede elegir como fuente');
const vin = await at(32, 272);
await page.mouse.click(vin.x, vin.y);
const srcVal = await page.locator('.field', { hasText: 'Fuente de entrada' }).locator('input').inputValue();
check(srcVal === 'Vin', `click en la fuente la elige (${srcVal})`);
await page.getByRole('button', { name: 'Elegir Referencia en el esquemático' }).click();
await page.keyboard.press('Escape');
check(await page.locator('.modal').isVisible(), 'Esc cancela la elección y vuelve al diálogo');
check(/^\.noise V\(out\) Vin /.test(await page.locator('.sim-preview code').textContent()), `directiva: ${await page.locator('.sim-preview code').textContent()}`);
await page.getByRole('button', { name: 'Cancelar' }).click();

// --- #7: .step ---
await page.getByRole('combobox', { name: 'Ejemplos' }).selectOption('Barrido RC (.step).asc');
await page.locator('svg.editor .sym').first().waitFor();
await page.getByRole('button', { name: 'Simular' }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
const stepPlots = await page.locator('select[aria-label="Plot"] option').allTextContents();
check(stepPlots.join() === 'tran1 (R=500),tran2 (R=1k),tran3 (R=2k)', `una corrida por paso (${stepPlots.join(', ')})`);
await page.waitForTimeout(300);
const outStep = await at(128, -32);
await page.mouse.click(outStep.x, outStep.y);
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Medidas' }).click();
const series = await page.locator('.readout tbody tr td:first-child').allTextContents();
check(series.join() === 'V(out) · R=500,V(out) · R=1k,V(out) · R=2k', `cada paso identificado con su valor (${series.join(', ')})`);
await page.getByRole('button', { name: 'Medidas' }).click();
await page.screenshot({ path: `${OUT}/step.png` });

// --- #3, #14, #12: visor de resultados, vista recordada y exportaciones ---
const downloaded = async (action) => {
  const [d] = await Promise.all([page.waitForEvent('download'), action()]);
  return { name: d.suggestedFilename(), text: readFileSync(await d.path(), 'utf8') };
};
await page.setViewportSize({ width: 1280, height: 1100 }); // lugar para dos paneles sin scroll
await page.getByRole('combobox', { name: 'Ejemplos' }).selectOption('Bode RLC.asc');
await page.locator('svg.editor .sym').first().waitFor();
await page.getByRole('button', { name: 'Simular' }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
await page.waitForTimeout(300);
const outAc = await at(224, -32);
await page.mouse.click(outAc.x, outAc.y);
await page.getByRole('button', { name: 'Medidas' }).click();
const rowNames = () => page.locator('.readout tbody tr td:first-child').allTextContents();
check((await rowNames()).join() === 'V(out),V(out) (fase)', `Bode: magnitud y fase a la vez (${await rowNames()})`);
const peak = await page.locator('.readout tbody tr').first().locator('td').nth(2).textContent();
// f0 = 5.03 kHz; con Q ≈ 3.2 el máximo de |V(out)| cae en f0·√(1−1/2Q²) ≈ 4.9 kHz
check(/@ 4\.9\d*k|@ 4\.89\d*k/.test(peak), `pico de resonancia cerca de 4.9 kHz (${peak})`);
await page.getByRole('button', { name: 'Medidas' }).click();

await page.getByRole('button', { name: '+ Panel' }).click();
await page.locator('.pane').nth(1).click();
await page.getByLabel('Expresión').fill('V(out)/V(n001)');
await page.keyboard.press('Enter');
const paneChips = (i) => page.locator('.pane').nth(i).locator('.trace-chip .name').allTextContents();
check((await paneChips(1)).join() === 'V(out)/V(n001)', `expresión en el panel nuevo (${await paneChips(1)})`);
await page.getByLabel('Expresión').fill('V(nada)');
await page.keyboard.press('Enter');
check(/no existe/.test(await page.locator('.plot-tools .hint.warn').textContent()), 'una expresión inválida avisa y no se agrega');
await page.getByLabel('Expresión').fill('');
await page.locator('.pane').nth(1).locator('.trace-chip').dragTo(page.locator('.pane').nth(0).locator('.pane-chart'));
check((await paneChips(0)).join() === 'V(out),V(out)/V(n001)', `arrastrar una traza la pasa a otro panel (${await paneChips(0)})`);
await page.getByRole('button', { name: 'Quitar panel' }).nth(1).click();
check((await page.locator('.pane').count()) === 1, 'se puede quitar un panel');

await page.getByRole('button', { name: 'Cursores' }).click();
const cb = await page.locator('.pane-chart').first().boundingBox();
await page.mouse.click(cb.x + cb.width * 0.3, cb.y + cb.height / 2);
await page.keyboard.down('Shift');
await page.mouse.click(cb.x + cb.width * 0.7, cb.y + cb.height / 2);
await page.keyboard.up('Shift');
const head = await page.locator('.readout thead').textContent();
check(/A \(.+\)/.test(head) && /B \(.+\)/.test(head) && /Δx = /.test(await page.locator('.readout tr.dx').textContent()), `cursores A y B con Δx (${head})`);
await page.screenshot({ path: `${OUT}/plot-panel.png` });
await page.getByRole('button', { name: 'Cursores' }).click();

const csv = await downloaded(() => page.getByRole('combobox', { name: 'Exportar resultados' }).selectOption('csv'));
check(csv.text.startsWith('frequency,V(out),V(out) (fase),V(out)/V(n001),V(out)/V(n001) (fase)\n'), `CSV (${csv.name}): ${csv.text.split('\n')[0]}`);
const png = await downloaded(() => page.getByRole('combobox', { name: 'Exportar resultados' }).selectOption('png'));
check(png.name === 'Bode RLC.png' && png.text.length > 1000, 'gráfico a PNG');

await page.getByRole('button', { name: 'Recordar vista' }).click();
check(await page.getByRole('button', { name: 'Vista recordada ✓' }).isVisible(), 'recordar la vista');
for (let k = 0; k < 2; k++) await page.locator('.trace-chip .x').first().click();
check((await page.locator('.trace-chip').count()) === 0, 'quitar las trazas');
await page.getByRole('button', { name: 'Simular' }).click();
await page.waitForTimeout(500);
check((await paneChips(0)).join() === 'V(out),V(out)/V(n001)', `al volver a simular se reaplica la vista recordada (${await paneChips(0)})`);
const plt = await downloaded(() => page.getByRole('combobox', { name: 'Exportar resultados' }).selectOption('plt'));
check(plt.name === 'Bode RLC.plt' && plt.text.includes('[AC Analysis]') && plt.text.includes('"V(out)/V(n001)"'), `vista a .plt de LTspice (${plt.name})`);
await page.locator('input[type=file][accept=".plt"]').setInputFiles({
  name: 'x.plt',
  mimeType: 'text/plain',
  buffer: Buffer.from('[AC Analysis]\r\n{\r\n   Npanes: 2\r\n   {\r\n      traces: 1 {524290,0,"V(out)"}\r\n   },\r\n   {\r\n      traces: 1 {524291,0,"V(n002)"}\r\n   }\r\n}\r\n'),
});
await page.locator('.pane').nth(1).waitFor();
check((await page.locator('.pane').count()) === 2 && (await paneChips(1)).join() === 'V(n002)', `importar un .plt de LTspice aplica sus paneles (${await paneChips(0)} | ${await paneChips(1)})`);
await page.getByRole('button', { name: 'Compartir' }).click();
check((await page.locator('.modal input[aria-label="Link"]').inputValue()).includes('&v='), 'el link para compartir incluye la vista');
await page.getByRole('button', { name: 'Listo', exact: true }).click();

const svgOut = await downloaded(() => page.getByRole('combobox', { name: 'Exportar esquemático' }).selectOption('svg'));
check(svgOut.name === 'Bode RLC.svg' && svgOut.text.includes('<svg') && svgOut.text.includes('>R1<') && !svgOut.text.includes('class='), `esquemático a SVG autónomo (${svgOut.text.length} bytes)`);
const net = await downloaded(() => page.getByRole('combobox', { name: 'Exportar esquemático' }).selectOption('net'));
check(/^R1 N002 N001 10$/m.test(net.text) && net.text.includes('.backanno'), `netlist de LTspice (.net): ${net.text.split('\n')[1]}`);
await page.getByRole('button', { name: 'Netlist', exact: true }).last().click();
const cir = await downloaded(() => page.getByRole('button', { name: 'Descargar .cir (ngspice)' }).click());
check(cir.text.includes('.ac dec 100 100 100k'), 'netlist de ngspice (.cir)');
await page.getByRole('button', { name: 'Resultados' }).click();

// .pz en el plano s
await page.getByRole('button', { name: 'Simulación…' }).click();
await page.getByRole('button', { name: /Polos y ceros/ }).click();
const pzField = (label) => page.locator('.field', { hasText: label }).locator('input');
await pzField('Entrada +').fill('N001');
await pzField('Entrada −').fill('0');
await pzField('Salida +').fill('out');
await pzField('Salida −').fill('0');
await page.getByRole('button', { name: 'Aceptar' }).click();
await page.getByRole('button', { name: 'Simular' }).click();
await page.locator('.pz-plane').waitFor({ timeout: 30000 });
const pzRows = await page.locator('.pz-view tbody tr').allTextContents();
check(pzRows.length === 2 && pzRows.every((r) => /polo/.test(r) && /5\.03\d*kHz/.test(r) && /3\.16/.test(r)), `.pz: dos polos con f0 = 5.03 kHz y Q = 3.16 (${pzRows.join(' | ')})`);
await page.screenshot({ path: `${OUT}/pz.png` });
await page.keyboard.press('Control+z');
await page.getByRole('button', { name: 'Simular' }).click();
await page.locator('.pane-chart').first().waitFor({ timeout: 30000 });
await page.getByRole('combobox', { name: 'Vista' }).selectOption('smith');
check((await page.locator('.smith polyline.trace').count()) === 2, 'carta de Smith con las trazas complejas');
await page.screenshot({ path: `${OUT}/smith.png` });
await page.getByRole('combobox', { name: 'Vista' }).selectOption('bode');

check(errors.length === 0, `sin errores de consola${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} fallo(s)` : '\nE2E funciones OK');
process.exit(failed ? 1 : 0);
