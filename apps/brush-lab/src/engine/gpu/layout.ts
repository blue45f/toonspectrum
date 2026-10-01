/**
 * WebGPU compute 타일 파이프라인의 상수·바인딩·진입점·Params 레이아웃 — TS와 WGSL의 단일 원천.
 *
 * - WGSL 모듈(`./wgsl/*.wgsl.ts`)은 이 파일의 상수를 템플릿 리터럴로 삽입하고,
 *   `wgsl-contract.test.ts`가 삽입 결과를 정적으로 대조한다.
 * - DOM 전역(`GPUBufferUsage` 등)은 Node 테스트에서 존재하지 않으므로 숫자 상수를 직접 둔다.
 * - 바이트 오프셋(TABLE_OFFSETS·BINS_OFFSETS)은 WGSL struct 규칙(u32 4 B, vec3<u32> 크기 12·정렬 16)으로
 *   손으로 계산했고 `layout.test.ts`가 같은 규칙으로 다시 계산해 대조한다.
 */

/** 타일 한 변(px). `raster/tile-binning.ts`의 TILE_SIZE와 같다. */
export const GPU_TILE_SIZE = 16;
/** 타일당 픽셀 수. */
export const GPU_TILE_PIXELS = 256;
/** 1차원 워크그룹 크기(count·scan_add·scatter·wet_commit). */
export const WORKGROUP_1D = 256;
/** scan_blocks 1블록이 처리하는 타일 수(256 스레드 × 4). */
export const SCAN_BLOCK = 1024;
/** 프레임당 업로드 상한. 초과 시 같은 프레임 안에서 분할 제출한다. */
export const MAX_DABS_PER_BATCH = 65_536;
/** 캔버스 상한 2048² / 16². */
export const MAX_TILES = 16_384;
/** 캔버스 한 변 상한(px). 초과 → limit-exceeded. */
export const MAX_CANVAS_PX = 2048;
export const MAX_SCAN_BLOCKS = 16;
/** CSR refs 상한(u32). 초과분은 refs_overflow로 기록한다. */
export const MAX_REFS = 1_048_576;
/** dab 1개가 겹칠 수 있는 타일 수 상한. 초과 dab는 건너뛰고 overflow 계수. */
export const MAX_TILES_PER_DAB = 4096;
/** 습식 풀 채널 수(`wet/state.ts` WET_CHANNELS와 동일). */
export const WET_CHANNELS = 12;
/** 습식 풀 타일 1개의 f32 수(12 × 256). */
export const WET_FLOATS_PER_TILE = WET_CHANNELS * GPU_TILE_PIXELS;
/** 획 풀 타일 1개의 f32 수(rgba × 256). */
export const STROKE_FLOATS_PER_TILE = 4 * GPU_TILE_PIXELS;
/** 미할당 슬롯 표식. */
export const SLOT_NONE = 0xffff_ffff;
/** wet_expand가 CAS로 할당 중임을 표시하는 임시 값(패스가 끝나면 남지 않는다). */
export const SLOT_RESERVED = 0xffff_fffe;
/**
 * 팁 아틀라스 한 팁의 한 변(px). CPU 참조(`raster/reference-renderer.ts` TIP_MASK_SIZE = 64)와 같은
 * 마스크를 레벨 0에 올려 패리티를 유지한다. 8종을 가로로 이어붙인다.
 */
export const TIP_ATLAS_TILE = 64;
export const TIP_ATLAS_KINDS = 8;
/** 팁 아틀라스 mip 레벨 수(64 → 1). */
export const TIP_ATLAS_LEVELS = 7;
/** 종이 텍스처 한 변(`raster/reference-renderer.ts` PAPER_FIELD_SIZE와 동일). */
export const PAPER_TEXTURE_SIZE = 256;
/** 기본 획 풀 용량(타일). */
export const DEFAULT_STROKE_CAPACITY_TILES = 2048;
/** 기본 습식 풀 용량(타일). */
export const DEFAULT_WET_CAPACITY_TILES = 512;
/** wet_commit 디스패치 워크그룹 수(256 × 64 = MAX_TILES 스레드). */
export const WET_COMMIT_WORKGROUPS = MAX_TILES / WORKGROUP_1D;
/** 습식 활성 셀 임계(`wet/active-tiles.ts` WET_EPS). */
export const WET_EPS = 1e-4;
/** smudge 픽업 강도(`raster/fine-raster.ts`의 smudgeStrength). */
export const SMUDGE_STRENGTH = 0.7;
/** 습식 bake의 질량 → 알파 계수(`wet/wet-reference.ts` BAKE_MASS_TO_ALPHA). */
export const BAKE_MASS_TO_ALPHA = 3;
/** 간접 디스패치 인자 크기(vec3<u32>). */
export const INDIRECT_ARGS_BYTES = 12;

