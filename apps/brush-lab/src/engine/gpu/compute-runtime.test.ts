import { describe, expect, it } from "vitest";

import { DabBatch } from "../core/dab-layout";
import { InvalidStateError, LaneUnavailableError, StrokeBudgetExceededError, WgslCompileError } from "../core/errors";
import { presetById } from "../presets/catalog";
import { normalizeProgram } from "../presets/program-schema";
import { smudgePickupPerDab } from "../raster/fine-raster";
import { WET_DRY_STEPS_MAX, WET_OIL_SETTLE_FRAMES } from "../raster/reference-renderer";
import { binDabs } from "../raster/tile-binning";
import { DEFAULT_PAPER_SPEC } from "../texture/paper-grain";
import { loadEmbeddedKernel } from "../wasm/embedded";
import { SumiKernelSession } from "../wasm/kernel-session";
import { makeWaterKernel } from "../wet/step-water";

import { computeBudget, initialTableBytes, requiredBufferLimits } from "./buffers";
import {
  BASE_ENTRIES,
  BINS_OFFSETS,
  COMPUTE_ENTRY_ORDER,
  ENTRY_POINTS,
  GROUP2_ENTRIES,
  INDIRECT_OFFSETS,
  INDIRECT_WRITER_ENTRIES,
  MAX_DABS_PER_BATCH,
  MAX_TILES_PER_DAB,
  OIL_DAB_MEMBERS,
  OIL_RECORD_BYTES,
  OIL_SCRATCH_HEADER_FLOATS,
  PARAMS_SCALARS,
  SMUDGE_STATE_BYTES,
  SLOT_NONE,
  TABLE_OFFSETS,
  TIP_ATLAS_LEVELS,
  WET_ENTRY_FAMILY,
  WET_EXT_FLOATS_PER_TILE,
  WET_FAMILIES,
  WET_FLOATS_PER_TILE,
  WET_KERNEL_BYTES,
  WET_KERNEL_MEMBERS,
  oilScratchBytes,
} from "./layout";
import {
  buildTipAtlasLevels,
  buildTipChainsForProgram,
  encodePaperTexture,
  encodePaperTextureF32,
  paramsForProgram,
  SumiComputeRuntime,
  WET_DRY_CHUNK_FRAMES,
  wetLayerKindOf,
} from "./pipeline-compute";
import { createMockCanvas, createMockGpu } from "./testing/mock-gpu-device";
import { familyGroupKey } from "./wet-bindings";
import { encodePaperWet, oilPassesOf, oilPushOf, wetKernelValues } from "./wet-kernel";

import type { DabInstance } from "../core/types";
import type { BrushProgram } from "../presets/program-schema";

/**
 * fake 장치 계약 테스트. GPU 연산 결과는 검증하지 않는다(브라우저 프로브 몫) — 바인딩·디스패치·제출·readback 경로와
 * 예산·오류 표면화만 본다.
 */
const dryProgram = (): BrushProgram => normalizeProgram({ id: "t-dry", name: "dry", family: "pencil", description: "" });
const wetProgram = (): BrushProgram =>
  normalizeProgram({ id: "t-wet", name: "wet", family: "watercolor", description: "", deposition: { model: "wet-flow" }, wet: { substeps: 2 } });
const impastoProgram = (): BrushProgram =>
  normalizeProgram({ id: "t-oil", name: "oil", family: "oil", description: "", deposition: { model: "impasto" }, wet: { substeps: 1 } });

function dab(x: number, y: number): DabInstance {
  return {
    x,
    y,
    rx: 4,
    ry: 4,
    angle: 0,
    hardness: 0.8,
    flow: 0.5,
    shapeExp: 2,
    r: 0,
    g: 0,
    b: 0,
    a: 1,
    tipKind: "round",
    seed: 1,
    grain: 0,
    wet: 0,
    pigmentMass: 0.5,
    erase: false,
    smudge: false,
    dualTip: false,
    lockAlpha: false,
    impasto: false,
    deposition: "dry-stamp",
  };
}

function batchOf(n: number): DabBatch {
  const b = new DabBatch(Math.max(1, n));
  for (let i = 0; i < n; i += 1) b.push(dab(10 + (i % 50), 10 + Math.floor(i / 50)));
  return b;
}

async function createRuntime(opts: { features?: string[]; width?: number; height?: number; canvas?: boolean } = {}) {
  const gpu = createMockGpu({ features: opts.features ?? [] });
  const width = opts.width ?? 64;
  const height = opts.height ?? 48;
  const canvas = opts.canvas ? createMockCanvas(gpu, width, height) : null;
  const runtime = await SumiComputeRuntime.create(gpu.device, {
    width,
    height,
    seed: 7,
    features: new Set(opts.features ?? []),
    clock: { now: () => 0 },
    presentCanvas: canvas?.canvas,
    presentFormat: canvas ? "bgra8unorm" : undefined,
  });
  return { gpu, runtime, canvas };
}

/** 습식 프로그램용 dab(수채: wet-flow, 유화: impasto). */
const wetDab = (x: number, y: number): DabInstance => ({ ...dab(x, y), wet: 0.6, deposition: "wet-flow", pigmentMass: 0.4 });
const oilDab = (x: number, y: number, angle = 0): DabInstance => ({ ...dab(x, y), impasto: true, deposition: "impasto", angle, pigmentMass: 0.5 });

function batchFrom(dabs: DabInstance[]): DabBatch {
  const b = new DabBatch(Math.max(1, dabs.length));
  for (const d of dabs) b.push(d);
  return b;
}

const paramIndex = (name: (typeof PARAMS_SCALARS)[number][0]): number => PARAMS_SCALARS.findIndex(([n]) => n === name);

/** Params 유니폼의 u32 필드를 읽는다(마지막으로 writeBuffer된 값). */
function paramU32(gpu: ReturnType<typeof createMockGpu>, name: (typeof PARAMS_SCALARS)[number][0]): number {
  return new DataView(gpu.bufferByLabel("sumi-params").data).getUint32(paramIndex(name) * 4, true);
}

/**
 * 정착 루프가 `wet_settle_done`을 0으로 되돌린 직후 값을 1로 주입한다(GPU가 활성 타일 0을 만들었다는 상황). 모의 장치는 복사를
 * encode 시점에 실행하므로, 헤더 readback이 이 값을 보려면 청크를 encode하기 전에 주입해야 한다.
 */
function forceSettleDone(gpu: ReturnType<typeof createMockGpu>): void {
  const queue = gpu.device.queue as unknown as { writeBuffer: (...args: unknown[]) => void };
  const original = queue.writeBuffer.bind(queue);
  queue.writeBuffer = (...args: unknown[]): void => {
    original(...args);
    const buffer = args[0] as { label?: string };
    if (buffer.label === "sumi-table" && args[1] === TABLE_OFFSETS.wetSettleDone) gpu.setU32("sumi-table", TABLE_OFFSETS.wetSettleDone, 1);
  };
}

