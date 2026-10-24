// E2E de los módulos Verilog (#209): «+ Nuevo» pregunta esquemático o Verilog; el módulo Verilog
// se edita y se sintetiza en su vista (código, pines, interfaz eléctrica); se coloca como cualquier
// subcircuito, con doble clic se baja a su código; las señales digitales van en un panel propio
// (buses con radix); el modo comportamiento (Icarus) corre retardos y $display; todo sigue ahí
// después de recargar.
// Uso: node tests/e2e/verilog.mjs [url]   (con `npm run preview` corriendo)
import { skipWelcome, launchBrowser } from './lib.mjs';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await skipWelcome(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(process.env.STACK ? e.stack : e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed++;
};

const VERILOG = `module div4 (input clk, input rst, output reg [1:0] q);
  always @(posedge clk or posedge rst)
    if (rst) q <= 0;
    else q <= q + 1;
endmodule
`;
// clk y rst a los pines del símbolo generado (div4 en 448,400: 64 de ancho y dos filas, así que las
// entradas quedan en x=416 y las salidas en x=480, a y=384 y 416)
const CIRCUIT = `Version 4
SHEET 1 880 680
WIRE 384 384 416 384
WIRE 384 416 416 416
WIRE 480 384 512 384
WIRE 480 416 512 416
FLAG 96 240 clk
FLAG 96 320 0
FLAG 304 240 rst
FLAG 304 320 0
FLAG 384 384 clk
FLAG 384 416 rst
FLAG 512 384 q1
FLAG 512 416 q0
SYMBOL voltage 96 224 R0
SYMATTR InstName V1
SYMATTR Value PULSE(0 5 0 1n 1n 49n 100n)
SYMBOL voltage 304 224 R0
SYMATTR InstName V2
SYMATTR Value PWL(0 5 20n 5 21n 0)
SYMBOL div4 448 400 R0
SYMATTR InstName X1
TEXT 96 528 Left 2 !.tran 1u
`;

const simulate = async () => {
  await page.getByRole('button', { name: 'Correr' }).click();
  await page.locator('.status.ok, .status.err').waitFor({ timeout: 60000 });
  await page.waitForTimeout(400);
};
const addTrace = async (expr) => {
  const input = page.getByPlaceholder('Agregar traza: V(out)/V(in), I(R1), @Q1[gm]…');
  await input.fill(expr);
  await input.press('Enter');
  await page.waitForTimeout(300);
  return (await input.inputValue()) === '';
};
const panes = () =>
  page.locator('.pane').evaluateAll((ps) => ps.map((p) => (p.classList.contains('digital') ? 'D:' : 'A:') + [...p.querySelectorAll('.trace-chip .name')].map((x) => x.textContent).join(',')));
const code = page.getByRole('textbox', { name: 'Código Verilog' });
const status = () => page.locator('.vm-status').textContent();
const openTree = async () => {
  if (!(await page.locator('.project-tree').count())) await page.getByRole('button', { name: 'Panel del proyecto', exact: true }).click();
};
const newModule = async (name, kind) => {
  await openTree();
  await page.getByRole('button', { name: 'Agregar un módulo' }).click();
  await page.locator('.new-module label', { hasText: kind }).locator('input').check();
  await page.locator('.new-module input[aria-label="Nombre"]').fill(name);
  await page.locator('.new-module button.primary').click();
  await page.locator('.verilog-module').waitFor();
};
const synthesize = async () => {
  await page.locator('.vm-bar button.primary').click();
  await page.waitForFunction(() => /Sintetizado|Compilado|Falló/.test(document.querySelector('.vm-status')?.textContent ?? ''), null, { timeout: 120000 });
};

await page.goto(URL);
await page.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });

// --- módulo nuevo: pregunta esquemático o Verilog ---
await openTree();
await page.getByRole('button', { name: 'Agregar un módulo' }).click();
check((await page.locator('.new-module input[type=radio]').count()) === 2, 'módulo nuevo: pregunta esquemático o Verilog');
await page.locator('.new-module button', { hasText: 'Cancelar' }).click();
await newModule('div4', 'Verilog');
check((await page.locator('.verilog-module strong').textContent()) === 'div4.v', 'abre la vista del módulo Verilog (código en lugar del esquemático)');
await code.fill(VERILOG);
await synthesize();
check((await status()) === 'Sintetizado', `sintetiza con Yosys (${await status()})`);
check((await page.locator('.vm-pins').textContent()).includes('q_1'), `muestra los pines (${await page.locator('.vm-pins').textContent()})`);
check((await page.locator('.project-tree .tree-glyph.verilog').count()) >= 1, 'aparece en el panel como módulo Verilog');
// interfaz eléctrica: una familia lógica cambia los parámetros del símbolo
await page.getByRole('combobox', { name: 'Familia lógica' }).selectOption({ label: '74HC (CMOS 5 V)' });
await page.waitForTimeout(300);
check((await page.getByRole('textbox', { name: 'Umbral de entrada alta (VIH)' }).inputValue()) === '3.5', 'la familia 74HC pone VIH = 3,5 V');
// un error se marca en su línea
await code.fill(VERILOG.replace('q <= q + 1;', 'q <= ;'));
await synthesize();
check((await page.locator('.vm-side .err').count()) > 0 && (await page.locator('.vm-gutter .err').count()) === 1, 'un error de sintaxis se muestra y marca su línea');
await code.fill(VERILOG);
await synthesize();

