/**
 * studio-lineart-vectorizer.ts
 *
 * Paper.js 벡터 레인 확장 — 선화 벡터화·불리언 합성 고수준 API.
 *
 * 기존 `render/studio-engine-vector-geometry-provider.ts` (Paper.js 격리 경계)
 * 위에 얹히는 도메인 레이어다. Paper 객체가 이 경계를 넘지 않는다.
 *
 * 기능:
 * 1. vectorizeLineartStroke — 손으로 그린 선(점열) → 스무딩된 벡터 패스.
 *    브러시로 그린 선화를 벡터로 변환해 확대·편집 가능하게 한다.
 * 2. mergeBubbleWithTail — 말풍선 본체 + 꼬리를 불리언 unite 으로 합성.
 *    기존 studio-bubble-path 의 단일 패스 방식과 달리, 임의의 본체/꼬리
 *    모양 조합에 대응하는 일반 해법이다.
 * 3. simplifyVectorPath — 벡터 패스 단순화 (내보내기 용량 절감).
 *
 * 전부 비동기(provider 경계) + 순수 입력 검증. DOM에 의존하지 않는다.
 */

import {
  createStudioEngineVectorGeometryProvider,
  type StudioEngineVectorGeometryResult,
} from "../render/studio-engine-vector-geometry-provider";

export interface StudioLineartPoint {
  readonly x: number;
  readonly y: number;
}

export interface StudioLineartVectorizeOptions {
  /** 스무딩 강도 0..1. 기본 0.6. */
  readonly smoothing?: number;
  /** 단순화 허용 오차(px). 0이면 생략. 기본 0. */
  readonly simplifyTolerance?: number;
  /** 최대 입력 점 수. 기본 5_000. */
  readonly maxPoints?: number;
}

export interface StudioVectorizeResult {
  readonly ok: boolean;
  readonly pathData: string;
  readonly error?: string;
}

export const STUDIO_LINEART_VECTORIZER_DEFAULTS = Object.freeze({
  smoothing: 0.6,
  simplifyTolerance: 0,
  maxPoints: 5_000,
} as const);

function failResult(error: string): StudioVectorizeResult {
  return { ok: false, pathData: "", error };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function round2(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** 점열 → 폴리라인 SVG path data (Catmull-Rom 미적용, provider 스무딩에 위임). */
export function pointsToPolylinePathData(
  points: ReadonlyArray<StudioLineartPoint>,
): string {
  if (points.length === 0) return "";
  const parts: string[] = [
    `M${round2(points[0].x)} ${round2(points[0].y)}`,
  ];
  for (let i = 1; i < points.length; i += 1) {
    parts.push(`L${round2(points[i].x)} ${round2(points[i].y)}`);
  }
  return parts.join("");
}

function unwrap(
  result: StudioEngineVectorGeometryResult,
  context: string,
): StudioVectorizeResult {
  if (!result.ok) {
    return failResult(`${context} 실패: ${result.reason} (${result.detail})`);
  }
  return { ok: true, pathData: result.artifact.pathData };
}

type VectorGeometryProvider = ReturnType<
  typeof createStudioEngineVectorGeometryProvider
>;

/**
 * provider 생성→작업→해제를 한 번에 처리한다.
 * Paper.js 프로젝트 누수를 막기 위해 finally 에서 항상 dispose 한다.
 */
async function withGeometryProvider(
  task: (provider: VectorGeometryProvider) => Promise<StudioVectorizeResult>,
): Promise<StudioVectorizeResult> {
  const provider = createStudioEngineVectorGeometryProvider();
  try {
    return await task(provider);
  } finally {
    provider.dispose();
  }
}

/**
 * 선화 스트로크(점열)를 벡터 패스로 변환한다.
 * 1) 폴리라인 pathData 생성 → 2) Paper.js 스무딩 → 3) 선택적 단순화.
 */
export async function vectorizeLineartStroke(
  points: ReadonlyArray<StudioLineartPoint>,
  options: StudioLineartVectorizeOptions = {},
): Promise<StudioVectorizeResult> {
  const maxPoints =
    options.maxPoints ?? STUDIO_LINEART_VECTORIZER_DEFAULTS.maxPoints;
  if (points.length < 2) {
    return failResult("선화 벡터화에는 최소 2개의 점이 필요합니다");
  }
  const trimmed = points.slice(0, maxPoints);
  const polyline = pointsToPolylinePathData(trimmed);
  const smoothing = clamp01(
    options.smoothing ?? STUDIO_LINEART_VECTORIZER_DEFAULTS.smoothing,
  );
  const tolerance =
    options.simplifyTolerance ??
    STUDIO_LINEART_VECTORIZER_DEFAULTS.simplifyTolerance;

  return withGeometryProvider(async (provider) => {
    const smoothed = await provider.execute({
      operation: "smooth",
      pathData: polyline,
      smoothing: { type: "catmull-rom", factor: smoothing },
    });
    const smoothedResult = unwrap(smoothed, "선화 스무딩");
    if (!smoothedResult.ok || tolerance <= 0) return smoothedResult;

    const simplified = await provider.execute({
      operation: "simplify",
      pathData: smoothedResult.pathData,
      tolerance,
    });
    return unwrap(simplified, "선화 단순화");
  });
}

/**
 * 말풍선 본체와 꼬리를 불리언 합집합으로 합성한다.
 * 두 pathData 가 겹치는 영역을 매끄럽게 합쳐 "이중 외곽선 이음새"를 없앤다.
 */
export async function mergeBubbleWithTail(
  bubblePathData: string,
  tailPathData: string,
): Promise<StudioVectorizeResult> {
  if (!bubblePathData || !tailPathData) {
    return failResult("말풍선 본체와 꼬리 pathData 가 모두 필요합니다");
  }
  return withGeometryProvider(async (provider) => {
    const result = await provider.execute({
      operation: "boolean",
      operator: "unite",
      leftPathData: bubblePathData,
      rightPathData: tailPathData,
    });
    return unwrap(result, "말풍선 합성");
  });
}

/** 벡터 패스 단순화 (앵커 수 절감, 내보내기 용량 최적화). */
export async function simplifyVectorPath(
  pathData: string,
  tolerance: number,
): Promise<StudioVectorizeResult> {
  if (!pathData) return failResult("pathData 가 비어 있습니다");
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    return failResult("tolerance 는 0 이상의 숫자여야 합니다");
  }
  return withGeometryProvider(async (provider) => {
    const result = await provider.execute({
      operation: "simplify",
      pathData,
      tolerance,
    });
    return unwrap(result, "패스 단순화");
  });
}
