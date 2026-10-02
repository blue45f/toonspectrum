import { LaneUnavailableError, StrokeBudgetExceededError } from "../core/errors";

import {
  alignedBytesPerRow,
  BINDINGS,
  BINS_BYTES,
  BUFFER_USAGE,
  DABS_BYTES,
  DEFAULT_STROKE_CAPACITY_TILES,
  DEFAULT_WET_CAPACITY_TILES,
  documentBytes,
  INDIRECT_BYTES,
  INDIRECT_OFFSETS,
  MAX_CANVAS_PX,
  MAX_TILES,
  OIL_RECORDS_BYTES,
  OIL_WINDOW_MAX_CELLS,
  oilScratchBytes,
  PAPER_TEXTURE_FORMAT,
  PAPER_TEXTURE_SIZE,
  PAPER_WET_FLOATS,
  PARAMS_BYTES,
  REFS_BYTES,
  SHADER_STAGE,
  SLOT_NONE,
  strokePoolBytes,
  TABLE_BYTES,
  TABLE_OFFSETS,
  TEXTURE_USAGE,
  tileGrid,
  TIP_ATLAS_KINDS,
  TIP_ATLAS_LEVELS,
  TIP_ATLAS_TILE,
  WET_KERNEL_BYTES,
  wetExtBytes,
  wetPoolBytes,
  wetSnapBytes,
} from "./layout";

import type { BindingName } from "./layout";

/**
 * Sumi compute 파이프라인의 GPU 자원과 예산 산식.
 * 모든 버퍼·텍스처는 label을 가지며(fake 장치 기록기와 디버거가 label로 찾는다), 예산 초과는 생성 전에
 * `StrokeBudgetExceededError`로 던진다(무음 축소 없음).
 */

export interface SumiBufferConfig {
  width: number;
  height: number;
  strokeCapacityTiles?: number;
  wetCapacityTiles?: number;
  /** 장치 한도(probe 결과 또는 device.limits). */
  limits: Record<string, number>;
}

export interface SumiBudget {
  tilesX: number;
  tilesY: number;
  tileCount: number;
  strokeCapacityTiles: number;
  wetCapacityTiles: number;
  bytes: Record<
    | "params"
    | "dabs"
    | "bins"
    | "refs"
    | "table"
    | "strokePool"
    | "wetPool"
    | "wetExt"
    | "wetSnap"
    | "paperWet"
    | "wetKernel"
    | "oilRecords"
    | "document"
    | "staging",
    number
  >;
  /** 지연 생성 버퍼(처음 필요할 때 만든다): 유화 dab 창 스크래치, readbackLinear용 선형 표시 버퍼. 한도 초과는 필요한 시점에 던진다. */
  lazyBytes: Record<"oilScratch" | "displayLinear", number>;
  /** 유화 dab 창 스크래치가 담을 수 있는 창 셀 수(= min(캔버스 픽셀 수, OIL_WINDOW_MAX_CELLS)). */
  oilWindowCells: number;
  totalBytes: number;
  presentBytesPerRow: number;
}

export interface SumiLayouts {
  group0: GPUBindGroupLayout;
  group1: GPUBindGroupLayout;
  group2: GPUBindGroupLayout;
  /** [group0, group1] — dispatchWorkgroupsIndirect를 쓰는 파이프라인과 나머지 compute 파이프라인 공용. */
  pipeline: GPUPipelineLayout;
  /** [group0, group1, group2] — 간접 인자를 쓰는 파이프라인(`GROUP2_ENTRIES`) 전용. */
  pipelineWithGroup2: GPUPipelineLayout;
}

