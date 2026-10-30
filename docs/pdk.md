# PDK (sky130 y GF180MCU)

Los modelos de transistores, resistencias, capacitores y diodos de **SkyWater sky130** (sky130A) y
**GlobalFoundries GF180MCU** (gf180mcuD), ambos Apache-2.0, se pueden usar directo en el esquemático.
Vienen de **open_pdks**, los mismos que usan xschem y los tutoriales, con sus nombres.

## Uso

- Los símbolos están en `sky130/` y `gf180/` en la librería (`library/sym/<pdk>/`, generados por
  `scripts/gen-pdk-symbols.mjs`). Los MOS, resistencias, capacitores y BJT son subcircuitos:
  `Value` es el nombre y `SpiceLine` los parámetros. Los diodos son `.model` sueltos. Usan el
  dibujo de los símbolos base (`SYMATTR Skin nmos4`: con la flecha del skin SVG).
- Doble click en uno abre su diálogo (`src/schematic/PdkDialog.tsx`): la variante (los otros
  símbolos de la misma carpeta con el mismo dibujo y parámetros: normal, lvt, hvt, 5 V…), las
  medidas siempre en µm (en gf180 se guardan en metros, con «u»), lo que dan (W/L, área de
  compuerta, R ≈ R□·L/W, C ≈ densidad·W·L, con los valores de la descripción del símbolo) y qué
  rótulos se ven. «Todos los atributos…» abre el diálogo de siempre.
  - **sky130**: MOS de 1.8, 3.3 y 5 V, resistencias de poly, MIM, PNP y diodo. Por
    `.option scale=1u` del PDK, **W y L van en µm** (`W=1 L=0.15`); el área de los diodos, en µm²
    (`area=1 pj=4`: el `.model` trae `area=1e12` por defecto, que con `scale` da corrientes absurdas).
  - **gf180**: MOS de 3.3 y 6 V y nativo (`nfet_03v3`, `pfet_06v0`, `nfet_06v0_nvt`…),
    resistencias de poly y de difusión, MIM (`cap_mim_2f0_m4m5_noshield`: las esquinas de open_pdks
    cargan los MIM nuevos, no `cap_mim_2f0ff`), NPN, PNP (3 pines) y diodo. **W y L van en metros**
    (`W=1u L=0.28u`); las resistencias usan `r_width`/`r_length` y el MIM, `c_width`/`c_length`.
- **No hace falta ninguna directiva.** El PDK sale de los símbolos que se usan (los de `sky130/` o
  `gf180/`, `pdkOfSymbols`) y la esquina (tt, ff, ss, sf, fs) se elige en la barra de simulación,
  al principio, cuando el circuito tiene un símbolo de PDK. Se guarda en el `.asc` de cada testbench
  como dato oculto (`;.pdk`, `src/asc/dataText.ts`; tt no se guarda), así que viaja con él, cuenta
  como cambio del circuito y aparece en el historial de corridas («esquina ss»).
- También vale escribirla: `.lib sky130 <esquina>`, `.lib gf180 <esquina>` o las líneas de xschem
  y los tutoriales (`.lib /…/sky130.lib.spice tt`; `.include /…/design.ngspice` y
  `.lib /…/sm141064.ngspice typical`, o `.spice`; las de `res_typical`, `bjt_typical`… no cambian la
  esquina). Una directiva con esquina manda: la barra la muestra fija.
- sky130 también se reconoce por cualquier `sky130_fd_pr__…` en la netlist (subcircuitos propios,
  archivos del usuario). Los nombres de GF180 (`nfet_03v3`, `rm1`…) no se distinguen de un modelo
  cualquiera: hace falta un símbolo de `gf180/` o la directiva.
- Ejemplos: los proyectos **sky130** y **gf180** del menú Ejemplos (curvas del NMOS e inversor en
  tt, ff y ss, `scripts/make-examples.ts`), armados con `examples/pdk/*.asc`.

## Cómo está hecho

