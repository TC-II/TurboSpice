#!/usr/bin/env bash
# Compila ngspice a WebAssembly (libngspice + code models XSPICE como side modules).
# Salida: engine/dist-engine/{ngspice.mjs,ngspice.wasm,spinit,*.cm}
set -euo pipefail

NGSPICE_VERSION=47
NGSPICE_SHA256=894e649651f1838a14095e5a5439e7d3aa63e87ede14d283173fda4fcdef675f
NGSPICE_URL="https://sourceforge.net/projects/ngspice/files/ng-spice-rework/${NGSPICE_VERSION}/ngspice-${NGSPICE_VERSION}.tar.gz/download"
CODEMODELS=(spice2poly analog digital xtradev xtraevt table tlines)

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD="$HERE/build"
SRC="$BUILD/ngspice-$NGSPICE_VERSION"
OBJ="$BUILD/wasm"
DIST="$HERE/dist-engine"
JOBS="${JOBS:-$(nproc)}"

if ! command -v emcc >/dev/null; then
  # shellcheck disable=SC1091
  source "${EMSDK:-$HOME/emsdk}/emsdk_env.sh" >/dev/null 2>&1
fi

mkdir -p "$BUILD" "$DIST"

# 1. Fuentes (tarball de release: trae configure generado)
TARBALL="$BUILD/ngspice-$NGSPICE_VERSION.tar.gz"
if [ ! -f "$TARBALL" ]; then
  curl -fsSL -o "$TARBALL" "$NGSPICE_URL"
fi
echo "$NGSPICE_SHA256  $TARBALL" | sha256sum -c --quiet
[ -d "$SRC" ] || tar -xzf "$TARBALL" -C "$BUILD"

# 2. Configure cruzado. -fPIC porque el módulo principal hace dlopen de los .cm.
#    cmpp se compila con el compilador del host (CC_FOR_BUILD) automáticamente.
if [ ! -f "$OBJ/Makefile" ]; then
  mkdir -p "$OBJ"
  (cd "$OBJ" && CC_FOR_BUILD=gcc emconfigure "$SRC/configure" \
    --host=wasm32-unknown-emscripten --build="$(gcc -dumpmachine)" \
    --with-ngshared --enable-xspice --enable-cider --enable-klu \
    --disable-openmp --disable-debug --enable-static --disable-shared \
    CFLAGS="-O2 -fPIC" CXXFLAGS="-O2 -fPIC")
  # verilog (puente a Icarus, plugin nativo) no aplica en el navegador;
  # icm se compila aparte (paso 4) porque necesita el cmpp nativo.
  sed -i 's/^\(SUBDIRS = .*\) icm verilog/\1/' "$OBJ/src/xspice/Makefile"
fi

# 3. libngspice.a. --with-ngshared fuerza "-shared" en libtool; lo pisamos a estático.
emmake make -C "$OBJ" -j"$JOBS" \
  STATIC=-static libngspice_la_CFLAGS= libngspice_la_LDFLAGS=-static

# 4. Code models como side modules. El makefile lista los modelos con
#    $(cmpp) -p, que por defecto apunta al cmpp wasm (no ejecutable).
emmake make -C "$OBJ/src/xspice/icm" -j"$JOBS" \
  cmpp=../cmpp/build/cmpp LDFLAGS="-O2 -sSIDE_MODULE=1"

# 5. Link final
EXPORTS=_ngSpice_Init,_ngSpice_Init_Evt,_ngSpice_Circ,_ngSpice_Command,_ngGet_Vec_Info,\
_ngSpice_CurPlot,_ngSpice_AllPlots,_ngSpice_AllVecs,_ngSpice_AllEvtNodes,_ngGet_Evt_NodeInfo,\
_ngSpice_Reset,_malloc,_free
RUNTIME=FS,addFunction,removeFunction,UTF8ToString,stringToNewUTF8,getValue,HEAPF64,HEAP32,HEAPU8

# Los .cm se pasan al link (como .so) sólo para que emcc exporte desde el módulo
# principal las funciones de libc que importan (MAIN_MODULE=2 elimina el resto).
# AUTOLOAD_DYLIBS=0: no se cargan al arrancar; los carga "codemodel" desde spinit.
SO="$BUILD/so"
rm -rf "$SO" && mkdir -p "$SO"
for cm in "${CODEMODELS[@]}"; do
  cp "$OBJ/src/xspice/icm/$cm/$cm.cm" "$SO/$cm.so"
  cp "$OBJ/src/xspice/icm/$cm/$cm.cm" "$DIST/"
done

# las funciones de libc/libm que importan los modelos de OpenVAF (#209), con el mismo truco
emcc -O2 -fPIC -sSIDE_MODULE=1 -o "$SO/osdi_imports.so" "$HERE/osdi/imports.c"

# Icarus Verilog (#209): Verilog de comportamiento por d_cosim. libvvp, sus módulos VPI y el puente
# se cargan con dlopen sólo si hace falta (van al link por lo que importan de libc y libc++); el
# compilador (ivl, ivlpp) lo usa el Worker de Yosys/Icarus
NGSPICE_INC="$SRC/src/include" bash "$HERE/icarus/build.sh"
ICARUS="$BUILD/icarus-out"
for f in libvvp.so ivlng.so ivlng.vpi system.vpi v2005_math.vpi va_math.vpi v2009.vpi; do
  cp "$ICARUS/$f" "$SO/icarus_${f//./_}.so"
done
rm -rf "$DIST/icarus" && cp -r "$ICARUS" "$DIST/icarus"

emcc -O2 "$OBJ/src/.libs/libngspice.a" "$SO"/*.so -lm -o "$DIST/ngspice.mjs" \
  -sMAIN_MODULE=2 -sAUTOLOAD_DYLIBS=0 \
  -sMODULARIZE -sEXPORT_ES6 -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH -sMAXIMUM_MEMORY=4GB -sFORCE_FILESYSTEM -sALLOW_TABLE_GROWTH \
  -sEXPORTED_FUNCTIONS="$EXPORTS" -sEXPORTED_RUNTIME_METHODS="$RUNTIME"

cp "$HERE/spinit" "$DIST/spinit"

# 6. Prueba de OSDI (#209): un modelo compilado como side module wasm32 que ngspice carga con
#    pre_osdi (lo usa engine/smoke; no va al sitio)
mkdir -p "$BUILD/osdi"
emcc -O2 -fPIC -sSIDE_MODULE=1 -I "$SRC/src/osdi" -o "$BUILD/osdi/vres.osdi" "$HERE/osdi/vres.c"

ls -la "$DIST"