export interface SumiBuffers {
  params: GPUBuffer;
  dabs: GPUBuffer;
  bins: GPUBuffer;
  refs: GPUBuffer;
  table: GPUBuffer;
  /** dispatchWorkgroupsIndirect 인자(group 2). write_indirect·wet_commit만 쓰기로 바인딩한다. */
  indirect: GPUBuffer;
  /** 유화 dab 레코드(256 B 간격 × dab당 2개, 습식 가족 `oilWindow`의 group 2 동적 uniform). */
  oilRecords: GPUBuffer;
  strokePool: GPUBuffer;
  /** 습식 코어 풀(12채널, 1벌). */
  wetPool: GPUBuffer;
  /** 습식 확장 풀(23채널, 코어 풀과 같은 슬롯 번호). */
  wetExt: GPUBuffer;
  /** 습식 스냅샷(20채널): 서브스텝 시작 상태의 읽기 전용 복사본. */
  wetSnap: GPUBuffer;
  /** f32 종이 원본(bump·absorb·direction 인터리브). */
  paperWet: GPUBuffer;
  /** 서브스텝 상수 uniform(`wet_kernel`). */
  wetKernel: GPUBuffer;
  /** 지연 생성 버퍼가 아직 없을 때 group 3 자리를 채우는 최소 버퍼. */
  wetPlaceholder: GPUBuffer;
  document: GPUBuffer;
  tipAtlas: GPUTexture;
  paperTex: GPUTexture;
  sampler: GPUSampler;
  presentTex: GPUTexture;
  /** present/document readback용(가장 큰 쪽 크기). */
  staging: GPUBuffer;
  /** TileTable 헤더 readback용(작은 버퍼, endStroke 1회). */
  tableStaging: GPUBuffer;
  /** dispatchWorkgroupsIndirect 오프셋(`indirect` 버퍼 안 vec3<u32>). */
  indirectOffset: number;
  strokeIndirectOffset: number;
  /** 지금까지 할당된 습식 타일 수(bake·평탄화·유화 건조). */
  wetIndirectOffset: number;
  /** 활성(live) 습식 타일 수(스냅샷·에지 Δ·물 스텝·이웃 활성화·유화 레벨링). */
  wetLiveIndirectOffset: number;
  budget: SumiBudget;
  layouts: SumiLayouts;
  bindGroups: { group0: GPUBindGroup; group1: GPUBindGroup; group2: GPUBindGroup };
  destroy(): void;
}

function readLimit(limits: Record<string, number>, name: string, fallback: number): number {
  const v = limits[name];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** 한도 검사 없이 크기만 계산한 예산(`computeBudget`·`requiredBufferLimits` 공용). */
type BudgetSizes = Omit<SumiBudget, "totalBytes">;

function budgetSizes(cfg: Omit<SumiBufferConfig, "limits">): BudgetSizes {
  const { width, height } = cfg;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(`canvas size must be positive integers, got ${width}×${height}`);
  }
  if (width > MAX_CANVAS_PX || height > MAX_CANVAS_PX) {
    throw new LaneUnavailableError("limit-exceeded", `캔버스 ${width}×${height}는 상한 ${MAX_CANVAS_PX}²를 넘는다`, {
      width,
      height,
      maxCanvasPx: MAX_CANVAS_PX,
    });
  }
  const grid = tileGrid(width, height);
  const strokeCapacityTiles = Math.min(grid.tileCount, cfg.strokeCapacityTiles ?? DEFAULT_STROKE_CAPACITY_TILES);
  const wetCapacityTiles = Math.min(grid.tileCount, cfg.wetCapacityTiles ?? DEFAULT_WET_CAPACITY_TILES);
  if (strokeCapacityTiles <= 0 || wetCapacityTiles <= 0) {
    throw new RangeError("pool capacities must be positive");
  }
  const presentBytesPerRow = alignedBytesPerRow(width);
  const docBytes = documentBytes(width, height);
  const wetBytes = wetPoolBytes(wetCapacityTiles);
  const oilWindowCells = Math.min(width * height, OIL_WINDOW_MAX_CELLS);
  const bytes = {
    params: PARAMS_BYTES,
    dabs: DABS_BYTES,
    bins: BINS_BYTES,
    refs: REFS_BYTES,
    table: TABLE_BYTES,
    strokePool: strokePoolBytes(strokeCapacityTiles),
    wetPool: wetBytes,
    wetExt: wetExtBytes(wetCapacityTiles),
    wetSnap: wetSnapBytes(wetCapacityTiles),
    paperWet: PAPER_WET_FLOATS * 4,
    wetKernel: WET_KERNEL_BYTES,
    oilRecords: OIL_RECORDS_BYTES,
    document: docBytes,
    // present 행·문서·습식 풀(높이맵·상태 readback)·확장 풀·습식 슬롯 표 중 가장 큰 쪽.
    staging: Math.max(docBytes, presentBytesPerRow * height, wetBytes, wetExtBytes(wetCapacityTiles), MAX_TILES * 4),
  };
  const lazyBytes = { oilScratch: oilScratchBytes(oilWindowCells), displayLinear: docBytes };
  return {
    tilesX: grid.tilesX,
    tilesY: grid.tilesY,
    tileCount: grid.tileCount,
    strokeCapacityTiles,
    wetCapacityTiles,
    bytes,
    lazyBytes,
    oilWindowCells,
    presentBytesPerRow,
  };
}

