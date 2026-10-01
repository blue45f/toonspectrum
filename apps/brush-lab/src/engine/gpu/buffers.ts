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
  IMPASTO_RECORD_BYTES,
  IMPASTO_RECORDS_BYTES,
  INDIRECT_BYTES,
  INDIRECT_OFFSETS,
  MAX_CANVAS_PX,
  MAX_TILES,
  PAPER_TEXTURE_SIZE,
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
  wetPoolBytes,
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
  bytes: Record<"params" | "dabs" | "bins" | "refs" | "table" | "strokePool" | "wetPool" | "document" | "staging", number>;
  totalBytes: number;
  presentBytesPerRow: number;
}

export interface SumiLayouts {
  group0: GPUBindGroupLayout;
  group1: GPUBindGroupLayout;
  group2: GPUBindGroupLayout;
  /** [group0, group1] — dispatchWorkgroupsIndirect를 쓰는 파이프라인과 나머지 compute 파이프라인 공용. */
  pipeline: GPUPipelineLayout;
  /** [group0, group1, group2] — 간접 인자를 쓰거나 임파스토 dab 레코드를 읽는 파이프라인(`GROUP2_ENTRIES`) 전용. */
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
  /** 임파스토 dab 레코드(256 B 간격, group 2의 동적 uniform). */
  impastoRecords: GPUBuffer;
  strokePool: GPUBuffer;
  wetPool: GPUBuffer;
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
  wetIndirectOffset: number;
  budget: SumiBudget;
  layouts: SumiLayouts;
  bindGroups: { group0: GPUBindGroup; group1: GPUBindGroup; group2: GPUBindGroup };
  destroy(): void;
}

function readLimit(limits: Record<string, number>, name: string, fallback: number): number {
  const v = limits[name];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** 예산 산식(장치 없이도 계산 가능 — 테스트·리포트용). 한도 초과는 던진다. */
export function computeBudget(cfg: SumiBufferConfig): SumiBudget {
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
  const bytes = {
    params: PARAMS_BYTES,
    dabs: DABS_BYTES,
    bins: BINS_BYTES,
    refs: REFS_BYTES,
    table: TABLE_BYTES,
    strokePool: strokePoolBytes(strokeCapacityTiles),
    wetPool: wetBytes,
    document: docBytes,
    // present 행·문서·습식 풀(높이맵 readback)·습식 슬롯 표 중 가장 큰 쪽.
    staging: Math.max(docBytes, presentBytesPerRow * height, wetBytes, MAX_TILES * 4),
  };
  const maxBinding = readLimit(cfg.limits, "maxStorageBufferBindingSize", 134217728);
  const maxBuffer = readLimit(cfg.limits, "maxBufferSize", 268435456);
  for (const [name, size] of Object.entries(bytes)) {
    const cap = name === "staging" ? maxBuffer : Math.min(maxBinding, maxBuffer);
    if (size > cap) {
      throw new StrokeBudgetExceededError(size, cap, { buffer: name, width, height, strokeCapacityTiles, wetCapacityTiles });
    }
  }
  const totalBytes = Object.values(bytes).reduce((a, b) => a + b, 0);
  return {
    tilesX: grid.tilesX,
    tilesY: grid.tilesY,
    tileCount: grid.tileCount,
    strokeCapacityTiles,
    wetCapacityTiles,
    bytes,
    totalBytes,
    presentBytesPerRow,
  };
}

function layoutEntry(name: BindingName): GPUBindGroupLayoutEntry {
  const slot = BINDINGS[name];
  const base = { binding: slot.binding, visibility: SHADER_STAGE.COMPUTE };
  switch (slot.kind) {
    case "uniform":
      return { ...base, buffer: { type: "uniform" } };
    case "uniform-dynamic":
      // 임파스토 dab 레코드: dispatch마다 setBindGroup(2, group, [k·256])로 레코드를 고른다.
      return { ...base, buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: IMPASTO_RECORD_BYTES } };
    case "storage-read":
      return { ...base, buffer: { type: "read-only-storage" } };
    case "storage-rw":
      return { ...base, buffer: { type: "storage" } };
    case "texture-2d":
      // 팁 아틀라스는 r32float를 textureLoad로만 읽는다(필터 불필요, 패리티 정확).
      // 종이는 rgba8unorm을 샘플러로 읽는다.
      return { ...base, texture: { sampleType: name === "tipAtlas" ? "unfilterable-float" : "float", viewDimension: "2d" } };
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
  const impastoRecords = device.createBuffer({
    label: "sumi-impasto-records",
    size: IMPASTO_RECORDS_BYTES,
    usage: S.UNIFORM | S.COPY_DST,
  });
  const strokePool = device.createBuffer({ label: "sumi-stroke-pool", size: budget.bytes.strokePool, usage: S.STORAGE | S.COPY_DST });
  // COPY_SRC: readbackLinear가 임파스토 높이 채널을 읽어 호스트에서 릴리프 조명을 적용한다.
  const wetPool = device.createBuffer({ label: "sumi-wet-pool", size: budget.bytes.wetPool, usage: S.STORAGE | S.COPY_DST | S.COPY_SRC });
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
    format: "rgba8unorm",
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
      { binding: BINDINGS.impastoDab.binding, resource: { buffer: impastoRecords, offset: 0, size: IMPASTO_RECORD_BYTES } },
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
    impastoRecords,
    strokePool,
    wetPool,
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
    budget,
    layouts,
    bindGroups: { group0, group1, group2 },
    destroy(): void {
      for (const b of [params, dabs, bins, refs, table, indirect, impastoRecords, strokePool, wetPool, document, staging, tableStaging]) b.destroy();
      tipAtlas.destroy();
      paperTex.destroy();
      presentTex.destroy();
    },
  };
}
