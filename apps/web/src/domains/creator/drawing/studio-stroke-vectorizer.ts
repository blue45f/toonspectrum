/**
 * studio-stroke-vectorizer.ts
 *
 * perfect-freehand (MIT) 기반 스트로크 벡터화 모듈.
 *
 * 하는 일:
 * 1. 필압 시퀀스(PointerEvent.pressure 등) → perfect-freehand `getStroke` 로
 *    외곽선 폴리곤 생성 (압력 기반 굵기 변화).
 * 2. self-crossing(스스로 겹치는 획)은 polygon-clipping (MIT) union 으로 정리해
 *    단일 클린 폴리곤으로 만든다. (perfect-freehand 공식 문서 권장 조합)
 * 3. 폴리곤 → SVG path data 로 변환해 Paper.js provider / Konva 에 전달.
 *
 * 용도:
 * - 브러시 프리뷰: 스트로크 샘플을 벡터로 렌더링 (확대해도 깨지지 않음)
 * - 선화 스무딩: 손으로 그린 선을 벡터 외곽선으로 변환
 * - 말풍선/효과음 장식선의 벡터화
 *
 * 전부 순수·결정적. DOM/Canvas에 의존하지 않는다.
 */

import { getStroke } from "perfect-freehand";
import { union } from "polygon-clipping";

/** 스트로크 입력 점 1개. */
export interface StudioVectorizerPoint {
  readonly x: number;
  readonly y: number;
  /** 필압 0..1. 생략 시 0.5. */
  readonly pressure?: number;
}

export interface StudioStrokeVectorizerOptions {
  /** 기본 스트로크 굵기(px). perfect-freehand `size`. 기본 16. */
  readonly size?: number;
  /** 굵기 변화 강도 0..1. `thinning`. 기본 0.5. */
  readonly thinning?: number;
  /** 스무딩 0..1. `smoothing`. 기본 0.5. */
  readonly smoothing?: number;
  /** 스트림라인 0..1. `streamline`. 기본 0.5. */
  readonly streamline?: number;
  /** pressure 미지정 시 시뮬레이션 여부. 기본 false. */
  readonly simulatePressure?: boolean;
  /** 시작/끝 캡 완성도. `easing`. 기본 선형. */
  readonly easing?: (t: number) => number;
  /** self-crossing 정리 on/off. 기본 true. */
  readonly cleanSelfIntersections?: boolean;
  /** 좌표 소수점 자릿수. 기본 2. */
  readonly precision?: number;
  /** 최대 입력 점 수. 기본 10_000. */
  readonly maxPoints?: number;
}

export interface StudioVectorizedStroke {
  /** 외곽선 링들의 집합 (첫 링이 외곽, 나머지는 구멍). */
  readonly rings: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  /** SVG path data (y-down 그대로). */
  readonly pathData: string;
  /** 외곽선 점 개수 (정리 후). */
  readonly pointCount: number;
  /** self-crossing 정리가 적용됐는지. */
  readonly cleaned: boolean;
}

