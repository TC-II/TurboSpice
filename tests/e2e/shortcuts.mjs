// E2E de los atajos de teclado de la configuración de LTspice (#29): esquemático, visor de
// resultados (con el mouse sobre los gráficos) y modo Netlist.
// Uso: node tests/e2e/shortcuts.mjs [url] [carpeta-capturas]   (con `npm run preview` corriendo)
import { mkdirSync } from 'node:fs';
import { menu, openExample, resultsView, skipWelcome, launchBrowser } from './lib.mjs';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const OUT = process.argv[3] ?? 'test-results';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser();
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

await page.goto(URL);
await page.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });
await page.locator('svg.editor .sym').first().waitFor(); // Sample Project: el pasabajos RC
// el pasabajos RC sin historial de corridas (Sample Project, el que abre, tiene corridas)
await openExample(page, 'RC Filter');
await page.locator('svg.editor .sym').first().waitFor();

const svg = page.locator('svg.editor');
const viewBox = () => svg.getAttribute('viewBox');
const at = async (x, y) => {
  const b = await svg.boundingBox();
  const [vx, vy, vw, vh] = (await viewBox()).split(' ').map(Number);
  return { x: b.x + ((x - vx) / vw) * b.width, y: b.y + ((y - vy) / vh) * b.height };
};
const onSchematic = async () => {
  const b = await svg.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
};
const modal = page.locator('.modal');
const settle = () => page.waitForTimeout(100);

// --- diálogos ---
await onSchematic();
await page.keyboard.press('a');
check((await modal.getAttribute('aria-label')) === 'Comando de simulación', 'A abre Simulación…');
await page.keyboard.press('Escape');
await page.keyboard.press('Alt+s');
check((await modal.count()) === 0, 'Alt+S ya no abre Simulación…');
await page.keyboard.press('p');
check((await modal.getAttribute('aria-label')) === 'Componente', 'P abre el buscador de componentes');
await page.keyboard.press('Escape');
await page.keyboard.press('.');
check((await modal.locator('textarea').count()) === 1 && (await modal.locator('textarea').inputValue()) === '', '"." abre la directiva SPICE (sin escribir el punto)');
await page.keyboard.press('Escape');

// --- vista: Espacio, Z, Shift+Z ---
await page.keyboard.press('Space');
await settle();
const fitted = await viewBox();
await page.mouse.wheel(0, -400);
await settle();
check((await viewBox()) !== fitted, 'la rueda hace zoom');
await page.keyboard.press('Space');
await settle();
check((await viewBox()) === fitted, 'Espacio tocado ajusta a la vista');
// Espacio mantenido + arrastrar desplaza (y al soltar no ajusta)
const c = await at(80, 0);
await page.keyboard.down('Space');
await page.mouse.move(c.x, c.y);
await page.mouse.down();
await page.mouse.move(c.x + 120, c.y + 40, { steps: 4 });
await page.mouse.up();
await page.keyboard.up('Space');
await settle();
const panned = await viewBox();
check(panned !== fitted && panned.split(' ')[2] === fitted.split(' ')[2], 'Espacio + arrastrar desplaza sin ajustar');
await page.keyboard.press('Space');
await page.keyboard.press('z');
const z1 = await at(0, -48);
const z2 = await at(112, 0);
await page.mouse.move(z1.x, z1.y);
await page.mouse.down();
await page.mouse.move(z2.x, z2.y, { steps: 4 });
await page.mouse.up();
await settle();
const zoomed = await viewBox();
check(Number(zoomed.split(' ')[2]) < Number(fitted.split(' ')[2]) * 0.8, `Z: zoom a un recuadro (${fitted} → ${zoomed})`);
await page.keyboard.press('Shift+Z');
await settle();
check((await viewBox()) === fitted, 'Shift+Z vuelve a la vista anterior');

// --- grilla y pines sueltos ---
const grid = () => svg.locator('rect[fill="url(#grid)"]').count();
check((await grid()) === 1, 'grilla visible');
await page.keyboard.press('Control+g');
check((await grid()) === 0, 'Ctrl+G oculta la grilla');
await page.keyboard.press('Control+g');
await page.keyboard.press('r');
const free = await at(320, 0);
await page.mouse.click(free.x, free.y);
await page.keyboard.press('Escape');
const loose = () => svg.locator('.loose rect').count();
check((await loose()) === 2, `marcas de pines sueltos de la R nueva (${await loose()})`);
await page.keyboard.press('Control+u');
check((await loose()) === 0, 'Ctrl+U las oculta');
await page.keyboard.press('Control+u');

