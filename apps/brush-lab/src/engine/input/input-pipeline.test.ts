import { describe, expect, it } from "vitest";

import { cornerStroke, lineStroke, tremorStroke, withPredicted } from "../testing/synthetic-strokes";

import { calibratePressure, DEVICE_PROFILES, tiltToSpherical } from "./calibration";
import { adaptiveCutoff, estimateCurvature, shouldSuppressPrediction } from "./corner-preserve";
import { DEFAULT_INPUT_CONFIG, InputPipeline, resolveInputConfig } from "./input-pipeline";
import { predictSamples } from "./predictor";

import type { ModeledSample, RawSample } from "../core/types";

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

function runAll(samples: readonly RawSample[], config = DEFAULT_INPUT_CONFIG): { out: ModeledSample[]; pipeline: InputPipeline } {
  const pipeline = new InputPipeline(config);
  const out: ModeledSample[] = [];
  // 16 ms 프레임으로 나눠 밀어 넣는다.
  const frames = new Map<number, RawSample[]>();
  for (const s of samples) {
    const k = Math.floor(s.tMs / 16.67);
    const bucket = frames.get(k) ?? [];
    bucket.push(s);
    frames.set(k, bucket);
  }
  for (const key of Array.from(frames.keys()).sort((a, b) => a - b)) {
    out.push(...pipeline.push(frames.get(key) ?? []).committed);
  }
  out.push(...pipeline.finish());
  return { out, pipeline };
}

describe("교정·기울기", () => {
  it("calibratePressure: deadZone 아래 0, 단조, [0,1]", () => {
    for (const profile of Object.values(DEVICE_PROFILES)) {
      expect(calibratePressure(0, profile)).toBe(0);
      expect(calibratePressure(profile.deadZone, profile)).toBe(0);
      let prev = 0;
      for (let i = 0; i <= 100; i += 1) {
        const v = calibratePressure(i / 100, profile);
        expect(v).toBeGreaterThanOrEqual(prev);
        expect(v).toBeLessThanOrEqual(1);
        prev = v;
      }
      expect(calibratePressure(1, profile)).toBe(1);
    }
    // 마우스는 상수 0.5를 0.7로
    expect(calibratePressure(0.5, DEVICE_PROFILES.mouse)).toBeCloseTo(0.7, 6);
  });

  it("tiltToSpherical: 수직 90°, 45° 기울기 변환", () => {
    expect(tiltToSpherical(0, 0)).toEqual({ altitudeDeg: 90, azimuthDeg: 0 });
    const t = tiltToSpherical(45, 0);
    expect(t.altitudeDeg).toBeCloseTo(45, 6);
    expect(t.azimuthDeg).toBeCloseTo(0, 6);
    expect(tiltToSpherical(0, 45).azimuthDeg).toBeCloseTo(90, 6);
  });
});