export const STUDIO_STROKE_VECTORIZER_DEFAULTS = Object.freeze({
  size: 16,
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: false,
  cleanSelfIntersections: true,
  precision: 2,
  maxPoints: 10_000,
} as const);

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** 폴리곤 링의 부호 있는 면적 (shoelace). */
function ringArea(ring: ReadonlyArray<readonly [number, number]>): number {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

/**
 * polygon-clipping union 결과(MultiPolygon)를 링 목록으로 평탄화한다.
 * union 과정에서 생기는 퇴화 슬리버(면적 ~0)는 제거한다.
 */
function flattenUnionedRings(
  united: ReadonlyArray<
    ReadonlyArray<ReadonlyArray<readonly [number, number]>>
  >,
  minArea: number,
): Array<ReadonlyArray<readonly [number, number]>> {
  const rings: Array<ReadonlyArray<readonly [number, number]>> = [];
  for (const polygon of united) {
    for (const ring of polygon) {
      if (ring.length >= 3 && Math.abs(ringArea(ring)) >= minArea) {
        rings.push(ring);
      }
    }
  }
  return rings;
}

function roundTo(n: number, precision: number): string {
  const factor = 10 ** precision;
  return String(Math.round(n * factor) / factor);
}

/** 링 → SVG path data (M...Z). */
export function ringsToSvgPathData(
  rings: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  precision = 2,
): string {
  const parts: string[] = [];
  for (const ring of rings) {
    if (ring.length === 0) continue;
    const [sx, sy] = ring[0];
    parts.push(`M${roundTo(sx, precision)} ${roundTo(sy, precision)}`);
    for (let i = 1; i < ring.length; i += 1) {
      const [x, y] = ring[i];
      parts.push(`L${roundTo(x, precision)} ${roundTo(y, precision)}`);
    }
    parts.push("Z");
  }
  return parts.join("");
}

/**
 * 스트로크 점열 → 벡터 외곽선.
 * 점이 2개 미만이면 빈 결과를 반환한다.
 */
export function vectorizeFreehandStroke(
  points: ReadonlyArray<StudioVectorizerPoint>,
  options: StudioStrokeVectorizerOptions = {},
): StudioVectorizedStroke {
  const precision = options.precision ?? STUDIO_STROKE_VECTORIZER_DEFAULTS.precision;
  const maxPoints = options.maxPoints ?? STUDIO_STROKE_VECTORIZER_DEFAULTS.maxPoints;
  const cleanSelfIntersections =
    options.cleanSelfIntersections ??
    STUDIO_STROKE_VECTORIZER_DEFAULTS.cleanSelfIntersections;

  const empty: StudioVectorizedStroke = {
    rings: [],
    pathData: "",
    pointCount: 0,
    cleaned: false,
  };
  if (points.length < 2) return empty;

  const input = points.slice(0, maxPoints).map((p) => [
    p.x,
    p.y,
    p.pressure === undefined ? 0.5 : clamp01(p.pressure),
  ]) as Array<[number, number, number]>;

  const outline = getStroke(input, {
    size: options.size ?? STUDIO_STROKE_VECTORIZER_DEFAULTS.size,
    thinning: clamp01(options.thinning ?? STUDIO_STROKE_VECTORIZER_DEFAULTS.thinning),
    smoothing: clamp01(options.smoothing ?? STUDIO_STROKE_VECTORIZER_DEFAULTS.smoothing),
    streamline: clamp01(
      options.streamline ?? STUDIO_STROKE_VECTORIZER_DEFAULTS.streamline,
    ),
    simulatePressure:
      options.simulatePressure ?? STUDIO_STROKE_VECTORIZER_DEFAULTS.simulatePressure,
    easing: options.easing,
    last: true,
  }) as Array<[number, number]>;

  if (outline.length < 3) return empty;

  // getStroke 외곽선은 열린 링이므로 union 전에 닫는다.
  const first = outline[0];
  const lastPt = outline[outline.length - 1];
  const closedRing: Array<[number, number]> = outline.map(([x, y]) => [x, y]);
  if (first[0] !== lastPt[0] || first[1] !== lastPt[1]) {
    closedRing.push([first[0], first[1]]);
  }

  let rings: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [closedRing];
  let cleaned = false;

  if (cleanSelfIntersections) {
    try {
      // polygon-clipping union: 겹친 영역을 합쳐 단일 폴리곤으로 정리.
      // 결과는 MultiPolygon 이므로 링으로 평탄화 + 퇴화 슬리버 제거.
      const united = union([closedRing]) as ReadonlyArray<
        ReadonlyArray<ReadonlyArray<readonly [number, number]>>
      >;
      const flattened = flattenUnionedRings(united, 0.5);
      if (flattened.length > 0) {
        rings = flattened;
        cleaned = true;
      }
    } catch {
      // 정리 실패 시 원본 외곽선 유지 (폴백)
      cleaned = false;
    }
  }

  const pointCount = rings.reduce((acc, ring) => acc + ring.length, 0);
  return {
    rings,
    pathData: ringsToSvgPathData(rings, precision),
    pointCount,
    cleaned,
  };
}

/**
 * 브러시 프리뷰용: 대표 스트로크 샘플(S자 곡선)을 벡터화한다.
 * 브러시 명과 실제 질감이 일치하는지 시각 검증용.
 */
export function vectorizePreviewSampleStroke(
  options: StudioStrokeVectorizerOptions = {},
): StudioVectorizedStroke {
  const points: StudioVectorizerPoint[] = [];
  const n = 24;
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    points.push({
      x: 20 + t * 160,
      y: 60 + Math.sin(t * Math.PI * 2) * 30 * (1 - t * 0.5),
      // 시작은 가늘게, 중간은 굵게, 끝은 가늘게 (전형적인 붓 터치)
      pressure: 0.25 + 0.65 * Math.sin(t * Math.PI),
    });
  }
  return vectorizeFreehandStroke(points, options);
}
