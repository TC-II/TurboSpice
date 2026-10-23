// E2E de codos y tramos de cables (#27): agregar un codo con doble click y arrastrarlo,
// arrastrar un tramo, Alt+click, deshacer; la netlist del archivo guardado no cambia.
// Uso: node tests/e2e/wires.mjs [url] [carpeta-capturas]   (con `npm run preview` corriendo)
import { mkdirSync, readFileSync } from 'node:fs';
import { skipWelcome, launchBrowser } from './lib.mjs';
import { buildBundle } from '../../scripts/build-library.mjs';
import { parseAsc } from '../../src/asc/parse.ts';
import { activeAsc, variantOf } from '../../src/project/project.ts';
import { parseTurbo } from '../../src/project/turbo.ts';
import { Library } from '../../src/library/library.ts';
import { ltNetlist, ltNetlistText } from '../../src/netlist/ltnetlist.ts';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';
const OUT = process.argv[3] ?? 'test-results';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
await skipWelcome(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
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
const drag = async (from, to, mods = []) => {
  const a = await at(...from);
  const b = await at(...to);
  for (const m of mods) await page.keyboard.down(m);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  for (const m of mods) await page.keyboard.up(m);
};
const lib = new Library(buildBundle());
let saves = 0;
const saved = async () => {
  // Chrome descarta una descarga automática pegada a la anterior: un respiro entre guardados
  await page.waitForTimeout(400);
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')]);
  const path = `${OUT}/wires-${saves++}.turbo`;
  await download.saveAs(path);
  // Ctrl+S guarda el proyecto (.turbo): el circuito es el de la variante activa
  const doc = parseAsc(activeAsc(variantOf((await parseTurbo(readFileSync(path, 'utf8'))).project)));
  return { doc, net: ltNetlistText(ltNetlist(doc, lib)), wires: doc.wires.map((w) => [w.x1, w.y1, w.x2, w.y2].join(' ')) };
};
const ortho = (d) => d.wires.every((w) => w.x1 === w.x2 || w.y1 === w.y2);

// R1 y R2 verticales unidos abajo por un cable en U, tierra arriba de R2
await page.keyboard.press('r');
// (la colocación queda centrada en el cuerpo: el origen va 16,48 arriba a la izquierda)
await click(16, 48);
await click(176, 48);
await page.keyboard.press('Escape');
await page.keyboard.press('w');
await click(16, 96);
await click(16, 160);
await click(176, 160);
await click(176, 96);
await page.keyboard.press('Escape');
await page.keyboard.press('g');
await click(176, 16);
await page.keyboard.press('Escape');
// la vista no debe moverse entre pasos (las coordenadas se calculan del viewBox)
const ref = await saved();
check(ref.doc.wires.length === 3 && /^R1 NC_\d+ N001/m.test(ref.net) && /^R2 0 N001/m.test(ref.net), `circuito armado:\n${ref.net.replace(/^/gm, '    ')}`);

// Doble click en el medio del tramo de abajo: agrega un codo; arrastrarlo cambia el recorrido
{
  const p = await at(96, 160);
  await page.mouse.dblclick(p.x, p.y);
  const s = await saved();
  check(s.doc.wires.length === 4 && s.net === ref.net, 'doble click parte el cable en un codo');
  await drag([96, 160], [96, 224]);
  const m = await saved();
  check(m.net === ref.net && ortho(m.doc) && m.wires.join() !== ref.wires.join(), `arrastrar el codo cambia el recorrido, no la netlist (${m.wires.length} tramos)`);
  // deshacer de un paso: vuelve al cable partido
  await page.keyboard.press('Control+z');
  const u = await saved();
  check(u.wires.join() === s.wires.join(), 'Ctrl+Z deshace el arrastre del codo en un paso');
  // doble click sobre el codo alineado lo quita
  await page.mouse.dblclick(p.x, p.y);
  const r = await saved();
  check(r.wires.join() === ref.wires.join(), 'doble click en el codo lo quita');
}

// Arrastrar el tramo de abajo lo desplaza en vertical y estira los verticales
await drag([96, 160], [96, 256]);
{
  const d = await saved();
  check(d.net === ref.net && d.doc.wires.length === 3 && d.wires.includes('16 256 176 256'), `arrastrar un tramo estira los vecinos: ${d.wires.join(' | ')}`);
  check((await page.locator('svg.editor .junctions circle').count()) === 0, 'sin puntos de unión de más');
}
await page.keyboard.press('Control+z');

// Alt+click y arrastre: agrega el codo y lo mueve en una sola operación
await drag([16, 128], [-48, 128], ['Alt']);
{
  const d = await saved();
  check(d.net === ref.net && ortho(d.doc) && d.wires.join() !== ref.wires.join(), `Alt+arrastre agrega un codo y lo mueve: ${d.wires.join(' | ')}`);
}
await page.keyboard.press('Control+z');
check((await saved()).wires.join() === ref.wires.join(), 'Ctrl+Z deshace el Alt+arrastre en un paso');

// Mover R1 hasta que su cable quede de largo 0: el cable desaparece y no queda nodo
await drag([16, 56], [16, 120]);
{
  const d = await saved();
  check(d.doc.wires.every((w) => w.x1 !== w.x2 || w.y1 !== w.y2) && d.net === ref.net, `mover R1 sobre su cable no deja cables de largo 0: ${d.wires.join(' | ')}`);
  check((await page.locator('svg.editor .junctions circle').count()) === 0, 'y no deja nodo');
}

// #45: un cable que atraviesa una resistencia se parte en sus pines (R en serie, no en corto)
const rNodes = (net, name) => net.match(new RegExp(`^${name} (\\S+) (\\S+)`, 'm'))?.slice(1) ?? [];
await page.keyboard.press('r');
await click(336, 48); // R3: pines en (336,16) y (336,96)
await page.keyboard.press('Escape');
const before = await saved();
await page.keyboard.press('w');
await click(336, -64);
await click(336, 176);
await page.keyboard.press('Escape');
{
  const d = await saved();
  const [a, b] = rNodes(d.net, 'R3');
  check(d.wires.includes('336 -64 336 16') && d.wires.includes('336 96 336 176') && !d.wires.some((w) => w === '336 -64 336 176'), `el cable queda partido en dos: ${d.wires.join(' | ')}`);
  check(a && b && a !== b, `R3 queda en serie, no en corto (${a} ${b})`);
  check((await page.locator('svg.editor .junctions circle').count()) === 0, 'sin nodos sobre el cuerpo');
  await page.keyboard.press('Control+z');
  check((await saved()).wires.join() === before.wires.join(), 'Ctrl+Z deshace el cable entero en un paso');
}
// …y mover un componente sobre un cable también lo deja en serie
await page.keyboard.press('w');
await click(416, -64);
await click(416, 176);
await page.keyboard.press('Escape');
await drag([336, 56], [416, 56]);
{
  const d = await saved();
  const [a, b] = rNodes(d.net, 'R3');
  check(d.wires.includes('416 -64 416 16') && d.wires.includes('416 96 416 176'), `mover R3 sobre un cable lo parte: ${d.wires.join(' | ')}`);
  check(a && b && a !== b, `y R3 queda en serie (${a} ${b})`);
}
// #50: colocar un componente nuevo sobre un cable existente también lo parte
await page.keyboard.press('w');
await click(496, -64);
await click(496, 176);
await page.keyboard.press('Escape');
{
  const wired = await saved();
  await page.keyboard.press('r');
  await click(496, 48); // R4: pines en (496,16) y (496,96)
  await page.keyboard.press('Escape');
  const d = await saved();
  const [a, b] = rNodes(d.net, 'R4');
  check(d.wires.includes('496 -64 496 16') && d.wires.includes('496 96 496 176') && !d.wires.includes('496 -64 496 176'), `colocar R4 sobre un cable lo parte: ${d.wires.join(' | ')}`);
  check(a && b && a !== b, `y R4 queda en serie (${a} ${b})`);
  await page.keyboard.press('Control+z');
  const u = await saved();
  check(u.wires.join() === wired.wires.join() && !/^R4 /m.test(u.net), 'Ctrl+Z deshace la colocación y el corte en un paso');
}

await page.screenshot({ path: `${OUT}/wires.png` });
check(errors.length === 0, `sin errores en la página${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} fallo(s)` : '\nE2E cables OK');
process.exit(failed ? 1 : 0);
