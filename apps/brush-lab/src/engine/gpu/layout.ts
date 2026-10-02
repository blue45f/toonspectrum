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
/**
 * 수채 물 스텝 커널의 워크그룹 공유 메모리 요구(바이트): 18×18 종이 파생 배열 6종(h·absorb·capBase·κ 4클래스 = 9 072 B) + 이웃 슬롯 맵·
 * 합류 변수. 기본 `maxComputeWorkgroupStorageSize`(16 KiB) 안이다. `wgsl-contract.test.ts`가 WGSL 선언 합과 대조한다.
 */
export const WET_WORKGROUP_STORAGE_BYTES = 16 * 1024;
/** 습식 풀 채널 수(`wet/state.ts` WET_CHANNELS와 동일). */
export const WET_CHANNELS = 12;
/** 습식 풀 타일 1개의 f32 수(12 × 256). */
export const WET_FLOATS_PER_TILE = WET_CHANNELS * GPU_TILE_PIXELS;
/** 확장 풀 채널 수(`wet/state.ts` WET_EXT_CHANNELS와 동일): LBM f0..f8·ρ·모세관 s·아교·경화 카운터·경화 안료·유화 색·젖음 블러. */
export const WET_EXT_CHANNELS = 23;
/** 확장 풀 타일 1개의 f32 수(23 × 256). 슬롯 번호는 코어 풀과 같다. */
export const WET_EXT_FLOATS_PER_TILE = WET_EXT_CHANNELS * GPU_TILE_PIXELS;
/** 스냅샷 채널 수(`wet/padded.ts` PAD_CHANNELS와 동일). 서브스텝마다 활성 타일에서 만든다. */
export const WET_SNAP_CHANNELS = 20;
export const WET_SNAP_FLOATS_PER_TILE = WET_SNAP_CHANNELS * GPU_TILE_PIXELS;
/** f32 종이 원본(`bump`·`absorb`·`direction`을 픽셀 인터리브): 256² × 3 f32. */
export const PAPER_WET_CHANNELS = 3;
export const PAPER_WET_FLOATS = 256 * 256 * PAPER_WET_CHANNELS;
/** 종이 파생 필드의 1셀 헤일로 한 변(`wet/paper-wet.ts` PAD_SIZE). */
export const WET_PAD_SIZE = GPU_TILE_SIZE + 2;
/** 유화 창 스크래치 헤더(f32 수): [0..3] 붓 색 carry(r,g,b)·loaded, [4..7] 이번 dab 색(r,g,b)·사용 여부, [8..11] 합계(mu·sr·sg·sb), [12..15] 침착 합·any·예약. */
export const OIL_SCRATCH_HEADER_FLOATS = 16;
/** 유화 창 셀당 스크래치 f32 수: 창 상태 6 × 2벌(핑퐁) + dab 입력 4(amount·dep·weight·dir). */
export const OIL_SCRATCH_FLOATS_PER_CELL = 16;
/** 유화 dab 1개 창의 셀 수 상한(MAX_TILES_PER_DAB 타일 = 1024² 근방). 이를 넘는 창은 StrokeBudgetExceededError. */
export const OIL_WINDOW_MAX_CELLS = 1_114_112;
/** 유화 창 셀당 바이트(스크래치 용량 산식에 쓴다). */
export const OIL_SCRATCH_BYTES_PER_CELL = OIL_SCRATCH_FLOATS_PER_CELL * 4;
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
/**
 * compute 레인의 종이 텍스처 포맷: **f32**(R 섬유 방향 rad·G 요철·B 흡수율·A 1). 래스터·유화 그레인(`1 − grain·(1 − bump)`)이 CPU `samplePaper`의
 * f32 필드를 그대로 쓰도록 8비트 양자화(요철 오차 ≤ 1/510)와 하드웨어 필터 가중치 양자화를 없앤다. 필터 불가 포맷이므로 셰이더가 `textureLoad` 4탭으로
 * 직접 쌍선형 보간한다(`paper_sample_spec`). 렌더 인스턴싱 레인은 rgba8unorm 그대로다.
 */
