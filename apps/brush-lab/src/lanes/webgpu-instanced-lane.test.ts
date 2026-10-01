import { describe, expect, it } from "vitest";

import { InvalidStateError, LaneUnavailableError } from "../engine/core/errors";
import { ENTRY_POINTS } from "../engine/gpu/layout";
import { createMockAdapter, createMockGpuApi } from "../engine/gpu/testing/mock-gpu-device";
import { presetById } from "../engine/presets/catalog";
import { splitFrames } from "../engine/raster/reference-renderer";
import { zigzagStroke } from "../engine/testing/synthetic-strokes";

import { createWebgpuInstancedLane, WEBGPU_INSTANCED_LANE, WEBGPU_INSTANCED_LANE_ID } from "./webgpu-instanced-lane";

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

describe("webgpu-instanced 레인", () => {
  it("디스크립터는 비교 레인 계약과 일치한다", () => {
    const lane = WEBGPU_INSTANCED_LANE.create();
    expect(WEBGPU_INSTANCED_LANE.id).toBe("webgpu-instanced");
    expect(WEBGPU_INSTANCED_LANE_ID).toBe(WEBGPU_INSTANCED_LANE.id);
    expect(WEBGPU_INSTANCED_LANE.status).toBe("browser-verification-required");
    expect(lane.id).toBe(WEBGPU_INSTANCED_LANE.id);
    expect(lane.kind).toBe("comparison");
    expect(lane.engineVersion.length).toBeGreaterThan(0);
  });

  it("gpu 없음 → probe unavailable(webgpu-api-unavailable), init은 LaneUnavailableError(무음 대체 없음)", async () => {
    const lane = createWebgpuInstancedLane();
    const env = fakeEnv(null);
    const report = await lane.probe(env);
    expect(report).toMatchObject({ laneId: "webgpu-instanced", status: "unavailable", reasons: ["webgpu-api-unavailable"] });
    await expect(lane.init(env, { width: 64, height: 64, dpr: 1, tileSize: 16, seed: 1 })).rejects.toMatchObject({ code: "webgpu-api-unavailable" });
    expect(() => lane.beginStroke(presetById("pencil-hb"), 1)).toThrow(InvalidStateError);
    expect(() => lane.addSamples([])).toThrow(InvalidStateError);
    await expect(lane.endStroke()).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("어댑터 없음 → adapter-unavailable", async () => {
    const lane = createWebgpuInstancedLane();
    const report = await lane.probe(fakeEnv(createMockGpuApi(null)));
    expect(report.reasons).toEqual(["adapter-unavailable"]);
  });

  it("정점 버퍼·속성 한도(compute 한도와 별개)가 모자라면 limit-exceeded로 init을 거부한다", async () => {
    const { adapter } = createMockAdapter({ limits: { maxVertexAttributes: 2 } });
    const lane = createWebgpuInstancedLane();
    const env = fakeEnv(createMockGpuApi(adapter));
    const report = await lane.probe(env);
    expect(report.status).toBe("unavailable");
    await expect(lane.init(env, { width: 32, height: 32, dpr: 1, tileSize: 16, seed: 1 })).rejects.toMatchObject({ code: "limit-exceeded" });
  });

  it("모의 장치로 건식 fixture를 실행하면 프레임마다 draw(6, n)+encode, 영수증·readback·stats가 나온다", async () => {
    const { adapter, gpu } = createMockAdapter({ info: { vendor: "mock", description: "SwiftShader" }, features: ["timestamp-query"] });
    const lane = createWebgpuInstancedLane();
    const env = fakeEnv(createMockGpuApi(adapter));
    const report = await lane.probe(env);
    expect(report.status).toBe("supported");
    expect(report.softwareRenderer).toBe(true);
    await lane.init(env, { width: 96, height: 64, dpr: 1, tileSize: 16, seed: 3 });
    lane.beginStroke(presetById("ink-g-pen"), 3);
    const frames = splitFrames(zigzagStroke(64, { durationMs: 120 }));
    expect(frames.length).toBeGreaterThan(2);
    let dabs = 0;
    frames.forEach((frame, i) => {
      const r = lane.addSamples(frame);
      expect(r.frameIndex).toBe(i);
      expect(r.submitCount).toBe(1);
      // 인스턴싱 레인의 dispatchCount는 draw 호출 수(획 draw 0~1 + encode 1)다.
      expect(r.dispatchCount).toBe(r.dabCount > 0 ? 2 : 1);
      expect(r.inputToSubmitMs).not.toBeNull();
      dabs += r.dabCount;
    });
    expect(dabs).toBeGreaterThan(0);
    const strokeDraws = gpu.draws.filter((d) => d.entryPoint === ENTRY_POINTS.instancedFs);
    expect(strokeDraws.reduce((n, d) => n + d.instanceCount, 0)).toBe(dabs);
    expect(strokeDraws.every((d) => d.vertexCount === 6)).toBe(true);

    const receipt = await lane.endStroke();
    expect(receipt.dabCount).toBeGreaterThanOrEqual(dabs);
    // 프레임 + finish 배치 + bake·encode 2회.
    expect(receipt.submitCount).toBe(frames.length + 1 + 2);
    expect(lane.stats().submits).toBe(receipt.submitCount);
    expect(lane.stats().strokes).toBe(1);
    expect(lane.stats().dabs).toBe(receipt.dabCount);
    // 컴퓨트 파이프라인이 아니므로 풀·overflow 필드는 0이다.
    expect(receipt).toMatchObject({ overflowDabs: 0, poolTilesUsed: 0 });
    expect(gpu.dispatches.length).toBe(0);

    const image = await lane.readback();
    expect(image).toMatchObject({ width: 96, height: 64 });
    expect(image.data.length).toBe(96 * 64 * 4);
    const linear = await lane.readbackLinear();
    expect(linear?.length).toBe(96 * 64 * 4);
    lane.dispose();
    expect(gpu.destroyed).toBe(true);
    await expect(lane.readback()).rejects.toBeInstanceOf(InvalidStateError);
    await expect(lane.readbackLinear()).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("지원하지 않는 프로그램(smudge·습식·임파스토)은 beginStroke에서 not-implemented로 거부한다(무음 폴백 없음)", async () => {
    const { adapter } = createMockAdapter();
    const lane = createWebgpuInstancedLane();
    const env = fakeEnv(createMockGpuApi(adapter));
    await lane.init(env, { width: 32, height: 32, dpr: 1, tileSize: 16, seed: 1 });
    for (const id of ["smudge-blend", "watercolor-wet", "oil-impasto"]) {
      let caught: unknown = null;
      try {
        lane.beginStroke(presetById(id), 1);
      } catch (error) {
        caught = error;
      }
      expect(caught, id).toBeInstanceOf(LaneUnavailableError);
      expect(caught, id).toMatchObject({ code: "not-implemented" });
    }
    // 거부한 뒤에도 지원 프로그램은 같은 레인에서 계속 쓸 수 있다.
    lane.beginStroke(presetById("pencil-hb"), 1);
    lane.dispose();
  });

  it("dispose는 멱등이고 dispose 뒤 init은 InvalidStateError", async () => {
    const { adapter, gpu } = createMockAdapter();
    const lane = createWebgpuInstancedLane();
    const env = fakeEnv(createMockGpuApi(adapter));
    await lane.init(env, { width: 32, height: 32, dpr: 1, tileSize: 16, seed: 1 });
    lane.dispose();
    lane.dispose();
    expect(gpu.destroyed).toBe(true);
    await expect(lane.init(env, { width: 32, height: 32, dpr: 1, tileSize: 16, seed: 1 })).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("device-lost 뒤에는 LaneUnavailableError(device-lost)", async () => {
    const { adapter, gpu } = createMockAdapter();
    const lane = createWebgpuInstancedLane();
    const env = fakeEnv(createMockGpuApi(adapter));
    await lane.init(env, { width: 32, height: 32, dpr: 1, tileSize: 16, seed: 1 });
    gpu.loseDevice("unknown", "lost");
    await Promise.resolve();
    await Promise.resolve();
    expect(() => lane.beginStroke(presetById("pencil-hb"), 1)).toThrow(LaneUnavailableError);
  });
});
