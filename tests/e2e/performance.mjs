// E2E de los cambios de rendimiento (#186, #187, #189, #191, #195): en un esquemático pesado el paneo y
// la rueda mueven el dibujo con un transform CSS y al terminar la vista queda donde debe; la barra
// de estado sigue al mouse; las listas de pasivos llegan aparte; el motor queda en Cache Storage
// y la segunda carga no lo vuelve a bajar.
// Uso: node tests/e2e/performance.mjs [url] [carpeta-capturas]   (con `npm run preview` corriendo)
import { mkdirSync } from 'node:fs';
import { FIREFOX, launchBrowser, skipWelcome } from './lib.mjs';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const OUT = process.argv[3] ?? 'test-results';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
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

// la librería de arranque no trae las listas de pasivos: llegan aparte, después (#189)
const libRequests = [];
page.on('request', (r) => /library\/(bundle|cmp-passives)\.json/.test(r.url()) && libRequests.push(r.url().split('/').pop()));
await page.goto(URL);
await page.locator('[aria-label="Simular"]:enabled').waitFor({ timeout: 60000 });
await page.locator('svg.editor .sym').first().waitFor();
await page.waitForTimeout(500);
check(libRequests[0] === 'bundle.json' && libRequests.includes('cmp-passives.json'), `librería y después las listas de pasivos (${libRequests.join(', ')})`);

// --- Motor en Cache Storage (#191) ---
const cached = await page.evaluate(async () => {
  const c = await caches.open('turbospice-engine');
  return (await c.keys()).map((r) => r.url.split('/').pop());
});
check(cached.some((u) => /^ngspice\.wasm\?v=\w+$/.test(u)) && cached.some((u) => /^analog\.cm\?v=/.test(u)), `motor guardado con su hash (${cached.length} archivos)`);
const engineRequests = [];
page.on('request', (r) => /engine\/(ngspice\.wasm|\w+\.cm)$/.test(r.url()) && engineRequests.push(r.url()));
await page.reload();
await page.locator('[aria-label="Simular"]:enabled').waitFor({ timeout: 60000 });
check(engineRequests.length === 0, `la segunda carga no vuelve a bajar el motor (${engineRequests.length} pedidos)`);
// y simula con el motor de la caché
await page.locator('[aria-label="Simular"]:enabled').click();
await page.locator('.sim-state.ok').waitFor({ timeout: 30000 });
check((await page.locator('.sim-state.err').count()) === 0, 'simula con el motor de la caché');

// --- Esquemático pesado: 20 × 16 resistencias en serie por columnas ---
const lines = ['Version 4', 'SHEET 1 3000 3000'];
let n = 0;
for (let c = 0; c < 20; c++) {
  for (let r = 0; r < 16; r++) {
    const x = c * 128;
    const y = r * 112;
    lines.push(`SYMBOL res ${x} ${y} R0`, `SYMATTR InstName R${++n}`, `SYMATTR Value ${n}k`);
    // del pin de abajo de la anterior (y − 16) al de arriba de ésta (y + 16)
    if (r) lines.push(`WIRE ${x + 16} ${y - 16} ${x + 16} ${y + 16}`);
  }
}
await page.evaluate((text) => {
  const dt = new DataTransfer();
  dt.items.add(new File([text], 'pesado.asc'));
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
}, lines.join('\n'));
await page.waitForFunction((n) => document.querySelectorAll('svg.editor .symbols > .sym').length >= n, n);
const nodes = await page.evaluate(() => document.querySelector('svg.editor').getElementsByTagName('*').length);
check(nodes > 1500, `esquemático pesado (${nodes} nodos SVG)`);

const svg = page.locator('svg.editor');
const box = await svg.boundingBox();
/** punto del esquemático bajo un punto de la pantalla (con el viewBox aplicado) */
const docAt = async (p) => {
  const [vx, vy, vw, vh] = (await svg.getAttribute('viewBox')).split(' ').map(Number);
  return { x: vx + ((p.x - box.x) / box.width) * vw, y: vy + ((p.y - box.y) / box.height) * vh };
};
const transform = () => svg.evaluate((el) => el.style.transform);
const near = (a, b, tol) => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;

// --- Paneo con el botón del medio (#186) ---
const P = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
const before = await docAt(P);
await page.mouse.move(P.x, P.y);
await page.mouse.down({ button: 'middle' });
await page.mouse.move(P.x + 60, P.y + 40, { steps: 3 });
await page.mouse.move(P.x + 120, P.y + 80, { steps: 3 });
const during = await transform();
check(/translate/.test(during), `durante el paneo se mueve el dibujo ya pintado (${during})`);
await page.mouse.up({ button: 'middle' });
await page.waitForTimeout(100);
check((await transform()) === '', 'al soltar se saca el transform');
const after = await docAt({ x: P.x + 120, y: P.y + 80 });
check(near(after, before, 1), `el punto agarrado queda bajo el mouse (${before.x.toFixed(1)},${before.y.toFixed(1)} → ${after.x.toFixed(1)},${after.y.toFixed(1)})`);