// --- M: mover sin estirar cables; S: arrastrar estirando ---
const symPos = () => page.evaluate(() => document.querySelector('svg.editor .symbols').innerHTML.replace(/ sel/g, ''));
const wires = () => svg.locator('.wires line').count();
const before = await symPos();
const nWires = await wires();
await page.keyboard.press('m');
const r2 = await at(320, 8); // la R nueva queda centrada en el click: origen (304,-48)
await page.mouse.click(r2.x, r2.y);
const dst = await at(256, 8); // a la izquierda: a la derecha puede quedar fuera de la ventana
await page.mouse.move(dst.x, dst.y, { steps: 4 });
await page.mouse.click(dst.x, dst.y);
await page.keyboard.press('Escape');
check((await symPos()) !== before && (await wires()) === nWires, 'M: click, sigue al cursor y se suelta con otro click');
await page.keyboard.press('Control+z');
check((await symPos()) === before, 'Ctrl+Z deshace el movimiento');

// --- J / K: líneas y rectángulos decorativos ---
const shapes = () => svg.locator('.shapes > *').count();
await page.keyboard.press('j');
const l1 = await at(-64, -96);
const l2 = await at(64, -96);
await page.mouse.click(l1.x, l1.y);
await page.mouse.click(l2.x, l2.y);
await page.keyboard.press('k');
const k2 = await at(160, 64);
await page.mouse.click(l1.x, l1.y);
await page.mouse.click(k2.x, k2.y);
await page.keyboard.press('Escape');
check((await svg.locator('.shapes line').count()) === 1 && (await svg.locator('.shapes rect').count()) === 1, 'J y K dibujan una línea y un rectángulo');
await page.keyboard.press('Control+z');
await page.keyboard.press('Control+z');
check((await shapes()) === 0, 'se deshacen');
await page.keyboard.press('Control+z'); // la R suelta

// --- simular / log ---
await page.keyboard.press('Alt+r');
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
check((await page.locator('.results-panel').count()) === 1, 'Alt+R simula');
await onSchematic();
await page.keyboard.press('Control+l');
check((await resultsView(page)) === 'Log', 'Ctrl+L abre el log');
await page.locator('.results-panel').getByRole('button', { name: 'Resultados', exact: true }).click();

// --- visor (con el mouse sobre los gráficos) ---
const results = page.locator('.results-panel');
const overResults = async () => {
  const b = await results.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
};
await overResults();
await page.keyboard.press('a');
check(await page.getByLabel('Expresión').evaluate((e) => e === document.activeElement), 'A va al campo de expresión');
await page.keyboard.type('V(out)');
check((await page.getByLabel('Expresión').inputValue()) === 'V(out)', 'sin escribir la "a"');
await page.keyboard.press('Enter');
await page.locator('.pane-chart').first().waitFor();
// escribir en el campo no dispara atajos
await page.getByLabel('Expresión').fill('');
await page.getByLabel('Expresión').press('p');
check((await page.locator('.pane').count()) === 1, 'las letras escritas en un campo no son atajos');
await page.getByLabel('Expresión').fill('');
await page.getByLabel('Expresión').blur();
await overResults();
await page.keyboard.press('p');
check((await page.locator('.pane').count()) === 2, 'P agrega un panel');
await page.keyboard.press('u');
check((await page.locator('.pane').first().locator('.trace-chip').count()) === 0, 'U sube el panel activo (el nuevo, vacío)');
await page.keyboard.press('d');
check((await page.locator('.pane').first().locator('.trace-chip').count()) === 1, 'D lo vuelve a bajar');
// deshacer: D, U y el panel agregado
for (let i = 0; i < 3; i++) await page.keyboard.press('Control+z');
check((await page.locator('.pane').count()) === 1, 'Ctrl+Z deshace los cambios de la vista (D, U, P)');
await page.keyboard.press('Control+Shift+z');
check((await page.locator('.pane').count()) === 2, 'Ctrl+Shift+Z los rehace');
await page.keyboard.press('Control+z');
await page.locator('.pane').first().click();
await overResults();
await page.keyboard.press('b');
check((await page.locator('.pane').count()) === 2 && (await page.locator('.pane').nth(1).locator('.trace-chip').count()) === 0, 'B agrega un panel debajo del activo');
await page.keyboard.press('Control+z');

