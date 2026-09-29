/**
 * 벡터 스트로크 컨트롤 포인트(앵커) 편집 (T2).
 *
 * 스트로크 선택 시 앵커 목록을 노출하고, 앵커 이동·추가·삭제를 순수 함수로
 * 제공한다. 이동은 이웃 핸들을 같은 델타만큼 평행 이동시켜 국소 형태를 유지하고,
 * 추가는 de Casteljau 분할(t=0.5)로 정확히 분할하며, 삭제는 이웃 세그먼트를
 * 병합한다(병합 구간은 근사 곡선이 되므로 문서에 명시).
 */

import type {
  VectorCubicSegment,
  VectorPoint2D,
  VectorStroke,
} from "./vector-layer-model";

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export interface VectorControlPoint extends VectorPoint2D {
  /** 앵커 인덱스 (0..segments.length). */
  readonly index: number;
  /** 해당 앵커의 선 굵기(px). */
  readonly width: number;
}

/** 스트로크 선택 시 편집 UI에 노출할 컨트롤 포인트 목록. */
export function getVectorStrokeControlPoints(
  stroke: VectorStroke
): VectorControlPoint[] {
  const points: VectorControlPoint[] = [];
  stroke.segments.forEach((segment, segmentIndex) => {
    if (segmentIndex === 0) {
      points.push({
        index: 0,
        x: segment.p0.x,
        y: segment.p0.y,
        width: stroke.widths[0] ?? 1,
      });
    }
    points.push({
      index: segmentIndex + 1,
      x: segment.p3.x,
      y: segment.p3.y,
      width: stroke.widths[segmentIndex + 1] ?? 1,
    });
  });
  return points;
}

function shiftPoint(point: VectorPoint2D, dx: number, dy: number): VectorPoint2D {
  return { x: point.x + dx, y: point.y + dy };
}

/**
 * 앵커 이동. 앵커에 연결된 베지어 핸들(p1/p2)도 같은 델타만큼 이동시켜
 * 이동 구간의 상대 형태를 유지한다.
 */
export function moveVectorControlPoint(
  stroke: VectorStroke,
  index: number,
  x: number,
  y: number
): VectorStroke {
  const anchorCount = stroke.segments.length + 1;
  if (!Number.isInteger(index) || index < 0 || index >= anchorCount) {
    return stroke;
  }
  const targetX = finiteNumber(x, 0);
  const targetY = finiteNumber(y, 0);
  const current = getVectorStrokeControlPoints(stroke)[index];
  if (!current) return stroke;
  const dx = targetX - current.x;
  const dy = targetY - current.y;
  if (dx === 0 && dy === 0) return stroke;
  const segments = stroke.segments.map((segment, segmentIndex) => {
    let next: VectorCubicSegment = segment;
    // 앵커 index는 segment[index-1].p3 이자 segment[index].p0 이다.
    if (segmentIndex === index - 1) {
      next = {
        ...next,
        p2: shiftPoint(next.p2, dx, dy),
        p3: shiftPoint(next.p3, dx, dy),
      };
    }
    if (segmentIndex === index) {
      next = {
        ...next,
        p0: shiftPoint(next.p0, dx, dy),
        p1: shiftPoint(next.p1, dx, dy),
      };
    }
    return next;
  });
  return { ...stroke, segments };
}

function splitCubicAtHalf(
  segment: VectorCubicSegment
): [VectorCubicSegment, VectorCubicSegment] {
  const mid = (a: VectorPoint2D, b: VectorPoint2D): VectorPoint2D => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const q0 = mid(segment.p0, segment.p1);
  const q1 = mid(segment.p1, segment.p2);
  const q2 = mid(segment.p2, segment.p3);
  const r0 = mid(q0, q1);
  const r1 = mid(q1, q2);
  const s = mid(r0, r1);
  return [
    { p0: segment.p0, p1: q0, p2: r0, p3: s },
    { p0: s, p1: r1, p2: q2, p3: segment.p3 },
  ];
}

/**
 * 앵커 `index` 뒤에 새 컨트롤 포인트를 추가한다.
 * `index`와 `index+1` 사이 세그먼트를 t=0.5에서 de Casteljau 분할하므로
 * 곡선 형태는 정확히 유지되고, 새 앵커의 굵기는 양옆을 선형 보간한다.
 */
export function insertVectorControlPoint(
  stroke: VectorStroke,
  index: number
): VectorStroke {
  const segmentCount = stroke.segments.length;
  if (!Number.isInteger(index) || index < 0 || index >= segmentCount) {
    return stroke;
  }
  const target = stroke.segments[index];
  if (!target) return stroke;
  const [first, second] = splitCubicAtHalf(target);
  const segments = [
    ...stroke.segments.slice(0, index),
    first,
    second,
    ...stroke.segments.slice(index + 1),
  ];
  const widthBefore = stroke.widths[index] ?? 1;
  const widthAfter = stroke.widths[index + 1] ?? widthBefore;
  const widths = [
    ...stroke.widths.slice(0, index + 1),
    (widthBefore + widthAfter) / 2,
    ...stroke.widths.slice(index + 1),
  ];
  return { ...stroke, segments, widths };
}

/**
 * 앵커 `index`를 삭제한다. 양옆 세그먼트를 하나로 병합하며,
 * 바깥 핸들(p1/p2)은 유지하므로 병합 구간은 근사 곡선이 된다.
 * 앵커가 2개(세그먼트 1개)뿐이면 삭제할 수 없어 null을 반환한다.
 */
export function removeVectorControlPoint(
  stroke: VectorStroke,
  index: number
): VectorStroke | null {
  const anchorCount = stroke.segments.length + 1;
  if (anchorCount <= 2) return null;
  if (!Number.isInteger(index) || index < 0 || index >= anchorCount) {
    return null;
  }
  let segments: VectorCubicSegment[];
  if (index === 0) {
    segments = stroke.segments.slice(1);
  } else if (index === anchorCount - 1) {
    segments = stroke.segments.slice(0, -1);
  } else {
    const previous = stroke.segments[index - 1]!;
    const next = stroke.segments[index]!;
    const merged: VectorCubicSegment = {
      p0: previous.p0,
      p1: previous.p1,
      p2: next.p2,
      p3: next.p3,
    };
    segments = [
      ...stroke.segments.slice(0, index - 1),
      merged,
      ...stroke.segments.slice(index + 1),
    ];
  }
  const widths = [
    ...stroke.widths.slice(0, index),
    ...stroke.widths.slice(index + 1),
  ];
  return { ...stroke, segments, widths };
}