/**
 * 이 구성이 장치에 요구하는 버퍼 한도(storage 바인딩 1개의 최대 크기·버퍼 1개의 최대 크기). 지연 생성 버퍼도 포함한다.
 * 레인이 장치를 요청할 때 `requiredLimits`로 올려 요청한다(어댑터 한도로 clamp는 `requestSumiDevice`가 한다). 한도는 검사하지 않는다.
 */
export function requiredBufferLimits(cfg: Omit<SumiBufferConfig, "limits">): { maxStorageBufferBindingSize: number; maxBufferSize: number } {
  const sizes = budgetSizes(cfg);
  const { staging, ...bound } = sizes.bytes;
  const binding = Math.max(...Object.values(bound), ...Object.values(sizes.lazyBytes));
  return { maxStorageBufferBindingSize: binding, maxBufferSize: Math.max(binding, staging) };
}

/** 예산 산식(장치 없이도 계산 가능 — 테스트·리포트용). 한도 초과는 던진다. `cfg.limits`는 **실제 장치 한도**여야 한다. */
export function computeBudget(cfg: SumiBufferConfig): SumiBudget {
  const sizes = budgetSizes(cfg);
  const { bytes, strokeCapacityTiles, wetCapacityTiles } = sizes;
  const maxBinding = readLimit(cfg.limits, "maxStorageBufferBindingSize", 134217728);
  const maxBuffer = readLimit(cfg.limits, "maxBufferSize", 268435456);
  for (const [name, size] of Object.entries(bytes)) {
    const cap = name === "staging" ? maxBuffer : Math.min(maxBinding, maxBuffer);
    if (size > cap) {
      throw new StrokeBudgetExceededError(size, cap, { buffer: name, width: cfg.width, height: cfg.height, strokeCapacityTiles, wetCapacityTiles });
    }
  }
  const totalBytes = Object.values(bytes).reduce((a, b) => a + b, 0);
  return { ...sizes, totalBytes };
}

/**
 * 지연 생성 버퍼(유화 스크래치·선형 표시 버퍼)가 장치 한도 안인지 확인한다. 초과는 `StrokeBudgetExceededError`로 던진다(무음 축소 없음).
 * 생성 시점이 아니라 필요한 시점(첫 유화 획·첫 `readbackLinear`)에 부른다 — 쓰지 않는 세션이 그 때문에 실패하지 않게 한다.
 */
export function assertLazyBufferFits(budget: SumiBudget, name: "oilScratch" | "displayLinear", limits: Record<string, number>): void {
  const maxBinding = readLimit(limits, "maxStorageBufferBindingSize", 134217728);
  const maxBuffer = readLimit(limits, "maxBufferSize", 268435456);
  const size = budget.lazyBytes[name];
  const cap = Math.min(maxBinding, maxBuffer);
  if (size > cap) {
    throw new StrokeBudgetExceededError(size, cap, {
      buffer: name,
      note: name === "oilScratch" ? "유화 dab 창 스크래치가 장치 storage 바인딩 한도를 넘는다" : "선형 표시 버퍼가 장치 storage 바인딩 한도를 넘는다",
      oilWindowCells: budget.oilWindowCells,
    });
  }
}