describe("SumiComputeRuntime.create", () => {
  it("셰이더 8모듈·compute 파이프라인 30개를 COMPUTE_ENTRY_ORDER 순서로 만들고, 기본 가족은 group 0·1(+indirect 쓰기만 group 2)을, 습식 가족은 가족별 레이아웃을 쓴다", async () => {
    const { gpu, runtime } = await createRuntime();
    expect(gpu.shaderModules.map((m) => m.label)).toEqual([
      "sumi-bin-count",
      "sumi-bin-scan",
      "sumi-bin-scatter",
      "sumi-fine-raster",
      "sumi-bake-stroke",
      "sumi-wet-water",
      "sumi-wet-oil",
      "sumi-wet-composite",
    ]);
    const compute = gpu.pipelines.filter((p) => p.kind === "compute");
    expect(compute.map((p) => p.entryPoint)).toEqual(COMPUTE_ENTRY_ORDER.map((e) => ENTRY_POINTS[e]));
    expect(compute.length).toBe(30);
    expect(compute.every((p) => p.async)).toBe(true);
    // 기본 가족: sumi-bgl-0/1/2. 습식 가족: 가족·group별 레이아웃(같은 바인딩 집합은 공유).
    const baseLabels = gpu.bindGroupLayouts.filter((l) => l.label.startsWith("sumi-bgl-")).map((l) => l.label);
    expect(baseLabels).toEqual(["sumi-bgl-0", "sumi-bgl-1", "sumi-bgl-2"]);
    const wetKeys = new Set<string>();
    for (const family of Object.keys(WET_FAMILIES) as (keyof typeof WET_FAMILIES)[]) for (const g of [0, 1, 2, 3]) wetKeys.add(`sumi-wbgl-${familyGroupKey(family, g)}`);
    expect(gpu.bindGroupLayouts.filter((l) => l.label.startsWith("sumi-wbgl-")).map((l) => l.label).sort()).toEqual([...wetKeys].sort());
    // 간접 인자 버퍼는 INDIRECT와 쓰기 storage를 한 dispatch에서 겸할 수 없으므로 그것을 쓰는 파이프라인의 레이아웃에만 들어간다.
    const group2Entries = new Set<string>(GROUP2_ENTRIES.map((e) => ENTRY_POINTS[e]));
    expect([...group2Entries]).toEqual([ENTRY_POINTS.writeIndirect]);
    const writers = new Set<string>(INDIRECT_WRITER_ENTRIES.map((e) => ENTRY_POINTS[e]));
    const base = new Set<string>(BASE_ENTRIES.map((e) => ENTRY_POINTS[e]));
    for (const p of compute) {
      if (base.has(p.entryPoint)) {
        expect(p.layoutLabel, p.entryPoint).toBe(group2Entries.has(p.entryPoint) ? "sumi-pipeline-layout-group2" : "sumi-pipeline-layout");
      } else {
        const entry = COMPUTE_ENTRY_ORDER.find((e) => ENTRY_POINTS[e] === p.entryPoint);
        const family = WET_ENTRY_FAMILY[entry as keyof typeof WET_ENTRY_FAMILY];
        expect(p.layoutLabel, p.entryPoint).toBe(`sumi-wpl-${family}`);
        // 간접 인자를 쓰는 습식 진입점은 listWriter 가족뿐이다.
        expect(family === "listWriter", p.entryPoint).toBe(writers.has(p.entryPoint) || p.entryPoint === ENTRY_POINTS.wetSettleCheck);
      }
    }
    expect(gpu.bufferByLabel("sumi-indirect").usage & 0x0100).toBe(0x0100);
    expect(gpu.bufferByLabel("sumi-table").usage & 0x0100).toBe(0);
    // 확장 풀·스냅샷·종이·서브스텝 상수·유화 레코드는 만들어지고, 유화 스크래치·선형 표시 버퍼는 지연 생성이다.
    for (const label of ["sumi-wet-ext", "sumi-wet-snap", "sumi-paper-wet", "sumi-wet-kernel", "sumi-oil-records", "sumi-wet-placeholder"]) {
      expect(gpu.bufferByLabel(label).size, label).toBeGreaterThan(0);
    }
    expect(() => gpu.bufferByLabel("sumi-oil-scratch")).toThrow();
    expect(() => gpu.bufferByLabel("sumi-display-linear")).toThrow();
    // 초기 present: composite_all 1회 디스패치 + submit 1회.
    expect(gpu.dispatches.map((d) => d.entryPoint)).toEqual([ENTRY_POINTS.compositeAll]);
    expect(gpu.submits).toBe(1);
    expect(runtime.runtimeState).toBe("ready");
    runtime.dispose();
    expect(runtime.runtimeState).toBe("disposed");
    expect(gpu.calls.filter((c) => c === "buffer.destroy").length).toBeGreaterThanOrEqual(15);
  });

  it("초기 TileTable은 slots·wet_slots가 SLOT_NONE이고 나머지는 0", async () => {
    const bytes = new Uint32Array(initialTableBytes());
    expect(bytes[TABLE_OFFSETS.slots / 4]).toBe(SLOT_NONE);
    expect(bytes[TABLE_OFFSETS.wetSlots / 4 + 5]).toBe(SLOT_NONE);
    expect(bytes[TABLE_OFFSETS.dirtyTiles / 4]).toBe(0);
    expect(bytes[TABLE_OFFSETS.poolCursor / 4]).toBe(0);
    expect(bytes[TABLE_OFFSETS.wetLiveTiles / 4]).toBe(0);
    const { gpu } = await createRuntime();
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.slots)).toBe(SLOT_NONE);
  });

  it("getCompilationInfo 오류 주입 → WgslCompileError, 자원은 해제된다", async () => {
    const gpu = createMockGpu({ compilationMessages: { "sumi-bin-scan": [{ type: "error", message: "bad", lineNum: 3 }] } });
    const err = await SumiComputeRuntime.create(gpu.device, { width: 32, height: 32, seed: 1, features: new Set(), clock: null }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WgslCompileError);
    expect((err as WgslCompileError).shaderId).toBe("sumi-bin-scan");
    expect(gpu.calls.filter((c) => c === "buffer.destroy").length).toBeGreaterThanOrEqual(15);
  });

  it("습식 셰이더의 컴파일 오류도 WgslCompileError로 드러난다(fail-visible)", async () => {
    for (const label of ["sumi-wet-water", "sumi-wet-oil", "sumi-wet-composite"]) {
      const gpu = createMockGpu({ compilationMessages: { [label]: [{ type: "error", message: "bad wet", lineNum: 9 }] } });
      const err = await SumiComputeRuntime.create(gpu.device, { width: 32, height: 32, seed: 1, features: new Set(), clock: null }).catch((e: unknown) => e);
      expect(err, label).toBeInstanceOf(WgslCompileError);
      expect((err as WgslCompileError).shaderId).toBe(label);
    }
  });

  it("presentCanvas가 있으면 present 파이프라인·캔버스 구성을 만들고 초기 렌더 패스를 1회 그린다", async () => {
    const { gpu, canvas } = await createRuntime({ canvas: true });
    expect(gpu.pipelines.some((p) => p.kind === "render" && p.entryPoint === ENTRY_POINTS.presentFs)).toBe(true);
    expect(canvas?.configured[0]).toMatchObject({ format: "bgra8unorm", alphaMode: "premultiplied" });
    expect(gpu.renderPasses).toBe(1);
    expect(gpu.draws).toEqual([{ entryPoint: ENTRY_POINTS.presentFs, vertexCount: 3, instanceCount: 1, pass: 1 }]);
  });

  it("presentCanvas에 presentFormat이 없으면 InvalidStateError", async () => {
    const gpu = createMockGpu();
    const canvas = createMockCanvas(gpu, 8, 8);
    await expect(
      SumiComputeRuntime.create(gpu.device, { width: 8, height: 8, seed: 1, features: new Set(), clock: null, presentCanvas: canvas.canvas }),
    ).rejects.toBeInstanceOf(InvalidStateError);
  });
});

