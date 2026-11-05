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
- **Redes entre bloques, digitales** (`hdl/digitalLinks.ts`): una red que une sólo pines de bloques
  Verilog (una salida y entradas de otros, nada más en la netlist: ni otro elemento, ni `.meas`, ni
  una fuente B, ni `.control`) se simula como nodo de eventos, sin pasar por lo analógico: la
  instancia usa una copia de su `.subckt` (`NOMBRE__digN`) sin los puentes de esos pines y con el
  nodo de adentro como puerto. Si una entrada sale tal cual por una salida (`g[7] = b[7]`), el nodo
  es la entrada y la salida sale por un `d_buffer`. Las tri-state e inout siguen analógicas. Se
  pierde la rampa y el cruce de umbral (del orden de `tr/2`). Medido con ngspice nativo: un contador
  de 8 bits → Gray → registro con reloj de 10 MHz, 200 µs, pasa de 1,66 s a 0,58 s; el sigma-delta
  del ejemplo (una sola red entre bloques), de 1,26 s a 1,12 s. La netlist lo dice en un comentario
  antes del `.end`. Esas redes se grafican como `Dig(red)` (`V(red)` da su valor lógico) y un
  `Dig(x1.q_0_d)` guardado de antes sigue andando (`digitalAliases`).
- **Punta de prueba** en una red que sale de un bloque Verilog (un pin de salida o inout): grafica su
  versión digital con el nombre del cable en el esquemático, `Dig(d[0])`, y en un cable de bus el bus
  entero (`Dig(d[2:0])`). El resolver traduce ese nombre al nodo de adentro del bloque (`x1.d_0_d`),
  que sale del puente `ab_<pin>` del `.subckt` generado (`verilogDigitalNode` en `sim/traces.ts`);
  `Dig(x1.d_0_d)` escrito a mano sigue andando. En las entradas del bloque, fuera de un transitorio o al
  armar una expresión en la caja de trazas sigue siendo `V()`; la tensión se pide escribiéndola.

- **Señales guardadas** (#314): el motor entrega cada nodo digital como **eventos** (el instante y
  el valor de cada cambio, `SimVector.x`), no muestreado en los tiempos del transitorio: así pesa
  casi nada en la página y en el historial. Sólo se lleva a la grilla cuando se pide como tensión
  (`V(x1.d_0_d)`) o se usa en una cuenta (`Dig(q)*2`); `Dig(q)` solo se dibuja desde los eventos
  (un bus une los cambios de sus bits). Medido en ngspice-47: `.save` no filtra los nodos de
  eventos, así que el filtro lo hace el motor al leerlos: con «sólo las señales elegidas» lee los
  elegidos (`.save Dig(…)` en un comentario aparte, que LTspice ignora) y los que usan las trazas;
  los nodos internos sin nombre de los bloques Verilog (`x1.n12`) no se leen nunca. Los bloques
  cosimulados con Icarus no pasan por ngspice.

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

### Biblioteca DSP (#366)
Módulos de punto fijo en complemento a dos (por defecto W = 16, Q1.15) en `library/verilog/DSP`
(`dsp_<nombre>`):
- Aritmética: `const`, `add`, `sub`, `sum4`, `mul`, `tap` (coeficiente COEF), `shift` (×2^K), `neg`,
  `abs`, `requant` (cambio de formato: corre SHIFT bits, redondea y satura), `minmax`, `cmp`, `mac`,
  `popcount`, `clz`, `div`, `sqrt`, `cmul` (multiplicador complejo I/Q).
- DSP: `delay` (z⁻¹), `integrator`, `diff` (1 − z⁻¹), `movavg`, `envelope`, `nco`, `impulse`
  (un pulso de un ciclo), `step` (escalón), `downsample` (↓M) y `upsample` (↑L), con su reloj
  `clko`, que cambia en los flancos de bajada de `clk`: los bloques que siguen con `clko` son
  sincrónicos con la muestra.
  `cordic` (fase → cos, sen) y `magphase` (x, y → magnitud, fase), `sdm` (sigma-delta de 1 bit),
  `ramp`. En un solo bloque: `fir8` (C0…C7), `biquad` (B0 B1 B2 A1 A2 en Q2.14) y `cic` (N, R; salida
  normalizada, con `valid`).
