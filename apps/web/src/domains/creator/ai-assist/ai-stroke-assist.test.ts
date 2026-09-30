import { describe, expect, it } from "vitest";

import {
  mirrorStrokeSymmetric,
  normalizeStrokePressure,
  oneEuroFilter1D,
  createOneEuroFilterState,
  smoothStrokeChaikin,
  stabilizeStroke,
  strokeLength,
  type AiStrokePoint,
} from "./ai-stroke-assist";

function makePoints(n: number): AiStrokePoint[] {
  return Array.from({ length: n }, (_, i) => ({
    x: i * 10,
    y: Math.sin(i) * 5,
    pressure: 0.5 + (i % 3) * 0.1,
    timestamp: i * 16,
  }));
}

describe("oneEuroFilter1D", () => {
  it("첫 값은 그대로 반환한다", () => {
    const state = createOneEuroFilterState();
    expect(oneEuroFilter1D(state, 42, 1000)).toBe(42);
  });

  it("떨림을 완화한다", () => {
    const state = createOneEuroFilterState();
    const noisy = [100, 105, 95, 104, 96, 103, 97];
    const filtered = noisy.map((v, i) => oneEuroFilter1D(state, v, i * 16, 0.5));
    // 필터링된 값들의 분산이 원본보다 작아야 함
    const variance = (arr: number[]): number => {
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      return arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
    };
    expect(variance(filtered)).toBeLessThan(variance(noisy));
  });
});

describe("stabilizeStroke", () => {
  it("빈 배열은 빈 배열을 반환한다", () => {
    expect(stabilizeStroke([], 0.8)).toEqual([]);
  });

  it("포인트 수를 유지한다", () => {
    const points = makePoints(10);
    expect(stabilizeStroke(points, 0.8)).toHaveLength(10);
  });
});

describe("smoothStrokeChaikin", () => {
  it("포인트가 늘어난다 (곡선 세분화)", () => {
    const points = makePoints(5);
    const smoothed = smoothStrokeChaikin(points, 1);
    expect(smoothed.length).toBeGreaterThan(points.length);
  });

  it("2개 이하 포인트는 그대로 반환한다", () => {
    const points = makePoints(2);
    expect(smoothStrokeChaikin(points, 2)).toHaveLength(2);
  });

  it("시작점과 끝점은 유지된다", () => {
    const points = makePoints(6);
    const smoothed = smoothStrokeChaikin(points, 2);
    expect(smoothed[0].x).toBe(points[0].x);
    expect(smoothed[smoothed.length - 1].x).toBe(points[points.length - 1].x);
  });
});

describe("mirrorStrokeSymmetric", () => {
  it("수직 대칭 미러를 생성한다", () => {
    const points: AiStrokePoint[] = [{ x: 10, y: 20, pressure: 0.5, timestamp: 0 }];
    const result = mirrorStrokeSymmetric(points, "vertical", 100, 100);
    expect(result).toHaveLength(2);
    expect(result[1].x).toBe(190); // 2*100 - 10
    expect(result[1].y).toBe(20);
  });

  it("none이면 원본만 반환한다", () => {
    const points = makePoints(3);
    expect(mirrorStrokeSymmetric(points, "none", 50, 50)).toHaveLength(3);
  });

  it("both면 양축 대칭이다", () => {
    const points: AiStrokePoint[] = [{ x: 10, y: 20, pressure: 0.5, timestamp: 0 }];
    const result = mirrorStrokeSymmetric(points, "both", 100, 100);
    expect(result[1].x).toBe(190);
    expect(result[1].y).toBe(180);
  });
});

describe("normalizeStrokePressure", () => {
  it("intensity 1이면 모든 압력이 평균이 된다", () => {
    const points = makePoints(6);
    const result = normalizeStrokePressure(points, 1);
    const avg = points.reduce((s, p) => s + p.pressure, 0) / points.length;
    for (const p of result) {
      expect(p.pressure).toBeCloseTo(avg, 10);
    }
  });

  it("intensity 0이면 원본 유지", () => {
    const points = makePoints(4);
    const result = normalizeStrokePressure(points, 0);
    expect(result.map((p) => p.pressure)).toEqual(points.map((p) => p.pressure));
  });
});

describe("strokeLength", () => {
  it("직선 길이를 계산한다", () => {
    const points: AiStrokePoint[] = [
      { x: 0, y: 0, pressure: 0.5, timestamp: 0 },
      { x: 3, y: 4, pressure: 0.5, timestamp: 16 },
    ];
    expect(strokeLength(points)).toBe(5);
  });

  it("빈 배열은 0이다", () => {
    expect(strokeLength([])).toBe(0);
  });
});