describe("buffers 예산 산식", () => {
  it("2048² 초과는 limit-exceeded, 한도 초과는 StrokeBudgetExceededError", () => {
    expect(() => computeBudget({ width: 4096, height: 16, limits: {} })).toThrow(LaneUnavailableError);
    expect(() => computeBudget({ width: 2048, height: 2048, limits: { maxStorageBufferBindingSize: 16 * 1024 * 1024 } })).toThrow(StrokeBudgetExceededError);
    const ok = computeBudget({ width: 2048, height: 2048, limits: {} });
    expect(ok.bytes.document).toBe(2048 * 2048 * 16);
    expect(ok.strokeCapacityTiles).toBe(2048);
    expect(ok.presentBytesPerRow).toBe(8192);
  });

  it("풀 용량은 타일 수로 clamp된다", () => {
    const b = computeBudget({ width: 64, height: 64, limits: {} });
    expect(b.tileCount).toBe(16);
    expect(b.strokeCapacityTiles).toBe(16);
    expect(b.wetCapacityTiles).toBe(16);
    expect(b.bytes.strokePool).toBe(16 * 4096);
    // 습식: 코어 12채널 1벌, 확장 23채널, 스냅샷 20채널.
    expect(b.bytes.wetPool).toBe(16 * 12 * 256 * 4);
    expect(b.bytes.wetExt).toBe(16 * 23 * 256 * 4);
    expect(b.bytes.wetSnap).toBe(16 * 20 * 256 * 4);
    expect(b.bytes.paperWet).toBe(256 * 256 * 3 * 4);
    expect(b.bytes.wetKernel).toBe(WET_KERNEL_BYTES);
  });

  it("확장 풀·스냅샷이 장치 storage 바인딩 한도를 넘으면 생성 전에 StrokeBudgetExceededError(buffer 이름 포함)로 막는다", () => {
    // 512² 캔버스(전 타일 1024 = 기본 용량 2048 이하): 코어 풀 12 MiB는 16 MiB 한도 안이지만 확장 풀 23 MiB·스냅샷 20 MiB는 넘는다(앞선 버퍼는 모두 한도 이하).
    let caught: unknown = null;
    try {
      computeBudget({ width: 512, height: 512, limits: { maxStorageBufferBindingSize: 16 * 1024 * 1024 } });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(StrokeBudgetExceededError);
    expect((caught as StrokeBudgetExceededError).details).toMatchObject({ buffer: "wetExt" });
    // 한도가 충분하면 통과하고, 지연 버퍼(유화 스크래치) 크기가 계산에 포함된다.
    const ok = computeBudget({ width: 512, height: 512, limits: {} });
    expect(ok.oilWindowCells).toBe(512 * 512);
    expect(ok.lazyBytes.oilScratch).toBe(oilScratchBytes(512 * 512));
    expect(ok.lazyBytes.displayLinear).toBe(512 * 512 * 16);
    // 2048²은 창 상한(OIL_WINDOW_MAX_CELLS)으로 잘린다.
    expect(computeBudget({ width: 2048, height: 2048, limits: {} }).oilWindowCells).toBe(1_114_112);
  });

  it("requiredBufferLimits: 구성이 요구하는 storage 바인딩·버퍼 한도(확장 풀 23채널·스냅샷 20채널·스테이징·지연 버퍼 포함)를 한도 검사 없이 돌려준다", () => {
    // 6000타일(2048²): 확장 풀 141,312,000이 가장 큰 바인딩이고 스테이징도 같은 크기다.
    expect(requiredBufferLimits({ width: 2048, height: 2048, wetCapacityTiles: 6000 })).toEqual({
      maxStorageBufferBindingSize: 6000 * 23 * 256 * 4,
      maxBufferSize: 6000 * 23 * 256 * 4,
    });
    // 기본 구성(2048타일)에서는 지연 생성 유화 스크래치(창 셀 상한 1,114,112 × 16 f32 + 헤더)가 문서(64 MiB)보다 크다.
    expect(requiredBufferLimits({ width: 2048, height: 2048 }).maxStorageBufferBindingSize).toBe(oilScratchBytes(1_114_112));
    expect(requiredBufferLimits({ width: 512, height: 512 }).maxStorageBufferBindingSize).toBe(Math.max(512 * 512 * 16, oilScratchBytes(512 * 512), 1024 * 23 * 256 * 4));
    // 한도를 넘는 구성도 던지지 않는다(검사는 computeBudget 몫). 캔버스 상한은 같은 오류로 막는다.
    expect(() => requiredBufferLimits({ width: 2048, height: 2048, wetCapacityTiles: 16384 })).not.toThrow();
    expect(() => requiredBufferLimits({ width: 4096, height: 16 })).toThrow(LaneUnavailableError);
    // computeBudget와 같은 크기 산식이라(즉시 만드는 버퍼가 가장 클 때) 한도를 정확히 그 값으로 주면 통과하고 1바이트 모자라면 막힌다.
    const cfg = { width: 512, height: 512, wetCapacityTiles: 1024 };
    const need = requiredBufferLimits(cfg);
    expect(need.maxStorageBufferBindingSize).toBe(1024 * 23 * 256 * 4);
    expect(() => computeBudget({ ...cfg, limits: need })).not.toThrow();
    expect(() => computeBudget({ ...cfg, limits: { maxStorageBufferBindingSize: need.maxStorageBufferBindingSize - 1, maxBufferSize: need.maxBufferSize } })).toThrow(StrokeBudgetExceededError);
  });

  it("런타임 create의 예산은 호출자가 준 어댑터급 큰 한도가 아니라 실제 장치 한도(device.limits)로 검증한다(무음 검증 오류 방지)", async () => {
    const GIB = 1024 ** 3;
    // 장치는 기본 한도(128 MiB 바인딩·256 MiB 버퍼). 호출자는 1 GiB(어댑터 한도)를 넘긴다.
    const gpu = createMockGpu();
    const err = await SumiComputeRuntime.create(gpu.device, {
      width: 2048,
      height: 2048,
      seed: 1,
      wetCapacityTiles: 6000,
      features: new Set(),
      clock: null,
      limits: { maxStorageBufferBindingSize: GIB, maxBufferSize: GIB },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StrokeBudgetExceededError);
    expect((err as StrokeBudgetExceededError).details).toMatchObject({ buffer: "wetExt" });
    expect(gpu.calls.filter((c) => c === "device.createBuffer").length).toBe(0);
  });

  it("런타임 create가 예산 초과를 던진다", async () => {
    const gpu = createMockGpu({ limits: { maxStorageBufferBindingSize: 1024 } });
    await expect(SumiComputeRuntime.create(gpu.device, { width: 64, height: 64, seed: 1, features: new Set(), clock: null })).rejects.toBeInstanceOf(
      StrokeBudgetExceededError,
    );
  });

  it("유화 스크래치가 한도를 넘으면 create가 아니라 첫 유화 획에서 StrokeBudgetExceededError(oilScratch)를 던진다(건식·수채 세션은 영향 없음)", async () => {
    // 1024²: 문서 16 MiB·확장 풀 46 MiB(기본 2048타일)는 64 MiB 한도 안이지만 유화 스크래치(= 64 MiB + 헤더 64 B)는 넘는다.
    const gpu = createMockGpu({ limits: { maxStorageBufferBindingSize: 64 * 1024 * 1024, maxBufferSize: 256 * 1024 * 1024 } });
    const runtime = await SumiComputeRuntime.create(gpu.device, { width: 1024, height: 1024, seed: 1, features: new Set(), clock: null });
    runtime.beginStroke(wetProgram(), 1);
    runtime.submitBatch(batchFrom([wetDab(20, 20)]));
    await runtime.endStroke();
    let caught: unknown = null;
    try {
      runtime.beginStroke(impastoProgram(), 2);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(StrokeBudgetExceededError);
    expect((caught as StrokeBudgetExceededError).details).toMatchObject({ buffer: "oilScratch" });
    expect(() => gpu.bufferByLabel("sumi-oil-scratch")).toThrow();
  });
});

describe("SumiComputeRuntime 획 자산", () => {
  it("팁 아틀라스는 7레벨 r32를 올리고 종이는 활성일 때만 올린다; 같은 프로그램은 다시 올리지 않는다", async () => {
    const { gpu, runtime } = await createRuntime();
    const program = dryProgram();
    runtime.beginStroke(program, 1);
    const tipWrites = gpu.textureWrites.filter((w) => w.target === "sumi-tip-atlas");
    expect(tipWrites.length).toBe(TIP_ATLAS_LEVELS);
    expect(tipWrites[0]).toMatchObject({ mipLevel: 0, width: 512, height: 64, bytes: 512 * 64 * 4 });
    expect(tipWrites[6]).toMatchObject({ mipLevel: 6, width: 8, height: 1 });
    expect(gpu.textureWrites.filter((w) => w.target === "sumi-paper").length).toBe(program.paper.enabled ? 1 : 0);
    // 건식 프로그램은 습식 상수·f32 종이를 올리지 않는다.
    expect(gpu.writes.filter((w) => w.target === "sumi-wet-kernel" || w.target === "sumi-paper-wet")).toEqual([]);
    await runtime.endStroke();
    runtime.beginStroke(program, 2);
    expect(gpu.textureWrites.filter((w) => w.target === "sumi-tip-atlas").length).toBe(TIP_ATLAS_LEVELS);
  });

  it("아틀라스 레벨 데이터는 CPU 팁 체인과 같은 값이고 종이 인코딩은 채널 순서(R dir, G bump, B absorb)를 지킨다", () => {
    const program = dryProgram();
    const chains = buildTipChainsForProgram(program);
    const levels = buildTipAtlasLevels(chains);
    expect(levels.length).toBe(TIP_ATLAS_LEVELS);
    const round = chains.round[0]!;
    // round는 kind 0 → x 0..63.
    expect(levels[0]![32 * 512 + 32]).toBe(round.data[32 * 64 + 32]);
    const flat = chains.flat[2]!;
    expect(levels[2]![8 * 128 + 16 + 8]).toBe(flat.data[8 * 16 + 8]);
    const paper = encodePaperTexture({ size: 2, direction: new Float32Array([0, Math.PI, Math.PI * 2, 0]), bump: new Float32Array([0, 0.5, 1, 0.25]), absorb: new Float32Array([1, 0, 0.5, 0]) });
    expect(Array.from(paper.subarray(0, 8))).toEqual([0, 0, 255, 255, 128, 128, 0, 255]);
  });

  it("종이 텍스처는 f32(rgba32float)다: 8비트 양자화 없이 CPU 필드 값을 그대로 올리고 행 길이는 size × 16 B이다", async () => {
    // R 방향 rad · G 요철 · B 흡수율 · A 1, 양자화 없음(0.123456789는 f32로 그대로).
    const f32 = encodePaperTextureF32({ size: 2, direction: new Float32Array([0, 3, 6, 1]), bump: new Float32Array([0.123456789, 0.5, 1, 0.25]), absorb: new Float32Array([1, 0, 0.5, 0.75]) });
    expect(f32).toBeInstanceOf(Float32Array);
    expect(f32.length).toBe(16);
    expect(Array.from(f32.subarray(0, 8))).toEqual([0, Math.fround(0.123456789), 1, 1, 3, 0.5, 0, 1]);
    const { gpu, runtime } = await createRuntime();
    expect(gpu.textures.find((t) => t.label === "sumi-paper")?.format).toBe("rgba32float");
    const program = dryProgram();
    expect(program.paper.enabled).toBe(true);
    runtime.beginStroke(program, 1);
    const write = gpu.textureWrites.find((w) => w.target === "sumi-paper");
    expect(write).toMatchObject({ width: 256, height: 256, bytes: 256 * 256 * 16 });
    // 주입된 8비트 종이는 올릴 때 f32로 변환된다(바이트 수가 아니라 f32 바이트 수가 올라간다).
    await runtime.endStroke();
    runtime.beginStroke(program, 2, { paper: new Uint8Array(256 * 256 * 4) });
    expect(gpu.textureWrites.filter((w) => w.target === "sumi-paper").pop()).toMatchObject({ bytes: 256 * 256 * 16 });
    await runtime.endStroke();
    expect(() => runtime.beginStroke(program, 3, { paper: new Uint8Array(12) })).toThrow(RangeError);
  });

  it("paramsForProgram은 CPU 참조와 같은 습식 활성 규칙을 쓰고 습식 층 플래그는 런타임이 채운다", () => {
    const cfg = { tilesX: 4, tilesY: 3, width: 64, height: 48, strokeCapacity: 12, wetCapacity: 12, seed: 5 };
    expect(paramsForProgram(dryProgram(), cfg)).toMatchObject({ wet_enabled: 0, impasto_enabled: 0, tile_count: 12, paper_enabled: 1 });
    expect(paramsForProgram(wetProgram(), cfg)).toMatchObject({ wet_enabled: 1, impasto_enabled: 0, wet_water_layer: 0, wet_oil_layer: 0, wet_settle: 0 });
    expect(paramsForProgram(impastoProgram(), cfg)).toMatchObject({ wet_enabled: 1, impasto_enabled: 1 });
    const noWet = normalizeProgram({ id: "x", name: "x", family: "oil", description: "", deposition: { model: "impasto" } });
    expect(noWet.wet).toBeNull();
    expect(paramsForProgram(noWet, cfg).wet_enabled).toBe(0);
    expect(wetLayerKindOf(wetProgram())).toBe("water");
    expect(wetLayerKindOf(impastoProgram())).toBe("oil");
    expect(wetLayerKindOf(dryProgram())).toBeNull();
    expect(wetLayerKindOf(noWet)).toBeNull();
  });

  it("습식 획은 beginStroke에서 서브스텝 상수(wet_kernel)와 f32 종이(paper_wet)를 올리고 같은 종이는 다시 올리지 않는다", async () => {
    const { gpu, runtime } = await createRuntime();
    const program = wetProgram();
    runtime.beginStroke(program, 1);
    const kernelWrite = gpu.writes.filter((w) => w.target === "sumi-wet-kernel");
    expect(kernelWrite).toEqual([{ target: "sumi-wet-kernel", offset: 0, size: WET_KERNEL_BYTES }]);
    // 값은 CPU makeWaterKernel과 같다(첫 멤버 surf_tension, 그 뒤 순서).
    const view = new DataView(gpu.bufferByLabel("sumi-wet-kernel").data);
    const cpu = makeWaterKernel(program.wet!, 1000 / 60 / 2);
    expect(view.getFloat32(0, true)).toBe(Math.fround(cpu.surfTension));
    const alphaIndex = WET_KERNEL_MEMBERS.findIndex(([n]) => n === "alpha");
    expect(view.getFloat32(alphaIndex * 4, true)).toBe(Math.fround(cpu.alpha));
    const seedIndex = WET_KERNEL_MEMBERS.findIndex(([n]) => n === "fiber_seed");
    expect(view.getUint32(seedIndex * 4, true)).toBe(DEFAULT_PAPER_SPEC.seed);
    expect(gpu.writes.filter((w) => w.target === "sumi-paper-wet")).toEqual([{ target: "sumi-paper-wet", offset: 0, size: 256 * 256 * 3 * 4 }]);
    await runtime.endStroke();
    runtime.beginStroke(program, 2);
    expect(gpu.writes.filter((w) => w.target === "sumi-paper-wet").length).toBe(1);
    expect(gpu.writes.filter((w) => w.target === "sumi-wet-kernel").length).toBe(2);
  });

  it("호스트 상수 계산: 유화 밀기 비율 oilDepth·(1 − viscosity)·패스 수 1 + ⌊2(1 − viscosity)⌋·레벨링·건조 계수가 CPU와 같다", () => {
    const program = normalizeProgram({
      id: "t-oil-k",
      name: "oil k",
      family: "oil",
      description: "",
      deposition: { model: "impasto" },
      wet: { substeps: 1, oilDepth: 0.8, viscosity: 0.5, oilYield: 0.3, dryingMs: 20000, oilMixing: 0.4, oilPickup: 0.2 },
    });
    const values = wetKernelValues(program)!;
    expect(oilPushOf(program.wet!)).toBeCloseTo(0.4, 12);
    expect(oilPassesOf(program.wet!)).toBe(2);
    expect(values.oil_push).toBeCloseTo(0.4, 12);
    expect(values.oil_passes).toBe(2);
    expect(values.oil_mixing).toBe(0.4);
    expect(values.oil_pickup).toBe(0.2);
    expect(values.oil_rate).toBeCloseTo(0.12 * 0.5 * 1, 12);
    expect(values.oil_yield_h).toBeCloseTo(0.3 * 1.2, 12);
    expect(values.oil_decay).toBeCloseTo(1 - 1000 / 60 / 20000, 12);
    expect(wetKernelValues(dryProgram())).toBeNull();
    // 점도 1이면 밀기 없음(passes는 최소 1).
    const stiff = normalizeProgram({ id: "s", name: "s", family: "oil", description: "", deposition: { model: "impasto" }, wet: { viscosity: 1 } });
    expect(oilPushOf(stiff.wet!)).toBe(0);
    expect(oilPassesOf(stiff.wet!)).toBe(1);
  });

  it("f32 종이 인코딩은 (bump, absorb, direction) 인터리브이고 크기가 맞지 않으면 RangeError", () => {
    const field = { size: 256, direction: new Float32Array(256 * 256).fill(1.5), bump: new Float32Array(256 * 256).fill(0.25), absorb: new Float32Array(256 * 256).fill(0.75) };
    const out = encodePaperWet(field);
    expect(Array.from(out.subarray(0, 6))).toEqual([0.25, 0.75, 1.5, 0.25, 0.75, 1.5]);
    expect(() => encodePaperWet({ ...field, size: 64, direction: new Float32Array(64 * 64), bump: new Float32Array(64 * 64), absorb: new Float32Array(64 * 64) })).toThrow(RangeError);
  });
});

describe("SumiComputeRuntime.submitBatch", () => {
  it("건식 배치 1회 = encoder 1·compute pass 1·submit 1, 디스패치 8회(직접 5·간접 3), writeBuffer(dabs) = dabs×64", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(dryProgram(), 1);
    const before = gpu.dispatches.length;
    const submitsBefore = gpu.submits;
    const receipt = runtime.submitBatch(batchOf(37));
    const frame = gpu.dispatches.slice(before);
    expect(frame.map((d) => `${d.entryPoint}:${d.kind}`)).toEqual([
      `${ENTRY_POINTS.binCount}:direct`,
      `${ENTRY_POINTS.scanBlocks}:direct`,
      `${ENTRY_POINTS.scanBlockSums}:direct`,
      `${ENTRY_POINTS.scanAdd}:direct`,
      `${ENTRY_POINTS.writeIndirect}:direct`,
      `${ENTRY_POINTS.scatter}:indirect`,
      `${ENTRY_POINTS.fineRaster}:indirect`,
      `${ENTRY_POINTS.compositeDirty}:indirect`,
    ]);
    expect(new Set(frame.map((d) => d.pass)).size).toBe(1);
    expect(frame.filter((d) => d.kind === "indirect").every((d) => d.indirectBuffer === "sumi-indirect" && d.indirectOffset === INDIRECT_OFFSETS.dirty)).toBe(true);
    expect(gpu.submits - submitsBefore).toBe(1);
    expect(receipt).toMatchObject({ frameIndex: 0, dabCount: 37, submitCount: 1, dispatchCount: 8 });
    const dabWrite = gpu.writes.find((w) => w.target === "sumi-dabs");
    expect(dabWrite).toMatchObject({ offset: 0, size: 37 * 64 });
    // 프레임 초기화: counts 영역·테이블 [0,8) clear.
    expect(gpu.clears.filter((c) => c.target === "sumi-bins")).toEqual([{ target: "sumi-bins", offset: 0, size: 16384 * 4 }]);
    expect(gpu.clears.filter((c) => c.target === "sumi-table")).toEqual([{ target: "sumi-table", offset: 0, size: TABLE_OFFSETS.frameClearBytes }]);
    // 워크그룹 수: count = ceil(37/256) = 1, scan_add = ceil(12/256) = 1.
    expect(frame[0]).toMatchObject({ x: 1 });
    expect(frame[3]).toMatchObject({ x: 1 });
  });

  it("빈 배치도 프레임을 제출한다(습식 스텝·합성 유지)", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(dryProgram(), 1);
    const r = runtime.submitBatch(new DabBatch(4));
    expect(r.dabCount).toBe(0);
    expect(r.submitCount).toBe(1);
    expect(gpu.writes.some((w) => w.target === "sumi-dabs")).toBe(false);
  });

  it("MAX_DABS_PER_BATCH 초과는 같은 프레임에서 분할 제출한다", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(dryProgram(), 1);
    const submitsBefore = gpu.submits;
    const n = MAX_DABS_PER_BATCH + 10;
    const receipt = runtime.submitBatch(batchOf(n));
    expect(receipt.submitCount).toBe(2);
    expect(receipt.dispatchCount).toBe(16);
    expect(gpu.submits - submitsBefore).toBe(2);
    const sizes = gpu.writes.filter((w) => w.target === "sumi-dabs").map((w) => w.size);
    expect(sizes).toEqual([MAX_DABS_PER_BATCH * 64, 10 * 64]);
    const final = await runtime.endStroke();
    expect(final.dabCount).toBe(n);
    // 프레임 2 + endStroke 1(건식은 bake_stroke·composite_all을 한 제출에 담는다).
    expect(final.submitCount).toBe(3);
  });

  it("수채 프로그램은 fine raster 뒤 wet_commit → substeps × (snapshot·edge_delta·step_water·expand·commit) → composite를 낸다(간접 인자 = 활성 타일)", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(wetProgram(), 1);
    const before = gpu.dispatches.length;
    const receipt = runtime.submitBatch(batchFrom([wetDab(10, 10), wetDab(12, 11), wetDab(14, 12)]));
    const frame = gpu.dispatches.slice(before);
    const names = frame.map((d) => d.entryPoint);
    const substep = [
      ENTRY_POINTS.wetSnapshot,
      ENTRY_POINTS.wetEdgeDelta,
      ENTRY_POINTS.wetStepWater,
      ENTRY_POINTS.wetExpand,
      ENTRY_POINTS.wetCommit,
    ];
    expect(names.slice(7)).toEqual([ENTRY_POINTS.wetCommit, ...substep, ...substep, ENTRY_POINTS.compositeDirty, ENTRY_POINTS.compositeWet]);
    expect(receipt.dispatchCount).toBe(7 + 1 + 10 + 2);
    const liveNames: string[] = [ENTRY_POINTS.wetSnapshot, ENTRY_POINTS.wetEdgeDelta, ENTRY_POINTS.wetStepWater, ENTRY_POINTS.wetExpand];
    const live = frame.filter((d) => liveNames.includes(d.entryPoint));
    expect(live.length).toBe(8);
    expect(live.every((d) => d.kind === "indirect" && d.indirectBuffer === "sumi-indirect" && d.indirectOffset === INDIRECT_OFFSETS.wetLive)).toBe(true);
    expect(live.every((d) => d.layoutLabel === "sumi-wpl-waterStep")).toBe(true);
    const commits = frame.filter((d) => d.entryPoint === ENTRY_POINTS.wetCommit);
    expect(commits.length).toBe(3);
    expect(commits.every((d) => d.kind === "direct" && d.x === 1 && d.layoutLabel === "sumi-wpl-listWriter")).toBe(true);
    // 합성: dirty 타일 + 지금까지 할당된 습식 타일.
    expect(frame[frame.length - 2]).toMatchObject({ kind: "indirect", indirectOffset: INDIRECT_OFFSETS.dirty, layoutLabel: "sumi-wpl-composite" });
    expect(frame[frame.length - 1]).toMatchObject({ kind: "indirect", indirectOffset: INDIRECT_OFFSETS.wet });
    // 종이 파생 필드는 셰이더가 즉시 계산하므로 별도 패스가 없다(경로 분기·종이 캐시 패스 없음).
    expect(names.some((n) => n.startsWith("paper"))).toBe(false);
  });

  it("같은 pass 안에서 가족이 바뀌어도 모든 dispatch가 레이아웃과 호환되는 바인드 그룹을 갖는다(모의 장치가 검증)", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(wetProgram(), 1);
    runtime.submitBatch(batchFrom([wetDab(10, 10)]));
    runtime.submitBatch(batchFrom([wetDab(14, 12)]));
    const bgSets = gpu.calls.filter((c) => c === "pass.setBindGroup").length;
    expect(bgSets).toBeGreaterThan(0);
    // 습식 디스패치는 전부 습식 파이프라인 레이아웃으로 돈다.
    const wetDispatches = gpu.dispatches.filter((d) => d.layoutLabel?.startsWith("sumi-wpl-"));
    expect(wetDispatches.length).toBeGreaterThan(20);
  });

  it("beginStroke 전·dispose 후 호출은 InvalidStateError", async () => {
    const { runtime } = await createRuntime();
    expect(() => runtime.submitBatch(batchOf(1))).toThrow(InvalidStateError);
    runtime.dispose();
    expect(() => runtime.beginStroke(dryProgram(), 1)).toThrow(InvalidStateError);
  });

  it("timestamp-query 기능이 있으면 compute pass에 timestampWrites를 넣는다", async () => {
    const { gpu, runtime } = await createRuntime({ features: ["timestamp-query"] });
    runtime.beginStroke(dryProgram(), 1);
    runtime.submitBatch(batchOf(2));
    expect(gpu.computePasses[gpu.computePasses.length - 1]).toEqual({ timestampWrites: true });
    expect(gpu.resolves.length).toBe(1);
  });
});

