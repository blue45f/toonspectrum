import { describe, expect, it } from "vitest";

import { LaneUnavailableError } from "../../engine/core/errors";
import { presetById } from "../../engine/presets/catalog";
import { CpuReferenceLane } from "../../lanes/cpu-reference-lane";
import { PlatformBaselineLane } from "../../lanes/platform-baseline-lane";
import { ReservedLane } from "../../lanes/reserved-lane";
import { buildFixture } from "../fixtures/stroke-fixtures";
import { alphaSum, diskImage, fakeEnv, shiftImage, solidImage } from "../testing/synthetic-images";

import { compareLanes } from "./ab-compare";
import { deltaEMap, diffHeatmap, heatRamp } from "./diff-map";
import { DEFAULT_FRAME_MS, framesPreserveSamples, replayFrameList, replayFrames } from "./replay";
import { runFixture } from "./run-fixture";

import type { RawSample } from "../../engine/core/types";

const SIZE = 96;

function at(tMs: number): RawSample {
  return { x: tMs, y: 0, tMs, pressure: 0.5, tiltXDeg: 0, tiltYDeg: 0, twistDeg: 0, pointerType: "pen", phase: "move", source: "raw" };
}

describe("리플레이 프레임 분할", () => {
  it("tMs 경계대로 나누고 빈 프레임은 내보내지 않으며 총 샘플·순서를 보존한다", () => {
    const samples = [0, 5, 10, 16, 17, 34, 35, 100].map(at);
    const frames = replayFrameList(samples, DEFAULT_FRAME_MS);
    expect(frames.map((f) => f.map((s) => s.tMs))).toEqual([[0, 5, 10, 16], [17], [34, 35], [100]]);
    expect(framesPreserveSamples(frames, samples)).toBe(true);
    expect(framesPreserveSamples([[samples[1] ?? at(5)]], samples)).toBe(false);
    expect(replayFrameList(samples, DEFAULT_FRAME_MS, 2).length).toBeLessThan(frames.length);
    expect(replayFrameList([], 16)).toEqual([]);
    expect(() => Array.from(replayFrames(samples, 0))).toThrow(RangeError);
    expect(() => Array.from(replayFrames(samples, 16, 0))).toThrow(RangeError);
    const backwards = [at(0), at(20), at(10), at(40)];
    const bf = replayFrameList(backwards, 16);
    expect(framesPreserveSamples(bf, backwards)).toBe(true);
    expect(bf.map((f) => f.length)).toEqual([1, 2, 1]);
  });

  it("fixture를 프레임으로 나누면 프레임 수가 duration/frameMs 안팎이다", () => {
    const fixture = buildFixture("line", { width: SIZE, height: SIZE });
    const frames = replayFrameList(fixture.samples);
    expect(frames.length).toBeGreaterThanOrEqual(36);
    expect(frames.length).toBeLessThanOrEqual(38);
    expect(framesPreserveSamples(frames, fixture.samples)).toBe(true);
  });
});