function layoutEntry(name: BindingName): GPUBindGroupLayoutEntry {
  const slot = BINDINGS[name];
  const base = { binding: slot.binding, visibility: SHADER_STAGE.COMPUTE };
  switch (slot.kind) {
    case "uniform":
      return { ...base, buffer: { type: "uniform" } };
    case "storage-read":
      return { ...base, buffer: { type: "read-only-storage" } };
    case "storage-rw":
      return { ...base, buffer: { type: "storage" } };
    case "texture-2d":
      // 팁 아틀라스(r32float)와 종이(rgba32float)는 textureLoad로만 읽는다(필터 불필요 — 셰이더가 직접 보간해 CPU와 패리티가 정확하다).
      return { ...base, texture: { sampleType: "unfilterable-float", viewDimension: "2d" } };
    case "sampler":
      return { ...base, sampler: { type: "filtering" } };
    case "storage-texture-write-rgba8unorm":
      return { ...base, storageTexture: { access: "write-only", format: "rgba8unorm", viewDimension: "2d" } };
  }
}

/**
 * 명시적 바인드 그룹 레이아웃 3개와 파이프라인 레이아웃 2개.
 * 간접 인자 버퍼·임파스토 레코드(group 2)는 그것을 쓰는 파이프라인 레이아웃에만 넣는다 — 같은 dispatch의 usage scope에서
 * INDIRECT와 쓰기 storage가 겹치면 WebGPU 검증이 command buffer를 무효화한다.
 */
export function createSumiBindGroupLayouts(device: GPUDevice): SumiLayouts {
  const names = Object.keys(BINDINGS) as BindingName[];
  const group0 = device.createBindGroupLayout({
    label: "sumi-bgl-0",
    entries: names.filter((n) => BINDINGS[n].group === 0).map(layoutEntry),
  });
  const group1 = device.createBindGroupLayout({
    label: "sumi-bgl-1",
    entries: names.filter((n) => BINDINGS[n].group === 1).map(layoutEntry),
  });
  const group2 = device.createBindGroupLayout({
    label: "sumi-bgl-2",
    entries: names.filter((n) => BINDINGS[n].group === 2).map(layoutEntry),
  });
  const pipeline = device.createPipelineLayout({ label: "sumi-pipeline-layout", bindGroupLayouts: [group0, group1] });
  const pipelineWithGroup2 = device.createPipelineLayout({
    label: "sumi-pipeline-layout-group2",
    bindGroupLayouts: [group0, group1, group2],
  });
  return { group0, group1, group2, pipeline, pipelineWithGroup2 };
}

/** 초기 TileTable 바이트(슬롯 표 = SLOT_NONE, 나머지 0). */
export function initialTableBytes(): ArrayBuffer {
  const buffer = new ArrayBuffer(TABLE_BYTES);
  const u32 = new Uint32Array(buffer);
  const tiles = (TABLE_OFFSETS.wetSlots - TABLE_OFFSETS.slots) / 4;
  u32.fill(SLOT_NONE, TABLE_OFFSETS.slots / 4, TABLE_OFFSETS.slots / 4 + tiles);
  u32.fill(SLOT_NONE, TABLE_OFFSETS.wetSlots / 4, TABLE_OFFSETS.wetSlots / 4 + tiles);
  return buffer;
}

/** 획 슬롯 표 리셋용 바이트(SLOT_NONE × MAX_TILES). */
export function slotResetBytes(): Uint32Array {
  const tiles = (TABLE_OFFSETS.wetSlots - TABLE_OFFSETS.slots) / 4;
  return new Uint32Array(tiles).fill(SLOT_NONE);
}