describe("SumiComputeRuntime smudge 운반 색(smudge_carry)", () => {
  const smudge = () => presetById("smudge-blend");

  it("smudge 프로그램은 spacing에서 유도한 smudge_pickup을 params로 올리고 다른 모델은 0이다", () => {
    const cfg = { tilesX: 4, tilesY: 3, width: 64, height: 48, strokeCapacity: 12, wetCapacity: 12, seed: 5 };
    const program = smudge();
    expect(program.deposition.model).toBe("smudge");
    const pickup = paramsForProgram(program, cfg).smudge_pickup;
    expect(pickup).toBe(smudgePickupPerDab(program.deposition.spacing));
    expect(pickup).toBeGreaterThan(0);
    expect(pickup).toBeLessThanOrEqual(1);
    expect(paramsForProgram(dryProgram(), cfg).smudge_pickup).toBe(0);
  });

  it("beginStroke는 smudge 획에서만 bins의 운반 색 상태(carry·loaded) 32 B를 0으로 리셋한다", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(dryProgram(), 1);
    expect(gpu.writes.filter((w) => w.target === "sumi-bins")).toEqual([]);
    await runtime.endStroke();
    runtime.beginStroke(smudge(), 2);
    expect(gpu.writes.filter((w) => w.target === "sumi-bins")).toEqual([{ target: "sumi-bins", offset: BINS_OFFSETS.smudgeState, size: SMUDGE_STATE_BYTES }]);
  });

  it("dab가 있는 프레임은 raster_tile 직전에 smudge_carry를 워크그룹 1개로 정확히 한 번 내고, dab 없는 프레임·다른 모델은 내지 않는다", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(smudge(), 1);
    let before = gpu.dispatches.length;
    runtime.submitBatch(batchOf(6));
    const frame = gpu.dispatches.slice(before).map((d) => d.entryPoint);
    const at = frame.indexOf(ENTRY_POINTS.smudgeCarry);
    expect(frame.filter((e) => e === ENTRY_POINTS.smudgeCarry).length).toBe(1);
    // 비닝(scatter)이 끝난 뒤, 래스터 직전.
    expect(frame[at - 1]).toBe(ENTRY_POINTS.scatter);
    expect(frame[at + 1]).toBe(ENTRY_POINTS.fineRaster);
    const carry = gpu.dispatches.slice(before)[at];
    expect(carry).toMatchObject({ kind: "direct" });
    // smudge_carry는 간접 인자 버퍼를 쓰지 않으므로 group 2를 바인드하지 않는다.
    expect(carry?.layoutLabel).toBe("sumi-pipeline-layout");

    before = gpu.dispatches.length;
    runtime.submitBatch(batchOf(0));
    expect(gpu.dispatches.slice(before).some((d) => d.entryPoint === ENTRY_POINTS.smudgeCarry)).toBe(false);
    await runtime.endStroke();

    runtime.beginStroke(dryProgram(), 2);
    before = gpu.dispatches.length;
    runtime.submitBatch(batchOf(6));
    expect(gpu.dispatches.slice(before).some((d) => d.entryPoint === ENTRY_POINTS.smudgeCarry)).toBe(false);
  });
});

