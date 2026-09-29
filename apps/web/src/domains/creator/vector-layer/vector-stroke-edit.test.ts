import { describe, expect, it } from "vitest";

import { pointsToVectorStroke } from "./vector-stroke-path";
import type { VectorStroke } from "./vector-layer-model";
import {
  eraseVectorStrokes,
  pointToSegmentDistance,
  replaceVectorBrushShape,
  scaleVectorStrokeWidths,
  segmentsIntersect,
  vectorEraserHitsStroke,
} from "./vector-stroke-edit";

function horizontalStroke(id: string, width: number): VectorStroke {
  return pointsToVectorStroke(
    [
      { x: 0, y: 0, pressure: 1 },
      { x: 50, y: 0, pressure: 1 },
      { x: 100, y: 0, pressure: 1 },
    ],
    { baseWidth: width, id }
  )!;
}

function diagonalStroke(id: string): VectorStroke {
  // 45° 대각선: 캘리그래피 기본 펜촉각(45°)과 진행각이 일치 → 최소 배율
  return pointsToVectorStroke(
    [
      { x: 0, y: 0, pressure: 1 },
      { x: 100, y: 100, pressure: 1 },
    ],
    { baseWidth: 10, id }
  )!;
}

describe("scaleVectorStrokeWidths", () => {
  it("배율을 폭 프로파일 전체에 곱한다", () => {
    const stroke = horizontalStroke("s1", 4);
    const [scaled] = scaleVectorStrokeWidths([stroke], 2);
    expect(scaled!.widths.every((width) => width === 8)).toBe(true);
    // 원본 불변
    expect(stroke.widths.every((width) => width === 4)).toBe(true);
  });

  it("배율 범위를 0.1~5 로 클램프한다", () => {
    const stroke = horizontalStroke("s1", 10);
    const [tiny] = scaleVectorStrokeWidths([stroke], 0.01);
    expect(tiny!.widths[0]).toBeCloseTo(1, 9); // 10 * 0.1
    const [huge] = scaleVectorStrokeWidths([stroke], 100);
    expect(huge!.widths[0]).toBeCloseTo(50, 9); // 10 * 5
  });

  it("strokeIds 범위로 지정된 스트로크만 조정한다", () => {
    const first = horizontalStroke("s1", 4);
    const second = horizontalStroke("s2", 4);
    const result = scaleVectorStrokeWidths([first, second], 2, {
      strokeIds: ["s2"],
    });
    expect(result[0]).toBe(first); // 범위 밖은 동일 참조 유지
    expect(result[1]!.widths[0]).toBe(8);
  });

  it("결과 폭이 최소 px 하한을 지킨다", () => {
    const stroke = horizontalStroke("s1", 0.3);
    const [scaled] = scaleVectorStrokeWidths([stroke], 0.1);
    expect(scaled!.widths.every((width) => width >= 0.25)).toBe(true);
  });
});

describe("replaceVectorBrushShape", () => {
  it("round 는 프로파일을 유지하고 모양 id만 교체한다", () => {
    const stroke = horizontalStroke("s1", 6);
    const replaced = replaceVectorBrushShape(
      { ...stroke, brushShapeId: "flat" },
      "round"
    );
    expect(replaced.brushShapeId).toBe("round");
    expect(replaced.widths).toEqual(stroke.widths);
  });

  it("flat 은 양 끝을 가늘게 만든다", () => {
    const stroke = horizontalStroke("s1", 10);
    const replaced = replaceVectorBrushShape(stroke, "flat");
    expect(replaced.brushShapeId).toBe("flat");
    const widths = replaced.widths;
    expect(widths.length).toBeGreaterThanOrEqual(3);
    // t=0/1 끝: 0.55 배율, t=0.5 중앙: 1.0 배율
    expect(widths[0]!).toBeLessThan(widths[Math.floor(widths.length / 2)]!);
    expect(widths[widths.length - 1]!).toBeLessThan(
      widths[Math.floor(widths.length / 2)]!
    );
  });

  it("calligraphy 는 펜촉각과 진행각의 관계로 굵기를 변조한다", () => {
    // 45° 대각선 + 기본 펜촉각 45° → |sin(0)| = 0 → 0.35 배율
    const diagonal = replaceVectorBrushShape(diagonalStroke("d1"), "calligraphy");
    expect(diagonal.brushShapeId).toBe("calligraphy");
    expect(diagonal.widths[0]!).toBeCloseTo(10 * 0.35, 6);
    // -45° 대각선 → |sin(-90°)| = 1 → 1.0 배율(유지)
    const counter = pointsToVectorStroke(
      [
        { x: 0, y: 100, pressure: 1 },
        { x: 100, y: 0, pressure: 1 },
      ],
      { baseWidth: 10, id: "d2" }
    )!;
    const kept = replaceVectorBrushShape(counter, "calligraphy");
    expect(kept.widths[0]!).toBeCloseTo(10, 6);
  });

  it("원본 스트로크를 변경하지 않는다", () => {
    const stroke = horizontalStroke("s1", 6);
    const before = [...stroke.widths];
    replaceVectorBrushShape(stroke, "flat");
    expect(stroke.widths).toEqual(before);
    expect(stroke.brushShapeId).toBe("round");
  });
});

