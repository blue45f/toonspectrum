import { describe, expect, it } from "vitest";

import { InvalidStateError, LaneUnavailableError } from "../engine/core/errors";
import { ENTRY_POINTS, TABLE_OFFSETS } from "../engine/gpu/layout";
import { createMockAdapter, createMockGpuApi } from "../engine/gpu/testing/mock-gpu-device";
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