describe("SumiComputeRuntime 유화 dab 순서 처리(셰이드 → 합계 → 밀기×패스 → 붓 색 → 침착 → 되쓰기)", () => {
  const OIL_ORDER = (passes: number): string[] => [
    ENTRY_POINTS.oilShade,
    ENTRY_POINTS.oilReduce,
    ...Array.from({ length: passes }, () => ENTRY_POINTS.oilPush),
    ENTRY_POINTS.oilCarry,
    ENTRY_POINTS.oilDeposit,
    ENTRY_POINTS.oilStore,
  ];

  it("유화 dab마다 oil_shade → oil_reduce → oil_push×패스 → oil_carry → oil_deposit → oil_store를 dab 순서로 내고 서브스텝은 oil_snapshot → oil_level → oil_dry → wet_commit이다", async () => {
    const { gpu, runtime } = await createRuntime({ features: ["timestamp-query"] });
    runtime.beginStroke(impastoProgram(), 1);
    const before = gpu.dispatches.length;
    const passesBefore = gpu.computePasses.length;
    // dab 0·2는 유화, 1은 일반 dab(건너뛴다), 3은 캔버스 바깥(타일 범위 없음 → 건너뛴다).
    const batch = batchFrom([oilDab(20, 20), dab(30, 30), oilDab(40, 22, Math.PI / 2), oilDab(-5000, 5)]);
    const receipt = runtime.submitBatch(batch);
    const frame = gpu.dispatches.slice(before);
    const names = frame.map((d) => d.entryPoint);
    const rasterAt = names.indexOf(ENTRY_POINTS.fineRaster);
    // viscosity 0.1 → 패스 수 1 + ⌊2·0.9⌋ = 2.
    const dabSeq = OIL_ORDER(2);
    expect(names.slice(rasterAt + 1, rasterAt + 1 + dabSeq.length * 2)).toEqual([...dabSeq, ...dabSeq]);
    const tail = names.slice(rasterAt + 1 + dabSeq.length * 2);
    expect(tail).toEqual([
      ENTRY_POINTS.wetCommit,
      ENTRY_POINTS.oilSnapshot,
      ENTRY_POINTS.oilLevel,
      ENTRY_POINTS.oilDry,
      ENTRY_POINTS.wetCommit,
      ENTRY_POINTS.compositeDirty,
      ENTRY_POINTS.compositeWet,
    ]);
    // 간접 인자: 스냅샷·레벨링 = 활성 타일, 건조 = 지금까지 할당된 모든 타일.
    const byName = (n: string) => frame.filter((d) => d.entryPoint === n);
    expect(byName(ENTRY_POINTS.oilSnapshot)[0]).toMatchObject({ kind: "indirect", indirectOffset: INDIRECT_OFFSETS.wetLive, layoutLabel: "sumi-wpl-oilLevel" });
    expect(byName(ENTRY_POINTS.oilLevel)[0]).toMatchObject({ kind: "indirect", indirectOffset: INDIRECT_OFFSETS.wetLive });
    expect(byName(ENTRY_POINTS.oilDry)[0]).toMatchObject({ kind: "indirect", indirectOffset: INDIRECT_OFFSETS.wet });
    // dab 레코드 = 256 B 동적 오프셋(dab당 2개: 읽기 벌 0/1). 밀기 패스 j는 레코드 j % 2를 쓰고 나머지는 레코드 0.
    const dabDispatches = frame.filter((d) => (d.layoutLabel === "sumi-wpl-oilWindow"));
    expect(dabDispatches.length).toBe(dabSeq.length * 2);
    expect(dabDispatches.every((d) => d.kind === "direct")).toBe(true);
    const offsets = dabDispatches.map((d) => d.groupOffsets[2]?.[0]);
    const one = (base: number): (number | undefined)[] => [base, base, base, base + OIL_RECORD_BYTES, base, base, base];
    expect(offsets).toEqual([...one(0), ...one(2 * OIL_RECORD_BYTES)]);
    // 단일 pass(타임스탬프 begin·end가 같은 pass).
    expect(gpu.computePasses.slice(passesBefore)).toEqual([{ timestampWrites: true }]);
    expect(new Set(frame.map((d) => d.pass)).size).toBe(1);
    expect(receipt.dispatchCount).toBe(frame.length);
    // 레코드 2개 × 2 dab 업로드.
    expect(gpu.writes.filter((w) => w.target === "sumi-oil-records")).toEqual([{ target: "sumi-oil-records", offset: 0, size: 4 * OIL_RECORD_BYTES }]);
  });

  it("레코드 내용: 창(밀기 여유 passes칸)·AABB·셀 수·읽기 벌·최신 벌·cos/sin이 CPU applyImpastoDabs 산술과 같다", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(impastoProgram(), 1);
    runtime.submitBatch(batchFrom([oilDab(20, 20), oilDab(40, 22, Math.PI / 2)]));
    const rec = (k: number): Record<string, number> => {
      const v = new DataView(gpu.bufferByLabel("sumi-oil-records").data, k * OIL_RECORD_BYTES);
      const out: Record<string, number> = {};
      OIL_DAB_MEMBERS.forEach(([name, type], i) => {
        out[name] = type === "f32" ? v.getFloat32(i * 4, true) : type === "i32" ? v.getInt32(i * 4, true) : v.getUint32(i * 4, true);
      });
      return out;
    };
    // dab (20,20) r=4 hardness 0.8 → feather 1, extent 4 + 1 + 1 = 6 → AABB [14,26]², passes 2 → 창 [12,28]²(17×17).
    expect(rec(0)).toMatchObject({ dab_index: 0, in_x0: 14, in_y0: 14, in_x1: 26, in_y1: 26, win_x0: 12, win_y0: 12, win_x1: 28, win_y1: 28, cell_count: 289, src_buf: 0, cur_buf: 0 });
    expect(rec(1)).toMatchObject({ dab_index: 0, src_buf: 1, cur_buf: 0, cell_count: 289 });
    expect(rec(0).cos_a).toBeCloseTo(1, 6);
    expect(rec(0).sin_a).toBeCloseTo(0, 6);
    // 두 번째 dab(40,22) angle π/2: AABB [34,46]×[16,28], 창은 passes 2칸 확장.
    expect(rec(2)).toMatchObject({ dab_index: 1, in_x0: 34, in_x1: 46, in_y0: 16, in_y1: 28, win_x0: 32, win_x1: 48, win_y0: 14, win_y1: 30 });
    expect(rec(2).sin_a).toBeCloseTo(1, 6);
  });

  it("점도에 따라 패스 수가 달라지고 점도 1(밀기 없음)이면 oil_push를 내지 않는다", async () => {
    const cases: { viscosity: number; passes: number; push: boolean }[] = [
      { viscosity: 0, passes: 3, push: true },
      { viscosity: 0.5, passes: 2, push: true },
      { viscosity: 0.9, passes: 1, push: true },
      { viscosity: 1, passes: 1, push: false },
    ];
    for (const c of cases) {
      const { gpu, runtime } = await createRuntime();
      const program = normalizeProgram({
        id: "t-oil-v",
        name: "oil v",
        family: "oil",
        description: "",
        deposition: { model: "impasto" },
        wet: { substeps: 1, viscosity: c.viscosity, oilDepth: 0.5 },
      });
      runtime.beginStroke(program, 1);
      const before = gpu.dispatches.length;
      runtime.submitBatch(batchFrom([oilDab(20, 20)]));
      const names = gpu.dispatches.slice(before).map((d) => d.entryPoint);
      expect(names.filter((n) => n === ENTRY_POINTS.oilPush).length, JSON.stringify(c)).toBe(c.push ? c.passes : 0);
      // 밀기 비율은 wet_kernel uniform에 있다(oilDepth·(1 − viscosity)).
      const view = new DataView(gpu.bufferByLabel("sumi-wet-kernel").data);
      const pushIndex = WET_KERNEL_MEMBERS.findIndex(([n]) => n === "oil_push");
      expect(view.getFloat32(pushIndex * 4, true), JSON.stringify(c)).toBeCloseTo(0.5 * (1 - c.viscosity), 6);
      // 최신 벌(cur_buf) = 밀기가 있으면 패스 수 % 2.
      const v = new DataView(gpu.bufferByLabel("sumi-oil-records").data, 0);
      const curIndex = OIL_DAB_MEMBERS.findIndex(([n]) => n === "cur_buf");
      expect(v.getUint32(curIndex * 4, true)).toBe(c.push ? c.passes % 2 : 0);
    }
  });

  it("유화 스크래치는 첫 유화 획에서 만들고(캔버스 셀 수 × 16 f32 + 헤더) 붓 색 헤더 16 f32를 0으로 리셋한다", async () => {
    const { gpu, runtime } = await createRuntime({ width: 64, height: 48 });
    expect(() => gpu.bufferByLabel("sumi-oil-scratch")).toThrow();
    runtime.beginStroke(impastoProgram(), 1);
    const scratch = gpu.bufferByLabel("sumi-oil-scratch");
    expect(scratch.size).toBe(oilScratchBytes(64 * 48));
    expect(gpu.writes.filter((w) => w.target === "sumi-oil-scratch")).toEqual([{ target: "sumi-oil-scratch", offset: 0, size: OIL_SCRATCH_HEADER_FLOATS * 4 }]);
    // 다음 유화 획도 붓 색을 다시 비운다(버퍼는 다시 만들지 않는다).
    runtime.submitBatch(batchFrom([oilDab(20, 20)]));
    await runtime.endStroke();
    const buffers = gpu.buffers.length;
    runtime.beginStroke(impastoProgram(), 2);
    expect(gpu.buffers.length).toBe(buffers);
    expect(gpu.writes.filter((w) => w.target === "sumi-oil-scratch").length).toBe(2);
  });

  it("유화 dab 창이 스크래치 용량을 넘거나 한 프레임의 유화 dab가 상한을 넘으면 StrokeBudgetExceededError(fail-visible)", async () => {
    const { runtime } = await createRuntime();
    runtime.beginStroke(impastoProgram(), 1);
    const n = 4097;
    const batch = new DabBatch(n);
    for (let i = 0; i < n; i += 1) batch.push(oilDab(10 + (i % 40), 10 + (i % 30)));
    expect(() => runtime.submitBatch(batch)).toThrow(StrokeBudgetExceededError);
  });

  it("유화 dab가 없는 프레임·유화가 아닌 프로그램은 oil_* dab 패스를 내지 않는다(레코드 업로드 없음)", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(impastoProgram(), 1);
    const before = gpu.dispatches.length;
    runtime.submitBatch(batchOf(5));
    expect(gpu.dispatches.slice(before).some((d) => d.entryPoint === ENTRY_POINTS.oilShade)).toBe(false);
    expect(gpu.writes.filter((w) => w.target === "sumi-oil-records")).toEqual([]);
    await runtime.endStroke();
    runtime.beginStroke(dryProgram(), 2);
    const before2 = gpu.dispatches.length;
    runtime.submitBatch(batchFrom([oilDab(20, 20)]));
    expect(gpu.dispatches.slice(before2).some((d) => d.entryPoint === ENTRY_POINTS.oilShade)).toBe(false);
  });

  it("유화가 올라간 뒤에는 has_height가 켜지고 다음 획(다른 프로그램)에서도 유지된다", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(impastoProgram(), 1);
    runtime.submitBatch(batchFrom([oilDab(20, 20)]));
    expect(paramU32(gpu, "has_height")).toBe(1);
    await runtime.endStroke();
    runtime.beginStroke(dryProgram(), 2);
    runtime.submitBatch(batchOf(3));
    expect(paramU32(gpu, "has_height")).toBe(1);
  });
});

