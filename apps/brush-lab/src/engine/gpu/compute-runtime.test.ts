import { describe, expect, it } from "vitest";

import { DabBatch } from "../core/dab-layout";
import { InvalidStateError, LaneUnavailableError, StrokeBudgetExceededError, WgslCompileError } from "../core/errors";
import { presetById } from "../presets/catalog";
import { normalizeProgram } from "../presets/program-schema";
import { smudgePickupPerDab } from "../raster/fine-raster";
import { binDabs } from "../raster/tile-binning";
import { loadEmbeddedKernel } from "../wasm/embedded";
import { SumiKernelSession } from "../wasm/kernel-session";
import { WET_CH } from "../wet/state";

import { computeBudget, initialTableBytes } from "./buffers";
import {
  BINS_OFFSETS,
  COMPUTE_ENTRY_ORDER,
  ENTRY_POINTS,
  GROUP2_ENTRIES,
  IMPASTO_ENTRIES,
  IMPASTO_RECORD_BYTES,
  INDIRECT_OFFSETS,
  INDIRECT_WRITER_ENTRIES,
  MAX_DABS_PER_BATCH,
  MAX_TILES_PER_DAB,
  PARAMS_SCALARS,
  SMUDGE_STATE_BYTES,
  SLOT_NONE,
  TABLE_OFFSETS,
  TIP_ATLAS_LEVELS,
  WET_FLOATS_PER_TILE,
} from "./layout";
import {
  buildTipAtlasLevels,
  buildTipChainsForProgram,
  encodePaperTexture,
  paramsForProgram,
  SumiComputeRuntime,
  WET_DRY_CHUNK_FRAMES,
} from "./pipeline-compute";
import { applyReliefLighting, heightMapFromWetPool } from "./relief-readback";
import { createMockCanvas, createMockGpu } from "./testing/mock-gpu-device";

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

describe("SumiComputeRuntime.create", () => {
  it("셰이더 7모듈·compute 파이프라인 16개를 COMPUTE_ENTRY_ORDER 순서로 만들고 group 0·1을 공유하며 group 2는 인자 쓰기·임파스토 파이프라인만 쓴다", async () => {
    const { gpu, runtime } = await createRuntime();
    expect(gpu.shaderModules.map((m) => m.label)).toEqual([
      "sumi-bin-count",
      "sumi-bin-scan",
      "sumi-bin-scatter",
      "sumi-fine-raster",
      "sumi-wet-step",
      "sumi-composite",
      "sumi-impasto",
    ]);
    const compute = gpu.pipelines.filter((p) => p.kind === "compute");
    expect(compute.map((p) => p.entryPoint)).toEqual(COMPUTE_ENTRY_ORDER.map((e) => ENTRY_POINTS[e]));
    expect(compute.every((p) => p.async)).toBe(true);
    expect(gpu.bindGroupLayouts.map((l) => l.label)).toEqual(["sumi-bgl-0", "sumi-bgl-1", "sumi-bgl-2"]);
    expect(gpu.bindGroups.map((b) => b.entries)).toEqual([5, 7, 2]);
    // 간접 인자 버퍼는 INDIRECT와 쓰기 storage를 한 dispatch에서 겸할 수 없으므로 그것을 쓰는 파이프라인(+임파스토)의 레이아웃에만 들어간다.
    const group2Entries = new Set(GROUP2_ENTRIES.map((e) => ENTRY_POINTS[e]));
    expect([...group2Entries].sort()).toEqual([...INDIRECT_WRITER_ENTRIES, ...IMPASTO_ENTRIES].map((e) => ENTRY_POINTS[e]).sort());
    for (const p of compute) {
      const uses = group2Entries.has(p.entryPoint as never);
      expect(p.layoutLabel, p.entryPoint).toBe(uses ? "sumi-pipeline-layout-group2" : "sumi-pipeline-layout");
    }
    expect(gpu.bufferByLabel("sumi-indirect").usage & 0x0100).toBe(0x0100);
    expect(gpu.bufferByLabel("sumi-table").usage & 0x0100).toBe(0);
    // 초기 present: composite_all 1회 디스패치 + submit 1회.
    expect(gpu.dispatches.map((d) => d.entryPoint)).toEqual([ENTRY_POINTS.compositeAll]);
    expect(gpu.submits).toBe(1);
    expect(runtime.runtimeState).toBe("ready");
    runtime.dispose();
    expect(runtime.runtimeState).toBe("disposed");
    expect(gpu.calls.filter((c) => c === "buffer.destroy").length).toBeGreaterThanOrEqual(10);
  });

  it("초기 TileTable은 slots·wet_slots가 SLOT_NONE이고 나머지는 0", async () => {
    const bytes = new Uint32Array(initialTableBytes());
    expect(bytes[TABLE_OFFSETS.slots / 4]).toBe(SLOT_NONE);
    expect(bytes[TABLE_OFFSETS.wetSlots / 4 + 5]).toBe(SLOT_NONE);
    expect(bytes[TABLE_OFFSETS.dirtyTiles / 4]).toBe(0);
    expect(bytes[TABLE_OFFSETS.poolCursor / 4]).toBe(0);
    const { gpu } = await createRuntime();
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.slots)).toBe(SLOT_NONE);
  });

  it("getCompilationInfo 오류 주입 → WgslCompileError, 자원은 해제된다", async () => {
    const gpu = createMockGpu({ compilationMessages: { "sumi-bin-scan": [{ type: "error", message: "bad", lineNum: 3 }] } });
    const err = await SumiComputeRuntime.create(gpu.device, { width: 32, height: 32, seed: 1, features: new Set(), clock: null }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WgslCompileError);
    expect((err as WgslCompileError).shaderId).toBe("sumi-bin-scan");
    expect(gpu.calls.filter((c) => c === "buffer.destroy").length).toBeGreaterThanOrEqual(10);
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
  });

  it("런타임 create가 예산 초과를 던진다", async () => {
    const gpu = createMockGpu({ limits: { maxStorageBufferBindingSize: 1024 } });
    await expect(SumiComputeRuntime.create(gpu.device, { width: 64, height: 64, seed: 1, features: new Set(), clock: null })).rejects.toBeInstanceOf(
      StrokeBudgetExceededError,
    );
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

  it("paramsForProgram은 CPU 참조와 같은 습식 활성 규칙을 쓴다", () => {
    const cfg = { tilesX: 4, tilesY: 3, width: 64, height: 48, strokeCapacity: 12, wetCapacity: 12, seed: 5 };
    expect(paramsForProgram(dryProgram(), cfg)).toMatchObject({ wet_enabled: 0, impasto_enabled: 0, tile_count: 12, paper_enabled: 1 });
    expect(paramsForProgram(wetProgram(), cfg)).toMatchObject({ wet_enabled: 1, impasto_enabled: 0, substep_dt_ms: 1000 / 60 / 2 });
    expect(paramsForProgram(impastoProgram(), cfg)).toMatchObject({ wet_enabled: 1, impasto_enabled: 1 });
    const noWet = normalizeProgram({ id: "x", name: "x", family: "oil", description: "", deposition: { model: "impasto" } });
    expect(noWet.wet).toBeNull();
    expect(paramsForProgram(noWet, cfg).wet_enabled).toBe(0);
  });
});