/** `GPUBufferUsage` 숫자 상수(Node에는 전역이 없다). */
export const BUFFER_USAGE = {
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
  INDIRECT: 0x0100,
  QUERY_RESOLVE: 0x0200,
} as const;

/** `GPUTextureUsage` 숫자 상수. */
export const TEXTURE_USAGE = {
  COPY_SRC: 0x01,
  COPY_DST: 0x02,
  TEXTURE_BINDING: 0x04,
  STORAGE_BINDING: 0x08,
  RENDER_ATTACHMENT: 0x10,
} as const;

/** `GPUShaderStage` 숫자 상수. */
export const SHADER_STAGE = { VERTEX: 0x1, FRAGMENT: 0x2, COMPUTE: 0x4 } as const;

/** `GPUMapMode` 숫자 상수. */
export const MAP_MODE = { READ: 0x1, WRITE: 0x2 } as const;

export type BindingKind =
  | "uniform"
  /** dispatch마다 `setBindGroup(index, group, [offset])`로 레코드를 고르는 uniform(임파스토 dab 레코드). */
  | "uniform-dynamic"
  | "storage-read"
  | "storage-rw"
  | "texture-2d"
  | "sampler"
  | "storage-texture-write-rgba8unorm";

export interface BindingSlot {
  group: 0 | 1 | 2;
  binding: number;
  kind: BindingKind;
}

/**
 * 바인딩 표. compute 스테이지 storage 버퍼 = 8개(기본 한도 8).
 * 바인드 그룹 레이아웃은 명시적으로 3개 만든다. group 0·1은 모든 compute 파이프라인이 공유하고,
 * group 2(간접 디스패치 인자 `indirect` + 임파스토 dab 레코드 `impasto_dab`)는 그 바인딩을 쓰는 파이프라인
 * (`GROUP2_ENTRIES` = write_indirect·wet_commit·impasto_move·impasto_apply)의 레이아웃에만 들어간다.
 * 같은 버퍼가 한 dispatch 안에서 INDIRECT 사용과 쓰기 가능 storage 사용을 겸하면 WebGPU가 거부하므로(usage scope 규칙),
 * `dispatchWorkgroupsIndirect`를 쓰는 파이프라인(scatter·raster·composite·wet_step 등)의 레이아웃에서는 이 버퍼를 뺀다.
 */
export const BINDINGS = {
  params: { group: 0, binding: 0, kind: "uniform" },
  dabs: { group: 0, binding: 1, kind: "storage-read" },
  bins: { group: 0, binding: 2, kind: "storage-rw" },
  refs: { group: 0, binding: 3, kind: "storage-rw" },
  table: { group: 0, binding: 4, kind: "storage-rw" },
  indirect: { group: 2, binding: 0, kind: "storage-rw" },
  impastoDab: { group: 2, binding: 1, kind: "uniform-dynamic" },
  strokePool: { group: 1, binding: 0, kind: "storage-rw" },
  wetPool: { group: 1, binding: 1, kind: "storage-rw" },
  document: { group: 1, binding: 2, kind: "storage-rw" },
  tipAtlas: { group: 1, binding: 3, kind: "texture-2d" },
  paperTex: { group: 1, binding: 4, kind: "texture-2d" },
  linSampler: { group: 1, binding: 5, kind: "sampler" },
  presentTex: { group: 1, binding: 6, kind: "storage-texture-write-rgba8unorm" },
} as const satisfies Record<string, BindingSlot>;

export type BindingName = keyof typeof BINDINGS;

/** WGSL 변수 이름(바인딩 선언에 쓰는 snake_case). */
export const BINDING_WGSL_NAMES: Record<BindingName, string> = {
  params: "params",
  dabs: "dabs",
  bins: "bins",
  refs: "refs",
  table: "table",
  indirect: "indirect_args",
  impastoDab: "impasto_dab",
  strokePool: "stroke_pool",
  wetPool: "wet_pool",
  document: "document_px",
  tipAtlas: "tip_atlas",
  paperTex: "paper_tex",
  linSampler: "lin_sampler",
  presentTex: "present_tex",
};

