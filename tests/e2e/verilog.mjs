// E2E de los módulos Verilog (#209): «+ New › Verilog» crea uno; el módulo Verilog
// se edita y se sintetiza en su vista (código, pines, interfaz eléctrica); se coloca como cualquier
// subcircuito, con doble clic se baja a su código; las señales digitales van en un panel propio
// (buses con radix); el modo comportamiento (Icarus) corre retardos y $display; todo sigue ahí
// después de recargar.
// Uso: node tests/e2e/verilog.mjs [url]   (con `npm run preview` corriendo)
import { autosaved, frames, steady, skipWelcome, until, launchBrowser, sampleUrl } from './lib.mjs';

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
  await page.getByLabel('Correr', { exact: true }).click();
  await page.locator('.status.ok, .status.err').waitFor({ timeout: 60000 });
  // (al abrirse los resultados el esquemático se reacomoda)
  await steady(page);
};
const addTrace = async (expr) => {
  const input = page.getByPlaceholder('Agregar traza: V(out)/V(in), I(R1), @Q1[gm]…');
  await input.fill(expr);
  await input.press('Enter');
  await frames(page);
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

await page.goto(sampleUrl(URL));
await page.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });

// --- módulo nuevo: pregunta esquemático o Verilog ---
await openTree();
await page.locator('.tree-newmenu .tree-add').click();
check(
  (await page.getByRole('menuitem').count()) === 4 && (await page.getByRole('menuitem', { name: /Importar archivos/ }).count()) === 1,
  'módulo nuevo: el menú ofrece subcircuito, modelo, Verilog e importar archivos',
);
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
await frames(page);
check((await page.getByRole('textbox', { name: 'Umbral de entrada alta (VIH)' }).inputValue()) === '{0.7*vcc}', 'la familia 74HC pone VIH = 0,7·VCC');
// un error se marca en su línea
await code.fill(VERILOG.replace('q <= q + 1;', 'q <= ;'));
await synthesize();
// (el estado ya decía «Sintetizado» de antes: synthesize no espera a esta síntesis, sí al error)
await page
  .locator('.vm-gutter .err')
  .first()
  .waitFor({ timeout: 120000 })
  .catch(() => {});
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
// (cada .asc soltado es un workbench nuevo y su testbench queda abierto, #316)
await page.locator('.project-tree .tree-name', { hasText: 'div4 tb' }).waitFor();
await page.waitForFunction(() => document.querySelectorAll('svg.editor .sym').length === 3 && !document.querySelector('.verilog-module'));
check(
  (await page.locator('svg.editor .pinname', { hasText: 'q[1:0]' }).count()) === 1 && (await page.locator('svg.editor .buspin').count()) === 1,
  'el símbolo muestra sus pines, con el bus q[1:0] marcado',
);
check((await page.locator('svg.editor .wires line.bus').count()) === 1, 'el cable del bus se dibuja grueso');
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
check((await page.locator('svg.editor .loose rect').count()) === 0, 'todos los pines quedan conectados');

// --- doble clic: baja al código del módulo; Alt+↑ vuelve ---
const inst = page
  .locator('svg.editor .sym')
  .filter({ has: page.locator('text.win', { hasText: /^X1$/ }) })
  .locator('.body');
const ib = await inst.boundingBox();
await page.mouse.dblclick(ib.x + ib.width / 2, ib.y + ib.height / 2);
await page
  .locator('.verilog-module')
  .waitFor({ timeout: 5000 })
  .catch(() => {});
check((await page.locator('.verilog-module').count()) === 1 && (await code.inputValue()).includes('module div4'), 'doble clic en la instancia baja a su código');
await page.keyboard.press('Alt+ArrowUp');
await page.waitForFunction(() => !document.querySelector('.verilog-module'));

