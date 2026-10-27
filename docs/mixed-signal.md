# Simulación mixta: nodos digitales, Verilog y Verilog-A (#209)

Todo corre en el navegador: ngspice-47 en WebAssembly con XSPICE, y Yosys en WebAssembly (YoWASP).

## Nodos digitales (XSPICE) y el visor

- Después de un transitorio, `Ngspice.readEventNodes` lee los nodos de eventos (`ngGet_Evt_NodeInfo`)
  y los agrega al plot como vectores `DIGITAL_TYPE`, en los tiempos del transitorio (los eventos
  caen en sus puntos: los flancos quedan exactos). Valores: 0, 1, X = 0,5 (desconocido) y Z = `NaN`
  (alta impedancia). Un bus vale el número de sus bits, Z si todos están en Z y X si alguno es X o
  hay Z mezclado con bits manejados (`LOGIC_X`, `LOGIC_Z` y `logicState` en `waveform/digital.ts`).
  En el panel digital X va en rojo con raya cortada y Z en gris punteado; en la leyenda, «X» y «Z».
- Trazas: `Dig(x1.q_0_d)` un bit; `Dig(x1.q[3:0])` un bus con los bits `x1.q_3_d … x1.q_0_d`
  (`D()` es la derivada, como en LTspice). La caja de trazas sugiere los buses que encuentra.
- **Paneles digitales** (`Pane.digital`, `waveform/DigitalLanes.tsx`): un carril por señal, como un
  analizador lógico. Una traza digital nunca comparte panel (ni ejes) con una analógica: al
  agregarla va al panel digital (o se crea uno) y arrastrarla a un panel del otro tipo no hace nada.
  El eje de tiempo usa los mismos márgenes que uPlot y comparte zoom y cursores.
- Buses: valor en el radix de la traza (`Trace.radix`: hex, dec, ±dec, oct, bin); X/Z en rojo punteado.
- Sólo se leen los nodos digitales del último análisis (con `.step`, la última corrida).
- **Punta de prueba** en una red que sale de un bloque Verilog (un pin de salida o inout): grafica su
  versión digital, `Dig(x1.d_0_d)`, y en un cable de bus con todos los bits del mismo puerto, el bus
  entero (`Dig(x1.d[2:0])`). El nodo sale del puente `ab_<pin>` del `.subckt` generado
  (`verilogDigitalNode` en `sim/traces.ts`). En las entradas del bloque, fuera de un transitorio o al
  armar una expresión en la caja de trazas sigue siendo `V()`; la tensión se pide escribiéndola.

## Módulos Verilog

Un módulo Verilog es `<nombre>.v` + `<nombre>.asy`, como un subcircuito esquemático es `.asc` + `.asy`:
- **Módulos › «+ New» › Verilog** crea uno (el menú también tiene Subcircuito y Modelo); se abre
  igual con clic en el panel o desde *Archivos del proyecto*. Doble clic en una instancia (o abrirlo
  desde el panel) muestra su vista: el código (con números de línea y el error marcado), el modo, los
  pines, la interfaz eléctrica y los parámetros; al costado, el editor del símbolo. Alt+↑ vuelve.
- El módulo de más arriba del `.v` se llama como el archivo. La síntesis queda en el `.v`
  (`ProjectFile.synth`: `.subckt`, pines, parameter, y el `.vvp` en comportamiento); la librería la usa
  como el `<nombre>.sub` que nombra el símbolo. Si el código (o el modo) cambió, se vuelve a sintetizar
  antes de simular. El símbolo se genera solo; si se editó, conserva su dibujo.
- Los buses del módulo son un solo pin del símbolo (`q[3:0]`, con la barra de bus): se conectan con un
  cable con una etiqueta de bus (`q[3:0]`) y cada bit se mide como `V(q[1])`. Ver «Buses» en
  [compatibilidad-ltspice.md](compatibilidad-ltspice.md).
- Proyectos de antes (un `.sub` generado visible) se migran al abrir.

### Modos
- **Síntesis (Yosys)** (`synth.ts`): `proc; tribuf; synth -flatten`, flip-flops legalizados y
  compuertas de dos entradas → `d_and`…`d_dff`, `d_dlatch`, `d_tristate` (tri-state e `inout`).
  Memorias: Yosys las pasa a flip-flops.
- **Comportamiento (Icarus)** (`icarus.ts`): Icarus Verilog en WebAssembly compila el `.v` a `.vvp`
  (ivlpp + ivl) y el bloque es un `d_cosim` que corre libvvp dentro de ngspice: retardos `#`,
  `initial`, `$display` (va al log)… Puertos y parameter salen del `.vvp`. Limitaciones: **un solo
  bloque de comportamiento por simulación** y un solo análisis (libvvp no se inicializa dos veces;
  el Worker usa un motor nuevo después de cada simulación con Icarus). La vista sugiere este modo si
  el código tiene retardos o tareas del sistema.