export const PAPER_TEXTURE_FORMAT = "rgba32float" as const;
/** 기본 획 풀 용량(타일). */
export const DEFAULT_STROKE_CAPACITY_TILES = 2048;
/**
 * 기본 습식 풀 용량(타일). 타일당 코어 12 KiB + 확장 23 KiB + 스냅샷 20 KiB = 55 KiB라 2048타일은 110 MiB다(720² 이하 캔버스는 전 타일을 덮는다 —
 * CPU `Surface`의 기본도 전 타일). 습식 층은 매체가 바뀌기 전까지 획을 넘어 지속되므로 512타일로는 512² 캔버스의 한 획도 모자랄 수 있었다.
 * 더 큰 캔버스는 `LaneInit.wetCapacityTiles`로 올린다: 레인이 필요한 한도(확장 풀 23채널의 storage 바인딩 크기)를 어댑터 한도 범위에서 장치에 요청하고,
 * 그래도 모자라면 `StrokeBudgetExceededError`로 init이 실패한다.
 */
export const DEFAULT_WET_CAPACITY_TILES = 2048;
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
  group: 0 | 1 | 2 | 3;
  binding: number;
  kind: BindingKind;
}

/**
 * 기본(건식·비닝·래스터) 파이프라인 가족의 바인딩 표. compute 스테이지 storage 버퍼 = 8개(기본 한도 8).
 * 바인드 그룹 레이아웃은 명시적으로 3개 만든다. group 0·1은 이 가족의 모든 compute 파이프라인이 공유하고,
 * group 2(간접 디스패치 인자 `indirect`)는 그 바인딩을 쓰는 파이프라인(`GROUP2_ENTRIES` = write_indirect)의 레이아웃에만 들어간다.
 * 같은 버퍼가 한 dispatch 안에서 INDIRECT 사용과 쓰기 가능 storage 사용을 겸하면 WebGPU가 거부하므로(usage scope 규칙),
 * `dispatchWorkgroupsIndirect`를 쓰는 파이프라인(scatter·raster 등)의 레이아웃에서는 이 버퍼를 뺀다.
 * 습식(수채 물 스텝·유화·표시 합성·평탄화) 파이프라인은 이 표가 아니라 아래 `WET_BINDINGS`·`WET_FAMILIES`의 별도 레이아웃
 * (group 3 신설)을 쓴다 — dabs·bins·refs를 바인딩하지 않아 스토리지 바인딩 8개 한계 안에서 확장 풀·스냅샷·종이를 더 바인딩한다.
 */
