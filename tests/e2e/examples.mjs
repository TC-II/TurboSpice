// E2E: abre la app, simula cada ejemplo y guarda capturas.
// Uso: node tests/e2e/examples.mjs [url] [carpeta-capturas]
// Requiere un Chromium instalado (CHROMIUM o /usr/bin/chromium) y `npm run preview` corriendo.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const OUT = process.argv[3] ?? 'test-results';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
let failed = 0;
for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: scheme });
  const consoleErrors = [];
  // la consola no dice qué URL falló: las respuestas con error se registran aparte
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && consoleErrors.push(`HTTP ${r.status()} ${r.url()}`));
  page.on('pageerror', (e) => consoleErrors.push(e.message));

  await page.goto(URL);
  await page.getByText('Listo').waitFor({ timeout: 30000 });
  const examples = await page.locator('select[aria-label="Ejemplos"] option').allTextContents();

  for (const [i, name] of examples.entries()) {
    await page.selectOption('select[aria-label="Ejemplos"]', name);
    await page.getByRole('button', { name: 'Simular' }).click();
    const status = page.locator('.status.ok, .status.err');
    await status.waitFor({ timeout: 30000 });
    const text = await status.textContent();
    const ok = (await status.getAttribute('class')).includes('ok');
    const hasOutput = (await page.locator('.plot canvas, .scalars').count()) > 0;
    if (!ok || !hasOutput) failed++;
    console.log(`${ok && hasOutput ? '✓' : '✗'} [${scheme}] ${name}: ${text}${hasOutput ? '' : ' (sin gráfico/tabla)'}`);
    if (scheme === 'light' || i === 1) await page.screenshot({ path: `${OUT}/${scheme}-${i}.png` });
  }

  // Abortar una simulación larga
  await page.locator('textarea').fill(
    `* larga\nV1 in 0 SIN(0 1 1k)\nR1 in out 1k\nC1 out 0 1u\n.tran 10n 2\n.end`,
  );
  await page.getByRole('button', { name: 'Simular' }).click();
  await page.getByRole('button', { name: 'Abortar' }).click({ timeout: 5000 });
  await page.getByText('Simulación abortada').waitFor({ timeout: 5000 });
  await page.getByText('Listo').waitFor({ timeout: 30000 });
  console.log(`✓ [${scheme}] abortar y reiniciar motor`);

  if (consoleErrors.length) {
    failed++;
    console.log(`✗ [${scheme}] errores de consola:\n  ${consoleErrors.join('\n  ')}`);
  }
  await page.close();
}
await browser.close();
console.log(failed ? `\n${failed} fallo(s)` : '\nE2E OK');
process.exit(failed ? 1 : 0);