### Interfaz eléctrica (`electrical.ts`)
Cada pin pasa por un puente de XSPICE: entradas con umbrales `vil`/`vih` (vil > vih: histéresis,
`bidi_bridge`), salidas con niveles `vol`/`voh` y rampas `tr`/`tf` (`dac_bridge`), `inout` en los dos
sentidos; `tpd` es el retardo de cada compuerta. Las salidas que pueden quedar en Z (tri-state) y los
`inout` son `bidi_bridge` y tienen además corriente máxima `iol`/`ioh`. Son parámetros del `.subckt` y
del símbolo (cada instancia los cambia). Familias: ideal, 74HC, 74HCT, 74LS, LVCMOS 3.3 V, CD4000.
Detalles:
- **Salidas con `dac_bridge`, no `bidi_bridge`**: el de salida es un puerto de transconductancia que
  no converge cuando maneja nodos de alta impedancia y muchos cambian a la vez (el manual de ngspice
  lo avisa). En el ADC SAR del ejemplo, la lógica maneja el control de 25 llaves: con `bidi_bridge`
  daba «Timestep too small» en lugares al azar (probado con SW, aswitch, fuente B, Gear,
  tolerancias, histéresis); con `dac_bridge`, 200 conversiones sin problemas y en un cuarto del tiempo.
- Una salida tri-state tiene su nodo detrás de un `d_buffer` (dos bidi_bridge no pueden compartir un
  nodo), salvo las que sólo maneja un buffer tri-state, que van directo (para ver la Z); 1 GΩ a masa
  en cada una evita la matriz singular en el punto de operación.

### parameter por instancia (`variants.ts`)
Un parameter cambia el circuito (ancho de un bus…): una instancia con otro valor (entero) usa otra
síntesis (`chparam` en Yosys, `defparam` en Icarus) con su propio nombre, que se agrega a la netlist.

### Icarus en WebAssembly (`engine/icarus/`)
- `build.sh` (lo llama `engine/build.sh`): Icarus (commit fijo) con `libvvp-step.patch`, que parte
  el planificador de vvp (`vvp_run_begin` / `vvp_run_resume` / `vvp_run_end`, `vvp_request_yield`).
- `ivlng_st.c` / `ivlng_vpi.c`: el puente de ngspice con Icarus **sin hilos** (el original usa
  pthreads, que GitHub Pages no permite): donde cedía el control, pide una pausa y sigue en el
  próximo `step()`. Verificado contra el puente original en nativo (mismos resultados).
- Requiere gperf y autoconf además de lo del motor. `ngspice.mjs` crece ~75 kB comprimido.

Pruebas: `npm run hdl` (Yosys e Icarus en Node, contra ngspice nativo cuando se puede),
`tests/unit/hdl.test.ts`, `tests/e2e/verilog.mjs`.

## Verilog-A (OSDI)

- OSDI está compilado en el motor y anda en WebAssembly: un `.osdi` wasm32 se carga con `pre_osdi`
  (o `osdi`) igual que los `.cm`, y las instancias `N` lo usan.
- **OpenVAF → wasm32** (`engine/osdi/build-openvaf.sh`): OpenVAF-Reloaded (commit fijado) con
  `engine/osdi/openvaf-wasm32.patch`. El parche:
  - agrega el destino `wasm32-unknown-emscripten`: spec, stdlib OSDI en bitcode y el backend WebAssembly de LLVM;
  - enlaza con `wasm-ld` como `emcc -sSIDE_MODULE=1`, más `-Bsymbolic`;
  - corrige `react_ptr_off`, que suponía punteros de 8 bytes.

  Necesita Rust, LLVM 21 y emsdk.
- **Errores encontrados en el camino:**
  - Sin `-Bsymbolic`, dos modelos cargados a la vez se pisan: los dos exportan `access_0`, `eval_0`…, y
    el enlazador dinámico de Emscripten resuelve los del segundo hacia el primero.
  - Con punteros de 8 bytes, los punteros del jacobiano reactivo pisaban `node_mapping`: un modelo
    con `ddt` veía todas las tensiones en 0.
- El motor exporta las funciones de libc/libm que importan los modelos (`engine/osdi/imports.c`;
  BSIM4 usa `lround`, `snprintf`, `atan`…).
- **Verificado contra ngspice nativo** (mismo `.va` compilado para x86_64):
  - un diodo con `limexp` y `ddt`, en DC y transitorio;
  - un inversor CMOS con BSIM4 (416 kB de wasm, 100 kB comprimido; OpenVAF tarda ~3 s).

  En todos los casos la diferencia es ≤ 5e-9 V.
- **Pruebas:** `npm run smoke` incluye `vres.c` (OSDI escrito a mano) y `vdio.va` (compilado por OpenVAF).
  Cada caso se saltea si su `.osdi` no está compilado.
- OpenVAF-Reloaded compila además los ejemplos con `@(timer(...))` y `transition()` de sus tests
  (VAMS 2023), pero todavía no los simulé.

Pendiente (ver #209):
- La biblioteca de modelos precompilados (3b), que ahora es viable.
- Los modelos Verilog-A del usuario: el compilador tiene que correr en el navegador, o hay que traducir un subconjunto.