/** present 렌더 파이프라인 전용 바인딩(group 0): presentTex를 샘플링 텍스처로 읽는다. */
export const PRESENT_BINDINGS = {
  source: { group: 0, binding: 0, name: "present_src" },
  sampler: { group: 0, binding: 1, name: "present_sampler" },
} as const;

/** 인스턴싱(비교 레인) 렌더 파이프라인 바인딩(group 0). */
export const INSTANCED_BINDINGS = {
  params: { group: 0, binding: 0, name: "inst_params" },
  tipAtlas: { group: 0, binding: 1, name: "tip_atlas" },
  paperTex: { group: 0, binding: 2, name: "paper_tex" },
  linSampler: { group: 0, binding: 3, name: "lin_sampler" },
} as const;

/** 인스턴싱 bake/encode 풀스크린 패스 바인딩(group 0). */
export const INSTANCED_BLIT_BINDINGS = {
  params: { group: 0, binding: 0, name: "inst_params" },
  docTex: { group: 0, binding: 1, name: "doc_tex" },
  strokeTex: { group: 0, binding: 2, name: "stroke_tex" },
} as const;

export const ENTRY_POINTS = {
  binCount: "count_main",
  scanBlocks: "scan_blocks",
  scanBlockSums: "scan_block_sums",
  scanAdd: "scan_add",
  writeIndirect: "write_indirect",
  scatter: "scatter_stable",
  fineRaster: "raster_tile",
  wetStep: "wet_step",
  wetExpand: "wet_expand",
  wetCommit: "wet_commit",
  bakeWet: "bake_wet",
  compositeDirty: "composite_dirty",
  compositeAll: "composite_all",
  bakeStroke: "bake_stroke",
  smudgeCarry: "smudge_carry",
  impastoMove: "impasto_move",
  impastoApply: "impasto_apply",
  presentVs: "vs_main",
  presentFs: "fs_main",
  instancedVs: "inst_vs_main",
  instancedFs: "inst_fs_main",
  instancedBlitVs: "inst_blit_vs",
  instancedBakeFs: "inst_bake_fs",
  instancedEncodeFs: "inst_encode_fs",
} as const;

export type EntryPointName = keyof typeof ENTRY_POINTS;

/** compute 진입점(생성 순서 = 파이프라인 생성 순서). */
export const COMPUTE_ENTRY_ORDER = [
  "binCount",
  "scanBlocks",
  "scanBlockSums",
  "scanAdd",
  "writeIndirect",
  "scatter",
  "fineRaster",
  "wetStep",
  "wetExpand",
  "wetCommit",
  "bakeWet",
  "compositeDirty",
  "compositeAll",
  "bakeStroke",
  "smudgeCarry",
  "impastoMove",
  "impastoApply",
] as const satisfies readonly EntryPointName[];

/** TS 함수와 1:1로 대응하는 WGSL 함수(정적 대조 대상). */
export const WGSL_MIRROR_FUNCTIONS = [
  "hash_u32",
  "hash_noise_2d",
  "value_noise_2d",
  "fbm_2d",
  "superellipse_coverage",
  "dab_tile_bounds",
  "km_mix",
  "linear_to_srgb",
  "srgb_to_linear",
] as const;

/**
 * WGSL 예약어(WGSL 사양 "Reserved Words" 표). 변수·함수·인자·struct 멤버 이름으로 쓰면 컴파일 오류다
 * (브라우저 프로브에서 `filter`가 실제로 오류를 냈다). `meta`·`active`는 진화 중인 예약어 후보라 함께 막는다.
 */
export const WGSL_FORBIDDEN_IDENTIFIERS = [
  "NULL", "Self", "abstract", "active", "alignas", "alignof", "as", "asm", "asm_fragment", "async", "attribute", "auto", "await",
  "become", "binding_array", "cast", "catch", "class", "co_await", "co_return", "co_yield", "coherent", "column_major", "common",
  "compile", "compile_fragment", "concept", "const_cast", "consteval", "constexpr", "constinit", "crate", "debugger", "decltype",
  "delete", "demote", "demote_to_helper", "do", "dynamic_cast", "enum", "explicit", "export", "extends", "extern", "external",
  "fallthrough", "filter", "final", "finally", "friend", "from", "fxgroup", "get", "goto", "groupshared", "highp", "impl",
  "implements", "import", "inline", "instanceof", "interface", "layout", "lowp", "macro", "macro_rules", "match", "mediump", "meta",
  "mod", "module", "move", "mut", "mutable", "namespace", "new", "nil", "noexcept", "noinline", "nointerpolation", "noperspective",
  "null", "nullptr", "of", "operator", "package", "packoffset", "partition", "pass", "patch", "pixelfragment", "precise",
  "precision", "premerge", "priv", "protected", "pub", "public", "readonly", "ref", "regardless", "register", "reinterpret_cast",
  "require", "resource", "restrict", "self", "set", "shared", "sizeof", "smooth", "snorm", "static", "static_assert", "static_cast",
  "std", "subroutine", "super", "target", "template", "this", "thread_local", "throw", "trait", "try", "type", "typedef", "typeid",
  "typename", "typeof", "union", "unless", "unorm", "unsafe", "unsized", "use", "using", "varying", "virtual", "volatile", "wgsl",
  "where", "with", "writeonly", "yield",
] as const;