describe("SumiComputeRuntime.submitBatch", () => {
  it("배치 1회 = encoder 1·compute pass 1·submit 1, 디스패치 8회(직접 5·간접 3), writeBuffer(dabs) = dabs×64", async () => {
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
    expect(final.submitCount).toBe(3);
  });

  it("습식 프로그램은 substeps × (wet_step·wet_expand·wet_commit)을 fine raster 뒤·composite 앞에 넣는다", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(wetProgram(), 1);
    const before = gpu.dispatches.length;
    const receipt = runtime.submitBatch(batchOf(3));
    const frame = gpu.dispatches.slice(before).map((d) => d.entryPoint);
    expect(frame.slice(7, 13)).toEqual([
      ENTRY_POINTS.wetStep,
      ENTRY_POINTS.wetExpand,
      ENTRY_POINTS.wetCommit,
      ENTRY_POINTS.wetStep,
      ENTRY_POINTS.wetExpand,
      ENTRY_POINTS.wetCommit,
    ]);
    expect(frame[13]).toBe(ENTRY_POINTS.compositeDirty);
    expect(receipt.dispatchCount).toBe(14);
    const wetIndirect = gpu.dispatches.slice(before).filter((d) => d.entryPoint === ENTRY_POINTS.wetStep);
    expect(wetIndirect.every((d) => d.kind === "indirect" && d.indirectBuffer === "sumi-indirect" && d.indirectOffset === INDIRECT_OFFSETS.wet)).toBe(true);
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

describe("SumiComputeRuntime 임파스토 dab 패스(밀기 + 침착)", () => {
  const impastoDab = (x: number, y: number, angle = 0): DabInstance => ({ ...dab(x, y), impasto: true, deposition: "impasto", angle, pigmentMass: 0.5 });

  function impastoBatch(dabs: DabInstance[]): DabBatch {
    const b = new DabBatch(Math.max(1, dabs.length));
    for (const d of dabs) b.push(d);
    return b;
  }

  it("임파스토 dab마다 impasto_move → impasto_apply를 dab 순서로 내고 레코드마다 256 B 동적 오프셋을 쓴다(프레임 3 pass)", async () => {
    const { gpu, runtime } = await createRuntime({ features: ["timestamp-query"] });
    runtime.beginStroke(impastoProgram(), 1);
    const before = gpu.dispatches.length;
    const passesBefore = gpu.computePasses.length;
    // dab 0·2는 임파스토, 1은 일반 dab(건너뛴다), 3은 캔버스 바깥(타일 범위 없음 → 건너뛴다).
    const batch = impastoBatch([impastoDab(20, 20), dab(30, 30), impastoDab(40, 22, Math.PI / 2), impastoDab(-5000, 5)]);
    const receipt = runtime.submitBatch(batch);
    const frame = gpu.dispatches.slice(before);
    const names = frame.map((d) => d.entryPoint);
    const rasterAt = names.indexOf(ENTRY_POINTS.fineRaster);
    expect(names.slice(rasterAt + 1, rasterAt + 5)).toEqual([
      ENTRY_POINTS.impastoMove,
      ENTRY_POINTS.impastoApply,
      ENTRY_POINTS.impastoMove,
      ENTRY_POINTS.impastoApply,
    ]);
    // 레코드 k의 동적 오프셋 = k·256, group 2(간접 인자 + 레코드).
    const impastoDispatches = frame.filter((d) => d.entryPoint === ENTRY_POINTS.impastoMove || d.entryPoint === ENTRY_POINTS.impastoApply);
    expect(impastoDispatches.map((d) => d.groupOffsets[2])).toEqual([[0], [0], [IMPASTO_RECORD_BYTES], [IMPASTO_RECORD_BYTES]]);
    expect(names[names.length - 1]).toBe(ENTRY_POINTS.compositeDirty);
    // 3 pass: 래스터까지 | 임파스토 | 합성. 타임스탬프는 첫 pass 시작·마지막 pass 끝.
    const passes = gpu.computePasses.slice(passesBefore);
    expect(passes).toEqual([{ timestampWrites: true }, { timestampWrites: false }, { timestampWrites: true }]);
    expect(new Set(frame.map((d) => d.pass)).size).toBe(3);
    expect(receipt.dispatchCount).toBe(frame.length);
    expect(gpu.writes.filter((w) => w.target === "sumi-impasto-records")).toEqual([{ target: "sumi-impasto-records", offset: 0, size: 2 * IMPASTO_RECORD_BYTES }]);
    // 레코드 내용(창·방향·밀기 비율): 첫 dab = 오른쪽(+x) 진행, 둘째 dab(angle π/2) = 아래(+y) 진행.
    const rec = (k: number): Record<string, number> => {
      const v = new DataView(gpu.bufferByLabel("sumi-impasto-records").data, k * IMPASTO_RECORD_BYTES);
      const names = ["dab_index", "win_x0", "win_y0", "win_x1", "win_y1", "reg_x0", "reg_y0", "reg_x1", "reg_y1", "step_x", "step_y"] as const;
      const out: Record<string, number> = {};
      names.forEach((n, i) => {
        out[n] = n === "dab_index" ? v.getUint32(i * 4, true) : v.getInt32(i * 4, true);
      });
      out.push = v.getFloat32(11 * 4, true);
      out.do_push = v.getUint32(12 * 4, true);
      return out;
    };
    // dab (20,20) r=4 hardness 0.8 → feather 1, extent 4 + 1 + 1 = 6 → 창 [14,26]².
    expect(rec(0)).toMatchObject({ dab_index: 0, win_x0: 14, win_y0: 14, win_x1: 26, win_y1: 26, step_x: 1, step_y: 0, do_push: 1 });
    expect(rec(0).push).toBeCloseTo(0.5 * (1 - 0.1), 6);
    // 진행 축(x)만 양쪽 1 px 확장한 밀기 영역.
    expect(rec(0)).toMatchObject({ reg_x0: 13, reg_x1: 27, reg_y0: 14, reg_y1: 26 });
    // dab (40,22) angle π/2 → 아래(+y) 진행: y만 확장.
    expect(rec(1)).toMatchObject({ dab_index: 2, win_x0: 34, win_x1: 46, win_y0: 16, win_y1: 28, step_x: 0, step_y: 1 });
    expect(rec(1)).toMatchObject({ reg_x0: 34, reg_x1: 46, reg_y0: 15, reg_y1: 29 });
  });

  it("임파스토 밀기 비율은 CPU applyImpastoDabs와 같은 oilDepth·(1 − viscosity)다(기본값이 아닌 oilDepth·점도에서도)", async () => {
    const cases: { oilDepth: number; viscosity: number; push: number; doPush: number }[] = [
      { oilDepth: 0.8, viscosity: 0.5, push: 0.4, doPush: 1 },
      { oilDepth: 0.2, viscosity: 0, push: 0.2, doPush: 1 },
      { oilDepth: 0.9, viscosity: 1, push: 0, doPush: 0 },
      { oilDepth: 0, viscosity: 0.3, push: 0, doPush: 0 },
    ];
    for (const c of cases) {
      const { gpu, runtime } = await createRuntime();
      const program = normalizeProgram({
        id: "t-oil-depth",
        name: "oil depth",
        family: "oil",
        description: "",
        deposition: { model: "impasto" },
        wet: { substeps: 1, oilDepth: c.oilDepth, viscosity: c.viscosity },
      });
      runtime.beginStroke(program, 1);
      runtime.submitBatch(impastoBatch([impastoDab(20, 20)]));
      const v = new DataView(gpu.bufferByLabel("sumi-impasto-records").data, 0);
      expect(v.getFloat32(11 * 4, true), JSON.stringify(c)).toBeCloseTo(c.push, 6);
      expect(v.getUint32(12 * 4, true), JSON.stringify(c)).toBe(c.doPush);
    }
  });

  it("임파스토 dab가 없는 프레임·임파스토가 아닌 프로그램은 단일 pass(레코드 업로드 없음)", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(impastoProgram(), 1);
    const passesBefore = gpu.computePasses.length;
    runtime.submitBatch(batchOf(5));
    expect(gpu.computePasses.length - passesBefore).toBe(1);
    expect(gpu.writes.filter((w) => w.target === "sumi-impasto-records")).toEqual([]);
    await runtime.endStroke();
    runtime.beginStroke(dryProgram(), 2);
    const before = gpu.dispatches.length;
    runtime.submitBatch(impastoBatch([impastoDab(20, 20)]));
    expect(gpu.dispatches.slice(before).some((d) => d.entryPoint === ENTRY_POINTS.impastoMove)).toBe(false);
  });

  it("한 프레임의 임파스토 dab가 레코드 상한을 넘으면 StrokeBudgetExceededError(fail-visible)", async () => {
    const { runtime } = await createRuntime();
    runtime.beginStroke(impastoProgram(), 1);
    const n = 4097;
    const batch = new DabBatch(n);
    for (let i = 0; i < n; i += 1) batch.push(impastoDab(10 + (i % 40), 10 + (i % 30)));
    expect(() => runtime.submitBatch(batch)).toThrow(StrokeBudgetExceededError);
  });

  it("임파스토가 올라간 뒤에는 has_height가 켜지고 다음 획(다른 프로그램)에서도 유지된다", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(impastoProgram(), 1);
    runtime.submitBatch(impastoBatch([impastoDab(20, 20)]));
    const paramsView = (): DataView => new DataView(gpu.bufferByLabel("sumi-params").data);
    const hasHeightIndex = PARAMS_SCALARS.findIndex(([n]) => n === "has_height");
    expect(paramsView().getUint32(hasHeightIndex * 4, true)).toBe(1);
    await runtime.endStroke();
    runtime.beginStroke(dryProgram(), 2);
    runtime.submitBatch(batchOf(3));
    expect(paramsView().getUint32(hasHeightIndex * 4, true)).toBe(1);
  });

  it("임파스토 뒤 readbackLinear는 헤더 → 슬롯 표 → 현재 parity 습식 풀 구간을 읽어 호스트 릴리프 조명을 적용한다", async () => {
    const width = 32;
    const height = 32;
    const { gpu, runtime } = await createRuntime({ width, height });
    // 임파스토가 없었다면 문서 그대로(복사 1회)다.
    const doc = new Float32Array(gpu.bufferByLabel("sumi-document").data);
    for (let i = 0; i < width * height; i += 1) doc.set([0.4, 0.3, 0.2, 0.8], i * 4);
    const plainBefore = gpu.copies.length;
    const plain = await runtime.readbackLinear();
    expect(gpu.copies.length - plainBefore).toBe(1);
    expect(Array.from(plain)).toEqual(Array.from(doc));

    runtime.beginStroke(impastoProgram(), 1);
    runtime.submitBatch(impastoBatch([impastoDab(16, 16)]));
    // 모의 장치에 습식 슬롯 1개(타일 0 → 슬롯 0)와 기울어진 높이를 심는다(parity 1 절반에 둔다).
    const tiles = 2 * 2;
    const budget = computeBudget({ width, height, limits: {} });
    const parityOffsetFloats = budget.wetCapacityTiles * WET_FLOATS_PER_TILE;
    gpu.setU32("sumi-table", TABLE_OFFSETS.wetCursor, 1);
    gpu.setU32("sumi-table", TABLE_OFFSETS.wetParity, 1);
    for (let t = 0; t < tiles; t += 1) gpu.setU32("sumi-table", TABLE_OFFSETS.wetSlots + t * 4, t === 0 ? 0 : SLOT_NONE);
    const pool = new Float32Array(gpu.bufferByLabel("sumi-wet-pool").data);
    for (let i = 0; i < 256; i += 1) pool[parityOffsetFloats + WET_CH.height * 256 + i] = (i % 16) * 0.05 + 0.01;

    const before = gpu.copies.length;
    const linear = await runtime.readbackLinear();
    const copies = gpu.copies.slice(before);
    expect(copies).toEqual([
      { from: "sumi-document", to: "sumi-staging", size: width * height * 16 },
      { from: "sumi-table", to: "sumi-table-staging", size: TABLE_OFFSETS.header },
      { from: "sumi-table", to: "sumi-staging", size: tiles * 4 },
      { from: "sumi-wet-pool", to: "sumi-staging", size: WET_FLOATS_PER_TILE * 4 },
    ]);
    const slots = new Uint32Array(tiles).fill(SLOT_NONE);
    slots[0] = 0;
    const heightMap = heightMapFromWetPool(slots, pool.subarray(parityOffsetFloats, parityOffsetFloats + WET_FLOATS_PER_TILE), 1, width, height, 2);
    expect(heightMap.some((v) => v > 0)).toBe(true);
    const expected = applyReliefLighting(doc, heightMap, width);
    expect(Array.from(linear)).toEqual(Array.from(expected));
    expect(Array.from(linear)).not.toEqual(Array.from(doc));
    // 높이가 없는 타일(타일 1 이후)은 조명 없이 문서 그대로다.
    expect(Array.from(linear.subarray(20 * 4, 21 * 4))).toEqual([0.4, 0.3, 0.2, 0.8].map(Math.fround));
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
  it("bake_stroke(간접 stroke_indirect) → composite_all → 헤더 readback → 영수증, 획 상태 리셋", async () => {
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

  it("습식: 건조 루프는 wet_live_count가 0이면 멈추고 bake_wet을 넣는다", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(wetProgram(), 1);
    runtime.submitBatch(batchOf(2));
    const before = gpu.dispatches.length;
    const submitsBefore = gpu.submits;
    gpu.setU32("sumi-table", TABLE_OFFSETS.wetActiveCount, 3);
    const receipt = await runtime.endStroke();
    const tail = gpu.dispatches.slice(before);
    // 청크 1개 = 16 프레임 × substeps 2 × 3 디스패치 = 96, 그 뒤 bake_stroke·bake_wet·composite_all.
    expect(tail.length).toBe(WET_DRY_CHUNK_FRAMES * 2 * 3 + 3);
    expect(tail.slice(-3).map((d) => d.entryPoint)).toEqual([ENTRY_POINTS.bakeStroke, ENTRY_POINTS.bakeWet, ENTRY_POINTS.compositeAll]);
    expect(gpu.submits - submitsBefore).toBe(2);
    expect(receipt.dryFrames).toBe(WET_DRY_CHUNK_FRAMES);
    expect(receipt.wetTilesAllocated).toBe(3);
    // 습식 영역은 유지된다.
    expect(gpu.getU32("sumi-table", TABLE_OFFSETS.wetActiveCount)).toBe(3);
  });

  it("습식: live가 남아 있으면 상한(240 프레임)까지 돈다", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(wetProgram(), 1);
    runtime.submitBatch(batchOf(1));
    gpu.setU32("sumi-table", TABLE_OFFSETS.wetLiveCount, 1);
    const receipt = await runtime.endStroke();
    expect(receipt.dryFrames).toBe(240);
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

  it("readbackLinear는 문서 버퍼를 Float32Array로 돌려준다", async () => {
    const { gpu, runtime } = await createRuntime({ width: 4, height: 4 });
    const doc = gpu.bufferByLabel("sumi-document");
    new Float32Array(doc.data)[5] = 0.25;
    const linear = await runtime.readbackLinear();
    expect(linear.length).toBe(4 * 4 * 4);
    expect(linear[5]).toBe(0.25);
    expect(gpu.copies.some((c) => c.from === "sumi-document" && c.to === "sumi-staging" && c.size === 4 * 4 * 16)).toBe(true);
  });
});
