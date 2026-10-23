#!/usr/bin/env bash
# OpenVAF-Reloaded con destino wasm32-unknown-emscripten (#209): compila Verilog-A a side modules
# que ngspice.wasm carga con pre_osdi. Requiere Rust, LLVM 21 (llvm-config en /usr/lib/llvm21 o
# $LLVM_SYS_211_PREFIX) y emsdk (su clang 21 genera la stdlib OSDI en bitcode y su wasm-ld enlaza).
# Salida: engine/build/OpenVAF-Reloaded/target/release/openvaf-r y engine/build/osdi/vdio.osdi
#   openvaf-r --target wasm32-unknown-emscripten -o modelo.osdi modelo.va
set -euo pipefail

OPENVAF_COMMIT=718353a10f04c0b992c7e8a2046034a29ff06a0f
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD="$HERE/../build"
SRC="$BUILD/OpenVAF-Reloaded"
EMSDK="${EMSDK:-$HOME/emsdk}"
export LLVM_SYS_211_PREFIX="${LLVM_SYS_211_PREFIX:-/usr/lib/llvm21}"
# clang y wasm-ld de emsdk (LLVM 21) antes que los del sistema
export PATH="$EMSDK/upstream/bin:$LLVM_SYS_211_PREFIX/bin:$PATH"

if [ ! -d "$SRC" ]; then
  git clone https://github.com/OpenVAF/OpenVAF-Reloaded.git "$SRC"
  git -C "$SRC" checkout "$OPENVAF_COMMIT"
  git -C "$SRC" apply "$HERE/openvaf-wasm32.patch"
fi
# Cambios del parche:
#  - destino wasm32-unknown-emscripten (spec, stdlib en bitcode, backend WebAssembly de LLVM);
#  - enlace con wasm-ld como `emcc -sSIDE_MODULE=1`, con -Bsymbolic: si no, dos .osdi cargados a la
#    vez comparten access_0/eval_0… (el primero gana) y el segundo modelo no anda;
#  - react_ptr_off con el tamaño de puntero del destino (estaba fijo en 8: en wasm32 los punteros
#    del jacobiano reactivo pisaban node_mapping).
(cd "$SRC" && cargo build --release --features llvm21 --bin openvaf-r)

mkdir -p "$BUILD/osdi"
"$SRC/target/release/openvaf-r" --target wasm32-unknown-emscripten -o "$BUILD/osdi/vdio.osdi" "$HERE/vdio.va"
