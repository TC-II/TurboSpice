# PDK (sky130)

Los modelos de transistores, resistencias, capacitores y diodos de **SkyWater sky130**
(`skywater-pdk-libs-sky130_fd_pr`, Apache-2.0) se pueden usar directo en el esquemático.

## Uso

- Los símbolos están en `sky130/` en la librería (`library/sym/sky130/`, generados por
  `scripts/gen-pdk-symbols.mjs`): MOS de 1.8, 3.3 y 5 V, resistencias de poly, MIM, PNP y diodo.
  Los MOS son subcircuitos: `Value` es el nombre (`sky130_fd_pr__nfet_01v8`) y `SpiceLine` los
  parámetros (`W=1 L=0.15 nf=1`). Por `.option scale=1u` del PDK, **W y L van en µm**.
- La esquina se elige con `.lib sky130 <esquina>` (tt, ff, ss, sf, fs). También vale la ruta de
  open_pdks que usan xschem y los tutoriales (`.lib /…/sky130.lib.spice tt`). Sin `.lib`, tt.
- Cualquier `sky130_fd_pr__…` en la netlist (también en subcircuitos propios o en archivos del
  usuario) se reconoce: la simulación agrega sólo los archivos que ese dispositivo necesita.
- Ejemplo: `examples/pdk/sky130_inverter.asc`.

## Cómo está hecho

- `scripts/build-pdk.ts` (corre con `npm run assets`) clona los modelos a un commit fijado en
  `.cache/pdk/` y los escribe en `public/library/pdk/sky130/` (no se versiona; ~30 MB). Si ya están
  y el script no cambió, no hace nada.
- **Traducción a ltpsa.** Los modelos están escritos para `ngbehavior=hsa`; TurboSpice corre con
  `ltpsa`. En vez de cambiar el modo, se traducen una vez:
  - cada esquina (`.lib tt … .endl`) pasa a su archivo con `.include` (con `lt`, un `.lib tt` de un
    solo argumento se lee como «incluir el archivo tt»);
  - se borran los comentarios de fin de línea `$ …` (HSPICE);
  - `level = 5.400000e+1` → `level = 54` (con `ps` sale EKV, level 5);
  - un `include` sin punto del repo queda comentado.
- **Carga por dispositivo.** La esquina entera tarda ~1,9 s en el motor wasm, casi todo en leer
  dispositivos que no se usan. Cada esquina se parte en unidades (sus `.include`, abriendo los
  archivos que sólo agrupan otros, como `all.spice`) e `index.json` guarda qué unidades necesita
  cada dispositivo: las que lo definen y, en cadena, las que definen los parámetros y modelos que
  usan, más las que fijan `.option`. `src/library/pdk.ts` (`loadPdk`) arma los `.include` y baja
  los archivos; `src/sim/schematicSim.ts` los agrega después de medir el tamaño de la simulación
  (no pasan por `prepareSimulation`: ya están traducidos). Un inversor tarda ~0,13 s.

## Pruebas

- `npm run pdk:test` (`tests/pdk/equivalence.mjs`): el mismo circuito con los originales y `hsa`,
  y con los traducidos y `ltpsa`, en ngspice nativo, en las 5 esquinas.
- `npm run pdk:units` (`tests/pdk/units.mjs`, ~8 min): cada dispositivo sólo con sus unidades
  contra la esquina entera. Los que no se pueden instanciar con valores por defecto (MOS de RF,
  `special_*`) se saltean: su mapa no está probado.

## Pendiente

- GF180MCU con el mismo mecanismo.
- open_pdks como fuente: el repo de Google está congelado en 2020.
- Barrido de esquinas en el Estudio.
- Los símbolos usan los gráficos de línea de los base (sin skin SVG).