/**
 * TileTable 헤더(바이트 오프셋). 세 영역으로 나뉜다.
 * - [0, 8): 프레임마다 clearBuffer 1회로 비우는 영역(dirty_count, refs_total).
 * - [0, 32): 획(stroke) 영역 — endStroke에서 0으로 되돌린다(overflow 계수는 획 동안 누적, 영수증에 기록).
 * - [32, 52): 습식 영역 — 획이 끝나도 유지된다(습식 풀·슬롯은 문서처럼 지속). 52..63은 패딩.
 * 헤더 뒤에 u32 배열 7개(MAX_TILES 길이)가 이어진다:
 * dirty_tiles, slots, wet_slots, stroke_dirty_tiles, wet_active_tiles, wet_live, wet_live_next.
 * 간접 디스패치 인자(vec3<u32> 3개)는 usage scope 규칙 때문에 TileTable이 아니라 별도 `indirect` 버퍼(`INDIRECT_OFFSETS`)에 둔다.
 */
export const TABLE_OFFSETS = {
  /** [프레임 초기화 영역] 이번 프레임 dirty 타일 수. */
  dirtyCount: 0,
  /** [프레임 초기화 영역] 이번 프레임 refs 총수(scan_block_sums가 기록). */
  refsTotal: 4,
  /** 프레임 초기화 영역 크기. */
  frameClearBytes: 8,
  /** [획 누적] MAX_TILES_PER_DAB 초과로 건너뛴 dab 수. */
  dabOverflow: 8,
  /** [획 누적] MAX_REFS 초과분(refs 단위). */
  refsOverflow: 12,
  poolCursor: 16,
  strokeDirtyCount: 20,
  /** [획 누적] 획 풀 용량 초과 타일 수. */
  poolOverflow: 24,
  /** 패딩(획 영역을 32 B로 맞춘다). */
  strokePad: 28,
  /** 획 영역 크기(endStroke에서 0으로 되돌리는 범위). */
  strokeResetBytes: 32,
  wetCursor: 32,
  wetActiveCount: 36,
  wetOverflow: 40,
  wetParity: 44,
  /** 직전 wet_commit 기준 live 타일 수(endStroke 건조 루프 조기 종료용). */
  wetLiveCount: 48,
  headerPad0: 52,
  headerPad1: 56,
  headerPad2: 60,
  header: 64,
  dirtyTiles: 64,
  slots: 64 + MAX_TILES * 4,
  wetSlots: 64 + MAX_TILES * 4 * 2,
  strokeDirtyTiles: 64 + MAX_TILES * 4 * 3,
  wetActiveTiles: 64 + MAX_TILES * 4 * 4,
  wetLive: 64 + MAX_TILES * 4 * 5,
  wetLiveNext: 64 + MAX_TILES * 4 * 6,
} as const;

/**
 * WGSL `struct TileTable` 멤버 순서·타입(헤더). `layout.test.ts`가 WGSL 구조체 규칙으로 오프셋을 다시
 * 계산해 TABLE_OFFSETS와 대조하고, `common.wgsl.ts`가 같은 순서로 struct를 선언한다.
 */
