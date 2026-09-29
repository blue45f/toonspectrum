/**
 * 그리기 입력 → 벡터 스트로크 변환 (T2).
 *
 * 포인터 샘플(위치+필압)을 Catmull-Rom → 3차 베지어 패스와
 * 앵커별 폭 프로파일로 변환한다. 모든 함수는 순수하며,
 * `studio-stroke-stabilizer.ts` 가 정규화한 샘플을 그대로 받아 쓸 수 있다.
 */

import {
  createVectorStroke,
  normalizeVectorBrushShapeId,
  normalizeVectorOpacity,
  VECTOR_STROKE_MIN_WIDTH_PX,
  type VectorBrushShapeId,
  type VectorCubicSegment,
  type VectorInputPoint,
  type VectorPoint2D,
  type VectorStroke,
} from "./vector-layer-model";

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toPoint2D(point: VectorInputPoint): VectorPoint2D {
  return {
    x: finiteNumber(point.x, 0),
    y: finiteNumber(point.y, 0),
  };
}

/**
 * Catmull-Rom 스플라인을 3차 베지어 세그먼트 배열로 변환한다.
 * 각 입력 점은 베지어 앵커가 되므로 곡선은 모든 샘플을 정확히 통과한다.
 * 끝점은 복제(duplicate endpoint) 방식으로 처리한다.
 */
export function catmullRomToBezier(
  points: readonly VectorPoint2D[]
): VectorCubicSegment[] {
  const clean = points.map((point) => ({
    x: finiteNumber(point.x, 0),
    y: finiteNumber(point.y, 0),
  }));
  if (clean.length < 2) return [];
  const segments: VectorCubicSegment[] = [];
  for (let index = 0; index < clean.length - 1; index += 1) {
    const p0 = clean[Math.max(index - 1, 0)]!;
    const p1 = clean[index]!;
    const p2 = clean[index + 1]!;
    const p3 = clean[Math.min(index + 2, clean.length - 1)]!;
    segments.push({
      p0: { x: p1.x, y: p1.y },
      p1: {
        x: p1.x + (p2.x - p0.x) / 6,
        y: p1.y + (p2.y - p0.y) / 6,
      },
      p2: {
        x: p2.x - (p3.x - p1.x) / 6,
        y: p2.y - (p3.y - p1.y) / 6,
      },
      p3: { x: p2.x, y: p2.y },
    });
  }
  return segments;
}

export interface PressureToWidthOptions {
  /** 필압 1.0(최대)에 대응하는 굵기(px). */
  readonly baseWidth: number;
  /** 필압 0에 대응하는 굵기 비율(0..1). 기본 0.3. */
  readonly minPressureRatio?: number;
  /** 결과 하한(px). 기본 VECTOR_STROKE_MIN_WIDTH_PX. */
  readonly minWidthPx?: number;
}

/**
 * 필압(0..1) 배열을 앵커별 폭 프로파일(px)로 매핑한다.
 * 필압이 없으면 0.5(중간 필압)로 간주하고, 이동 평균(윈도우 3)으로 급격한
 * 필압 스파이크를 완화한다.
 */
export function pressuresToWidths(
  pressures: readonly (number | undefined)[],
  options: PressureToWidthOptions
): number[] {
  const baseWidth = Math.max(
    finiteNumber(options.baseWidth, 1),
    VECTOR_STROKE_MIN_WIDTH_PX
  );
  const minRatio = Math.min(
    1,
    Math.max(0, finiteNumber(options.minPressureRatio, 0.3))
  );
  const minWidth = Math.max(
    finiteNumber(options.minWidthPx, VECTOR_STROKE_MIN_WIDTH_PX),
    VECTOR_STROKE_MIN_WIDTH_PX
  );
  return pressures.map((pressure, index) => {
    const window: number[] = [];
    for (
      let offset = -1;
      offset <= 1;
      offset += 1
    ) {
      const neighbor = pressures[index + offset];
      if (typeof neighbor === "number" && Number.isFinite(neighbor)) {
        window.push(clamp01(neighbor));
      }
    }
    const smoothed =
      window.length > 0
        ? window.reduce((sum, value) => sum + value, 0) / window.length
        : 0.5;
    const width = baseWidth * (minRatio + (1 - minRatio) * smoothed);
    return Math.max(minWidth, width);
  });
}

export interface PointsToVectorStrokeOptions {
  readonly id?: string;
  /** 필압 1.0 기준 굵기(px). */
  readonly baseWidth: number;
  readonly minWidthPx?: number;
  readonly minPressureRatio?: number;
  readonly color?: string;
  readonly brushShapeId?: VectorBrushShapeId;
  readonly opacity?: number;
  readonly closed?: boolean;
}

let vectorStrokeSequence = 0;

function nextVectorStrokeId(): string {
  vectorStrokeSequence += 1;
  return `vector-stroke-${Date.now().toString(36)}-${vectorStrokeSequence}`;
}