// --- simular: la salida analógica, y los nodos digitales en un panel aparte ---
await simulate();
check(
  (await page.locator('.status.ok').count()) === 1,
  `la simulación con el bloque Verilog anda (${await page.locator('.status').first().textContent()} ${await page
    .locator('.errors, .sim-errors, .log .err')
    .first()
    .textContent({ timeout: 500 })
    .catch(() => '')})`,
);
check(await addTrace('V(q[1])'), 'V(q[1]): un bit del bus de salida, analógico');
check(await addTrace('Dig(x1.q[1:0])'), 'Dig(x1.q[1:0]): el bus de los nodos digitales');
check(await addTrace('Dig(x1.q_0_d)'), 'Dig(x1.q_0_d): un bit');
check(JSON.stringify(await panes()) === JSON.stringify(['A:V(q[1])', 'D:Dig(x1.q[1:0]),Dig(x1.q_0_d)']), `lo digital va en un panel propio (${(await panes()).join(' | ')})`);
const values = await page.locator('.digital-lanes .dl-value').allTextContents();
check(values.slice(0, 4).join() === '0x0,0x1,0x2,0x3', `el bus muestra los valores en hex (${values.slice(0, 4)})`);
await page.getByRole('combobox', { name: 'Base de Dig(x1.q[1:0])' }).selectOption('bin');
await frames(page);
check((await page.locator('.digital-lanes .dl-value').first().textContent()) === '0b00', 'y en binario al cambiar el radix');
check(!(await addTrace('Dig(x1.no_existe)')), 'un nodo digital que no existe da error');
// la punta en el bus de salida: la traza digital con el nombre del cable, no el del nodo del bloque
{
  const svg = page.locator('svg.editor');
  const box = await svg.boundingBox();
  const [vx, vy, vw, vh] = (await svg.getAttribute('viewBox')).split(' ').map(Number);
  // (sin el foco en la caja de trazas: ahí la punta escribe)
  await page.evaluate(() => document.activeElement?.blur());
  await page.mouse.click(box.x + ((504 - vx) / vw) * box.width, box.y + ((384 - vy) / vh) * box.height);
  await frames(page);
  const digital = (await panes()).find((p) => p.startsWith('D:')) ?? '';
  check(digital.split(',').includes('Dig(q[1:0])'), `la punta en el bus q[1:0] grafica Dig(q[1:0]) (${digital})`);
  const vals = await page.locator('.pane.digital .digital-lanes .dl-lane').last().locator('.dl-value').allTextContents();
  check(vals.slice(0, 4).join() === '0x0,0x1,0x2,0x3', `y con los valores del bus (${vals.slice(0, 4)})`);
}
// arrastrar una traza analógica a un panel digital no hace nada
const chip = page.locator('.pane:not(.digital) .trace-chip').first();
await chip.dragTo(page.locator('.pane.digital'));
check(JSON.stringify(await panes()) === JSON.stringify(['A:V(q[1])', 'D:Dig(x1.q[1:0]),Dig(x1.q_0_d),Dig(q[1:0])']), 'una traza analógica no se puede pasar a un panel digital');

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
await page.evaluate(
  (asc) => {
    const dt = new DataTransfer();
    dt.items.add(new File([asc], 'tri tb.asc'));
    dt.items.add(new File(['* vacío\n'], 'vacio.lib'));
    window.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  },
  CIRCUIT.replace('SYMBOL div4', 'SYMBOL tri2')
    .replace(/\brst\b/g, 'en')
    .replace('PWL(0 5 20n 5 21n 0)', 'PWL(0 0 300n 0 301n 5 600n 5 601n 0)'),
);
// (cada .asc soltado es un workbench nuevo y su testbench queda abierto, #316)
await page.locator('.project-tree .tree-name', { hasText: 'tri tb' }).waitFor();
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
await code.fill(
  '`timescale 1ns/1ps\nmodule pulso(input clk, output reg y);\n  initial y = 0;\n  always @(posedge clk) begin\n    #20 y = 1;\n    #10 y = 0;\n    $display("pulso");\n  end\nendmodule\n',
);
check(await until(async () => (await page.locator('.vm-suggest').count()) === 1), 'sugiere el modo comportamiento (tiene retardos # y $display)');
await page.locator('.vm-suggest button').click();
await synthesize();
check((await status()) === 'Compilado (Icarus)', `compila con Icarus (${await status()})`);

