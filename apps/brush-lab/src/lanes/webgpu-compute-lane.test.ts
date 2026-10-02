import { describe, expect, it } from "vitest";

import { InvalidStateError, LaneUnavailableError, StrokeBudgetExceededError } from "../engine/core/errors";
import { ENTRY_POINTS, TABLE_OFFSETS } from "../engine/gpu/layout";
import { createMockAdapter, createMockGpu, createMockGpuApi } from "../engine/gpu/testing/mock-gpu-device";
import { presetById } from "../engine/presets/catalog";
import { splitFrames } from "../engine/raster/reference-renderer";
import { zigzagStroke } from "../engine/testing/synthetic-strokes";

import { createWebgpuComputeLane, WEBGPU_COMPUTE_LANE } from "./webgpu-compute-lane";

import type { LaneEnvironment } from "./lane";

function fakeEnv(gpu: GPU | null): LaneEnvironment {
  let t = 0;
  return {
    gpu,
    clock: {
      now: () => {
        t += 1;
        return t;
      },
    },
  };
}

describe("webgpu-compute 레인", () => {
  it("디스크립터는 레인 계약과 일치한다", () => {
    const lane = WEBGPU_COMPUTE_LANE.create();
    expect(WEBGPU_COMPUTE_LANE.id).toBe("webgpu-compute");
    expect(WEBGPU_COMPUTE_LANE.status).toBe("browser-verification-required");
    expect(lane.id).toBe(WEBGPU_COMPUTE_LANE.id);
    expect(lane.kind).toBe("candidate");
    expect(lane.engineVersion.length).toBeGreaterThan(0);
  });

  it("gpu 없음 → probe unavailable(webgpu-api-unavailable), init은 LaneUnavailableError(무음 대체 없음)", async () => {
    const lane = createWebgpuComputeLane();
    const env = fakeEnv(null);
    const report = await lane.probe(env);
    expect(report).toMatchObject({ laneId: "webgpu-compute", status: "unavailable", reasons: ["webgpu-api-unavailable"] });
    await expect(lane.init(env, { width: 64, height: 64, dpr: 1, tileSize: 16, seed: 1 })).rejects.toBeInstanceOf(LaneUnavailableError);
    await expect(lane.init(env, { width: 64, height: 64, dpr: 1, tileSize: 16, seed: 1 })).rejects.toMatchObject({ code: "webgpu-api-unavailable" });
    expect(() => lane.beginStroke(presetById("pencil-hb"), 1)).toThrow(InvalidStateError);
  });

  it("어댑터 없음 → adapter-unavailable", async () => {
    const lane = createWebgpuComputeLane();
    const report = await lane.probe(fakeEnv(createMockGpuApi(null)));
    expect(report.reasons).toEqual(["adapter-unavailable"]);
  });

  it("모의 장치로 fixture를 실행하면 stats.submits = 획의 queue.submit 수(프레임 + 꼬리 + endStroke), 영수증·readback이 나온다", async () => {
    const { adapter, gpu } = createMockAdapter({ info: { vendor: "mock", description: "SwiftShader" }, features: ["timestamp-query"] });
    const lane = createWebgpuComputeLane();
    const env = fakeEnv(createMockGpuApi(adapter));
    const report = await lane.probe(env);
    expect(report.status).toBe("supported");
    expect(report.softwareRenderer).toBe(true);
    expect(report.features).toContain("timestamp-query");
    await lane.init(env, { width: 96, height: 64, dpr: 1, tileSize: 16, seed: 3 });
    const program = presetById("ink-g-pen");
    lane.beginStroke(program, 3);
    const frames = splitFrames(zigzagStroke(64, { durationMs: 120 }));
    expect(frames.length).toBeGreaterThan(2);
    let dabs = 0;
    frames.forEach((frame, i) => {
      const r = lane.addSamples(frame);
      expect(r.frameIndex).toBe(i);
      expect(r.submitCount).toBe(1);
      expect(r.dispatchCount).toBe(8);
      expect(r.inputToSubmitMs).not.toBeNull();
      dabs += r.dabCount;
    });
    expect(dabs).toBeGreaterThan(0);
    gpu.setU32("sumi-table", TABLE_OFFSETS.poolCursor, 5);
    const receipt = await lane.endStroke();
    expect(lane.stats().submits).toBe(frames.length + 2);
    expect(lane.stats().strokes).toBe(1);
    expect(lane.stats().dabs).toBe(receipt.dabCount);
    expect(lane.strokeLatency().length).toBeGreaterThan(0);
    expect(receipt.dabCount).toBeGreaterThanOrEqual(dabs);
    expect(receipt.submitCount).toBe(frames.length + 2);
    expect(receipt.poolTilesUsed).toBe(5);
    expect(receipt.timingSource).toBe("timestamp-query");
    expect(receipt.frameTimesMs.length).toBe(frames.length + 1);
    expect(gpu.dispatches.filter((d) => d.entryPoint === ENTRY_POINTS.bakeStroke).length).toBe(1);
    const image = await lane.readback();
    expect(image).toMatchObject({ width: 96, height: 64 });
    expect(image.data.length).toBe(96 * 64 * 4);
    const linear = await lane.readbackLinear();
    expect(linear?.length).toBe(96 * 64 * 4);
    lane.dispose();
    expect(gpu.destroyed).toBe(true);
    expect(() => lane.stats()).not.toThrow();
    await expect(lane.readback()).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("습식 용량이 장치 storage 바인딩 한도를 넘으면 init이 StrokeBudgetExceededError(wetExt)로 거부한다(무음 축소 없음)", async () => {
    // 기본 모의 한도는 storage 바인딩 128 MiB. 2048² 캔버스에 습식 타일 6000개를 요구하면 확장 풀(23채널 ≈ 141 MB)이 한도를 넘는다.
    const { adapter } = createMockAdapter();
    const lane = createWebgpuComputeLane();
    const env = fakeEnv(createMockGpuApi(adapter));
    const err = await lane.init(env, { width: 2048, height: 2048, dpr: 1, tileSize: 16, seed: 1, wetCapacityTiles: 6000 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StrokeBudgetExceededError);
    expect((err as StrokeBudgetExceededError).details).toMatchObject({ buffer: "wetExt", wetCapacityTiles: 6000 });
  });

  it("습식 셰이더 컴파일 오류는 init에서 WgslCompileError로 드러난다(레인이 삼키지 않는다)", async () => {
    const gpu = createMockGpu({ compilationMessages: { "sumi-wet-water": [{ type: "error", message: "bad wet", lineNum: 4 }] } });
    const { adapter } = createMockAdapter({ gpu });
    const lane = createWebgpuComputeLane();
    const env = fakeEnv(createMockGpuApi(adapter));
    await expect(lane.init(env, { width: 32, height: 32, dpr: 1, tileSize: 16, seed: 1 })).rejects.toMatchObject({ shaderId: "sumi-wet-water" });
  });

  it("수채 획은 endStroke에서 물 스텝 정착 루프를 돌리되 문서에 굽지 않고(지속 레이어), 다음 건식 획이 시작될 때 한 번 굽는다", async () => {
    const { adapter, gpu } = createMockAdapter({ info: { vendor: "mock", description: "SwiftShader" } });
    const lane = createWebgpuComputeLane();
    const env = fakeEnv(createMockGpuApi(adapter));
    await lane.init(env, { width: 64, height: 64, dpr: 1, tileSize: 16, seed: 2 });
    lane.beginStroke(presetById("watercolor-wet"), 5);
    const frames = splitFrames(zigzagStroke(48, { durationMs: 100 }));
    for (const frame of frames) lane.addSamples(frame);
    const receipt = await lane.endStroke();
    const count = (name: string): number => gpu.dispatches.filter((d) => d.entryPoint === name).length;
    expect(count(ENTRY_POINTS.wetStepWater)).toBeGreaterThan(0);
    expect(count(ENTRY_POINTS.bakeWet)).toBe(0);
    // 정착 청크가 더해져 건식 획의 frames + 2보다 제출이 많고, 영수증과 stats가 같은 값을 보고한다.
    expect(receipt.submitCount).toBeGreaterThan(frames.length + 2);
    expect(lane.stats().submits).toBe(receipt.submitCount);
    lane.beginStroke(presetById("pencil-hb"), 6);
    expect(count(ENTRY_POINTS.bakeWet)).toBe(1);
    lane.dispose();
  });

  describe("장치 한도: 예산 검증은 어댑터 한도가 아니라 실제 장치 한도로 한다", () => {
    const GIB = 1024 ** 3;

    /** 어댑터 한도는 크고 장치는 기본 한도로 만들어지는 모의 환경. requestDevice 요청 기술자를 기록한다. */
    function bigAdapter(opts: { ignoreRequiredLimits?: boolean; maxBufferSize?: number } = {}) {
      const gpu = createMockGpu();
      const { adapter } = createMockAdapter({
        gpu,
        limits: { maxStorageBufferBindingSize: GIB, maxBufferSize: opts.maxBufferSize ?? GIB },
        ignoreRequiredLimits: opts.ignoreRequiredLimits ?? false,
      });
      const requests: GPUDeviceDescriptor[] = [];
      const original = adapter.requestDevice.bind(adapter);
      (adapter as unknown as { requestDevice: (d?: GPUDeviceDescriptor) => Promise<GPUDevice> }).requestDevice = async (desc) => {
        if (desc) requests.push(desc);
        return original(desc);
      };
      return { gpu, adapter, requests };
    }

    it("장치가 기본 한도로만 만들어지면(요청을 반영하지 않으면) 어댑터 한도로 예산을 통과시키지 않고 init이 StrokeBudgetExceededError(wetExt)로 막는다", async () => {
      const { adapter, gpu } = bigAdapter({ ignoreRequiredLimits: true });
      const lane = createWebgpuComputeLane();
      const env = fakeEnv(createMockGpuApi(adapter));
      const err = await lane.init(env, { width: 2048, height: 2048, dpr: 1, tileSize: 16, seed: 1, wetCapacityTiles: 6000 }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StrokeBudgetExceededError);
      expect((err as StrokeBudgetExceededError).details).toMatchObject({ buffer: "wetExt" });
      // 한도를 넘는 버퍼는 만들지 않았다(검증 오류가 uncapturederror로만 흘러가는 무음 실패 없음).
      expect(gpu.calls.filter((c) => c === "device.createBuffer").length).toBe(0);
    });

    it("필요한 한도(습식 확장 풀 23채널의 storage 바인딩 크기)만 어댑터 한도 범위에서 requiredLimits로 요청하고, 장치가 받으면 큰 습식 풀도 만든다", async () => {
      const { adapter, requests, gpu } = bigAdapter();
      const lane = createWebgpuComputeLane();
      const env = fakeEnv(createMockGpuApi(adapter));
      await lane.init(env, { width: 2048, height: 2048, dpr: 1, tileSize: 16, seed: 1, wetCapacityTiles: 6000 });
      // 6000타일 × 23채널 × 256셀 × 4B = 141,312,000(기본 128 MiB 초과). 스테이징 버퍼도 같은 크기지만 기본 maxBufferSize(256 MiB) 이하라 요청하지 않는다.
      expect(requests.length).toBe(1);
      expect(requests[0]?.requiredLimits).toEqual({ maxStorageBufferBindingSize: 6000 * 23 * 256 * 4 });
      expect((gpu.device.limits as unknown as Record<string, number>).maxStorageBufferBindingSize).toBe(6000 * 23 * 256 * 4);
      expect(gpu.bufferByLabel("sumi-wet-ext").size).toBe(6000 * 23 * 256 * 4);
      lane.dispose();
    });

    it("기본 용량은 한도를 올려 요청하지 않는다(requiredLimits 비어 있음)", async () => {
      const { adapter, requests } = bigAdapter();
      const lane = createWebgpuComputeLane();
      await lane.init(fakeEnv(createMockGpuApi(adapter)), { width: 256, height: 256, dpr: 1, tileSize: 16, seed: 1 });
      expect(requests[0]?.requiredLimits).toEqual({});
      lane.dispose();
    });

    it("어댑터 한도를 넘는 용량은 어댑터 한도로 clamp해 요청하고, 그래도 모자라면 StrokeBudgetExceededError(장치 한도 기준)", async () => {
      // 16384타일: 확장 풀 385.9 MB. 어댑터 maxBufferSize는 256 MiB(기본)라 버퍼 한도는 올릴 수 없다.
      const { adapter, requests } = bigAdapter({ maxBufferSize: 256 * 1024 * 1024 });
      const lane = createWebgpuComputeLane();
      const err = await lane
        .init(fakeEnv(createMockGpuApi(adapter)), { width: 2048, height: 2048, dpr: 1, tileSize: 16, seed: 1, wetCapacityTiles: 16384 })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StrokeBudgetExceededError);
      expect((err as StrokeBudgetExceededError).details).toMatchObject({ buffer: "wetExt" });
      expect(requests[0]?.requiredLimits).toEqual({ maxStorageBufferBindingSize: 16384 * 23 * 256 * 4 });
    });
  });

  it("한도 미달 어댑터는 limit-exceeded로 init을 거부한다", async () => {
    const { adapter } = createMockAdapter({ limits: { maxStorageBuffersPerShaderStage: 4 } });
    const lane = createWebgpuComputeLane();
    const env = fakeEnv(createMockGpuApi(adapter));
    await expect(lane.init(env, { width: 32, height: 32, dpr: 1, tileSize: 16, seed: 1 })).rejects.toMatchObject({ code: "limit-exceeded" });
  });

  it("device-lost 뒤에는 LaneUnavailableError(device-lost)", async () => {
    const { adapter, gpu } = createMockAdapter();
    const lane = createWebgpuComputeLane();
    const env = fakeEnv(createMockGpuApi(adapter));
    await lane.init(env, { width: 32, height: 32, dpr: 1, tileSize: 16, seed: 1 });
    gpu.loseDevice("unknown", "lost");
    await Promise.resolve();
    await Promise.resolve();
    expect(() => lane.beginStroke(presetById("pencil-hb"), 1)).toThrow(LaneUnavailableError);
  });
});
