# PDK (sky130 y GF180MCU)

Los modelos de transistores, resistencias, capacitores y diodos de **SkyWater sky130**
(`skywater-pdk-libs-sky130_fd_pr`) y **GlobalFoundries GF180MCU** (`globalfoundries-pdk-libs-gf180mcu_fd_pr`),
ambos Apache-2.0, se pueden usar directo en el esquemático.

## Uso

- Los símbolos están en `sky130/` y `gf180/` en la librería (`library/sym/<pdk>/`, generados por
  `scripts/gen-pdk-symbols.mjs`). Los MOS, resistencias, capacitores y BJT son subcircuitos:
  `Value` es el nombre y `SpiceLine` los parámetros. Los diodos son `.model` sueltos.
  - **sky130**: MOS de 1.8, 3.3 y 5 V, resistencias de poly, MIM, PNP y diodo. Por
    `.option scale=1u` del PDK, **W y L van en µm** (`W=1 L=0.15`); el área de los diodos, en µm²
    (`area=1 pj=4`: el `.model` trae `area=1e12` por defecto, que con `scale` da corrientes absurdas).
  - **gf180**: MOS de 3.3 y 6 V y nativo, resistencias de poly y de difusión, MIM, NPN, PNP y
    diodo, con los nombres del repo de GlobalFoundries (`nmos_3p3`, no el `nfet_03v3` de open_pdks).
    **W y L van en metros** (`W=1u L=0.28u`); las resistencias usan `r_width`/`r_length` y el MIM,
    `c_width`/`c_length`.
- La esquina se elige con `.lib sky130 <esquina>` o `.lib gf180 <esquina>` (tt, ff, ss, sf, fs).
  También valen las líneas de xschem y los tutoriales: `.lib /…/sky130.lib.spice tt`;
  `.include /…/design.ngspice` y `.lib /…/sm141064.ngspice typical` (las de `res_typical`,
  `bjt_typical`… no cambian la esquina: cada esquina ya trae las de todos los dispositivos).
- sky130 sin `.lib`: cualquier `sky130_fd_pr__…` en la netlist (también en subcircuitos propios o
  en archivos del usuario) se reconoce y va con tt. GF180 necesita el `.lib`: sus nombres
  (`nmos_3p3`, `rm1`…) no se distinguen de los de un modelo cualquiera.
- Ejemplos: los proyectos **sky130** y **gf180** del menú Ejemplos (curvas del NMOS e inversor en
  tt, ff y ss, `scripts/make-examples.ts`), armados con `examples/pdk/*.asc`.

## Cómo está hecho

- `scripts/build-pdk.ts` y `scripts/build-pdk-gf180.ts` (corren con `npm run assets`) clonan los
  modelos a un commit fijado en `.cache/pdk/` y los escriben en `public/library/pdk/<pdk>/` (no se
  versiona; ~30 MB sky130, ~1,3 MB gf180), con su `LICENSE`. Si ya están y el script no cambió, no
  hacen nada.
- **Traducción a ltpsa.** Los modelos están escritos para `ngbehavior=hsa`; TurboSpice corre con
  `ltpsa`. En vez de cambiar el modo, se traducen una vez:
  - las secciones `.lib <nombre> … .endl` pasan a archivos con `.include` (con `lt`, un `.lib tt` de
    un solo argumento se lee como «incluir el archivo tt»): en sky130, cada esquina de
    `sky130.lib.spice`; en gf180, cada sección de `sm141064.ngspice`, que se llaman entre sí;
  - sky130: se borran los comentarios de fin de línea `$ …` (HSPICE); `level = 5.400000e+1` →
    `level = 54` (con `ps` sale EKV, level 5); un `include` sin punto del repo queda comentado.
  - gf180: `design.ngspice` trae el Monte Carlo prendido (`sw_stat_global = 1`,
    `sw_stat_mismatch = 1`: cada corrida daría otro `delvto` al azar); en las esquinas va apagado.
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

- open_pdks como fuente (el repo de sky130 de Google está congelado en 2020; open_pdks también
  renombra los dispositivos de gf180 como los usa xschem: `nfet_03v3`…).
- Barrido de esquinas en el Estudio.
- Los símbolos usan los gráficos de línea de los base (sin skin SVG).
