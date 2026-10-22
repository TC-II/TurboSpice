// E2E del editor: arma un filtro RC desde cero con los atajos de LTspice, simula, mide,
// deshace/rehace, guarda el .asc y verifica el archivo.
// Uso: node tests/e2e/editor.mjs [url] [carpeta-capturas]   (con `npm run preview` corriendo)
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { menu, openExample, skipWelcome } from './lib.mjs';
import { buildBundle } from '../../scripts/build-library.mjs';
import { decode } from '../../src/asc/encoding.ts';
import { parseAsc } from '../../src/asc/parse.ts';
import { Library } from '../../src/library/library.ts';
import { ltNetlist, ltNetlistText } from '../../src/netlist/ltnetlist.ts';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const OUT = process.argv[3] ?? 'test-results';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
await skipWelcome(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
// Forzar el guardado por descarga (el selector nativo de archivos no se puede automatizar)
await page.addInitScript(() => {
  delete window.showSaveFilePicker;
  delete window.showOpenFilePicker;
});

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed++;
};

await page.goto(URL);
await page.locator('[aria-label="Simular"]:enabled').waitFor({ timeout: 30000 });
await page.getByRole('button', { name: 'Nuevo' }).click();

const svg = page.locator('svg.editor');
const at = async (x, y) => {
  const box = await svg.boundingBox();
  const [vx, vy, vw, vh] = (await svg.getAttribute('viewBox')).split(' ').map(Number);
  return { x: box.x + ((x - vx) / vw) * box.width, y: box.y + ((y - vy) / vh) * box.height };
};
const click = async (x, y) => {
  const p = await at(x, y);
  await page.mouse.click(p.x, p.y);
};

// Fuente, resistencia horizontal (Ctrl+R), capacitor. El cursor marca el centro
// del símbolo: los orígenes quedan en V1 (0,0), R1 (112,-48) y C1 (80,-32)
await page.keyboard.press('v');
await click(0, 48);
await page.keyboard.press('Escape');
await page.keyboard.press('r');
await page.keyboard.press('Control+r');
await click(64, -32);
await page.keyboard.press('Escape');
await page.keyboard.press('c');
await click(96, 0);
await page.keyboard.press('Escape');
// Cable de V1+ al pin izquierdo de R1 (termina solo al llegar a un pin)
await page.keyboard.press('w');
await click(0, 16);
await click(0, -32); // cada click es un solo tramo
await click(16, -32);
await page.keyboard.press('Escape');
// Tierras
await page.keyboard.press('g');
await click(0, 96);
await click(96, 32);
await page.keyboard.press('Escape');
// Directiva (".", como en la configuración de LTspice)
await page.keyboard.press('.');
await page.locator('.modal textarea').fill('.tran 5m');
await page.keyboard.press('Control+Enter');
await click(0, 160);

check((await page.locator('svg.editor .symbols > g').count()) === 3, 'tres componentes colocados');

// Valores: doble click en R1 y C1
const setValue = async (x, y, v) => {
  const p = await at(x, y);
  await page.mouse.dblclick(p.x, p.y);
  await page.locator('.modal label.attr-row input:not([type=checkbox])').nth(1).fill(v);
  await page.keyboard.press('Enter');
};
await setValue(56, -32, '1k');
await setValue(96, 0, '1µ');
const p = await at(0, 56);
// doble click en la fuente: ventana de configuración (#47). Una fuente nueva arranca en
// Seno: con Enter ya queda una fuente válida
await page.mouse.dblclick(p.x, p.y);
const src = page.getByRole('dialog', { name: 'Fuente de tensión V1' });
check((await src.getByRole('tab', { selected: true }).textContent()) === 'Seno', 'una fuente nueva abre en Seno');
await page.keyboard.press('Enter');
check((await page.locator('svg.editor .sym text', { hasText: /^SINE\(/ }).count()) === 1, 'Enter deja la fuente en SINE(…)');
// …y al pasarla a Pulso el DC no queda como DC para .op
await page.mouse.dblclick(p.x, p.y);
await src.getByRole('tab', { name: 'Pulso' }).click();
for (const [k, v] of [['Ton', '2m'], ['Período', '4m'], ['Trise', '1u'], ['Tfall', '1u']]) await src.getByLabel(k, { exact: true }).fill(v);
await page.keyboard.press('Enter');
await page.screenshot({ path: `${OUT}/editor-1.png` });

// Simular y medir el nodo de salida
await page.getByRole('button', { name: 'Simular' }).click();
await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
check((await page.locator('.status.ok').count()) === 1, `simulación: ${await page.locator('.status').textContent()}`);
await page.waitForTimeout(300);
await click(96, -32);
const chips = await page.locator('.trace-chip .name').allTextContents();
// los pines se tocan sin cable: como en LTspice, la red se llama P001 (#109)
check(chips.some((c) => /^V\([np]\d+\)/i.test(c)), `punta de prueba en el nodo de salida: ${chips.join(', ')}`);
await page.screenshot({ path: `${OUT}/editor-2.png` });
await page.keyboard.press('Escape');

// Deshacer / rehacer el último cambio (valor de V1)
await page.keyboard.press('Control+z');
const afterUndo = await page.locator('svg.editor').textContent();
check(!afterUndo.includes('PULSE'), 'Ctrl+Z deshace el último cambio');
await page.keyboard.press('Control+y');
check((await page.locator('svg.editor').textContent()).includes('PULSE'), 'Ctrl+Y lo rehace');

// Guardar (descarga) y verificar el archivo
const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')]);
const path = `${OUT}/${download.suggestedFilename()}`;
await download.saveAs(path);
const doc = parseAsc(decode(new Uint8Array(readFileSync(path))).text);
const lib = new Library(buildBundle());
const net = ltNetlistText(ltNetlist(doc, lib));
check(doc.symbols.length === 3 && doc.flags.length === 2 && doc.texts.length === 1, 'archivo guardado con 3 símbolos, 2 tierras y 1 directiva');
check(doc.symbols.every((s) => s.windows.has(0) && s.windows.has(3) && s.attrs.has('Value') && s.attrs.has('Prefix')), 'todo explícito (WINDOW 0/3, Value, Prefix)');
check(/^R1 [NP]\d+ [NP]\d+ 1k$/m.test(net) && /^C1 [NP]\d+ 0 1u$/m.test(net) && /^V1 [NP]\d+ 0 PULSE/m.test(net), `netlist del archivo guardado:\n${net.replace(/^/gm, '    ')}`);

check(errors.length === 0, `sin errores de consola${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} fallo(s)` : '\nE2E editor OK');
process.exit(failed ? 1 : 0);
