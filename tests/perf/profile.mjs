// Perfil de CPU (CDP) de un paso del benchmark, con el tiempo propio y total por función.
// Conviene contra un build sin minificar: npx vite build --minify false
// Uso: node tests/perf/profile.mjs <url> <archivo.asc> <hover|pan|wheel|move|undo|open>   (TRACE=1: fases de Blink)
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { chromium } from 'playwright-core';
const [URL, BIG, STEP] = process.argv.slice(2);
const CHROME = process.env.CHROMIUM ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => { localStorage.setItem('turbospice.lang', 'es'); localStorage.setItem('turbospice.welcomed', '1'); });
page.on('dialog', (d) => d.accept());
const cdp = await page.context().newCDPSession(page);
await page.goto(URL);
await page.locator('svg.editor .sym').first().waitFor({ timeout: 120000 });
const settle = () => page.evaluate(() => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 50))));
const open = async () => {
  const bytes = [...readFileSync(BIG)];
  await page.evaluate(({ name, bytes }) => { const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(bytes)], name)); window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }, { name: basename(BIG), bytes });
  const n = readFileSync(BIG, 'latin1').match(/^SYMBOL /gm).length;
  await page.waitForFunction((n) => document.querySelectorAll('svg.editor .symbols > .sym').length >= n, n, { timeout: 120000 });
  await settle();
};
const moves = (kind, n) => page.evaluate(async ({ kind, n }) => {
  const svg = document.querySelector('svg.editor'); const r = svg.getBoundingClientRect();
  const frame = () => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
  const at = (i) => ({ clientX: r.left + r.width * (0.2 + (0.6 * i) / n), clientY: r.top + r.height * (0.3 + (0.4 * i) / n) });
  const pe = (type, i, extra = {}) => svg.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse', ...at(i), ...extra }));
  if (kind === 'pan') pe('pointerdown', 0, { button: 1, buttons: 4 });
  for (let i = 0; i < n; i++) { if (kind === 'wheel') svg.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, ...at(n/2) })); else pe('pointermove', i, kind === 'pan' ? { buttons: 4 } : {}); await frame(); }
  if (kind === 'pan') pe('pointerup', n, { button: 1 });
}, { kind, n });
const moveAll = () => page.evaluate(async () => {
  const svg = document.querySelector('svg.editor'); const sym = document.querySelector('svg.editor .symbols > .sym').getBoundingClientRect();
  const frame = () => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
  const x = sym.left + sym.width / 2, y = sym.top + sym.height / 2;
  const pe = (type, dx, extra = {}) => svg.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse', clientX: x + dx, clientY: y + dx, ...extra }));
  pe('pointerdown', 0, { button: 0, buttons: 1 }); await frame();
  for (let i = 1; i <= 10; i++) { pe('pointermove', i * 4, { buttons: 1 }); await frame(); }
  pe('pointerup', 40, { button: 0 }); await frame();
});
if (STEP !== 'open') await open();
if (STEP === 'undo') { await page.keyboard.press('Control+a'); await settle(); await moveAll(); await settle(); }
if (STEP === 'move') { await page.keyboard.press('Control+a'); await settle(); }
const TRACE = !!process.env.TRACE;
const events = [];
if (TRACE) {
  cdp.on('Tracing.dataCollected', (d) => events.push(...d.value));
  await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'blink', 'cc', 'gpu'] } });
} else {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
}
const t0 = Date.now();
if (STEP === 'open') await open();
else if (STEP === 'undo') { await page.keyboard.press('Control+z'); await settle(); }
else if (STEP === 'move') await moveAll();
else await moves(STEP, 30);
const ms = Date.now() - t0;
if (TRACE) {
  // TRACE=1: tiempo por tipo de evento del hilo principal del renderer (estilo, layout, pintado…)
  const done = new Promise((res) => cdp.once('Tracing.tracingComplete', res));
  await cdp.send('Tracing.end');
  await done;
  const main = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
  const by = new Map();
  const n = new Map();
  for (const e of events) if (e.ph === 'X' && e.tid === main?.tid && e.pid === main?.pid && e.dur) {
    by.set(e.name, (by.get(e.name) ?? 0) + e.dur / 1000);
    n.set(e.name, (n.get(e.name) ?? 0) + 1);
  }
  console.log(`${STEP}: ${ms} ms (traza, hilo principal; ms totales × veces)`);
  [...by].sort((a, b) => b[1] - a[1]).slice(0, 18).forEach(([k, v]) => console.log(v.toFixed(0).padStart(7), `×${n.get(k)}`.padStart(5), k));
  await browser.close();
  process.exit(0);
}
const { profile } = await cdp.send('Profiler.stop');
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const dt = profile.timeDeltas; const self = new Map();
profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`; self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0) / 1000); });
// tiempo total (inclusivo) por función
const parent = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const total = new Map();
profile.samples.forEach((id, i) => { const seen = new Set(); for (let x = id; x !== undefined; x = parent.get(x)) { const n = byId.get(x); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`; if (!seen.has(k)) { seen.add(k); total.set(k, (total.get(k) ?? 0) + (dt[i] ?? 0) / 1000); } } });
console.log(`${STEP}: ${ms} ms\n-- self --`);
[...self].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log(v.toFixed(0).padStart(7), k));
console.log('-- total --');
[...total].sort((a, b) => b[1] - a[1]).slice(0, 45).forEach(([k, v]) => console.log(v.toFixed(0).padStart(7), k));
await browser.close();