export const TABLE_HEADER_MEMBERS = [
  ["dirty_count", "atomic<u32>", "dirtyCount"],
  ["refs_total", "u32", "refsTotal"],
  ["dab_overflow", "atomic<u32>", "dabOverflow"],
  ["refs_overflow", "u32", "refsOverflow"],
  ["pool_cursor", "atomic<u32>", "poolCursor"],
  ["stroke_dirty_count", "atomic<u32>", "strokeDirtyCount"],
  ["pool_overflow", "atomic<u32>", "poolOverflow"],
  ["stroke_pad", "u32", "strokePad"],
  ["wet_cursor", "atomic<u32>", "wetCursor"],
  ["wet_active_count", "atomic<u32>", "wetActiveCount"],
  ["wet_overflow", "atomic<u32>", "wetOverflow"],
  ["wet_parity", "u32", "wetParity"],
  ["wet_live_count", "atomic<u32>", "wetLiveCount"],
  ["header_pad0", "u32", "headerPad0"],
  ["header_pad1", "u32", "headerPad1"],
  ["header_pad2", "u32", "headerPad2"],
] as const satisfies readonly (readonly [string, string, keyof typeof TABLE_OFFSETS])[];

/** 헤더 뒤 u32 배열(순서 = 바이트 순서). */
export const TABLE_ARRAY_MEMBERS = [
  ["dirty_tiles", "array<u32>", "dirtyTiles"],
  ["slots", "array<u32>", "slots"],
  ["wet_slots", "array<atomic<u32>>", "wetSlots"],
  ["stroke_dirty_tiles", "array<u32>", "strokeDirtyTiles"],
  ["wet_active_tiles", "array<u32>", "wetActiveTiles"],
  ["wet_live", "array<u32>", "wetLive"],
  ["wet_live_next", "array<atomic<u32>>", "wetLiveNext"],
] as const satisfies readonly (readonly [string, string, keyof typeof TABLE_OFFSETS])[];

/**
 * 간접 디스패치 인자 버퍼(`indirect`, group 2). `struct IndirectArgs`의 vec3<u32>는 16 B 정렬이라 인자 3개가
 * 16 B 간격이다. `dispatchWorkgroupsIndirect(indirect, offset)`의 offset은 4의 배수여야 한다.
 */
export const INDIRECT_OFFSETS = {
  /** dirty 타일 수 — scatter_stable·raster_tile·composite_dirty. */
  dirty: 0,
  /** stroke_dirty 타일 수 — bake_stroke. */
  stroke: 16,
  /** wet_active 타일 수 — wet_step·wet_expand·bake_wet. */
  wet: 32,
} as const;
export const INDIRECT_BYTES = 48;

/** WGSL `struct IndirectArgs` 멤버(순서 = 바이트 순서). */
export const INDIRECT_MEMBERS = [
  ["dirty", "vec3<u32>", "dirty"],
  ["dirty_pad", "u32", "dirtyPad"],
  ["stroke", "vec3<u32>", "stroke"],
  ["stroke_pad", "u32", "strokePad"],
  ["wet", "vec3<u32>", "wet"],
  ["wet_pad", "u32", "wetPad"],
] as const;

/** 간접 인자(`indirect_args`)를 **쓰는** compute 진입점. 이 진입점만 `indirect_args`를 본문에서 쓴다. */
export const INDIRECT_WRITER_ENTRIES = ["writeIndirect", "wetCommit"] as const satisfies readonly EntryPointName[];

/** 임파스토 dab 패스 진입점(`impasto_dab` 동적 uniform을 쓴다). */
export const IMPASTO_ENTRIES = ["impastoMove", "impastoApply"] as const satisfies readonly EntryPointName[];

/** group 2가 레이아웃에 들어가는 compute 진입점(= 인자 쓰기 + 임파스토). 나머지는 [group0, group1]만 쓴다. */
export const GROUP2_ENTRIES = [...INDIRECT_WRITER_ENTRIES, ...IMPASTO_ENTRIES] as const satisfies readonly EntryPointName[];

/**
 * 임파스토 dab 레코드(동적 uniform). 같은 dispatch 묶음 안에서 dab마다 값이 달라야 하는데 `queue.writeBuffer`는 제출 앞에서
 * 한꺼번에 실행되므로, 레코드를 256 B 간격(`minUniformBufferOffsetAlignment`)으로 모두 올리고 dispatch마다 동적 오프셋으로 고른다.
 * 멤버 순서 = 바이트 순서(전부 4 B 스칼라, 52 B). `layout.test.ts`가 WGSL struct와 대조한다.
 */
