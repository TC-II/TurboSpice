// Benchmark del visor: simula una transitoria larga (~500 mil puntos), arma dos paneles con
// varias trazas y mide, con la CPU frenada, lo que se hace sobre el gráfico (rueda, paneo, pasar
// el mouse, ocultar una traza, cambiar de modo cursor).
// Uso: node tests/perf/plot.mjs [url] [--cpu 4] [--asc archivo.asc|.turbo] [--json salida.json]
//   (con un .turbo se usan los paneles que trae guardados; si tiene un panel digital, se mide también)
//   (con `npm run dev` corriendo; CHROMIUM=ruta al navegador)
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
const ASC = opt('asc');
const TURBO = /\.turbo$/i.test(ASC ?? '');
const URL = args[0] ?? 'http://localhost:5173/TurboSpice/';
const CHROME = process.env.CHROMIUM ?? ['/usr/bin/chromium', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);

/** Seno de 1 kHz sobre un RC, 20 ms con paso máximo de 40 ns */
const DEFAULT = [
  'Version 4',
  'SHEET 1 880 680',
  'WIRE 0 16 0 -32',
  'WIRE 0 -32 80 -32',
  'WIRE 160 -32 240 -32',
  'WIRE 240 -32 304 -32',
  'WIRE 0 96 0 112',
  'WIRE 240 -32 240 16',
  'WIRE 240 112 240 80',
  'FLAG 304 -32 out',
  'FLAG 0 112 0',
  'FLAG 240 112 0',
  'FLAG 0 -32 in',
  'SYMBOL voltage 0 0 M0',
  'SYMATTR InstName V1',
  'SYMATTR Value SINE(0 1 1k)',
  'SYMBOL res 64 -48 M90',
  'SYMATTR InstName R1',
  'SYMATTR Value 1k',
  'SYMBOL cap 224 16 R0',
  'SYMATTR InstName C1',
  'SYMATTR Value 1u',
  'TEXT -208 176 Left 2 !.tran 0 20m 0 40n',
].join('\n');

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await skipWelcome(page);
page.on('dialog', (d) => d.accept());
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const results = [];
const report = (name, ms, extra = '') => {
  results.push({ name, ms, extra });
  console.log(`${name.padEnd(44)} ${typeof ms === 'number' ? `${ms.toFixed(0).padStart(7)} ms` : String(ms).padStart(10)}  ${extra}`);
};
const frames = (name, xs) => {
  const s = [...xs].sort((a, b) => a - b);
  report(name, s[Math.floor(s.length / 2)], `p95 ${s[Math.floor(s.length * 0.95)].toFixed(0)} ms · máx ${s[s.length - 1].toFixed(0)} ms (${xs.length} eventos)`);
};
// PROFILE=<paso> (pan, wheel, hover, hide): perfil de CPU de ese paso, por función
const PROFILE = process.env.PROFILE;
const profiled = async (step, run) => {
  // TRACE=<paso>: fases del navegador (estilos, layout, pintado…) en el hilo principal
  if (process.env.TRACE === step) {
    const events = [];
    cdp.on('Tracing.dataCollected', (d) => events.push(...d.value));
    const done = new Promise((res) => cdp.once('Tracing.tracingComplete', res));
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
    const out = await run();
    await cdp.send('Tracing.end');
    await done;
    const main = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
    const by = new Map();
    for (const e of events) if (e.ph === 'X' && e.dur && (!main || (e.pid === main.pid && e.tid === main.tid))) by.set(e.name, (by.get(e.name) ?? 0) + e.dur / 1000);
    console.log(`\n  fases de "${step}" (hilo principal, incluye anidadas):`);
    for (const [k, ms] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`    ${ms.toFixed(0).padStart(6)} ms  ${k}`);
    return out;
  }
  if (PROFILE !== step) return run();
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await cdp.send('Profiler.start');
  const out = await run();
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map();
  const dt = new Map();
  profile.samples.forEach((id, k) => dt.set(id, (dt.get(id) ?? 0) + (profile.timeDeltas[k] ?? 0)));
  for (const n of profile.nodes) {
    const f = n.callFrame;
    const key = `${f.functionName || '(anónima)'} ${f.url.split('/').pop().split('?')[0]}:${f.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (dt.get(n.id) ?? 0) / 1000);
  }
  console.log(`\n  perfil de "${step}" (tiempo propio):`);
  for (const [k, ms] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`    ${ms.toFixed(0).padStart(6)} ms  ${k}`);
  console.log('');
  return out;
};
const settle = () => page.evaluate(() => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 50))));

await page.goto(URL);
await page.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 120000 });

// abrir el circuito
const bytes = [...(ASC ? readFileSync(ASC) : Buffer.from(DEFAULT))];
await page.evaluate(
  ({ name, bytes }) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], name));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  },
  { name: ASC ? basename(ASC) : 'plot-bench.asc', bytes },
);
await page.waitForTimeout(1000);

const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
console.log(`CPU ×${CPU} · ${URL}\n`);

let t0 = Date.now();
await profiled('sim', async () => {
await page.locator('[aria-label="Correr"]:enabled').click();
await page.locator('.results-panel').waitFor({ timeout: 120000 });
const traceInput = page.locator('.results-panel input[type=text], .results-panel input:not([type])').first();
const addTrace = async (expr) => {
  await traceInput.fill(expr);
  await traceInput.press('Enter');
};
if (!TURBO) await addTrace('V(out)');
await page.locator('.results-panel .pane-chart canvas').first().waitFor({ timeout: 120000 });
await settle();
});
report('simular hasta ver el gráfico', Date.now() - t0);
const points = await page.evaluate(() => document.querySelector('.results-panel .pane-chart .uplot')?.dataset.rangeX);
report('rango X del gráfico', points ?? '?');

if (!TURBO) {
t0 = Date.now();
await addTrace('V(in)');
await settle();
report('agregar una traza (mismo panel)', Date.now() - t0);
t0 = Date.now();
await addTrace('I(R1)');
await settle();
report('agregar una corriente (eje derecho)', Date.now() - t0);

// segundo panel con dos trazas
t0 = Date.now();
await page.locator('.pane-add button').click();
await addTrace('V(in)-V(out)');
await page.locator('.results-panel .pane-chart').nth(1).locator('canvas').waitFor();
await settle();
report('panel nuevo con una expresión', Date.now() - t0);
await addTrace('V(out)*2');
await settle();
}
report('paneles', await page.evaluate(() => document.querySelectorAll('.results-panel .pane').length));

/** Eventos sobre el área del gráfico del panel `pane`, cada uno medido hasta el cuadro siguiente */
const onChart = (kind, n, pane = 0) =>
  page.evaluate(
    async ({ kind, n, pane }) => {
      const over = document.querySelectorAll('.results-panel .pane-chart .u-over')[pane];
      const root = over.closest('.uplot');
      const r = over.getBoundingClientRect();
      const frame = () => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
      const at = (i) => ({ clientX: r.left + r.width * (0.3 + (0.4 * i) / n), clientY: r.top + r.height / 2 });
      const pe = (target, type, i, extra = {}) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse', ...at(i), ...extra }));
      const me = (type, i) => over.dispatchEvent(new MouseEvent(type, { bubbles: true, ...at(i) }));
      const out = [];
      if (kind === 'pan') pe(root, 'pointerdown', 0, { button: 1, buttons: 4 });
      await frame();
      for (let i = 0; i < n; i++) {
        const t = performance.now();
        if (kind === 'wheel') root.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: i < n / 2 ? -120 : 120, ...at(n / 2) }));
        else if (kind === 'pan') pe(root, 'pointermove', i, { buttons: 4 });
        else (pe(root, 'pointermove', i), me('mousemove', i));
        await frame();
        out.push(performance.now() - t);
      }
      if (kind === 'pan') pe(root, 'pointerup', n, { button: 1 });
      await frame();
      return out;
    },
    { kind, n, pane },
  );

frames('rueda: zoom en X (por evento)', await profiled('wheel', () => onChart('wheel', 20)));
frames('paneo con el botón del medio (por evento)', await profiled('pan', () => onChart('pan', 30)));
frames('pasar el mouse (por evento)', await profiled('hover', () => onChart('hover', 40)));
await profiled('burst', () => fineWheel('.results-panel .pane-chart .uplot', 'rueda fina (500 eventos/s, medio segundo)'));

/**
 * Rueda fina o de giro libre: eventos chicos a 500 por segundo durante medio segundo (mitad
 * acercando, mitad alejando), cada uno en su propia tarea sin importar lo que tarde la página.
 * Mide los cuadros dibujados, el peor salto entre cuadros y lo que tarda en quedar quieto.
 */
async function fineWheel(selector, name) {
  const r = await page.evaluate(async (selector) => {
    const el = document.querySelector(selector);
    const b = el.getBoundingClientRect();
    const at = { clientX: b.left + b.width / 2, clientY: b.top + Math.min(b.height / 2, 40) };
    const frames = [];
    let on = true;
    const tick = (t) => (frames.push(t), on && requestAnimationFrame(tick));
    requestAnimationFrame(tick);
    const ch = new MessageChannel();
    const next = () => new Promise((res) => ((ch.port1.onmessage = res), ch.port2.postMessage(0)));
    const t0 = performance.now();
    let sent = 0;
    let events = 0;
    // (si la página se atrasa, los eventos pendientes llegan juntos en uno, como los junta el navegador)
    while (performance.now() - t0 < 500) {
      const due = Math.min(250, Math.floor((performance.now() - t0) / 2) + 1);
      if (due > sent) {
        let d = 0;
        for (; sent < due; sent++) d += sent < 125 ? -4 : 4;
        if (d) el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: d, ...at }));
        events++;
      }
      await next();
    }
    const tEnd = performance.now();
    // quieto: dos cuadros seguidos sin que cambie el rango
    const range = () => document.querySelector('.results-panel .pane-chart .uplot')?.dataset.rangeX;
    let last = range();
    let still = 0;
    while (still < 2) {
      await new Promise((res) => requestAnimationFrame(res));
      const now = range();
      still = now === last ? still + 1 : 0;
      last = now;
    }
    on = false;
    const gaps = frames.filter((t) => t <= tEnd).map((t, k, a) => (k ? t - a[k - 1] : 0)).slice(1);
    return { sent: events, frames: gaps.length, maxGap: Math.max(...gaps), settle: performance.now() - tEnd };
  }, selector);
  report(name, r.maxGap, `peor salto entre cuadros · ${r.frames} cuadros en 500 ms (${r.sent} eventos) · quieto ${r.settle.toFixed(0)} ms después`);
}

// panel digital (carriles en SVG): pasar el mouse y la rueda
if (await page.locator('.results-panel .digital-lanes').count()) {
  const lanes = (kind, n) =>
    page.evaluate(
      async ({ kind, n }) => {
        const el = document.querySelector('.results-panel .digital-lanes');
        const r = el.getBoundingClientRect();
        const frame = () => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
        const at = (i) => ({ clientX: r.left + 80 + (r.width - 120) * (0.1 + (0.8 * i) / n), clientY: r.top + 10 });
        const out = [];
        for (let i = 0; i < n; i++) {
          const t = performance.now();
          if (kind === 'wheel') el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: i < n / 2 ? -120 : 120, ...at(n / 2) }));
          else el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, pointerType: 'mouse', ...at(i) }));
          await frame();
          out.push(performance.now() - t);
        }
        return out;
      },
      { kind, n },
    );
  frames('digital: pasar el mouse (por evento)', await profiled('dhover', () => lanes('hover', 40)));
  frames('digital: rueda (por evento)', await profiled('dwheel', () => lanes('wheel', 20)));
  await page.locator('.fit-btn').click();
  await settle();
  await fineWheel('.results-panel .digital-lanes', 'digital: rueda fina (500 eventos/s)');
  // 8 eventos de 15 px acercan lo mismo que uno de 120 px (una muesca)
  const width = () => page.evaluate(() => document.querySelector('.results-panel .pane-chart .uplot')?.dataset.rangeX.split('|').reduce((a, b) => b - a));
  await page.locator('.fit-btn').click();
  await settle();
  const w0 = await width();
  await page.evaluate(async () => {
    const el = document.querySelector('.results-panel .digital-lanes');
    const r = el.getBoundingClientRect();
    for (let j = 0; j < 8; j++) el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -15, clientX: r.left + r.width / 2, clientY: r.top + 10 }));
  });
  await settle();
  const w1 = await width();
  report('digital: 8 eventos chicos acercan ×', (w1 / w0).toFixed(3), '(una muesca de 120 px: ×0.835)');
  await page.locator('.fit-btn').click();
  await settle();
}

/** Un click y el tiempo hasta el cuadro siguiente (lo que tarda React + uPlot en rehacer) */
const clickTime = (selector, nth = 0, text) =>
  page.evaluate(
    async ({ selector, nth, text }) => {
      const el = [...document.querySelectorAll(selector)].filter((e) => !text || e.textContent.trim() === text)[nth];
      const t = performance.now();
      el.click();
      await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
      return performance.now() - t;
    },
    { selector, nth, text },
  );
const repeat = async (name, selector, nth, n = 6, text) => {
  const xs = [];
  for (let i = 0; i < n; i++) {
    xs.push(await clickTime(selector, nth, text));
    await settle();
  }
  frames(name, xs);
};
// la traza 4 es la primera del segundo panel
if (!TURBO) await profiled('hide', () => repeat('ocultar/mostrar una traza del panel 2', '.results-panel .trace-chip .name', 3));
await repeat('ocultar/mostrar una traza del panel 1', '.results-panel .trace-chip .name', 0);
await repeat('activar/desactivar los cursores', 'button', 0, 6, 'Cursores');
await repeat('ajustar a la vista', '.fit-btn', 0, 4);

const heap = (await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)) / 2 ** 20;
report('memoria JS', `${heap.toFixed(0)} MB`);

if (errors.length) console.log(`\nerrores en la página:\n  ${errors.join('\n  ')}`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ cpu: CPU, url: URL, results, errors }, null, 2));
await browser.close();
