#!/usr/bin/env bash
# Sumi wasm 커널 재현 빌드. 저장소 안에 target/을 만들지 않고(CARGO_TARGET_DIR 임시 디렉터리) pkg/에 산출물을 복사한다.
#   bash build.sh          → 빌드 + pkg/sumi_kernel.wasm 갱신 + pkg/INTEGRITY.sha256 재생성
#                            + src/engine/wasm/kernel-{integrity,embedded}.ts 재생성
#   bash build.sh --check  → 빌드 후 pkg 산출물과 바이트 비교 + INTEGRITY 검증 + kernel-{integrity,embedded}.ts 일치
#                            (불일치 시 종료 코드 1)
# 요구: rustc/cargo 1.97.0 + wasm32-unknown-unknown(wasm-bindgen 불필요, 외부 crate 0).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-build}"
export CARGO_TARGET_DIR="${TMPDIR:-/tmp}/sumi-kernel-target"
# 소스 경로를 고정해 바이너리에 절대 경로가 들어가지 않게 한다(재현성).
export RUSTFLAGS="--remap-path-prefix=${HERE}=/sumi-kernel ${RUSTFLAGS:-}"
export CARGO_INCREMENTAL=0
INTEGRITY_TS="${HERE}/../../src/engine/wasm/kernel-integrity.ts"
EMBEDDED_TS="${HERE}/../../src/engine/wasm/kernel-embedded.ts"
cd "$HERE"
if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo가 없다(rustup으로 1.97.0 + wasm32-unknown-unknown 설치 필요)" >&2
  exit 3
fi
if [ ! -f Cargo.lock ]; then
  cargo generate-lockfile --offline
fi
cargo build --release --target wasm32-unknown-unknown --locked --quiet
BUILT="${CARGO_TARGET_DIR}/wasm32-unknown-unknown/release/sumi_kernel.wasm"
if [ ! -f "$BUILT" ]; then
  echo "빌드 산출물이 없다: $BUILT" >&2
  exit 1
fi
RUSTC_VERSION="$(rustc --version)"
WASM_SHA="$(sha256sum "$BUILT" | cut -d' ' -f1)"
WASM_BYTES="$(stat -c %s "$BUILT")"

# TS가 기대하는 해시 모듈(생성 파일). 레인·로더는 이 상수와 주입된 바이트의 SHA-256을 대조한다.
render_integrity_ts() {
  cat <<EOF
// 생성 파일 — wasm/sumi-kernel/build.sh가 만든다. 직접 고치지 않는다(loader.test.ts가 INTEGRITY.sha256과 대조한다).
// ${RUSTC_VERSION} / target wasm32-unknown-unknown
export const SUMI_KERNEL_SHA256 = "${WASM_SHA}";
export const SUMI_KERNEL_BYTE_LENGTH = ${WASM_BYTES};
EOF
}

# 레인이 별도 fetch·자산 배선 없이 어디서나(브라우저·Worker·Node) 쓰도록 wasm 바이트를 base64로 내장한 생성 파일.
# loader.test.ts가 디코드 결과가 pkg/sumi_kernel.wasm과 같음을 검증한다.
render_embedded_ts() {
  echo "// 생성 파일 — wasm/sumi-kernel/build.sh가 만든다. 직접 고치지 않는다(loader.test.ts가 pkg/sumi_kernel.wasm과 대조한다)."
  echo "// ${RUSTC_VERSION} / target wasm32-unknown-unknown / ${WASM_BYTES} B / sha256 ${WASM_SHA}"
  echo 'export const SUMI_KERNEL_BASE64 = `'
  base64 -w 120 "$BUILT"
  echo '`;'
}

mkdir -p pkg
if [ "$MODE" = "--check" ]; then
  if ! cmp -s "$BUILT" pkg/sumi_kernel.wasm; then
    echo "재빌드 산출물이 pkg/sumi_kernel.wasm과 다르다(재현성 실패)" >&2
    exit 1
  fi
  if ! grep -v '^#' pkg/INTEGRITY.sha256 | sha256sum -c --quiet -; then
    echo "INTEGRITY.sha256 불일치" >&2
    exit 1
  fi
  if ! render_integrity_ts | cmp -s - "$INTEGRITY_TS"; then
    echo "src/engine/wasm/kernel-integrity.ts가 재빌드 산출물과 다르다" >&2
    exit 1
  fi
  if ! render_embedded_ts | cmp -s - "$EMBEDDED_TS"; then
    echo "src/engine/wasm/kernel-embedded.ts가 재빌드 산출물과 다르다" >&2
    exit 1
  fi
  echo "ok: 재빌드 바이트 동일, INTEGRITY·kernel-integrity.ts·kernel-embedded.ts 일치 (${WASM_BYTES} B)"
  exit 0
fi
cp "$BUILT" pkg/sumi_kernel.wasm
{
  echo "# ${RUSTC_VERSION} / target wasm32-unknown-unknown / opt-level=s lto codegen-units=1 panic=abort strip"
  sha256sum Cargo.toml Cargo.lock src/lib.rs pkg/sumi_kernel.wasm
} > pkg/INTEGRITY.sha256
render_integrity_ts > "$INTEGRITY_TS"
render_embedded_ts > "$EMBEDDED_TS"
echo "built: pkg/sumi_kernel.wasm (${WASM_BYTES} B)"
cat pkg/INTEGRITY.sha256