- `scripts/build-pdk.ts` y `scripts/build-pdk-gf180.ts` (corren con `npm run assets`) bajan
  open_pdks ya armado de [ciel-releases](https://github.com/fossi-foundation/ciel-releases)
  (`OPEN_PDKS`, el commit de open_pdks, fija la versión de los dos): de sky130,
  `libs.tech/ngspice` de `common.tar.zst` y `libs.ref/sky130_fd_pr/spice` de `sky130_fd_pr.tar.zst`
  (~20 MB); de gf180, `libs.tech/ngspice` de `common.tar.zst` (170 MB: se descomprime al vuelo y se
  extrae sólo eso). Necesitan curl, zstd y tar. Lo bajado queda en `.cache/pdk/`; la salida, en
  `public/library/pdk/<pdk>/` (no se versiona; ~30 MB sky130, ~0,8 MB gf180) con la licencia
  Apache-2.0 (`scripts/pdk/LICENSE-Apache-2.0`). Si ya están y el script no cambió, no hacen nada.
- **Traducción a ltpsa.** Los modelos están escritos para `ngbehavior=hsa`; TurboSpice corre con
  `ltpsa`. En vez de cambiar el modo, se traducen una vez:
  - las secciones `.lib <nombre> … .endl` pasan a archivos con `.include` (con `lt`, un `.lib tt` de
    un solo argumento se lee como «incluir el archivo tt»): en sky130, cada esquina de
    `sky130.lib.spice`; en gf180, cada sección de `sm141064.ngspice`, que se llaman entre sí;
  - sky130: `level = 5.400000e+1` → `level = 54` (con `ps` sale EKV, level 5); las líneas propias
    de cada esquina (`.param mc_mm_switch=0`…) van a `<esquina>.partN.spice`. (Los comentarios `$`
    y el `include` sin punto de los primitivos sin procesar de SkyWater, que open_pdks ya corrige,
    se siguen tratando por las dudas.)
  - gf180: el Monte Carlo de `design.ngspice` (`sw_stat_global`, `sw_stat_mismatch`) va apagado
    (el de open_pdks ya viene así; el del repo de GlobalFoundries lo traía prendido: cada corrida
    daba otro `delvto` al azar).
- **Carga por dispositivo (sky130).** La esquina entera tarda ~1,9 s en el motor wasm, casi todo en
  leer dispositivos que no se usan. Cada esquina se parte en unidades (sus `.include`, abriendo los
  archivos que sólo agrupan otros, como `all.spice`) e `index.json` guarda qué unidades necesita
  cada dispositivo: las que lo definen y, en cadena, las que definen los parámetros y modelos que
  usan, más las que fijan `.option`. Un inversor tarda ~0,13 s. La esquina de gf180 entera carga en
  ~30 ms: va completa.
- `src/library/pdk.ts` reconoce las líneas `.lib` de PDK (`pdkLib`) y arma los `.include` y los
  archivos (`loadPdk`); `src/sim/schematicSim.ts` los agrega después de medir el tamaño de la
  simulación (no pasan por `prepareSimulation`: ya están traducidos) y, con los nombres de
  `index.json`, evita el aviso de modelo que falta.

## Pruebas

- `npm run pdk:test` (`tests/pdk/equivalence.mjs` y `tests/pdk/gf180.mjs`): el mismo circuito con
  los originales y `hsa`, y con los traducidos y `ltpsa`, en ngspice nativo, en las 5 esquinas.
- `npm run pdk:units` (`tests/pdk/units.mjs`, ~8 min): cada dispositivo de sky130 sólo con sus
  unidades contra la esquina entera. Los que no se pueden instanciar con valores por defecto (MOS
  de RF, `special_*`) se saltean: su mapa no está probado.

## Pendiente

- Barrido de esquinas en el Estudio (hoy, un testbench por esquina, como en los ejemplos).
- Los símbolos usan los gráficos de línea de los base (sin skin SVG).
