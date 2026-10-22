// Benchmark de la interfaz (#perf): mide, con la CPU frenada para emular hardware modesto, la
// carga, abrir un esquemático grande y lo que se hace con el mouse (pasar por encima, panear,
// zoom, mover), y simular y navegar el gráfico. Imprime una tabla y, con --json, el detalle.
// Uso: node tests/perf/bench.mjs [url] [--cpu 4] [--asc archivo.asc] [--json salida.json]
//   (con `npm run dev` o `npm run preview` corriendo; CHROMIUM=ruta al navegador). Sin --asc usa
//   TC017 del corpus (817 símbolos, 1.638 cables) si está; si no, una grilla de 800 resistencias.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { chromium } from 'playwright-core';
import { skipWelcome } from '../e2e/lib.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : def;
};
const CPU = Number(opt('cpu', '4'));
const JSON_OUT = opt('json');
const BIG = opt('asc', 'C:/_DATA/ITBA/Repositorios GitHub/TC2-Sim/TC017 - Triangulo Estrella Kenelly.asc');
const URL = args[0] ?? 'http://localhost:5173/TurboSpice/';
const CHROME = process.env.CHROMIUM ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium'].find(existsSync);

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await skipWelcome(page);
page.on('dialog', (d) => d.accept());
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

const results = [];
const report = (name, ms, extra = '') => {
  results.push({ name, ms, extra });
  console.log(`${name.padEnd(42)} ${typeof ms === 'number' ? `${ms.toFixed(0).padStart(7)} ms` : String(ms).padStart(10)}  ${extra}`);
};
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return { med: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1] };
};
const frames = (name, xs) => {
  const s = stats(xs);
  report(name, s.med, `p95 ${s.p95.toFixed(0)} ms · máx ${s.max.toFixed(0)} ms (${xs.length} eventos)`);
};

// En la página: despacha eventos sobre el svg del editor y mide cada uno hasta el próximo cuadro
const interact = (kind, n) =>
  page.evaluate(
    async ({ kind, n }) => {
      const svg = document.querySelector('svg.editor');
      const r = svg.getBoundingClientRect();
      const frame = () => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
      const at = (i) => ({ clientX: r.left + r.width * (0.2 + (0.6 * i) / n), clientY: r.top + r.height * (0.3 + (0.4 * i) / n) });
      const pe = (type, i, extra = {}) => svg.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse', ...at(i), ...extra }));
      const out = [];
      if (kind === 'pan') pe('pointerdown', 0, { button: 1, buttons: 4 });
      await frame();
      for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        if (kind === 'wheel') svg.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: i < n / 2 ? -100 : 100, ...at(n / 2) }));
        else pe('pointermove', i, kind === 'pan' ? { buttons: 4 } : {});
        await frame();
        out.push(performance.now() - t0);
      }
      if (kind === 'pan') pe('pointerup', n, { button: 1 });
      await frame();
      return out;
    },
    { kind, n },
  );

const settle = () => page.evaluate(() => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 50))));
const heap = async () => (await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)) / 2 ** 20;

console.log(`CPU ×${CPU} · ${URL}\n`);

// --- Carga ---
let t0 = Date.now();
await page.goto(URL);
await page.locator('svg.editor .sym').first().waitFor({ timeout: 120000 });
report('carga hasta ver el esquemático', Date.now() - t0);
await page.locator('[aria-label="Simular"]:enabled').waitFor({ timeout: 120000 });
report('carga hasta poder simular (motor listo)', Date.now() - t0);
report('memoria JS tras la carga', `${(await heap()).toFixed(0)} MB`);

