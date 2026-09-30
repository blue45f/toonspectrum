/**
 * 벡터 스트로크 사후 편집 (T2). 모두 순수 함수이며 원본을 변경하지 않는다.
 *
 * 1. 선 굵기 일괄 조정: 선택/레이어 전체 스트로크의 폭 프로파일 스케일 (0.1x~5x)
 * 2. 브러시 모양 교체: 둥근/납작/캘리그래피 팁 프로파일 프리셋 적용
 * 3. 벡터 지우개: 지우개 스트로크와 교차·접촉한 스트로크 전체 삭제
 */

import {
  clampVectorWidthScale,
  VECTOR_STROKE_MIN_WIDTH_PX,
  type VectorBrushShapeId,
  type VectorPoint2D,
  type VectorStroke,
} from "./vector-layer-model";
import { vectorStrokeAnchorAngles } from "./vector-stroke-path";

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/* ------------------------------------------------------------------ */
/* 1. 선 굵기 일괄 조정                                                  */
/* ------------------------------------------------------------------ */

export interface ScaleVectorStrokeWidthsOptions {
  /** 지정하면 해당 id의 스트로크만 조정한다. 생략하면 전체. */
  readonly strokeIds?: readonly string[];
}

/**
 * 스트로크 폭 프로파일에 배율을 곱한다. 배율은 0.1~5로 클램프되며,
 * 결과 폭은 VECTOR_STROKE_MIN_WIDTH_PX 하한을 강제한다.
 */
export function scaleVectorStrokeWidths(
  strokes: readonly VectorStroke[],
  scale: number,
  options: ScaleVectorStrokeWidthsOptions = {}
): VectorStroke[] {
  const clampedScale = clampVectorWidthScale(scale);
  const scope =
    options.strokeIds && options.strokeIds.length > 0
      ? new Set(options.strokeIds)
      : null;
  return strokes.map((stroke) => {
    if (scope && !scope.has(stroke.id)) return stroke;
    return {
      ...stroke,
      widths: stroke.widths.map((width) =>
        Math.max(
          VECTOR_STROKE_MIN_WIDTH_PX,
          finiteNumber(width, 1) * clampedScale
        )
      ),
    };
  });
}

/* ------------------------------------------------------------------ */
/* 2. 브러시 모양 교체                                                  */
/* ------------------------------------------------------------------ */

export interface ReplaceVectorBrushShapeOptions {
  /** 캘리그래피 펜촉 각도(도). 기본 45. */
  readonly nibAngleDegrees?: number;
}

/**
 * 스트로크의 브러시 팁 프로파일을 교체한다.
 *
 * 프리셋은 "현재" 폭 프로파일에 상대 배율을 곱하는 방식이다(CSP의 브러시 팁
 * 교체와 동일한 멘탈 모델). 같은 프리셋을 반복 적용하면 효과가 누적되므로,
 * 되돌리려면 교체 전 스냅샷을 보관해야 한다.
 *
 * - round: 프로파일을 그대로 두고 모양 id만 교체한다(균일 팁).
 * - flat: 양 끝이 가늘어지는 치즐형 배율 `0.55 + 0.45·sin(π·t)` 적용.
 * - calligraphy: 펜촉 각도 대비 진행 방향에 따라
 *   `0.35 + 0.65·|sin(진행각 − 펜촉각)|` 배율 적용.
 */
