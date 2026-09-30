/**
 * 몰입형 웹툰 뷰어 깊이 모델.
 *
 * 웹툰 컷을 배경/인물/전경/효과 레이어로 분리하고, 스크롤 위치에 따라
 * 레이어마다 다른 속도로 움직이는 패럴랙스 변환을 계산한다.
 * KAIST ComiXR 연구(2026)의 핵심 발견 — "배경 뒤에 캐릭터를 배치하고
 * 말풍선을 별도 층으로 분리할 때 몰입감이 높아진다" — 을 2D 스크롤 뷰어에 적용한 것이다.
 *
 * 순수 함수 모듈. DOM·렌더러에 의존하지 않아 단위 테스트가 쉽다.
 */

export type XrDepthIntensity = "off" | "subtle" | "vivid";

/** 레이어 한 장. depth 0 = 가장 뒤(배경), 1 = 가장 앞(전경/효과/말풍선). */
export interface XrDepthLayer {
  readonly id: string;
  readonly depth: number;
  readonly imageUrl: string;
  readonly alt: string;
}

export interface XrDepthCut {
  readonly id: string;
  readonly title: string;
  readonly layers: readonly XrDepthLayer[];
}

export interface XrDepthLayerTransform {
  /** Y축 이동(px). 양수 = 아래로. */
  readonly translateYPx: number;
  readonly scale: number;
  readonly opacity: number;
}

/** 패럴랙스 최대 이동 폭(px). 전경 레이어가 스크롤 한 화면당 움직이는 최대 거리. */
export const XR_DEPTH_PARALLAX_RANGE_PX = 120 as const;
/** 전경 레이어 최대 확대율. */
export const XR_DEPTH_FRONT_SCALE = 0.05 as const;

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampDepth(depth: number): number {
  if (Number.isNaN(depth)) return 0;
  return Math.min(1, Math.max(0, depth));
}

export function xrDepthIntensityFactor(intensity: XrDepthIntensity): number {
  switch (intensity) {
    case "vivid":
      return 1;
    case "subtle":
      return 0.45;
    case "off":
      return 0;
  }
}

/**
 * 스크롤 진행도(0 = 컷이 화면 아래에 막 진입, 1 = 위로 빠져나감, 0.5 = 중앙)에 대한
 * 레이어 변환을 계산한다. 앞 레이어일수록 더 크게 움직여 깊이감을 만든다.
 */
export function xrDepthLayerTransform(input: {
  readonly scrollProgress: number;
  readonly layerDepth: number;
  readonly intensity: XrDepthIntensity;
  readonly reducedMotion: boolean;
}): XrDepthLayerTransform {
  const progress = clamp01(input.scrollProgress);
  const depth = clampDepth(input.layerDepth);
  const factor = input.reducedMotion ? 0 : xrDepthIntensityFactor(input.intensity);
  if (factor === 0) {
    return { translateYPx: 0, scale: 1, opacity: 1 };
  }
  const centered = 0.5 - progress;
  const translateYPx = centered * XR_DEPTH_PARALLAX_RANGE_PX * depth * factor;
  const scale = 1 + depth * XR_DEPTH_FRONT_SCALE * factor;
  return { translateYPx, scale, opacity: 1 };
}

/**
 * 컷이 뷰포트 중앙에 얼마나 가까운지 0..1로 반환한다.
 * 1 = 완전히 중앙, 0 = 화면 밖.
 */
export function xrDepthCutCenteredness(input: {
  readonly scrollTop: number;
  readonly cutOffsetTop: number;
  readonly cutHeight: number;
  readonly viewportHeight: number;
}): number {
  const { scrollTop, cutOffsetTop, cutHeight, viewportHeight } = input;
  if (cutHeight <= 0 || viewportHeight <= 0) return 0;
  const cutCenter = cutOffsetTop + cutHeight / 2;
  const viewportCenter = scrollTop + viewportHeight / 2;
  const maxDistance = (cutHeight + viewportHeight) / 2;
  return clamp01(1 - Math.abs(cutCenter - viewportCenter) / maxDistance);
}

/**
 * 컷의 스크롤 진행도(0..1). 컷이 화면 아래에서 위로 지나가는 동안의 상대 위치.
 * 패럴랙스 방향 계산의 입력으로 쓴다.
 */
export function xrDepthCutProgress(input: {
  readonly scrollTop: number;
  readonly cutOffsetTop: number;
  readonly cutHeight: number;
  readonly viewportHeight: number;
}): number {
  const { scrollTop, cutOffsetTop, cutHeight, viewportHeight } = input;
  const travel = cutHeight + viewportHeight;
  if (travel <= 0) return 0.5;
  // 컷 상단이 뷰포트 하단에 닿는 순간 0, 컷 하단이 뷰포트 상단을 벗어나는 순간 1.
  const entered = scrollTop + viewportHeight - cutOffsetTop;
  return clamp01(entered / travel);
}

/**
 * 화면 밖으로 멀어지는 레이어의 페이드. 멀어질수록 투명해져 전환이 부드럽다.
 */
export function xrDepthFadeForCenteredness(centeredness: number): number {
  const c = clamp01(centeredness);
  // 중앙 근처에서는 완전 불투명, 가장자리에서 부드럽게 페이드.
  return clamp01((c - 0.05) / 0.35);
}
