import { describe, expect, it } from "vitest";

import {
  catmullRomToBezier,
  pointsToVectorStroke,
  pressuresToWidths,
  sampleVectorStrokePath,
  vectorStrokeAnchorAngles,
} from "./vector-stroke-path";

describe("catmullRomToBezier", () => {
  it("직선 입력은 모든 핸들이 직선 위에 있다", () => {
    const segments = catmullRomToBezier([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ]);
    expect(segments).toHaveLength(3);
    for (const segment of segments) {
      expect(segment.p1.y).toBeCloseTo(0, 9);
      expect(segment.p2.y).toBeCloseTo(0, 9);
    }
  });

  it("곡선이 모든 입력 점을 정확히 통과한다(앵커 보존)", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 8 },
      { x: 20, y: -4 },
      { x: 30, y: 6 },
    ];
    const segments = catmullRomToBezier(points);
    expect(segments).toHaveLength(points.length - 1);
    expect(segments[0]!.p0).toEqual(points[0]);
    segments.forEach((segment, index) => {
      expect(segment.p3).toEqual(points[index + 1]);
      if (index > 0) {
        // 끝점 공유 규칙
        expect(segment.p0).toEqual(segments[index - 1]!.p3);
      }
    });
  });

  it("2개 미만 입력은 빈 배열을 반환한다", () => {
    expect(catmullRomToBezier([])).toEqual([]);
    expect(catmullRomToBezier([{ x: 1, y: 2 }])).toEqual([]);
  });

  it("표준 Catmull-Rom 계수(1/6)를 따른다", () => {
    const segments = catmullRomToBezier([
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 12, y: 0 },
      { x: 18, y: 0 },
    ]);
    // segment 1: c1 = p1 + (p2 - p0)/6 = 6 + 12/6 = 8
    expect(segments[1]!.p1.x).toBeCloseTo(8, 9);
    // segment 1: c2 = p2 - (p3 - p1)/6 = 12 - 12/6 = 10
    expect(segments[1]!.p2.x).toBeCloseTo(10, 9);
  });
});

describe("pressuresToWidths", () => {
  it("필압 0/1 이 minRatio/baseWidth 에 매핑된다", () => {
    const widths = pressuresToWidths([0, 0.5, 1], {
      baseWidth: 10,
      minPressureRatio: 0.3,
    });
    // 이동 평균 스무딩 때문에 근사치로 검증
    expect(widths[0]).toBeGreaterThan(3);
    expect(widths[0]).toBeLessThan(6.5);
    expect(widths[2]).toBeGreaterThan(8);
    expect(widths[2]).toBeLessThanOrEqual(10);
  });

  it("필압이 단조 증가하면 폭도 단조 증가한다", () => {
    const widths = pressuresToWidths(
      [0.1, 0.3, 0.5, 0.7, 0.9],
      { baseWidth: 8 }
    );
    for (let index = 1; index < widths.length; index += 1) {
      expect(widths[index]!).toBeGreaterThanOrEqual(widths[index - 1]!);
    }
  });

  it("필압이 없으면 0.5(중간)로 간주한다", () => {
    const widths = pressuresToWidths([undefined, undefined], {
      baseWidth: 10,
      minPressureRatio: 0.3,
    });
    expect(widths[0]).toBeCloseTo(10 * (0.3 + 0.7 * 0.5), 9);
  });

  it("하한을 강제한다", () => {
    const widths = pressuresToWidths([0], {
      baseWidth: 0.01,
      minWidthPx: 0.25,
    });
    expect(widths[0]).toBeGreaterThanOrEqual(0.25);
  });
});

describe("pointsToVectorStroke", () => {
  it("빈 입력은 null 을 반환한다", () => {
    expect(
      pointsToVectorStroke([], { baseWidth: 4 })
    ).toBeNull();
  });

  it("단일 입력은 점(dot) 스트로크가 된다", () => {
    const stroke = pointsToVectorStroke([{ x: 5, y: 7, pressure: 1 }], {
      baseWidth: 6,
      id: "dot",
    });
    expect(stroke).not.toBeNull();
    expect(stroke!.id).toBe("dot");
    expect(stroke!.segments).toHaveLength(1);
    expect(stroke!.widths).toHaveLength(2);
    const segment = stroke!.segments[0]!;
    expect(segment.p0).toEqual({ x: 5, y: 7 });
    expect(segment.p3).toEqual({ x: 5, y: 7 });
  });

  it("N개 입력 → N-1 세그먼트, N개 폭 프로파일", () => {
    const stroke = pointsToVectorStroke(
      [
        { x: 0, y: 0, pressure: 0.2 },
        { x: 10, y: 0, pressure: 0.8 },
        { x: 20, y: 5, pressure: 1 },
        { x: 30, y: 5, pressure: 0.4 },
      ],
      { baseWidth: 10, color: "#123456", opacity: 0.8 }
    );
    expect(stroke).not.toBeNull();
    expect(stroke!.segments).toHaveLength(3);
    expect(stroke!.widths).toHaveLength(4);
    expect(stroke!.color).toBe("#123456");
    expect(stroke!.opacity).toBe(0.8);
  });
});

describe("sampleVectorStrokePath", () => {
  it("세그먼트당 샘플 수 × 세그먼트 + 끝점 1개를 반환한다", () => {
    const stroke = pointsToVectorStroke(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
      { baseWidth: 4 }
    )!;
    const samples = sampleVectorStrokePath(stroke, 8);
    expect(samples).toHaveLength(2 * 8 + 1);
    expect(samples[0]).toMatchObject({ x: 0, y: 0 });
    const last = samples[samples.length - 1]!;
    expect(last.x).toBeCloseTo(20, 9);
    expect(last.y).toBeCloseTo(0, 9);
  });

  it("수평선의 접선 각도는 0 이다", () => {
    const stroke = pointsToVectorStroke(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      { baseWidth: 4 }
    )!;
    const samples = sampleVectorStrokePath(stroke, 4);
    for (const sample of samples) {
      expect(sample.angle).toBeCloseTo(0, 9);
    }
  });
});

describe("vectorStrokeAnchorAngles", () => {
  it("수평선 앵커 각도는 0, 수직선은 π/2 이다", () => {
    const horizontal = pointsToVectorStroke(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      { baseWidth: 4 }
    )!;
    expect(vectorStrokeAnchorAngles(horizontal)).toEqual([0, 0]);
    const vertical = pointsToVectorStroke(
      [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
      ],
      { baseWidth: 4 }
    )!;
    const angles = vectorStrokeAnchorAngles(vertical);
    expect(angles[0]).toBeCloseTo(Math.PI / 2, 9);
    expect(angles[1]).toBeCloseTo(Math.PI / 2, 9);
  });
});