describe("runFixture·compareLanes", () => {
  const program = presetById("pencil-hb");
  const fixture = buildFixture("line", { width: SIZE, height: SIZE });

  it("cpu-reference 자기 비교: diff 0·hashEqual·IoU 1·히트맵 전부 검정", async () => {
    const a = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 1 });
    const b = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 1 });
    expect(a.frames.length).toBe(replayFrameList(fixture.samples).length);
    expect(a.sampleCount).toBe(fixture.samples.length);
    expect(a.capability.status).toBe("supported");
    expect(a.elapsedMs).toBeGreaterThan(0);
    expect(alphaSum(a.image)).toBeGreaterThan(0);
    const cmp = compareLanes(a, b, program, fixture);
    expect(cmp.hashEqual).toBe(true);
    expect(cmp.hashA).toBe(cmp.hashB);
    expect(cmp.iou).toBe(1);
    expect(cmp.deltaE.max).toBe(0);
    expect(cmp.fuzzyMismatchPct).toBe(0);
    expect(cmp.perfA.frameCount).toBe(a.receipt.frameTimesMs.length);
    expect(cmp.heatmap.width).toBe(SIZE);
    expect(cmp.heatmap.data.every((v, i) => (i % 4 === 3 ? v === 255 : v === 0))).toBe(true);
    expect(cmp).toMatchObject({ laneA: "cpu-reference", laneB: "cpu-reference", fixtureId: "line", presetId: "pencil-hb" });
  });

  it("cpu-reference 대 platform-baseline: IoU가 (0.2, 1] 범위이고 해시는 다르다", async () => {
    const a = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 1 });
    const b = await runFixture({ lane: new PlatformBaselineLane(), env: fakeEnv(), fixture, program, seed: 1 });
    const cmp = compareLanes(a, b, program, fixture);
    expect(cmp.iou).toBeGreaterThan(0.2);
    expect(cmp.iou).toBeLessThanOrEqual(1);
    expect(cmp.hashEqual).toBe(false);
    expect(cmp.laneB).toBe("platform-baseline");
    expect(cmp.perfB.submitCount).toBe(1);
  });

  it("다른 fixture·캔버스 결과를 비교하면 RangeError", async () => {
    const a = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 1 });
    const other = buildFixture("zigzag", { width: SIZE, height: SIZE });
    const b = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture: other, program, seed: 1 });
    expect(() => compareLanes(a, b, program, fixture)).toThrow(RangeError);
    const small = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture: buildFixture("line", { width: 48, height: 48 }), program, seed: 1 });
    expect(() => compareLanes(a, small, program, fixture)).toThrow(RangeError);
  });

  it("unavailable 레인은 LaneUnavailableError(무음 대체 없음), disposeLane:false면 레인을 계속 쓸 수 있다", async () => {
    const reserved = new ReservedLane("webgpu-compute", "예약", "candidate");
    await expect(runFixture({ lane: reserved, env: fakeEnv(), fixture, program, seed: 1 })).rejects.toBeInstanceOf(LaneUnavailableError);
    const lane = new CpuReferenceLane();
    await runFixture({ lane, env: fakeEnv(), fixture, program, seed: 1, disposeLane: false });
    const again = await lane.readback();
    expect(again.width).toBe(SIZE);
    lane.dispose();
    await expect(lane.readback()).rejects.toThrow();
    const disposed = new CpuReferenceLane();
    await runFixture({ lane: disposed, env: fakeEnv(), fixture, program, seed: 1 });
    await expect(disposed.readback()).rejects.toThrow();
  });

  it("frameMs·speed 옵션이 프레임 수를 바꾸고 결과 캔버스는 fixture 크기다", async () => {
    const coarse = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 1, frameMs: 100 });
    expect(coarse.frames.length).toBeLessThan(10);
    expect(coarse.frameMs).toBe(100);
    expect(coarse.canvas).toEqual({ width: SIZE, height: SIZE, dpr: 1 });
    expect(coarse.image.width).toBe(SIZE);
  });
});

describe("ΔE diff heatmap", () => {
  it("동일 이미지는 ΔE 0(검정), 다른 영역은 램프 색, 크기 불일치는 RangeError", () => {
    const a = diskImage(16, 16, 8, 8, 4);
    const map = deltaEMap(a, a);
    expect(Math.max(...map)).toBe(0);
    const b = shiftImage(a, 4, 0);
    const heat = diffHeatmap(a, b);
    expect(heat.width).toBe(16);
    let bright = 0;
    for (let i = 0; i < heat.data.length; i += 4) if ((heat.data[i] ?? 0) + (heat.data[i + 1] ?? 0) + (heat.data[i + 2] ?? 0) > 0) bright += 1;
    expect(bright).toBeGreaterThan(0);
    expect(() => diffHeatmap(a, solidImage(4, 4))).toThrow(RangeError);
    expect(() => diffHeatmap(a, a, { maxDeltaE: 0 })).toThrow(RangeError);
    expect(heatRamp(0)).toEqual([0, 0, 0]);
    expect(heatRamp(1)).toEqual([255, 32, 0]);
    expect(heatRamp(2)).toEqual([255, 32, 0]);
  });
});
