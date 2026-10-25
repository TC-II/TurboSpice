# Componentes de terceros

TurboSpice se distribuye bajo la **GNU General Public License v3.0 o posterior**
(`GPL-3.0-or-later`, ver `LICENSE`). Junto con su código, el sitio y el repositorio incluyen o
cargan los componentes de abajo, cada uno con su licencia. Todas son compatibles con la GPL-3.0.

## Motor de simulación (`public/engine/`, compilado por `engine/build.sh`)

| Componente | Versión | Licencia | Fuentes |
|---|---|---|---|
| **ngspice** (`ngspice.mjs`, `ngspice.wasm`, code models `*.cm`, `spinit`) | 47 | BSD modificada (*Modified BSD*), con excepciones: KLU y numparam LGPL-2.0 o posterior, `src/osdi` MPL-2.0, XSPICE dominio público, code model `table` GPL-2.0 o posterior | <https://ngspice.sourceforge.io>; tarball verificado por SHA-256 en `engine/build.sh`. Detalle en el archivo `COPYING` de ngspice |
| **Icarus Verilog** (`icarus/`: `ivl`, `ivlpp`, `libvvp.so`, `vvp.tgt`, módulos VPI) | commit `9cfecc9c9ef39a58ffdd4ac02776cf2485b72fe0` | GPL-2.0 o posterior | <https://github.com/steveicarus/iverilog>; el parche aplicado está en `engine/icarus/libvvp-step.patch` |
| Puente `ivlng` sin hilos (`engine/icarus/ivlng_st.c`, `ivlng_vpi.c`) | — | La de ngspice (BSD modificada). Basado en el puente de Giles Atkinson (2024-2025) | En este repositorio |

El sitio se construye a partir de las fuentes de este repositorio. Las de ngspice e Icarus se
bajan en las versiones fijadas de arriba y se les aplican los parches de `engine/`, así que todo
lo necesario para reproducir los binarios está acá.

## Dependencias de la interfaz (npm)

| Paquete | Versión | Licencia | Uso |
|---|---|---|---|
| React, React DOM | 18.3.1 | MIT | Interfaz |
| uPlot | 1.6.31 | MIT | Gráficos de resultados |
| Blockly | 13.3.0 | Apache-2.0 | Editor de bloques del Estudio (se carga al abrirlo) |
| @yowasp/yosys (Yosys en WebAssembly) | 0.70.1258 | ISC | Síntesis de módulos Verilog (se carga al sintetizar) |

## Librería de componentes, ejemplos y casos de prueba

`library/` (símbolos, modelos y skins) y `tests/fixtures/` **no** están bajo la GPL. Cada parte
tiene su origen y sus condiciones (permisos de sus autores) en `library/LICENSES.md`. La librería
estándar de LTspice (Analog Devices) no se redistribuye.