// --- Rueda: zoom alrededor del cursor ---
const Q = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.6 };
const vw0 = Number((await svg.getAttribute('viewBox')).split(' ')[2]);
const q0 = await docAt(Q);
await page.mouse.move(Q.x, Q.y);
await page.mouse.wheel(0, -200);
await page.mouse.wheel(0, -200);
check(/scale/.test(await transform()), 'durante la rueda se escala el dibujo ya pintado');
await page.waitForTimeout(400);
check((await transform()) === '', '150 ms después del último giro se aplica la vista');
const vw1 = Number((await svg.getAttribute('viewBox')).split(' ')[2]);
const q1 = await docAt(Q);
check(vw1 < vw0 * 0.75, `acercó (ancho ${vw0.toFixed(0)} → ${vw1.toFixed(0)})`);
check(near(q1, q0, 1.5), `el punto bajo el cursor queda fijo (${q0.x.toFixed(1)},${q0.y.toFixed(1)} → ${q1.x.toFixed(1)},${q1.y.toFixed(1)})`);
// alejar mucho: la rueda sobre el borde vacío (fuera del svg escalado) sigue haciendo zoom
for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 120);
await page.waitForTimeout(400);
const vw2 = Number((await svg.getAttribute('viewBox')).split(' ')[2]);
check(vw2 > vw1 * 2 && (await transform()) === '', `alejó (ancho ${vw1.toFixed(0)} → ${vw2.toFixed(0)}) y quedó sin transform`);

// --- Barra de estado (#187): sigue lo que hay bajo el mouse ---
// (el medio del cuerpo de R5, en (0, 448): entre sus pines (16, 464) y (16, 544), lejos de los cables;
// el centro de la caja del <g> cae sobre el cable de arriba en Firefox)
const screenAt = async (d) => {
  const [vx, vy, vw, vh] = (await svg.getAttribute('viewBox')).split(' ').map(Number);
  return { x: box.x + ((d.x - vx) / vw) * box.width, y: box.y + ((d.y - vy) / vh) * box.height };
};
const r5 = await screenAt({ x: 16, y: 504 });
await page.mouse.move(r5.x, r5.y);
await page.waitForTimeout(100);
const hint = await page.locator('.hint-bar').textContent();
// (en Firefox el punto se detecta corrido y da el cable de arriba, también antes de estos cambios: #196)
if (!FIREFOX) check(/R5/.test(hint), `la barra de estado muestra el componente bajo el mouse (${hint})`);
else check(/\S/.test(hint), `la barra de estado sigue al mouse (${hint}; el componente exacto, #196)`);

// --- Mover todo y deshacer en el esquemático pesado (#183, #184) ---
await page.keyboard.press('Control+a');
const t0 = Date.now();
await page.mouse.move(r5.x, r5.y);
await page.mouse.down();
await page.mouse.move(r5.x + 64, r5.y + 32, { steps: 4 });
// todo seleccionado: se traslada el dibujo ya armado y el documento se arma al soltar (#195)
const shifted = await page.evaluate(() => document.querySelector('svg.editor g.schematic').getAttribute('transform'));
check(/translate/.test(shifted ?? ''), `mover todo traslada el dibujo (${shifted})`);
await page.mouse.up();
await page.waitForTimeout(50);
const moved = await page.evaluate(() => ({
  t: document.querySelector('svg.editor g.schematic').getAttribute('transform'),
  x: document.querySelector('svg.editor .symbols > .sym .body')?.getAttribute('transform'),
}));
check(moved.t === null && !/^matrix\(1 0 0 1 0 0\)$/.test(moved.x ?? ''), `al soltar queda el documento movido, sin traslación (${moved.x})`);
await page.keyboard.press('Control+z');
await page.waitForTimeout(50);
check(Date.now() - t0 < 5000, `seleccionar todo, mover y deshacer en ${Date.now() - t0} ms`);

// --- Nivel de detalle (#195): al alejar, los textos de menos de ~3 px no se dibujan ---
const textShown = () => page.evaluate(() => getComputedStyle(document.querySelector('svg.editor .symbols text.win')).display !== 'none');
const pxPerUnit = async () => box.width / Number((await svg.getAttribute('viewBox')).split(' ')[2]);
const C = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
await page.mouse.move(C.x, C.y);
for (let i = 0; i < 20 && (await pxPerUnit()) > 0.1; i++) {
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(250);
}
check(!(await textShown()), `alejado (${(await pxPerUnit()).toFixed(3)} px por unidad) no se dibujan los rótulos`);
for (let i = 0; i < 20 && (await pxPerUnit()) < 1; i++) {
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(250);
}
check(await textShown(), `de cerca (${(await pxPerUnit()).toFixed(2)} px por unidad) sí`);

await page.screenshot({ path: `${OUT}/performance.png` });
check(!errors.length, `sin errores en la página${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} fallaron` : '\ntodo bien');
process.exit(failed ? 1 : 0);
