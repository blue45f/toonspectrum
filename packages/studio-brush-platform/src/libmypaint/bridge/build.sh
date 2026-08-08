#!/usr/bin/env bash
# ToonSpectrum libmypaint wasm build (ADR-0011 lane 11).
#
# Reproducible-build contract (same idea as packages/studio-hokusai-wasm):
#   source   : libmypaint v1.6.1, commit 2768251dacce3939136c839aeca413f4aa4241d0
#              cloned at ~/toolchains/libmypaint (NOT vendored into this repo)
#   toolchain: emscripten 6.0.6 (source ~/emsdk/emsdk_env.sh)
#   codegen  : python3 generate.py mypaint-brush-settings-gen.h brushsettings-gen.h
#              (the autotools step normally runs this; we run it directly)
#   json-c   : bypassed — bridge/json.h stubs the parser, brushes are programmed
#              through the injection API only (see json.h header comment)
#
# Output: ../mypaint-wasm.mjs + ../mypaint-wasm.wasm, then refresh
# ../INTEGRITY.sha256 (verified by scripts/verify-studio-engine.mjs).
set -euo pipefail

BRIDGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$(dirname "$BRIDGE_DIR")"
LIBMYPAINT_DIR="${LIBMYPAINT_DIR:-$HOME/toolchains/libmypaint}"
EXPECTED_COMMIT="2768251dacce3939136c839aeca413f4aa4241d0"

if ! command -v emcc >/dev/null 2>&1; then
  # shellcheck disable=SC1090
  source "$HOME/emsdk/emsdk_env.sh" >/dev/null 2>&1 || {
    echo "emcc not found; install emsdk and source emsdk_env.sh" >&2
    exit 1
  }
fi

ACTUAL_COMMIT="$(git -C "$LIBMYPAINT_DIR" rev-parse HEAD)"
if [ "$ACTUAL_COMMIT" != "$EXPECTED_COMMIT" ]; then
  echo "libmypaint checkout is $ACTUAL_COMMIT, expected v1.6.1 ($EXPECTED_COMMIT)" >&2
  exit 1
fi

# Generated settings headers (autotools normally produces these).
if [ ! -f "$LIBMYPAINT_DIR/brushsettings-gen.h" ] ||
  [ ! -f "$LIBMYPAINT_DIR/mypaint-brush-settings-gen.h" ]; then
  (cd "$LIBMYPAINT_DIR" && python3 generate.py mypaint-brush-settings-gen.h brushsettings-gen.h)
fi

SOURCES=(
  "$BRIDGE_DIR/mypaint-bridge.c"
  "$LIBMYPAINT_DIR/mypaint.c"
  "$LIBMYPAINT_DIR/mypaint-brush.c"
  "$LIBMYPAINT_DIR/mypaint-brush-settings.c"
  "$LIBMYPAINT_DIR/mypaint-mapping.c"
  "$LIBMYPAINT_DIR/mypaint-matrix.c"
  "$LIBMYPAINT_DIR/mypaint-rectangle.c"
  "$LIBMYPAINT_DIR/mypaint-surface.c"
  "$LIBMYPAINT_DIR/mypaint-symmetry.c"
  "$LIBMYPAINT_DIR/mypaint-tiled-surface.c"
  "$LIBMYPAINT_DIR/mypaint-fixed-tiled-surface.c"
  "$LIBMYPAINT_DIR/brushmodes.c"
  "$LIBMYPAINT_DIR/fifo.c"
  "$LIBMYPAINT_DIR/helpers.c"
  "$LIBMYPAINT_DIR/operationqueue.c"
  "$LIBMYPAINT_DIR/rng-double.c"
  "$LIBMYPAINT_DIR/tilemap.c"
)

emcc \
  "${SOURCES[@]}" \
  -I "$BRIDGE_DIR" \
  -I "$LIBMYPAINT_DIR" \
  -O3 \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sEXPORT_NAME=createLibMypaintModule \
  -sENVIRONMENT=web,node \
  -sALLOW_MEMORY_GROWTH=1 \
  -sASSERTIONS=0 \
  -sEXPORTED_RUNTIME_METHODS=cwrap,HEAPU8,UTF8ToString \
  -sEXPORTED_FUNCTIONS=_malloc,_free \
  -o "$OUT_DIR/mypaint-wasm.mjs"

# Generated JS is exempt from host lint (same policy as the wasm-bindgen pkgs;
# this dir cannot be added to eslint.config.mjs from the lane-11 change scope).
BANNER="/* eslint-disable */"
if ! head -1 "$OUT_DIR/mypaint-wasm.mjs" | grep -q "eslint-disable"; then
  printf '%s\n' "$BANNER" | cat - "$OUT_DIR/mypaint-wasm.mjs" >"$OUT_DIR/mypaint-wasm.mjs.tmp"
  mv "$OUT_DIR/mypaint-wasm.mjs.tmp" "$OUT_DIR/mypaint-wasm.mjs"
fi

# Refresh the reproducible-release manifest (generated artifacts + the pinned
# bridge sources; hand-written loader files are covered by lint/typecheck).
(
  cd "$OUT_DIR"
  {
    echo "# ToonSpectrum libmypaint wasm reproducible release manifest (ADR-0011 lane 11)"
    echo "# libmypaint v1.6.1 (2768251dacce3939136c839aeca413f4aa4241d0), json-c bypassed"
    echo "# emcc $(emcc --version | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
    shasum -a 256 \
      mypaint-wasm.mjs \
      mypaint-wasm.wasm \
      bridge/build.sh \
      bridge/config.h \
      bridge/json.h \
      bridge/mypaint-bridge.c
  } >INTEGRITY.sha256
)

echo "built $OUT_DIR/mypaint-wasm.mjs ($(wc -c <"$OUT_DIR/mypaint-wasm.mjs") bytes) + .wasm ($(wc -c <"$OUT_DIR/mypaint-wasm.wasm") bytes)"