export const BINDINGS = {
  params: { group: 0, binding: 0, kind: "uniform" },
  dabs: { group: 0, binding: 1, kind: "storage-read" },
  bins: { group: 0, binding: 2, kind: "storage-rw" },
  refs: { group: 0, binding: 3, kind: "storage-rw" },
  table: { group: 0, binding: 4, kind: "storage-rw" },
  indirect: { group: 2, binding: 0, kind: "storage-rw" },
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
  /** 수채 물 스텝(서브스텝마다): 스냅샷 → 에지 Δ → 3층 물 스텝 → 이웃 활성화 → 활성 목록 확정. */
  wetSnapshot: "wet_snapshot",
  wetEdgeDelta: "wet_edge_delta",
  wetStepWater: "wet_step_water",
  wetExpand: "wet_expand",
  wetCommit: "wet_commit",
  /** 획 정착 루프의 프레임 끝 검사(활성 타일 0이면 `wet_settle_done`을 세운다). */
  wetSettleCheck: "wet_settle_check",
  /** 유화: 서브스텝(스냅샷·레벨링·건조)과 dab 순서 처리(셰이드·합계·밀기·붓 색·침착·되쓰기). */
  oilSnapshot: "oil_snapshot",
  oilLevel: "oil_level",
  oilDry: "oil_dry",
  oilShade: "oil_shade",
  oilReduce: "oil_reduce",
  oilPush: "oil_push",
  oilCarry: "oil_carry",
  oilDeposit: "oil_deposit",
  oilStore: "oil_store",
  /** 표시 합성(문서 → 수채 층 → 유화 층 → 릴리프 조명)과 평탄화(수채 굽기·유화 굽기). */
  compositeDirty: "composite_dirty",
  compositeAll: "composite_all",
  /** 지금까지 할당된 습식 타일(간접)만 다시 합성한다 — 물이 번지는 비 dirty 타일의 라이브 표시용. */
  compositeWet: "composite_wet",
  compositeLinear: "composite_linear",
  bakeWet: "bake_wet",
  flattenOil: "flatten_oil",
  bakeStroke: "bake_stroke",
  smudgeCarry: "smudge_carry",
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
  "bakeStroke",
  "smudgeCarry",
  "wetSnapshot",
  "wetEdgeDelta",
  "wetStepWater",
  "wetExpand",
  "wetCommit",
  "wetSettleCheck",
  "oilSnapshot",
  "oilLevel",
  "oilDry",
  "oilShade",
  "oilReduce",
  "oilPush",
  "oilCarry",
  "oilDeposit",
  "oilStore",
  "compositeDirty",
  "compositeAll",
  "compositeWet",
  "compositeLinear",
  "bakeWet",
  "flattenOil",
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
  "det_sin",
  "det_cos",
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
 * - [32, 52): 습식 영역 — 획이 끝나도 유지된다(습식 풀·슬롯은 문서처럼 지속). 다만 wet_overflow(40)는 풀 상태가 아니라 획 단위 오류 계수라
 *   endStroke가 영수증을 읽은 뒤 따로 0으로 되돌린다. 52..63은 패딩.
 * 헤더 뒤에 u32 배열 8개(MAX_TILES 길이)가 이어진다:
 * dirty_tiles, slots, wet_slots, stroke_dirty_tiles, wet_active_tiles(지금까지 할당된 타일 목록), wet_live(CPU `state.active` 미러:
 * 이번 서브스텝에서 처리하는 활성 타일 표식), wet_live_next(서브스텝이 정한 다음 활성 표식), wet_live_tiles(활성 타일만 모은 목록).
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
  /** 획 정착 루프에서 활성 타일이 0이 된 프레임 이후 1(CPU `settleWet`의 break 미러). 정착 모드의 유화 건조·물 스텝이 이 값이면 건너뛴다. */
  wetSettleDone: 44,
  /** 직전 wet_commit 기준 활성(live) 타일 수(endStroke 정착 루프 조기 종료용). */
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
  wetLiveTiles: 64 + MAX_TILES * 4 * 7,
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
  ["wet_settle_done", "u32", "wetSettleDone"],
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
  ["wet_live_tiles", "array<u32>", "wetLiveTiles"],
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
  /** 지금까지 할당된 습식 타일 수 — bake_wet·flatten_oil·oil_dry(활성 여부와 무관하게 모든 할당 타일). */
  wet: 32,
  /** 활성(live) 타일 수 — wet_snapshot·wet_edge_delta·wet_step_water·wet_expand·oil_snapshot·oil_level(wet_commit이 기록). */
  wetLive: 48,
} as const;
export const INDIRECT_BYTES = 64;

/** WGSL `struct IndirectArgs` 멤버(순서 = 바이트 순서). */
export const INDIRECT_MEMBERS = [
  ["dirty", "vec3<u32>", "dirty"],
  ["dirty_pad", "u32", "dirtyPad"],
  ["stroke", "vec3<u32>", "stroke"],
  ["stroke_pad", "u32", "strokePad"],
  ["wet", "vec3<u32>", "wet"],
  ["wet_pad", "u32", "wetPad"],
  ["wet_live", "vec3<u32>", "wetLive"],
  ["wet_live_pad", "u32", "wetLivePad"],
] as const;

/** 간접 인자(`indirect_args`)를 **쓰는** compute 진입점. 이 진입점만 `indirect_args`를 본문에서 쓴다. */
export const INDIRECT_WRITER_ENTRIES = ["writeIndirect", "wetCommit"] as const satisfies readonly EntryPointName[];