describe("SumiComputeRuntime 외부 CSR 비닝(하이브리드 경로)", () => {
  it("binner가 있으면 count·scan_blocks·scan_block_sums·scatter를 건너뛰고(프레임당 4 dispatch) CSR·overflow를 writeBuffer로 올린다", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(dryProgram(), 1);
    const tileCount = runtime.tilesX * runtime.tilesY;
    const before = gpu.dispatches.length;
    const binner = (): { counts: Uint32Array; offsets: Uint32Array; refs: Uint32Array; overflowDabs: number } => ({
      counts: new Uint32Array(tileCount).fill(1),
      offsets: Uint32Array.from({ length: tileCount + 1 }, (_, i) => i),
      refs: new Uint32Array(tileCount),
      overflowDabs: 3,
    });
    const r1 = runtime.submitBatch(batchOf(5), binner);
    const frame = gpu.dispatches.slice(before).map((d) => `${d.entryPoint}:${d.kind}`);
    expect(frame).toEqual([
      `${ENTRY_POINTS.scanAdd}:direct`,
      `${ENTRY_POINTS.writeIndirect}:direct`,
      `${ENTRY_POINTS.fineRaster}:indirect`,
      `${ENTRY_POINTS.compositeDirty}:indirect`,
    ]);
    expect(r1.dispatchCount).toBe(4);
    // 외부 비닝은 counts를 통째로 덮어쓰므로 bins clear가 없고, table [0,8)만 비운다.
    expect(gpu.clears.filter((c) => c.target === "sumi-bins")).toEqual([]);
    expect(gpu.clears.filter((c) => c.target === "sumi-table")).toEqual([{ target: "sumi-table", offset: 0, size: TABLE_OFFSETS.frameClearBytes }]);
    expect(gpu.writes.filter((w) => w.target === "sumi-bins")).toEqual([
      { target: "sumi-bins", offset: BINS_OFFSETS.counts, size: tileCount * 4 },
      { target: "sumi-bins", offset: BINS_OFFSETS.offsets, size: tileCount * 4 },
    ]);
    expect(gpu.writes.filter((w) => w.target === "sumi-refs")).toEqual([{ target: "sumi-refs", offset: 0, size: tileCount * 4 }]);
    // dab_overflow·refs_overflow는 호스트가 누적한 절대값을 쓴다(두 번째 프레임에서 3 → 6).
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.dabOverflow)).toBe(3);
    runtime.submitBatch(batchOf(5), binner);
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.dabOverflow)).toBe(6);
    const receipt = await runtime.endStroke();
    expect(receipt.overflowDabs).toBe(6);
    // 다음 획은 0부터 다시 센다.
    runtime.beginStroke(dryProgram(), 2);
    runtime.submitBatch(batchOf(5), binner);
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.dabOverflow)).toBe(3);
  });

  it("wasm 커널이 만든 CSR이 TS binDabs와 같고 GPU 버퍼에 그대로 올라간다", async () => {
    const kernel = await loadEmbeddedKernel();
    const session = new SumiKernelSession(kernel);
    const { gpu, runtime } = await createRuntime({ width: 160, height: 96 });
    runtime.beginStroke(dryProgram(), 1);
    const batch = batchOf(120);
    runtime.submitBatch(batch, (dabs, count) => {
      session.uploadDabs(dabs, count);
      const bin = session.bin(runtime.tilesX, runtime.tilesY, MAX_TILES_PER_DAB);
      return { counts: bin.counts, offsets: bin.offsets, refs: bin.refs, overflowDabs: bin.overflowDabs };
    });
    const want = binDabs(batch, runtime.tilesX, runtime.tilesY);
    const tileCount = runtime.tilesX * runtime.tilesY;
    const bins = new Uint32Array(gpu.bufferByLabel("sumi-bins").data);
    expect(Array.from(bins.subarray(0, tileCount))).toEqual(Array.from(want.counts));
    expect(Array.from(bins.subarray(BINS_OFFSETS.offsets / 4, BINS_OFFSETS.offsets / 4 + tileCount))).toEqual(Array.from(want.offsets.subarray(0, tileCount)));
    expect(Array.from(new Uint32Array(gpu.bufferByLabel("sumi-refs").data, 0, want.refs.length))).toEqual(Array.from(want.refs));
    session.dispose();
  });

  it("너무 짧은 counts/offsets는 RangeError", async () => {
    const { runtime } = await createRuntime();
    runtime.beginStroke(dryProgram(), 1);
    expect(() =>
      runtime.submitBatch(batchOf(1), () => ({ counts: new Uint32Array(1), offsets: new Uint32Array(1), refs: new Uint32Array(0), overflowDabs: 0 })),
    ).toThrow(RangeError);
  });
});