describe("segmentsIntersect", () => {
  it("교차하는 선분은 true", () => {
    expect(
      segmentsIntersect(
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 10, y: 0 }
      )
    ).toBe(true);
  });

  it("떨어진 평행 선분은 false", () => {
    expect(
      segmentsIntersect(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 5 },
        { x: 10, y: 5 }
      )
    ).toBe(false);
  });

  it("끝점 접촉도 교차로 본다", () => {
    expect(
      segmentsIntersect(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 }
      )
    ).toBe(true);
  });

  it("동일선상 겹침도 교차로 본다", () => {
    expect(
      segmentsIntersect(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 0 },
        { x: 15, y: 0 }
      )
    ).toBe(true);
  });

  it("동일선상이지만 겹치지 않으면 false", () => {
    expect(
      segmentsIntersect(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 11, y: 0 },
        { x: 20, y: 0 }
      )
    ).toBe(false);
  });
});

describe("pointToSegmentDistance", () => {
  it("수직 거리를 반환한다", () => {
    expect(
      pointToSegmentDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })
    ).toBeCloseTo(3, 9);
  });

  it("선분 밖의 점은 끝점까지 거리를 반환한다", () => {
    expect(
      pointToSegmentDistance({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })
    ).toBeCloseTo(5, 9);
  });
});

describe("eraseVectorStrokes", () => {
  it("지우개와 교차한 스트로크 전체를 삭제한다", () => {
    const target = horizontalStroke("target", 4);
    const other = pointsToVectorStroke(
      [
        { x: 0, y: 100, pressure: 1 },
        { x: 100, y: 100, pressure: 1 },
      ],
      { baseWidth: 4, id: "other" }
    )!;
    const result = eraseVectorStrokes(
      [target, other],
      [
        { x: 50, y: -20 },
        { x: 50, y: 20 },
      ],
      6
    );
    expect(result.removed.map((stroke) => stroke.id)).toEqual(["target"]);
    expect(result.kept.map((stroke) => stroke.id)).toEqual(["other"]);
  });

  it("접촉하지 않으면 모두 유지된다", () => {
    const stroke = horizontalStroke("s1", 4);
    const result = eraseVectorStrokes(
      [stroke],
      [
        { x: 200, y: 200 },
        { x: 300, y: 300 },
      ],
      6
    );
    expect(result.removed).toEqual([]);
    expect(result.kept).toEqual([stroke]);
  });

  it("끝점 접촉도 삭제 대상이다", () => {
    const stroke = horizontalStroke("s1", 4);
    const result = eraseVectorStrokes(
      [stroke],
      [
        { x: 100, y: 0 },
        { x: 100, y: 60 },
      ],
      2
    );
    expect(result.removed).toEqual([stroke]);
    expect(result.kept).toEqual([]);
  });

  it("지우개 반경+스트로크 반경 이내 근접도 삭제 대상이다", () => {
    const stroke = horizontalStroke("s1", 4); // 반경 2
    const result = eraseVectorStrokes(
      [stroke],
      [
        { x: 50, y: 8 },
        { x: 60, y: 8 },
      ],
      10 // 반경 5 → 합 7 + 여유 1 = 8, 거리 8 이내
    );
    expect(result.removed).toEqual([stroke]);
  });

  it("점(dot) 스트로크도 지우개에 맞으면 삭제된다", () => {
    const dot = pointsToVectorStroke([{ x: 5, y: 5, pressure: 1 }], {
      baseWidth: 8,
      id: "dot",
    })!;
    const hit = eraseVectorStrokes(dot ? [dot] : [], [{ x: 5, y: 5 }], 4);
    expect(hit.removed).toHaveLength(1);
    const miss = eraseVectorStrokes([dot], [{ x: 100, y: 100 }], 4);
    expect(miss.kept).toHaveLength(1);
  });
});

describe("vectorEraserHitsStroke", () => {
  it("빈 입력은 false", () => {
    expect(vectorEraserHitsStroke([], [], [{ x: 0, y: 0 }], 4)).toBe(false);
    expect(
      vectorEraserHitsStroke([{ x: 0, y: 0 }], [4], [], 4)
    ).toBe(false);
  });
});