export function replaceVectorBrushShape(
  stroke: VectorStroke,
  shapeId: VectorBrushShapeId,
  options: ReplaceVectorBrushShapeOptions = {}
): VectorStroke {
  if (shapeId === "round") {
    return { ...stroke, brushShapeId: shapeId };
  }
  if (shapeId === "flat") {
    const anchorCount = stroke.widths.length;
    const widths = stroke.widths.map((width, index) => {
      const t = anchorCount > 1 ? index / (anchorCount - 1) : 0;
      const factor = 0.55 + 0.45 * Math.sin(Math.PI * t);
      return Math.max(
        VECTOR_STROKE_MIN_WIDTH_PX,
        finiteNumber(width, 1) * factor
      );
    });
    return { ...stroke, brushShapeId: shapeId, widths };
  }
  const nibAngle =
    (finiteNumber(options.nibAngleDegrees, 45) * Math.PI) / 180;
  const angles = vectorStrokeAnchorAngles(stroke);
  const widths = stroke.widths.map((width, index) => {
    const angle = angles[index] ?? 0;
    const factor = 0.35 + 0.65 * Math.abs(Math.sin(angle - nibAngle));
    return Math.max(
      VECTOR_STROKE_MIN_WIDTH_PX,
      finiteNumber(width, 1) * factor
    );
  });
  return { ...stroke, brushShapeId: shapeId, widths };
}

/* ------------------------------------------------------------------ */
/* 3. 벡터 지우개 (선분 교차 판정)                                       */
/* ------------------------------------------------------------------ */

