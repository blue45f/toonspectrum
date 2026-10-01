import { polylineToPath } from "@toonstudio/studio-project-model";
import { describe, expect, it } from "vitest";

import { buildFixture } from "../bench/fixtures/stroke-fixtures";
import { coverageIoU, pixelHash } from "../bench/metrics/render-metrics";
import { runFixture } from "../bench/runner/run-fixture";
import { alphaSum, fakeEnv } from "../bench/testing/synthetic-images";
import { encodeLabImage } from "../engine/core/color";
import { InvalidStateError } from "../engine/core/errors";
import { presetById } from "../engine/presets/catalog";

import { CpuReferenceLane } from "./cpu-reference-lane";
import {
  createPlatformBaselineLane,
  defaultCalibration,
  PLATFORM_AA_GRID,
  PlatformBaselineLane,
  platformProgramOf,
  rasterizeEvenOdd,
} from "./platform-baseline-lane";

import type { PathIR } from "@toonstudio/studio-project-model";

const SIZE = 128;

function sum(values: Float32Array): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

describe("even-odd 스캔라인 래스터", () => {
  it("격자 정렬 정사각형은 면적 그대로, 반픽셀 오프셋은 경계 커버리지 0.5", () => {
    const aligned = rasterizeEvenOdd(polylineToPath([[10, 10], [20, 10], [20, 20], [10, 20]], true), 32, 32);
    expect(sum(aligned)).toBeCloseTo(100, 9);
    expect(aligned[15 * 32 + 15]).toBe(1);
    expect(aligned[15 * 32 + 9]).toBe(0);
    const offset = rasterizeEvenOdd(polylineToPath([[10.5, 10.5], [20.5, 10.5], [20.5, 20.5], [10.5, 20.5]], true), 32, 32);
    expect(sum(offset)).toBeCloseTo(100, 9);
    expect(offset[15 * 32 + 10]).toBeCloseTo(0.5, 9);
    expect(offset[10 * 32 + 10]).toBeCloseTo(0.25, 9);
    expect(PLATFORM_AA_GRID).toBe(4);
  });

  it("같은 방향의 안쪽 사각형은 even-odd 구멍이 되고 캔버스 밖은 잘린다", () => {
    const path: PathIR = {
      verbs: [
        { v: "M", x: 0, y: 0 }, { v: "L", x: 20, y: 0 }, { v: "L", x: 20, y: 20 }, { v: "L", x: 0, y: 20 }, { v: "Z" },
        { v: "M", x: 5, y: 5 }, { v: "L", x: 15, y: 5 }, { v: "L", x: 15, y: 15 }, { v: "L", x: 5, y: 15 }, { v: "Z" },
      ],
    };
    const cov = rasterizeEvenOdd(path, 32, 32);
    expect(sum(cov)).toBeCloseTo(400 - 100, 9);
    expect(cov[10 * 32 + 10]).toBe(0);
    const clipped = rasterizeEvenOdd(polylineToPath([[-10, -10], [10, -10], [10, 10], [-10, 10]], true), 16, 16);
    expect(sum(clipped)).toBeCloseTo(100, 9);
    expect(sum(rasterizeEvenOdd({ verbs: [] }, 8, 8))).toBe(0);
    expect(() => rasterizeEvenOdd({ verbs: [{ v: "M", x: 0, y: 0 }, { v: "Q", cx: 1, cy: 1, x: 2, y: 2 }] }, 8, 8)).toThrow(RangeError);
  });
});