describe("SumiComputeRuntime.endStroke", () => {
  it("건식: bake_stroke(간접 stroke_indirect) → composite_all → 헤더 readback → 영수증, 획 상태 리셋", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(dryProgram(), 1);
    runtime.submitBatch(batchOf(5));
    runtime.submitBatch(batchOf(6));
    // GPU가 계산했을 카운터를 주입한다.
    gpu.setU32("sumi-table", TABLE_OFFSETS.poolCursor, 9);
    gpu.setU32("sumi-table", TABLE_OFFSETS.dabOverflow, 2);
    const before = gpu.dispatches.length;
    const receipt = await runtime.endStroke();
    const tail = gpu.dispatches.slice(before);
    expect(tail.map((d) => `${d.entryPoint}:${d.kind}`)).toEqual([`${ENTRY_POINTS.bakeStroke}:indirect`, `${ENTRY_POINTS.compositeAll}:direct`]);
    expect(tail[0]).toMatchObject({ indirectBuffer: "sumi-indirect", indirectOffset: INDIRECT_OFFSETS.stroke });
    expect(tail[1]).toMatchObject({ x: 4, y: 3 });
    // 프레임 2 + endStroke 제출 1.
    expect(receipt).toMatchObject({ dabCount: 11, submitCount: 3, overflowDabs: 2, poolTilesUsed: 9, frames: 2, dryFrames: 0, timingSource: "submitted-work-done" });
    expect(receipt.frameTimesMs.length).toBe(2);
    expect(gpu.copies.some((c) => c.from === "sumi-table" && c.to === "sumi-table-staging")).toBe(true);
    // 리셋: 획 영역 0, slots SLOT_NONE, 획 풀 clear.
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.poolCursor)).toBe(0);
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.dabOverflow)).toBe(0);
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.slots + 4 * 7)).toBe(SLOT_NONE);
    expect(gpu.clears.some((c) => c.target === "sumi-stroke-pool")).toBe(true);
    expect(runtime.runtimeState).toBe("ready");
    expect(() => runtime.submitBatch(batchOf(1))).toThrow(InvalidStateError);
  });

  it("습식 획은 endStroke에서 습식 층을 문서에 굽지 않는다(bake_wet·flatten_oil 없음) — 지속 레이어 계약", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(wetProgram(), 1);
    runtime.submitBatch(batchFrom([wetDab(10, 10)]));
    gpu.setU32("sumi-table", TABLE_OFFSETS.wetActiveCount, 2);
    const before = gpu.dispatches.length;
    await runtime.endStroke();
    const names = gpu.dispatches.slice(before).map((d) => d.entryPoint);
    expect(names).not.toContain(ENTRY_POINTS.bakeWet);
    expect(names).not.toContain(ENTRY_POINTS.flattenOil);
    // 습식 층 플래그가 서 있다: 표시 합성이 수채 층을 문서 위에 합성한다.
    expect(paramU32(gpu, "wet_water_layer")).toBe(1);
    expect(paramU32(gpu, "wet_oil_layer")).toBe(0);
  });

  it("수채: bake_stroke → 정착 루프(청크 = 16프레임 × substeps × 서브스텝 + 프레임 끝 검사) → composite_all, wet_settle_done이 서면 멈춘다", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(wetProgram(), 1);
    runtime.submitBatch(batchFrom([wetDab(10, 10), wetDab(12, 11)]));
    const before = gpu.dispatches.length;
    const submitsBefore = gpu.submits;
    gpu.setU32("sumi-table", TABLE_OFFSETS.wetActiveCount, 3);
    // GPU가 첫 청크 안에서 wet_settle_done을 세웠다고 주입한다.
    forceSettleDone(gpu);
    const receipt = await runtime.endStroke();
    const tail = gpu.dispatches.slice(before);
    // bake_stroke 1 + 청크(wet_commit 1 + 16 × (2 × 5 + 1)) + composite_all 1.
    expect(tail.length).toBe(1 + (1 + WET_DRY_CHUNK_FRAMES * (2 * 5 + 1)) + 1);
    expect(tail[0]?.entryPoint).toBe(ENTRY_POINTS.bakeStroke);
    expect(tail[tail.length - 1]?.entryPoint).toBe(ENTRY_POINTS.compositeAll);
    expect(tail.filter((d) => d.entryPoint === ENTRY_POINTS.wetSettleCheck).length).toBe(WET_DRY_CHUNK_FRAMES);
    expect(gpu.submits - submitsBefore).toBe(3);
    expect(receipt.dryFrames).toBe(WET_DRY_CHUNK_FRAMES);
    expect(receipt.wetTilesAllocated).toBe(3);
    // 정착 모드 파라미터: 청크 앞에서 wet_settle = 1, 마지막 합성 전에 0.
    expect(paramU32(gpu, "wet_settle")).toBe(0);
    // 습식 영역(할당 목록)은 유지된다.
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.wetActiveCount)).toBe(3);
  });

  it("수채: wet_settle_done이 서지 않으면 상한(WET_DRY_STEPS_MAX = 240 프레임)까지 돈다", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(wetProgram(), 1);
    runtime.submitBatch(batchFrom([wetDab(10, 10)]));
    const receipt = await runtime.endStroke();
    expect(receipt.dryFrames).toBe(WET_DRY_STEPS_MAX);
    expect(gpu.dispatches.filter((d) => d.entryPoint === ENTRY_POINTS.wetSettleCheck).length).toBe(WET_DRY_STEPS_MAX);
  });

  it("유화: 정착 루프는 oil_snapshot·oil_level·oil_dry·wet_commit 서브스텝을 상한 WET_OIL_SETTLE_FRAMES = 48 프레임까지 돈다", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(impastoProgram(), 1);
    runtime.submitBatch(batchFrom([oilDab(20, 20)]));
    const before = gpu.dispatches.length;
    const receipt = await runtime.endStroke();
    expect(receipt.dryFrames).toBe(WET_OIL_SETTLE_FRAMES);
    const tail = gpu.dispatches.slice(before).map((d) => d.entryPoint);
    expect(tail.filter((e) => e === ENTRY_POINTS.oilLevel).length).toBe(WET_OIL_SETTLE_FRAMES);
    expect(tail.filter((e) => e === ENTRY_POINTS.oilDry).length).toBe(WET_OIL_SETTLE_FRAMES);
    expect(tail).not.toContain(ENTRY_POINTS.wetStepWater);
    expect(paramU32(gpu, "wet_oil_layer")).toBe(1);
  });

  it("풀·refs·습식 초과는 상태를 리셋한 뒤 StrokeBudgetExceededError로 던진다", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(dryProgram(), 1);
    runtime.submitBatch(batchOf(1));
    gpu.setU32("sumi-table", TABLE_OFFSETS.poolOverflow, 4);
    const err = await runtime.endStroke().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StrokeBudgetExceededError);
    expect((err as StrokeBudgetExceededError).details).toMatchObject({ stage: "stroke-pool" });
    expect(runtime.runtimeState).toBe("ready");
    runtime.beginStroke(dryProgram(), 2);
    runtime.submitBatch(batchOf(1));
    gpu.setU32("sumi-table", TABLE_OFFSETS.refsOverflow, 100);
    await expect(runtime.endStroke()).rejects.toMatchObject({ details: { stage: "refs" } });
  });

  it("습식 풀 용량 초과(wet_overflow)는 endStroke가 StrokeBudgetExceededError(wet-pool)로 드러낸다", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(wetProgram(), 1);
    runtime.submitBatch(batchFrom([wetDab(10, 10)]));
    forceSettleDone(gpu);
    gpu.setU32("sumi-table", TABLE_OFFSETS.wetOverflow, 3);
    await expect(runtime.endStroke()).rejects.toMatchObject({ details: { stage: "wet-pool" } });
  });

  it("습식 풀 초과(wet_overflow)는 그 획에서만 드러난다: 카운터를 0으로 되돌려 다음 획(건식 포함)은 성공한다", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(wetProgram(), 1);
    runtime.submitBatch(batchFrom([wetDab(10, 10)]));
    forceSettleDone(gpu);
    gpu.setU32("sumi-table", TABLE_OFFSETS.wetOverflow, 3);
    await expect(runtime.endStroke()).rejects.toMatchObject({ details: { stage: "wet-pool" } });
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.wetOverflow)).toBe(0);
    expect(runtime.runtimeState).toBe("ready");
    // 다음 획: 초과 계수가 남아 있으면 이 건식 획도 wet-pool로 영구히 실패한다.
    runtime.beginStroke(dryProgram(), 2);
    runtime.submitBatch(batchOf(1));
    const receipt = await runtime.endStroke();
    expect(receipt.wetOverflow).toBe(0);
  });

  it("device.lost 해소 뒤 호출은 LaneUnavailableError(device-lost)", async () => {
    const { gpu, runtime } = await createRuntime();
    gpu.loseDevice("unknown", "gone");
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.runtimeState).toBe("device-lost");
    expect(() => runtime.beginStroke(dryProgram(), 1)).toThrow(LaneUnavailableError);
    try {
      runtime.beginStroke(dryProgram(), 1);
    } catch (e) {
      expect((e as LaneUnavailableError).code).toBe("device-lost");
    }
  });
});

describe("SumiComputeRuntime 습식 층 평탄화(다른 매체 획이 시작될 때만 굽는다)", () => {
  /** 한 획을 끝까지 돌린다(정착 상한을 줄이려고 settle_done을 주입). */
  async function finishStroke(gpu: ReturnType<typeof createMockGpu>, runtime: SumiComputeRuntime): Promise<void> {
    forceSettleDone(gpu);
    await runtime.endStroke();
  }

  it("같은 종류의 습식 획이 이어지면 굽지 않고, 수채 층이 있는데 건식 획이 시작되면 정착(240프레임) → bake_wet → composite_all로 굽는다", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(wetProgram(), 1);
    runtime.submitBatch(batchFrom([wetDab(10, 10)]));
    await finishStroke(gpu, runtime);
    // 같은 종류: flatten 없음.
    const before = gpu.dispatches.length;
    runtime.beginStroke(wetProgram(), 2);
    expect(gpu.dispatches.length).toBe(before);
    runtime.submitBatch(batchFrom([wetDab(12, 12)]));
    await finishStroke(gpu, runtime);
    // 건식 획 시작: 평탄화.
    const flattenFrom = gpu.dispatches.length;
    runtime.beginStroke(dryProgram(), 3);
    const flatten = gpu.dispatches.slice(flattenFrom);
    // wet_commit 1 + 240 × (2 × 5 + 1) + bake_wet 1 + composite_all 1.
    expect(flatten.length).toBe(1 + WET_DRY_STEPS_MAX * (2 * 5 + 1) + 2);
    expect(flatten[flatten.length - 2]).toMatchObject({ entryPoint: ENTRY_POINTS.bakeWet, kind: "indirect", indirectOffset: INDIRECT_OFFSETS.wet });
    expect(flatten[flatten.length - 1]?.entryPoint).toBe(ENTRY_POINTS.compositeAll);
    expect(flatten.some((d) => d.entryPoint === ENTRY_POINTS.flattenOil)).toBe(false);
    // 평탄화 뒤 습식 층 플래그가 꺼진다.
    runtime.submitBatch(batchOf(2));
    expect(paramU32(gpu, "wet_water_layer")).toBe(0);
    expect(paramU32(gpu, "wet_oil_layer")).toBe(0);
  });

  it("수채 층 → 유화 획: 수채를 굽고(bake_wet) 유화 층이 시작된다; 유화 층 → 건식 획: flatten_oil만 낸다(정착 없음)", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(wetProgram(), 1);
    runtime.submitBatch(batchFrom([wetDab(10, 10)]));
    await finishStroke(gpu, runtime);
    let from = gpu.dispatches.length;
    runtime.beginStroke(impastoProgram(), 2);
    let names = gpu.dispatches.slice(from).map((d) => d.entryPoint);
    expect(names).toContain(ENTRY_POINTS.bakeWet);
    expect(names).not.toContain(ENTRY_POINTS.flattenOil);
    runtime.submitBatch(batchFrom([oilDab(20, 20)]));
    await finishStroke(gpu, runtime);
    expect(paramU32(gpu, "wet_oil_layer")).toBe(1);
    expect(paramU32(gpu, "wet_water_layer")).toBe(0);
    from = gpu.dispatches.length;
    runtime.beginStroke(dryProgram(), 3);
    names = gpu.dispatches.slice(from).map((d) => d.entryPoint);
    expect(names).toEqual([ENTRY_POINTS.flattenOil, ENTRY_POINTS.compositeAll]);
    expect(gpu.dispatches.slice(from)[0]).toMatchObject({ kind: "indirect", indirectOffset: INDIRECT_OFFSETS.wet, layoutLabel: "sumi-wpl-flatten" });
  });

  it("평탄화 제출은 마지막 습식 획의 Params(KM 혼색·정착 모드)로 돈다", async () => {
    const { gpu, runtime } = await createRuntime();
    const km = normalizeProgram({
      id: "t-km",
      name: "km",
      family: "watercolor",
      description: "",
      deposition: { model: "wet-flow" },
      colorDynamics: { kmMixing: true },
      wet: { substeps: 2 },
    });
    runtime.beginStroke(km, 1);
    runtime.submitBatch(batchFrom([wetDab(10, 10)]));
    await finishStroke(gpu, runtime);
    expect(paramU32(gpu, "wet_render_km")).toBe(1);
    runtime.beginStroke(dryProgram(), 2);
    // 평탄화는 beginStroke가 쓴 Params 위에서 이뤄진다: 마지막 습식 획의 km 래치가 유지된다.
    expect(paramU32(gpu, "wet_render_km")).toBe(1);
    expect(paramU32(gpu, "wet_settle")).toBe(1);
  });

  it("습식 층이 없으면 flattenWet은 아무것도 내지 않고 획 도중 호출은 InvalidStateError", async () => {
    const { gpu, runtime } = await createRuntime();
    const before = gpu.dispatches.length;
    runtime.flattenWet();
    expect(gpu.dispatches.length).toBe(before);
    runtime.beginStroke(wetProgram(), 1);
    expect(() => runtime.flattenWet()).toThrow(InvalidStateError);
  });
});

