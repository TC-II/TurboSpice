# Motor: ngspice → WebAssembly

```sh
bash engine/build.sh          # ~1 min; salida en engine/dist-engine/
node engine/smoke/run.mjs     # suite de humo (compara contra ngspice nativo si está instalado)
```

Requiere [emsdk](https://emscripten.org) (`$EMSDK` o `~/emsdk`, probado con 4.0.10), `gcc`, `bison`, `flex`, `curl`.

## Qué produce

| Archivo | |
|---|---|
| `ngspice.mjs` / `ngspice.wasm` | libngspice (API de `sharedspice.h`) como `MAIN_MODULE`, ES module |
| `*.cm` | code models XSPICE como side modules wasm: spice2poly, analog, digital, xtradev, xtraevt, table, tlines |
| `spinit` | init de ngspice: `ngbehavior=ltpsa` y carga de los code models |

En runtime (`src/engine/ngspice.ts`) se escriben `spinit` en `/usr/local/share/ngspice/scripts/`
y los `.cm` en `/usr/local/lib/ngspice/` del FS virtual antes de `ngSpice_Init`.

## Decisiones y detalles

- **Fuentes**: tarball de release (`ngspice-47`, sha256 fijado). Trae `configure` generado,
  así que no hace falta autotools del lado de ngspice.
- **Code models (XSPICE)**: se cargan con el `dlopen` de Emscripten (`MAIN_MODULE=2` + `SIDE_MODULE=1`),
  sin parches a ngspice. Los `.cm` se pasan también al link para que emcc exporte las funciones
  de libc que importan; `AUTOLOAD_DYLIBS=0` evita que se carguen al arrancar.
- **cmpp**: en cross-compile ngspice lo compila con `CC_FOR_BUILD` en `src/xspice/cmpp/build/cmpp`,
  pero el makefile de `icm` lista los modelos con `../cmpp/cmpp` (el wasm); por eso `build.sh`
  pasa `cmpp=../cmpp/build/cmpp`.
- **`--with-ngshared`** fuerza `-shared` en libtool; se pisa con `STATIC=-static` para obtener `libngspice.a`.
- **`-fPIC`** en C y C++ (HICUM es C++) porque el módulo principal usa enlace dinámico.
- **Sin hilos**: sin `-pthread` → no se necesitan headers COOP/COEP (GitHub Pages no los permite).
  Se usa `run` sincrónico dentro de un Web Worker; nunca `bg_run`. Abortar = `worker.terminate()`.
- **Excluido**: `src/xspice/verilog` (puente con Icarus para `d_cosim`, plugin nativo).
- **OSDI (Verilog-A)**: anda en wasm. Un `.osdi` compilado como side module wasm32 se carga con
  `pre_osdi` como los `.cm`. `engine/osdi/build-openvaf.sh` compila OpenVAF-Reloaded con el parche
  `openvaf-wasm32.patch` (destino `wasm32-unknown-emscripten`; necesita Rust, LLVM 21 y emsdk):
  `openvaf-r --target wasm32-unknown-emscripten -o m.osdi m.va`. Las funciones de libc/libm que
  importan los modelos las exporta el motor gracias a `osdi/imports.c` (pasado al link como los `.cm`).
  Comparado con ngspice nativo: diodo (DC y transitorio) y un inversor CMOS con BSIM4, iguales a
  ≤ 5e-9 V. La suite de humo prueba `vres.c` (OSDI a mano) y `vdio.va` (OpenVAF), si están compilados.
- `/proc/meminfo` no existe en wasm; el runtime escribe uno simulado (4 GB).

## Diferencias con LTspice detectadas

- `Rser`/`Rpar`/`Cpar` en C/L/fuentes no existen en ngspice ni con `ngbehavior=lt`: el netlister
  los expande en elementos explícitos.