// zoom del gráfico: el valor de X bajo el mismo punto del mouse cambia
const chart = page.locator('.pane-chart').first();
const cb = await chart.boundingBox();
const xAt = async (fx) => {
  // (moverse antes a otro lado: sin movimiento uPlot no actualiza el valor bajo el mouse)
  await page.mouse.move(cb.x + cb.width * 0.9, cb.y + cb.height / 2);
  await page.waitForTimeout(50);
  await page.mouse.move(cb.x + cb.width * fx, cb.y + cb.height / 2);
  await page.waitForTimeout(80);
  return page.locator('.xval').first().textContent();
};
const x0 = await xAt(0.5);
await page.keyboard.press('z');
await page.mouse.move(cb.x + cb.width * 0.3, cb.y + cb.height * 0.3);
await page.mouse.down();
await page.mouse.move(cb.x + cb.width * 0.45, cb.y + cb.height * 0.6, { steps: 4 });
await page.mouse.up();
const x1 = await xAt(0.5);
check(x1 !== x0, `Z: zoom a un recuadro en el gráfico (${x0} → ${x1})`);
await page.keyboard.press('Shift+Z');
check((await xAt(0.5)) === x0, 'Shift+Z: zoom anterior');
// otro zoom a recuadro y Espacio vuelve a ver todo
await page.keyboard.press('z');
await page.mouse.move(cb.x + cb.width * 0.3, cb.y + cb.height * 0.3);
await page.mouse.down();
await page.mouse.move(cb.x + cb.width * 0.45, cb.y + cb.height * 0.6, { steps: 4 });
await page.mouse.up();
await page.keyboard.press('Space');
check((await xAt(0.5)) === x0, 'Espacio ajusta el gráfico');

// cursores y quitar trazas
await page.keyboard.press('c');
check((await page.locator('.readouts table').count()) === 1, 'C pone un cursor');
await page.keyboard.press('Shift+C');
check((await page.locator('.readouts').count()) === 0, 'Shift+C borra los cursores');
await page.keyboard.press('Backspace');
await page.locator('.trace-chip .name').first().click();
check((await page.locator('.trace-chip').count()) === 0, 'Backspace + click en el nombre quita la traza');
await page.keyboard.press('Escape');

// --- botones Mover / Arrastrar en la barra (#198) ---
await onSchematic();
await page.setViewportSize({ width: 1900, height: 900 }); // en 1280 el grupo Edición pasa a «Más herramientas»
const mv = page.locator('.iconbar button[aria-label="Mover"]');
const dr = page.locator('.iconbar button[aria-label="Arrastrar"]');
const act = async (l) => (await l.getAttribute('class'))?.includes('active') ?? false;
await mv.waitFor();
check((await mv.count()) === 1 && (await dr.count()) === 1, 'la barra tiene los botones Mover y Arrastrar');
check(/\(M\)/.test((await mv.getAttribute('title')) ?? '') && /\(S\)/.test((await dr.getAttribute('title')) ?? ''), 'los tooltips de Mover/Arrastrar traen el atajo');
await mv.click();
check((await act(mv)) && !(await act(dr)), 'click en Mover lo marca activo');
await dr.click();
check(!(await act(mv)) && (await act(dr)), 'click en Arrastrar lo marca activo y desmarca Mover');
await page.keyboard.press('Escape');
check(!(await act(mv)) && !(await act(dr)), 'Esc desactiva ambos');
await onSchematic();
await page.keyboard.press('m');
check(await act(mv), 'la tecla M marca el botón Mover');
await page.keyboard.press('Escape');
await page.setViewportSize({ width: 1280, height: 900 });

// --- ayuda ---
await onSchematic();
await page.keyboard.press('?');
const help = await modal.textContent();
check(/Visor de resultados/.test(help) && /Modo Netlist/.test(help) && /Zoom a un recuadro/.test(help), 'la ayuda muestra los atajos por contexto');
await page.keyboard.press('Escape');

// --- modo Netlist ---
await menu(page, 'Ver', 'Editor de netlist (SPICE)');
await page.locator('.netlist-editor textarea').waitFor();
await page.locator('.netlist-editor textarea').click();
page.once('dialog', (d) => d.accept('3'));
await page.keyboard.press('Control+g');
const sel = await page.locator('.netlist-editor textarea').evaluate((t) => t.value.slice(0, t.selectionStart).split('\n').length);
check(sel === 3, `Ctrl+G va a la línea 3 (${sel})`);
await page.keyboard.press('Alt+r');
await page.locator('.netlist-mode .status.ok, .netlist-mode .status.err').waitFor({ timeout: 30000 });
check((await page.locator('.netlist-mode .status.ok').count()) === 1, 'Alt+R simula la netlist');
await page.screenshot({ path: `${OUT}/shortcuts.png` });

check(errors.length === 0, `sin errores en la consola${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
if (failed) {
  console.log(`\n${failed} fallas`);
  process.exit(1);
}
console.log('\nE2E atajos OK');
