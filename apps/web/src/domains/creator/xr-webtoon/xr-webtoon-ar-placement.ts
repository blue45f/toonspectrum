/**
 * AR 프리뷰 배치 모델.
 *
 * WebXR hit-test 결과를 웹툰 캐릭터/컷의 AR 배치(위치·회전·크기)로 변환하는
 * 순수 계산 모듈. 실제 XRSession·XRFrame에는 의존하지 않아 테스트가 쉽다.
 * 미지원 기기에서는 테이블탑 미니어처(tabletop miniature) 폴백 스펙을 제공한다.
 */

/** XR 공간 좌표(m). */
export type XrArVec3 = readonly [number, number, number];

export interface XrArHitPoint {
  readonly position: XrArVec3;
}

export interface XrArPlacement {
  readonly position: XrArVec3;
  /** Y축 회전(rad). 카메라를 바라보도록 보정된 값. */
  readonly rotationYRad: number;
  /** 균일 스케일. */
  readonly scale: number;
}

/** AR 캐릭터 기본 크기 범위(균일 스케일). */
export const XR_AR_SCALE_MIN = 0.3 as const;
export const XR_AR_SCALE_MAX = 3.0 as const;
/** 가독성이 좋은 기준 거리(m). 이 거리에서 baseScale 그대로 보인다. */
export const XR_AR_REFERENCE_DISTANCE_M = 1.5 as const;

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** -PI..PI 범위로 각도를 정규화한다. */
export function xrArNormalizeAngleRad(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const twoPi = Math.PI * 2;
  let a = angle % twoPi;
  if (a > Math.PI) a -= twoPi;
  if (a < -Math.PI) a += twoPi;
  return a;
}

/**
 * 카메라 yaw(rad, Y축 회전)로부터 캐릭터가 카메라를 바라보는 회전을 계산한다.
 * 캐릭터 모델의 정면이 +Z라고 가정하고 카메라 반대편을 향하게 한다.
 */
export function xrArFacingRotationYRad(cameraYawRad: number): number {
  return xrArNormalizeAngleRad(cameraYawRad + Math.PI);
}

/**
 * 거리(m)에 따른 스케일 보정. 멀리 있을수록 크게 보여 가독성을 유지한다.
 */
export function xrArScaleForDistance(distanceM: number, baseScale: number): number {
  const distance = Math.max(0.1, distanceM);
  const compensated = baseScale * (distance / XR_AR_REFERENCE_DISTANCE_M);
  return clamp(compensated, XR_AR_SCALE_MIN, XR_AR_SCALE_MAX);
}

/**
 * hit-test 지점 + 카메라 yaw + 기본 스케일로부터 최종 배치를 만든다.
 */
export function xrArPlacementFromHit(input: {
  readonly hit: XrArHitPoint;
  readonly cameraYawRad: number;
  readonly cameraDistanceM: number;
  readonly baseScale?: number;
}): XrArPlacement {
  const baseScale = clamp(input.baseScale ?? 1, XR_AR_SCALE_MIN, XR_AR_SCALE_MAX);
  return {
    position: input.hit.position,
    rotationYRad: xrArFacingRotationYRad(input.cameraYawRad),
    scale: xrArScaleForDistance(input.cameraDistanceM, baseScale),
  };
}

/** 두 점 사이 거리(m). */
export function xrArDistanceM(a: XrArVec3, b: XrArVec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export interface XrArMiniatureSpec {
  /** 미니어처 월드 스케일. */
  readonly worldScale: number;
  /** 카메라 거리(월드 단위). */
  readonly cameraDistance: number;
  /** 바닥(테이블) 반경(월드 단위). */
  readonly tableRadius: number;
}

/**
 * WebXR 미지원 기기용 테이블탑 미니어처 폴백 스펙.
 * 캐릭터를 책상 위 작은 피규어처럼 보여주는 비-XR 3D 미리보기의 기준 수치다.
 */
export function xrArMiniatureSpec(viewport: {
  readonly width: number;
  readonly height: number;
}): XrArMiniatureSpec {
  const aspect = viewport.width > 0 && viewport.height > 0
    ? viewport.width / viewport.height
    : 1;
  const worldScale = 0.35;
  return {
    worldScale,
    cameraDistance: aspect >= 1 ? 2.6 : 3.4,
    tableRadius: 1.2,
  };
}