- Lógica y bits: `and`, `or`, `xor`, `not`, `mask`, `rotate`, `bitrev`, `bin2gray`, `gray2bin`, `parity`.
- Ruteo y memoria: `mux2`, `mux4`, `demux2`, `decoder` (3 → 8), `prienc` (8 → 3), `split` y `join`
  (16 ↔ 2 × 8), `ram` (16 palabras), `fifo` (16 palabras).
- Secuencial y control: `counter`, `clkdiv`, `lfsr` (PRBS de 16 bits), `shiftreg` (SIPO), `piso`,
  `edge`, `sync`, `pwm`, `debounce`, `oneshot`, `clock` (de comportamiento: sólo con Icarus).

SAT/RND eligen saturar y redondear.
- **ADC y DAC ideales** (`library/sub/DSP/dsp_adc.sub`, `dsp_dac.sub`): no son Verilog sino un
  `.subckt` con fuentes B (16 bits, Q1.15, `vref`), con cada bit en 0 o `vcc`, así que se conectan
  directo a los bloques. El ADC toma la muestra en el flanco de subida de `clk` (un `d_dff` de XSPICE
  por bit): su palabra cambia una vez por ciclo. El ejemplo DSP tiene un testbench ADC → FIR8 → DAC
  con dos senos analógicos.
- **Símbolos dibujados** (`library/sym/DSP`, carpeta DSP del buscador): Σ en un círculo, el tap como
  triángulo, z⁻¹ con el reloj abajo, el MUX como trapecio, las compuertas con el rótulo IEC (&, ≥1,
  =1); los demás, una caja con los nombres de los pines adentro y los de control (clk, rst, en…) abajo. Los genera `node scripts/gen-dsp-symbols.ts` (el orden de los pines
  y los parameter salen de la síntesis). Al elegir uno, el `.v` y su símbolo se copian al proyecto y se
  sintetiza ahí (`bundle.verilog`); la síntesis conserva el dibujo.
- Los parameter que no cambian pines (COEF, VALUE, K, SAT…) van por instancia, negativos incluidos
  (Yosys no los lee en `-chparam`: `synthesize` los escribe como valor por omisión del parameter). W
  cambia los buses, así que se cambia en el `.v` del proyecto.
- **Graficar el valor real**: `signed(Dig(y[15:0]), 16)/32768` (la función `signed(x, bits)` de las
  trazas lee un bus en complemento a dos). Conviene graficar la salida de un registro (un z⁻¹): sintetizada,
  la de un sumador tiene las carreras de sus compuertas.
- **La punta en un bus DSP** (con nombre o sin él: `N001` entre pines de 16 bits) lo grafica así,
  `signed(Dig(bus), 16)`, en un eje en cuentas. También el del ADC ideal, cuyos bits son tensiones:
  `Dig()` de un bus analógico toma cada bit como 1 arriba de la mitad del nivel más alto. Una red
  entre bloques DSP sin bus (el reloj) va como `Dig(clk)`. No hace falta volver a simular.