function orientation(
  a: VectorPoint2D,
  b: VectorPoint2D,
  c: VectorPoint2D
): number {
  const value =
    (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(
  a: VectorPoint2D,
  point: VectorPoint2D,
  b: VectorPoint2D
): boolean {
  return (
    point.x <= Math.max(a.x, b.x) + 1e-9
    && point.x >= Math.min(a.x, b.x) - 1e-9
    && point.y <= Math.max(a.y, b.y) + 1e-9
    && point.y >= Math.min(a.y, b.y) - 1e-9
  );
}

/**
 * 두 선분의 교차 판정. 끝점 접촉과 동일선상 겹침도 교차로 본다.
 * (벡터 지우개가 "스치기만 해도" 지워지는 CSP 동작과 일치)
 */
export function segmentsIntersect(
  a1: VectorPoint2D,
  a2: VectorPoint2D,
  b1: VectorPoint2D,
  b2: VectorPoint2D
): boolean {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  if (o4 === 0 && onSegment(b1, a2, b2)) return true;
  return false;
}

/** 점 p와 선분 ab 사이의 최단 거리. */
export function pointToSegmentDistance(
  p: VectorPoint2D,
  a: VectorPoint2D,
  b: VectorPoint2D
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSquared = abx * abx + aby * aby;
  if (lengthSquared < 1e-12) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  const t = Math.min(
    1,
    Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSquared)
  );
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

/**
 * 지우개 폴리라인이 스트로크 중심선과 교차하는지 판정한다.
 * 중심선 교차(끝점 접촉 포함) 또는 지우개 반경+스트로크 반경 이내 접촉이면 true.
 */
export function vectorEraserHitsStroke(
  strokeSamples: readonly VectorPoint2D[],
  strokeWidths: readonly number[],
  eraserPoints: readonly VectorPoint2D[],
  eraserWidth: number
): boolean {
  if (strokeSamples.length === 0 || eraserPoints.length === 0) return false;
  const eraserRadius = Math.max(0, finiteNumber(eraserWidth, 0)) / 2;
  const eraserSegments: Array<readonly [VectorPoint2D, VectorPoint2D]> = [];
  if (eraserPoints.length === 1) {
    const point = eraserPoints[0]!;
    eraserSegments.push([point, point]);
  } else {
    for (let index = 0; index < eraserPoints.length - 1; index += 1) {
      eraserSegments.push([eraserPoints[index]!, eraserPoints[index + 1]!]);
    }
  }
  const strokeSegments: Array<{
    readonly a: VectorPoint2D;
    readonly b: VectorPoint2D;
    readonly width: number;
  }> = [];
  for (let index = 0; index < strokeSamples.length - 1; index += 1) {
    strokeSegments.push({
      a: strokeSamples[index]!,
      b: strokeSamples[index + 1]!,
      width: Math.max(
        strokeWidths[index] ?? 0,
        strokeWidths[index + 1] ?? 0,
        VECTOR_STROKE_MIN_WIDTH_PX
      ),
    });
  }
  if (strokeSegments.length === 0 && strokeSamples.length === 1) {
    // 점 스트로크: 중심이 지우개 반경+자신 반경 안에 들어가면 접촉.
    const center = strokeSamples[0]!;
    const radius = (strokeWidths[0] ?? 0) / 2;
    return eraserSegments.some(
      ([a, b]) => pointToSegmentDistance(center, a, b) <= eraserRadius + radius
    );
  }
  return strokeSegments.some((strokeSegment) =>
    eraserSegments.some(([ea, eb]) => {
      if (segmentsIntersect(strokeSegment.a, strokeSegment.b, ea, eb)) {
        return true;
      }
      const touchDistance =
        eraserRadius + strokeSegment.width / 2 + 1;
      return (
        pointToSegmentDistance(strokeSegment.a, ea, eb) <= touchDistance
        || pointToSegmentDistance(strokeSegment.b, ea, eb) <= touchDistance
        || pointToSegmentDistance(ea, strokeSegment.a, strokeSegment.b)
          <= touchDistance
        || pointToSegmentDistance(eb, strokeSegment.a, strokeSegment.b)
          <= touchDistance
      );
    })
  );
}

export interface EraseVectorStrokesResult {
  /** 지우개를 피한 스트로크. */
  readonly kept: VectorStroke[];
  /** 지우개와 교차·접촉해 삭제된 스트로크. */
  readonly removed: VectorStroke[];
}

export interface EraseVectorStrokesOptions {
  /** 패스 샘플링 밀도(세그먼트당). 기본 8. */
  readonly samplesPerSegment?: number;
}

/**
 * 벡터 지우개: 지우개 스트로크와 교차하거나 접촉한 벡터 스트로크 전체를 삭제한다.
 * 선을 "조각"내지 않고 획 단위로 삭제하는 CSP 벡터 지우개 기본 동작이다.
 */
export function eraseVectorStrokes(
  strokes: readonly VectorStroke[],
  eraserPoints: readonly VectorPoint2D[],
  eraserWidth: number,
  options: EraseVectorStrokesOptions = {}
): EraseVectorStrokesResult {
  const kept: VectorStroke[] = [];
  const removed: VectorStroke[] = [];
  const perSegment = Math.max(
    1,
    Math.floor(finiteNumber(options.samplesPerSegment, 8))
  );
  for (const stroke of strokes) {
    // 앵커 자체로 폴리라인을 만들되, 곡선 구간은 세그먼트당 샘플로 보강한다.
    const samples: VectorPoint2D[] = [];
    const widths: number[] = [];
    stroke.segments.forEach((segment, segmentIndex) => {
      const widthStart = stroke.widths[segmentIndex] ?? 1;
      const widthEnd = stroke.widths[segmentIndex + 1] ?? widthStart;
      for (let step = 0; step < perSegment; step += 1) {
        const t = step / perSegment;
        const mt = 1 - t;
        samples.push({
          x:
            mt * mt * mt * segment.p0.x
            + 3 * mt * mt * t * segment.p1.x
            + 3 * mt * t * t * segment.p2.x
            + t * t * t * segment.p3.x,
          y:
            mt * mt * mt * segment.p0.y
            + 3 * mt * mt * t * segment.p1.y
            + 3 * mt * t * t * segment.p2.y
            + t * t * t * segment.p3.y,
        });
        widths.push(widthStart + (widthEnd - widthStart) * t);
      }
    });
    const lastSegment = stroke.segments[stroke.segments.length - 1];
    if (lastSegment) {
      samples.push({ x: lastSegment.p3.x, y: lastSegment.p3.y });
      widths.push(stroke.widths[stroke.widths.length - 1] ?? 1);
    }
    const hit = vectorEraserHitsStroke(
      samples,
      widths,
      eraserPoints,
      eraserWidth
    );
    if (hit) removed.push(stroke);
    else kept.push(stroke);
  }
  return { kept, removed };
}
