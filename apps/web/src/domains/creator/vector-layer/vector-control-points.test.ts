import { describe, expect, it } from "vitest";

import { pointsToVectorStroke } from "./vector-stroke-path";
import {
  getVectorStrokeControlPoints,
  insertVectorControlPoint,
  moveVectorControlPoint,
  removeVectorControlPoint,
} from "./vector-control-points";

function sampleStroke() {
  return pointsToVectorStroke(
    [
      { x: 0, y: 0, pressure: 1 },
      { x: 10, y: 0, pressure: 0.5 },
      { x: 20, y: 10, pressure: 1 },
    ],
    { baseWidth: 4, id: "s1" }
  )!;
}

describe("getVectorStrokeControlPoints", () => {
  it("앵커 목록을 순서대로 반환한다", () => {
    const points = getVectorStrokeControlPoints(sampleStroke());
    expect(points).toHaveLength(3);
    expect(points.map((point) => point.index)).toEqual([0, 1, 2]);
    expect(points[0]).toMatchObject({ x: 0, y: 0 });
    expect(points[1]).toMatchObject({ x: 10, y: 0 });
    expect(points[2]).toMatchObject({ x: 20, y: 10 });
  });

  it("앵커별 굵기를 함께 반환한다", () => {
    const stroke = sampleStroke();
    const points = getVectorStrokeControlPoints(stroke);
    points.forEach((point, index) => {
      expect(point.width).toBe(stroke.widths[index]);
    });
  });
});

describe("moveVectorControlPoint", () => {
  it("앵커를 목표 위치로 이동한다", () => {
    const moved = moveVectorControlPoint(sampleStroke(), 1, 10, 5);
    const points = getVectorStrokeControlPoints(moved);
    expect(points[1]).toMatchObject({ x: 10, y: 5 });
    // 다른 앵커는 그대로
    expect(points[0]).toMatchObject({ x: 0, y: 0 });
    expect(points[2]).toMatchObject({ x: 20, y: 10 });
  });

  it("이웃 핸들을 같은 델타만큼 평행 이동한다", () => {
    const original = sampleStroke();
    const moved = moveVectorControlPoint(original, 1, 12, 3);
    const dx = 2;
    const dy = 3;
    // segment 0 의 p2/p3, segment 1 의 p0/p1 이 델타만큼 이동
    expect(moved.segments[0]!.p3.x).toBe(original.segments[0]!.p3.x + dx);
    expect(moved.segments[0]!.p2.y).toBe(original.segments[0]!.p2.y + dy);
    expect(moved.segments[1]!.p0.x).toBe(original.segments[1]!.p0.x + dx);
    expect(moved.segments[1]!.p1.y).toBe(original.segments[1]!.p1.y + dy);
  });

  it("첫/마지막 앵커 이동도 한쪽 핸들만 건드린다", () => {
    const moved = moveVectorControlPoint(sampleStroke(), 0, -5, -5);
    const points = getVectorStrokeControlPoints(moved);
    expect(points[0]).toMatchObject({ x: -5, y: -5 });
    expect(points[2]).toMatchObject({ x: 20, y: 10 });
  });

  it("범위 밖 인덱스는 원본을 그대로 반환한다", () => {
    const stroke = sampleStroke();
    expect(moveVectorControlPoint(stroke, 99, 0, 0)).toBe(stroke);
    expect(moveVectorControlPoint(stroke, -1, 0, 0)).toBe(stroke);
  });

  it("원본을 변경하지 않는다", () => {
    const stroke = sampleStroke();
    const snapshot = JSON.stringify(stroke.segments);
    moveVectorControlPoint(stroke, 1, 99, 99);
    expect(JSON.stringify(stroke.segments)).toBe(snapshot);
  });
});

describe("insertVectorControlPoint", () => {
  it("세그먼트를 de Casteljau 로 정확히 분할한다", () => {
    const original = sampleStroke();
    const inserted = insertVectorControlPoint(original, 0);
    expect(inserted.segments).toHaveLength(3);
    expect(inserted.widths).toHaveLength(4);
    const points = getVectorStrokeControlPoints(inserted);
    expect(points).toHaveLength(4);
    // 새 앵커는 원래 segment 0 의 t=0.5 지점
    const segment = original.segments[0]!;
    const t = 0.5;
    const mt = 1 - t;
    const expectedX =
      mt * mt * mt * segment.p0.x
      + 3 * mt * mt * t * segment.p1.x
      + 3 * mt * t * t * segment.p2.x
      + t * t * t * segment.p3.x;
    const expectedY =
      mt * mt * mt * segment.p0.y
      + 3 * mt * mt * t * segment.p1.y
      + 3 * mt * t * t * segment.p2.y
      + t * t * t * segment.p3.y;
    expect(points[1]!.x).toBeCloseTo(expectedX, 9);
    expect(points[1]!.y).toBeCloseTo(expectedY, 9);
  });

  it("새 앵커의 굵기는 양옆 선형 보간이다", () => {
    const inserted = insertVectorControlPoint(sampleStroke(), 0);
    const expected = (inserted.widths[0]! + inserted.widths[2]!) / 2;
    expect(inserted.widths[1]).toBeCloseTo(expected, 9);
  });

  it("범위 밖 인덱스는 원본을 그대로 반환한다", () => {
    const stroke = sampleStroke();
    expect(insertVectorControlPoint(stroke, 5)).toBe(stroke);
  });
});

describe("removeVectorControlPoint", () => {
  it("중간 앵커 삭제 시 양옆 세그먼트가 병합된다", () => {
    const original = sampleStroke();
    const removed = removeVectorControlPoint(original, 1);
    expect(removed).not.toBeNull();
    expect(removed!.segments).toHaveLength(1);
    expect(removed!.widths).toHaveLength(2);
    const merged = removed!.segments[0]!;
    // 바깥 핸들은 유지되는 근사 병합
    expect(merged.p0).toEqual(original.segments[0]!.p0);
    expect(merged.p1).toEqual(original.segments[0]!.p1);
    expect(merged.p2).toEqual(original.segments[1]!.p2);
    expect(merged.p3).toEqual(original.segments[1]!.p3);
    expect(removed!.widths).toEqual([
      original.widths[0],
      original.widths[2],
    ]);
  });

  it("첫/마지막 앵커 삭제 시 해당 세그먼트가 떨어진다", () => {
    const first = removeVectorControlPoint(sampleStroke(), 0)!;
    expect(first.segments).toHaveLength(1);
    expect(getVectorStrokeControlPoints(first)[0]).toMatchObject({
      x: 10,
      y: 0,
    });
    const last = removeVectorControlPoint(sampleStroke(), 2)!;
    expect(last.segments).toHaveLength(1);
    expect(getVectorStrokeControlPoints(last)[1]).toMatchObject({
      x: 10,
      y: 0,
    });
  });

  it("앵커가 2개뿐이면 삭제할 수 없어 null 을 반환한다", () => {
    const twoAnchors = pointsToVectorStroke(
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      { baseWidth: 4 }
    )!;
    expect(removeVectorControlPoint(twoAnchors, 0)).toBeNull();
    expect(removeVectorControlPoint(twoAnchors, 1)).toBeNull();
  });

  it("범위 밖 인덱스는 null 을 반환한다", () => {
    expect(removeVectorControlPoint(sampleStroke(), 99)).toBeNull();
  });
});
