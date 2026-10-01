import { describe, expect, it } from "vitest";

import { InvalidStateError, LaneUnavailableError } from "../engine/core/errors";
import { ENTRY_POINTS, TABLE_OFFSETS } from "../engine/gpu/layout";
import { createMockAdapter, createMockGpuApi } from "../engine/gpu/testing/mock-gpu-device";
import { presetById } from "../engine/presets/catalog";
import { splitFrames } from "../engine/raster/reference-renderer";
import { zigzagStroke } from "../engine/testing/synthetic-strokes";
import { embeddedKernelBytes } from "../engine/wasm/embedded";

import { createHybridLane, HYBRID_LANE } from "./hybrid-lane";

import type { LaneEnvironment } from "./lane";

function fakeEnv(gpu: GPU | null, extra: Partial<LaneEnvironment> = {}): LaneEnvironment {
  let t = 0;
  return {
    gpu,
    clock: {
      now: () => {
        t += 1;
        return t;
      },
    },
    ...extra,
  };
}

const BINNING_ENTRIES: string[] = [ENTRY_POINTS.binCount, ENTRY_POINTS.scanBlocks, ENTRY_POINTS.scanBlockSums, ENTRY_POINTS.scatter];

describe("wasm-gpu-hybrid 레인", () => {
  it("디스크립터는 레인 계약과 일치한다(상태 browser-verification-required, 더 이상 예약이 아니다)", () => {
    const lane = HYBRID_LANE.create();
    expect(HYBRID_LANE.id).toBe("wasm-gpu-hybrid");
    expect(HYBRID_LANE.status).toBe("browser-verification-required");
    expect(lane.id).toBe(HYBRID_LANE.id);
    expect(lane.status).toBe(HYBRID_LANE.status);
    expect(lane.kind).toBe("candidate");
  });

  it("gpu 없음 → webgpu-api-unavailable, wasm 산출물 없음/변조는 GPU가 있어도 사유 코드로 unavailable(init은 LaneUnavailableError)", async () => {
    const lane = createHybridLane();
    const none = await lane.probe(fakeEnv(null));
    expect(none).toMatchObject({ laneId: "wasm-gpu-hybrid", status: "unavailable" });
    expect(none.reasons).toEqual(["webgpu-api-unavailable"]);
    await expect(lane.init(fakeEnv(null), { width: 32, height: 32, dpr: 1, tileSize: 16, seed: 1 })).rejects.toMatchObject({ code: "webgpu-api-unavailable" });

    const { adapter } = createMockAdapter();
    const api = createMockGpuApi(adapter);
    const missing = fakeEnv(api, { wasmBytes: null });
    expect((await lane.probe(missing)).reasons).toEqual(["wasm-artifact-missing"]);
    await expect(lane.init(missing, { width: 32, height: 32, dpr: 1, tileSize: 16, seed: 1 })).rejects.toMatchObject({ code: "wasm-artifact-missing" });
    const tampered = embeddedKernelBytes();
    tampered[50] = (tampered[50] ?? 0) ^ 0x10;
    const bad = fakeEnv(api, { wasmBytes: tampered });
    expect((await lane.probe(bad)).reasons).toEqual(["wasm-integrity-mismatch"]);
    await expect(lane.init(bad, { width: 32, height: 32, dpr: 1, tileSize: 16, seed: 1 })).rejects.toBeInstanceOf(LaneUnavailableError);
    // 두 사유가 겹치면 모두 드러난다.
    expect((await lane.probe(fakeEnv(null, { wasmBytes: null }))).reasons).toEqual(["webgpu-api-unavailable", "wasm-artifact-missing"]);
  });

  it("모의 장치로 fixture를 실행하면 프레임당 4 dispatch(비닝 4패스 생략), 영수증·readback이 webgpu-compute와 같은 계약으로 나온다", async () => {
    const { adapter, gpu } = createMockAdapter({ info: { vendor: "mock", description: "SwiftShader" } });
    const lane = createHybridLane();
    const env = fakeEnv(createMockGpuApi(adapter));
    const report = await lane.probe(env);
    expect(report.status).toBe("supported");
    expect(report.reasons).toEqual([]);
    await lane.init(env, { width: 96, height: 64, dpr: 1, tileSize: 16, seed: 3 });
    lane.beginStroke(presetById("ink-g-pen"), 3);
    const frames = splitFrames(zigzagStroke(64, { durationMs: 120 }));
    let dabs = 0;
    for (const frame of frames) {
      const r = lane.addSamples(frame);
      expect(r.submitCount).toBe(1);
      expect(r.dispatchCount).toBe(4);
      dabs += r.dabCount;
    }
    expect(dabs).toBeGreaterThan(0);
    // 비닝 4패스는 한 번도 디스패치되지 않았다.
    expect(gpu.dispatches.filter((d) => BINNING_ENTRIES.includes(d.entryPoint))).toEqual([]);
    expect(gpu.dispatches.some((d) => d.entryPoint === ENTRY_POINTS.fineRaster)).toBe(true);
    // CSR은 매 프레임 GPU 버퍼에 올라간다.
    expect(gpu.writes.filter((w) => w.target === "sumi-refs").length).toBeGreaterThan(0);
    gpu.setU32("sumi-table", TABLE_OFFSETS.poolCursor, 4);
    const receipt = await lane.endStroke();
    expect(receipt.dabCount).toBeGreaterThanOrEqual(dabs);
    expect(receipt.poolTilesUsed).toBe(4);
    expect(lane.stats().submits).toBe(frames.length + 2);
    expect((await lane.readback()).data.length).toBe(96 * 64 * 4);
    lane.dispose();
    await expect(lane.readback()).rejects.toBeInstanceOf(InvalidStateError);
    expect(gpu.destroyed).toBe(true);
  });
});