// --- dos bloques de comportamiento en la misma simulación (van juntos en un módulo de Icarus) ---
await newModule('bdiv', 'Verilog');
await code.fill('`timescale 1ns/1ps\n' + VERILOG.replace('div4', 'bdiv').replace('q <= q + 1;', 'q <= #1 q + 1;'));
await until(async () => (await page.locator('.vm-suggest').count()) === 1);
await page.locator('.vm-suggest button').click();
await synthesize();
// (bdiv tiene los pines de div4: la segunda instancia, 256 más abajo, a q2[1:0])
await page.evaluate(
  (asc) => {
    const dt = new DataTransfer();
    dt.items.add(new File([asc], 'bdiv tb.asc'));
    dt.items.add(new File(['* vacío\n'], 'vacio.lib'));
    window.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  },
  CIRCUIT.replace('SYMBOL div4', 'SYMBOL bdiv').replace(
    'TEXT',
    'WIRE 384 640 400 640\nWIRE 384 672 400 672\nWIRE 496 640 512 640\nFLAG 384 640 clk\nFLAG 384 672 rst\nFLAG 512 640 q2[1:0]\nSYMBOL bdiv 448 656 R0\nSYMATTR InstName X2\nTEXT',
  ),
);
await page.locator('.project-tree .tree-name', { hasText: 'bdiv tb' }).waitFor();
await page.waitForFunction(() => document.querySelectorAll('svg.editor .sym').length === 4 && !document.querySelector('.verilog-module'));
await simulate();
check((await page.locator('.status.ok').count()) === 1, `dos bloques Icarus en la misma simulación (${await page.locator('.status').first().textContent()})`);
check((await addTrace('Dig(q[1:0])')) && (await addTrace('Dig(q2[1:0])')), 'Dig() de las salidas de los dos bloques');
{
  const lanes = page.locator('.pane.digital .digital-lanes .dl-lane');
  const a = await lanes.nth(0).locator('.dl-value').allTextContents();
  const b = await lanes.nth(1).locator('.dl-value').allTextContents();
  check(a.slice(0, 4).join() === '0x0,0x1,0x2,0x3' && b.slice(0, 4).join() === '0x0,0x1,0x2,0x3', `los dos cuentan (${a.slice(0, 4)} | ${b.slice(0, 4)})`);
}

// --- niveles entre familias: div4 (74HC) a 3,3 V maneja el reloj de otro div4 a 5 V (VIH = 3,5 V) ---
await page.evaluate(
  (asc) => {
    const dt = new DataTransfer();
    dt.items.add(new File([asc], 'niveles tb.asc'));
    dt.items.add(new File(['* vacío\n'], 'vacio.lib'));
    window.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  },
  CIRCUIT.replace('SYMATTR InstName X1', 'SYMATTR InstName X1\nSYMATTR SpiceLine vcc=3.3 vil={0.3*vcc} vih={0.7*vcc} vol=0 voh={vcc} iol=4m ioh=4m tr=6n tf=6n tpd=9n hdl=auto').replace(
    'TEXT',
    'WIRE 384 640 400 640\nWIRE 384 672 400 672\nWIRE 496 640 512 640\nFLAG 384 640 q[1]\nFLAG 384 672 rst\nFLAG 512 640 q2[1:0]\nSYMBOL div4 448 656 R0\nSYMATTR InstName X2\nTEXT',
  ),
);
await page.locator('.project-tree .tree-name', { hasText: 'niveles tb' }).waitFor();
await page.waitForFunction(() => document.querySelectorAll('svg.editor .sym').length === 4 && !document.querySelector('.verilog-module'));
await simulate();
check(
  await until(async () => /q\[1\]: un 1 de X1 \(3\.3 V\) no llega al VIH de X2 \(3\.5 V\): lee X/.test((await page.locator('body').textContent()) ?? '')),
  `avisa que un 1 de 3,3 V no llega al VIH de un 74HC a 5 V (${(await page.locator('.statusbar, .status-msg').allTextContents()).join(' | ')})`,
);
// (y esa red se simula analógica: el reloj, como lo lee X2, es X; sin flancos, X2 no cuenta)
check(await addTrace('Dig(x2.clk_d)'), 'Dig(x2.clk_d): el reloj adentro de X2');
check((await page.locator('.pane.digital .digital-lanes .dl-lane').last().locator('path.dl-x').count()) === 1, 'el reloj de X2 lee X, como en el circuito');
check(await addTrace('Dig(q2[1:0])'), 'Dig(q2[1:0])');
{
  const vals = await page.locator('.pane.digital .digital-lanes .dl-lane').last().locator('.dl-value').allTextContents();
  check(vals.join() === '0x0', `X2 no cuenta (${vals.slice(0, 4)})`);
}

// --- un testbench (*_tb.v): se corre solo, con PASS/FAIL ---
const TB = (want) =>
  '`timescale 1ns/1ps\nmodule bdiv_tb;\n  reg clk = 0, rst = 1;\n  wire [1:0] q;\n  bdiv u (.clk(clk), .rst(rst), .q(q));\n  always #5 clk = ~clk;\n  initial $dumpvars(0, bdiv_tb);\n' +
  // (una máquina de estados mínima: la onda de fase muestra los nombres de sus localparam)
  "  localparam ESPERA = 2'd0, CUENTA = 2'd1;\n  reg [1:0] fase;\n  initial fase = ESPERA;\n  always @(negedge rst) fase <= CUENTA;\n" +
  `  initial begin\n    #12 rst = 0;\n    @(posedge clk); @(posedge clk); #2;\n    if (q !== ${want}) $fatal(1, "FAIL: q=%d", q);\n    $display("PASS");\n    $finish;\n  end\nendmodule\n`;
