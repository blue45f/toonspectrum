/**
 * Sumi wasm 커널(`wasm/sumi-kernel`) C-ABI 계약 — TS와 Rust(`src/lib.rs`)의 단일 원천.
 * wasm-bindgen을 쓰지 않는다: 숫자 인자와 선형 메모리 포인터만 오가며, 호스트가 `sk_alloc`으로 만든 블록에 데이터를 쓰고
 * 포인터를 넘긴다. ABI를 바꾸면 `SUMI_KERNEL_ABI_VERSION`을 올리고 `build.sh`로 wasm·INTEGRITY.sha256을 다시 만든다.
 *
 * 메모리 소유권: 모든 포인터는 호스트 소유다(`sk_alloc`/`sk_free`, 16 B 정렬 0 초기화). 커널은 호출 사이에 포인터를 보관하지 않는다.
 * 선형 메모리는 `sk_alloc`에서 늘어날 수 있으므로(memory.grow) 호스트는 호출마다 `memory.buffer`에서 뷰를 다시 만든다.
 */

export const SUMI_KERNEL_ABI_VERSION = 1;

/** wasm 모듈이 내보내야 하는 이름(순서 무관, 정확히 이 집합). */
export const SUMI_KERNEL_EXPORTS = [
  "memory",
  "sk_abi_version",
  "sk_alloc",
  "sk_free",
  "sk_hash_noise",
  "sk_coverage",
  "sk_bin_dabs",
  "sk_raster_tile",
] as const;

/** `sk_raster_tile` 파라미터 블록(f64 × SK_PARAM_COUNT) 인덱스. Rust `P_*` 상수와 같다. */
export const SK_PARAM = {
  filterMode: 0,
  tipTile: 1,
  tipLevels: 2,
  paperEnabled: 3,
  paperScale: 4,
  paperRotation: 5,
  paperSize: 6,
  edgeEnabled: 7,
  edgeLen: 8,
} as const;
export const SK_PARAM_COUNT = 16;

/** `sk_bin_dabs` 반환 코드. */
export const SK_BIN_STATUS = {
  ok: 0,
  /** 널 포인터 또는 타일 격자 0. */
  badArgs: 1,
  /** refs 총수 > refs_cap — refs는 기록되지 않고 `out`(dirty 수·refs 총수·overflow)만 채워진다. 호스트가 refs를 키워 다시 부른다. */
  refsCapacity: 2,
} as const;

/** 습식 풀 타일(12 채널 × 256 f32)·획 타일(rgba × 256 f32)의 f32 수. */
export const SK_WET_TILE_FLOATS = 12 * 256;
export const SK_STROKE_TILE_FLOATS = 4 * 256;

/** 팁 아틀라스 평탄화 규약: 레벨 L의 한 변 n_L = max(1, tile >> L), 레벨 데이터 = n_L × (8·n_L) f32(8종 가로 배치), 레벨을 이어 붙인다. */
export function tipAtlasFloats(tile: number, levels: number): number {
  let total = 0;
  for (let level = 0; level < levels; level += 1) {
    const n = Math.max(1, tile >> level);
    total += n * 8 * n;
  }
  return total;
}

/** wasm 인스턴스의 export 표면(타입). */
export interface SumiKernelExports {
  memory: WebAssembly.Memory;
  sk_abi_version(): number;
  sk_alloc(bytes: number): number;
  sk_free(ptr: number, bytes: number): void;
  sk_hash_noise(x: number, y: number, seed: number): number;
  sk_coverage(dx: number, dy: number, rx: number, ry: number, angle: number, hardness: number, shapeExp: number, deposition: number): number;
  sk_bin_dabs(
    dabs: number,
    n: number,
    tilesX: number,
    tilesY: number,
    maxTilesPerDab: number,
    counts: number,
    offsets: number,
    refs: number,
    refsCap: number,
    dirty: number,
    out: number,
  ): number;
  sk_raster_tile(
    tile: number,
    tilesX: number,
    dabs: number,
    dabCount: number,
    refs: number,
    refCount: number,
    params: number,
    tipAtlas: number,
    tipAtlasFloats: number,
    paper: number,
    curve: number,
    pick: number,
    wetTile: number,
    strokeTile: number,
  ): number;
}
