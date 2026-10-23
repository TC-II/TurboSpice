// E2E de Verilog (#209): crear un .v en Archivos del proyecto, sintetizarlo con Yosys (en su Worker),
// colocar el símbolo generado, simular, graficar la salida y un nodo digital de adentro, y que todo
// siga ahí después de recargar (autoguardado del proyecto).
// Uso: node tests/e2e/verilog.mjs [url]   (con `npm run preview` corriendo)
import { menu, skipWelcome, launchBrowser, FIREFOX } from './lib.mjs';

const URL = process.argv[2] ?? 'http://localhost:4173/TurboSpice/';

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
if (!FIREFOX) await context.grantPermissions(['clipboard-read', 'clipboard-write']);
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
  await page.locator('.status.ok, .status.err').waitFor({ timeout: 30000 });
  await page.waitForTimeout(400);
};
const addTrace = async (expr) => {
  const input = page.getByPlaceholder('Agregar traza: V(out)/V(in), I(R1), @Q1[gm]…');
  await input.fill(expr);
  await input.press('Enter');
  await page.waitForTimeout(300);
  return (await input.inputValue()) === '';
};
const chips = () => page.locator('.trace-chip .name').allTextContents();

await page.goto(URL);
await page.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });

// --- crear el Verilog y sintetizarlo ---
await menu(page, 'Archivo', 'Archivos del proyecto…');
await page.getByRole('button', { name: 'Archivo Verilog nuevo…' }).click();
await page.getByRole('textbox', { name: 'Nombre del archivo' }).fill('div4.v');
await page.getByRole('textbox', { name: 'Código Verilog' }).fill(VERILOG);
await page.getByRole('button', { name: 'Sintetizar', exact: true }).click();
await page.locator('.verilogdlg .ok, .verilogdlg .err').waitFor({ timeout: 120000 });
const ok = await page.locator('.verilogdlg .ok').textContent().catch(() => '');
check(/div4.*clk rst.*q_1 q_0/.test(ok ?? ''), `Sintetizar muestra el módulo y sus pines (${ok})`);
await page.locator('.verilogdlg button.primary').click();
await page.getByText('Pines: clk rst q_1 q_0').waitFor({ timeout: 30000 });
const listed = await page.locator('.userfiles-section code').allTextContents();
check(['div4.v', 'div4.sub', 'div4.asy'].every((f) => listed.includes(f)), `Guardar agrega el .v, su .sub y su .asy al proyecto (${listed.join(', ')})`);
await page.getByRole('button', { name: 'Cerrar' }).click();

// --- un error de sintaxis se muestra en el editor y no guarda nada ---
await menu(page, 'Archivo', 'Archivos del proyecto…');
await page.getByRole('button', { name: 'Archivo Verilog nuevo…' }).click();
await page.getByRole('textbox', { name: 'Nombre del archivo' }).fill('malo.v');
await page.getByRole('textbox', { name: 'Código Verilog' }).fill('module malo(input a, output y); assign y = ; endmodule');
await page.locator('.verilogdlg button.primary').click();
await page.locator('.verilogdlg .err').waitFor({ timeout: 30000 });
check(/syntax error/i.test(await page.locator('.verilogdlg .err').textContent()), 'un error de sintaxis se muestra con su línea');
await page.locator('.verilogdlg').getByRole('button', { name: 'Cancelar' }).click();
check(!(await page.locator('.userfiles-section code').allTextContents()).includes('malo.v'), 'con error no se guarda el archivo');
await page.getByRole('button', { name: 'Cerrar' }).click();

// --- colocarlo, simular y graficar ---
// (como al arrastrar archivos: el .asc es un testbench nuevo del proyecto, con un .lib para que se agregue)
await page.evaluate((asc) => {
  const dt = new DataTransfer();
  dt.items.add(new File([asc], 'div4 tb.asc'));
  dt.items.add(new File(['* vacío\n'], 'vacio.lib'));
  window.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
}, CIRCUIT);
await page.getByText('div4 tb', { exact: true }).first().click();
await page.waitForFunction(() => document.querySelectorAll('svg.editor .sym').length === 3);
check((await page.locator('svg.editor .pinname', { hasText: 'q_1' }).count()) === 1, 'el símbolo muestra el nombre de sus pines');
// los cuatro pines del bloque quedan conectados (sin marcas de pin suelto)
check((await page.locator('svg.editor .loose rect').count()) === 0, 'todos los pines quedan conectados');
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
await simulate();
check((await page.locator('.status.ok').count()) === 1, 'la simulación con el bloque Verilog anda');
check(await addTrace('V(q1)'), 'V(q1): la salida analógica del bloque');
check(await addTrace('Dig(x1.q_0_d)'), 'Dig(x1.q_0_d): el nodo digital de adentro');
const c = await chips();
check(c.includes('V(q1)') && c.includes('Dig(x1.q_0_d)'), `las dos trazas están en el gráfico (${c.join(', ')})`);
check(!(await addTrace('Dig(x1.no_existe)')), 'un nodo digital que no existe da error');

// --- después de recargar, el Verilog sigue en el proyecto y se puede editar ---
await page.waitForTimeout(1500); // autoguardado
await page.reload();
await page.locator('[aria-label="Correr"]:enabled').waitFor({ timeout: 30000 });
await menu(page, 'Archivo', 'Archivos del proyecto…');
check((await page.getByText('Pines: clk rst q_1 q_0').count()) === 1, 'después de recargar, div4.v sigue sintetizado en el proyecto');
await page.locator('.userfiles-section li', { hasText: 'div4.v' }).getByRole('button', { name: 'Editar' }).click();
check((await page.getByRole('textbox', { name: 'Código Verilog' }).inputValue()).includes('module div4'), 'Editar abre el código guardado');
await page.locator('.verilogdlg').getByRole('button', { name: 'Cancelar' }).click();
await page.getByRole('button', { name: 'Cerrar' }).click();

check(errors.length === 0, `sin errores de consola${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
if (failed) {
  console.log(`\n${failed} chequeo(s) fallaron`);
  process.exit(1);
}
console.log('\nE2E Verilog OK');