describe("platform-baseline 레인", () => {
  it("Sumi 프로그램 → BrushProgramIR 대응: IR 어휘 밖 동역학은 버리고 압력 동역학이 있으면 thinning 1", () => {
    const ink = platformProgramOf(presetById("ink-g-pen"));
    expect(ink.id).toBe("sumi:ink-g-pen");
    expect(ink.geometry.kind).toBe("perfect-freehand");
    for (const m of ink.sizeDynamics) {
      expect(["pressure", "velocity", "tiltAltitude", "tiltAzimuth", "twist", "random", "constant"]).toContain(m.input);
      for (const c of m.curve) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
    expect(ink.geometry.thinning).toBe(ink.sizeDynamics.length > 0 ? 1 : 0.5);
    expect(ink.stabilizer).toEqual({ kind: "ema", strength: 0.35, predictionMs: 0 });
    const custom = platformProgramOf(presetById("pencil-hb"), { stabilizer: { kind: "none", strength: 0, predictionMs: 0 } });
    expect(custom.stabilizer.kind).toBe("none");
    expect(defaultCalibration().pressureCurve).toEqual([0, 1]);
  });

  it("probe supported, 결정적 픽셀 해시 스냅샷(3 fixture), 선형 버퍼가 readback과 일치", async () => {
    const lane = createPlatformBaselineLane();
    expect((await lane.probe({ clock: { now: () => 0 } })).status).toBe("supported");
    expect(lane.status).toBe("implemented");
    const program = presetById("ink-g-pen");
    const hashes: Record<string, string> = {};
    for (const id of ["line", "zigzag", "slow-pressure-ramp"] as const) {
      const fixture = buildFixture(id, { width: SIZE, height: SIZE });
      const a = await runFixture({ lane: new PlatformBaselineLane(), env: fakeEnv(), fixture, program, seed: 1 });
      const b = await runFixture({ lane: new PlatformBaselineLane(), env: fakeEnv(), fixture, program, seed: 1 });
      expect(pixelHash(a.image)).toBe(pixelHash(b.image));
      expect(alphaSum(a.image)).toBeGreaterThan(0);
      expect(a.linear).not.toBeNull();
      expect(encodeLabImage(a.linear ?? new Float32Array(), SIZE, SIZE)).toEqual(a.image);
      expect(a.receipt.submitCount).toBe(1);
      expect(a.receipt.dabCount).toBe(fixture.samples.length);
      expect(a.frames.every((f) => f.submitCount === 0 && f.inputToSubmitMs === null)).toBe(true);
      hashes[id] = pixelHash(a.image);
    }
    expect(hashes).toMatchSnapshot();
  });

  it("외곽선은 닫힌 폴리곤이고 예측 표본은 버리며 cpu-reference 대비 IoU가 (0.2, 1]이다", async () => {
    const program = presetById("ballpoint");
    const fixture = buildFixture("line", { width: SIZE, height: SIZE });
    const lane = new PlatformBaselineLane();
    await lane.init(fakeEnv(), { width: SIZE, height: SIZE, dpr: 1, tileSize: 16, seed: 1 });
    lane.beginStroke(program, 1);
    const withPredicted = [...fixture.samples, { ...(fixture.samples[5] ?? fixture.samples[0]), source: "predicted" as const, phase: "move" as const }];
    const receipt = lane.addSamples(withPredicted);
    expect(receipt.dabCount).toBe(fixture.samples.length);
    const end = await lane.endStroke();
    expect(end.dabCount).toBe(fixture.samples.length);
    const outline = lane.lastOutline();
    expect(outline?.verbs[0]?.v).toBe("M");
    expect(outline?.verbs[outline.verbs.length - 1]?.v).toBe("Z");
    const image = await lane.readback();
    lane.dispose();
    const cpu = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 1 });
    const iou = coverageIoU(image, cpu.image);
    expect(iou).toBeGreaterThan(0.2);
    expect(iou).toBeLessThanOrEqual(1);
  });

  it("호출 순서 위반·dispose 후 호출은 InvalidStateError, 잘못된 캔버스는 RangeError", async () => {
    const lane = new PlatformBaselineLane();
    const program = presetById("pencil-hb");
    expect(() => lane.beginStroke(program, 1)).toThrow(InvalidStateError);
    await expect(lane.init(fakeEnv(), { width: 0, height: 8, dpr: 1, tileSize: 16, seed: 1 })).rejects.toThrow(RangeError);
    await lane.init(fakeEnv(), { width: 16, height: 16, dpr: 1, tileSize: 16, seed: 1 });
    expect(() => lane.addSamples([])).toThrow(InvalidStateError);
    await expect(lane.endStroke()).rejects.toBeInstanceOf(InvalidStateError);
    lane.beginStroke(program, 1);
    expect(() => lane.beginStroke(program, 1)).toThrow(InvalidStateError);
    const empty = await lane.endStroke();
    expect(empty.dabCount).toBe(0);
    expect(alphaSum(await lane.readback())).toBe(0);
    lane.dispose();
    await expect(lane.readback()).rejects.toBeInstanceOf(InvalidStateError);
    expect(lane.stats().strokes).toBe(1);
  });
});