/** 기본 가족에서 group 2(`indirect`)가 레이아웃에 들어가는 compute 진입점. 나머지 기본 진입점은 [group0, group1]만 쓴다. */
export const GROUP2_ENTRIES = ["writeIndirect"] as const satisfies readonly EntryPointName[];

/** 기본 가족(`BINDINGS`·group 0/1/2 레이아웃)에 속하는 compute 진입점. 나머지는 습식 가족(`WET_ENTRY_FAMILY`)이다. */
export const BASE_ENTRIES = [
  "binCount",
  "scanBlocks",
  "scanBlockSums",
  "scanAdd",
  "writeIndirect",
  "scatter",
  "fineRaster",
  "bakeStroke",
  "smudgeCarry",
] as const satisfies readonly EntryPointName[];

/**
 * 습식 파이프라인 바인딩 표(group 3 신설). 이름·group·binding 번호가 기본 `BINDINGS`와 겹치는 것은 같은 값이다.
 * 습식 가족(`WET_FAMILIES`)은 이 중 필요한 이름만 골라 가족 전용 바인드 그룹 레이아웃·파이프라인 레이아웃을 만든다.
 * - group 3: 확장 풀 `wetExt`(23채널)·스냅샷 `wetSnap`(20채널)·f32 종이 `paperWet`·서브스텝 상수 `wetKernel`(uniform)·
 *   유화 창 스크래치 `oilScratch`·선형 표시 출력 `displayLinear`.
 * - group 2: 간접 인자 `indirect`(활성 목록 확정 커널만)·유화 dab 레코드 `oilDab`(동적 uniform).
 */
export const WET_BINDINGS = {
  params: BINDINGS.params,
  dabs: BINDINGS.dabs,
  table: BINDINGS.table,
  strokePool: BINDINGS.strokePool,
  wetPool: BINDINGS.wetPool,
  document: BINDINGS.document,
  tipAtlas: BINDINGS.tipAtlas,
  paperTex: BINDINGS.paperTex,
  linSampler: BINDINGS.linSampler,
  presentTex: BINDINGS.presentTex,
  indirect: BINDINGS.indirect,
  oilDab: { group: 2, binding: 1, kind: "uniform-dynamic" },
  wetExt: { group: 3, binding: 0, kind: "storage-rw" },
  wetSnap: { group: 3, binding: 1, kind: "storage-rw" },
  paperWet: { group: 3, binding: 2, kind: "storage-read" },
  wetKernel: { group: 3, binding: 3, kind: "uniform" },
  oilScratch: { group: 3, binding: 4, kind: "storage-rw" },
  displayLinear: { group: 3, binding: 5, kind: "storage-rw" },
} as const satisfies Record<string, BindingSlot>;

export type WetBindingName = keyof typeof WET_BINDINGS;

/** 습식 WGSL 변수 이름(snake_case). 기본 표와 같은 바인딩은 같은 이름이다. */
export const WET_BINDING_WGSL_NAMES: Record<WetBindingName, string> = {
  params: "params",
  dabs: "dabs",
  table: "table",
  strokePool: "stroke_pool",
  wetPool: "wet_pool",
  document: "document_px",
  tipAtlas: "tip_atlas",
  paperTex: "paper_tex",
  linSampler: "lin_sampler",
  presentTex: "present_tex",
  indirect: "indirect_args",
  oilDab: "oil_dab",
  wetExt: "wet_ext",
  wetSnap: "wet_snap",
  paperWet: "paper_wet",
  wetKernel: "wet_kernel",
  oilScratch: "oil_scratch",
  displayLinear: "display_linear",
};

/**
 * 습식 파이프라인 가족 — 같은 바인딩 집합을 쓰는 진입점 묶음. 가족마다 group 0..3의 바인드 그룹 레이아웃(바인딩이 없는 group은
 * 빈 레이아웃)과 파이프라인 레이아웃 1개를 만든다. compute 스테이지 storage 버퍼는 어느 가족이든 8개 이하여야 한다.
 * 간접 인자 `indirect`는 INDIRECT와 쓰기 storage를 겸할 수 없으므로 그것을 쓰는 가족(`listWriter`)에만 들어간다.
 */