export const IMPASTO_DAB_MEMBERS = [
  ["dab_index", "u32"],
  /** 창(window) = dab 영향 범위를 캔버스로 자른 픽셀 사각형(inclusive). */
  ["win_x0", "i32"],
  ["win_y0", "i32"],
  ["win_x1", "i32"],
  ["win_y1", "i32"],
  /** 밀기 영역(region) = 창 + 진행 축 양쪽 1 px(캔버스로 자름). */
  ["reg_x0", "i32"],
  ["reg_y0", "i32"],
  ["reg_x1", "i32"],
  ["reg_y1", "i32"],
  /** 진행 방향 한 칸(축 하나만 ±1). */
  ["step_x", "i32"],
  ["step_y", "i32"],
  /** IMPASTO_PUSH·(1 − viscosity). */
  ["push", "f32"],
  /** 0이면 밀기 생략(push ≤ 0). */
  ["do_push", "u32"],
] as const satisfies readonly (readonly [string, ParamScalarType | "i32"])[];
export const IMPASTO_RECORD_BYTES = 256;
/** 프레임(청크) 하나가 담을 수 있는 임파스토 dab 수. 초과는 StrokeBudgetExceededError(fail-visible). */
export const MAX_IMPASTO_DABS_PER_FRAME = 4096;
export const IMPASTO_RECORDS_BYTES = IMPASTO_RECORD_BYTES * MAX_IMPASTO_DABS_PER_FRAME;
export const IMPASTO_WORKGROUP = 256;

/** TileTable u32 배열 수. */
export const TABLE_ARRAYS = 7;
/** TileTable 전체 크기(바이트). */
export const TABLE_BYTES = TABLE_OFFSETS.header + MAX_TILES * 4 * TABLE_ARRAYS;

/** Bins 버퍼: counts(MAX_TILES) + offsets(MAX_TILES) + block_sums(MAX_SCAN_BLOCKS). */
export const BINS_OFFSETS = {
  counts: 0,
  offsets: MAX_TILES * 4,
  blockSums: MAX_TILES * 4 * 2,
  /** smudge 운반 색 상태: [0] = 운반 색 rgba, [1].x = loaded(0/1). 획마다 호스트가 0으로 리셋한다. */
  smudgeState: MAX_TILES * 4 * 2 + MAX_SCAN_BLOCKS * 4,
  /** dab별 smudge 운반 색(premultiplied rgba, smudge_carry가 기록하고 raster_tile이 읽는다). */
  picks: MAX_TILES * 4 * 2 + MAX_SCAN_BLOCKS * 4 + 32,
} as const;
/** Bins = counts + offsets + block_sums + smudge_state(2 × vec4) + picks(MAX_DABS_PER_BATCH × vec4). 모든 오프셋은 16 B 정렬이다. */
export const BINS_BYTES = BINS_OFFSETS.picks + MAX_DABS_PER_BATCH * 16;
export const SMUDGE_STATE_BYTES = 32;

export const REFS_BYTES = MAX_REFS * 4;
export const DABS_BYTES = MAX_DABS_PER_BATCH * 64;

export function strokePoolBytes(tiles: number): number {
  return tiles * STROKE_FLOATS_PER_TILE * 4;
}

/** 습식 풀은 Jacobi 핑퐁을 위해 2벌(parity 0/1)을 둔다. */
export function wetPoolBytes(tiles: number): number {
  return tiles * WET_FLOATS_PER_TILE * 4 * 2;
}

export function documentBytes(width: number, height: number): number {
  return width * height * 16;
}

/** copyTextureToBuffer의 bytesPerRow 256 정렬. */
export function alignedBytesPerRow(width: number, bytesPerPixel = 4): number {
  return Math.ceil((width * bytesPerPixel) / 256) * 256;
}

/** 팁 아틀라스 레벨 L의 크기(px). */
export function tipAtlasLevelSize(level: number): { width: number; height: number; tile: number } {
  const tile = Math.max(1, TIP_ATLAS_TILE >> level);
  return { width: tile * TIP_ATLAS_KINDS, height: tile, tile };
}

export type ParamScalarType = "u32" | "f32";

/**
 * Params 유니폼 필드(순서 = 바이트 순서). 스칼라 뒤에 `edge_curve: array<vec4<f32>, 16>`(64샘플)가 온다.
 * WGSL struct는 `common.wgsl.ts`가 이 표에서 생성한다.
 */