// --- colocarlo (un testbench nuevo con el bloque, como al arrastrar archivos) ---
await page.evaluate((asc) => {
  const dt = new DataTransfer();
  dt.items.add(new File([asc], 'div4 tb.asc'));
  dt.items.add(new File(['* vacío\n'], 'vacio.lib'));
  window.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
}, CIRCUIT);
await page.locator('.project-tree .tree-row[data-bench] .tree-name', { hasText: 'div4 tb' }).click();
await page.waitForFunction(() => document.querySelectorAll('svg.editor .sym').length === 3 && !document.querySelector('.verilog-module'));
check((await page.locator('svg.editor .pinname', { hasText: 'q_1' }).count()) === 1, 'el símbolo muestra el nombre de sus pines');
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
check((await page.locator('svg.editor .loose rect').count()) === 0, 'todos los pines quedan conectados');

// --- doble clic: baja al código del módulo; Alt+↑ vuelve ---
const inst = page.locator('svg.editor .sym').filter({ has: page.locator('text.win', { hasText: /^X1$/ }) }).locator('.body');
const ib = await inst.boundingBox();
await page.mouse.dblclick(ib.x + ib.width / 2, ib.y + ib.height / 2);
await page.locator('.verilog-module').waitFor({ timeout: 5000 }).catch(() => {});
check((await page.locator('.verilog-module').count()) === 1 && (await code.inputValue()).includes('module div4'), 'doble clic en la instancia baja a su código');
await page.keyboard.press('Alt+ArrowUp');
await page.waitForFunction(() => !document.querySelector('.verilog-module'));

// --- simular: la salida analógica, y los nodos digitales en un panel aparte ---
await simulate();
check((await page.locator('.status.ok').count()) === 1, 'la simulación con el bloque Verilog anda');
check(await addTrace('V(q1)'), 'V(q1): la salida analógica del bloque');
check(await addTrace('Dig(x1.q[1:0])'), 'Dig(x1.q[1:0]): el bus de los nodos digitales');
check(await addTrace('Dig(x1.q_0_d)'), 'Dig(x1.q_0_d): un bit');
check(JSON.stringify(await panes()) === JSON.stringify(['A:V(q1)', 'D:Dig(x1.q[1:0]),Dig(x1.q_0_d)']), `lo digital va en un panel propio (${(await panes()).join(' | ')})`);
const values = await page.locator('.digital-lanes .dl-value').allTextContents();
check(values.slice(0, 4).join() === '0x0,0x1,0x2,0x3', `el bus muestra los valores en hex (${values.slice(0, 4)})`);
await page.getByRole('combobox', { name: 'Base de Dig(x1.q[1:0])' }).selectOption('bin');
await page.waitForTimeout(200);
check((await page.locator('.digital-lanes .dl-value').first().textContent()) === '0b00', 'y en binario al cambiar el radix');
check(!(await addTrace('Dig(x1.no_existe)')), 'un nodo digital que no existe da error');
// arrastrar una traza analógica a un panel digital no hace nada
const chip = page.locator('.pane:not(.digital) .trace-chip').first();
await chip.dragTo(page.locator('.pane.digital'));
check(JSON.stringify(await panes()) === JSON.stringify(['A:V(q1)', 'D:Dig(x1.q[1:0]),Dig(x1.q_0_d)']), 'una traza analógica no se puede pasar a un panel digital');

// --- comportamiento (Icarus): retardos y $display ---
await newModule('pulso', 'Verilog');
await code.fill('`timescale 1ns/1ps\nmodule pulso(input clk, output reg y);\n  initial y = 0;\n  always @(posedge clk) begin\n    #20 y = 1;\n    #10 y = 0;\n    $display("pulso");\n  end\nendmodule\n');
await page.waitForTimeout(600);
check((await page.locator('.vm-suggest').count()) === 1, 'sugiere el modo comportamiento (tiene retardos # y $display)');
await page.locator('.vm-suggest button').click();
await synthesize();
check((await status()) === 'Compilado (Icarus)', `compila con Icarus (${await status()})`);

// --- después de recargar, el módulo sigue sintetizado y se puede abrir ---
await page.waitForTimeout(1500); // autoguardado
await page.reload();
await page.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });
await openTree();
check((await page.locator('.project-tree .tree-name', { hasText: 'div4' }).count()) >= 1, 'después de recargar, div4 sigue en el panel');
await page.locator('.project-tree .tree-name', { hasText: /^\s*V\s*div4$/ }).click();
await page.locator('.verilog-module').waitFor();
check((await status()) === 'Sintetizado' && (await code.inputValue()).includes('module div4'), 'y se abre con su código, sintetizado');

check(errors.length === 0, `sin errores de consola${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
if (failed) {
  console.log(`\n${failed} chequeo(s) fallaron`);
  process.exit(1);
}
console.log('\nE2E Verilog OK');