/** 자원을 만든다. 예산 초과·캔버스 상한은 생성 전에 던진다. */
export function createSumiBuffers(device: GPUDevice, cfg: SumiBufferConfig): SumiBuffers {
  const budget = computeBudget(cfg);
  const { width, height } = cfg;
  const S = BUFFER_USAGE;
  const params = device.createBuffer({ label: "sumi-params", size: budget.bytes.params, usage: S.UNIFORM | S.COPY_DST });
  const dabs = device.createBuffer({ label: "sumi-dabs", size: budget.bytes.dabs, usage: S.STORAGE | S.COPY_DST });
  const bins = device.createBuffer({ label: "sumi-bins", size: budget.bytes.bins, usage: S.STORAGE | S.COPY_DST });
  const refs = device.createBuffer({ label: "sumi-refs", size: budget.bytes.refs, usage: S.STORAGE | S.COPY_DST });
  const table = device.createBuffer({
    label: "sumi-table",
    size: budget.bytes.table,
    usage: S.STORAGE | S.COPY_DST | S.COPY_SRC,
  });
  const indirect = device.createBuffer({
    label: "sumi-indirect",
    size: INDIRECT_BYTES,
    usage: S.STORAGE | S.INDIRECT | S.COPY_SRC,
  });
  const oilRecords = device.createBuffer({
    label: "sumi-oil-records",
    size: budget.bytes.oilRecords,
    usage: S.UNIFORM | S.COPY_DST,
  });
  const strokePool = device.createBuffer({ label: "sumi-stroke-pool", size: budget.bytes.strokePool, usage: S.STORAGE | S.COPY_DST });
  // COPY_SRC: readbackLinear가 임파스토 높이 채널을 읽어 호스트에서 릴리프 조명을 적용한다.
  const wetPool = device.createBuffer({ label: "sumi-wet-pool", size: budget.bytes.wetPool, usage: S.STORAGE | S.COPY_DST | S.COPY_SRC });
  // 확장 풀·스냅샷은 습식 가족(group 3)이 쓴다. COPY_SRC: 프로브·테스트가 상태를 읽어 CPU 참조와 대조한다.
  const wetExt = device.createBuffer({ label: "sumi-wet-ext", size: budget.bytes.wetExt, usage: S.STORAGE | S.COPY_DST | S.COPY_SRC });
  const wetSnap = device.createBuffer({ label: "sumi-wet-snap", size: budget.bytes.wetSnap, usage: S.STORAGE | S.COPY_DST | S.COPY_SRC });
  const paperWet = device.createBuffer({ label: "sumi-paper-wet", size: budget.bytes.paperWet, usage: S.STORAGE | S.COPY_DST });
  const wetKernel = device.createBuffer({ label: "sumi-wet-kernel", size: budget.bytes.wetKernel, usage: S.UNIFORM | S.COPY_DST });
  const wetPlaceholder = device.createBuffer({ label: "sumi-wet-placeholder", size: 16, usage: S.STORAGE | S.COPY_DST });
  const document = device.createBuffer({
    label: "sumi-document",
    size: budget.bytes.document,
    usage: S.STORAGE | S.COPY_SRC | S.COPY_DST,
  });
  const tipAtlas = device.createTexture({
    label: "sumi-tip-atlas",
    size: { width: TIP_ATLAS_TILE * TIP_ATLAS_KINDS, height: TIP_ATLAS_TILE },
    format: "r32float",
    mipLevelCount: TIP_ATLAS_LEVELS,
    usage: TEXTURE_USAGE.TEXTURE_BINDING | TEXTURE_USAGE.COPY_DST,
  });
  const paperTex = device.createTexture({
    label: "sumi-paper",
    size: { width: PAPER_TEXTURE_SIZE, height: PAPER_TEXTURE_SIZE },
    format: PAPER_TEXTURE_FORMAT,
    usage: TEXTURE_USAGE.TEXTURE_BINDING | TEXTURE_USAGE.COPY_DST,
  });
  const sampler = device.createSampler({
    label: "sumi-linear-repeat",
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "nearest",
    addressModeU: "repeat",
    addressModeV: "repeat",
  });
  const presentTex = device.createTexture({
    label: "sumi-present",
    size: { width, height },
    format: "rgba8unorm",
    usage: TEXTURE_USAGE.STORAGE_BINDING | TEXTURE_USAGE.TEXTURE_BINDING | TEXTURE_USAGE.COPY_SRC,
  });
  const staging = device.createBuffer({ label: "sumi-staging", size: budget.bytes.staging, usage: S.MAP_READ | S.COPY_DST });
  const tableStaging = device.createBuffer({ label: "sumi-table-staging", size: TABLE_OFFSETS.header, usage: S.MAP_READ | S.COPY_DST });

  const layouts = createSumiBindGroupLayouts(device);
  const group0 = device.createBindGroup({
    label: "sumi-bg-0",
    layout: layouts.group0,
    entries: [
      { binding: BINDINGS.params.binding, resource: { buffer: params } },
      { binding: BINDINGS.dabs.binding, resource: { buffer: dabs } },
      { binding: BINDINGS.bins.binding, resource: { buffer: bins } },
      { binding: BINDINGS.refs.binding, resource: { buffer: refs } },
      { binding: BINDINGS.table.binding, resource: { buffer: table } },
    ],
  });
  const group1 = device.createBindGroup({
    label: "sumi-bg-1",
    layout: layouts.group1,
    entries: [
      { binding: BINDINGS.strokePool.binding, resource: { buffer: strokePool } },
      { binding: BINDINGS.wetPool.binding, resource: { buffer: wetPool } },
      { binding: BINDINGS.document.binding, resource: { buffer: document } },
      { binding: BINDINGS.tipAtlas.binding, resource: tipAtlas.createView({ label: "sumi-tip-atlas-view" }) },
      { binding: BINDINGS.paperTex.binding, resource: paperTex.createView({ label: "sumi-paper-view" }) },
      { binding: BINDINGS.linSampler.binding, resource: sampler },
      { binding: BINDINGS.presentTex.binding, resource: presentTex.createView({ label: "sumi-present-view" }) },
    ],
  });

  const group2 = device.createBindGroup({
    label: "sumi-bg-2",
    layout: layouts.group2,
    entries: [
      { binding: BINDINGS.indirect.binding, resource: { buffer: indirect } },
    ],
  });

  // 초기 상태: 슬롯 표 SLOT_NONE, 나머지 0. 풀·문서는 createBuffer가 0으로 만든다.
  device.queue.writeBuffer(table, 0, initialTableBytes());

  return {
    params,
    dabs,
    bins,
    refs,
    table,
    indirect,
    oilRecords,
    strokePool,
    wetPool,
    wetExt,
    wetSnap,
    paperWet,
    wetKernel,
    wetPlaceholder,
    document,
    tipAtlas,
    paperTex,
    sampler,
    presentTex,
    staging,
    tableStaging,
    indirectOffset: INDIRECT_OFFSETS.dirty,
    strokeIndirectOffset: INDIRECT_OFFSETS.stroke,
    wetIndirectOffset: INDIRECT_OFFSETS.wet,
    wetLiveIndirectOffset: INDIRECT_OFFSETS.wetLive,
    budget,
    layouts,
    bindGroups: { group0, group1, group2 },
    destroy(): void {
      for (const b of [
        params,
        dabs,
        bins,
        refs,
        table,
        indirect,
        oilRecords,
        strokePool,
        wetPool,
        wetExt,
        wetSnap,
        paperWet,
        wetKernel,
        wetPlaceholder,
        document,
        staging,
        tableStaging,
      ]) {
        b.destroy();
      }
      tipAtlas.destroy();
      paperTex.destroy();
      presentTex.destroy();
    },
  };
}