// --- Simulación del Sample Project y gráfico ---
t0 = Date.now();
await page.locator('[aria-label="Simular"]:enabled').click();
await page.locator('.results-panel').waitFor({ timeout: 60000 });
const traceInput = page.locator('.results-panel input[type=text], .results-panel input:not([type])').first();
await traceInput.fill('V(out)');
await traceInput.press('Enter');
await page.locator('.results-panel canvas').first().waitFor({ timeout: 60000 });
await settle();
report('simular el ejemplo hasta ver el gráfico', Date.now() - t0);
const plotWheel = await page.evaluate(async () => {
  const c = document.querySelector('.results-panel .u-over') ?? document.querySelector('.results-panel canvas');
  const r = c.getBoundingClientRect();
  const frame = () => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
  const out = [];
  for (let i = 0; i < 20; i++) {
    const t = performance.now();
    c.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: i < 10 ? -100 : 100, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    await frame();
    out.push(performance.now() - t);
  }
  return out;
});
frames('gráfico: zoom con la rueda (por evento)', plotWheel);
frames('esquemático chico: pasar el mouse (por evento)', await interact('hover', 60));

// --- Esquemático grande ---
/** 40 columnas de 20 resistencias en serie (si no está el del corpus) */
const grid = () => {
  const lines = ['Version 4', 'SHEET 1 6000 3000'];
  let n = 0;
  for (let c = 0; c < 40; c++)
    for (let r = 0; r < 20; r++) {
      lines.push(`SYMBOL res ${c * 128} ${r * 112} R0`, `SYMATTR InstName R${++n}`, `SYMATTR Value ${n}k`);
      if (r) lines.push(`WIRE ${c * 128 + 16} ${r * 112 - 16} ${c * 128 + 16} ${r * 112 + 16}`);
    }
  return Buffer.from(lines.join('\n'));
};
const bigBytes = existsSync(BIG) ? readFileSync(BIG) : grid();
const bigName = existsSync(BIG) ? basename(BIG) : 'grilla-800.asc';
const bytes = [...bigBytes];
t0 = Date.now();
await page.evaluate(
  ({ name, bytes }) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], name));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  },
  { name: bigName, bytes },
);
const nSym = bigBytes.toString('latin1').match(/^SYMBOL /gm)?.length || 1;
await page.waitForFunction((n) => document.querySelectorAll('svg.editor .symbols > .sym').length >= n, nSym, { timeout: 120000 });
await settle();
report(`abrir ${bigName} (${nSym} símbolos)`, Date.now() - t0);
report('memoria JS con el esquemático grande', `${(await heap()).toFixed(0)} MB`);
report('elementos del DOM del esquemático', `${await page.evaluate(() => document.querySelectorAll('svg.editor *').length)}`);
frames('grande: pasar el mouse (por evento)', await interact('hover', 60));
frames('grande: panear (por evento)', await interact('pan', 40));
frames('grande: zoom con la rueda (por evento)', await interact('wheel', 20));

// seleccionar todo y moverlo (la vista previa se recalcula en cada movimiento)
await page.keyboard.press('Control+a');
await settle();
const moveFrames = await page.evaluate(async () => {
  const svg = document.querySelector('svg.editor');
  const sym = document.querySelector('svg.editor .symbols > .sym').getBoundingClientRect();
  const frame = () => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
  const x = sym.left + sym.width / 2;
  const y = sym.top + sym.height / 2;
  const pe = (type, dx, extra = {}) => svg.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse', clientX: x + dx, clientY: y + dx, ...extra }));
  pe('pointerdown', 0, { button: 0, buttons: 1 });
  await frame();
  const out = [];
  for (let i = 1; i <= 20; i++) {
    const t = performance.now();
    pe('pointermove', i * 4, { buttons: 1 });
    await frame();
    out.push(performance.now() - t);
  }
  pe('pointerup', 80, { button: 0 });
  await frame();
  return out;
});
frames('grande: mover todo (por evento)', moveFrames);
t0 = Date.now();
await page.keyboard.press('Control+z');
await settle();
report('grande: deshacer', Date.now() - t0);

if (errors.length) console.log(`\nerrores en la página:\n  ${errors.join('\n  ')}`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ cpu: CPU, url: URL, results, errors }, null, 2));
await browser.close();