await newModule('bdiv_tb', 'Verilog');
check(
  (await code.inputValue()).includes('module bdiv_tb;') && !(await page.locator('.project-tree').textContent()).includes('bdiv_tbverilog3 pines'),
  'la plantilla de un *_tb es un testbench, sin síntesis',
);
check(
  (await page.locator('.sub-simbar').textContent()).startsWith('Testbench bdiv_tb') && (await page.locator('.sub-hint-text').textContent()).startsWith('un testbench'),
  `las barras dicen que es un testbench (${await page.locator('.sub-simbar').textContent()})`,
);
check(
  (await page.locator('.vm-mode').count()) === 0 && (await page.locator('.vm-bar button.primary').textContent()) === 'Correr testbench',
  'un *_tb.v se corre: «Correr testbench», sin modo de síntesis',
);
const runTb = async (text) => {
  await code.fill(text);
  await page.locator('.vm-bar button.primary').click();
  await page.waitForFunction(() => /^(PASS|FAIL|Falló la compilación)$/.test(document.querySelector('.vm-status')?.textContent ?? ''), null, { timeout: 120000 });
  return status();
};
check((await runTb(TB(2))) === 'PASS' && (await page.locator('.vm-tb').textContent()).includes('$finish called'), `el testbench pasa (${await status()})`);
// las ondas del .vcd, abajo del código: las señales del testbench y, a pedido, las de adentro
{
  const names = () => page.locator('.vm-waves .dl-name title').allTextContents();
  check(JSON.stringify(await names()) === JSON.stringify(['q', 'clk', 'fase', 'rst']), `las ondas de $dumpvars: las señales del testbench (${await names()})`);
  const q = await page.locator('.vm-waves .dl-lane').nth(0).locator('.dl-value').allTextContents();
  check(q.join() === '0x0,0x1,0x2', `y el bus q cuenta (${q})`);
  const fase = await page.locator('.vm-waves .dl-lane').nth(2).locator('.dl-value').allTextContents();
  check(fase.join() === 'ESPERA,CUENTA', `fase, con los nombres de sus estados (${fase})`);
  await page.getByLabel('Base de los buses').selectOption('bcd');
  const bcd = await page.locator('.vm-waves .dl-lane').nth(0).locator('.dl-value').allTextContents();
  check(bcd.join() === '0,1,2', `en BCD (${bcd})`);
  await page.getByLabel('Módulos de adentro').check();
  check((await names()).includes('u.q'), `con los módulos de adentro, también u.q (${await names()})`);
}
check((await runTb(TB(3))) === 'FAIL' && (await page.locator('.vm-tb').textContent()).includes('FAIL: q='), `con otro valor esperado, $fatal da FAIL (${await status()})`);
check((await runTb(TB(2).replace('.q(q)', '.q(q[0])'))) === 'FAIL', `un warning de compilación es FAIL (${await page.locator('.vm-tb').textContent()})`);
check((await runTb(TB(2).replace('$finish;', '$finish'))) === 'Falló la compilación' && (await page.locator('.vm-gutter .err').count()) === 1, 'un error de sintaxis se marca en su línea');
await runTb(TB(2));
// un testbench con `include de un .vh y $readmemh de un .hex, soltados con él
await page.evaluate(() => {
  const dt = new DataTransfer();
  const tb =
    '`timescale 1ns/1ps\n`include "defs.vh"\nmodule rom_tb;\n  reg [`ANCHO-1:0] mem [0:3];\n  initial begin\n    $readmemh("datos.hex", mem);\n    #1;\n' +
    '    if (mem[2] !== 8\'hC3) $fatal(1, "FAIL: mem[2]=%h", mem[2]);\n    $display("PASS");\n    $finish;\n  end\nendmodule\n';
  dt.items.add(new File([tb], 'rom_tb.v'));
  dt.items.add(new File(['`define ANCHO 8\n'], 'defs.vh'));
  dt.items.add(new File(['A5\n5A\nC3\n3C\n'], 'datos.hex'));
  window.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
});
await page.locator('.project-tree .tree-name', { hasText: /rom_tb$/ }).click();
await page.locator('.verilog-module').waitFor();
check((await runTb(await code.inputValue())) === 'PASS', `con un .vh (\`include) y un .hex ($readmemh) del proyecto (${await page.locator('.vm-tb').textContent()})`);
await page.locator('.project-tree .tree-name', { hasText: /bdiv_tb$/ }).click();
await page.waitForFunction(() => document.querySelector('.verilog-module strong')?.textContent === 'bdiv_tb.v');
// el esquemático con bdiv sigue simulando (el testbench no se sintetiza antes)
// (la simulación del último workbench, «bdiv tb»)
await page.locator('.project-tree .tree-row[data-bench] .tree-name', { hasText: 'Tran 0 - 1µ' }).last().click();
await page.waitForFunction(() => !document.querySelector('.verilog-module'));
await simulate();
check((await page.locator('.status.ok').count()) === 1, `con un testbench en el proyecto, el esquemático sigue simulando (${await page.locator('.status').first().textContent()})`);