export const WET_FAMILIES = {
  /** 수채 물 스텝(스냅샷·에지 Δ·3층 물 스텝·이웃 활성화): 활성 타일 간접 디스패치. */
  waterStep: ["params", "table", "wetPool", "wetExt", "wetSnap", "paperWet", "wetKernel"],
  /** 활성 목록 확정·정착 검사: 단일 워크그룹 직접 디스패치(간접 인자를 쓴다). */
  listWriter: ["params", "table", "indirect"],
  /** 유화 dab 순서 처리(셰이드·합계·밀기·붓 색·침착·되쓰기): dab당 직접 디스패치. */
  oilWindow: ["params", "dabs", "table", "wetPool", "wetExt", "wetKernel", "oilScratch", "tipAtlas", "paperTex", "linSampler", "oilDab"],
  /** 유화 서브스텝(스냅샷·Bingham 레벨링·건조). */
  oilLevel: ["params", "table", "wetPool", "wetExt", "wetSnap", "wetKernel"],
  /** 표시 합성(문서 → 수채 층 → 유화 층 → 릴리프 조명 → present 텍스처). */
  composite: ["params", "table", "strokePool", "document", "wetPool", "wetExt", "presentTex"],
  /** 표시 합성을 선형 premultiplied f32 버퍼로(readbackLinear). */
  compositeLinear: ["params", "table", "strokePool", "document", "wetPool", "wetExt", "displayLinear"],
  /** 평탄화(수채 굽기·유화 굽기): 모든 할당 타일 간접 디스패치. */
  flatten: ["params", "table", "document", "wetPool", "wetExt"],
} as const satisfies Record<string, readonly WetBindingName[]>;

export type WetFamilyName = keyof typeof WET_FAMILIES;

/** 습식 compute 진입점 → 가족. */
export const WET_ENTRY_FAMILY = {
  wetSnapshot: "waterStep",
  wetEdgeDelta: "waterStep",
  wetStepWater: "waterStep",
  wetExpand: "waterStep",
  wetCommit: "listWriter",
  wetSettleCheck: "listWriter",
  oilSnapshot: "oilLevel",
  oilLevel: "oilLevel",
  oilDry: "oilLevel",
  oilShade: "oilWindow",
  oilReduce: "oilWindow",
  oilPush: "oilWindow",
  oilCarry: "oilWindow",
  oilDeposit: "oilWindow",
  oilStore: "oilWindow",
  compositeDirty: "composite",
  compositeAll: "composite",
  compositeWet: "composite",
  compositeLinear: "compositeLinear",
  bakeWet: "flatten",
  flattenOil: "flatten",
} as const satisfies Partial<Record<EntryPointName, WetFamilyName>>;

export type WetEntryName = keyof typeof WET_ENTRY_FAMILY;

/**
 * 유화 dab 레코드(동적 uniform). 같은 dispatch 묶음 안에서 dab마다 값이 달라야 하는데 `queue.writeBuffer`는 제출 앞에서
 * 한꺼번에 실행되므로, 레코드를 256 B 간격(`minUniformBufferOffsetAlignment`)으로 모두 올리고 dispatch마다 동적 오프셋으로 고른다.
 * dab 1개당 레코드 2개(`src_buf` 0/1)를 쓴다: 밀기 패스 j는 레코드 j % 2(읽기 벌 = j % 2, 쓰기 벌 = 1 − j % 2)를, 나머지 커널은 레코드 0을 쓴다.
 * 멤버 순서 = 바이트 순서(전부 4 B 스칼라). `layout.test.ts`가 WGSL struct와 대조한다.
 */