describe("SumiComputeRuntime readback", () => {
  it("readbackImage는 present 텍스처를 256 정렬 스테이징으로 복사해 LabImage로 푼다", async () => {
    const { gpu, runtime } = await createRuntime({ width: 70, height: 2 });
    const tex = gpu.textureByLabel("sumi-present");
    tex.data = new Uint8Array(70 * 2 * 4);
    tex.data[0] = 255;
    tex.data[70 * 4 + 3] = 128;
    const img = await runtime.readbackImage();
    expect(img.width).toBe(70);
    expect(img.height).toBe(2);
    expect(img.data[0]).toBe(255);
    expect(img.data[70 * 4 + 3]).toBe(128);
    expect(gpu.textureCopies[0]).toMatchObject({ from: "sumi-present", to: "sumi-staging", bytesPerRow: 512 });
    expect(gpu.calls.filter((c) => c === "buffer.unmap").length).toBeGreaterThan(0);
  });

  it("readbackLinear는 GPU 표시 합성(composite_linear)을 선형 표시 버퍼에 쓰고 그 버퍼를 복사해 읽는다(첫 호출에서 지연 생성)", async () => {
    const { gpu, runtime } = await createRuntime({ width: 4, height: 4 });
    expect(() => gpu.bufferByLabel("sumi-display-linear")).toThrow();
    const before = gpu.dispatches.length;
    const copiesBefore = gpu.copies.length;
    // 모의 장치는 GPU 연산을 하지 않으므로 복사 뒤 스테이징에 값을 주입해 map 경로를 확인한다.
    const pending = runtime.readbackLinear();
    new Float32Array(gpu.bufferByLabel("sumi-staging").data)[5] = 0.5;
    const linear = await pending;
    const disp = gpu.dispatches.slice(before);
    expect(disp.map((d) => `${d.entryPoint}:${d.kind}`)).toEqual([`${ENTRY_POINTS.compositeLinear}:direct`]);
    expect(disp[0]).toMatchObject({ x: 1, y: 1, layoutLabel: "sumi-wpl-compositeLinear" });
    expect(gpu.copies.slice(copiesBefore)).toEqual([{ from: "sumi-display-linear", to: "sumi-staging", size: 4 * 4 * 16 }]);
    expect(linear.length).toBe(4 * 4 * 4);
    expect(linear[5]).toBe(0.5);
    // 두 번째 호출은 표시 버퍼를 다시 만들지 않는다.
    const buffers = gpu.buffers.length;
    await runtime.readbackLinear();
    expect(gpu.buffers.length).toBe(buffers);
  });

  it("readbackHeightMap은 헤더 → 슬롯 표 → 코어 풀(1벌) 사용 구간 순으로 읽는다", async () => {
    const width = 32;
    const height = 32;
    const { gpu, runtime } = await createRuntime({ width, height });
    runtime.beginStroke(impastoProgram(), 1);
    runtime.submitBatch(batchFrom([oilDab(16, 16)]));
    // 모의 장치에 습식 슬롯 1개(타일 0 → 슬롯 0)와 기울어진 높이를 심는다.
    const tiles = 2 * 2;
    gpu.setU32("sumi-table", TABLE_OFFSETS.wetCursor, 1);
    for (let t = 0; t < tiles; t += 1) gpu.setU32("sumi-table", TABLE_OFFSETS.wetSlots + t * 4, t === 0 ? 0 : SLOT_NONE);
    const pool = new Float32Array(gpu.bufferByLabel("sumi-wet-pool").data);
    for (let i = 0; i < 256; i += 1) pool[7 * 256 + i] = (i % 16) * 0.05 + 0.01;
    const before = gpu.copies.length;
    const heightMap = await runtime.readbackHeightMap();
    expect(gpu.copies.slice(before)).toEqual([
      { from: "sumi-table", to: "sumi-table-staging", size: TABLE_OFFSETS.header },
      { from: "sumi-table", to: "sumi-staging", size: tiles * 4 },
      { from: "sumi-wet-pool", to: "sumi-staging", size: WET_FLOATS_PER_TILE * 4 },
    ]);
    expect(heightMap[0]).toBeCloseTo(0.01, 6);
    expect(heightMap[5]).toBeCloseTo(0.26, 6);
    expect(heightMap[20 * width + 20]).toBe(0);
  });
});

describe("SumiComputeRuntime 습식 상태 단일 서브스텝 패리티 보조(프로브 전용)", () => {
  it("loadWetState는 슬롯·활성 표식·활성 목록·커서와 코어·확장 풀 값을 같은 슬롯 번호로 올린다", async () => {
    const { gpu, runtime } = await createRuntime({ width: 32, height: 32 });
    runtime.beginStroke(wetProgram(), 1);
    const core = new Float32Array(WET_FLOATS_PER_TILE).fill(0.25);
    const ext = new Float32Array(WET_EXT_FLOATS_PER_TILE).fill(0.5);
    runtime.loadWetState([
      { tile: 3, core, ext, live: true },
      { tile: 0, core, ext, live: false },
    ]);
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.wetSlots + 3 * 4)).toBe(0);
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.wetSlots + 0 * 4)).toBe(1);
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.wetSlots + 1 * 4)).toBe(SLOT_NONE);
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.wetLive + 3 * 4)).toBe(1);
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.wetLive + 0)).toBe(0);
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.wetLiveNext + 3 * 4)).toBe(1);
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.wetActiveTiles)).toBe(3);
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.wetCursor)).toBe(2);
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.wetActiveCount)).toBe(2);
    expect(new Float32Array(gpu.bufferByLabel("sumi-wet-pool").data)[WET_FLOATS_PER_TILE]).toBe(0.25);
    expect(new Float32Array(gpu.bufferByLabel("sumi-wet-ext").data)[WET_EXT_FLOATS_PER_TILE]).toBe(0.5);
    expect(() => runtime.loadWetState([{ tile: 0, core: new Float32Array(3), ext, live: true }])).toThrow(RangeError);
    const over = Array.from({ length: runtime.budget.wetCapacityTiles + 1 }, (_, i) => ({ tile: i % 4, core, ext, live: true }));
    expect(() => runtime.loadWetState(over)).toThrow(StrokeBudgetExceededError);
  });

  it("loadWetPaper는 임의의 f32 종이를 paper_wet에 올리고 같은 프로그램 종이를 다음 획에서 다시 올리게 한다(256² 아니면 RangeError)", async () => {
    const { gpu, runtime } = await createRuntime({ width: 32, height: 32 });
    const program = normalizeProgram({ id: "t-wet-paper", name: "wet", family: "watercolor", description: "", deposition: { model: "wet-flow" }, wet: { substeps: 1 }, paper: { enabled: true } });
    runtime.beginStroke(program, 1);
    const paperWetWrites = (): number => gpu.writes.filter((w) => w.target === "sumi-paper-wet").length;
    const afterBegin = paperWetWrites();
    const n = 256 * 256;
    const field = { size: 256, direction: new Float32Array(n).fill(0.75), bump: new Float32Array(n).fill(0.25), absorb: new Float32Array(n).fill(0.5) };
    runtime.loadWetPaper(field);
    expect(paperWetWrites()).toBe(afterBegin + 1);
    const data = new Float32Array(gpu.bufferByLabel("sumi-paper-wet").data);
    expect([data[0], data[1], data[2]]).toEqual([0.25, 0.5, 0.75]);
    expect(() => runtime.loadWetPaper({ size: 64, direction: new Float32Array(64 * 64), bump: new Float32Array(64 * 64), absorb: new Float32Array(64 * 64) })).toThrow(RangeError);
    // 키 캐시가 무효화되어, 같은 프로그램의 다음 획이 자기 종이를 다시 올린다.
    runtime.submitBatch(batchFrom([wetDab(10, 10)]));
    await runtime.endStroke();
    runtime.beginStroke(program, 2);
    expect(paperWetWrites()).toBe(afterBegin + 2);
  });

  it("stepWetFrames는 프레임마다 wet_commit + substeps × 서브스텝을 낸다", async () => {
    const { gpu, runtime } = await createRuntime({ width: 32, height: 32 });
    runtime.beginStroke(wetProgram(), 1);
    const before = gpu.dispatches.length;
    runtime.stepWetFrames(3);
    const names = gpu.dispatches.slice(before).map((d) => d.entryPoint);
    expect(names.length).toBe(3 * (1 + 2 * 5));
    expect(names.filter((n) => n === ENTRY_POINTS.wetStepWater).length).toBe(6);
    expect(names).not.toContain(ENTRY_POINTS.compositeDirty);
  });

  it("readbackWetState는 슬롯 순서대로 코어·확장 풀과 활성 표식을 타일별로 돌려준다", async () => {
    const { gpu, runtime } = await createRuntime({ width: 32, height: 32 });
    runtime.beginStroke(wetProgram(), 1);
    const core = new Float32Array(WET_FLOATS_PER_TILE).fill(0.125);
    const ext = new Float32Array(WET_EXT_FLOATS_PER_TILE).fill(0.375);
    runtime.loadWetState([{ tile: 2, core, ext, live: true }]);
    const state = await runtime.readbackWetState();
    expect(state.tiles.length).toBe(1);
    expect(state.tiles[0]).toMatchObject({ tile: 2, live: true });
    expect(state.tiles[0]?.core[0]).toBe(0.125);
    expect(state.tiles[0]?.ext[0]).toBe(0.375);
    expect(state.header.wetCursor).toBe(1);
    expect(gpu.copies.some((c) => c.from === "sumi-wet-ext")).toBe(true);
  });
});