// --- biblioteca 74HC: el buscador la encuentra; al colocar una parte, su .v va al proyecto y se sintetiza ---
await page.keyboard.press('p');
await page.locator('.modal input').fill('74HC595');
const hc595 = page.locator('.picker-list li').filter({ has: page.locator('.path', { hasText: /^hc595$/ }) });
check((await hc595.count()) === 1, `el buscador encuentra el 74HC595 (${(await page.locator('.picker-list li').allTextContents()).slice(0, 2)})`);
await hc595.click();
{
  const svg = await page.locator('svg.editor').boundingBox();
  await page.mouse.click(svg.x + svg.width * 0.75, svg.y + svg.height * 0.5);
}
await page.keyboard.press('Escape');
await page.waitForFunction(() => /hc595: el símbolo está/.test(document.body.textContent ?? ''), null, { timeout: 120000 });
check((await page.locator('.project-tree .tree-name', { hasText: /hc595$/ }).count()) === 1, 'el 74HC595 queda en el proyecto, sintetizado');
check(
  (await page.locator('svg.editor .sym text', { hasText: /^SRCLK$/ }).count()) === 1 && (await page.locator('svg.editor .sym text', { hasText: /^11$/ }).count()) === 1,
  'su símbolo: los pines con su nombre y el número de patita (SRCLK, 11)',
);

// --- setup del 74HC74: D sube 5 ns antes del flanco de reloj (tsu = 20 ns) ---
await page.keyboard.press('p');
await page.locator('.picker input').fill('74HC74');
await page.locator('.picker-list li').filter({ hasText: 'hc7474HC ·' }).click();
{
  const svg = await page.locator('svg.editor').boundingBox();
  await page.mouse.click(svg.x + svg.width * 0.3, svg.y + svg.height * 0.3);
}
await page.keyboard.press('Escape');
await page.waitForFunction(() => /hc74: el símbolo está/.test(document.body.textContent ?? ''), null, { timeout: 120000 });
// (el 74 en 400,400: D, CLK, PRE_n y CLR_n en x = 304, de y = 352 a 448)
const FF = `Version 4
SHEET 1 880 680
FLAG 96 240 clk
FLAG 96 320 0
FLAG 304 240 d
FLAG 304 320 0
FLAG 560 240 hi
FLAG 560 320 0
FLAG 304 352 d
FLAG 304 384 clk
FLAG 304 416 hi
FLAG 304 448 hi
FLAG 496 352 q
FLAG 496 384 qn
SYMBOL voltage 96 224 R0
SYMATTR InstName V1
SYMATTR Value PULSE(0 5 100n 1n 1n 49n 100n)
SYMBOL voltage 304 224 R0
SYMATTR InstName V2
SYMATTR Value PWL(0 0 95n 0 96n 5)
SYMBOL voltage 560 224 R0
SYMATTR InstName V3
SYMATTR Value 5
SYMBOL hc74 400 400 R0
SYMATTR InstName U1
TEXT 96 528 Left 2 !.tran 300n
`;
await page.evaluate((asc) => {
  const dt = new DataTransfer();
  dt.items.add(new File([asc], 'setup tb.asc'));
  dt.items.add(new File(['* vacío\n'], 'vacio.lib'));
  window.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
}, FF);
await page.locator('.project-tree .tree-name', { hasText: 'setup tb' }).waitFor();
await page.waitForFunction(() => document.querySelectorAll('svg.editor .sym').length === 4 && !document.querySelector('.verilog-module'));
check((await page.locator('svg.editor .loose rect').count()) === 0, 'el 74HC74 queda con todos sus pines conectados');
await simulate();
check(
  await until(async () => /U1: D cambia [\d.]+ns antes del flanco de reloj en [\d.]+ns \(setup 20ns\)/.test((await page.locator('body').textContent()) ?? '')),
  `avisa el setup del 74HC74 (${(await page.locator('.statusbar, .status-msg').allTextContents()).join(' | ')})`,
);

// --- después de recargar, el módulo sigue sintetizado y se puede abrir ---
await autosaved(page);
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
