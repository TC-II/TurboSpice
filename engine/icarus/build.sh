#!/usr/bin/env bash
# Icarus Verilog en WebAssembly (TurboSpice #209): Verilog de comportamiento (retardos #, initial,
# $display…) co-simulado con ngspice por el code model d_cosim.
#  - compilador: ivlpp + ivl (con tgt-vvp como side module vvp.tgt), programas MODULARIZE que
#    corre el Worker de Yosys/Icarus en el navegador para pasar .v a .vvp;
#  - simulador: libvvp (parcheado para correr por partes, sin hilos: libvvp-step.patch) y los
#    módulos VPI del sistema, side modules que ngspice.wasm carga con dlopen;
#  - puente: ivlng.so + ivlng.vpi (ivlng_st.c, ivlng_vpi.c), la versión sin hilos del de ngspice.
# Lo llama engine/build.sh (necesita las fuentes de ngspice ya extraídas). Salida: engine/build/icarus-out/
# Requiere: emsdk, gcc, autoconf, bison, flex y gperf (si no está, se compila acá).
set -euo pipefail

ICARUS_COMMIT=9cfecc9c9ef39a58ffdd4ac02776cf2485b72fe0
GPERF_VERSION=3.1

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD="$HERE/../build"
SRC="$BUILD/iverilog"
NATIVE="$BUILD/ivl-native"
WASM="$BUILD/ivl-wasm"
OUT="$BUILD/icarus-out"
NGSPICE_INC="${NGSPICE_INC:-$BUILD/ngspice-47/src/include}"
JOBS="${JOBS:-$(nproc)}"

if ! command -v emcc >/dev/null; then
  # shellcheck disable=SC1091
  source "${EMSDK:-$HOME/emsdk}/emsdk_env.sh" >/dev/null 2>&1
fi
export PATH="$BUILD/host/bin:$PATH"

# gperf (para el lexer de ivl)
if ! command -v gperf >/dev/null; then
  (cd "$BUILD" && curl -fsSL -o "gperf-$GPERF_VERSION.tar.gz" "https://ftp.gnu.org/pub/gnu/gperf/gperf-$GPERF_VERSION.tar.gz" &&
    tar xzf "gperf-$GPERF_VERSION.tar.gz" && cd "gperf-$GPERF_VERSION" && ./configure --prefix="$BUILD/host" >/dev/null && make -j"$JOBS" >/dev/null && make install >/dev/null)
fi

# 1. Fuentes (commit fijo) con el parche de libvvp
if [ ! -d "$SRC" ]; then
  git clone -q https://github.com/steveicarus/iverilog.git "$SRC"
  git -C "$SRC" checkout -q "$ICARUS_COMMIT"
  git -C "$SRC" apply "$HERE/libvvp-step.patch"
fi
[ -f "$SRC/configure" ] || (cd "$SRC" && sh autoconf.sh >/dev/null 2>&1)

# 2. Lo que el build genera con programas del host: version_tag.h y vvp/tables.cc (draw_tt)
mkdir -p "$NATIVE"
[ -f "$NATIVE/Makefile" ] || (cd "$NATIVE" && "$SRC/configure" >/dev/null)
make -C "$NATIVE" version_tag.h >/dev/null
make -C "$NATIVE/vvp" tables.cc >/dev/null

# 3. Configure cruzado y objetos
mkdir -p "$WASM"
if [ ! -f "$WASM/Makefile" ]; then
  (cd "$WASM" && CC_FOR_BUILD=gcc CXX_FOR_BUILD=g++ emconfigure "$SRC/configure" \
    --host=wasm32-unknown-emscripten --build="$(gcc -dumpmachine)" --enable-libvvp \
    CFLAGS="-O2 -fPIC" CXXFLAGS="-O2 -fPIC" >/dev/null)
fi
cp "$NATIVE/version_tag.h" "$WASM/"
cp "$NATIVE/vvp/tables.cc" "$WASM/vvp/"
# (vvp/main.o es el programa vvp, que no hace falta: -k sigue con los demás)
emmake make -C "$WASM/vvp" -k -j"$JOBS" >/dev/null 2>&1 || true
emmake make -C "$WASM/vpi" -j"$JOBS" LDFLAGS="-sSIDE_MODULE=1 -O2" >/dev/null
emmake make -C "$WASM/ivlpp" -j"$JOBS" >/dev/null
emmake make -C "$WASM" -j"$JOBS" ivl >/dev/null
emmake make -C "$WASM/tgt-vvp" -k -j"$JOBS" >/dev/null 2>&1 || true

# 4. Side modules: libvvp, VPI del sistema, el puente y el target de ivl
rm -rf "$OUT" && mkdir -p "$OUT"
emcc -O2 -sSIDE_MODULE=1 $(ls "$WASM"/vvp/*.o | grep -v '/main\.o$') -o "$OUT/libvvp.so"
for m in system v2005_math va_math v2009; do cp "$WASM/vpi/$m.vpi" "$OUT/$m.vpi"; done
emcc -O2 -fPIC -sSIDE_MODULE=1 -I"$NGSPICE_INC" -DNGSPICELIBDIR='"/usr/local/lib/ngspice"' -o "$OUT/ivlng.so" "$HERE/ivlng_st.c"
emcc -O2 -fPIC -sSIDE_MODULE=1 -I"$NGSPICE_INC" -I"$SRC" -I"$WASM" -o "$OUT/ivlng.vpi" "$HERE/ivlng_vpi.c"
em++ -O2 -sSIDE_MODULE=1 "$WASM"/tgt-vvp/*.o -o "$OUT/vvp.tgt"

# 5. El compilador: ivlpp (preprocesador) e ivl (carga vvp.tgt y los .vpi con dlopen)
IVL_OBJS=$(make -s -C "$WASM" -f Makefile -f <(printf 'print-O:\n\t@echo $(O)\n') print-O)
LINKS="$BUILD/icarus-links"
rm -rf "$LINKS" && mkdir -p "$LINKS"
# (pasados al link sólo para que emcc exporte desde ivl lo que importan; MAIN_MODULE=2 saca el resto)
for f in vvp.tgt system.vpi v2005_math.vpi va_math.vpi v2009.vpi; do cp "$OUT/$f" "$LINKS/${f//./_}.so"; done
(cd "$WASM" && em++ -O2 $IVL_OBJS "$LINKS"/*.so -o "$OUT/ivl.mjs" \
  -sMAIN_MODULE=2 -sAUTOLOAD_DYLIBS=0 -sMODULARIZE -sEXPORT_ES6 -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH -sALLOW_TABLE_GROWTH -sFORCE_FILESYSTEM -sINVOKE_RUN=0 -sEXIT_RUNTIME=1 \
  -sEXPORTED_RUNTIME_METHODS=FS,callMain)
emcc -O2 "$WASM"/ivlpp/*.o -o "$OUT/ivlpp.mjs" \
  -sMODULARIZE -sEXPORT_ES6 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH -sFORCE_FILESYSTEM \
  -sINVOKE_RUN=0 -sEXIT_RUNTIME=1 -sEXPORTED_RUNTIME_METHODS=FS,callMain

ls -la "$OUT"
