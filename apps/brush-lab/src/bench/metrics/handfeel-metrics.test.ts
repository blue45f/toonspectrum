import { describe, expect, it } from "vitest";

import { bandImage, solidImage } from "../testing/synthetic-images";

import {
  centerlineFromImage,
  cornerAccuracyFromImage,
  cornerDeviation,
  expectedTaperWidth,
  frameLatency,
  inputToPixelLatency,
  latencyStats,
  lineWidthCurve,
  pressureResponse,
  samplePath,
  slowSpeedJitterRms,
  speedBucketCoverage,
  speedConsistency,
  taperQuality,
  taperShape,
  taperSmoothstep,
  widthsAtSamples,
} from "./handfeel-metrics";

import type { Point } from "./handfeel-metrics";
import type { RawSample } from "../../engine/core/types";

function sample(x: number, y: number, tMs: number, pressure = 0.5): RawSample {
  return { x, y, tMs, pressure, tiltXDeg: 0, tiltYDeg: 0, twistDeg: 0, pointerType: "pen", phase: "move", source: "raw" };
}

describe("필기감 지표", () => {
  it("지연 통계: 기록 없음 null, 필터 지연 + 프레임 시간, now 주입 결정성", () => {
    expect(latencyStats([])).toBeNull();
    expect(latencyStats([1, 2, 3, 4, 5])).toEqual({ p50: 3, p95: 4.8, max: 5 });
    expect(inputToPixelLatency([], [1])).toBeNull();
    const records = [
      { inputTMs: 0, modeledTMs: 4 },
      { inputTMs: 8, modeledTMs: 10 },
    ];
    const a = inputToPixelLatency(records, [2, 2]);
    expect(a?.p50).toBe(5);
    expect(a?.p95).toBeCloseTo(5.9, 9);
    expect(a?.max).toBe(6);
    expect(inputToPixelLatency(records, [2, 2])).toEqual(a);
    const frames = frameLatency(
      [
        { frameIndex: 0, dabCount: 1, submitCount: 1, dispatchCount: 1, inputToSubmitMs: 1 },
        { frameIndex: 1, dabCount: 1, submitCount: 1, dispatchCount: 1, inputToSubmitMs: null },
      ],
      [3, 3],
    );
    expect(frames).toEqual({ p50: 4, p95: 4, max: 4 });
    expect(frameLatency([{ frameIndex: 0, dabCount: 0, submitCount: 0, dispatchCount: 0, inputToSubmitMs: null }], [])).toBeNull();
  });

  it("압력 응답: 삼각파 선형 응답은 단조 1·R² 1·γ 1·히스테리시스 0, 하강 폭이 넓으면 루프 면적이 나온다", () => {
    const n = 64;
    const pressures: number[] = [];
    for (let i = 0; i < n; i += 1) pressures.push(i < n / 2 ? i / (n / 2 - 1) : (n - 1 - i) / (n / 2 - 1));
    const linear = pressureResponse(pressures, pressures.map((p) => 10 * p));
    expect(linear.monotonicity).toBeCloseTo(1, 9);
    expect(linear.linearityR2).toBeCloseTo(1, 6);
    expect(linear.gamma).toBeCloseTo(1, 6);
    expect(linear.hysteresisWidth).toBeCloseTo(0, 6);
    const widths = pressures.map((p, i) => (i < n / 2 ? 10 * p : 10 * (p + 0.1)));
    const hysteretic = pressureResponse(pressures, widths);
    expect(hysteretic.hysteresisWidth).toBeGreaterThan(0.07);
    expect(hysteretic.hysteresisWidth).toBeLessThan(0.12);
    const gamma = pressureResponse(pressures, pressures.map((p) => 10 * Math.pow(p, 1.5)));
    expect(gamma.gamma).toBeCloseTo(1.5, 3);
    expect(pressureResponse([0.5], [1]).monotonicity).toBe(0);
  });

  it("테이퍼 형태·품질·기대치(엔진 smoothstep 규약)", () => {
    const shape = taperShape([2, 4, 6, 8, 6, 4, 2, 0.5]);
    expect(shape.peakIndex).toBe(3);
    expect(shape.endWidthRatio).toBeCloseTo(0.0625, 9);
    expect(shape.overshoot).toBe(0);
    expect(shape.monotoneViolations).toBe(0);
    const bumpy = taperShape([8, 6, 4, 6, 2]);
    expect(bumpy.monotoneViolations).toBe(1);
    expect(bumpy.overshoot).toBeCloseTo(0.25, 9);
    expect(taperShape([]).endWidthRatio).toBe(0);
    expect(taperQuality([1, 2, 3], [1, 2, 3])).toBe(1);
    expect(taperQuality([0, 0, 0], [1, 2, 3])).toBeLessThan(0.5);
    expect(taperQuality([], [])).toBe(0);
    expect(taperSmoothstep(0.5)).toBeCloseTo(0.5, 12);
    expect(expectedTaperWidth(0, 100, 10, 20, 20)).toBe(0);
    expect(expectedTaperWidth(50, 100, 10, 20, 20)).toBe(10);
    expect(expectedTaperWidth(90, 100, 10, 0, 20)).toBeCloseTo(10 * taperSmoothstep(0.5), 12);
  });

  it("저속 지터: 직선 0, 교대 ±1 px 노이즈는 3차 detrend 후에도 큰 RMS", () => {
    const straight: Point[] = Array.from({ length: 40 }, (_, i) => [i * 2, 10] as const);
    expect(slowSpeedJitterRms(straight)).toBeCloseTo(0, 6);
    const jittery: Point[] = straight.map(([x, y], i) => [x, y + (i % 2 === 0 ? 1 : -1)] as const);
    expect(slowSpeedJitterRms(jittery)).toBeGreaterThan(0.8);
    expect(slowSpeedJitterRms(straight.slice(0, 3))).toBe(0);
  });

  it("모서리 정확도: 정확한 L자 0/0, 둥근 모서리는 편차, 직진 후 꺾임은 오버슈트", () => {
    const intended: Point[] = [
      [0, 0],
      [20, 0],
      [20, 20],
    ];
    const exact: Point[] = [
      [0, 0],
      [10, 0],
      [20, 0],
      [20, 10],
      [20, 20],
    ];
    expect(cornerDeviation(exact, intended)).toEqual({ maxPx: 0, overshootPx: 0 });
    const rounded: Point[] = [
      [0, 0],
      [16, 0],
      [19, 1],
      [20, 4],
      [20, 20],
    ];
    const r = cornerDeviation(rounded, intended);
    expect(r.maxPx).toBeGreaterThan(1);
    expect(r.maxPx).toBeLessThan(3);
    const overshoot: Point[] = [
      [0, 0],
      [20, 0],
      [23, 0],
      [20, 2],
      [20, 20],
    ];
    expect(cornerDeviation(overshoot, intended).overshootPx).toBeCloseTo(3, 9);
    expect(cornerDeviation([], intended)).toEqual({ maxPx: 0, overshootPx: 0 });
    expect(cornerDeviation(exact, intended.slice(0, 2))).toEqual({ maxPx: 0, overshootPx: 0 });
  });

  it("속도별 도포 일관성: 균일 0, 변동은 CV", () => {
    expect(speedConsistency([5, 5, 5])).toBe(0);
    expect(speedConsistency([5])).toBe(0);
    expect(speedConsistency([0, 0])).toBe(0);
    expect(speedConsistency([4, 6])).toBeCloseTo(0.2, 9);
  });

  it("이미지 기반: 띠의 선폭 곡선·표본별 선폭·중심선·속도 구간 도포", () => {
    const img = bandImage(64, 32, 13, 19);
    const path: Point[] = [
      [4, 16],
      [60, 16],
    ];
    const widths = lineWidthCurve(img, path, 8);
    expect(widths.length).toBe(8);
    for (const w of widths) expect(w).toBeCloseTo(6, 0);
    const samples = [sample(4, 16, 0), sample(20, 16, 10), sample(40, 16, 15), sample(60, 16, 17.5)];
    const sw = widthsAtSamples(img, samples);
    expect(sw.length).toBe(4);
    for (const w of sw) expect(w).toBeCloseTo(6, 0);
    const center = centerlineFromImage(img, path, 10);
    expect(center.length).toBe(10);
    for (const [, y] of center) expect(y).toBeCloseTo(16, 1);
    const offset = centerlineFromImage(img, [[4, 14], [60, 14]], 10);
    for (const [, y] of offset) expect(y).toBeCloseTo(16, 1);
    expect(centerlineFromImage(solidImage(64, 32), path, 10)).toEqual([]);
    const buckets = speedBucketCoverage(img, samples, 3);
    expect(buckets.speeds.length).toBeGreaterThanOrEqual(2);
    expect(buckets.speeds.length).toBeLessThanOrEqual(3);
    for (const c of buckets.coverage) expect(c).toBeCloseTo(6, 0);
    expect(speedConsistency(buckets.coverage)).toBeLessThan(0.05);
    expect(speedBucketCoverage(img, [sample(1, 1, 0)], 3)).toEqual({ speeds: [], coverage: [] });
    expect(samplePath(samples)[1]).toEqual([20, 16]);
  });

  it("이미지 기반 모서리 정확도: 날카로운 L은 0/0, 둥근 모서리는 r(√2−1)만큼 물러나고 직진 후 꺾임은 오버슈트", () => {
    const size = 96;
    const hw = 3;
    const v: Point = [56, 24];
    const intended: Point[] = [
      [12, 24],
      v,
      [56, 72],
    ];
    const distToSeg = (px: number, py: number, a: Point, b: Point): number => {
      const vx = b[0] - a[0];
      const vy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / (vx * vx + vy * vy)));
      return Math.hypot(px - (a[0] + vx * t), py - (a[1] + vy * t));
    };
    const render = (centerline: Point[]): { width: number; height: number; data: Uint8ClampedArray } => {
      const data = new Uint8ClampedArray(size * size * 4);
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          let d = Number.POSITIVE_INFINITY;
          for (let i = 0; i + 1 < centerline.length; i += 1) {
            const a = centerline[i];
            const b = centerline[i + 1];
            if (a && b) d = Math.min(d, distToSeg(x + 0.5, y + 0.5, a, b));
          }
          const cov = Math.max(0, Math.min(1, hw - d + 0.5));
          data[(y * size + x) * 4 + 3] = Math.round(cov * 255);
        }
      }
      return { width: size, height: size, data };
    };
    const sharp = cornerAccuracyFromImage(render(intended), intended, hw);
    expect(sharp.corners).toBe(1);
    expect(sharp.maxPx).toBeLessThan(0.6);
    expect(sharp.overshootPx ?? 9).toBeLessThan(0.6);
    const r = 8;
    const arc: Point[] = [[12, 24], [v[0] - r, 24]];
    for (let i = 1; i <= 8; i += 1) {
      const ang = (Math.PI / 2) * (i / 8);
      arc.push([v[0] - r + r * Math.sin(ang), v[1] + r - r * Math.cos(ang)]);
    }
    arc.push([56, 72]);
    const rounded = cornerAccuracyFromImage(render(arc), intended, hw);
    const expected = r * (Math.SQRT2 - 1);
    expect(rounded.maxPx).toBeGreaterThan(expected - 0.8);
    expect(rounded.maxPx).toBeLessThan(expected + 0.8);
    const over = cornerAccuracyFromImage(render([[12, 24], [v[0] + 4, 24], v, [56, 72]]), intended, hw);
    expect(over.overshootPx ?? 0).toBeGreaterThan(3);
    expect(over.overshootPx ?? 0).toBeLessThan(5);
    expect(cornerAccuracyFromImage(render(intended), intended.slice(0, 2), hw)).toEqual({ maxPx: 0, overshootPx: null, corners: 0 });
    const obtuse: Point[] = [[12, 60], [48, 48], [84, 60]];
    expect(cornerAccuracyFromImage(render(obtuse), obtuse, hw).overshootPx).toBeNull();
  });
});