describe("모서리 보존·예측", () => {
  it("Menger 곡률: 직선 0, 직각 모서리에서 √2/d, 왼쪽 회전 양수", () => {
    expect(estimateCurvature({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toBe(0);
    const k = estimateCurvature({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 });
    expect(k).toBeCloseTo(Math.SQRT2 / 2, 6);
    expect(estimateCurvature({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: -2 })).toBeCloseTo(-Math.SQRT2 / 2, 6);
  });

  it("adaptiveCutoff: 곡률 ↑ → minCutoff ↑, 저속 → ×slowCutoffScale", () => {
    const base = { minCutoff: 1, beta: 0.01, dCutoff: 1 };
    const opts = { curvatureGain: 10, slowSpeedPxPerMs: 0.05, slowCutoffScale: 0.5 };
    expect(adaptiveCutoff(base, 0, 1, opts).minCutoff).toBe(1);
    expect(adaptiveCutoff(base, 0.5, 1, opts).minCutoff).toBeCloseTo(6, 6);
    expect(adaptiveCutoff(base, 0, 0.01, opts).minCutoff).toBeCloseTo(0.5, 6);
    expect(shouldSuppressPrediction(0.5, 1, 0.35, 0.05)).toBe(true);
    expect(shouldSuppressPrediction(0, 0.01, 0.35, 0.05)).toBe(true);
    expect(shouldSuppressPrediction(0, 1, 0.35, 0.05)).toBe(false);
  });

  it("predictSamples는 등속 외삽이고 source가 predicted다", () => {
    const { out } = runAll(lineStroke(0, 0, 100, 0, 0.5, { durationMs: 200 }));
    const preview = predictSamples(out.slice(0, 20), 8, 2);
    expect(preview.length).toBe(2);
    expect(preview.every((p) => p.source === "predicted")).toBe(true);
    expect(preview[1]?.x).toBeGreaterThan(preview[0]?.x ?? 0);
    expect(predictSamples([], 8, 2)).toEqual([]);
  });
});

describe("InputPipeline", () => {
  it("predicted 입력은 폐기하고 정본만 commit한다", () => {
    const raw = withPredicted(lineStroke(0, 0, 100, 10, 0.5, { durationMs: 200 }));
    const predictedCount = raw.filter((s) => s.source === "predicted").length;
    expect(predictedCount).toBeGreaterThan(0);
    const { out } = runAll(raw);
    const nonPredicted = raw.filter((s) => s.source !== "predicted");
    // up 1개는 finish()의 tail(기본 3샘플)로 바뀐다.
    expect(out.length).toBe(nonPredicted.length - 1 + DEFAULT_INPUT_CONFIG.endpointTailSamples);
    expect(out.every((s) => s.source === "raw" || s.source === "coalesced")).toBe(true);
    expect(out[0]?.phase).toBe("down");
    expect(out[out.length - 1]?.phase).toBe("up");
  });

  it("손떨림 fixture에서 잔차 RMS가 줄어든다", () => {
    const raw = tremorStroke(10, 50, 190, 50, 0.8, 3);
    const { out } = runAll(raw);
    const residual = (pts: readonly { x: number; y: number }[]): number => {
      let s = 0;
      for (const p of pts) s += (p.y - 50) * (p.y - 50);
      return Math.sqrt(s / pts.length);
    };
    expect(residual(out)).toBeLessThan(residual(raw) * 0.6);
    expect(residual(out)).toBeLessThan(0.5);
  });

  it("L자 코너: 경로 편차 ≤ 1.5 px, 오버슈트 0, 정점 통과", () => {
    const size = 200;
    const m = size * 0.2;
    const raw = cornerStroke(size, { durationMs: 600 });
    const { out } = runAll(raw);
    let maxDev = 0;
    let overshoot = 0;
    for (const s of out) {
      const d = Math.min(
        distanceToSegment(s.x, s.y, m, m, size - m, m),
        distanceToSegment(s.x, s.y, size - m, m, size - m, size - m),
      );
      maxDev = Math.max(maxDev, d);
      overshoot = Math.max(overshoot, s.x - (size - m), m - s.y);
    }
    expect(maxDev).toBeLessThanOrEqual(1.5);
    expect(overshoot).toBeLessThanOrEqual(1e-6);
    // 정점 근처 표본이 raw 좌표에 고정된다(모서리 둥글림 없음).
    const nearVertex = out.filter((s) => Math.abs(s.x - (size - m)) < 1e-6 && Math.abs(s.y - m) < 3);
    expect(nearVertex.length).toBeGreaterThan(0);
  });

  it("endpoint tail: 마지막 표본 좌표 = raw up, phase up, 압력 0으로 수렴", () => {
    const raw = lineStroke(0, 0, 120, 60, 0.7, { durationMs: 300 });
    const up = raw[raw.length - 1];
    if (!up) throw new Error("empty");
    const { out, pipeline } = runAll(raw);
    const last = out[out.length - 1];
    expect(last?.x).toBe(up.x);
    expect(last?.y).toBe(up.y);
    expect(last?.phase).toBe("up");
    expect(last?.pressure).toBe(0);
    expect(pipeline.finish()).toEqual([]);
  });

  it("latency 기록 길이 = commit 수 + tail 수, modeledTMs ≥ inputTMs", () => {
    const raw = lineStroke(0, 0, 50, 50, 0.5, { durationMs: 100 });
    const { out, pipeline } = runAll(raw);
    const records = pipeline.latency();
    expect(records.length).toBe(out.length);
    for (const r of records) expect(r.modeledTMs).toBeGreaterThanOrEqual(r.inputTMs);
  });

  it("down 표본은 raw 좌표에 고정되고 속도·방향이 채워진다", () => {
    const raw = lineStroke(5, 7, 105, 7, 0.5, { durationMs: 100 });
    const { out } = runAll(raw);
    expect(out[0]?.x).toBe(5);
    expect(out[0]?.y).toBe(7);
    const mid = out[Math.floor(out.length / 2)];
    expect(mid?.velocity).toBeGreaterThan(0);
    expect(mid?.dirX).toBeCloseTo(1, 6);
    expect(mid?.dirY).toBeCloseTo(0, 6);
  });

  it("resolveInputConfig는 부분 설정을 기본값 위에 얹는다", () => {
    const cfg = resolveInputConfig({ prediction: { enabled: false, horizonMs: 0 }, endpointTailSamples: 1 });
    expect(cfg.prediction.enabled).toBe(false);
    expect(cfg.endpointTailSamples).toBe(1);
    expect(cfg.oneEuro).toEqual(DEFAULT_INPUT_CONFIG.oneEuro);
    expect(resolveInputConfig(undefined)).toBe(DEFAULT_INPUT_CONFIG);
    const p = new InputPipeline(cfg);
    p.push(lineStroke(0, 0, 10, 0, 0.5, { durationMs: 50 }).slice(0, -1));
    expect(p.preview()).toEqual([]);
    expect(p.finish().length).toBe(1);
  });
});
