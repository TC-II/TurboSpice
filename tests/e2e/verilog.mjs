// E2E de los módulos Verilog (#209): «+ New › Verilog» crea uno; el módulo Verilog
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
// clk y rst a los pines del símbolo generado (div4 en 448,400: 96 de ancho por el nombre q[1:0] y
// dos filas, así que las entradas quedan en x=400, a y=384 y 416, y el bus q[1:0] en x=496, y=384)
const CIRCUIT = `Version 4
SHEET 1 880 680
WIRE 384 384 400 384
WIRE 384 416 400 416
WIRE 496 384 512 384
FLAG 96 240 clk
FLAG 96 320 0
FLAG 304 240 rst
FLAG 304 320 0
FLAG 384 384 clk
FLAG 384 416 rst
FLAG 512 384 q[1:0]
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
  await page.locator('.tree-newmenu .tree-add').click();
  await page.getByRole('menuitem', { name: kind }).click();
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
await page.locator('.tree-newmenu .tree-add').click();
check((await page.getByRole('menuitem').count()) === 3, 'módulo nuevo: el menú ofrece subcircuito, modelo o Verilog');
await page.locator('.tree-newmenu .tree-add').click();
await newModule('div4', 'Verilog');
check((await page.locator('.verilog-module strong').textContent()) === 'div4.v', 'abre la vista del módulo Verilog (código en lugar del esquemático)');
await code.fill(VERILOG);
await synthesize();
check((await status()) === 'Sintetizado', `sintetiza con Yosys (${await status()})`);
check((await page.locator('.vm-pins').textContent()).includes('q[1:0]'), `muestra los pines con el bus junto (${await page.locator('.vm-pins').textContent()})`);
check((await page.locator('.project-tree .tree-kind.verilog').count()) >= 1, 'aparece en el panel como módulo Verilog');
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
check((await page.locator('svg.editor .pinname', { hasText: 'q[1:0]' }).count()) === 1 && (await page.locator('svg.editor .buspin').count()) === 1, 'el símbolo muestra sus pines, con el bus q[1:0] marcado');
check((await page.locator('svg.editor .wires line.bus').count()) === 1, 'el cable del bus se dibuja grueso');
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
check((await page.locator('.status.ok').count()) === 1, `la simulación con el bloque Verilog anda (${await page.locator('.status').first().textContent()} ${await page.locator('.errors, .sim-errors, .log .err').first().textContent().catch(() => '')})`);
check(await addTrace('V(q[1])'), 'V(q[1]): un bit del bus de salida, analógico');
check(await addTrace('Dig(x1.q[1:0])'), 'Dig(x1.q[1:0]): el bus de los nodos digitales');
check(await addTrace('Dig(x1.q_0_d)'), 'Dig(x1.q_0_d): un bit');
check(JSON.stringify(await panes()) === JSON.stringify(['A:V(q[1])', 'D:Dig(x1.q[1:0]),Dig(x1.q_0_d)']), `lo digital va en un panel propio (${(await panes()).join(' | ')})`);
const values = await page.locator('.digital-lanes .dl-value').allTextContents();
check(values.slice(0, 4).join() === '0x0,0x1,0x2,0x3', `el bus muestra los valores en hex (${values.slice(0, 4)})`);
await page.getByRole('combobox', { name: 'Base de Dig(x1.q[1:0])' }).selectOption('bin');
await page.waitForTimeout(200);
check((await page.locator('.digital-lanes .dl-value').first().textContent()) === '0b00', 'y en binario al cambiar el radix');
check(!(await addTrace('Dig(x1.no_existe)')), 'un nodo digital que no existe da error');
// arrastrar una traza analógica a un panel digital no hace nada
const chip = page.locator('.pane:not(.digital) .trace-chip').first();
await chip.dragTo(page.locator('.pane.digital'));
check(JSON.stringify(await panes()) === JSON.stringify(['A:V(q[1])', 'D:Dig(x1.q[1:0]),Dig(x1.q_0_d)']), 'una traza analógica no se puede pasar a un panel digital');

// --- tri-state: la alta impedancia (Z) se ve distinta de lo desconocido (X) ---
await newModule('tri2', 'Verilog');
await code.fill(`module tri2 (input clk, input en, output [1:0] y);
  reg [1:0] q = 0;
  always @(posedge clk) q <= q + 1;
  assign y = en ? q : 2'bz;
endmodule
`);
await synthesize();
// (mismo lugar de los pines que div4: dos entradas y un bus de dos bits)
await page.evaluate((asc) => {
  const dt = new DataTransfer();
  dt.items.add(new File([asc], 'tri tb.asc'));
  dt.items.add(new File(['* vacío\n'], 'vacio.lib'));
  window.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
}, CIRCUIT.replace('SYMBOL div4', 'SYMBOL tri2').replace(/\brst\b/g, 'en').replace('PWL(0 5 20n 5 21n 0)', 'PWL(0 0 300n 0 301n 5 600n 5 601n 0)'));
await page.locator('.project-tree .tree-row[data-bench] .tree-name', { hasText: 'tri tb' }).click();
await page.waitForFunction(() => document.querySelectorAll('svg.editor .sym').length === 3 && !document.querySelector('.verilog-module'));
await simulate();
check(await addTrace('Dig(x1.y[1:0])'), 'Dig(x1.y[1:0]): un bus tri-state');
check(await addTrace('Dig(x1.y_0_d)'), 'Dig(x1.y_0_d): uno de sus bits');
const triValues = await page.locator('.digital-lanes .dl-value').allTextContents();
check(triValues.slice(0, 3).join() === 'Z,0x0,0x1', `el bus en alta impedancia muestra Z y después sus valores (${triValues.slice(0, 3)})`);
check((await page.locator('.digital-lanes g.dl-z').count()) === 2 && (await page.locator('.digital-lanes g.dl-x').count()) === 0, 'los tramos Z del bus se dibujan como Z, no como X');
check((await page.locator('.digital-lanes path.dl-z').count()) === 1 && (await page.locator('.digital-lanes path.dl-x').count()) === 0, 'y los del bit también');

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
await page.locator('.project-tree .tree-name', { hasText: /div4$/ }).click();
await page.locator('.verilog-module').waitFor();
check((await status()) === 'Sintetizado' && (await code.inputValue()).includes('module div4'), 'y se abre con su código, sintetizado');

check(errors.length === 0, `sin errores de consola${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
if (failed) {
  console.log(`\n${failed} chequeo(s) fallaron`);
  process.exit(1);
}
console.log('\nE2E Verilog OK');