/**
 * 그리기 입력 샘플을 벡터 스트로크로 변환한다.
 * - 0개 입력 → null.
 * - 1개 입력 → 점(dot) 스트로크: 같은 위치의 앵커 2개와 길이가 0인 세그먼트 1개.
 * - 2개 이상 → Catmull-Rom → 베지어 변환 + 필압 기반 폭 프로파일.
 */
export function pointsToVectorStroke(
  points: readonly VectorInputPoint[],
  options: PointsToVectorStrokeOptions
): VectorStroke | null {
  if (points.length === 0) return null;
  const anchors = points.map(toPoint2D);
  const segments =
    anchors.length === 1
      ? [
        {
          p0: anchors[0]!,
          p1: anchors[0]!,
          p2: anchors[0]!,
          p3: anchors[0]!,
        },
      ]
      : catmullRomToBezier(anchors);
  const pressures = points.map((point) => point.pressure);
  const widths = pressuresToWidths(pressures, {
    baseWidth: options.baseWidth,
    minWidthPx: options.minWidthPx,
    minPressureRatio: options.minPressureRatio,
  });
  return createVectorStroke({
    id: options.id ?? nextVectorStrokeId(),
    segments,
    widths,
    color: options.color,
    brushShapeId: normalizeVectorBrushShapeId(options.brushShapeId),
    opacity: normalizeVectorOpacity(options.opacity),
    closed: options.closed,
  });
}

export interface VectorPathSample extends VectorPoint2D {
  /** 보간된 선 굵기(px). */
  readonly width: number;
  /** 경로 접선 각도(라디안). */
  readonly angle: number;
  /** 세그먼트 내 매개변수 t(0..1). */
  readonly t: number;
  /** 세그먼트 인덱스. */
  readonly segmentIndex: number;
}

function cubicPoint(
  segment: VectorCubicSegment,
  t: number
): VectorPoint2D {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * segment.p0.x + b * segment.p1.x + c * segment.p2.x + d * segment.p3.x,
    y: a * segment.p0.y + b * segment.p1.y + c * segment.p2.y + d * segment.p3.y,
  };
}

function cubicTangentAngle(segment: VectorCubicSegment, t: number): number {
  const mt = 1 - t;
  const dx =
    3 * mt * mt * (segment.p1.x - segment.p0.x)
    + 6 * mt * t * (segment.p2.x - segment.p1.x)
    + 3 * t * t * (segment.p3.x - segment.p2.x);
  const dy =
    3 * mt * mt * (segment.p1.y - segment.p0.y)
    + 6 * mt * t * (segment.p2.y - segment.p1.y)
    + 3 * t * t * (segment.p3.y - segment.p2.y);
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return 0;
  return Math.atan2(dy, dx);
}

/**
 * 스트로크 패스를 일정 간격으로 샘플링한다. 굵기는 앵커 폭 프로파일을
 * 선형 보간하고, 각도는 베지어 접선에서 구한다.
 * 지우개 판정·SVG 외곽선 생성·캘리그래피 변조가 공유하는 기반 연산이다.
 */
export function sampleVectorStrokePath(
  stroke: VectorStroke,
  samplesPerSegment: number
): VectorPathSample[] {
  const perSegment = Math.max(1, Math.floor(finiteNumber(samplesPerSegment, 8)));
  const samples: VectorPathSample[] = [];
  stroke.segments.forEach((segment, segmentIndex) => {
    const widthStart = stroke.widths[segmentIndex] ?? 1;
    const widthEnd = stroke.widths[segmentIndex + 1] ?? widthStart;
    for (let step = 0; step < perSegment; step += 1) {
      const t = step / perSegment;
      const point = cubicPoint(segment, t);
      samples.push({
        x: point.x,
        y: point.y,
        width: widthStart + (widthEnd - widthStart) * t,
        angle: cubicTangentAngle(segment, t),
        t,
        segmentIndex,
      });
    }
  });
  const lastSegment = stroke.segments[stroke.segments.length - 1];
  if (lastSegment) {
    const point = cubicPoint(lastSegment, 1);
    samples.push({
      x: point.x,
      y: point.y,
      width: stroke.widths[stroke.widths.length - 1] ?? 1,
      angle: cubicTangentAngle(lastSegment, 1),
      t: 1,
      segmentIndex: stroke.segments.length - 1,
    });
  }
  return samples;
}

/** 앵커별 경로 접선 각도(라디안). 캘리그래피 폭 변조에 사용한다. */
export function vectorStrokeAnchorAngles(stroke: VectorStroke): number[] {
  const anchors: VectorPoint2D[] = [];
  stroke.segments.forEach((segment, index) => {
    if (index === 0) anchors.push(segment.p0);
    anchors.push(segment.p3);
  });
  return anchors.map((anchor, index) => {
    const previous = anchors[Math.max(index - 1, 0)]!;
    const next = anchors[Math.min(index + 1, anchors.length - 1)]!;
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return 0;
    return Math.atan2(dy, dx);
  });
}