- **Un solo módulo de Icarus** (`hdl/cosimMerge.ts`): al simular, las instancias de nivel superior de
  los bloques DSP (dos o más) se reemplazan por una sola (`xdsp`), de un módulo generado
  (`dsp_cosim`) que las instancia y cablea como en el esquemático, y que corre como un d_cosim. Los
  nodos que usa algo más de la netlist son puertos; las redes entre bloques salen todas como salidas
  del módulo, pero sólo como su nodo de eventos (sin dac_bridge ni pin del `.subckt`,
  `internalOnly`), con alias para sus nombres de antes (`Dig(x24.q[15:0])`, `Dig(N001[15:0])`): la
  punta las grafica sin volver a simular. Cada cambio de una salida es un punto del transitorio, así
  que lo que llega de afuera conviene que esté muestreado: con un ADC que sigue a la entrada todo el
  tiempo, un bloque combinacional detrás (el FIR) cambia en cada paso (medido con el ejemplo
  ADC → FIR → DAC: 21 s y 112 mil puntos con el ADC sin muestrear; 0,35 s y 1800 puntos con un
  z⁻¹ de muestreo; el ADC ahora muestrea con `clk`). No se hace si ya hay otro bloque de
  comportamiento (Icarus corre
  uno por simulación) ni con pines inout. La netlist lo dice en un comentario. Medido en la app con el
  FIR de 8 taps (100 µs con un seno): el motor pasa de ~2,7 s a ~0,14 s y armar la netlist, de ~1,3 s a
  ~0,07 s (con la síntesis de las variantes ya hecha).
- **Atributo «Simulación»** (`hdl`, en el SpiceLine de los símbolos de módulos Verilog): `auto` (los
  bloques DSP al módulo único, los demás como diga su módulo), `icarus` (al módulo único, también un
  módulo propio) o `gates` (sintetizado a compuertas de XSPICE). No llega a ngspice (`stripHdl`).
- **`.step` con Icarus**: ngspice lo corre en una sola sesión (`foreach` + `alterparam` + `reset`) y
  libvvp no se inicializa dos veces, así que con un bloque de comportamiento (el módulo único, `dsp_clock`)
  `simulate.ts` lo corre corrida por corrida: `splitStepRuns` (`netlist/step.ts`) arma una netlist por
  corrida (el `foreach` con su valor, `.param` en vez de `alterparam` + `reset`), cada una en un motor
  nuevo, y los plots se renumeran como los del `.step` de ngspice (`tran1`, `tran2`…); cada corrida
  tiene sus nodos digitales. Un parameter de Verilog no puede depender del parámetro barrido (`K={k}`):
  el módulo se compila una vez (como en la síntesis, que pide un entero). Con varios análisis o un
  `.control` que repite, los bloques DSP van como compuertas (con un aviso) y un bloque que sólo va con
  Icarus da un error que lo dice. `hdl` no puede quedar en el encabezado de un `.subckt`: con `.step`
  daba «Formula() error».
- **Reloj** `dsp_clock` (de comportamiento, `#(PERIOD/2)`): corre adentro del módulo único, así el reloj
  no pasa por lo analógico (ni una fuente de pulsos ni sus puentes). Al copiarlo al proyecto queda en
  modo comportamiento (`looksBehavioral`). Arranca en 0: el primer flanco de subida es a PERIOD/2.
- **Ejemplo** «DSP» (Archivo › Ejemplos, `scripts/make-dsp.ts` + `scripts/dsp/project.ts`): FIR de 8 taps
  (impulso, banda de paso y de rechazo), IIR de primer orden y biquad Butterworth (Q2.14), CIC N = 2,
  R = 8, y un mezclador con dos NCO. Los esquemáticos se dibujan en el script como diagrama de bloques.
- Pruebas: los casos DSP de `tests/hdl/cases.mjs` (aritmética con saturación, FIR de 4 taps, parameter
  negativo, CIC, y uno por familia: combinacionales, secuenciales y de control con memoria).

Plan completo (módulo único para Icarus, modos por instancia): issue #366.

### parameter por instancia (`variants.ts`)
Un parameter cambia el circuito (ancho de un bus…): una instancia con otro valor (entero) usa otra
síntesis (`chparam` en Yosys, `defparam` en Icarus) con su propio nombre, que se agrega al archivo del
módulo. Se aplica antes de las redes digitales (`buildSimulation`, opción `variants`): así una variante
también tiene su copia sin puentes (antes, una instancia en una red digital perdía su parameter).

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