export const PARAMS_SCALARS = [
  ["dab_count", "u32"],
  ["tiles_x", "u32"],
  ["tiles_y", "u32"],
  ["tile_count", "u32"],
  ["width", "u32"],
  ["height", "u32"],
  ["stroke_capacity", "u32"],
  ["wet_capacity", "u32"],
  ["blend_mode", "u32"],
  ["seed", "u32"],
  ["frame_index", "u32"],
  ["paper_enabled", "u32"],
  ["tip_atlas_tile", "u32"],
  ["tip_levels", "u32"],
  ["wet_enabled", "u32"],
  ["km_mixing", "u32"],
  ["filter_mode", "u32"],
  ["impasto_enabled", "u32"],
  ["edge_curve_len", "u32"],
  ["edge_curve_enabled", "u32"],
  /** 표면에 임파스토 높이가 한 번이라도 쌓였는가(CPU Surface.hasHeight 미러) — 표시 시점 릴리프 조명 게이트. */
  ["has_height", "u32"],
  ["stroke_opacity", "f32"],
  ["paper_scale", "f32"],
  ["paper_rotation", "f32"],
  ["paper_size", "f32"],
  ["substep_dt_ms", "f32"],
  ["wet_diffusion", "f32"],
  ["wet_evaporation", "f32"],
  ["wet_capillary", "f32"],
  ["wet_edge_darkening", "f32"],
  ["wet_granulation", "f32"],
  ["wet_absorptivity", "f32"],
  ["wet_drying_ms", "f32"],
  /** 임파스토 높이 완화·밀기 감쇠(`wet.viscosity`). 습식이 꺼져 있으면 0. */
  ["wet_viscosity", "f32"],
  /** smudge 운반 색의 dab당 픽업 비율(`smudgePickupPerDab(spacing)`). smudge가 아니면 0. */
  ["smudge_pickup", "f32"],
  ["light_x", "f32"],
  ["light_y", "f32"],
  ["light_z", "f32"],
  ["impasto_gain", "f32"],
] as const satisfies readonly (readonly [string, ParamScalarType])[];

export type ParamScalarName = (typeof PARAMS_SCALARS)[number][0];

/** edge_curve LUT 샘플 수(= 16 × vec4). 이 길이까지의 곡선은 `evalCurve`와 동일하게 평가된다. */
export const PARAMS_EDGE_CURVE_SAMPLES = 64;
/** 스칼라 영역 바이트(16 정렬). */
export const PARAMS_SCALAR_BYTES = Math.ceil((PARAMS_SCALARS.length * 4) / 16) * 16;
export const PARAMS_EDGE_CURVE_OFFSET = PARAMS_SCALAR_BYTES;
/** Params 유니폼 크기(바이트, 16의 배수). */
export const PARAMS_BYTES = PARAMS_SCALAR_BYTES + PARAMS_EDGE_CURVE_SAMPLES * 4;

/** 블렌드 모드 → u32. `raster/composite.ts` BlendMode 순서와 같다. */
export const BLEND_MODE_ID = { normal: 0, multiply: 1, erase: 2, max: 3 } as const;
/** 샘플링 필터 → u32. `texture/sampling.ts` SAMPLING_FILTERS 순서와 같다. */
export const FILTER_MODE_ID = { nearest: 0, bilinear: 1, trilinear: 2, anisotropic: 3 } as const;

export type ParamsValues = Record<ParamScalarName, number> & { edgeCurve: readonly number[] };

/**
 * Params 값을 ArrayBuffer로 인코딩한다(u32는 정수로 절삭, f32는 fround).
 * edge_curve는 곡선을 그대로 복사한다(최대 64점, 초과 시 64점으로 선형 재표본).
 */
export function encodeParams(values: ParamsValues): ArrayBuffer {
  const buffer = new ArrayBuffer(PARAMS_BYTES);
  const view = new DataView(buffer);
  PARAMS_SCALARS.forEach(([name, type], i) => {
    const v = values[name];
    if (type === "u32") view.setUint32(i * 4, Math.max(0, Math.floor(v)) >>> 0, true);
    else view.setFloat32(i * 4, v, true);
  });
  const curve = values.edgeCurve;
  const samples = packEdgeCurve(curve);
  for (let i = 0; i < PARAMS_EDGE_CURVE_SAMPLES; i += 1) {
    view.setFloat32(PARAMS_EDGE_CURVE_OFFSET + i * 4, samples[i] ?? 0, true);
  }
  return buffer;
}

/** 곡선 → LUT 64샘플. 길이 ≤ 64면 그대로(남은 칸 0), 초과면 64점 선형 재표본. */
export function packEdgeCurve(curve: readonly number[]): Float32Array {
  const out = new Float32Array(PARAMS_EDGE_CURVE_SAMPLES);
  if (curve.length <= PARAMS_EDGE_CURVE_SAMPLES) {
    for (let i = 0; i < curve.length; i += 1) out[i] = curve[i] ?? 0;
    return out;
  }
  for (let i = 0; i < PARAMS_EDGE_CURVE_SAMPLES; i += 1) {
    out[i] = sampleCurveLinear(curve, i / (PARAMS_EDGE_CURVE_SAMPLES - 1));
  }
  return out;
}