export const OIL_DAB_MEMBERS = [
  ["dab_index", "u32"],
  /** 창(window) = dab 영향 범위(AABB)를 밀기 여유(passes칸)만큼 넓혀 캔버스로 자른 픽셀 사각형(inclusive). */
  ["win_x0", "i32"],
  ["win_y0", "i32"],
  ["win_x1", "i32"],
  ["win_y1", "i32"],
  /** dab 셰이드 범위 = AABB를 캔버스로 자른 사각형(inclusive, 창 안쪽). */
  ["in_x0", "i32"],
  ["in_y0", "i32"],
  ["in_x1", "i32"],
  ["in_y1", "i32"],
  /** 창 셀 수(= 창 너비 × 높이). */
  ["cell_count", "u32"],
  /** 이번 밀기 패스가 읽는 스크래치 벌(0/1). 쓰는 벌은 1 − src_buf. */
  ["src_buf", "u32"],
  /** 밀기 패스가 모두 끝난 뒤 최신 상태가 있는 벌(밀기 없으면 0, 있으면 패스 수 % 2). */
  ["cur_buf", "u32"],
  /** `Math.cos/sin(dab.angle)`(호스트 f64 값을 f32로). */
  ["cos_a", "f32"],
  ["sin_a", "f32"],
] as const satisfies readonly (readonly [string, ParamScalarType | "i32"])[];
export const OIL_RECORD_BYTES = 256;
/** 프레임(청크) 하나가 담을 수 있는 유화 dab 수. 초과는 StrokeBudgetExceededError(fail-visible). */
export const MAX_OIL_DABS_PER_FRAME = 4096;
/** dab당 레코드 수(밀기 핑퐁 읽기 벌 0/1). */
export const OIL_RECORDS_PER_DAB = 2;
export const OIL_RECORDS_BYTES = OIL_RECORD_BYTES * OIL_RECORDS_PER_DAB * MAX_OIL_DABS_PER_FRAME;
export const OIL_WORKGROUP = 256;

/**
 * 수채 물 스텝 서브스텝 상수 + 종이·섬유 + 유화 상수의 uniform 블록(`wet_kernel`). 모두 4 B 스칼라, 순서 = 바이트 순서.
 * 앞 33개는 `wet/step-water.ts` `makeWaterKernel`(`WaterKernel`)의 필드(같은 순서)이고 호스트가 같은 함수로 계산해 올린다
 * (`cure_limit`은 정수값을 f32로). 이어서 종이 샘플링·섬유 차단 상수, 유화 상수가 온다.
 * `layout.test.ts`가 `WaterKernel` 키 순서와 대조한다.
 */
export const WET_KERNEL_MEMBERS = [
  ["surf_tension", "f32"],
  ["alpha", "f32"],
  ["beta", "f32"],
  ["cap_scale", "f32"],
  ["dc", "f32"],
  ["theta_c", "f32"],
  ["kc", "f32"],
  ["es", "f32"],
  ["ef", "f32"],
  ["ec", "f32"],
  ["dry_tail", "f32"],
  ["edge_boost", "f32"],
  ["eta_edge", "f32"],
  ["kh_flow", "f32"],
  ["g_ax", "f32"],
  ["g_ay", "f32"],
  ["dp", "f32"],
  ["inv_gref", "f32"],
  ["grain_drift", "f32"],
  ["edge_drift", "f32"],
  ["lambda_k", "f32"],
  ["rho_k", "f32"],
  ["omega_k", "f32"],
  ["pin", "f32"],
  ["gran", "f32"],
  ["glue_gain", "f32"],
  ["dry_brush", "f32"],
  ["rewet", "f32"],
  ["cure_limit", "f32"],
  ["s_wake", "f32"],
  ["hf", "f32"],
  ["omega_lbm", "f32"],
  ["tau", "f32"],
  /** `fiberLinkBlocking(fiberBlocking, fiberAnisotropy)`의 섬유 방향·가로 방향 κ. */
  ["fiber_par", "f32"],
  ["fiber_perp", "f32"],
  /** 종이 없음 κ 기준 k0 = `fiberBlocking`. */
  ["fiber_k0", "f32"],
  ["fiber_rough", "f32"],
  /** 섬유 줄무늬 노이즈 시드(`DEFAULT_PAPER_SPEC.seed`). */
  ["fiber_seed", "u32"],
  /** 종이 샘플(`samplePaper`) 스펙: scale·cos/sin(rotation)(호스트 Math.cos/sin)·rotation·nearest 여부. */
  ["paper_scale_w", "f32"],
  ["paper_cos", "f32"],
  ["paper_sin", "f32"],
  ["paper_rot", "f32"],
  ["paper_nearest", "u32"],
  /** 유화: 밀기 비율 oilDepth·(1 − viscosity), 패스 수, 혼색 깊이, 붓 픽업. */
  ["oil_push", "f32"],
  ["oil_passes", "u32"],
  ["oil_mixing", "f32"],
  ["oil_pickup", "f32"],
  /** 유화 레벨링 유량 계수 rate = OIL_LEVEL_RATE·(1 − viscosity)·(hMs/(1000/60))·Bingham 항복 높이·건조 감쇠 계수. */
  ["oil_rate", "f32"],
  ["oil_yield_h", "f32"],
  ["oil_decay", "f32"],
] as const satisfies readonly (readonly [string, ParamScalarType])[];

