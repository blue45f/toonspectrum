import { describe, expect, it } from "vitest";

import {
  clampVectorWidthScale,
  createVectorLayer,
  createVectorStroke,
  isVectorLayer,
  isVectorStroke,
  normalizeVectorBrushShapeId,
  normalizeVectorOpacity,
  normalizeVectorStrokeWidths,
  VECTOR_BRUSH_SHAPES,
  VECTOR_LAYER_TYPE,
  VECTOR_WIDTH_SCALE_MAX,
  VECTOR_WIDTH_SCALE_MIN,
  vectorStrokeAnchors,
  vectorStrokeBounds,
  type VectorCubicSegment,
} from "./vector-layer-model";

function segment(x0: number, x1: number): VectorCubicSegment {
  return {
    p0: { x: x0, y: 0 },
    p1: { x: x0, y: 0 },
    p2: { x: x1, y: 0 },
    p3: { x: x1, y: 0 },
  };
}

describe("vector-layer-model", () => {
  it("VECTOR_LAYER_TYPE 마커가 'vector' 이다", () => {
    expect(VECTOR_LAYER_TYPE).toBe("vector");
  });

  it("브러시 모양 프리셋 3종(둥근/납작/캘리그래피)을 제공한다", () => {
    expect(VECTOR_BRUSH_SHAPES.map((shape) => shape.id)).toEqual([
      "round",
      "flat",
      "calligraphy",
    ]);
    expect(normalizeVectorBrushShapeId("flat")).toBe("flat");
    expect(normalizeVectorBrushShapeId("unknown")).toBe("round");
  });

  it("폭 스케일 범위를 0.1~5 로 클램프한다", () => {
    expect(VECTOR_WIDTH_SCALE_MIN).toBe(0.1);
    expect(VECTOR_WIDTH_SCALE_MAX).toBe(5);
    expect(clampVectorWidthScale(0.05)).toBe(0.1);
    expect(clampVectorWidthScale(10)).toBe(5);
    expect(clampVectorWidthScale(2)).toBe(2);
    expect(clampVectorWidthScale(Number.NaN)).toBe(1);
  });

  it("불투명도를 0~1 로 정규화한다", () => {
    expect(normalizeVectorOpacity(1.5)).toBe(1);
    expect(normalizeVectorOpacity(-0.2)).toBe(0);
    expect(normalizeVectorOpacity(0.4)).toBe(0.4);
  });

  it("createVectorStroke 가 폭 프로파일 길이를 앵커 수에 맞춘다", () => {
    const segments = [segment(0, 10), segment(10, 20)];
    const stroke = createVectorStroke({
      id: "s1",
      segments,
      widths: [2, 8],
      color: "#ff0000",
      opacity: 0.5,
    });
    // 앵커 3개에 맞춰 선형 보간
    expect(stroke.widths).toEqual([2, 5, 8]);
    expect(stroke.opacity).toBe(0.5);
    expect(stroke.brushShapeId).toBe("round");
  });

  it("createVectorStroke 가 빈 색상·잘못된 모양을 보정한다", () => {
    const stroke = createVectorStroke({
      id: "s1",
      segments: [segment(0, 10)],
      widths: [4],
      color: "",
      brushShapeId: "nope" as never,
    });
    expect(stroke.color).toBe("#000000");
    expect(stroke.brushShapeId).toBe("round");
    expect(stroke.widths).toEqual([4, 4]);
  });

  it("normalizeVectorStrokeWidths 가 하한을 강제한다", () => {
    const widths = normalizeVectorStrokeWidths([segment(0, 10)], [0, -3]);
    expect(widths.every((width) => width >= 0.25)).toBe(true);
  });

  it("createVectorLayer 가 기본값을 채운다", () => {
    const layer = createVectorLayer({ id: "l1" });
    expect(layer.type).toBe("vector");
    expect(layer.name).toBe("벡터 레이어");
    expect(layer.visible).toBe(true);
    expect(layer.locked).toBe(false);
    expect(layer.strokes).toEqual([]);
  });

  it("isVectorStroke 가드가 폭/세그먼트 개수 불일치를 거부한다", () => {
    const valid = createVectorStroke({
      id: "s1",
      segments: [segment(0, 10)],
      widths: [4, 4],
      color: "#000",
      opacity: 1,
    });
    expect(isVectorStroke(valid)).toBe(true);
    expect(
      isVectorStroke({ ...valid, widths: [4, 4, 4] })
    ).toBe(false);
    expect(isVectorStroke({ ...valid, brushShapeId: "crayon" })).toBe(false);
    expect(isVectorStroke(null)).toBe(false);
    expect(isVectorStroke({ id: "x" })).toBe(false);
  });

  it("isVectorLayer 가드가 type 마커를 검사한다", () => {
    const layer = createVectorLayer({ id: "l1", name: "L" });
    expect(isVectorLayer(layer)).toBe(true);
    expect(isVectorLayer({ ...layer, type: "raster" })).toBe(false);
    expect(isVectorLayer({ ...layer, strokes: [{}] })).toBe(false);
  });

  it("vectorStrokeAnchors 가 베지어 끝점을 순서대로 반환한다", () => {
    const stroke = createVectorStroke({
      id: "s1",
      segments: [segment(0, 10), segment(10, 30)],
      widths: [1, 1, 1],
      color: "#000",
    });
    expect(vectorStrokeAnchors(stroke)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 30, y: 0 },
    ]);
  });

  it("vectorStrokeBounds 가 굵기를 포함한 경계 상자를 반환한다", () => {
    const stroke = createVectorStroke({
      id: "s1",
      segments: [segment(0, 10)],
      widths: [4, 4],
      color: "#000",
    });
    const bounds = vectorStrokeBounds(stroke);
    expect(bounds).toEqual({ minX: -2, minY: -2, maxX: 12, maxY: 2 });
  });

  it("빈 스트로크의 경계 상자는 null 이다", () => {
    const stroke = createVectorStroke({
      id: "s1",
      segments: [],
      widths: [],
      color: "#000",
    });
    expect(vectorStrokeBounds(stroke)).toBeNull();
  });
});