/** WGSL `edge_curve_len`에 넣을 유효 길이. */
export function edgeCurveLength(curve: readonly number[]): number {
  return Math.min(curve.length, PARAMS_EDGE_CURVE_SAMPLES);
}

/** 항등 곡선 여부(`raster/fine-raster.ts`의 isIdentityCurve 미러). 항등이면 GPU도 LUT를 건너뛴다. */
export function isIdentityEdgeCurve(curve: readonly number[]): boolean {
  if (curve.length === 2) return curve[0] === 0 && curve[1] === 1;
  for (let i = 0; i < curve.length; i += 1) {
    if (Math.abs((curve[i] ?? 0) - i / (curve.length - 1)) > 1e-9) return false;
  }
  return true;
}

/** `core/curve.ts` evalCurve와 같은 규약(상대 import 대신 로컬 미러, 테스트가 대조). */
export function sampleCurveLinear(curve: readonly number[], t: number): number {
  const n = curve.length;
  if (n === 0) return 0;
  if (n === 1) return curve[0] ?? 0;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const scaled = clamped * (n - 1);
  const lower = Math.floor(scaled);
  const upper = Math.min(n - 1, lower + 1);
  const frac = scaled - lower;
  const lo = curve[lower] ?? 0;
  const hi = curve[upper] ?? lo;
  return lo + (hi - lo) * frac;
}

/**
 * 인스턴싱(비교 레인) 유니폼 필드. `samplingHelpersWgsl("inst_params")`가 요구하는 필드를 포함하고
 * 뒤에 `edge_curve: array<vec4<f32>, 16>`가 온다.
 */
export const INST_PARAMS_SCALARS = [
  ["width", "u32"],
  ["height", "u32"],
  ["blend_mode", "u32"],
  ["filter_mode", "u32"],
  ["tip_atlas_tile", "u32"],
  ["tip_levels", "u32"],
  ["paper_enabled", "u32"],
  ["edge_curve_len", "u32"],
  ["edge_curve_enabled", "u32"],
  ["stroke_pass", "u32"],
  ["stroke_opacity", "f32"],
  ["paper_scale", "f32"],
  ["paper_rotation", "f32"],
  ["paper_size", "f32"],
  ["pad_a", "u32"],
  ["pad_b", "u32"],
] as const satisfies readonly (readonly [string, ParamScalarType])[];

export type InstParamScalarName = (typeof INST_PARAMS_SCALARS)[number][0];
export const INST_PARAMS_SCALAR_BYTES = Math.ceil((INST_PARAMS_SCALARS.length * 4) / 16) * 16;
export const INST_PARAMS_BYTES = INST_PARAMS_SCALAR_BYTES + PARAMS_EDGE_CURVE_SAMPLES * 4;

export type InstParamsValues = Record<InstParamScalarName, number> & { edgeCurve: readonly number[] };

/** 인스턴싱 유니폼 인코딩(encodeParams와 같은 규약). */
export function encodeInstParams(values: InstParamsValues): ArrayBuffer {
  const buffer = new ArrayBuffer(INST_PARAMS_BYTES);
  const view = new DataView(buffer);
  INST_PARAMS_SCALARS.forEach(([name, type], i) => {
    const v = values[name];
    if (type === "u32") view.setUint32(i * 4, Math.max(0, Math.floor(v)) >>> 0, true);
    else view.setFloat32(i * 4, v, true);
  });
  const samples = packEdgeCurve(values.edgeCurve);
  for (let i = 0; i < PARAMS_EDGE_CURVE_SAMPLES; i += 1) {
    view.setFloat32(INST_PARAMS_SCALAR_BYTES + i * 4, samples[i] ?? 0, true);
  }
  return buffer;
}

/** 캔버스 크기 → 타일 격자. */
export function tileGrid(width: number, height: number): { tilesX: number; tilesY: number; tileCount: number } {
  const tilesX = Math.ceil(width / GPU_TILE_SIZE);
  const tilesY = Math.ceil(height / GPU_TILE_SIZE);
  return { tilesX, tilesY, tileCount: tilesX * tilesY };
}

/** 워크그룹 수(올림). */
export function workgroupsFor(items: number, groupSize: number): number {
  return Math.max(1, Math.ceil(items / groupSize));
}