export type WetKernelMemberName = (typeof WET_KERNEL_MEMBERS)[number][0];
/** `wet_kernel` uniform 크기(16 B 정렬). */
export const WET_KERNEL_BYTES = Math.ceil((WET_KERNEL_MEMBERS.length * 4) / 16) * 16;
export type WetKernelValues = Record<WetKernelMemberName, number>;

/** `wet_kernel` 값을 ArrayBuffer로 인코딩한다(u32는 정수, f32는 fround). */
export function encodeWetKernel(values: WetKernelValues): ArrayBuffer {
  const buffer = new ArrayBuffer(WET_KERNEL_BYTES);
  const view = new DataView(buffer);
  WET_KERNEL_MEMBERS.forEach(([name, type], i) => {
    const v = values[name];
    if (type === "u32") view.setUint32(i * 4, Math.max(0, Math.floor(v)) >>> 0, true);
    else view.setFloat32(i * 4, v, true);
  });
  return buffer;
}

/** TileTable u32 배열 수. */
export const TABLE_ARRAYS = 8;
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

/**
 * 습식 코어 풀(12채널). 이웃 읽기는 서브스텝 시작 시점의 스냅샷(`wetSnapBytes`)에서 하므로 핑퐁 2벌이 필요 없다(1벌).
 * 슬롯 번호는 확장 풀과 같다.
 */
export function wetPoolBytes(tiles: number): number {
  return tiles * WET_FLOATS_PER_TILE * 4;
}

/** 확장 풀(23채널, 슬롯 번호는 코어 풀과 같다). */
export function wetExtBytes(tiles: number): number {
  return tiles * WET_EXT_FLOATS_PER_TILE * 4;
}

/** 스냅샷(20채널): 서브스텝 시작 상태의 읽기 전용 복사본. */
export function wetSnapBytes(tiles: number): number {
  return tiles * WET_SNAP_FLOATS_PER_TILE * 4;
}

/** 유화 창 스크래치 바이트(헤더 + 셀 × 16 f32). */
export function oilScratchBytes(cells: number): number {
  return (OIL_SCRATCH_HEADER_FLOATS + cells * OIL_SCRATCH_FLOATS_PER_CELL) * 4;
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
  /** 문서에 아직 굽지 않은 수채 층(안료)이 있는가(CPU Surface.waterLayer 미러) — 표시 시점 수채 합성 게이트. */
  ["wet_water_layer", "u32"],
  /** 문서에 아직 굽지 않은 유화 층이 있는가(CPU Surface.oilLayer 미러) — 표시 시점 유화 합성 게이트. */
  ["wet_oil_layer", "u32"],
  /** 마지막 습식 획의 KM 혼색 여부(`wet.render.km` 미러). 표시 합성이 바탕과 KM 혼색을 할지 정한다. */
  ["wet_render_km", "u32"],
  /** 1이면 획 정착 루프다(`wet_settle_done`이 서 있으면 유화 건조 등 물 스텝 이후 단계를 건너뛴다). */
  ["wet_settle", "u32"],
  ["stroke_opacity", "f32"],
  ["paper_scale", "f32"],
  ["paper_rotation", "f32"],
  ["paper_size", "f32"],
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
